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
  -- Five a day for the whole circle, three of them at most from one organizer: an announcement writes to everyone, and
  -- naming other organizers does not raise the circle's cap. The lock makes two sends at once count each other. A refused
  -- announcement, here or below, rolls the counts back with the rest of the call.
  perform pg_advisory_xact_lock(hashtext('public.send_announcement'));
  if (select count(*) from public.announcements where created_at>now()-interval '1 day')>=5 then
    raise exception 'Le cercle a déjà reçu 5 annonces en 24 heures. Réessaie demain.';
  end if;
  begin
    perform public.rate_guard('announcement',3,86400);
  exception when raise_exception then
    raise exception 'Tu as déjà envoyé 3 annonces aujourd’hui. Réessaie demain.';
  end;
  select display_name into sender from public.profiles where id=auth.uid();
  insert into public.announcements(sender_id,audience,subject,body) values(auth.uid(),p_audience,heading,clean) returning id into announcement;
  -- One statement reads the audience and writes to it, so that the counts agree. The kind is given: the notification
  -- choices trigger keeps no row for someone who switched announcements off, and the rows returned are those kept.
  -- The subject always starts with « Annonce » so that it never passes for a login e-mail.
  with audience as materialized (select r.user_id from public.announcement_audience(p_audience) r),
    written as (insert into public.notifications(user_id,session_id,title,body,sender_id,kind)
      select a.user_id,null,case when heading='' then 'Annonce de '||sender else 'Annonce · '||heading end,clean||E'\n\n— '||sender,auth.uid(),'announcement'
      from audience a returning 1)
  select (select count(*) from audience),(select count(*) from written) into targeted,reached;
  if targeted=0 then raise exception 'Personne d’autre n’a encore de compte dans le cercle.'; end if;
  if reached=0 then raise exception 'Tout le monde a coupé les annonces : la tienne ne partirait à personne.'; end if;
  update public.announcements set sent=reached,muted=targeted-reached where id=announcement;
  return jsonb_build_object('sent',reached,'muted',targeted-reached);
end; $$;

-- maintenance() as in 202610210006, plus the year after which an announcement leaves the history.
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
  -- The organizers' history of announcements keeps one year, as the privacy page says.
  delete from public.announcements where created_at<now()-interval '1 year';
end; $$;

revoke execute on function public.announcement_audience(text),public.announcement_counts(),public.send_announcement(text,text,text) from public,anon,authenticated;
grant execute on function public.announcement_counts(),public.send_announcement(text,text,text) to authenticated,service_role;
