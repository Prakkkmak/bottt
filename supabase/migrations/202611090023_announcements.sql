-- An organizer writes to the whole circle, or to its members only: an announcement leaves by e-mail to every account whose
-- address was confirmed, the writer aside, as notifications of kind 'announcement' that each person can switch off
-- (notification choices migration). Organizers keep the announcements of the past year, to see what was already said.

create table public.announcements(
  id uuid primary key default gen_random_uuid(),
  sender_id uuid references public.profiles(id) on delete set null,
  -- everyone: travellers, members and organizers; members: members and organizers.
  audience text not null check (audience in ('everyone','members')),
  -- Empty: the e-mail is titled « Annonce de <pseudo> ».
  subject text not null default '' check (char_length(subject)<=100),
  body text not null check (char_length(body) between 2 and 4000),
  -- How many people it went to, and how many it would have reached had they not switched announcements off.
  sent integer not null default 0,
  muted integer not null default 0,
  created_at timestamptz not null default now()
);
create index announcements_created on public.announcements(created_at);
alter table public.announcements enable row level security;
revoke all on public.announcements from public,anon,authenticated;
create policy announcements_read on public.announcements for select to authenticated
  using (public.is_organizer() and created_at>now()-interval '1 year');
grant select(id,sender_id,audience,subject,body,sent,muted,created_at) on public.announcements to authenticated;
grant all on public.announcements to service_role;

-- Who an announcement is for: accounts that confirmed their address (a code asked for and never typed leaves an account
-- behind), not suspended, the writer aside. wanted: whether they get announcements by e-mail.
create function public.announcement_audience(p_audience text) returns table(user_id uuid,wanted boolean) language sql stable security definer set search_path='' as $$
  select p.id,public.wants_email(p.id,'announcement') from public.profiles p join auth.users u on u.id=p.id
  where p.id is distinct from auth.uid() and u.email_confirmed_at is not null
    and (p.membership in ('member','organizer') or (p_audience='everyone' and p.membership='newcomer'));
$$;

-- What the organizer page shows before sending: how many people each audience reaches, and how many switched it off.
create function public.announcement_counts() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not public.is_organizer() then raise exception 'Accès organisateur requis.'; end if;
  return (select jsonb_object_agg(audience,counts) from (
    select a.audience,jsonb_build_object('sent',count(*) filter(where r.wanted),'muted',count(*) filter(where r.wanted is false)) as counts
    from (values ('everyone'),('members')) a(audience) left join lateral public.announcement_audience(a.audience) r on true
    group by a.audience) per_audience);
end; $$;

-- Sends an announcement and keeps it. Returns {sent, muted}, like send_session_message_counts.
create function public.send_announcement(p_subject text,p_message text,p_audience text) returns jsonb language plpgsql security definer set search_path='' as $$
declare clean text; heading text; sender text; targeted integer; reached integer; announcement uuid;
begin
  if not public.is_organizer() then raise exception 'Accès organisateur requis.'; end if;
  if p_audience is null or p_audience not in ('everyone','members') then raise exception 'Choisis à qui envoyer l’annonce.'; end if;
  -- As in send_session_message: line endings tidied, control characters and the direction marks that could disguise a link
  -- in a plain-text e-mail dropped, spaces at both ends trimmed. The subject holds on one line.
  clean=replace(replace(coalesce(p_message,''),E'\r\n',E'\n'),E'\r',E'\n');
  clean=btrim(regexp_replace(clean,'[\x01-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F‎‏‪-‮⁦-⁩]','','g'),E' \t\n');
  if char_length(clean) not between 2 and 4000 then raise exception 'Écris une annonce de 2 à 4000 caractères.'; end if;
  heading=btrim(regexp_replace(regexp_replace(coalesce(p_subject,''),'[\x01-\x1F\x7F-\x9F‎‏‪-‮⁦-⁩]',' ','g'),'\s+',' ','g'));
  if char_length(heading)>100 then raise exception 'L’objet tient en 100 caractères au plus.'; end if;
  select count(*) into targeted from public.announcement_audience(p_audience);
  if targeted=0 then raise exception 'Personne d’autre n’a encore de compte dans le cercle.'; end if;
  -- Three a day per organizer: an announcement writes to everyone. A refused one, here or below, rolls the count back with
  -- the rest of the call.
  begin
    perform public.rate_guard('announcement',3,86400);
  exception when raise_exception then
    raise exception 'Tu as déjà envoyé 3 annonces aujourd’hui. Réessaie demain.';
  end;
  select display_name into sender from public.profiles where id=auth.uid();
  delete from public.announcements where created_at<now()-interval '1 year';
  insert into public.announcements(sender_id,audience,subject,body) values(auth.uid(),p_audience,heading,clean) returning id into announcement;
  -- The kind is given: the notification choices trigger keeps no row for someone who switched announcements off.
  insert into public.notifications(user_id,session_id,title,body,sender_id,kind)
    select r.user_id,null,coalesce(nullif(heading,''),'Annonce de '||sender),clean||E'\n\n— '||sender,auth.uid(),'announcement'
    from public.announcement_audience(p_audience) r;
  get diagnostics reached=row_count;
  if reached=0 then raise exception 'Tout le monde a coupé les annonces : la tienne ne partirait à personne.'; end if;
  update public.announcements set sent=reached,muted=targeted-reached where id=announcement;
  return jsonb_build_object('sent',reached,'muted',targeted-reached);
end; $$;

revoke execute on function public.announcement_audience(text),public.announcement_counts(),public.send_announcement(text,text,text) from public,anon,authenticated;
grant execute on function public.announcement_counts(),public.send_announcement(text,text,text) to authenticated,service_role;
