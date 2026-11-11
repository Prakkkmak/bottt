-- An organizer registered for the game they edit gets the message about the change like everyone else, but it came
-- without the few words they had added for the people registered: reading it, they could only think their note had not
-- left. The message they get now carries their note too, so that it shows what the others read. A note with nothing
-- they read changed still writes them nothing: their own words alone would tell them nothing new.

-- Same as the past dates and change notes migration, except for the note of the writer in their own message.
create or replace function public.notify_session_change(p_session uuid,p_title text,p_body text,p_changes jsonb,p_address jsonb,p_previous_start timestamptz,p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare r record; fresh jsonb; earlier jsonb; kinds text[]; notes text; note text; sender uuid; writer uuid; merged jsonb; heading text; message text; f text; newest jsonb; oldest jsonb; latest jsonb; former jsonb; latter jsonb;
  mine boolean;
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
    mine=r.recipient is not distinct from auth.uid();
    note=nullif(p_note,'');
    writer=case when note is not null then auth.uid() end;
    -- Its writer is not written to about their note alone: they have just written it.
    continue when jsonb_array_length(fresh)=0 and (note is null or mine);
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
    -- Its writer reads their note with a change they read, never alone; the notes written before it stay in either case.
    if mine and jsonb_array_length(merged)=0 then note=null;writer=null; end if;
    note=nullif(concat_ws(E'\n\n',notes,note),'');
    continue when jsonb_array_length(merged)=0 and note is null;
    -- A venue's message merged with a game's own takes the general wording.
    heading=p_title;message=p_body;
    if kinds<>array[p_title] then heading='Les informations de ta session ont changé';message='Vérifie ce qui change avant de venir.'; end if;
    -- Nothing this person reads changed: the subject does not say otherwise.
    if jsonb_array_length(merged)=0 then heading='Un mot sur ta session'; end if;
    insert into public.notifications(user_id,session_id,title,body,changes,note,sender_id)
      values(r.recipient,p_session,heading,concat_ws(E'\n\n',
        -- Nothing this person reads changed: the note is the message, passed on to the people they bring.
        case when jsonb_array_length(merged)=0 then 'Transmets ce message à '||r.guests||'.' else message||coalesce(' Préviens '||r.guests||'.','') end,
        note),merged,note,case when note is not null then coalesce(writer,sender) end);
  end loop;
end; $$;

-- Replaced functions keep their grants; said again so that the rule holds whatever ran before.
revoke execute on function public.notify_session_change(uuid,text,text,jsonb,jsonb,timestamptz,text) from public,anon,authenticated;
