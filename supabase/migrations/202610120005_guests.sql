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

-- Offers and expiries about a guest go to the sponsor, who confirms on the guest's behalf.
create or replace function public.rebalance(p_id uuid) returns void language plpgsql security definer set search_path = '' as $$
declare s public.sessions; b public.bookings; deadline timestamptz;
begin
  select * into s from public.sessions where id=p_id for update;
  if s.id is null or s.status<>'published' then return; end if;
  for b in update public.bookings set status='cancelled',offer_expires_at=null
    where session_id=p_id and status='offered' and offer_expires_at<=now() returning *
  loop
    if b.user_id is null then perform public.notify(b.sponsor_id,p_id,'La proposition pour '||b.guest_name||' a expiré','Le délai est passé. Tu peux l’ajouter à nouveau à la liste d’attente.');
    else perform public.notify(b.user_id,p_id,'La proposition a expiré','Le délai est passé. Tu peux rejoindre à nouveau la liste d’attente.'); end if;
  end loop;
  if s.starts_at<=now()+interval '30 minutes' then return; end if;
  deadline=least(now()+interval '12 hours',s.starts_at-interval '30 minutes');
  for b in select * from public.bookings where session_id=p_id and status='waitlisted' order by created_at,id for update
  loop
    if public.seat_available(p_id,b.pool) then
      update public.bookings set status='offered',offer_expires_at=deadline where id=b.id;
      if b.user_id is null then perform public.notify(b.sponsor_id,p_id,'Une place s’est libérée pour '||b.guest_name,'Confirme sa place depuis la partie avant l’expiration de la proposition.');
      else perform public.notify(b.user_id,p_id,'Une place s’est libérée !','Confirme ta présence depuis la partie avant l’expiration de la proposition.'); end if;
    end if;
  end loop;
end; $$;

create or replace function public.review_booking(p_booking uuid,p_approve boolean) returns text language plpgsql security definer set search_path = '' as $$
declare b public.bookings; result text; s public.sessions; previous text;
begin
  if not public.is_organizer() then raise exception 'Accès organisateur requis.'; end if;
  select * into b from public.bookings where id=p_booking;
  select * into s from public.sessions where id=b.session_id for update;
  select * into b from public.bookings where id=p_booking for update;
  if b.id is null then raise exception 'Participation introuvable.'; end if;
  if s.status<>'published' or s.starts_at<=now()+interval '30 minutes' then raise exception 'Cette session est close.'; end if;
  if p_approve and b.status<>'pending' then raise exception 'Cette demande a déjà été traitée.'; end if;
  previous=b.status;
  if p_approve then
    perform public.rebalance(b.session_id);
    result=case when public.seat_available(b.session_id,b.pool) then 'confirmed' else 'waitlisted' end;
  else result='declined'; end if;
  update public.bookings set status=result,offer_expires_at=null where id=b.id;
  -- Travellers stay travellers: only an organizer or a member's sponsorship link makes someone a member.
  if b.user_id is null then
    perform public.notify(b.sponsor_id,b.session_id,
      case when result='confirmed' then b.guest_name||' a sa place' when result='waitlisted' then b.guest_name||' est en liste d’attente'
        when previous='pending' then b.guest_name||' n’a pas été retenu·e pour cette partie' else b.guest_name||' a été retiré·e de la partie' end,
      case result when 'declined' then 'Contacte un organisateur si tu as une question.' else 'Retrouve les détails dans la partie.' end);
  else
    perform public.notify(b.user_id,b.session_id,
      case result when 'confirmed' then 'Bienvenue, ta place est confirmée !' when 'waitlisted' then 'Demande validée, tu es en attente' else 'Participation non retenue' end,
      case result when 'declined' then 'Contacte un organisateur si tu as une question.' else 'Retrouve les détails dans la partie.' end);
  end if;
  perform public.rebalance(b.session_id);
  return result;
end; $$;

-- Accepts or refuses, in one transaction and one message, a traveller's request and the friends they bring.
create function public.review_request(p_session uuid,p_person uuid,p_approve boolean,p_promote boolean default false) returns text language plpgsql security definer set search_path='' as $$
declare s public.sessions; b public.bookings; result text; own_result text; lines text[]=array[]::text[]; friends text[]=array[]::text[];
begin
  if not public.is_organizer() then raise exception 'Accès organisateur requis.'; end if;
  select * into s from public.sessions where id=p_session for update;
  if s.id is null or s.status<>'published' or s.starts_at<=now()+interval '30 minutes' then raise exception 'Cette session est close.'; end if;
  if not exists(select 1 from public.bookings where session_id=p_session and status='pending' and (user_id=p_person or sponsor_id=p_person)) then
    raise exception 'Cette demande a déjà été traitée.';
  end if;
  if p_approve then
    if p_promote then update public.profiles set membership='member' where id=p_person and membership='newcomer'; end if;
    -- A member, promoted just now or earlier with set_membership, takes a member seat rather than a traveller one.
    update public.bookings set pool='circle' where session_id=p_session and user_id=p_person and status='pending'
      and exists(select 1 from public.profiles where id=p_person and membership in ('member','organizer'));
    perform public.rebalance(p_session);
  end if;
  -- The traveller's own request is seated first, then the friends in the order they were added.
  for b in select * from public.bookings where session_id=p_session and status='pending' and (user_id=p_person or sponsor_id=p_person)
    order by user_id is null,created_at,id for update
  loop
    result=case when not p_approve then 'declined' when public.seat_available(p_session,b.pool) then 'confirmed' else 'waitlisted' end;
    update public.bookings set status=result,offer_expires_at=null where id=b.id;
    if b.user_id is not null then own_result=result; else friends=friends||b.guest_name; end if;
    lines=lines||(coalesce(b.guest_name,'Toi')||' : '||case result when 'confirmed' then 'place confirmée' when 'waitlisted' then 'liste d’attente' else 'non retenu·e' end);
  end loop;
  -- Without a request of their own (already registered, or not coming), the sponsor is told about the friends alone.
  perform public.notify(p_person,p_session,
    case when own_result is null then case when p_approve then 'Demande validée pour ' else 'Demande refusée pour ' end||array_to_string(friends,' et ')
      when not p_approve then 'Participation non retenue' when own_result='confirmed' then 'Bienvenue, ta place est confirmée !'
      else 'Demande validée, tu es en attente' end,
    array_to_string(lines,E'\n')||case when p_approve then E'\nRetrouve les détails dans la partie.' else E'\nContacte un organisateur si tu as une question.' end);
  perform public.rebalance(p_session);
  return coalesce(own_result,case when p_approve then 'confirmed' else 'declined' end);
end; $$;

create function public.remove_guest(p_booking uuid) returns void language plpgsql security definer set search_path='' as $$
declare b public.bookings;
begin
  perform public.rate_guard('booking',20,600);
  select * into b from public.bookings where id=p_booking;
  if b.id is null or b.sponsor_id is distinct from auth.uid() then raise exception 'Action non autorisée.'; end if;
  perform 1 from public.sessions where id=b.session_id for update;
  select * into b from public.bookings where id=p_booking for update;
  if b.status in ('cancelled','declined') then return; end if;
  update public.bookings set status='cancelled',offer_expires_at=null where id=b.id;
  perform public.rebalance(b.session_id);
end; $$;

create function public.accept_guest_offer(p_booking uuid) returns text language plpgsql security definer set search_path='' as $$
declare b public.bookings; s public.sessions;
begin
  perform public.rate_guard('booking',20,600);
  select * into b from public.bookings where id=p_booking;
  if b.id is null or b.sponsor_id is distinct from auth.uid() then raise exception 'Action non autorisée.'; end if;
  select * into s from public.sessions where id=b.session_id for update;
  if s.status<>'published' or s.starts_at<=now() then raise exception 'Cette session est close.'; end if;
  select * into b from public.bookings where id=p_booking for update;
  if b.status<>'offered' or b.offer_expires_at<=now() then raise exception 'Cette proposition a expiré.'; end if;
  update public.bookings set status='confirmed',offer_expires_at=null where id=b.id;
  return 'confirmed';
end; $$;

revoke execute on function public.review_request(uuid,uuid,boolean,boolean),public.remove_guest(uuid),public.accept_guest_offer(uuid) from public,anon,authenticated;
grant execute on function public.review_request(uuid,uuid,boolean,boolean),public.remove_guest(uuid),public.accept_guest_offer(uuid) to authenticated,service_role;

create or replace function public.save_session(p_data jsonb) returns uuid language plpgsql security definer set search_path = '' as $$
declare sid uuid; occupied integer;
begin
  if not public.is_organizer() then raise exception 'Accès organisateur requis.'; end if;
  p_data=jsonb_build_object('capacity',15)||p_data;
  if (p_data->>'starts_at')::timestamptz<=now() then raise exception 'Choisis une date à venir.'; end if;
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
      location=p_data->>'location',capacity=(p_data->>'capacity')::integer,
      newcomer_seats=(p_data->>'newcomer_seats')::integer,release_hours=(p_data->>'release_hours')::integer,
      beginners_welcome=(p_data->>'beginners_welcome')::boolean,visibility=p_data->>'visibility' where id=sid;
    -- One message per person, naming the people they bring.
    insert into public.notifications(user_id,session_id,title,body)
      select recipient,sid,'Les informations de ta session ont changé','Consulte les nouveaux horaires et le lieu avant de venir.'||coalesce(' Préviens '||guests||'.','')
      from (select coalesce(user_id,sponsor_id) as recipient,string_agg(guest_name,' et ' order by guest_name) filter(where user_id is null) as guests
        from public.bookings where session_id=sid and status in ('confirmed','offered','waitlisted','pending') group by 1) recipients;
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

create or replace function public.cancel_session(p_id uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_organizer() then raise exception 'Accès organisateur requis.'; end if;
  perform 1 from public.sessions where id=p_id and status='published' for update;
  if not found then return; end if;
  update public.sessions set status='cancelled' where id=p_id;
  insert into public.notifications(user_id,session_id,title,body,dedupe_key)
    select recipient,p_id,'La session a été annulée','L’organisateur a annulé cette soirée.'||coalesce(' Préviens '||guests||'.','')||' Rendez-vous sur le site pour trouver une autre date.','cancel:'||p_id||':'||recipient
    from (select coalesce(user_id,sponsor_id) as recipient,string_agg(guest_name,' et ' order by guest_name) filter(where user_id is null) as guests
      from public.bookings where session_id=p_id and status in ('pending','confirmed','waitlisted','offered') group by 1) recipients
    on conflict(dedupe_key) do nothing;
  update public.bookings set status='cancelled',offer_expires_at=null where session_id=p_id and status<>'declined';
end; $$;

create or replace function public.set_membership(p_user uuid,p_status text) returns void language plpgsql security definer set search_path = '' as $$
declare sid uuid;
begin
  if not public.is_organizer() or p_user=auth.uid() or p_status not in ('member','suspended') then raise exception 'Action non autorisée.'; end if;
  if exists(select 1 from public.profiles where id=p_user and membership='organizer') then raise exception 'Un autre organisateur ne peut pas être suspendu ici.'; end if;
  update public.profiles set membership=p_status where id=p_user;
  if p_status='suspended' then
    -- A suspended sponsor no longer vouches for the people they bring.
    for sid in select distinct session_id from public.bookings where (user_id=p_user or sponsor_id=p_user) and status in ('confirmed','offered','pending','waitlisted') order by session_id
    loop
      perform 1 from public.sessions where id=sid for update;
      update public.bookings set status='cancelled',offer_expires_at=null
        where session_id=sid and (user_id=p_user or sponsor_id=p_user) and status in ('confirmed','offered','pending','waitlisted');
      perform public.rebalance(sid);
    end loop;
  end if;
end; $$;

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
  delete from public.action_limits where window_start<now()-interval '2 days';
end; $$;

-- Same as the first migration, except the pending message: travellers are reviewed for every game.
create or replace function public.book_session(p_id uuid) returns text language plpgsql security definer set search_path = '' as $$
declare s public.sessions; p public.profiles; existing public.bookings; result text; target_pool text;
begin
  perform public.rate_guard('booking',20,600);
  select * into p from public.profiles where id=auth.uid();
  select * into s from public.sessions where id=p_id for update;
  if s.id is null or not public.can_see_session(p_id) then raise exception 'Cette session est inaccessible.'; end if;
  if s.status<>'published' or s.starts_at<=now()+interval '30 minutes' then raise exception 'Les inscriptions sont closes.'; end if;
  select * into existing from public.bookings where session_id=p_id and user_id=auth.uid();
  if existing.status in ('pending','confirmed','waitlisted','offered') then return existing.status; end if;
  if existing.status='declined' then raise exception 'Contacte un organisateur pour cette session.'; end if;
  perform public.rebalance(p_id);
  target_pool=case when p.membership='newcomer' then 'newcomer' else 'circle' end;
  result=case when p.membership='newcomer' then 'pending' when public.seat_available(p_id,target_pool) then 'confirmed' else 'waitlisted' end;
  insert into public.bookings(session_id,user_id,status,pool) values(p_id,auth.uid(),result,target_pool)
    on conflict(session_id,user_id) do update set status=excluded.status,pool=excluded.pool,created_at=now(),offer_expires_at=null;
  perform public.notify(auth.uid(),p_id,
    case result when 'confirmed' then 'Ta place est réservée' when 'pending' then 'Demande envoyée' else 'Tu es sur la liste d’attente' end,
    case result when 'confirmed' then 'Retrouve les informations pratiques dans ta session.' when 'pending' then 'Un organisateur va valider ta demande.' else 'Nous te proposerons une place dès qu’elle se libère.' end);
  return result;
end; $$;
