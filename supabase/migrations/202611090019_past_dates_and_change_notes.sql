-- A game may now be given a date already past, after a warning on the site: a game played before the date it was planned
-- for, for instance, is closed to registrations and listed with the past games once it has ended. Nobody is written to
-- about a game whose new date has passed: claim_emails never sends a message about a game that has started. A recurring
-- game still starts in the future (save_series is unchanged).
--
-- An organizer editing an upcoming game may also add a few words for the people registered (p_data->>'note'). They leave
-- with the message about the change, signed with the organizer's pseudo, and also reach those for whom nothing they can
-- read changed: the organizer wrote to everyone registered. Like the messages of send_session_message, they count among
-- the organizer's ten messages a day.
--
-- The note is written at the end of the message's text, which the e-mail sends as it is, and kept in a column of its own
-- too, so that a message waiting to leave and replaced by the next one passes it on. Players read their notifications
-- through a list of granted columns, which leaves this one out, like the changes.
alter table public.notifications add column note text;

-- Same as the change details migration, with the organizer's note (p_note, already signed, or null). It goes to everyone
-- registered but its writer, along with the changes each one may read. A message replaced before it leaves passes its
-- notes on to the new one, in the order written, so a note is never lost to a later edit; a note that could not leave
-- within a day is out of date, as claim_emails has it, and is dropped. The message keeps the account that wrote its
-- latest note (sender_id, as for send_session_message), since a signature only gives a pseudo.
drop function public.notify_session_change(uuid,text,text,jsonb,jsonb,timestamptz);
create function public.notify_session_change(p_session uuid,p_title text,p_body text,p_changes jsonb,p_address jsonb,p_previous_start timestamptz,p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare r record; fresh jsonb; earlier jsonb; kinds text[]; notes text; note text; sender uuid; writer uuid; merged jsonb; heading text; message text; f text; newest jsonb; oldest jsonb; latest jsonb; former jsonb; latter jsonb;
begin
  for r in select b.recipient,b.guests,
      coalesce(x.may_read and (p.membership in ('member','organizer') or s.starts_at<=now()+interval '48 hours'),false) as reads_now,
      coalesce(x.may_read and (p.membership in ('member','organizer') or p_previous_start<=now()+interval '48 hours'),false) as read_before
    from (select coalesce(user_id,sponsor_id) as recipient,string_agg(guest_name,' et ' order by guest_name) filter(where user_id is null) as guests,
        bool_or(status='confirmed') as seated
      from public.bookings where session_id=p_session and status in ('confirmed','offered','waitlisted','pending') group by 1) b
    join public.profiles p on p.id=b.recipient
    join public.sessions s on s.id=p_session
    cross join lateral (select p.membership<>'suspended' and (b.seated or p.membership='organizer') as may_read) x
    order by b.recipient
  loop
    fresh=p_changes||case when p_address is not null and r.reads_now then jsonb_build_array(case when r.read_before then p_address else p_address-'before' end) else '[]'::jsonb end;
    -- Its writer gets no copy of a note: they have just written it.
    note=case when r.recipient is distinct from auth.uid() then nullif(p_note,'') end;
    writer=case when note is not null then auth.uid() end;
    continue when jsonb_array_length(fresh)=0 and note is null;
    -- One being sent right now may still leave: the new one then repeats its former values, which stay true.
    with replaced as (update public.notifications n set email_attempts=5
        where n.user_id=r.recipient and n.session_id=p_session and (n.changes<>'[]'::jsonb or n.note is not null) and n.emailed_at is null and n.email_attempts<5
        returning n.id,n.created_at,n.title,n.changes,n.note,n.sender_id)
    select (select coalesce(jsonb_agg(e.change order by q.created_at,q.id,e.idx),'[]'::jsonb)
          from replaced q cross join lateral jsonb_array_elements(q.changes) with ordinality e(change,idx)),
        (select array_agg(distinct q.title) from replaced q),
        (select string_agg(q.note,E'\n\n' order by q.created_at,q.id) from replaced q where q.created_at>now()-interval '24 hours'),
        (select q.sender_id from replaced q where q.note is not null and q.created_at>now()-interval '24 hours' order by q.created_at desc,q.id desc limit 1)
      into earlier,kinds,notes,sender;
    note=nullif(concat_ws(E'\n\n',notes,note),'');
    merged='[]';
    foreach f in array array['starts_at','location','address'] loop
      newest=(select e.change from jsonb_array_elements(fresh) e(change) where e.change->>'field'=f);
      oldest=(select e.change from jsonb_array_elements(earlier) with ordinality e(change,idx) where e.change->>'field'=f order by e.idx limit 1);
      latest=(select e.change from jsonb_array_elements(earlier) with ordinality e(change,idx) where e.change->>'field'=f order by e.idx desc limit 1);
      -- The address only goes to those who read it now, its former value only if they could read it then.
      continue when coalesce(newest,oldest) is null or (f='address' and not r.reads_now);
      former=coalesce(oldest,newest)->'before';latter=coalesce(newest,latest)->'after';
      continue when former is not null and case when f='starts_at' then (former#>>'{}')::timestamptz=(latter#>>'{}')::timestamptz else former=latter end;
      merged=merged||jsonb_build_array(jsonb_build_object('field',f,'after',latter)||case when former is null then '{}'::jsonb else jsonb_build_object('before',former) end);
    end loop;
    continue when jsonb_array_length(merged)=0 and note is null;
    -- A venue's message merged with a game's own takes the general wording.
    heading=p_title;message=p_body;
    if kinds<>array[p_title] then heading='Les informations de ta session ont changé';message='Vérifie ce qui change avant de venir.'; end if;
    insert into public.notifications(user_id,session_id,title,body,changes,note,sender_id)
      values(r.recipient,p_session,heading,concat_ws(E'\n\n',
        -- Nothing this person reads changed: the note is the message, passed on to the people they bring.
        case when jsonb_array_length(merged)=0 then 'Transmets ce message à '||r.guests||'.' else message||coalesce(' Préviens '||r.guests||'.','') end,
        note),merged,note,case when note is not null then coalesce(writer,sender) end);
  end loop;
end; $$;

-- Same as the change details migration, except that the date may be past, and that the organizer's note goes with the
-- message about the change. A game whose new date has passed writes to nobody.
create or replace function public.save_session(p_data jsonb) returns uuid language plpgsql security definer set search_path = '' as $$
declare sid uuid; occupied integer; v public.venues; previous public.sessions; previous_address text; changed jsonb='[]';
  starts timestamptz; note text; writer text;
begin
  if not public.is_organizer() then raise exception 'Accès organisateur requis.'; end if;
  p_data=jsonb_build_object('capacity',15)||p_data;
  starts=(p_data->>'starts_at')::timestamptz;
  if starts is null then raise exception 'Choisis le jour et l’heure du début.'; end if;
  -- Cleaned as in send_session_message: line endings typed in a browser arrive as CRLF; control characters and the
  -- direction marks that could disguise a link in a plain-text e-mail are dropped, spaces at both ends trimmed.
  note=replace(replace(coalesce(p_data->>'note',''),E'\r\n',E'\n'),E'\r',E'\n');
  note=btrim(regexp_replace(note,'[\x01-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F‎‏‪-‮⁦-⁩]','','g'),E' \t\n');
  if char_length(note)>2000 then raise exception 'Le message aux inscrits tient en 2000 caractères au plus.'; end if;
  if nullif(p_data->>'venue_id','') is not null then
    select * into v from public.venues where id=(p_data->>'venue_id')::uuid for share;
    if v.id is null then raise exception 'Ce lieu n’est plus dans la liste. Choisis-en un autre.'; end if;
    p_data=p_data||jsonb_build_object('location',v.name,'address',v.address);
  end if;
  sid=nullif(p_data->>'id','')::uuid;
  if sid is not null then
    select * into previous from public.sessions where id=sid for update;
    if previous.id is null then raise exception 'Session introuvable.'; end if;
    select address into previous_address from public.session_addresses where session_id=sid;
    select count(*) into occupied from public.bookings where session_id=sid and (status='confirmed' or (status='offered' and offer_expires_at>now()));
    if occupied>(p_data->>'capacity')::integer then raise exception 'La capacité ne peut pas être inférieure aux places déjà réservées.'; end if;
    -- Travellers, and the friends they bring, cannot see a members-only session.
    if previous.visibility='public' and p_data->>'visibility'='members'
      and exists(select 1 from public.bookings b left join public.profiles p on p.id=b.user_id where b.session_id=sid
        and b.status in ('pending','confirmed','offered','waitlisted') and (p.membership='newcomer' or (b.user_id is null and b.pool='newcomer')))
      then raise exception 'Des voyageurs sont inscrits : garde cette session publique.'; end if;
    update public.sessions set title=p_data->>'title', description=p_data->>'description',script=p_data->>'script',
      starts_at=starts,ends_at=(p_data->>'ends_at')::timestamptz,
      location=p_data->>'location',venue_id=v.id,capacity=(p_data->>'capacity')::integer,
      -- The site no longer sends the former quotas; the previous one still does.
      newcomer_seats=least(coalesce((p_data->>'newcomer_seats')::integer,newcomer_seats),(p_data->>'capacity')::integer),
      release_hours=coalesce((p_data->>'release_hours')::integer,release_hours),
      beginners_welcome=(p_data->>'beginners_welcome')::boolean,visibility=p_data->>'visibility' where id=sid;
    -- A message about a game that has started would never leave: nobody is written to.
    if starts>now() then
      if note<>'' then
        -- Ten a day per organizer, with the messages to the people registered. rate_guard's own refusal speaks of minutes.
        begin
          perform public.rate_guard('session_message',10,86400);
        exception when raise_exception then
          raise exception 'Tu as déjà envoyé 10 messages aujourd’hui : enregistre sans message, ou réessaie demain.';
        end;
        select display_name into writer from public.profiles where id=auth.uid();
        note='Message de '||coalesce(nullif(btrim(writer),''),'l’organisation')||E' :\n'||note;
      end if;
      -- Only a change of date or place is written to the people registered: a new name or more seats is not, unless
      -- the organizer adds a note.
      if previous.starts_at is distinct from starts then
        changed=changed||jsonb_build_array(jsonb_build_object('field','starts_at','before',previous.starts_at,'after',starts));
      end if;
      if previous.location is distinct from p_data->>'location' then
        changed=changed||jsonb_build_array(jsonb_build_object('field','location','before',previous.location,'after',p_data->>'location'));
      end if;
      perform public.notify_session_change(sid,'Les informations de ta session ont changé','Vérifie ce qui change avant de venir.',changed,
        case when coalesce(previous_address,'') is distinct from coalesce(p_data->>'address','')
          then jsonb_build_object('field','address','before',coalesce(previous_address,''),'after',coalesce(p_data->>'address','')) end,
        previous.starts_at,nullif(note,''));
    end if;
  else
    insert into public.sessions(title,description,script,starts_at,ends_at,location,venue_id,capacity,newcomer_seats,release_hours,beginners_welcome,visibility,created_by)
      values(p_data->>'title',p_data->>'description',p_data->>'script',starts,(p_data->>'ends_at')::timestamptz,
      p_data->>'location',v.id,(p_data->>'capacity')::integer,coalesce((p_data->>'newcomer_seats')::integer,0),coalesce((p_data->>'release_hours')::integer,0),
      (p_data->>'beginners_welcome')::boolean,p_data->>'visibility',auth.uid()) returning id into sid;
  end if;
  insert into public.session_addresses(session_id,address) values(sid,coalesce(p_data->>'address','')) on conflict(session_id) do update set address=excluded.address;
  -- More seats let the people waiting in; rebalance moves nobody into a game about to start or past.
  perform public.rebalance(sid);
  return sid;
end; $$;

-- The helper only runs inside save_session and save_venue: nobody may write messages to the people registered through it.
revoke execute on function public.notify_session_change(uuid,text,text,jsonb,jsonb,timestamptz,text) from public,anon,authenticated;
