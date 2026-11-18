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
-- for the game, even given up or refused, is left as they are: a date they withdrew from is not taken again behind their back.
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
      if (target_pool='newcomer' and (select count(*) from public.bookings b where b.session_id=p_session and b.sponsor_id=r.user_id
            and b.status in ('pending','confirmed','waitlisted','offered'))>=2)
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

-- The dates a series has just opened: its regulars are taken in at each, in date order, and each of them hears once about
-- their places. Dates opening together (a series resumed, or opening further ahead) make one e-mail, not one per date.
create function public.welcome_regulars(p_sessions uuid[]) returns integer language plpgsql security definer set search_path='' as $$
declare seated jsonb='[]'; game uuid; r record; told integer=0;
begin
  for game in select g.id from public.sessions g where g.id=any(p_sessions) order by g.starts_at,g.id loop
    seated=seated||coalesce((select jsonb_agg(to_jsonb(t)||jsonb_build_object('session',game)) from public.seat_regulars(game) t
      where t.booked in ('confirmed','waitlisted')),'[]'::jsonb);
  end loop;
  -- Read in a statement of its own, which sees the bookings just made: their place in the queue is known.
  for r in select x.regular,count(distinct x.session) as dates,(array_agg(x.session order by g.starts_at,g.id))[1] as first,
        count(*) filter (where x.booked='confirmed') as confirmed,count(*) filter (where x.booked='waitlisted') as waiting,
        string_agg(coalesce(x.guest,'Toi')||' : '||case x.booked when 'confirmed' then 'place confirmée'
          else 'n° '||public.waitlist_position(x.booking)||' sur la liste d’attente' end,E'\n' order by x.guest is not null,x.guest) as lines
      from jsonb_to_recordset(seated) as x(regular uuid,guest text,booked text,booking uuid,session uuid) join public.sessions g on g.id=x.session
      group by x.regular loop
    if r.dates=1 then
      perform public.notify(r.regular,r.first,case when r.waiting>0 then 'Nouvelle date : liste d’attente' else 'Nouvelle date : inscription faite' end,
        'Tu es inscrit·e à chaque date de cette partie : la nouvelle date qui ouvre te compte déjà.'||E'\n'||r.lines||E'\n'
          ||case when r.waiting>0 then 'La partie est complète : si une place se libère jusqu’à 30 minutes avant le début, elle revient automatiquement, dans l’ordre de la liste. ' else '' end
          ||'Un empêchement ? Libère la place depuis le site : les dates suivantes restent prévues.',
        'regular:'||r.first||':'||r.regular,p_kind=>'booking');
    else
      perform public.notify(r.regular,r.first,case when r.waiting>0 then 'Nouvelles dates : liste d’attente' else 'Nouvelles dates : inscriptions faites' end,
        'Tu es inscrit·e à chaque date de cette partie : les '||r.dates||' nouvelles dates qui ouvrent te comptent déjà, avec '
          ||r.confirmed||case when r.confirmed>1 then ' places prises' else ' place prise' end
          ||case when r.waiting>0 then ' et '||r.waiting||' en liste d’attente' else '' end||'. Un empêchement ? Libère la place d’une date depuis le site : les autres restent prévues.'
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

-- A player registers for every date of a game's series, themselves (p_self) and up to two people they bring (p_guests), or
-- changes that, or stops it by leaving nobody. Those added are taken in at once at the dates already open; those removed are
-- no longer taken in at the next dates, and with p_release their places at the dates already open are released as well.
-- One e-mail sums it up. Returns what was done, for the site to say it.
create function public.save_series_registration(p_session uuid,p_self boolean,p_guests text[] default '{}',p_release boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.sessions; r public.session_series; typed text; clean text; wanted text[]='{}'; added uuid[]; removed_self boolean=false;
  removed_guests text[]='{}'; renamed integer; d record; t record; freed integer; confirmed integer=0; waiting integer=0; already integer=0;
  skipped integer=0; released integer=0; opened integer=0; game text; rhythm text; who text[]; body text;
begin
  perform public.rate_guard('series_registration',20,600);
  select * into s from public.sessions where id=p_session;
  if s.id is null or not public.can_see_session(p_session) then raise exception 'Cette session est inaccessible.'; end if;
  if s.series_id is null then raise exception 'Cette partie ne revient pas d’une semaine à l’autre.'; end if;
  foreach typed in array coalesce(p_guests,'{}') loop
    -- On one line and without direction marks, like the names that reach an e-mail elsewhere.
    clean=public.plain_name(typed);
    if char_length(clean) not between 2 and 40 then raise exception 'Indique un prénom ou un pseudo de 2 à 40 caractères.'; end if;
    if not exists(select 1 from unnest(wanted) w where lower(w)=lower(clean)) then wanted=wanted||clean; end if;
  end loop;
  if cardinality(wanted)>2 then raise exception 'Tu peux inscrire 2 invité·es au plus à chaque date.'; end if;
  -- Held until the end, before the games as edit_series does: a date the series opens meanwhile waits, then takes in those added here.
  select * into r from public.session_series where id=s.series_id for share;
  if r.id is null then raise exception 'Cette partie ne revient pas d’une semaine à l’autre.'; end if;
  -- A stopped series can still be left, so that nothing is taken again if it resumes.
  if r.stopped_at is not null and (p_self or cardinality(wanted)>0) then raise exception 'Cette série est arrêtée : aucune nouvelle date ne s’ouvrira.'; end if;

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
  if cardinality(added)=0 and not removed_self and cardinality(removed_guests)=0 then
    return jsonb_build_object('changed',renamed>0,'regular',exists(select 1 from public.series_registrations where series_id=r.id and user_id=auth.uid()));
  end if;

  -- In id order, like stop_series and edit_series, then each in turn by date.
  perform 1 from public.sessions g where g.series_id=r.id and g.status='published' and g.starts_at>now() order by g.id for update;
  for d in select g.id,g.starts_at from public.sessions g where g.series_id=r.id and g.status='published' and g.starts_at>now() order by g.starts_at,g.id loop
    if p_release and (removed_self or cardinality(removed_guests)>0) then
      update public.bookings b set status='cancelled',offer_expires_at=null where b.session_id=d.id and b.status not in ('cancelled','declined')
        and ((removed_self and b.user_id=auth.uid()) or (b.sponsor_id=auth.uid() and lower(b.guest_name)=any(removed_guests)));
      get diagnostics freed=row_count;
      if freed>0 then released=released+freed; perform public.rebalance(d.id); end if;
    end if;
    if cardinality(added)>0 and d.starts_at>now()+interval '30 minutes' then
      opened=opened+1;
      for t in select * from public.seat_regulars(d.id,added) loop
        if t.booked='confirmed' then confirmed=confirmed+1; elsif t.booked='waitlisted' then waiting=waiting+1;
        elsif t.booked='already' then already=already+1; else skipped=skipped+1; end if;
      end loop;
    end if;
  end loop;

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
      ||case when released>0 then ' '||released||case when released>1 then ' places déjà prises sont libérées.' else ' place déjà prise est libérée.' end else '' end
      ||' Un empêchement ? Libère la place d’une date depuis le site : les autres restent prévues.';
    perform public.notify(auth.uid(),null,'Inscription à chaque date enregistrée',body,p_kind=>'booking');
  else
    perform public.notify(auth.uid(),null,'Inscription à chaque date arrêtée','Plus aucune place n’est prise automatiquement aux nouvelles dates de « '||game||' ».'
      ||case when released>0 then ' '||released||case when released>1 then ' places déjà prises aux prochaines dates sont libérées.' else ' place déjà prise à une prochaine date est libérée.' end
        else ' Les places déjà prises aux prochaines dates restent : libère depuis le site celles dont tu n’as plus besoin.' end,p_kind=>'booking');
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
      -- Its rhythm and the day it falls on, for the « Chaque mercredi » badge; nothing once the series is stopped.
      'series',(select jsonb_build_object('every_weeks',r.every_weeks,'first_date',r.first_date) from public.session_series r where r.id=s.series_id and r.stopped_at is null),
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

revoke execute on function public.seat_regulars(uuid,uuid[]),public.welcome_regulars(uuid[]),public.save_series_registration(uuid,boolean,text[],boolean) from public,anon,authenticated;
grant execute on function public.save_series_registration(uuid,boolean,text[],boolean) to authenticated,service_role;
-- Replaced functions keep their grants; said again so that the rule holds whatever ran before.
revoke execute on function public.extend_series(uuid) from public,anon,authenticated;
grant execute on function public.extend_series(uuid) to service_role;
