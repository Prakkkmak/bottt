-- Venues: the places where the group usually plays, kept by organizers so a game picks one instead of retyping it.
-- A game still keeps its own copy of the venue's name in sessions.location and of its address in session_addresses,
-- so the site deployed before this migration and the address rules stay as they are.
create table public.venues (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 150),
  address text not null default '' check (char_length(address) <= 500),
  created_at timestamptz not null default now()
);
create unique index venues_name_key on public.venues(lower(name));
-- Deleting a venue leaves its games where they were, with their copy of the place.
alter table public.sessions add column venue_id uuid references public.venues(id) on delete set null;
create index sessions_venue_idx on public.sessions(venue_id) where venue_id is not null;

-- The places already used become venues, each with the latest address given for it, and the games
-- with that same address are linked to them. Organizers remove from the list the ones they no longer use.
insert into public.venues(name,address)
  select distinct on (lower(btrim(s.location))) btrim(s.location),coalesce(a.address,'')
  from public.sessions s left join public.session_addresses a on a.session_id=s.id
  where s.status='published' and char_length(btrim(s.location))>=2
  order by lower(btrim(s.location)),coalesce(a.address,'')='',s.starts_at desc;
update public.sessions s set venue_id=v.id from public.venues v
  where lower(btrim(s.location))=lower(v.name)
    and coalesce((select a.address from public.session_addresses a where a.session_id=s.id),'')=v.address;

-- The address is private: only organizers read the list; everyone else sees the place through its games.
alter table public.venues enable row level security;
create policy venues_read on public.venues for select to authenticated using (public.is_organizer());
-- Changes go through save_venue and delete_venue only.
revoke all on public.venues from anon,authenticated;
grant select on public.venues to authenticated;
grant all on public.venues to service_role;

-- Locks the venue before its games, like save_session, so that the two never wait on each other.
create function public.save_venue(p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare vid uuid=nullif(p_data->>'id','')::uuid; previous public.venues; sid uuid;
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
  if vid is null then
    insert into public.venues(name,address) values(clean_name,clean_address) returning id into vid;
    return vid;
  end if;
  if previous.name=clean_name and previous.address=clean_address then return vid; end if;
  update public.venues set name=clean_name,address=clean_address where id=vid;
  -- Upcoming games at this venue follow the change, and the people registered hear about it, as when a game is edited.
  for sid in select id from public.sessions where venue_id=vid and status='published' and starts_at>now() order by id for update loop
    update public.sessions set location=clean_name where id=sid;
    insert into public.session_addresses(session_id,address) values(sid,clean_address) on conflict(session_id) do update set address=excluded.address;
    insert into public.notifications(user_id,session_id,title,body)
      select recipient,sid,'Le lieu de ta session a changé','Consulte le lieu mis à jour avant de venir.'||coalesce(' Préviens '||guests||'.','')
      from (select coalesce(user_id,sponsor_id) as recipient,string_agg(guest_name,' et ' order by guest_name) filter(where user_id is null) as guests
        from public.bookings where session_id=sid and status in ('confirmed','offered','waitlisted','pending') group by 1) recipients;
  end loop;
  return vid;
end; $$;

create function public.delete_venue(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.is_organizer() then raise exception 'Accès organisateur requis.'; end if;
  delete from public.venues where id=p_id;
end; $$;

-- Same as the guests migration, except that a game at a saved venue takes that venue's name and address.
create or replace function public.save_session(p_data jsonb) returns uuid language plpgsql security definer set search_path = '' as $$
declare sid uuid; occupied integer; v public.venues;
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
    perform 1 from public.sessions where id=sid for update;
    if not found then raise exception 'Session introuvable.'; end if;
    select count(*) into occupied from public.bookings where session_id=sid and (status='confirmed' or (status='offered' and offer_expires_at>now()));
    if occupied>(p_data->>'capacity')::integer then raise exception 'La capacité ne peut pas être inférieure aux places déjà réservées.'; end if;
    -- Travellers, and the friends they bring, cannot see a members-only session.
    if exists(select 1 from public.sessions where id=sid and visibility='public') and p_data->>'visibility'='members'
      and exists(select 1 from public.bookings b left join public.profiles p on p.id=b.user_id where b.session_id=sid
        and b.status in ('pending','confirmed','offered','waitlisted') and (p.membership='newcomer' or (b.user_id is null and b.pool='newcomer')))
      then raise exception 'Des voyageurs sont inscrits : garde cette session publique.'; end if;
    update public.sessions set title=p_data->>'title', description=p_data->>'description',script=p_data->>'script',
      starts_at=(p_data->>'starts_at')::timestamptz,ends_at=(p_data->>'ends_at')::timestamptz,
      location=p_data->>'location',venue_id=v.id,capacity=(p_data->>'capacity')::integer,
      newcomer_seats=(p_data->>'newcomer_seats')::integer,release_hours=(p_data->>'release_hours')::integer,
      beginners_welcome=(p_data->>'beginners_welcome')::boolean,visibility=p_data->>'visibility' where id=sid;
    -- One message per person, naming the people they bring.
    insert into public.notifications(user_id,session_id,title,body)
      select recipient,sid,'Les informations de ta session ont changé','Consulte les nouveaux horaires et le lieu avant de venir.'||coalesce(' Préviens '||guests||'.','')
      from (select coalesce(user_id,sponsor_id) as recipient,string_agg(guest_name,' et ' order by guest_name) filter(where user_id is null) as guests
        from public.bookings where session_id=sid and status in ('confirmed','offered','waitlisted','pending') group by 1) recipients;
  else
    insert into public.sessions(title,description,script,starts_at,ends_at,location,venue_id,capacity,newcomer_seats,release_hours,beginners_welcome,visibility,created_by)
      values(p_data->>'title',p_data->>'description',p_data->>'script',(p_data->>'starts_at')::timestamptz,(p_data->>'ends_at')::timestamptz,
      p_data->>'location',v.id,(p_data->>'capacity')::integer,(p_data->>'newcomer_seats')::integer,(p_data->>'release_hours')::integer,
      (p_data->>'beginners_welcome')::boolean,p_data->>'visibility',auth.uid()) returning id into sid;
  end if;
  insert into public.session_addresses(session_id,address) values(sid,coalesce(p_data->>'address','')) on conflict(session_id) do update set address=excluded.address;
  perform public.rebalance(sid);
  return sid;
end; $$;

revoke execute on function public.save_venue(jsonb),public.delete_venue(uuid) from public,anon,authenticated;
grant execute on function public.save_venue(jsonb),public.delete_venue(uuid) to authenticated,service_role;
