-- The scripts of the circle: besides the three of the base box, which the site knows by itself, organizers add their own,
-- with the characters they hold, so that a game picks its script from a list and players read its roles beforehand.
-- Additive for the deployed site: it never reads the new table, and a game still names its script as text.
create table public.scripts (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 100),
  -- The address of its page, /apprendre/scripts/<slug>, made from the name by the site (lib/scripts.ts scriptSlug).
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 100
    and slug not in ('trouble-brewing','bad-moon-rising','sects-violets')),
  author text not null default '' check (char_length(author) <= 100),
  -- Character ids as lib/characters.ts knows them: lower case letters and digits. Read on the array's text form, where a
  -- missing id shows as NULL and an id with a comma or a space between quotes, so that neither gets through.
  characters text[] not null default '{}' check (cardinality(characters) <= 200 and characters::text ~ '^\{([a-z0-9]{1,40}(,[a-z0-9]{1,40})*)?\}$'),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index scripts_name_key on public.scripts(lower(name));

-- Everyone reads the scripts, visitors included, on the pages that teach the game; who added one stays with organizers.
alter table public.scripts enable row level security;
create policy scripts_read on public.scripts for select to anon,authenticated using (true);
revoke all on public.scripts from public,anon,authenticated;
grant select(id,name,slug,author,characters) on public.scripts to anon,authenticated;
grant all on public.scripts to service_role;

-- Adds or changes a script. The base box's names stay theirs. A renamed script takes its games and series along, so that
-- they keep leading to its page.
create function public.save_script(p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare sid uuid=nullif(p_data->>'id','')::uuid; previous public.scripts;
  clean_name text=btrim(regexp_replace(coalesce(p_data->>'name',''),'\s+',' ','g'));
  clean_author text=btrim(regexp_replace(coalesce(p_data->>'author',''),'\s+',' ','g'));
  -- Once each, in the order given.
  picked text[]=coalesce((select array_agg(value order by first) from (select value,min(n) as first
    from jsonb_array_elements_text(coalesce(p_data->'characters','[]'::jsonb)) with ordinality e(value,n) group by value) x),'{}');
begin
  if not public.is_organizer() then raise exception 'Accès organisateur requis.'; end if;
  if char_length(clean_name) not between 2 and 100 then raise exception 'Donne au script un nom de 2 à 100 caractères.'; end if;
  if lower(clean_name) in ('trouble brewing','bad moon rising','sects & violets','sects and violets') then raise exception 'Ce nom est celui d’un script de base.'; end if;
  if coalesce(p_data->>'slug','') !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(p_data->>'slug')>100 then raise exception 'Donne au script un nom avec des lettres latines ou des chiffres.'; end if;
  if p_data->>'slug' in ('trouble-brewing','bad-moon-rising','sects-violets') then raise exception 'Ce nom est celui d’un script de base.'; end if;
  if char_length(clean_author)>100 then raise exception 'Le nom de l’auteur tient en 100 caractères au plus.'; end if;
  if exists(select 1 from unnest(picked) c where c is null or c !~ '^[a-z0-9]{1,40}$') or cardinality(picked)>200 then
    raise exception 'Le script envoyé est incomplet. Recharge la page et réessaie.';
  end if;
  if sid is not null then
    select * into previous from public.scripts where id=sid for update;
    if previous.id is null then raise exception 'Ce script est introuvable.'; end if;
  end if;
  begin
    if sid is null then
      insert into public.scripts(name,slug,author,characters,created_by) values(clean_name,p_data->>'slug',clean_author,picked,auth.uid()) returning id into sid;
    else
      update public.scripts set name=clean_name,slug=p_data->>'slug',author=clean_author,characters=picked,updated_at=now() where id=sid;
      if previous.name<>clean_name then
        update public.sessions set script=clean_name where script=previous.name;
        update public.session_series set script=clean_name where script=previous.name;
      end if;
    end if;
  exception when unique_violation then raise exception 'Un script porte déjà ce nom.';
  end;
  return sid;
end; $$;

-- A script leaves the list; the games that played it keep its name.
create function public.delete_script(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.is_organizer() then raise exception 'Accès organisateur requis.'; end if;
  delete from public.scripts where id=p_id;
end; $$;

revoke all on function public.save_script(jsonb),public.delete_script(uuid) from public,anon,authenticated;
grant execute on function public.save_script(jsonb),public.delete_script(uuid) to authenticated;
