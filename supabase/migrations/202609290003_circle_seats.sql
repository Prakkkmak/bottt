-- A token is a real, persistent place. Pending requests do not hold a place.
alter table public.bookings add column seat_index integer check (seat_index between 0 and 19);
alter table public.bookings add column preferred_seat integer check (preferred_seat between 0 and 19);

update public.bookings set status='cancelled',offer_expires_at=null
where status='offered' and offer_expires_at<=now();
with numbered as (
  select id,row_number() over(partition by session_id order by created_at,id)-1 as seat
  from public.bookings where status in ('confirmed','offered')
)
update public.bookings b set seat_index=n.seat from numbered n where n.id=b.id;
create unique index bookings_unique_seat on public.bookings(session_id,seat_index)
  where status in ('confirmed','offered');

create function public.assign_circle_seat() returns trigger language plpgsql security definer set search_path='' as $$
declare seat_count integer;
begin
  select capacity into seat_count from public.sessions where id=new.session_id for update;
  if new.status not in ('confirmed','offered') then
    new.seat_index=null;
    if new.status in ('cancelled','declined') then new.preferred_seat=null; end if;
    return new;
  end if;
  new.seat_index=coalesce(new.seat_index,new.preferred_seat);
  if new.seat_index is null or new.seat_index>=seat_count or exists(
    select 1 from public.bookings where session_id=new.session_id and id<>new.id
      and status in ('confirmed','offered') and seat_index=new.seat_index
  ) then
    select seat into new.seat_index from generate_series(0,seat_count-1) seat
    where not exists(select 1 from public.bookings b where b.session_id=new.session_id
      and b.id<>new.id and b.status in ('confirmed','offered') and b.seat_index=seat)
    order by seat limit 1;
  end if;
  if new.seat_index is null then raise exception 'Le cercle est complet.'; end if;
  return new;
end; $$;
create trigger assign_circle_seat before insert or update on public.bookings
  for each row execute function public.assign_circle_seat();
alter table public.bookings add constraint bookings_seat_status
  check ((status in ('confirmed','offered')) = (seat_index is not null));

-- Keep every token visible when the organizer reduces the table size.
create function public.resize_circle() returns trigger language plpgsql security definer set search_path='' as $$
declare booking_id uuid;
begin
  if new.capacity<old.capacity then
    update public.bookings set status='cancelled',offer_expires_at=null
      where session_id=new.id and status='offered' and offer_expires_at<=now();
    for booking_id in select id from public.bookings where session_id=new.id and seat_index>=new.capacity order by seat_index
    loop update public.bookings set seat_index=null where id=booking_id; end loop;
  end if;
  return new;
end; $$;
create trigger resize_circle after update of capacity on public.sessions
  for each row execute function public.resize_circle();

create function public.book_circle_seat(p_id uuid,p_seat integer) returns text language plpgsql security definer set search_path='' as $$
declare seat_count integer; existing_status text; result text;
begin
  if not public.active_user() then raise exception 'Connecte-toi pour continuer.'; end if;
  select capacity into seat_count from public.sessions where id=p_id for update;
  if seat_count is null or not public.can_see_session(p_id) then raise exception 'Cette session est inaccessible.'; end if;
  if p_seat is null or p_seat<0 or p_seat>=seat_count then raise exception 'Cette place est invalide.'; end if;
  select status into existing_status from public.bookings where session_id=p_id and user_id=auth.uid();
  -- Repeated clicks must never create or move a second reservation.
  if existing_status in ('pending','confirmed','waitlisted','offered') then return existing_status; end if;
  perform public.rebalance(p_id);
  if exists(select 1 from public.bookings where session_id=p_id and seat_index=p_seat and status in ('confirmed','offered')) then
    raise exception 'Cette place vient d’être prise. Choisis un autre +.';
  end if;
  result=public.book_session(p_id);
  update public.bookings set preferred_seat=p_seat,
    seat_index=case when result='confirmed' then p_seat else null end
    where session_id=p_id and user_id=auth.uid();
  return result;
end; $$;

create or replace function public.list_sessions() returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(payload order by starts_at),'[]'::jsonb) from (
    select s.starts_at, (to_jsonb(s)-'created_by'-'created_at'-'description') || jsonb_build_object(
      'confirmed_count',(select count(*) from public.bookings b where b.session_id=s.id and (b.status='confirmed' or (b.status='offered' and b.offer_expires_at>now()))),
      'waitlist_count',(select count(*) from public.bookings b where b.session_id=s.id and b.status='waitlisted'),
      'occupied_seats',(select coalesce(jsonb_agg(b.seat_index order by b.seat_index),'[]'::jsonb) from public.bookings b where b.session_id=s.id and (b.status='confirmed' or (b.status='offered' and b.offer_expires_at>now()))),
      'my_status',case when public.active_user() then (select status from public.bookings b where b.session_id=s.id and b.user_id=auth.uid()) else null end,
      'my_seat',case when public.active_user() then (select seat_index from public.bookings b where b.session_id=s.id and b.user_id=auth.uid() and (b.status='confirmed' or (b.status='offered' and b.offer_expires_at>now()))) else null end,
      'my_offer_expires_at',case when public.active_user() then (select offer_expires_at from public.bookings b where b.session_id=s.id and b.user_id=auth.uid()) else null end,
      'participants',case when public.is_member() or (public.active_user() and exists(select 1 from public.bookings where session_id=s.id and user_id=auth.uid() and status='confirmed'))
        then (select coalesce(jsonb_agg(jsonb_build_object('display_name',p.display_name,'avatar_color',p.avatar_color,'seat_index',b.seat_index)),'[]'::jsonb)
          from public.bookings b join public.profiles p on p.id=b.user_id where b.session_id=s.id and b.status='confirmed') else '[]'::jsonb end
    ) as payload from public.sessions s where public.can_see_session(s.id)
      and (s.ends_at>now()-interval '30 days' or public.is_organizer())
  ) listed;
$$;
revoke execute on function public.assign_circle_seat(),public.resize_circle(),public.book_circle_seat(uuid,integer) from public,anon,authenticated;
grant execute on function public.book_circle_seat(uuid,integer) to authenticated,service_role;
