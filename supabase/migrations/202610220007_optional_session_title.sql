-- A game no longer needs a name: without one, the site shows its script instead.
alter table public.sessions drop constraint sessions_title_check;
alter table public.sessions add constraint sessions_title_check check (char_length(title) <= 100);
alter table public.sessions alter column title set default '';

-- The cancellation names an unnamed game by its script.
create or replace function public.cancel_session(p_id uuid) returns void language plpgsql security definer set search_path = '' as $$
declare s public.sessions;
begin
  if not public.is_organizer() then raise exception 'Accès organisateur requis.'; end if;
  select * into s from public.sessions where id=p_id and status='published' for update;
  if not found then return; end if;
  update public.sessions set status='cancelled' where id=p_id;
  insert into public.notifications(user_id,session_id,title,body,dedupe_key)
    select recipient,p_id,'La session a été annulée','L’organisateur a annulé la soirée « '||coalesce(nullif(btrim(s.title),''),s.script)||' » du '||to_char(s.starts_at at time zone 'Europe/Paris','DD/MM')||'.'||coalesce(' Préviens '||guests||'.','')||' Rendez-vous sur le site pour trouver une autre date.','cancel:'||p_id||':'||recipient
    from (select coalesce(user_id,sponsor_id) as recipient,string_agg(guest_name,' et ' order by guest_name) filter(where user_id is null) as guests
      from public.bookings where session_id=p_id and status in ('pending','confirmed','waitlisted','offered') group by 1) recipients
    on conflict(dedupe_key) do nothing;
  update public.bookings set status='cancelled',offer_expires_at=null where session_id=p_id and status<>'declined';
end; $$;
