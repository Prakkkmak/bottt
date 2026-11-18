-- A player who comes to a recurring game every time registers once for all its dates, themselves and up to two people they
-- bring: each date the series opens takes them in at once, a seat while one is free and the waiting list otherwise, and tells
-- them by e-mail. Giving up one date keeps the others; the player changes or stops the recurring registration at any time.
-- Additive for the deployed site: list_sessions only adds two keys, which the previous site ignores.

create table public.series_registrations (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.session_series(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  -- null for the player; a first name for someone they bring without an account, like the guests of a single game.
  guest_name text check (guest_name is null or char_length(guest_name) between 2 and 40),
  created_at timestamptz not null default now()
);
-- The player once, each guest once whatever the case of the name.
create unique index series_registrations_key on public.series_registrations(series_id,user_id,lower(coalesce(guest_name,'')));
create index series_registrations_user on public.series_registrations(user_id);
alter table public.series_registrations enable row level security;
-- Players read their own; organizers see who comes every time. Written through save_series_registration only.
create policy series_registrations_read on public.series_registrations for select to authenticated
  using ((user_id=auth.uid() and public.active_user()) or public.is_organizer());
revoke all on public.series_registrations from public,anon,authenticated;
grant select on public.series_registrations to authenticated;
grant all on public.series_registrations to service_role;

-- Takes the recurring registrations of a game's series into this game: all of them for a date just opened, or those just made
-- (p_rows) at a date already open. Same rules as book_session and add_guest: a seat while one is free, then the waiting list;
-- a guest within the limits of the person who brings them; nobody at a game they may not see. Someone who already has a booking
-- for the game, even given up or refused, is left as they are: a date they withdrew from is not taken again behind their back,
-- and the people they bring are not taken there either.
-- In the order the registrations were made, each player before the people they bring. One row per registration considered:
-- booked is confirmed or waitlisted when it was taken in, already when an active booking was there, skipped otherwise.
create function public.seat_regulars(p_session uuid,p_rows uuid[] default null)
returns table(regular uuid,guest text,booked text,booking uuid) language plpgsql security definer set search_path='' as $$
declare s public.sessions; r record; target_pool text; found_status text; result text; added uuid;
begin
  select * into s from public.sessions where id=p_session for update;
  -- Registrations close 30 minutes before the start, as for everyone.
  if s.id is null or s.series_id is null or s.status<>'published' or s.starts_at<=now()+interval '30 minutes' then return; end if;
  -- People already waiting move in first, so that nobody jumps the queue.
  perform public.rebalance(p_session);
  for r in select g.id,g.user_id,g.guest_name,p.membership from public.series_registrations g join public.profiles p on p.id=g.user_id
      where g.series_id=s.series_id and (p_rows is null or g.id=any(p_rows))
      order by g.created_at,g.guest_name is not null,g.id loop
    regular=r.user_id; guest=r.guest_name; booking=null;
    if r.membership='suspended' or (s.visibility='members' and r.membership not in ('member','organizer')) then
      booked='skipped'; return next; continue;
    end if;
    if r.guest_name is null then
      select b.status into found_status from public.bookings b where b.session_id=p_session and b.user_id=r.user_id;
    else
      select b.status into found_status from public.bookings b where b.session_id=p_session and b.sponsor_id=r.user_id
        and lower(b.guest_name)=lower(r.guest_name) order by b.status in ('cancelled','declined') limit 1;
    end if;
    if found then
      booked=case when found_status in ('pending','confirmed','waitlisted','offered') then 'already' else 'skipped' end;
      return next; continue;
    end if;
    if r.guest_name is null then
      target_pool=case when r.membership='newcomer' then 'newcomer' else 'circle' end;
      result=case when public.seat_available(p_session,target_pool) then 'confirmed' else 'waitlisted' end;
      insert into public.bookings(session_id,user_id,status,pool,created_at) values(p_session,r.user_id,result,target_pool,clock_timestamp()) returning id into added;
    else
      target_pool=case when r.membership in ('member','organizer') then 'circle' else 'newcomer' end;
      -- Two people brought at most by this way, whatever was added by hand; none at a date the player gave up, and for a
      -- member, two waiting at most, as add_guest allows.
      if exists(select 1 from public.bookings b where b.session_id=p_session and b.user_id=r.user_id and b.status in ('cancelled','declined'))
        or (select count(*) from public.bookings b where b.session_id=p_session and b.sponsor_id=r.user_id
            and b.status in ('pending','confirmed','waitlisted','offered'))>=2
        or (target_pool='circle' and not public.seat_available(p_session,target_pool) and (select count(*) from public.bookings b
            where b.session_id=p_session and b.sponsor_id=r.user_id and b.status in ('waitlisted','offered'))>=2) then
        booked='skipped'; return next; continue;
      end if;
      result=case when public.seat_available(p_session,target_pool) then 'confirmed' else 'waitlisted' end;
      insert into public.bookings(session_id,guest_name,sponsor_id,status,pool,created_at) values(p_session,r.guest_name,r.user_id,result,target_pool,clock_timestamp()) returning id into added;
    end if;
    booked=result; booking=added;
    return next;
  end loop;
end; $$;

-- The dates a series has just opened: its regulars are taken in at each, in date order. A seat needs no e-mail, since the
-- reminder comes the day before; someone left on a waiting list hears about it once, however many dates opened together
-- (a series resumed, or opening further ahead).
create function public.welcome_regulars(p_sessions uuid[]) returns integer language plpgsql security definer set search_path='' as $$
declare seated jsonb='[]'; game uuid; r record; lines text; told integer=0;
begin
  for game in select g.id from public.sessions g where g.id=any(p_sessions) order by g.starts_at,g.id loop
    seated=seated||coalesce((select jsonb_agg(to_jsonb(t)||jsonb_build_object('session',game)) from public.seat_regulars(game) t
      where t.booked in ('confirmed','waitlisted')),'[]'::jsonb);
  end loop;
  -- Read in statements of their own, which see the bookings just made: their place in the queue is known.
  for r in select x.regular,(array_agg(x.session order by g.starts_at,g.id) filter (where x.booked='waitlisted'))[1] as first,
        count(distinct x.session) filter (where x.booked='waitlisted') as full_dates,count(*) filter (where x.booked='waitlisted') as waiting
      from jsonb_to_recordset(seated) as x(regular uuid,guest text,booked text,booking uuid,session uuid) join public.sessions g on g.id=x.session
      group by x.regular having count(*) filter (where x.booked='waitlisted')>0 loop
    if r.full_dates=1 then
      select string_agg(coalesce(x.guest,'Toi')||' : '||case x.booked when 'confirmed' then 'place confirmée'
          else 'n° '||public.waitlist_position(x.booking)||' sur la liste d’attente' end,E'\n' order by x.guest is not null,x.guest) into lines
        from jsonb_to_recordset(seated) as x(regular uuid,guest text,booked text,booking uuid,session uuid) where x.regular=r.regular and x.session=r.first;
      perform public.notify(r.regular,r.first,'Nouvelle date : liste d’attente',
        'Tu es inscrit·e à chaque date de cette partie, mais la nouvelle date qui ouvre est déjà complète :'||E'\n'||lines||E'\n'
          ||'Si une place se libère jusqu’à 30 minutes avant le début, elle revient automatiquement, dans l’ordre de la liste, et un e-mail te prévient.',
        'regular:'||r.first||':'||r.regular,p_kind=>'booking');
    else
      perform public.notify(r.regular,r.first,'Nouvelles dates : liste d’attente',
        'Tu es inscrit·e à chaque date de cette partie, mais '||r.full_dates||' des nouvelles dates qui ouvrent sont déjà complètes : '
          ||r.waiting||case when r.waiting>1 then ' inscriptions sont' else ' inscription est' end||' en liste d’attente. '
          ||'Si une place se libère jusqu’à 30 minutes avant le début, elle revient automatiquement, dans l’ordre de la liste, et un e-mail te prévient.'
          ||E'\n\n'||'La première de ces dates :',
        'regular:'||r.first||':'||r.regular,p_kind=>'booking');
    end if;
    told=told+1;
  end loop;
  return told;
end; $$;

-- Same as the edit series migration, except that the dates opened take in the series' regulars.
create or replace function public.extend_series(p_id uuid default null) returns integer language plpgsql security definer set search_path='' as $$
declare r public.session_series; v public.venues; slot date; starts timestamptz; sid uuid; created integer=0; opened uuid[];
begin
  for r in select * from public.session_series s where (p_id is null or s.id=p_id) and s.stopped_at is null
      and exists(select 1 from public.profiles p where p.id=s.created_by and p.membership='organizer')
      order by s.id for update skip locked loop
    slot=coalesce(r.generated_through+7*r.every_weeks,r.first_date);
    opened='{}';
    loop
      exit when r.ends_on is not null and slot>r.ends_on;
      starts=(slot+r.starts_local) at time zone 'Europe/Paris';
      exit when slot>r.first_date and starts>now()+make_interval(weeks=>r.weeks_ahead);
      -- A date moved by hand onto this day already stands for it.
      if starts>now() and not exists(select 1 from public.sessions g where g.series_id=r.id and (g.starts_at at time zone 'Europe/Paris')::date=slot) then
        v=null;
        if r.venue_id is not null then select * into v from public.venues where id=r.venue_id for share; end if;
        insert into public.sessions(title,script,starts_at,ends_at,location,venue_id,capacity,newcomer_seats,release_hours,beginners_welcome,visibility,created_by,series_id)
          values(r.title,r.script,starts,starts+r.duration,coalesce(v.name,r.location),v.id,r.capacity,0,0,true,r.visibility,r.created_by,r.id)
          returning id into sid;
        insert into public.session_addresses(session_id,address) values(sid,coalesce(v.address,r.address));
        opened=opened||sid;
        created=created+1;
      end if;
      update public.session_series set generated_through=slot where id=r.id;
      slot=slot+7*r.every_weeks;
    end loop;
    if cardinality(opened)>0 then perform public.welcome_regulars(opened); end if;
  end loop;
  return created;
end; $$;

-- A series still opening dates: not stopped, its organizer still one, its last day not past.
create function public.series_running(p_series uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.session_series r join public.profiles p on p.id=r.created_by and p.membership='organizer'
    where r.id=p_series and r.stopped_at is null and (r.ends_on is null or r.ends_on>=(now() at time zone 'Europe/Paris')::date));
$$;

-- A player registers for every date of a game's series, themselves (p_self) and up to two people they bring (p_guests), or
-- changes that, or stops it by leaving nobody. Those added are taken in at once at the dates already open; those removed are
-- no longer taken in at the next dates, and with p_release their places at the dates already open are released as well.
-- One e-mail sums it up for the player, and one for the organizer instead of a message per date. Returns what was done, for
-- the site to say it.
create function public.save_series_registration(p_session uuid,p_self boolean,p_guests text[] default '{}',p_release boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.sessions; r public.session_series; typed text; clean text; wanted text[]='{}'; added uuid[]; removed_self boolean=false;
  removed_guests text[]='{}'; renamed integer; d record; t record; freed integer; confirmed integer=0; waiting integer=0; already integer=0;
  skipped integer=0; released integer=0; opened integer=0; first_changed uuid; game text; rhythm text; who text[]; body text;
  organizer uuid; actor text; line text; self_in boolean; guest_list text;
begin
  perform public.rate_guard('series_registration',10,3600);
  select * into s from public.sessions where id=p_session;
  if s.id is null or not public.can_see_session(p_session) then raise exception 'Cette session est inaccessible.'; end if;
  if s.series_id is null then raise exception 'Cette partie ne revient pas d’une semaine à l’autre.'; end if;
  if coalesce(cardinality(p_guests),0)>2 then raise exception 'Tu peux inscrire 2 invité·es au plus à chaque date.'; end if;
  foreach typed in array coalesce(p_guests,'{}') loop
    -- On one line and without direction marks, like the names that reach an e-mail elsewhere.
    clean=public.plain_name(typed);
    if char_length(clean) not between 2 and 40 then raise exception 'Indique un prénom ou un pseudo de 2 à 40 caractères.'; end if;
    if not exists(select 1 from unnest(wanted) w where lower(w)=lower(clean)) then wanted=wanted||clean; end if;
  end loop;
  -- Held until the end, before the games as edit_series does: a date the series opens meanwhile waits, then takes in those added here.
  select * into r from public.session_series where id=s.series_id for share;
  if r.id is null then raise exception 'Cette partie ne revient pas d’une semaine à l’autre.'; end if;

  for t in delete from public.series_registrations g where g.series_id=r.id and g.user_id=auth.uid()
      and not ((g.guest_name is null and p_self) or exists(select 1 from unnest(wanted) w where lower(w)=lower(g.guest_name)))
      returning g.guest_name loop
    if t.guest_name is null then removed_self=true; else removed_guests=removed_guests||lower(t.guest_name); end if;
  end loop;
  -- A name typed again with other capitals keeps its rank and takes the new spelling.
  update public.series_registrations g set guest_name=w.v from unnest(wanted) as w(v)
    where g.series_id=r.id and g.user_id=auth.uid() and lower(g.guest_name)=lower(w.v) and g.guest_name<>w.v;
  get diagnostics renamed=row_count;
  with made as (insert into public.series_registrations(series_id,user_id,guest_name,created_at)
      select r.id,auth.uid(),n,clock_timestamp() from unnest(case when p_self then array[null::text] else '{}'::text[] end||wanted) with ordinality as x(n,i)
      where not exists(select 1 from public.series_registrations e where e.series_id=r.id and e.user_id=auth.uid() and lower(coalesce(e.guest_name,''))=lower(coalesce(n,'')))
      order by i on conflict do nothing returning id)
    select coalesce(array_agg(id),'{}') into added from made;
  -- A series that opens no more dates can still be left or cut down, so that nothing is taken again if it resumes; not joined.
  if cardinality(added)>0 and not public.series_running(r.id) then raise exception 'Cette série est arrêtée : aucune nouvelle date ne s’ouvrira.'; end if;
  if cardinality(added)=0 and not removed_self and cardinality(removed_guests)=0 then
    return jsonb_build_object('changed',renamed>0,'regular',exists(select 1 from public.series_registrations where series_id=r.id and user_id=auth.uid()));
  end if;

  -- The organizer hears of all this once, below, rather than once per date and per person.
  perform set_config('bottt.series_registration','on',true);
  -- In id order, like stop_series and edit_series, then each in turn by date.
  perform 1 from public.sessions g where g.series_id=r.id and g.status='published' and g.starts_at>now() order by g.id for update;
  for d in select g.id,g.starts_at from public.sessions g where g.series_id=r.id and g.status='published' and g.starts_at>now() order by g.starts_at,g.id loop
    if p_release and (removed_self or cardinality(removed_guests)>0) then
      update public.bookings b set status='cancelled',offer_expires_at=null where b.session_id=d.id and b.status not in ('cancelled','declined')
        and ((removed_self and b.user_id=auth.uid()) or (b.sponsor_id=auth.uid() and lower(b.guest_name)=any(removed_guests)));
      get diagnostics freed=row_count;
      if freed>0 then released=released+freed; first_changed=coalesce(first_changed,d.id); perform public.rebalance(d.id); end if;
    end if;
    if cardinality(added)>0 and d.starts_at>now()+interval '30 minutes' then
      opened=opened+1;
      for t in select * from public.seat_regulars(d.id,added) loop
        if t.booked='confirmed' then confirmed=confirmed+1; elsif t.booked='waitlisted' then waiting=waiting+1;
        elsif t.booked='already' then already=already+1; else skipped=skipped+1; end if;
        if t.booked in ('confirmed','waitlisted') then first_changed=coalesce(first_changed,d.id); end if;
      end loop;
    end if;
  end loop;
  perform set_config('bottt.series_registration','',true);

  game=coalesce(nullif(btrim(r.title),''),nullif(btrim(r.script),''),'Blood on the Clocktower');
  rhythm=case when r.every_weeks=2 then 'un ' else 'chaque ' end
    ||(array['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'])[extract(dow from r.first_date)::integer+1]
    ||case when r.every_weeks=2 then ' sur deux' else '' end;
  select coalesce(array_agg(coalesce(g.guest_name,'toi') order by g.guest_name is not null,g.created_at,g.id),'{}') into who
    from public.series_registrations g where g.series_id=r.id and g.user_id=auth.uid();
  if cardinality(who)>0 then
    body='À chaque nouvelle date de « '||game||' » ('||rhythm||'), une place est prise automatiquement pour '
      ||case when cardinality(who)=1 then who[1] else array_to_string(who[1:cardinality(who)-1],', ')||' et '||who[cardinality(who)] end||'.'
      ||case when confirmed+waiting>0 then ' Aux dates déjà ouvertes : '||confirmed||case when confirmed>1 then ' places prises' else ' place prise' end
        ||case when waiting>0 then ', '||waiting||' en liste d’attente' else '' end||'.' else '' end
      ||case when released>0 then ' '||released||case when released>1 then ' inscriptions aux prochaines dates sont retirées.' else ' inscription à une prochaine date est retirée.' end else '' end
      ||' Seule une date complète, où tu restes en liste d’attente, t’envoie un e-mail. Un empêchement ? Libère la place d’une date depuis le site : les autres restent prévues.';
  else
    body='Plus aucune place n’est prise automatiquement aux nouvelles dates de « '||game||' ».'
      ||case when released>0 then ' '||released||case when released>1 then ' inscriptions aux prochaines dates sont retirées.' else ' inscription à une prochaine date est retirée.' end
        else ' Les places déjà prises aux prochaines dates restent : libère depuis le site celles dont tu n’as plus besoin.' end;
  end if;
  -- Saved again before the previous e-mail left: only the last one goes.
  delete from public.notifications n where n.user_id=auth.uid() and n.dedupe_key like 'series:'||r.id||':'||auth.uid()||':%'
    and n.emailed_at is null and n.email_attempts=0 and n.claimed_until is null;
  perform public.notify(auth.uid(),null,case when cardinality(who)>0 then 'Inscription à chaque date enregistrée' else 'Inscription à chaque date arrêtée' end,
    body,'series:'||r.id||':'||auth.uid()||':'||gen_random_uuid(),p_kind=>'booking');

  -- The organizer of the first date that changed, as notify_organizer_activity would have told them, in one line.
  if first_changed is not null then
    select g.created_by into organizer from public.sessions g join public.profiles p on p.id=g.created_by and p.membership='organizer'
      where g.id=first_changed and g.created_by<>auth.uid();
    if organizer is not null and public.wants_email(organizer,'activity') then
      select public.plain_name(p.display_name) into actor from public.profiles p where p.id=auth.uid();
      select coalesce(bool_or(g.guest_name is null),false),string_agg(g.guest_name,' et ' order by g.created_at,g.id) into self_in,guest_list
        from public.series_registrations g where g.series_id=r.id and g.user_id=auth.uid();
      line=actor||case when self_in then ' vient à chaque date'||coalesce(' avec '||guest_list,'') when guest_list is not null then ' inscrit '||guest_list||' à chaque date'
          else ' ne vient plus à chaque date' end||' : '
        ||concat_ws(', ',case when confirmed>0 then confirmed||case when confirmed>1 then ' places prises' else ' place prise' end end,
          case when waiting>0 then waiting||' en liste d’attente' end,
          case when released>0 then released||case when released>1 then ' inscriptions retirées' else ' inscription retirée' end end)
        ||' aux prochaines dates.';
      update public.notifications n set title='Inscriptions et désistements',body=n.body||E'\n'||line
        where n.user_id=organizer and n.session_id=first_changed and n.kind='activity' and n.emailed_at is null and n.email_attempts=0 and n.claimed_until is null
          and n.created_at>now()-interval '1 hour' and char_length(n.body)<1500;
      if not found then
        insert into public.notifications(user_id,session_id,title,body,kind) values(organizer,first_changed,'Inscription à chaque date',line,'activity');
      end if;
    end if;
  end if;
  return jsonb_build_object('changed',true,'regular',cardinality(who)>0,'dates',opened,'confirmed',confirmed,'waitlisted',waiting,
    'already',already,'skipped',skipped,'released',released);
end; $$;

-- Same as the waitlist migration, with the series a game comes back with, while it is running (series), and the viewer's
-- registration for all its dates (my_series).
create or replace function public.list_sessions() returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(payload order by starts_at),'[]'::jsonb) from (
    select s.starts_at, (to_jsonb(s)-'created_by'-'created_at'-'description'-'storyteller') || jsonb_build_object(
      'confirmed_count',used.total_used,
      'waitlist_count',(select count(*) from public.bookings b where b.session_id=s.id and b.status='waitlisted'),
      'occupied_seats',(select coalesce(jsonb_agg(b.seat_index order by b.seat_index),'[]'::jsonb) from public.bookings b where b.session_id=s.id and (b.status='confirmed' or (b.status='offered' and b.offer_expires_at>now()))),
      'member_seats_free',greatest(0,s.capacity-used.total_used),
      'traveller_seats_free',greatest(0,s.capacity-used.total_used),
      'my_status',case when public.active_user() then (select status from public.bookings b where b.session_id=s.id and b.user_id=auth.uid()) else null end,
      'my_seat',case when public.active_user() then (select seat_index from public.bookings b where b.session_id=s.id and b.user_id=auth.uid() and (b.status='confirmed' or (b.status='offered' and b.offer_expires_at>now()))) else null end,
      'my_offer_expires_at',case when public.active_user() then (select offer_expires_at from public.bookings b where b.session_id=s.id and b.user_id=auth.uid()) else null end,
      'my_waitlist_position',case when public.active_user() then (select public.waitlist_position(b.id) from public.bookings b where b.session_id=s.id and b.user_id=auth.uid() and b.status='waitlisted') else null end,
      'my_guests',case when public.active_user() then (select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'name',b.guest_name,'status',b.status,'seat_index',b.seat_index,'offer_expires_at',b.offer_expires_at,
          'waitlist_position',case when b.status='waitlisted' then public.waitlist_position(b.id) end) order by b.created_at,b.id),'[]'::jsonb)
        from public.bookings b where b.session_id=s.id and b.sponsor_id=auth.uid() and b.status<>'cancelled') else '[]'::jsonb end,
      'participants',case when public.is_member() or (public.active_user() and exists(select 1 from public.bookings where session_id=s.id and user_id=auth.uid() and status='confirmed'))
        then (select coalesce(jsonb_agg(jsonb_build_object(
            'display_name',coalesce(b.guest_name,p.display_name),
            'avatar_color',coalesce(p.avatar_color,sponsor.avatar_color),
            'seat_index',b.seat_index,
            'can_storytell',coalesce(p.can_storytell,false),
            'role',case when b.user_id is null then case when b.pool='circle' then 'guest' else 'traveller_guest' end
              when p.membership='newcomer' then 'traveller' else 'member' end,
            'invited_by',sponsor.display_name) order by b.seat_index),'[]'::jsonb)
          from public.bookings b left join public.profiles p on p.id=b.user_id left join public.profiles sponsor on sponsor.id=b.sponsor_id
          where b.session_id=s.id and b.status='confirmed') else '[]'::jsonb end,
      -- Its rhythm and the day it falls on, for the « Chaque mercredi » badge; nothing once the series opens no more dates.
      'series',(select jsonb_build_object('every_weeks',r.every_weeks,'first_date',r.first_date) from public.session_series r where r.id=s.series_id and public.series_running(r.id)),
      'my_series',case when s.series_id is not null and public.active_user() then (select jsonb_build_object('self',bool_or(g.guest_name is null),
          'guests',coalesce(jsonb_agg(g.guest_name order by g.created_at,g.id) filter (where g.guest_name is not null),'[]'::jsonb))
        from public.series_registrations g where g.series_id=s.series_id and g.user_id=auth.uid() having count(*)>0) end
    ) as payload
    from public.sessions s
    cross join lateral (select count(*) as total_used from public.bookings b
      where b.session_id=s.id and (b.status='confirmed' or (b.status='offered' and b.offer_expires_at>now()))) used
    where public.can_see_session(s.id) and (s.ends_at>now()-interval '30 days' or public.is_organizer())
  ) listed;
$$;

-- As in the notification choices migration, except while save_series_registration takes someone in at several dates.
create or replace function public.notify_organizer_activity() returns trigger language plpgsql security definer set search_path='' as $$
declare s public.sessions; actor uuid=auth.uid(); previous text; was_in boolean; is_in boolean; who text; line text;
begin
  -- A registration for every date sums itself up in one message.
  if current_setting('bottt.series_registration',true)='on' then return null; end if;
  if actor is null or actor is distinct from coalesce(new.user_id,new.sponsor_id) then return null; end if;
  if tg_op='UPDATE' then previous=old.status; end if;
  was_in=coalesce(previous in ('pending','confirmed','waitlisted','offered'),false);
  is_in=new.status in ('pending','confirmed','waitlisted','offered');
  if was_in=is_in then return null; end if;
  select * into s from public.sessions where id=new.session_id;
  if s.status<>'published' or s.starts_at<=now() or s.created_by is null or s.created_by=actor
    or not exists(select 1 from public.profiles where id=s.created_by and membership='organizer')
    or not public.wants_email(s.created_by,'activity') then return null; end if;
  select case when new.user_id is null then public.plain_name(new.guest_name)||', invité·e de '||public.plain_name(p.display_name)
    else public.plain_name(p.display_name) end into who from public.profiles p where p.id=actor;
  line=who||case when new.status='confirmed' then ' a pris une place.' when new.status='waitlisted' then ' est sur la liste d’attente.'
    when is_in then ' demande une place.' when previous='waitlisted' then ' a quitté la liste d’attente.' else ' a libéré sa place.' end;
  update public.notifications n set title='Inscriptions et désistements',body=n.body||E'\n'||line
    where n.user_id=s.created_by and n.session_id=s.id and n.kind='activity' and n.emailed_at is null and n.email_attempts=0 and n.claimed_until is null
      and n.created_at>now()-interval '1 hour' and char_length(n.body)<1500;
  if not found then
    insert into public.notifications(user_id,session_id,title,body,kind)
      values(s.created_by,s.id,case when is_in then 'Nouvelle inscription' else 'Désistement' end,line,'activity');
  end if;
  return null;
end; $$;
-- maintenance() as in the announcements migration, plus registrations for every date of a series long stopped or ended.
create or replace function public.maintenance() returns void language plpgsql security definer set search_path = '' as $$
declare sid uuid;
begin
  for sid in select id from public.sessions where status='published' and starts_at>now() order by id loop perform public.rebalance(sid); end loop;
  -- One reminder per person, naming the people they bring.
  insert into public.notifications(user_id,session_id,title,body,dedupe_key)
    select recipient,session_id,'Ta session approche',
      case when guests is null then 'Un imprévu ? Pense à libérer ta place depuis le site. À très vite !'
        when attending then guests||case when guest_count>1 then ' viennent' else ' vient' end||' avec toi. Un imprévu ? Pense à libérer vos places depuis le site.'
        else guests||case when guest_count>1 then ' sont attendu·es. Transmets-leur' else ' est attendu·e. Transmets-lui' end||' l’heure et le lieu.' end,
      'reminder:'||session_id||':'||recipient
    from (select coalesce(b.user_id,b.sponsor_id) as recipient,b.session_id,bool_or(b.user_id is not null) as attending,
        count(*) filter(where b.user_id is null) as guest_count,
        string_agg(b.guest_name,' et ' order by b.guest_name) filter(where b.user_id is null) as guests
      from public.bookings b join public.sessions s on s.id=b.session_id
      where b.status='confirmed' and s.status='published' and s.starts_at between now() and now()+interval '24 hours'
      group by 1,2) reminders
    on conflict(dedupe_key) do nothing;
  -- Guests never created an account: keep their first name only while the evening is recent.
  update public.bookings b set guest_name='Invité·e' from public.sessions s
    where s.id=b.session_id and b.guest_name is not null and b.guest_name<>'Invité·e' and s.ends_at<now()-interval '30 days';
  -- Notifications are only an e-mail outbox; drop them with the guest names they carry once the evening is long past.
  delete from public.notifications n using public.sessions s where n.session_id=s.id and s.ends_at<now()-interval '30 days';
  -- Messages about a deleted game, or about no game at all, follow the same 30 days.
  delete from public.notifications where session_id is null and created_at<now()-interval '30 days';
  update public.invitations set sent_to=null where sent_to is not null and expires_at<now()-interval '30 days';
  delete from public.action_limits where window_start<now()-interval '2 days';
  -- The organizers' history of announcements keeps one year, as the privacy page says.
  delete from public.announcements where created_at<now()-interval '1 year';
  -- Registrations for every date, with the first names they carry, leave 30 days after their series stopped or ended.
  delete from public.series_registrations g using public.session_series r where r.id=g.series_id
    and (r.stopped_at<now()-interval '30 days' or r.ends_on<(now() at time zone 'Europe/Paris')::date-30);
end; $$;

revoke execute on function public.seat_regulars(uuid,uuid[]),public.welcome_regulars(uuid[]),public.series_running(uuid),public.save_series_registration(uuid,boolean,text[],boolean) from public,anon,authenticated;
grant execute on function public.save_series_registration(uuid,boolean,text[],boolean) to authenticated,service_role;
-- Replaced functions keep their grants; said again so that the rule holds whatever ran before.
revoke execute on function public.extend_series(uuid),public.notify_organizer_activity(),public.maintenance() from public,anon,authenticated;
grant execute on function public.extend_series(uuid),public.maintenance() to service_role;
