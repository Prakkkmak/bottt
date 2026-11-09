-- A game no longer needs a script: an organizer may open the date before choosing it. Without a name or a script, the
-- site calls the game « Blood on the Clocktower ». The same goes for a series, whose dates take its script.
-- Additive for the deployed site: it still sends a script of 2 characters or more, which stays allowed.
alter table public.sessions drop constraint sessions_script_check;
alter table public.sessions add constraint sessions_script_check check (script='' or char_length(script) between 2 and 100);
alter table public.sessions alter column script set default '';
alter table public.session_series drop constraint session_series_script_check;
alter table public.session_series add constraint session_series_script_check check (script='' or char_length(script) between 2 and 100);
alter table public.session_series alter column script set default '';

-- Same as the optional title migration, except that a game with neither name nor script is « la soirée du 12/11 ».
create or replace function public.cancel_session(p_id uuid) returns void language plpgsql security definer set search_path = '' as $$
declare s public.sessions; game text;
begin
  if not public.is_organizer() then raise exception 'Accès organisateur requis.'; end if;
  select * into s from public.sessions where id=p_id and status='published' for update;
  if not found then return; end if;
  update public.sessions set status='cancelled' where id=p_id;
  game=coalesce('« '||coalesce(nullif(btrim(s.title),''),nullif(btrim(s.script),''))||' » ','');
  insert into public.notifications(user_id,session_id,title,body,dedupe_key)
    select recipient,p_id,'La session a été annulée','L’organisateur a annulé la soirée '||game||'du '||to_char(s.starts_at at time zone 'Europe/Paris','DD/MM')||'.'||coalesce(' Préviens '||guests||'.','')||' Rendez-vous sur le site pour trouver une autre date.','cancel:'||p_id||':'||recipient
    from (select coalesce(user_id,sponsor_id) as recipient,string_agg(guest_name,' et ' order by guest_name) filter(where user_id is null) as guests
      from public.bookings where session_id=p_id and status in ('pending','confirmed','waitlisted','offered') group by 1) recipients
    on conflict(dedupe_key) do nothing;
  update public.bookings set status='cancelled',offer_expires_at=null where session_id=p_id and status<>'declined';
end; $$;
