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
