-- The site signs in with e-mail codes only, but Supabase Auth accepts a password sign-up whenever sign-ups are open.
-- Someone could register a player's address with a password before them: the owner's first code confirms the address
-- without clearing that password, which would then open the account. A session opened with a password is never active.
create or replace function public.active_user() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from auth.users u join public.profiles p on p.id=u.id
    join auth.sessions s on s.user_id=u.id
    where u.id=auth.uid() and u.email_confirmed_at is not null and p.membership <> 'suspended'
      and s.id::text=auth.jwt()->>'session_id'
      and s.created_at > now()-interval '30 days' and (s.not_after is null or s.not_after>now()))
    -- Auth copies the session's sign-in methods into every token, refreshed ones included.
    and not coalesce(auth.jwt()->'amr','[]'::jsonb) @> '[{"method":"password"}]';
$$;
