-- The pseudo is asked right after the first sign-in instead of on the code request form.
-- Additive: the site deployed before this migration, which still sends a name with the code request, keeps working.
alter table public.profiles add column nickname_chosen boolean not null default false;
-- Accounts that gave a name keep it; those who left the field empty got « Nouveau joueur » and choose one at their next visit.
update public.profiles set nickname_chosen=display_name<>'Nouveau joueur';

-- A name given at sign-up (previous site, local examples) counts as chosen; otherwise the placeholder waits for one.
create or replace function public.new_profile() returns trigger language plpgsql security definer set search_path = '' as $$
declare chosen text=trim(coalesce(new.raw_user_meta_data->>'display_name',''));
begin
  insert into public.profiles(id,display_name,nickname_chosen) values (new.id,
    case when char_length(chosen) between 2 and 40 then chosen else 'Nouveau joueur' end,
    char_length(chosen) between 2 and 40 and chosen<>'Nouveau joueur');
  return new;
end; $$;

-- Saving a pseudo, from the welcome screen or the profile, marks it as chosen. A save that keeps the placeholder,
-- like the previous site's profile form changing only the colour, does not. Players never write the flag themselves.
create function public.mark_nickname_chosen() returns trigger language plpgsql set search_path='' as $$
begin
  new.nickname_chosen=new.nickname_chosen or new.display_name<>'Nouveau joueur';
  return new;
end; $$;
create trigger mark_nickname_chosen before update of display_name on public.profiles
  for each row execute function public.mark_nickname_chosen();
revoke execute on function public.mark_nickname_chosen() from public,anon,authenticated;
