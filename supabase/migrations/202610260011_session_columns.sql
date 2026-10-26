-- list_sessions stopped showing the former MJ name, the old description and the organizer's account,
-- but the API still let anyone read them straight from the table. Visitors and players now read only
-- the columns the site shows; the functions, which run as the table's owner, keep the whole row.
-- Additive for the deployed site: it reads the games through list_sessions only.
revoke select on public.sessions from anon,authenticated;
grant select(id,title,script,starts_at,ends_at,location,venue_id,capacity,newcomer_seats,release_hours,beginners_welcome,visibility,status)
  on public.sessions to anon,authenticated;
