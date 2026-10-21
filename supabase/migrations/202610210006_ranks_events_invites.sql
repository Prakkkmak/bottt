-- Experience level, unlimited guests for members, rank management, deleting a game and invitations sent by e-mail.
-- Additive: the site deployed before this migration keeps working until Vercel ships the matching code.

-- A three-step experience level replaces the beginner checkbox. `beginner` stays and follows `experience`
-- both ways, so the previous site, which only writes `beginner`, keeps a consistent profile.
alter table public.profiles add column experience text not null default 'beginner'
  check (experience in ('beginner','some','experienced'));
update public.profiles set experience=case when beginner then 'beginner' else 'some' end;
create function public.sync_experience() returns trigger language plpgsql set search_path='' as $$
begin
  if new.experience is distinct from old.experience then new.beginner=new.experience='beginner';
  elsif new.beginner is distinct from old.beginner then
    new.experience=case when new.beginner then 'beginner' when old.experience='beginner' then 'some' else old.experience end;
  end if;
  return new;
end; $$;
create trigger sync_experience before update of experience,beginner on public.profiles
  for each row execute function public.sync_experience();
revoke execute on function public.sync_experience() from public,anon,authenticated;
grant update(experience) on public.profiles to authenticated;

-- Members vouch for the people they bring, as many as member seats allow; travellers keep a limit of 2.
create or replace function public.add_guest(p_session uuid,p_name text,p_seat integer default null) returns text language plpgsql security definer set search_path='' as $$
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
  -- A member vouches for the guest; a traveller's friend waits for an organizer like the traveller.
  guest_pool=case when p.membership in ('member','organizer') then 'circle' else 'newcomer' end;
  if guest_pool='newcomer' then
    select count(*) into brought from public.bookings where session_id=p_session and sponsor_id=auth.uid() and status in ('pending','confirmed','waitlisted','offered');
    if brought>=2 then raise exception 'Tu amènes déjà 2 personnes à cette partie.'; end if;
  end if;
  perform public.rebalance(p_session);
  if p_seat is not null and exists(select 1 from public.bookings where session_id=p_session and seat_index=p_seat and status in ('confirmed','offered')) then
    raise exception 'Cette place vient d’être prise. Choisis un autre +.';
  end if;
  result=case when guest_pool='newcomer' then 'pending' when public.seat_available(p_session,guest_pool) then 'confirmed' else 'waitlisted' end;
  insert into public.bookings(session_id,guest_name,sponsor_id,status,pool,preferred_seat,seat_index)
    values(p_session,clean,auth.uid(),result,guest_pool,p_seat,case when result='confirmed' then p_seat end);
  return result;
end; $$;

-- Organizers move anyone between traveller, member and organizer, or suspend them.
-- Another organizer's rank, and one's own, still need an administrator access to the database.
create or replace function public.set_membership(p_user uuid,p_status text) returns void language plpgsql security definer set search_path = '' as $$
declare sid uuid; previous text;
begin
  if not public.is_organizer() or p_user=auth.uid() or p_status not in ('newcomer','member','organizer','suspended') then raise exception 'Action non autorisée.'; end if;
  select membership into previous from public.profiles where id=p_user for update;
  if previous is null then raise exception 'Ce compte est introuvable.'; end if;
  if previous='organizer' then raise exception 'Le rang d’un autre organisateur ne se change pas ici.'; end if;
  if previous=p_status then return; end if;
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
  elsif p_status='member' and previous='newcomer' then
    perform public.notify(p_user,null,'Bienvenue parmi les membres','Tu réserves désormais tes places sans validation et tu peux faire entrer tes ami·es dans le cercle.');
  elsif p_status='organizer' then
    perform public.notify(p_user,null,'Tu rejoins l’organisation','L’espace « Organiser » est ouvert sur le site : tu peux créer des parties, valider les demandes et gérer les membres.');
  end if;
end; $$;

-- A deleted game takes its bookings and address with it. Messages already queued about it,
-- such as the cancellation, still go out without the link.
alter table public.notifications drop constraint notifications_session_id_fkey;
alter table public.notifications add constraint notifications_session_id_fkey
  foreign key (session_id) references public.sessions(id) on delete set null;

-- The cancellation names the game, since the message can outlive it.
create or replace function public.cancel_session(p_id uuid) returns void language plpgsql security definer set search_path = '' as $$
declare s public.sessions;
begin
  if not public.is_organizer() then raise exception 'Accès organisateur requis.'; end if;
  select * into s from public.sessions where id=p_id and status='published' for update;
  if not found then return; end if;
  update public.sessions set status='cancelled' where id=p_id;
  insert into public.notifications(user_id,session_id,title,body,dedupe_key)
    select recipient,p_id,'La session a été annulée','L’organisateur a annulé la soirée « '||s.title||' ».'||coalesce(' Préviens '||guests||'.','')||' Rendez-vous sur le site pour trouver une autre date.','cancel:'||p_id||':'||recipient
    from (select coalesce(user_id,sponsor_id) as recipient,string_agg(guest_name,' et ' order by guest_name) filter(where user_id is null) as guests
      from public.bookings where session_id=p_id and status in ('pending','confirmed','waitlisted','offered') group by 1) recipients
    on conflict(dedupe_key) do nothing;
  update public.bookings set status='cancelled',offer_expires_at=null where session_id=p_id and status<>'declined';
end; $$;

create function public.delete_session(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare s public.sessions;
begin
  if not public.is_organizer() then raise exception 'Accès organisateur requis.'; end if;
  select * into s from public.sessions where id=p_id for update;
  if s.id is null then return; end if;
  -- People registered for an upcoming game hear about it through the cancellation first.
  if s.status='published' and s.ends_at>now() and exists(select 1 from public.bookings where session_id=p_id and status in ('pending','confirmed','waitlisted','offered')) then
    raise exception 'Des joueurs sont inscrits : annule d’abord la partie pour les prévenir.';
  end if;
  delete from public.sessions where id=p_id;
end; $$;

-- A member can send the sponsorship link by e-mail. The address is kept so the sponsor sees whom
-- they invited, then erased 30 days after the link stops working. The token itself is never stored.
alter table public.invitations add column sent_to text check (sent_to is null or char_length(sent_to) between 3 and 254);
grant select(sent_to) on public.invitations to authenticated;
create function public.create_email_invitation(p_email text) returns text language plpgsql security definer set search_path='' as $$
declare token text; clean text=lower(trim(coalesce(p_email,'')));
begin
  if not public.is_member() then raise exception 'Ta première participation doit être validée avant de parrainer.'; end if;
  if char_length(clean)>254 or clean !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'Cette adresse e-mail est invalide.'; end if;
  if exists(select 1 from auth.users where id=auth.uid() and lower(email)=clean) then raise exception 'C’est ta propre adresse : indique celle de la personne à inviter.'; end if;
  -- Shares the daily limit of sponsorship links.
  perform public.rate_guard('invitation',5,86400);
  token=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
  insert into public.invitations(sponsor_id,token_hash,sent_to) values(auth.uid(),encode(sha256(convert_to(token,'UTF8')),'hex'),clean);
  return token;
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
  -- Messages about a deleted game, or about no game at all, follow the same 30 days.
  delete from public.notifications where session_id is null and created_at<now()-interval '30 days';
  update public.invitations set sent_to=null where sent_to is not null and expires_at<now()-interval '30 days';
  delete from public.action_limits where window_start<now()-interval '2 days';
end; $$;

revoke execute on function public.delete_session(uuid),public.create_email_invitation(text) from public,anon,authenticated;
grant execute on function public.delete_session(uuid),public.create_email_invitation(text) to authenticated,service_role;
