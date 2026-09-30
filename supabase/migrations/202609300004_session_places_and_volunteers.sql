-- Keep existing reservations while raising any legacy capacity below seven.
update public.sessions set capacity=7 where capacity<7;
alter table public.sessions drop constraint sessions_capacity_check;
alter table public.sessions add constraint sessions_capacity_check check (capacity between 7 and 20);
alter table public.sessions alter column capacity set default 15;

-- Legacy names remain stored, but a session no longer requires or exposes a MJ.
alter table public.sessions alter column storyteller drop not null;

create or replace function public.save_session(p_data jsonb) returns uuid language plpgsql security definer set search_path = '' as $$
declare sid uuid; occupied integer; occupied_new integer; occupied_circle integer;
begin
  if not public.is_organizer() then raise exception 'Accès organisateur requis.'; end if;
  p_data=jsonb_build_object('capacity',15)||p_data;
  if (p_data->>'starts_at')::timestamptz<=now() then raise exception 'Choisis une date à venir.'; end if;
  sid=nullif(p_data->>'id','')::uuid;
  if sid is not null then
    perform 1 from public.sessions where id=sid for update;
    if not found then raise exception 'Session introuvable.'; end if;
    select count(*),count(*) filter(where pool='newcomer'),count(*) filter(where pool='circle') into occupied,occupied_new,occupied_circle
      from public.bookings where session_id=sid and (status='confirmed' or (status='offered' and offer_expires_at>now()));
    if occupied>(p_data->>'capacity')::integer then raise exception 'La capacité ne peut pas être inférieure aux places déjà réservées.'; end if;
    if exists(select 1 from public.sessions where id=sid and visibility='public') and p_data->>'visibility'='members'
      and exists(select 1 from public.bookings b join public.profiles p on p.id=b.user_id where b.session_id=sid and b.status in ('pending','confirmed','offered','waitlisted') and p.membership='newcomer')
      then raise exception 'Des nouveaux sont inscrits : garde cette session publique.'; end if;
    update public.sessions set title=p_data->>'title', description=p_data->>'description',script=p_data->>'script',
      starts_at=(p_data->>'starts_at')::timestamptz,ends_at=(p_data->>'ends_at')::timestamptz,
      location=p_data->>'location',capacity=(p_data->>'capacity')::integer,
      newcomer_seats=(p_data->>'newcomer_seats')::integer,release_hours=(p_data->>'release_hours')::integer,
      beginners_welcome=(p_data->>'beginners_welcome')::boolean,visibility=p_data->>'visibility' where id=sid;
    insert into public.notifications(user_id,session_id,title,body)
      select user_id,sid,'Les informations de ta session ont changé','Consulte les nouveaux horaires et le lieu avant de venir.' from public.bookings
      where session_id=sid and status in ('confirmed','offered','waitlisted','pending');
  else
    insert into public.sessions(title,description,script,starts_at,ends_at,location,capacity,newcomer_seats,release_hours,beginners_welcome,visibility,created_by)
      values(p_data->>'title',p_data->>'description',p_data->>'script',(p_data->>'starts_at')::timestamptz,(p_data->>'ends_at')::timestamptz,
      p_data->>'location',(p_data->>'capacity')::integer,(p_data->>'newcomer_seats')::integer,(p_data->>'release_hours')::integer,
      (p_data->>'beginners_welcome')::boolean,p_data->>'visibility',auth.uid()) returning id into sid;
  end if;
  insert into public.session_addresses(session_id,address) values(sid,coalesce(p_data->>'address','')) on conflict(session_id) do update set address=excluded.address;
  perform public.rebalance(sid);
  return sid;
end; $$;

create or replace function public.list_sessions() returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(payload order by starts_at),'[]'::jsonb) from (
    select s.starts_at, (to_jsonb(s)-'created_by'-'created_at'-'description'-'storyteller') || jsonb_build_object(
      'confirmed_count',(select count(*) from public.bookings b where b.session_id=s.id and (b.status='confirmed' or (b.status='offered' and b.offer_expires_at>now()))),
      'waitlist_count',(select count(*) from public.bookings b where b.session_id=s.id and b.status='waitlisted'),
      'occupied_seats',(select coalesce(jsonb_agg(b.seat_index order by b.seat_index),'[]'::jsonb) from public.bookings b where b.session_id=s.id and (b.status='confirmed' or (b.status='offered' and b.offer_expires_at>now()))),
      'my_status',case when public.active_user() then (select status from public.bookings b where b.session_id=s.id and b.user_id=auth.uid()) else null end,
      'my_seat',case when public.active_user() then (select seat_index from public.bookings b where b.session_id=s.id and b.user_id=auth.uid() and (b.status='confirmed' or (b.status='offered' and b.offer_expires_at>now()))) else null end,
      'my_offer_expires_at',case when public.active_user() then (select offer_expires_at from public.bookings b where b.session_id=s.id and b.user_id=auth.uid()) else null end,
      'participants',case when public.is_member() or (public.active_user() and exists(select 1 from public.bookings where session_id=s.id and user_id=auth.uid() and status='confirmed'))
        then (select coalesce(jsonb_agg(jsonb_build_object('display_name',p.display_name,'avatar_color',p.avatar_color,'seat_index',b.seat_index,'can_storytell',p.can_storytell)),'[]'::jsonb)
          from public.bookings b join public.profiles p on p.id=b.user_id where b.session_id=s.id and b.status='confirmed') else '[]'::jsonb end
    ) as payload from public.sessions s where public.can_see_session(s.id)
      and (s.ends_at>now()-interval '30 days' or public.is_organizer())
  ) listed;
$$;
