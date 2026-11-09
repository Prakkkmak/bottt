-- An organizer changes a recurring game once for all its upcoming dates, and a stopped series stays in the list, to be
-- resumed with new settings or deleted. Stopping no longer deletes the series: it marks it stopped, removes its upcoming
-- dates without anyone registered, and opens nothing more until it is resumed.
-- Additive for the deployed site: it lists the stopped series like the others, and its « Arrêter » button then says the
-- series is already stopped.
alter table public.session_series add column stopped_at timestamptz;

-- Same as the series migration, except that a stopped series opens nothing.
create or replace function public.extend_series(p_id uuid default null) returns integer language plpgsql security definer set search_path='' as $$
declare r public.session_series; v public.venues; slot date; starts timestamptz; sid uuid; created integer=0;
begin
  for r in select * from public.session_series s where (p_id is null or s.id=p_id) and s.stopped_at is null
      and exists(select 1 from public.profiles p where p.id=s.created_by and p.membership='organizer')
      order by s.id for update skip locked loop
    slot=coalesce(r.generated_through+7*r.every_weeks,r.first_date);
    loop
      exit when r.ends_on is not null and slot>r.ends_on;
      starts=(slot+r.starts_local) at time zone 'Europe/Paris';
      exit when slot>r.first_date and starts>now()+make_interval(weeks=>r.weeks_ahead);
      -- A date moved by hand onto this day already stands for it.
      if starts>now() and not exists(select 1 from public.sessions g where g.series_id=r.id and (g.starts_at at time zone 'Europe/Paris')::date=slot) then
        v=null;
        if r.venue_id is not null then select * into v from public.venues where id=r.venue_id for share; end if;
        insert into public.sessions(title,script,starts_at,ends_at,location,venue_id,capacity,newcomer_seats,release_hours,beginners_welcome,visibility,created_by,series_id)
          values(r.title,r.script,starts,starts+r.duration,coalesce(v.name,r.location),v.id,r.capacity,0,0,true,r.visibility,r.created_by,r.id)
          returning id into sid;
        insert into public.session_addresses(session_id,address) values(sid,coalesce(v.address,r.address));
        created=created+1;
      end if;
      update public.session_series set generated_through=slot where id=r.id;
      slot=slot+7*r.every_weeks;
    end loop;
  end loop;
  return created;
end; $$;

-- Same as the series migration, except that the series stays, stopped, so that it can be resumed or deleted later.
create or replace function public.stop_series(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare removed integer; kept integer;
begin
  if not public.is_organizer() then raise exception 'Accès organisateur requis.'; end if;
  perform 1 from public.session_series where id=p_id and stopped_at is null for update;
  if not found then raise exception 'Cette série est déjà arrêtée.'; end if;
  -- Locked first, like book_session does: a registration made meanwhile is seen, and keeps its game.
  perform 1 from public.sessions where series_id=p_id and starts_at>now() order by id for update;
  delete from public.sessions s where s.series_id=p_id and s.starts_at>now()
    and not exists(select 1 from public.bookings b where b.session_id=s.id and b.status in ('pending','confirmed','waitlisted','offered'));
  get diagnostics removed=row_count;
  select count(*) into kept from public.sessions where series_id=p_id and starts_at>now() and status='published';
  update public.session_series set stopped_at=now() where id=p_id;
  return jsonb_build_object('removed',removed,'kept',kept);
end; $$;

-- Changes a series from its next date on, with the same checks as save_series. p_data holds the series' id, its next date
-- (starts_at, ends_at giving the length of each game) and every setting of the form.
-- The upcoming dates already open keep their day and take what changed in the series through save_session, which checks
-- each one and tells the people registered about a new hour or place. A setting left as the series had it keeps each
-- date's own value, so that a date changed by hand (members only, another place, another hour) stays so unless the
-- organizer changes that very setting for the whole series. When the next date stays on the series' rhythm, every
-- upcoming date of its week or after is kept, a date moved by hand included, and a date deleted by hand is not opened
-- again; the dates of the weeks before it, skipped, are removed when nobody is registered, and stay as they are otherwise,
-- for the organizer to keep or cancel. When the rhythm changes (another day, every other week…), when the next date comes
-- before the series' first one, or when a stopped series resumes, the series starts again from the next date, like a new
-- one: the dates that do not fall on it are removed or kept the same way, as are the dates after the last one.
create function public.edit_series(p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare old public.session_series; v public.venues; starts timestamptz; ends timestamptz; first_local timestamp; next_date date; start_hour time; span interval;
  weeks integer; step integer; last_date date; fresh boolean; through date; new_place text; new_address text; g record; slot_start timestamptz; occupied integer;
  new_title text; new_script text; new_capacity integer; new_visibility text; title_changed boolean; script_changed boolean; place_changed boolean;
  capacity_changed boolean; visibility_changed boolean; time_changed boolean;
  updated integer=0; removed integer=0; kept integer=0; opened integer;
begin
  if not public.is_organizer() then raise exception 'Accès organisateur requis.'; end if;
  select * into old from public.session_series where id=nullif(p_data->>'id','')::uuid for update;
  if old.id is null then raise exception 'Cette série est introuvable.'; end if;
  p_data=jsonb_build_object('capacity',old.capacity,'every_weeks',old.every_weeks,'weeks_ahead',old.weeks_ahead)||p_data;
  starts=(p_data->>'starts_at')::timestamptz; ends=(p_data->>'ends_at')::timestamptz;
  if starts is null or starts<=now() then raise exception 'Choisis une date à venir.'; end if;
  if ends is null or ends<=starts or ends>starts+interval '24 hours' then raise exception 'La fin doit être après le début.'; end if;
  weeks=coalesce((p_data->>'every_weeks')::integer,0);
  if weeks not in (1,2) then raise exception 'Choisis le rythme de la série.'; end if;
  if coalesce((p_data->>'weeks_ahead')::integer,0) not between 1 and 12 then raise exception 'Choisis jusqu’à quand les dates sont ouvertes.'; end if;
  first_local=starts at time zone 'Europe/Paris'; next_date=first_local::date; start_hour=first_local::time; span=ends-starts; step=7*weeks;
  last_date=nullif(p_data->>'ends_on','')::date;
  if last_date<next_date then raise exception 'La dernière date doit suivre la prochaine partie.'; end if;
  if nullif(p_data->>'venue_id','') is not null then
    select * into v from public.venues where id=(p_data->>'venue_id')::uuid for share;
    if v.id is null then raise exception 'Ce lieu n’est plus dans la liste. Choisis-en un autre.'; end if;
  end if;
  -- Venues before games, like save_venue and save_session: the upcoming dates keep theirs unless the place changes.
  perform 1 from public.venues where id in (select s.venue_id from public.sessions s where s.series_id=old.id and s.status='published' and s.starts_at>now())
    order by id for share;
  new_place=coalesce(v.name,p_data->>'location'); new_address=coalesce(v.address,p_data->>'address','');
  new_title=coalesce(p_data->>'title',''); new_script=coalesce(p_data->>'script',''); new_capacity=(p_data->>'capacity')::integer; new_visibility=p_data->>'visibility';
  title_changed=new_title is distinct from old.title; script_changed=new_script is distinct from old.script;
  -- A saved venue stands for its name and address, which follow it; a place typed in is its name and its address.
  place_changed=v.id is distinct from old.venue_id or (v.id is null and (new_place is distinct from old.location or new_address is distinct from old.address));
  capacity_changed=new_capacity is distinct from old.capacity; visibility_changed=new_visibility is distinct from old.visibility;
  time_changed=start_hour is distinct from old.starts_local or span is distinct from old.duration;
  fresh=old.stopped_at is not null or old.every_weeks<>weeks or next_date<old.first_date or (next_date-old.first_date)%step<>0;

  -- Locked in id order, like stop_series: a registration made meanwhile is seen before a date is removed.
  for g in select s.id,s.title,s.description,s.script,s.starts_at,s.ends_at,s.location,s.venue_id,coalesce(a.address,'') as address,s.capacity,
        s.beginners_welcome,s.visibility,(s.starts_at at time zone 'Europe/Paris')::date as day
      from public.sessions s left join public.session_addresses a on a.session_id=s.id
      where s.series_id=old.id and s.status='published' and s.starts_at>now() order by s.id for update of s loop
    slot_start=case when time_changed then (g.day+start_hour) at time zone 'Europe/Paris' else g.starts_at end;
    if (last_date is null or g.day<=last_date)
      and (case when fresh then g.day>=next_date and (g.day-next_date)%step=0 else g.day>next_date-step end) then
      -- A date moved by hand to the day before the next one, at an hour already past, stays as it is.
      continue when slot_start<=now();
      -- Said here with the date, before save_session refuses the same in general terms.
      select count(*) into occupied from public.bookings where session_id=g.id and (status='confirmed' or (status='offered' and offer_expires_at>now()));
      if capacity_changed and occupied>new_capacity then
        raise exception 'La partie du % compte déjà % places prises : prévois-en au moins %.',to_char(g.day,'DD/MM'),occupied,occupied;
      end if;
      if visibility_changed and g.visibility='public' and new_visibility='members'
        and exists(select 1 from public.bookings b left join public.profiles p on p.id=b.user_id where b.session_id=g.id
          and b.status in ('pending','confirmed','offered','waitlisted') and (p.membership='newcomer' or (b.user_id is null and b.pool='newcomer')))
        then raise exception 'Des voyageurs sont inscrits à la partie du % : garde la série ouverte à tous.',to_char(g.day,'DD/MM'); end if;
      perform public.save_session(jsonb_build_object('id',g.id,'description',g.description,'beginners_welcome',g.beginners_welcome,
          'title',case when title_changed then new_title else g.title end,'script',case when script_changed then new_script else g.script end,
          'starts_at',slot_start,'ends_at',case when time_changed then slot_start+span else g.ends_at end,
          'location',case when place_changed then new_place else g.location end,'address',case when place_changed then new_address else g.address end,
          'venue_id',case when place_changed then v.id else g.venue_id end,
          'capacity',case when capacity_changed then new_capacity else g.capacity end,'visibility',case when visibility_changed then new_visibility else g.visibility end));
      updated=updated+1;
    elsif not exists(select 1 from public.bookings b where b.session_id=g.id and b.status in ('pending','confirmed','waitlisted','offered')) then
      delete from public.sessions where id=g.id;
      removed=removed+1;
    else
      -- Off the new rhythm, a booked date restarted from leaves the series: a later change of the series no longer moves it.
      if fresh and (g.day<next_date or (g.day-next_date)%step<>0) then update public.sessions set series_id=null where id=g.id; end if;
      kept=kept+1;
    end if;
  end loop;
  -- Started again, the series opens its days again, those of the dates cancelled meanwhile included.
  if fresh then
    delete from public.sessions s where s.series_id=old.id and s.status='cancelled' and s.starts_at>now()
      and not exists(select 1 from public.bookings b where b.session_id=s.id and b.status in ('pending','confirmed','waitlisted','offered'));
  end if;

  -- The series opens its dates from the next one on. Kept on its rhythm, it does not open again a date deleted by hand,
  -- except those after a last date brought forward, so that pushing it back later opens them again.
  through=case when fresh then next_date-step else greatest(old.generated_through,next_date-step) end;
  if last_date<through then through=through-((through-last_date+step-1)/step)*step; end if;
  -- An organizer who edits the series of one who has lost the rank takes it over, so that its dates open again.
  update public.session_series r set title=new_title,script=new_script,location=new_place,address=new_address,venue_id=v.id,
    capacity=new_capacity,visibility=new_visibility,starts_local=start_hour,duration=span,every_weeks=weeks,
    weeks_ahead=(p_data->>'weeks_ahead')::integer,ends_on=last_date,stopped_at=null,
    first_date=case when fresh then next_date else r.first_date end,
    generated_through=through,
    created_by=case when exists(select 1 from public.profiles p where p.id=r.created_by and p.membership='organizer') then r.created_by else auth.uid() end
    where r.id=old.id;
  opened=public.extend_series(old.id);
  return jsonb_build_object('resumed',old.stopped_at is not null,'updated',updated,'opened',opened,'removed',removed,'kept',kept);
end; $$;

-- Same as the series migration, except that the venue and then its games are locked in id order before the venue goes,
-- like save_venue and edit_series do: deleting it unlinks them, and it then never waits on a game an edit already holds.
create or replace function public.delete_venue(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.is_organizer() then raise exception 'Accès organisateur requis.'; end if;
  update public.session_series s set location=v.name,address=v.address from public.venues v where v.id=p_id and s.venue_id=p_id;
  perform 1 from public.venues where id=p_id for update;
  perform 1 from public.sessions where venue_id=p_id order by id for update;
  delete from public.venues where id=p_id;
end; $$;

-- A stopped series leaves the list; its games stay, each on its own.
create function public.delete_series(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare r public.session_series;
begin
  if not public.is_organizer() then raise exception 'Accès organisateur requis.'; end if;
  select * into r from public.session_series where id=p_id for update;
  if r.id is null then return; end if;
  if r.stopped_at is null then raise exception 'Arrête d’abord la série.'; end if;
  -- In id order like set_membership, since deleting the series unlinks all its games.
  perform 1 from public.sessions where series_id=p_id order by id for update;
  delete from public.session_series where id=p_id;
end; $$;

revoke execute on function public.edit_series(jsonb),public.delete_series(uuid) from public,anon,authenticated;
grant execute on function public.edit_series(jsonb),public.delete_series(uuid) to authenticated,service_role;
-- Replaced functions keep their grants; said again so that the rule holds whatever ran before.
revoke execute on function public.extend_series(uuid),public.stop_series(uuid),public.delete_venue(uuid) from public,anon,authenticated;
grant execute on function public.stop_series(uuid),public.delete_venue(uuid) to authenticated,service_role;
grant execute on function public.extend_series(uuid) to service_role;
