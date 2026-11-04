-- A message about a changed game says what changed: each changed field with the value it had and the one it has now.
-- The e-mail writes them out (lib/mail.ts), so that a date reads as everywhere else on the site. Messages queued before
-- keep an empty list and leave as they did, and the site deployed before this migration ignores the new column.
alter table public.notifications add column changes jsonb not null default '[]'::jsonb check (jsonb_typeof(changes)='array');

-- Writes once to each person registered for the game, naming the people they bring. Everyone reads p_changes; p_address,
-- the exact address before and after, only reaches those who read it on the site (see the addresses_read policy): an account
-- that is not suspended, with a seat for themselves or a guest, and being a member or the game being 48 hours away at most;
-- or an organizer. The former address follows the same rule at the former date (p_previous_start): a game brought within
-- 48 hours tells a traveller its new address alone. Nobody hears about a change they could not see.
-- A message of the same kind about this game still waiting to leave is replaced by the new one, which starts from its former
-- values: a game edited twice in a row tells each person once, from the first value to the last, and a change undone tells nothing.
create function public.notify_session_change(p_session uuid,p_title text,p_body text,p_changes jsonb,p_address jsonb,p_previous_start timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
declare r record; fresh jsonb; earlier jsonb; merged jsonb; f text; newest jsonb; oldest jsonb; latest jsonb; former jsonb; latter jsonb;
begin
  for r in select b.recipient,b.guests,
      coalesce(x.may_read and (p.membership in ('member','organizer') or s.starts_at<=now()+interval '48 hours'),false) as reads_now,
      coalesce(x.may_read and (p.membership in ('member','organizer') or p_previous_start<=now()+interval '48 hours'),false) as read_before
    from (select coalesce(user_id,sponsor_id) as recipient,string_agg(guest_name,' et ' order by guest_name) filter(where user_id is null) as guests,
        bool_or(status='confirmed') as seated
      from public.bookings where session_id=p_session and status in ('confirmed','offered','waitlisted','pending') group by 1) b
    join public.profiles p on p.id=b.recipient
    join public.sessions s on s.id=p_session
    cross join lateral (select p_address is not null and p.membership<>'suspended' and (b.seated or p.membership='organizer') as may_read) x
    order by b.recipient
  loop
    fresh=p_changes||case when r.reads_now then jsonb_build_array(case when r.read_before then p_address else p_address-'before' end) else '[]'::jsonb end;
    continue when jsonb_array_length(fresh)=0;
    -- A message being sent right now is left to leave.
    with replaced as (update public.notifications n set email_attempts=5
        where n.user_id=r.recipient and n.session_id=p_session and n.title=p_title and n.changes<>'[]'::jsonb
          and n.emailed_at is null and n.email_attempts<5 and (n.claimed_until is null or n.claimed_until<now())
        returning n.id,n.created_at,n.changes)
    select coalesce(jsonb_agg(e.change order by q.created_at,q.id,e.idx),'[]'::jsonb) into earlier
      from replaced q cross join lateral jsonb_array_elements(q.changes) with ordinality e(change,idx);
    merged='[]';
    foreach f in array array['starts_at','location','address'] loop
      newest=(select e.change from jsonb_array_elements(fresh) e(change) where e.change->>'field'=f);
      oldest=(select e.change from jsonb_array_elements(earlier) with ordinality e(change,idx) where e.change->>'field'=f order by e.idx limit 1);
      latest=(select e.change from jsonb_array_elements(earlier) with ordinality e(change,idx) where e.change->>'field'=f order by e.idx desc limit 1);
      -- The address only goes to those who read it now, its former value only if they could read it then.
      continue when coalesce(newest,oldest) is null or (f='address' and not r.reads_now);
      former=coalesce(oldest,newest)->'before';latter=coalesce(newest,latest)->'after';
      continue when former is not null and case when f='starts_at' then (former#>>'{}')::timestamptz=(latter#>>'{}')::timestamptz else former=latter end;
      merged=merged||jsonb_build_array(jsonb_build_object('field',f,'after',latter)||case when former is null then '{}'::jsonb else jsonb_build_object('before',former) end);
    end loop;
    continue when jsonb_array_length(merged)=0;
    insert into public.notifications(user_id,session_id,title,body,changes)
      values(r.recipient,p_session,p_title,p_body||coalesce(' Préviens '||r.guests||'.',''),merged);
  end loop;
end; $$;

-- Same as the waitlist migration, except that the message gives the former and the new date, place and address.
create or replace function public.save_session(p_data jsonb) returns uuid language plpgsql security definer set search_path = '' as $$
declare sid uuid; occupied integer; v public.venues; previous public.sessions; previous_address text; changed jsonb='[]';
begin
  if not public.is_organizer() then raise exception 'Accès organisateur requis.'; end if;
  p_data=jsonb_build_object('capacity',15)||p_data;
  if (p_data->>'starts_at')::timestamptz<=now() then raise exception 'Choisis une date à venir.'; end if;
  if nullif(p_data->>'venue_id','') is not null then
    select * into v from public.venues where id=(p_data->>'venue_id')::uuid for share;
    if v.id is null then raise exception 'Ce lieu n’est plus dans la liste. Choisis-en un autre.'; end if;
    p_data=p_data||jsonb_build_object('location',v.name,'address',v.address);
  end if;
  sid=nullif(p_data->>'id','')::uuid;
  if sid is not null then
    select * into previous from public.sessions where id=sid for update;
    if previous.id is null then raise exception 'Session introuvable.'; end if;
    select address into previous_address from public.session_addresses where session_id=sid;
    select count(*) into occupied from public.bookings where session_id=sid and (status='confirmed' or (status='offered' and offer_expires_at>now()));
    if occupied>(p_data->>'capacity')::integer then raise exception 'La capacité ne peut pas être inférieure aux places déjà réservées.'; end if;
    -- Travellers, and the friends they bring, cannot see a members-only session.
    if previous.visibility='public' and p_data->>'visibility'='members'
      and exists(select 1 from public.bookings b left join public.profiles p on p.id=b.user_id where b.session_id=sid
        and b.status in ('pending','confirmed','offered','waitlisted') and (p.membership='newcomer' or (b.user_id is null and b.pool='newcomer')))
      then raise exception 'Des voyageurs sont inscrits : garde cette session publique.'; end if;
    update public.sessions set title=p_data->>'title', description=p_data->>'description',script=p_data->>'script',
      starts_at=(p_data->>'starts_at')::timestamptz,ends_at=(p_data->>'ends_at')::timestamptz,
      location=p_data->>'location',venue_id=v.id,capacity=(p_data->>'capacity')::integer,
      -- The site no longer sends the former quotas; the previous one still does.
      newcomer_seats=least(coalesce((p_data->>'newcomer_seats')::integer,newcomer_seats),(p_data->>'capacity')::integer),
      release_hours=coalesce((p_data->>'release_hours')::integer,release_hours),
      beginners_welcome=(p_data->>'beginners_welcome')::boolean,visibility=p_data->>'visibility' where id=sid;
    -- Only a change of date or place is written to the people registered: a new name or more seats is not.
    if previous.starts_at is distinct from (p_data->>'starts_at')::timestamptz then
      changed=changed||jsonb_build_array(jsonb_build_object('field','starts_at','before',previous.starts_at,'after',(p_data->>'starts_at')::timestamptz));
    end if;
    if previous.location is distinct from p_data->>'location' then
      changed=changed||jsonb_build_array(jsonb_build_object('field','location','before',previous.location,'after',p_data->>'location'));
    end if;
    perform public.notify_session_change(sid,'Les informations de ta session ont changé','Vérifie ce qui change avant de venir.',changed,
      case when coalesce(previous_address,'') is distinct from coalesce(p_data->>'address','')
        then jsonb_build_object('field','address','before',coalesce(previous_address,''),'after',coalesce(p_data->>'address','')) end,previous.starts_at);
  else
    insert into public.sessions(title,description,script,starts_at,ends_at,location,venue_id,capacity,newcomer_seats,release_hours,beginners_welcome,visibility,created_by)
      values(p_data->>'title',p_data->>'description',p_data->>'script',(p_data->>'starts_at')::timestamptz,(p_data->>'ends_at')::timestamptz,
      p_data->>'location',v.id,(p_data->>'capacity')::integer,coalesce((p_data->>'newcomer_seats')::integer,0),coalesce((p_data->>'release_hours')::integer,0),
      (p_data->>'beginners_welcome')::boolean,p_data->>'visibility',auth.uid()) returning id into sid;
  end if;
  insert into public.session_addresses(session_id,address) values(sid,coalesce(p_data->>'address','')) on conflict(session_id) do update set address=excluded.address;
  -- More seats let the people waiting in.
  perform public.rebalance(sid);
  return sid;
end; $$;

-- Same as the venues migration, except that the message gives each game's former and new place and address,
-- compared game by game: a change of capitals in the name alone still writes to nobody.
create or replace function public.save_venue(p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare vid uuid=nullif(p_data->>'id','')::uuid; previous public.venues; game record;
  clean_name text=btrim(regexp_replace(coalesce(p_data->>'name',''),'\s+',' ','g')); clean_address text=btrim(coalesce(p_data->>'address',''));
begin
  if not public.is_organizer() then raise exception 'Accès organisateur requis.'; end if;
  if char_length(clean_name) not between 2 and 150 then raise exception 'Donne au lieu un nom de 2 à 150 caractères.'; end if;
  if char_length(clean_address)>500 then raise exception 'L’adresse et le lien Maps doivent tenir en 500 caractères.'; end if;
  if vid is not null then
    select * into previous from public.venues where id=vid for update;
    if previous.id is null then raise exception 'Ce lieu est introuvable.'; end if;
  end if;
  if exists(select 1 from public.venues where lower(name)=lower(clean_name) and id is distinct from vid) then raise exception 'Un lieu porte déjà ce nom.'; end if;
  begin
    if vid is null then
      insert into public.venues(name,address) values(clean_name,clean_address) returning id into vid;
      return vid;
    end if;
    if previous.name=clean_name and previous.address=clean_address then return vid; end if;
    update public.venues set name=clean_name,address=clean_address where id=vid;
  exception when unique_violation then raise exception 'Un lieu porte déjà ce nom.';
  end;
  -- Upcoming games at this venue follow the change, and the people registered hear about it, as when a game is edited.
  for game in select s.id,s.location,s.starts_at,coalesce(a.address,'') as address from public.sessions s left join public.session_addresses a on a.session_id=s.id
    where s.venue_id=vid and s.status='published' and s.starts_at>now() order by s.id for update of s loop
    update public.sessions set location=clean_name where id=game.id;
    insert into public.session_addresses(session_id,address) values(game.id,clean_address) on conflict(session_id) do update set address=excluded.address;
    perform public.notify_session_change(game.id,'Le lieu de ta session a changé','Vérifie le nouveau lieu avant de venir.',
      case when lower(game.location)<>lower(clean_name)
        then jsonb_build_array(jsonb_build_object('field','location','before',game.location,'after',clean_name)) else '[]'::jsonb end,
      case when game.address<>clean_address then jsonb_build_object('field','address','before',game.address,'after',clean_address) end,game.starts_at);
  end loop;
  return vid;
end; $$;

-- Same as the waitlist migration, with the changes of each message, in the order written.
drop function public.claim_emails();
create function public.claim_emails() returns table(id uuid,email text,title text,body text,session_id uuid,
  session_title text,session_script text,session_starts_at timestamptz,session_location text,changes jsonb) language sql security definer set search_path = '' as $$
  with picked as (select n.id from public.notifications n where emailed_at is null and email_attempts<5 and (claimed_until is null or claimed_until<now())
      -- A message that could not leave in time is out of date: never a day late, never once its game has started.
      and n.created_at>now()-interval '24 hours' and not exists(select 1 from public.sessions s where s.id=n.session_id and s.starts_at<=now())
    order by created_at for update skip locked limit 30),
  claimed as (update public.notifications n set claimed_until=now()+interval '5 minutes',email_attempts=email_attempts+1 from picked where n.id=picked.id returning n.*)
  select c.id,u.email,c.title,c.body,c.session_id,s.title,s.script,s.starts_at,s.location,c.changes
  from claimed c join auth.users u on u.id=c.user_id left join public.sessions s on s.id=c.session_id
  -- In the order written, so that a later message about a game never arrives first.
  order by c.created_at,c.id;
$$;

-- The helper only runs inside save_session and save_venue: nobody may write messages to the people registered through it.
revoke execute on function public.notify_session_change(uuid,text,text,jsonb,jsonb,timestamptz),public.claim_emails() from public,anon,authenticated;
grant execute on function public.claim_emails() to service_role;
