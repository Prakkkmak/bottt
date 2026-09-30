-- All capacity changes run inside database transactions and lock the session row.
-- No browser role can directly insert/update bookings, invitations or memberships.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 40),
  bio text not null default '' check (char_length(bio) <= 300),
  avatar_color text not null default 'rose' check (avatar_color in ('rose','blue','sage','ochre','lilac')),
  beginner boolean not null default true,
  membership text not null default 'newcomer' check (membership in ('newcomer','member','organizer','suspended')),
  sponsored_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 100),
  description text not null default '' check (char_length(description) <= 4000),
  script text not null check (char_length(script) between 2 and 100),
  starts_at timestamptz not null, ends_at timestamptz not null,
  location text not null check (char_length(location) between 2 and 150),
  storyteller text not null check (char_length(storyteller) between 2 and 60),
  capacity integer not null check (capacity between 5 and 20),
  newcomer_seats integer not null default 2 check (newcomer_seats >= 0 and newcomer_seats <= capacity),
  release_hours integer not null default 72 check (release_hours between 0 and 336),
  beginners_welcome boolean not null default true,
  visibility text not null default 'public' check (visibility in ('public','members')),
  status text not null default 'published' check (status in ('published','cancelled')),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at and ends_at <= starts_at + interval '24 hours')
);
create table public.session_addresses (
  session_id uuid primary key references public.sessions(id) on delete cascade,
  address text not null check (char_length(address) <= 500)
);
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null check (status in ('pending','confirmed','waitlisted','offered','cancelled','declined')),
  pool text not null check (pool in ('circle','newcomer')),
  created_at timestamptz not null default now(),
  offer_expires_at timestamptz,
  unique(session_id,user_id),
  check ((status = 'offered') = (offer_expires_at is not null))
);
create index bookings_session_status_idx on public.bookings(session_id,status,created_at);
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  sponsor_id uuid not null references public.profiles(id),
  token_hash text not null unique,
  expires_at timestamptz not null default now() + interval '7 days',
  used_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create table public.notifications (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete cascade,
  title text not null, body text not null, dedupe_key text unique,
  created_at timestamptz not null default now(), read_at timestamptz,
  emailed_at timestamptz, email_attempts integer not null default 0,
  claimed_until timestamptz
);
create table public.action_limits (
  user_id uuid not null, action text not null, window_start timestamptz not null default now(),
  hits integer not null default 1, primary key(user_id,action)
);

create function public.new_profile() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id,display_name) values (new.id,
    case when char_length(trim(coalesce(new.raw_user_meta_data->>'display_name',''))) between 2 and 40
      then trim(new.raw_user_meta_data->>'display_name') else 'Nouveau joueur' end);
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.new_profile();

-- Validate the real Auth session, verified email and suspension on every protected DB operation.
-- The 30-day limit is enforced here too, even if hosted Auth's timebox is not configured.
create function public.active_user() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from auth.users u join public.profiles p on p.id=u.id
    join auth.sessions s on s.user_id=u.id
    where u.id=auth.uid() and u.email_confirmed_at is not null and p.membership <> 'suspended'
      and s.id::text=auth.jwt()->>'session_id'
      and s.created_at > now()-interval '30 days' and (s.not_after is null or s.not_after>now()));
$$;
create function public.is_organizer() returns boolean language sql stable security definer set search_path = '' as $$
  select public.active_user() and exists(select 1 from public.profiles where id=auth.uid() and membership='organizer');
$$;
create function public.is_member() returns boolean language sql stable security definer set search_path = '' as $$
  select public.active_user() and exists(select 1 from public.profiles where id=auth.uid() and membership in ('member','organizer'));
$$;
create function public.can_see_session(p_id uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.sessions where id=p_id and (visibility='public' or public.is_member()));
$$;
create function public.rate_guard(p_action text, p_limit integer, p_seconds integer) returns void language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if not public.active_user() then raise exception 'Connecte-toi pour continuer.'; end if;
  insert into public.action_limits(user_id,action) values(auth.uid(),p_action)
  on conflict(user_id,action) do update set
    hits=case when action_limits.window_start < now()-make_interval(secs=>p_seconds) then 1 else action_limits.hits+1 end,
    window_start=case when action_limits.window_start < now()-make_interval(secs=>p_seconds) then now() else action_limits.window_start end
  returning hits into n;
  if n>p_limit then raise exception 'Trop de demandes. Réessaie dans quelques minutes.'; end if;
end; $$;

create function public.seat_available(p_id uuid,p_pool text) returns boolean language plpgsql security definer set search_path = '' as $$
declare s public.sessions; total_used integer; pool_used integer; limit_pool integer;
begin
  select * into s from public.sessions where id=p_id;
  select count(*),count(*) filter(where pool=p_pool) into total_used,pool_used from public.bookings
    where session_id=p_id and (status='confirmed' or (status='offered' and offer_expires_at>now()));
  if total_used>=s.capacity then return false; end if;
  if now()>=s.starts_at-make_interval(hours=>s.release_hours) then return true; end if;
  limit_pool=case when p_pool='newcomer' then s.newcomer_seats else s.capacity-s.newcomer_seats end;
  return pool_used<limit_pool;
end; $$;
create function public.notify(p_user uuid,p_session uuid,p_title text,p_body text,p_key text default null) returns void language sql security definer set search_path = '' as $$
  insert into public.notifications(user_id,session_id,title,body,dedupe_key) values(p_user,p_session,p_title,p_body,p_key) on conflict(dedupe_key) do nothing;
$$;
create function public.rebalance(p_id uuid) returns void language plpgsql security definer set search_path = '' as $$
declare s public.sessions; b public.bookings; deadline timestamptz;
begin
  select * into s from public.sessions where id=p_id for update;
  if s.id is null or s.status<>'published' then return; end if;
  for b in update public.bookings set status='cancelled',offer_expires_at=null
    where session_id=p_id and status='offered' and offer_expires_at<=now() returning *
  loop perform public.notify(b.user_id,p_id,'La proposition a expiré','Le délai est passé. Tu peux rejoindre à nouveau la liste d’attente.'); end loop;
  if s.starts_at<=now()+interval '30 minutes' then return; end if;
  deadline=least(now()+interval '12 hours',s.starts_at-interval '30 minutes');
  for b in select * from public.bookings where session_id=p_id and status='waitlisted' order by created_at,id for update
  loop
    if public.seat_available(p_id,b.pool) then
      update public.bookings set status='offered',offer_expires_at=deadline where id=b.id;
      perform public.notify(b.user_id,p_id,'Une place s’est libérée !','Confirme ta présence depuis Mes participations avant l’expiration de la proposition.');
    end if;
  end loop;
end; $$;

create function public.book_session(p_id uuid) returns text language plpgsql security definer set search_path = '' as $$
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
    case result when 'confirmed' then 'Retrouve les informations pratiques dans ta session.' when 'pending' then 'Un organisateur validera ta première participation.' else 'Nous te proposerons une place dès qu’elle se libère.' end);
  return result;
end; $$;
create function public.cancel_booking(p_id uuid) returns void language plpgsql security definer set search_path = '' as $$
declare b public.bookings;
begin
  perform public.rate_guard('booking',20,600);
  perform 1 from public.sessions where id=p_id for update;
  select * into b from public.bookings where session_id=p_id and user_id=auth.uid();
  if b.id is null or b.status in ('cancelled','declined') then return; end if;
  update public.bookings set status='cancelled',offer_expires_at=null where id=b.id;
  perform public.notify(auth.uid(),p_id,'Désistement enregistré','Merci de nous avoir prévenus. À une prochaine soirée !');
  perform public.rebalance(p_id);
end; $$;
create function public.accept_offer(p_id uuid) returns text language plpgsql security definer set search_path = '' as $$
declare b public.bookings; s public.sessions;
begin
  perform public.rate_guard('booking',20,600);
  select * into s from public.sessions where id=p_id for update;
  if s.status<>'published' or s.starts_at<=now() then raise exception 'Cette session est close.'; end if;
  select * into b from public.bookings where session_id=p_id and user_id=auth.uid() for update;
  if b.status<>'offered' or b.offer_expires_at<=now() or b.id is null then raise exception 'Cette proposition a expiré.'; end if;
  update public.bookings set status='confirmed',offer_expires_at=null where id=b.id;
  perform public.notify(auth.uid(),p_id,'Ta place est confirmée','À très vite au village !');
  return 'confirmed';
end; $$;
create function public.review_booking(p_booking uuid,p_approve boolean) returns text language plpgsql security definer set search_path = '' as $$
declare b public.bookings; result text; s public.sessions;
begin
  if not public.is_organizer() then raise exception 'Accès organisateur requis.'; end if;
  select * into b from public.bookings where id=p_booking;
  select * into s from public.sessions where id=b.session_id for update;
  select * into b from public.bookings where id=p_booking for update;
  if b.id is null then raise exception 'Participation introuvable.'; end if;
  if s.status<>'published' or s.starts_at<=now()+interval '30 minutes' then raise exception 'Cette session est close.'; end if;
  if p_approve and b.status<>'pending' then raise exception 'Cette demande a déjà été traitée.'; end if;
  if p_approve then
    perform public.rebalance(b.session_id);
    result=case when public.seat_available(b.session_id,b.pool) then 'confirmed' else 'waitlisted' end;
  else result='declined'; end if;
  update public.bookings set status=result,offer_expires_at=null where id=b.id;
  -- A first approval allows later sessions without repeated vetting; keep this booking's reserved pool.
  if p_approve then update public.profiles set membership='member' where id=b.user_id and membership='newcomer'; end if;
  perform public.notify(b.user_id,b.session_id,
    case result when 'confirmed' then 'Bienvenue, ta place est confirmée !' when 'waitlisted' then 'Demande validée, tu es en attente' else 'Participation non retenue' end,
    case result when 'declined' then 'Contacte un organisateur si tu as une question.' else 'Retrouve les détails dans Mes participations.' end);
  perform public.rebalance(b.session_id);
  return result;
end; $$;

create function public.create_invitation() returns text language plpgsql security definer set search_path = '' as $$
declare token text;
begin
  if not public.is_member() then raise exception 'Ta première participation doit être validée avant de parrainer.'; end if;
  perform public.rate_guard('invitation',5,86400);
  token=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
  insert into public.invitations(sponsor_id,token_hash) values(auth.uid(),encode(sha256(convert_to(token,'UTF8')),'hex'));
  return token;
end; $$;
create function public.accept_invitation(p_token text) returns void language plpgsql security definer set search_path = '' as $$
declare inv public.invitations;
begin
  perform public.rate_guard('accept-invitation',10,600);
  if char_length(p_token)<>64 then raise exception 'Invitation invalide.'; end if;
  select * into inv from public.invitations where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') for update;
  if inv.id is null or inv.expires_at<=now() or inv.used_by is not null then raise exception 'Cette invitation a expiré ou a déjà été utilisée.'; end if;
  if inv.sponsor_id=auth.uid() then raise exception 'Ce lien est destiné à ton invité.'; end if;
  if not exists(select 1 from public.profiles where id=inv.sponsor_id and membership in ('member','organizer')) then raise exception 'Cette invitation n’est plus active.'; end if;
  update public.invitations set used_by=auth.uid() where id=inv.id;
  update public.profiles set membership='member',sponsored_by=inv.sponsor_id where id=auth.uid() and membership='newcomer';
end; $$;
create function public.revoke_invitation(p_id uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.active_user() then raise exception 'Connexion requise.'; end if;
  update public.invitations set expires_at=now() where id=p_id and sponsor_id=auth.uid() and used_by is null;
end; $$;

create function public.save_session(p_data jsonb) returns uuid language plpgsql security definer set search_path = '' as $$
declare sid uuid; occupied integer; occupied_new integer; occupied_circle integer;
begin
  if not public.is_organizer() then raise exception 'Accès organisateur requis.'; end if;
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
      location=p_data->>'location',storyteller=p_data->>'storyteller',capacity=(p_data->>'capacity')::integer,
      newcomer_seats=(p_data->>'newcomer_seats')::integer,release_hours=(p_data->>'release_hours')::integer,
      beginners_welcome=(p_data->>'beginners_welcome')::boolean,visibility=p_data->>'visibility' where id=sid;
    insert into public.notifications(user_id,session_id,title,body)
      select user_id,sid,'Les informations de ta session ont changé','Consulte les nouveaux horaires et le lieu avant de venir.' from public.bookings
      where session_id=sid and status in ('confirmed','offered','waitlisted','pending');
  else
    insert into public.sessions(title,description,script,starts_at,ends_at,location,storyteller,capacity,newcomer_seats,release_hours,beginners_welcome,visibility,created_by)
      values(p_data->>'title',p_data->>'description',p_data->>'script',(p_data->>'starts_at')::timestamptz,(p_data->>'ends_at')::timestamptz,
      p_data->>'location',p_data->>'storyteller',(p_data->>'capacity')::integer,(p_data->>'newcomer_seats')::integer,(p_data->>'release_hours')::integer,
      (p_data->>'beginners_welcome')::boolean,p_data->>'visibility',auth.uid()) returning id into sid;
  end if;
  insert into public.session_addresses(session_id,address) values(sid,coalesce(p_data->>'address','')) on conflict(session_id) do update set address=excluded.address;
  perform public.rebalance(sid);
  return sid;
end; $$;
create function public.cancel_session(p_id uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_organizer() then raise exception 'Accès organisateur requis.'; end if;
  perform 1 from public.sessions where id=p_id and status='published' for update;
  if not found then return; end if;
  update public.sessions set status='cancelled' where id=p_id;
  insert into public.notifications(user_id,session_id,title,body,dedupe_key)
    select user_id,p_id,'La session a été annulée','L’organisateur a annulé cette soirée. Rendez-vous sur le site pour trouver une autre date.','cancel:'||p_id||':'||user_id
    from public.bookings where session_id=p_id and status in ('pending','confirmed','waitlisted','offered') on conflict(dedupe_key) do nothing;
  update public.bookings set status='cancelled',offer_expires_at=null where session_id=p_id and status<>'declined';
end; $$;
create function public.set_membership(p_user uuid,p_status text) returns void language plpgsql security definer set search_path = '' as $$
declare sid uuid;
begin
  if not public.is_organizer() or p_user=auth.uid() or p_status not in ('member','suspended') then raise exception 'Action non autorisée.'; end if;
  if exists(select 1 from public.profiles where id=p_user and membership='organizer') then raise exception 'Un autre organisateur ne peut pas être suspendu ici.'; end if;
  update public.profiles set membership=p_status where id=p_user;
  if p_status='suspended' then
    for sid in select distinct session_id from public.bookings where user_id=p_user and status in ('confirmed','offered','pending','waitlisted') order by session_id
    loop
      perform 1 from public.sessions where id=sid for update;
      update public.bookings set status='cancelled',offer_expires_at=null where session_id=sid and user_id=p_user;
      perform public.rebalance(sid);
    end loop;
  end if;
end; $$;

create function public.list_sessions() returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(payload order by starts_at),'[]'::jsonb) from (
    select s.starts_at, (to_jsonb(s)-'created_by'-'created_at') || jsonb_build_object(
      'confirmed_count',(select count(*) from public.bookings b where b.session_id=s.id and (b.status='confirmed' or (b.status='offered' and b.offer_expires_at>now()))),
      'waitlist_count',(select count(*) from public.bookings b where b.session_id=s.id and b.status='waitlisted'),
      'my_status',case when public.active_user() then (select status from public.bookings b where b.session_id=s.id and b.user_id=auth.uid()) else null end,
      'my_offer_expires_at',case when public.active_user() then (select offer_expires_at from public.bookings b where b.session_id=s.id and b.user_id=auth.uid()) else null end,
      'participants',case when public.is_member() or (public.active_user() and exists(select 1 from public.bookings where session_id=s.id and user_id=auth.uid() and status='confirmed'))
        then (select coalesce(jsonb_agg(jsonb_build_object('display_name',p.display_name,'avatar_color',p.avatar_color)),'[]'::jsonb)
          from public.bookings b join public.profiles p on p.id=b.user_id where b.session_id=s.id and b.status='confirmed') else '[]'::jsonb end
    ) as payload from public.sessions s where public.can_see_session(s.id)
      and (s.ends_at>now()-interval '30 days' or public.is_organizer())
  ) listed;
$$;
create function public.mark_notices_read() returns void language sql security definer set search_path = '' as $$
  update public.notifications set read_at=now() where user_id=auth.uid() and public.active_user() and read_at is null;
$$;
create function public.maintenance() returns void language plpgsql security definer set search_path = '' as $$
declare sid uuid;
begin
  for sid in select id from public.sessions where status='published' and starts_at>now() order by id loop perform public.rebalance(sid); end loop;
  insert into public.notifications(user_id,session_id,title,body,dedupe_key)
    select b.user_id,s.id,'Ta session approche','Un imprévu ? Pense à libérer ta place depuis le site. À très vite !','reminder:'||s.id||':'||b.user_id
    from public.bookings b join public.sessions s on s.id=b.session_id
    where b.status='confirmed' and s.status='published' and s.starts_at between now() and now()+interval '24 hours' on conflict(dedupe_key) do nothing;
  delete from public.action_limits where window_start<now()-interval '2 days';
end; $$;
create function public.claim_emails() returns table(id uuid,email text,title text,body text,session_id uuid) language sql security definer set search_path = '' as $$
  with picked as (select n.id from public.notifications n where emailed_at is null and email_attempts<5 and (claimed_until is null or claimed_until<now()) order by created_at for update skip locked limit 30),
  claimed as (update public.notifications n set claimed_until=now()+interval '5 minutes',email_attempts=email_attempts+1 from picked where n.id=picked.id returning n.*)
  select c.id,u.email,c.title,c.body,c.session_id from claimed c join auth.users u on u.id=c.user_id;
$$;

alter table public.profiles enable row level security;
alter table public.sessions enable row level security;
alter table public.session_addresses enable row level security;
alter table public.bookings enable row level security;
alter table public.invitations enable row level security;
alter table public.notifications enable row level security;
alter table public.action_limits enable row level security;
create policy own_profile on public.profiles for select to authenticated using ((id=auth.uid() and public.active_user()) or public.is_organizer());
create policy own_profile_edit on public.profiles for update to authenticated using (id=auth.uid() and public.active_user()) with check (id=auth.uid() and public.active_user());
create policy sessions_read on public.sessions for select using (public.can_see_session(id));
create policy addresses_read on public.session_addresses for select to authenticated using (public.is_organizer() or (public.active_user() and exists(select 1 from public.bookings where session_id=session_addresses.session_id and user_id=auth.uid() and status='confirmed')));
create policy bookings_read on public.bookings for select to authenticated using ((user_id=auth.uid() and public.active_user()) or public.is_organizer());
create policy invitations_read on public.invitations for select to authenticated using (sponsor_id=auth.uid() and public.active_user());
create policy notifications_read on public.notifications for select to authenticated using (user_id=auth.uid() and public.active_user());

-- Remove Supabase default privileges; grant only the exact surface needed by the app.
revoke all on all tables in schema public from anon,authenticated;
grant select on public.sessions to anon,authenticated;
grant select on public.profiles,public.bookings,public.session_addresses to authenticated;
grant update(display_name,bio,avatar_color,beginner) on public.profiles to authenticated;
grant select(id,sponsor_id,expires_at,used_by,created_at) on public.invitations to authenticated;
grant select(id,user_id,session_id,title,body,created_at,read_at) on public.notifications to authenticated;
grant all on all tables in schema public to service_role;
revoke execute on all functions in schema public from public,anon,authenticated;
grant execute on function public.active_user(),public.is_organizer(),public.is_member(),public.can_see_session(uuid),public.list_sessions() to anon,authenticated;
grant execute on function public.book_session(uuid),public.cancel_booking(uuid),public.accept_offer(uuid),public.review_booking(uuid,boolean),public.create_invitation(),public.accept_invitation(text),public.revoke_invitation(uuid),public.save_session(jsonb),public.cancel_session(uuid),public.set_membership(uuid,text),public.mark_notices_read() to authenticated;
grant execute on all functions in schema public to service_role;
