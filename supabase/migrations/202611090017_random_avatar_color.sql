-- A new account gets one of the five colours at random instead of always rose, so the members list and the circle
-- tell players apart from their first visit. The player can still pick another one on their profile.
-- Only the default changes: existing accounts keep the colour they have, and a colour given at insert is kept.
alter table public.profiles alter column avatar_color
  set default (array['rose','blue','sage','ochre','lilac'])[1+floor(random()*5)::integer];
