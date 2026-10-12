-- Guests are bookings without an account, brought by a sponsor who answers for them.
-- sponsor_id references auth.users rather than profiles: a second foreign key to profiles
-- would make the deployed PostgREST embed `profile:profiles(*)` ambiguous.
alter table public.bookings alter column user_id drop not null;
alter table public.bookings add column guest_name text check (guest_name is null or char_length(guest_name) between 2 and 40);
alter table public.bookings add column sponsor_id uuid references auth.users(id) on delete cascade;
alter table public.bookings add constraint bookings_person_or_guest check (
  (user_id is not null and guest_name is null and sponsor_id is null)
  or (user_id is null and guest_name is not null and sponsor_id is not null));
create index bookings_sponsor_idx on public.bookings(sponsor_id,session_id) where sponsor_id is not null;

drop policy bookings_read on public.bookings;
create policy bookings_read on public.bookings for select to authenticated using (
  ((user_id=auth.uid() or sponsor_id=auth.uid()) and public.active_user()) or public.is_organizer());
-- A sponsor passes the address on to the guest, even without attending.
drop policy addresses_read on public.session_addresses;
create policy addresses_read on public.session_addresses for select to authenticated using (
  public.is_organizer() or (public.active_user() and exists(select 1 from public.bookings
    where session_id=session_addresses.session_id and status='confirmed' and (user_id=auth.uid() or sponsor_id=auth.uid()))));

create function public.add_guest(p_session uuid,p_name text,p_seat integer default null) returns text language plpgsql security definer set search_path='' as $$
declare s public.sessions; p public.profiles; existing public.bookings; clean text; guest_pool text; result text; brought integer;
begin
  perform public.rate_guard('guest',20,600);
  select * into p from public.profiles where id=auth.uid();
  select * into s from public.sessions where id=p_session for update;
  if s.id is null or not public.can_see_session(p_session) then raise exception 'Cette session est inaccessible.'; end if;
  if s.status<>'published' or s.starts_at<=now()+interval '30 minutes' then raise exception 'Les inscriptions sont closes.'; end if;
  clean=trim(regexp_replace(coalesce(p_name,''),'\s+',' ','g'));
  if char_length(clean) not between 2 and 40 then raise exception 'Indique un prénom ou un pseudo de 2 à 40 caractères.'; end if;
  if p_seat is not null and (p_seat<0 or p_seat>=s.capacity) then raise exception 'Cette place est invalide.'; end if;
  select * into existing from public.bookings where session_id=p_session and sponsor_id=auth.uid() and lower(guest_name)=lower(clean)
    and status<>'cancelled' order by status='declined' limit 1;
  -- Repeated clicks return the existing guest instead of adding a second one.
  if existing.status in ('pending','confirmed','waitlisted','offered') then return existing.status; end if;
  if existing.status='declined' then raise exception 'Cette personne n’a pas été retenue pour cette partie. Contacte un organisateur.'; end if;
  select count(*) into brought from public.bookings where session_id=p_session and sponsor_id=auth.uid() and status in ('pending','confirmed','waitlisted','offered');
  if brought>=2 then raise exception 'Tu amènes déjà 2 personnes à cette partie.'; end if;
  perform public.rebalance(p_session);
  if p_seat is not null and exists(select 1 from public.bookings where session_id=p_session and seat_index=p_seat and status in ('confirmed','offered')) then
    raise exception 'Cette place vient d’être prise. Choisis un autre +.';
  end if;
  -- A member vouches for the guest; a traveller's friend waits for an organizer like the traveller.
  guest_pool=case when p.membership in ('member','organizer') then 'circle' else 'newcomer' end;
  result=case when guest_pool='newcomer' then 'pending' when public.seat_available(p_session,guest_pool) then 'confirmed' else 'waitlisted' end;
  insert into public.bookings(session_id,guest_name,sponsor_id,status,pool,preferred_seat,seat_index)
    values(p_session,clean,auth.uid(),result,guest_pool,p_seat,case when result='confirmed' then p_seat end);
  return result;
end; $$;
revoke execute on function public.add_guest(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.add_guest(uuid,text,integer) to authenticated,service_role;

create or replace function public.list_sessions() returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(payload order by starts_at),'[]'::jsonb) from (
    select s.starts_at, (to_jsonb(s)-'created_by'-'created_at'-'description'-'storyteller') || jsonb_build_object(
      'confirmed_count',used.total_used,
      'waitlist_count',(select count(*) from public.bookings b where b.session_id=s.id and b.status='waitlisted'),
      'occupied_seats',(select coalesce(jsonb_agg(b.seat_index order by b.seat_index),'[]'::jsonb) from public.bookings b where b.session_id=s.id and (b.status='confirmed' or (b.status='offered' and b.offer_expires_at>now()))),
      -- Free tokens per kind of seat, counted like seat_available; both open up once quotas merge.
      'member_seats_free',case when now()>=s.starts_at-make_interval(hours=>s.release_hours) then greatest(0,s.capacity-used.total_used)
        else greatest(0,least(s.capacity-used.total_used,s.capacity-s.newcomer_seats-used.circle_used)) end,
      'traveller_seats_free',case when now()>=s.starts_at-make_interval(hours=>s.release_hours) then greatest(0,s.capacity-used.total_used)
        else greatest(0,least(s.capacity-used.total_used,s.newcomer_seats-used.newcomer_used)) end,
      'my_status',case when public.active_user() then (select status from public.bookings b where b.session_id=s.id and b.user_id=auth.uid()) else null end,
      'my_seat',case when public.active_user() then (select seat_index from public.bookings b where b.session_id=s.id and b.user_id=auth.uid() and (b.status='confirmed' or (b.status='offered' and b.offer_expires_at>now()))) else null end,
      'my_offer_expires_at',case when public.active_user() then (select offer_expires_at from public.bookings b where b.session_id=s.id and b.user_id=auth.uid()) else null end,
      'my_guests',case when public.active_user() then (select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'name',b.guest_name,'status',b.status,'seat_index',b.seat_index,'offer_expires_at',b.offer_expires_at) order by b.created_at,b.id),'[]'::jsonb)
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
          where b.session_id=s.id and b.status='confirmed') else '[]'::jsonb end
    ) as payload
    from public.sessions s
    cross join lateral (select count(*) as total_used,count(*) filter(where b.pool='circle') as circle_used,count(*) filter(where b.pool='newcomer') as newcomer_used
      from public.bookings b where b.session_id=s.id and (b.status='confirmed' or (b.status='offered' and b.offer_expires_at>now()))) used
    where public.can_see_session(s.id) and (s.ends_at>now()-interval '30 days' or public.is_organizer())
  ) listed;
$$;
