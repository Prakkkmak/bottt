-- Each player chooses the e-mails they receive. Every message now carries a kind: the ones that tell someone whether and
-- where to come (a seat from the waiting list, an organizer's decision, a game moved or cancelled, a new rank) always
-- leave; the others can be switched off, or on for those that start off. Two kinds are new: a game opening (new_game)
-- and, for an organizer, people joining or leaving a game they created (activity). 'announcement' is kept for messages
-- an organizer will send to everyone.

create table public.notification_kinds(
  kind text primary key,
  -- false: always sent, whatever the person chose.
  optional boolean not null,
  -- What someone who never chose gets.
  default_on boolean not null
);
insert into public.notification_kinds(kind,optional,default_on) values
  -- Receipts of what the person did: registered, brought someone, joined or left the waiting list, withdrew.
  ('booking',true,true),
  -- Less than 24 hours before a game where the person or someone they bring has a seat.
  ('reminder',true,true),
  -- An organizer writing to the people registered for a game (send_session_message).
  ('message',true,true),
  -- An organizer writing to everyone.
  ('announcement',true,true),
  -- A game opens; for a recurring game, its first date only.
  ('new_game',true,false),
  -- Someone joins or leaves a game the organizer created.
  ('activity',true,false),
  -- A seat from the waiting list, or an offer that ran out.
  ('waitlist',false,true),
  -- An organizer approved, refused or removed someone, or a rank change released a members-only seat.
  ('review',false,true),
  ('change',false,true),
  ('cancel',false,true),
  ('account',false,true),
  -- Anything a writer did not sort: sent, so that nothing is lost.
  ('other',false,true);

-- One row per choice made; a kind without a row keeps its default.
create table public.notification_choices(
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null references public.notification_kinds(kind),
  enabled boolean not null,
  updated_at timestamptz not null default now(),
  primary key(user_id,kind)
);
-- The people who asked for a kind that starts off, such as new games.
create index notification_choices_enabled on public.notification_choices(kind) where enabled;
alter table public.notification_kinds enable row level security;
alter table public.notification_choices enable row level security;
create policy notification_choices_read on public.notification_choices for select to authenticated using (user_id=auth.uid() and public.active_user());
revoke all on public.notification_kinds,public.notification_choices from public,anon,authenticated;
-- Choices are read by their owner and written through save_notification_choices only.
grant select(kind,enabled) on public.notification_choices to authenticated;
grant all on public.notification_kinds,public.notification_choices to service_role;

-- Existing messages are sorted by what they carry; those left over are always sent.
alter table public.notifications add column kind text references public.notification_kinds(kind);
update public.notifications set kind=case when changes<>'[]'::jsonb then 'change' when sender_id is not null then 'message'
  when dedupe_key like 'reminder:%' then 'reminder' when dedupe_key like 'cancel:%' then 'cancel'
  when dedupe_key like 'welcome:%' or dedupe_key like 'organizer:%' then 'account' else 'other' end;
alter table public.notifications alter column kind set not null;
grant select(kind) on public.notifications to authenticated;

-- Whether this person gets this kind of message by e-mail. An unknown kind is sent.
create function public.wants_email(p_user uuid,p_kind text) returns boolean language sql stable security definer set search_path='' as $$
  select coalesce((select not k.optional or coalesce(c.enabled,k.default_on)
    from public.notification_kinds k left join public.notification_choices c on c.user_id=p_user and c.kind=k.kind
    where k.kind=p_kind),true);
$$;

-- Every writer goes through here: a message of a kind the person switched off is not kept at all. A writer that names no
-- kind (cancel_session, maintenance's reminders, notify_session_change, a later change note) is sorted by what it writes.
create function public.sort_notification() returns trigger language plpgsql security definer set search_path='' as $$
declare fields jsonb=to_jsonb(new);
begin
  new.kind=coalesce(new.kind,case when new.changes<>'[]'::jsonb or fields->>'note' is not null then 'change'
    when new.sender_id is not null then 'message' when new.dedupe_key like 'reminder:%' then 'reminder'
    when new.dedupe_key like 'cancel:%' then 'cancel' else 'other' end);
  if not public.wants_email(new.user_id,new.kind) then return null; end if;
  return new;
end; $$;
create trigger notifications_sort before insert on public.notifications for each row execute function public.sort_notification();

-- Saves the switches of the profile page: {kind: true|false}, optional kinds only.
create function public.save_notification_choices(p_choices jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
  perform public.rate_guard('notification_choices',30,600);
  if jsonb_typeof(p_choices) is distinct from 'object' or exists(select 1 from jsonb_each(p_choices) e
      left join public.notification_kinds k on k.kind=e.key where k.kind is null or not k.optional or jsonb_typeof(e.value)<>'boolean') then
    raise exception 'Ces choix de notifications sont invalides. Recharge la page et réessaie.';
  end if;
  insert into public.notification_choices(user_id,kind,enabled)
    select auth.uid(),e.key,e.value::boolean from jsonb_each(p_choices) e
    on conflict(user_id,kind) do update set enabled=excluded.enabled,updated_at=now();
end; $$;

-- The same helper, with the kind of the message.
drop function public.notify(uuid,uuid,text,text,text);
create function public.notify(p_user uuid,p_session uuid,p_title text,p_body text,p_key text default null,p_kind text default null) returns void language sql security definer set search_path = '' as $$
  insert into public.notifications(user_id,session_id,title,body,dedupe_key,kind) values(p_user,p_session,p_title,p_body,p_key,p_kind) on conflict(dedupe_key) do nothing;
$$;

-- The functions below are those of the waitlist and guests migrations, each message now naming its kind.
create or replace function public.rebalance(p_id uuid) returns void language plpgsql security definer set search_path = '' as $$
declare s public.sessions; b public.bookings;
begin
  select * into s from public.sessions where id=p_id for update;
  if s.id is null or s.status<>'published' then return; end if;
  -- Offers made before this migration still run out; no new ones are made.
  for b in update public.bookings set status='cancelled',offer_expires_at=null
    where session_id=p_id and status='offered' and offer_expires_at<=now() returning *
  loop
    if b.user_id is null then perform public.notify(b.sponsor_id,p_id,'La proposition pour '||b.guest_name||' a expiré','Le délai est passé. Tu peux l’ajouter à nouveau à la liste d’attente.',p_kind=>'waitlist');
    else perform public.notify(b.user_id,p_id,'La proposition a expiré','Le délai est passé. Tu peux rejoindre à nouveau la liste d’attente.',p_kind=>'waitlist'); end if;
  end loop;
  -- Nobody is moved in at the last minute, when registrations are closed too.
  if s.starts_at<=now()+interval '30 minutes' then return; end if;
  for b in select * from public.bookings where session_id=p_id and status='waitlisted' order by created_at,id for update
  loop
    exit when not public.seat_available(p_id,b.pool);
    update public.bookings set status='confirmed',offer_expires_at=null where id=b.id;
    if b.user_id is null then perform public.notify(b.sponsor_id,p_id,'Une place s’est libérée pour '||b.guest_name,
      b.guest_name||' était sur la liste d’attente : sa place est confirmée. Préviens-le·la, et libère sa place depuis le site si son programme change.',p_kind=>'waitlist');
    else perform public.notify(b.user_id,p_id,'Une place s’est libérée : tu es inscrit·e',
      'Tu étais sur la liste d’attente : ta place est confirmée. Un empêchement ? Libère-la depuis le site pour la personne suivante.',p_kind=>'waitlist'); end if;
  end loop;
end; $$;

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
      'Ton inscription est confirmée. Un empêchement ? Libère ta place depuis le site : elle reviendra à la première personne de la liste d’attente.',p_kind=>'booking');
  else
    perform public.notify(auth.uid(),p_id,'Tu es sur la liste d’attente',
      'La partie est complète : tu es n° '||public.waitlist_position(booked)||' sur la liste d’attente. Si une place se libère jusqu’à 30 minutes avant le début, elle est à toi automatiquement et tu recevras un e-mail de confirmation.',p_kind=>'booking');
  end if;
  return result;
end; $$;

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
      'Son inscription est confirmée. Transmets-lui l’heure et le lieu, et libère sa place depuis le site si son programme change.',p_kind=>'booking');
  else
    perform public.notify(auth.uid(),p_session,clean||' est sur la liste d’attente',
      'La partie est complète : '||clean||' est n° '||public.waitlist_position(added)||' sur la liste d’attente. Si une place se libère jusqu’à 30 minutes avant le début, elle lui revient automatiquement et tu recevras un e-mail de confirmation.',p_kind=>'booking');
  end if;
  return result;
end; $$;

create or replace function public.accept_offer(p_id uuid) returns text language plpgsql security definer set search_path = '' as $$
declare b public.bookings; s public.sessions;
begin
  perform public.rate_guard('booking',20,600);
  select * into s from public.sessions where id=p_id for update;
  if s.status<>'published' or s.starts_at<=now() then raise exception 'Cette session est close.'; end if;
  select * into b from public.bookings where session_id=p_id and user_id=auth.uid() for update;
  if b.status<>'offered' or b.offer_expires_at<=now() or b.id is null then raise exception 'Cette proposition a expiré.'; end if;
  update public.bookings set status='confirmed',offer_expires_at=null where id=b.id;
  perform public.notify(auth.uid(),p_id,'Ta place est confirmée','À très vite au village !',p_kind=>'booking');
  return 'confirmed';
end; $$;

create or replace function public.cancel_booking(p_id uuid) returns void language plpgsql security definer set search_path = '' as $$
declare b public.bookings;
begin
  perform public.rate_guard('booking',20,600);
  perform 1 from public.sessions where id=p_id for update;
  select * into b from public.bookings where session_id=p_id and user_id=auth.uid();
  if b.id is null or b.status in ('cancelled','declined') then return; end if;
  update public.bookings set status='cancelled',offer_expires_at=null where id=b.id;
  perform public.notify(auth.uid(),p_id,'Désistement enregistré','Merci de nous avoir prévenus. À une prochaine soirée !',p_kind=>'booking');
  perform public.rebalance(p_id);
end; $$;

create or replace function public.leave_session(p_id uuid,p_guests uuid[] default '{}') returns void language plpgsql security definer set search_path = '' as $$
declare b public.bookings;
begin
  perform public.rate_guard('booking',20,600);
  perform 1 from public.sessions where id=p_id for update;
  if exists(select 1 from unnest(coalesce(p_guests,'{}')) g(id) where not exists(select 1 from public.bookings
    where bookings.id=g.id and session_id=p_id and sponsor_id=auth.uid())) then raise exception 'Action non autorisée.'; end if;
  update public.bookings set status='cancelled',offer_expires_at=null where id=any(p_guests) and status not in ('cancelled','declined');
  select * into b from public.bookings where session_id=p_id and user_id=auth.uid();
  if b.id is not null and b.status not in ('cancelled','declined') then
    update public.bookings set status='cancelled',offer_expires_at=null where id=b.id;
    if b.status='waitlisted' then perform public.notify(auth.uid(),p_id,'Tu as quitté la liste d’attente','Tu peux t’y inscrire à nouveau depuis le site, à la fin de la liste.',p_kind=>'booking');
    else perform public.notify(auth.uid(),p_id,'Désistement enregistré','Merci de nous avoir prévenus. À une prochaine soirée !',p_kind=>'booking'); end if;
  end if;
  perform public.rebalance(p_id);
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
      case result when 'declined' then 'Contacte un organisateur si tu as une question.' else 'Retrouve les détails dans la partie.' end,p_kind=>'review');
  else
    perform public.notify(b.user_id,b.session_id,
      case result when 'confirmed' then 'Bienvenue, ta place est confirmée !' when 'waitlisted' then 'Demande validée, tu es en attente' else 'Participation non retenue' end,
      case result when 'declined' then 'Contacte un organisateur si tu as une question.' else 'Retrouve les détails dans la partie.' end,p_kind=>'review');
  end if;
  perform public.rebalance(b.session_id);
  return result;
end; $$;

create or replace function public.review_request(p_session uuid,p_person uuid,p_approve boolean,p_promote boolean default false) returns text language plpgsql security definer set search_path='' as $$
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
    array_to_string(lines,E'\n')||case when p_approve then E'\nRetrouve les détails dans la partie.' else E'\nContacte un organisateur si tu as une question.' end,p_kind=>'review');
  perform public.rebalance(p_session);
  return coalesce(own_result,case when p_approve then 'confirmed' else 'declined' end);
end; $$;

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
      perform public.notify(p_user,sid,'Ta participation a été retirée','Cette partie est réservée aux membres. Contacte un organisateur si tu as une question.',p_kind=>'review');
      perform public.rebalance(sid);
    end loop;
  elsif p_status='member' and previous='newcomer' then
    perform public.notify(p_user,null,'Bienvenue parmi les membres','Tu vois désormais les parties réservées aux membres, tu amènes autant d’invité·es que les places le permettent et tu peux faire entrer tes ami·es dans le cercle.','welcome:'||p_user,p_kind=>'account');
  elsif p_status='organizer' then
    perform public.notify(p_user,null,'Tu rejoins l’organisation','L’espace « Organiser » est ouvert sur le site : tu peux créer des parties, gérer les participants et les membres.','organizer:'||p_user,p_kind=>'account');
  end if;
end; $$;

-- As in the session message migration, the message being of kind 'message': it no longer reaches someone who switched
-- those off. Returns {sent, muted}: how many people it goes to, and how many registered people chose not to get it.
create function public.send_session_message_counts(p_session uuid,p_message text,p_waitlist boolean default true) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.sessions; clean text; sender text; registered integer; sent integer;
begin
  if not public.is_organizer() then raise exception 'Accès organisateur requis.'; end if;
  -- Line endings typed in a browser arrive as CRLF. Control characters and the direction marks that could disguise a link
  -- in a plain-text e-mail are dropped; spaces at both ends of the message are trimmed.
  clean=replace(replace(coalesce(p_message,''),E'\r\n',E'\n'),E'\r',E'\n');
  clean=btrim(regexp_replace(clean,'[\x01-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F‎‏‪-‮⁦-⁩]','','g'),E' \t\n');
  if char_length(clean) not between 2 and 2000 then raise exception 'Écris un message de 2 à 2000 caractères.'; end if;
  -- Shared with bookings, exclusive with cancel_session: a game cancelled meanwhile is seen as cancelled.
  select * into s from public.sessions where id=p_session for share;
  if s.id is null then raise exception 'Cette partie est introuvable.'; end if;
  if s.status<>'published' then raise exception 'Cette partie est annulée : ses inscrits en ont déjà été prévenus.'; end if;
  -- claim_emails sends nothing about a game that has started.
  if s.starts_at<=now() then raise exception 'Cette partie a commencé : un message n’arriverait plus à temps.'; end if;
  select count(distinct coalesce(user_id,sponsor_id)) into registered from public.bookings
    where session_id=p_session and (status in ('pending','confirmed','offered') or (p_waitlist and status='waitlisted')) and coalesce(user_id,sponsor_id)<>auth.uid();
  if registered=0 then raise exception 'Personne d’autre n’est inscrit à cette partie pour le moment.'; end if;
  -- Ten a day per organizer, so that a slip cannot flood the players. A refused message, here or below, rolls the count
  -- back with the rest of the call. rate_guard's own refusal speaks of minutes; this window is a day.
  begin
    perform public.rate_guard('session_message',10,86400);
  exception when raise_exception then
    raise exception 'Tu as déjà envoyé 10 messages aujourd’hui. Réessaie demain.';
  end;
  select display_name into sender from public.profiles where id=auth.uid();
  insert into public.notifications(user_id,session_id,title,body,sender_id,kind)
    select recipient,p_session,'Message de '||sender,clean||coalesce(E'\n\nTransmets ce message à '||guests||'.',''),auth.uid(),'message'
    from (select coalesce(user_id,sponsor_id) as recipient,string_agg(guest_name,' et ' order by guest_name) filter(where user_id is null) as guests
      from public.bookings where session_id=p_session and (status in ('pending','confirmed','offered') or (p_waitlist and status='waitlisted')) group by 1) listed
    where recipient<>auth.uid();
  get diagnostics sent=row_count;
  if sent=0 then raise exception 'Les inscrits de cette partie ont coupé les messages des organisateurs : ton message ne partirait à personne.'; end if;
  return jsonb_build_object('sent',sent,'muted',registered-sent);
end; $$;

-- The site already deployed reads a number: it keeps getting one, the count of people the message goes to.
create or replace function public.send_session_message(p_session uuid,p_message text,p_waitlist boolean default true) returns integer language sql security definer set search_path='' as $$
  select (public.send_session_message_counts(p_session,p_message,p_waitlist)->>'sent')::integer;
$$;

-- A game opening is told to the people who asked for it and may see it: members-only games to members and organizers.
-- A recurring game is told once, by its first date; the next ones open on their own, week after week. Ten a day at most
-- per person, so that a burst of new games, by mistake or not, cannot flood those who asked.
create function public.announce_session() returns trigger language plpgsql security definer set search_path='' as $$
declare series public.session_series; detail text;
begin
  -- Registrations close 30 minutes before the start: a game created later, or in the past, is not news.
  if new.status<>'published' or new.starts_at<=now()+interval '30 minutes' then return null; end if;
  if new.series_id is not null then
    -- extend_series marks a date as opened right after creating it: only the very first one finds nothing marked yet.
    select * into series from public.session_series where id=new.series_id;
    if series.generated_through is not null then return null; end if;
  end if;
  detail='Les inscriptions sont ouvertes : réserve ta place sur le site.'
    ||case series.every_weeks when 1 then ' Elle revient chaque semaine, les dates suivantes s’ouvrent au fur et à mesure.'
      when 2 then ' Elle revient toutes les deux semaines, les dates suivantes s’ouvrent au fur et à mesure.' else '' end
    ||case when new.visibility='members' then ' Elle est réservée aux membres et à leurs invité·es.' else '' end;
  insert into public.notifications(user_id,session_id,title,body,kind,dedupe_key)
    select c.user_id,new.id,'Nouvelle partie',detail,'new_game','new_game:'||new.id||':'||c.user_id
    from public.notification_choices c join public.profiles p on p.id=c.user_id
    where c.kind='new_game' and c.enabled and p.membership<>'suspended' and c.user_id is distinct from new.created_by
      and (new.visibility='public' or p.membership in ('member','organizer'))
      and (select count(*) from public.notifications n where n.user_id=c.user_id and n.kind='new_game' and n.created_at>now()-interval '1 day')<10
    on conflict(dedupe_key) do nothing;
  return null;
end; $$;
create trigger sessions_announce after insert on public.sessions for each row execute function public.announce_session();

-- The organizer who created a game hears about the people who join or leave it, when they asked for it. Only what players
-- do themselves: a seat passed on by the waiting list, an organizer's decision or a cancelled game is not news to them.
-- A name typed by a player, on one line: a line break or a direction mark must not forge a line, or disguise a link, in an e-mail.
create function public.plain_name(p_name text) returns text language sql immutable set search_path = '' as $$
  select btrim(regexp_replace(regexp_replace(coalesce(p_name,''),'[\u200E\u200F\u202A-\u202E\u2066-\u2069]','','g'),'[\s\x01-\x1F\x7F-\x9F\u2028\u2029]+',' ','g'));
$$;

-- claim_emails holds these messages a quarter of an hour, and the moves made meanwhile are added to the waiting one: someone
-- leaving with the people they bring, or joining and leaving again and again, makes one e-mail.
create function public.notify_organizer_activity() returns trigger language plpgsql security definer set search_path='' as $$
declare s public.sessions; actor uuid=auth.uid(); previous text; was_in boolean; is_in boolean; who text; line text;
begin
  if actor is null or actor is distinct from coalesce(new.user_id,new.sponsor_id) then return null; end if;
  if tg_op='UPDATE' then previous=old.status; end if;
  was_in=coalesce(previous in ('pending','confirmed','waitlisted','offered'),false);
  is_in=new.status in ('pending','confirmed','waitlisted','offered');
  if was_in=is_in then return null; end if;
  select * into s from public.sessions where id=new.session_id;
  if s.status<>'published' or s.starts_at<=now() or s.created_by is null or s.created_by=actor
    or not exists(select 1 from public.profiles where id=s.created_by and membership='organizer')
    or not public.wants_email(s.created_by,'activity') then return null; end if;
  select case when new.user_id is null then public.plain_name(new.guest_name)||', invité·e de '||public.plain_name(p.display_name)
    else public.plain_name(p.display_name) end into who from public.profiles p where p.id=actor;
  line=who||case when new.status='confirmed' then ' a pris une place.' when new.status='waitlisted' then ' est sur la liste d’attente.'
    when is_in then ' demande une place.' when previous='waitlisted' then ' a quitté la liste d’attente.' else ' a libéré sa place.' end;
  update public.notifications n set title='Inscriptions et désistements',body=n.body||E'\n'||line
    where n.user_id=s.created_by and n.session_id=s.id and n.kind='activity' and n.emailed_at is null and n.email_attempts=0 and n.claimed_until is null
      and n.created_at>now()-interval '1 hour' and char_length(n.body)<1500;
  if not found then
    insert into public.notifications(user_id,session_id,title,body,kind)
      values(s.created_by,s.id,case when is_in then 'Nouvelle inscription' else 'Désistement' end,line,'activity');
  end if;
  return null;
end; $$;
create trigger bookings_activity after insert or update of status on public.bookings for each row execute function public.notify_organizer_activity();

-- As in the change details migration, with the kind of each message, and the seats of the game for the kinds that show them.
-- What tells someone whether and where to come leaves first; new games, activity and announcements wait their turn, and the
-- activity of a game a quarter of an hour. A new game, or an organizer's activity, is checked again as it leaves: the game
-- still published, and the person still allowed to see it or still an organizer.
drop function public.claim_emails();
create function public.claim_emails() returns table(id uuid,email text,title text,body text,kind text,session_id uuid,
  session_title text,session_script text,session_starts_at timestamptz,session_location text,changes jsonb,
  session_capacity integer,session_taken integer,session_waiting integer) language sql security definer set search_path = '' as $$
  with picked as (select n.id from public.notifications n where emailed_at is null and email_attempts<5 and (claimed_until is null or claimed_until<now())
      -- A message that could not leave in time is out of date: never a day late, never once its game has started.
      and n.created_at>now()-interval '24 hours' and not exists(select 1 from public.sessions s where s.id=n.session_id and s.starts_at<=now())
      and (n.kind<>'activity' or n.created_at<=now()-interval '15 minutes')
      and (n.kind not in ('new_game','activity') or exists(select 1 from public.profiles p join public.sessions s on s.id=n.session_id
        where p.id=n.user_id and s.status='published' and case when n.kind='activity' then p.membership='organizer'
          else p.membership<>'suspended' and (s.visibility='public' or p.membership in ('member','organizer')) end))
    order by n.kind in ('new_game','activity','announcement'),n.created_at for update skip locked limit 30),
  claimed as (update public.notifications n set claimed_until=now()+interval '5 minutes',email_attempts=email_attempts+1 from picked where n.id=picked.id returning n.*)
  select c.id,u.email,c.title,c.body,c.kind,c.session_id,s.title,s.script,s.starts_at,s.location,c.changes,
    case when seats.shown then s.capacity end,
    case when seats.shown then (select count(*)::integer from public.bookings b where b.session_id=s.id and (b.status='confirmed' or (b.status='offered' and b.offer_expires_at>now()))) end,
    case when seats.shown then (select count(*)::integer from public.bookings b where b.session_id=s.id and b.status='waitlisted') end
  from claimed c join auth.users u on u.id=c.user_id left join public.sessions s on s.id=c.session_id
  cross join lateral (select s.id is not null and c.kind in ('new_game','activity') as shown) seats
  -- In the order written within each rank, so that a later message about a game never arrives first.
  order by c.kind in ('new_game','activity','announcement'),c.created_at,c.id;
$$;

-- Messages claimed but not tried, when the sender stops early (provider's rate limit, time running out), go back to the
-- outbox without spending one of their five attempts.
create function public.release_emails(p_ids uuid[]) returns void language sql security definer set search_path = '' as $$
  update public.notifications set claimed_until=null,email_attempts=greatest(email_attempts-1,0) where id=any(p_ids) and emailed_at is null and claimed_until is not null;
$$;

-- The outbox was read by its primary key alone: the activity merge, the daily cap of new games, the cascade of a deleted
-- game and the claim's scan of what is waiting each get an index.
create index notifications_user_created on public.notifications(user_id,created_at);
create index notifications_session on public.notifications(session_id);
create index notifications_waiting on public.notifications(created_at) where emailed_at is null;

revoke execute on function public.wants_email(uuid,text),public.sort_notification(),public.save_notification_choices(jsonb),
  public.notify(uuid,uuid,text,text,text,text),public.send_session_message(uuid,text,boolean),public.send_session_message_counts(uuid,text,boolean),public.announce_session(),
  public.notify_organizer_activity(),public.plain_name(text),public.claim_emails(),public.release_emails(uuid[]) from public,anon,authenticated;
grant execute on function public.save_notification_choices(jsonb),public.send_session_message(uuid,text,boolean),public.send_session_message_counts(uuid,text,boolean) to authenticated,service_role;
grant execute on function public.claim_emails(),public.release_emails(uuid[]) to service_role;
