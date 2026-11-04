-- An organizer writes to the people registered for an upcoming game. The message goes out like the other
-- notifications, as an e-mail naming the game, its date and its place: one per person, the people who bring
-- guests reading it for them. The waiting list gets it too unless the organizer leaves it out.
-- The writer gets no copy: they have just written it. Returns how many people it goes to.
create function public.send_session_message(p_session uuid,p_message text,p_waitlist boolean default true) returns integer language plpgsql security definer set search_path='' as $$
declare s public.sessions; clean text; sender text; recipients integer;
begin
  if not public.is_organizer() then raise exception 'Accès organisateur requis.'; end if;
  -- Line endings typed in a browser arrive as CRLF; spaces at both ends of the message are trimmed.
  clean=btrim(replace(replace(coalesce(p_message,''),E'\r\n',E'\n'),E'\r',E'\n'),E' \t\n');
  if char_length(clean) not between 2 and 2000 then raise exception 'Écris un message de 2 à 2000 caractères.'; end if;
  select * into s from public.sessions where id=p_session;
  if s.id is null then raise exception 'Cette partie est introuvable.'; end if;
  if s.status<>'published' then raise exception 'Cette partie est annulée : ses inscrits en ont déjà été prévenus.'; end if;
  -- claim_emails sends nothing about a game that has started.
  if s.starts_at<=now() then raise exception 'Cette partie a commencé : un message n’arriverait plus à temps.'; end if;
  -- Counted after the checks, so that a refused message does not use up the organizer's sends.
  perform public.rate_guard('session_message',10,3600);
  select display_name into sender from public.profiles where id=auth.uid();
  insert into public.notifications(user_id,session_id,title,body)
    select recipient,p_session,'Message de '||sender,clean||coalesce(E'\n\nTransmets ce message à '||guests||'.','')
    from (select coalesce(user_id,sponsor_id) as recipient,string_agg(guest_name,' et ' order by guest_name) filter(where user_id is null) as guests
      from public.bookings where session_id=p_session and (status in ('pending','confirmed','offered') or (p_waitlist and status='waitlisted')) group by 1) listed
    where recipient<>auth.uid();
  get diagnostics recipients=row_count;
  if recipients=0 then raise exception 'Personne d’autre n’est inscrit à cette partie pour le moment.'; end if;
  return recipients;
end; $$;

revoke execute on function public.send_session_message(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.send_session_message(uuid,text,boolean) to authenticated,service_role;
