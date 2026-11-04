-- An organizer writes to the people registered for an upcoming game. The message goes out like the other
-- notifications, as an e-mail naming the game, its date and its place: one per person, the people who bring
-- guests reading it for them. The waiting list gets it too unless the organizer leaves it out.
-- The writer gets no copy: they have just written it. Returns how many people it goes to.
-- The account that wrote a message is kept with it, since display names can be changed or shared. Players read their
-- notifications through a list of granted columns, which leaves this one out.
alter table public.notifications add column sender_id uuid references public.profiles(id) on delete set null;

create function public.send_session_message(p_session uuid,p_message text,p_waitlist boolean default true) returns integer language plpgsql security definer set search_path='' as $$
declare s public.sessions; clean text; sender text; recipients integer;
begin
  if not public.is_organizer() then raise exception 'Accès organisateur requis.'; end if;
  -- Line endings typed in a browser arrive as CRLF. Control characters and the direction marks that could disguise a link
  -- in a plain-text e-mail are dropped; spaces at both ends of the message are trimmed.
  clean=replace(replace(coalesce(p_message,''),E'\r\n',E'\n'),E'\r',E'\n');
  clean=btrim(regexp_replace(clean,'[\x01-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F\u200E\u200F\u202A-\u202E\u2066-\u2069]','','g'),E' \t\n');
  if char_length(clean) not between 2 and 2000 then raise exception 'Écris un message de 2 à 2000 caractères.'; end if;
  -- Shared with bookings, exclusive with cancel_session: a game cancelled meanwhile is seen as cancelled.
  select * into s from public.sessions where id=p_session for share;
  if s.id is null then raise exception 'Cette partie est introuvable.'; end if;
  if s.status<>'published' then raise exception 'Cette partie est annulée : ses inscrits en ont déjà été prévenus.'; end if;
  -- claim_emails sends nothing about a game that has started.
  if s.starts_at<=now() then raise exception 'Cette partie a commencé : un message n’arriverait plus à temps.'; end if;
  -- Ten a day per organizer, so that a slip cannot flood the players. A refused message, here or below, rolls the count
  -- back with the rest of the call. rate_guard's own refusal speaks of minutes; this window is a day.
  begin
    perform public.rate_guard('session_message',10,86400);
  exception when raise_exception then
    raise exception 'Tu as déjà envoyé 10 messages aujourd’hui. Réessaie demain.';
  end;
  select display_name into sender from public.profiles where id=auth.uid();
  insert into public.notifications(user_id,session_id,title,body,sender_id)
    select recipient,p_session,'Message de '||sender,clean||coalesce(E'\n\nTransmets ce message à '||guests||'.',''),auth.uid()
    from (select coalesce(user_id,sponsor_id) as recipient,string_agg(guest_name,' et ' order by guest_name) filter(where user_id is null) as guests
      from public.bookings where session_id=p_session and (status in ('pending','confirmed','offered') or (p_waitlist and status='waitlisted')) group by 1) listed
    where recipient<>auth.uid();
  get diagnostics recipients=row_count;
  if recipients=0 then raise exception 'Personne d’autre n’est inscrit à cette partie pour le moment.'; end if;
  return recipients;
end; $$;

revoke execute on function public.send_session_message(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.send_session_message(uuid,text,boolean) to authenticated,service_role;
