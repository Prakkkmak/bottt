-- One waiting list for everyone, in arrival order, instead of organizers validating travellers.
-- Members, travellers and the people they bring take any free token while one remains, then join the list;
-- a freed token goes straight to the first person waiting, who gets an e-mail instead of an offer to confirm.
-- Additive: the site deployed before this migration keeps working until Vercel ships the matching code.

-- A single pool. The newcomer_seats and release_hours columns stay for the previous site but no longer limit anyone,
-- and the pool of a booking now only says who came: a traveller, a traveller's friend, a member or a member's guest.
create or replace function public.seat_available(p_id uuid,p_pool text) returns boolean language sql security definer set search_path = '' as $$
  select (select count(*) from public.bookings where session_id=p_id and (status='confirmed' or (status='offered' and offer_expires_at>now())))
    < (select capacity from public.sessions where id=p_id);
$$;

-- Place in the queue of a waitlisted booking, 1 for the next person to get a token.
create function public.waitlist_position(p_booking uuid) returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.bookings w join public.bookings b on b.id=p_booking
  where w.session_id=b.session_id and w.status='waitlisted' and (w.created_at,w.id)<=(b.created_at,b.id);
$$;
revoke execute on function public.waitlist_position(uuid) from public,anon,authenticated;
grant execute on function public.waitlist_position(uuid) to service_role;

-- Each freed token goes to the first person waiting, guests included, without an offer to accept.
create or replace function public.rebalance(p_id uuid) returns void language plpgsql security definer set search_path = '' as $$
declare s public.sessions; b public.bookings;
begin
  select * into s from public.sessions where id=p_id for update;
  if s.id is null or s.status<>'published' then return; end if;
  -- Offers made before this migration still run out; no new ones are made.
  for b in update public.bookings set status='cancelled',offer_expires_at=null
    where session_id=p_id and status='offered' and offer_expires_at<=now() returning *
  loop
    if b.user_id is null then perform public.notify(b.sponsor_id,p_id,'La proposition pour '||b.guest_name||' a expiré','Le délai est passé. Tu peux l’ajouter à nouveau à la liste d’attente.');
    else perform public.notify(b.user_id,p_id,'La proposition a expiré','Le délai est passé. Tu peux rejoindre à nouveau la liste d’attente.'); end if;
  end loop;
  -- Nobody is moved in at the last minute, when registrations are closed too.
  if s.starts_at<=now()+interval '30 minutes' then return; end if;
  for b in select * from public.bookings where session_id=p_id and status='waitlisted' order by created_at,id for update
  loop
    exit when not public.seat_available(p_id,b.pool);
    update public.bookings set status='confirmed',offer_expires_at=null where id=b.id;
    if b.user_id is null then perform public.notify(b.sponsor_id,p_id,'Une place s’est libérée pour '||b.guest_name,
      b.guest_name||' était sur la liste d’attente : sa place est confirmée. Préviens-le·la, et libère sa place depuis le site si son programme change.');
    else perform public.notify(b.user_id,p_id,'Une place s’est libérée : tu es inscrit·e',
      'Tu étais sur la liste d’attente : ta place est confirmée. Un empêchement ? Libère-la depuis le site pour la personne suivante.'); end if;
  end loop;
end; $$;

-- Travellers book like members: a token while one is free, the waiting list otherwise.
create or replace function public.book_session(p_id uuid) returns text language plpgsql security definer set search_path = '' as $$
declare s public.sessions; p public.profiles; existing public.bookings; result text; target_pool text; booked uuid;
begin
  perform public.rate_guard('booking',20,600);
  select * into p from public.profiles where id=auth.uid();
  select * into s from public.sessions where id=p_id for update;
  if s.id is null or not public.can_see_session(p_id) then raise exception 'Cette session est inaccessible.'; end if;
  if s.status<>'published' or s.starts_at<=now()+interval '30 minutes' then raise exception 'Les inscriptions sont closes.'; end if;
  select * into existing from public.bookings where session_id=p_id and user_id=auth.uid();
  if existing.status in ('pending','confirmed','waitlisted','offered') then return existing.status; end if;
  if existing.status='declined' then raise exception 'Contacte un organisateur pour cette session.'; end if;
  -- People already waiting move in first, so that nobody jumps the queue.
  perform public.rebalance(p_id);
  target_pool=case when p.membership='newcomer' then 'newcomer' else 'circle' end;
  result=case when public.seat_available(p_id,target_pool) then 'confirmed' else 'waitlisted' end;
  -- Joining again after a withdrawal puts the person at the end of the list.
  insert into public.bookings(session_id,user_id,status,pool) values(p_id,auth.uid(),result,target_pool)
    on conflict(session_id,user_id) do update set status=excluded.status,pool=excluded.pool,created_at=now(),offer_expires_at=null
    returning id into booked;
  if result='confirmed' then
    perform public.notify(auth.uid(),p_id,'Ta place est réservée',
      'Ton inscription est confirmée. Un empêchement ? Libère ta place depuis le site : elle reviendra à la première personne de la liste d’attente.');
  else
    perform public.notify(auth.uid(),p_id,'Tu es sur la liste d’attente',
      'La partie est complète : tu es n° '||public.waitlist_position(booked)||' sur la liste d’attente. Si une place se libère, elle est à toi automatiquement et tu recevras un e-mail de confirmation.');
  end if;
  return result;
end; $$;

-- Same limits as before: a traveller brings 2 people in all, a member as many as tokens allow and then 2 waiting.
-- Nobody waits for an organizer any more, and the sponsor gets an e-mail for each person they add.
create or replace function public.add_guest(p_session uuid,p_name text,p_seat integer default null) returns text language plpgsql security definer set search_path='' as $$
declare s public.sessions; p public.profiles; existing public.bookings; clean text; guest_pool text; result text; brought integer; added uuid;
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
  guest_pool=case when p.membership in ('member','organizer') then 'circle' else 'newcomer' end;
  if guest_pool='newcomer' then
    select count(*) into brought from public.bookings where session_id=p_session and sponsor_id=auth.uid() and status in ('pending','confirmed','waitlisted','offered');
    if brought>=2 then raise exception 'Tu amènes déjà 2 personnes à cette partie.'; end if;
  end if;
  perform public.rebalance(p_session);
  if p_seat is not null and exists(select 1 from public.bookings where session_id=p_session and seat_index=p_seat and status in ('confirmed','offered')) then
    raise exception 'Cette place vient d’être prise. Choisis un autre +.';
  end if;
  if guest_pool='circle' and not public.seat_available(p_session,guest_pool) and (select count(*) from public.bookings
    where session_id=p_session and sponsor_id=auth.uid() and status in ('waitlisted','offered'))>=2 then
    raise exception 'La partie est complète : tu as déjà 2 personnes en liste d’attente.';
  end if;
  result=case when public.seat_available(p_session,guest_pool) then 'confirmed' else 'waitlisted' end;
  insert into public.bookings(session_id,guest_name,sponsor_id,status,pool,preferred_seat,seat_index)
    values(p_session,clean,auth.uid(),result,guest_pool,p_seat,case when result='confirmed' then p_seat end) returning id into added;
  if result='confirmed' then
    perform public.notify(auth.uid(),p_session,clean||' a sa place',
      'Son inscription est confirmée. Transmets-lui l’heure et le lieu, et libère sa place depuis le site si son programme change.');
  else
    perform public.notify(auth.uid(),p_session,clean||' est sur la liste d’attente',
      'La partie est complète : '||clean||' est n° '||public.waitlist_position(added)||' sur la liste d’attente. Si une place se libère, elle lui revient automatiquement et tu recevras un e-mail de confirmation.');
  end if;
  return result;
end; $$;

-- Every free token is open to everyone, so both counts are the same; both stay for the previous site.
-- Waiting people see their place in the queue, and the people they bring theirs.
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
          where b.session_id=s.id and b.status='confirmed') else '[]'::jsonb end
    ) as payload
    from public.sessions s
    cross join lateral (select count(*) as total_used from public.bookings b
      where b.session_id=s.id and (b.status='confirmed' or (b.status='offered' and b.offer_expires_at>now()))) used
    where public.can_see_session(s.id) and (s.ends_at>now()-interval '30 days' or public.is_organizer())
  ) listed;
$$;

-- Same as the venues migration, except that the people registered only hear about a change of date or place:
-- now that the messages leave by e-mail, renaming a game or adding seats should not write to everyone.
create or replace function public.save_session(p_data jsonb) returns uuid language plpgsql security definer set search_path = '' as $$
declare sid uuid; occupied integer; v public.venues; previous public.sessions; previous_address text;
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
    -- One message per person, naming the people they bring.
    if previous.starts_at is distinct from (p_data->>'starts_at')::timestamptz or previous.location is distinct from p_data->>'location'
      or coalesce(previous_address,'') is distinct from coalesce(p_data->>'address','') then
      insert into public.notifications(user_id,session_id,title,body)
        select recipient,sid,'Les informations de ta session ont changé','Consulte les nouveaux horaires et le lieu avant de venir.'||coalesce(' Préviens '||guests||'.','')
        from (select coalesce(user_id,sponsor_id) as recipient,string_agg(guest_name,' et ' order by guest_name) filter(where user_id is null) as guests
          from public.bookings where session_id=sid and status in ('confirmed','offered','waitlisted','pending') group by 1) recipients;
    end if;
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

-- Same as the ranks migration, with welcome messages that no longer mention a validation.
create or replace function public.set_membership(p_user uuid,p_status text) returns void language plpgsql security definer set search_path = '' as $$
declare sid uuid; previous text;
begin
  if not public.is_organizer() or p_user=auth.uid() or p_status not in ('newcomer','member','organizer','suspended') then raise exception 'Action non autorisée.'; end if;
  select membership into previous from public.profiles where id=p_user for update;
  if previous is null then raise exception 'Ce compte est introuvable.'; end if;
  if previous='organizer' then raise exception 'Le rang d’un autre organisateur ne se change pas ici.'; end if;
  -- Organizers are chosen among members, so that a suspended account cannot be brought back straight to organizer.
  if p_status='organizer' and previous<>'member' then raise exception 'Passe d’abord ce compte membre.'; end if;
  -- Suspending again still releases places, for an account suspended directly in the database.
  if previous=p_status and p_status<>'suspended' then return; end if;
  -- Bookings already made keep their seat; the new rank applies to the next ones.
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
  elsif p_status='newcomer' then
    -- A traveller cannot see members-only games: their places there, and their guests', are released.
    for sid in select distinct b.session_id from public.bookings b join public.sessions s on s.id=b.session_id
      where (b.user_id=p_user or b.sponsor_id=p_user) and b.status in ('confirmed','offered','pending','waitlisted')
        and s.visibility='members' and s.status='published' and s.starts_at>now() order by b.session_id
    loop
      perform 1 from public.sessions where id=sid for update;
      update public.bookings set status='cancelled',offer_expires_at=null
        where session_id=sid and (user_id=p_user or sponsor_id=p_user) and status in ('confirmed','offered','pending','waitlisted');
      perform public.notify(p_user,sid,'Ta participation a été retirée','Cette partie est réservée aux membres. Contacte un organisateur si tu as une question.');
      perform public.rebalance(sid);
    end loop;
  elsif p_status='member' and previous='newcomer' then
    perform public.notify(p_user,null,'Bienvenue parmi les membres','Tu vois désormais les parties réservées aux membres, tu amènes autant d’invité·es que les places le permettent et tu peux faire entrer tes ami·es dans le cercle.','welcome:'||p_user);
  elsif p_status='organizer' then
    perform public.notify(p_user,null,'Tu rejoins l’organisation','L’espace « Organiser » est ouvert sur le site : tu peux créer des parties, gérer les participants et les membres.','organizer:'||p_user);
  end if;
end; $$;

-- The e-mail names the game, its date and its place, read here so that the site needs no second query.
drop function public.claim_emails();
create function public.claim_emails() returns table(id uuid,email text,title text,body text,session_id uuid,
  session_title text,session_script text,session_starts_at timestamptz,session_location text) language sql security definer set search_path = '' as $$
  with picked as (select n.id from public.notifications n where emailed_at is null and email_attempts<5 and (claimed_until is null or claimed_until<now()) order by created_at for update skip locked limit 30),
  claimed as (update public.notifications n set claimed_until=now()+interval '5 minutes',email_attempts=email_attempts+1 from picked where n.id=picked.id returning n.*)
  select c.id,u.email,c.title,c.body,c.session_id,s.title,s.script,s.starts_at,s.location
  from claimed c join auth.users u on u.id=c.user_id left join public.sessions s on s.id=c.session_id;
$$;
revoke execute on function public.claim_emails() from public,anon,authenticated;
grant execute on function public.claim_emails() to service_role;

-- Messages are now sent right after each action. Those queued more than an hour ago, while no sender ran,
-- are out of date: they are dropped rather than sent late.
update public.notifications set email_attempts=5 where emailed_at is null and email_attempts<5 and created_at<now()-interval '1 hour';

-- Upcoming games switch over now. An offer still open becomes a confirmed seat, like a move up the queue today;
-- requests waiting for an organizer join the queue at the time they were made, then the free tokens are given out in order.
do $$
declare sid uuid; b public.bookings; waiting uuid[];
begin
  for sid in select distinct bk.session_id from public.bookings bk join public.sessions s on s.id=bk.session_id
    where bk.status in ('pending','offered','waitlisted') and s.status='published' and s.starts_at>now() order by 1
  loop
    perform 1 from public.sessions where id=sid for update;
    for b in update public.bookings set status='confirmed',offer_expires_at=null
      where session_id=sid and status='offered' and offer_expires_at>now() returning *
    loop
      if b.user_id is null then perform public.notify(b.sponsor_id,sid,b.guest_name||' a sa place','La place proposée pour '||b.guest_name||' est confirmée, sans autre démarche.');
      else perform public.notify(b.user_id,sid,'Ta place est confirmée','La place qui t’était proposée est confirmée, sans autre démarche. Un empêchement ? Libère-la depuis le site.'); end if;
    end loop;
    select array_agg(id) into waiting from public.bookings where session_id=sid and status='pending';
    update public.bookings set status='waitlisted' where session_id=sid and status='pending';
    perform public.rebalance(sid);
    for b in select * from public.bookings where id=any(coalesce(waiting,'{}')) and status='waitlisted' order by created_at,id
    loop
      if b.user_id is null then perform public.notify(b.sponsor_id,sid,b.guest_name||' est sur la liste d’attente',
        'Plus besoin de validation : la partie est complète et '||b.guest_name||' est n° '||public.waitlist_position(b.id)||' sur la liste d’attente. Si une place se libère, elle lui revient automatiquement.');
      else perform public.notify(b.user_id,sid,'Tu es sur la liste d’attente',
        'Plus besoin de validation : la partie est complète et tu es n° '||public.waitlist_position(b.id)||' sur la liste d’attente. Si une place se libère, elle est à toi automatiquement.'); end if;
    end loop;
  end loop;
end $$;
