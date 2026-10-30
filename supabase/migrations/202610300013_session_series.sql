-- Recurring games: an organizer opens the same evening every week, or every other week. Each date is an ordinary game
-- with its own registrations, edited, cancelled or deleted alone; the series only creates the next dates, a few weeks
-- ahead, so that people can sign up in advance.
-- Additive for the deployed site: it never reads the new table, and list_sessions passes the new column through.
create table public.session_series (
  id uuid primary key default gen_random_uuid(),
  title text not null default '' check (char_length(title) <= 100),
  script text not null check (char_length(script) between 2 and 100),
  -- The place typed in for the series; a series at a saved venue takes the venue's name and address at each new date.
  location text not null check (char_length(location) between 2 and 150),
  address text not null default '' check (char_length(address) <= 500),
  venue_id uuid references public.venues(id) on delete set null,
  capacity integer not null check (capacity between 7 and 20),
  visibility text not null check (visibility in ('public','members')),
  -- Dates and hours in Paris time, so that the game stays at 19:30 on both sides of a change of hour.
  first_date date not null,
  starts_local time not null,
  duration interval not null check (duration > interval '0' and duration <= interval '24 hours'),
  every_weeks integer not null default 1 check (every_weeks in (1,2)),
  weeks_ahead integer not null default 4 check (weeks_ahead between 1 and 12),
  ends_on date check (ends_on is null or ends_on >= first_date),
  -- The last date already created: a date moved, cancelled or deleted by hand is never created again.
  generated_through date,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
alter table public.sessions add column series_id uuid references public.session_series(id) on delete set null;
create index sessions_series_idx on public.sessions(series_id) where series_id is not null;

-- The series holds a private address, like the venues: only organizers read it, and changes go through the functions below.
alter table public.session_series enable row level security;
create policy series_read on public.session_series for select to authenticated using (public.is_organizer());
revoke all on public.session_series from public,anon,authenticated;
grant select on public.session_series to authenticated;
grant all on public.session_series to service_role;

-- Creates the dates that come within each series' horizon, and always its first one. Dates already past, when nothing
-- ran for a while, are skipped. A series being extended elsewhere is left to that call. A series whose creator is no
-- longer an organizer (rank removed, account suspended) opens nothing more until another organizer replaces it.
-- The venue is locked like save_venue does, so that a renamed venue reaches the games created meanwhile.
create function public.extend_series(p_id uuid default null) returns integer language plpgsql security definer set search_path='' as $$
declare r public.session_series; v public.venues; slot date; starts timestamptz; sid uuid; created integer=0;
begin
  for r in select * from public.session_series s where (p_id is null or s.id=p_id)
      and exists(select 1 from public.profiles p where p.id=s.created_by and p.membership='organizer')
      order by s.id for update skip locked loop
    slot=coalesce(r.generated_through+7*r.every_weeks,r.first_date);
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
        created=created+1;
      end if;
      update public.session_series set generated_through=slot where id=r.id;
      slot=slot+7*r.every_weeks;
    end loop;
  end loop;
  return created;
end; $$;

-- Same checks as save_session for a new game, then the series opens its first dates at once.
create function public.save_series(p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare sid uuid; v public.venues; starts timestamptz; ends timestamptz; first_local timestamp; last_date date;
begin
  if not public.is_organizer() then raise exception 'Accès organisateur requis.'; end if;
  p_data=jsonb_build_object('capacity',15,'every_weeks',1,'weeks_ahead',4)||p_data;
  starts=(p_data->>'starts_at')::timestamptz; ends=(p_data->>'ends_at')::timestamptz;
  if starts is null or starts<=now() then raise exception 'Choisis une date à venir.'; end if;
  if ends is null or ends<=starts or ends>starts+interval '24 hours' then raise exception 'La fin doit être après le début.'; end if;
  if coalesce((p_data->>'every_weeks')::integer,0) not in (1,2) then raise exception 'Choisis le rythme de la série.'; end if;
  if coalesce((p_data->>'weeks_ahead')::integer,0) not between 1 and 12 then raise exception 'Choisis jusqu’à quand les dates sont ouvertes.'; end if;
  first_local=starts at time zone 'Europe/Paris';
  last_date=nullif(p_data->>'ends_on','')::date;
  if last_date<first_local::date then raise exception 'La dernière date doit suivre la première partie.'; end if;
  if nullif(p_data->>'venue_id','') is not null then
    select * into v from public.venues where id=(p_data->>'venue_id')::uuid for share;
    if v.id is null then raise exception 'Ce lieu n’est plus dans la liste. Choisis-en un autre.'; end if;
  end if;
  insert into public.session_series(title,script,location,address,venue_id,capacity,visibility,first_date,starts_local,duration,every_weeks,weeks_ahead,ends_on,created_by)
    values(coalesce(p_data->>'title',''),p_data->>'script',coalesce(v.name,p_data->>'location'),coalesce(v.address,p_data->>'address',''),v.id,
      (p_data->>'capacity')::integer,p_data->>'visibility',first_local::date,first_local::time,ends-starts,
      (p_data->>'every_weeks')::integer,(p_data->>'weeks_ahead')::integer,last_date,auth.uid())
    returning id into sid;
  perform public.extend_series(sid);
  return sid;
end; $$;

-- Stopping a series creates no more dates. Its upcoming games without anyone registered go with it; the others stay,
-- for the organizer to keep or cancel one by one, so that the people registered are told.
create function public.stop_series(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare removed integer; kept integer;
begin
  if not public.is_organizer() then raise exception 'Accès organisateur requis.'; end if;
  perform 1 from public.session_series where id=p_id for update;
  if not found then raise exception 'Cette série est déjà arrêtée.'; end if;
  -- Locked first, like book_session does: a registration made meanwhile is seen, and keeps its game. Past dates too, in id
  -- order like set_membership, since deleting the series then unlinks them all.
  perform 1 from public.sessions where series_id=p_id order by id for update;
  delete from public.sessions s where s.series_id=p_id and s.starts_at>now()
    and not exists(select 1 from public.bookings b where b.session_id=s.id and b.status in ('pending','confirmed','waitlisted','offered'));
  get diagnostics removed=row_count;
  select count(*) into kept from public.sessions where series_id=p_id and starts_at>now() and status='published';
  delete from public.session_series where id=p_id;
  return jsonb_build_object('removed',removed,'kept',kept);
end; $$;

-- Same as the venues migration, except that a series at the venue keeps its last name and address for its next dates.
create or replace function public.delete_venue(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.is_organizer() then raise exception 'Accès organisateur requis.'; end if;
  update public.session_series s set location=v.name,address=v.address from public.venues v where v.id=p_id and s.venue_id=p_id;
  delete from public.venues where id=p_id;
end; $$;

revoke execute on function public.extend_series(uuid),public.save_series(jsonb),public.stop_series(uuid) from public,anon,authenticated;
grant execute on function public.save_series(jsonb),public.stop_series(uuid) to authenticated,service_role;
-- The scheduled job and the site, with the service key, open the next dates.
grant execute on function public.extend_series(uuid) to service_role;
