-- A voluntary profile preference, independent of membership and permissions.
alter table public.profiles
  add column can_storytell boolean not null default false;

-- The existing own_profile_edit RLS policy still limits edits to the account owner.
grant update(can_storytell) on public.profiles to authenticated;
