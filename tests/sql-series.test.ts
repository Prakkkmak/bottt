import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDatabase,uuid} from './sql-harness';
import {fromParisInput,parisInput} from '../lib/utils';

type Game={id:string;starts_at:string;ends_at:string;location:string;venue_id:string|null;series_id:string|null;status:string};
const today=parisInput(new Date().toISOString()).slice(0,10);
const day=(days:number)=>{const d=new Date(`${today}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);};
const at=(days:number,hour='19:30')=>fromParisInput(`${day(days)}T${hour}`);
const series=(changes:Record<string,unknown>={})=>{const starts=String(changes.starts_at??at(2));return {title:'',script:'Trouble Brewing',starts_at:starts,ends_at:new Date(Date.parse(starts)+4*3600000).toISOString(),
  location:'Le local',address:'1 rue du Port',venue_id:null,capacity:16,visibility:'public',every_weeks:1,weeks_ahead:4,ends_on:null,...changes};};

test('Parties récurrentes',async t=>{
  const h=await createDatabase();
  for(const [n,m] of [[1,'organizer'],[2,'member'],[3,'newcomer'],[4,'member']] as const)await h.user(n,m);
  const games=async(id:string)=>{await h.root();return h.call<Game>(`select id,starts_at::text,ends_at::text,location,venue_id,series_id,status from sessions where series_id=$1 order by starts_at`,[id]);};
  const parisTimes=async(id:string)=>{await h.root();return (await h.call<{t:string}>(`select to_char(starts_at at time zone 'Europe/Paris','Dy HH24:MI') as t from sessions where series_id=$1 order by starts_at`,[id])).map(r=>r.t);};
  const save=async(data:Record<string,unknown>)=>(await h.call<{save_series:string}>('select save_series($1)',[data]))[0].save_series;
  let weekly='';

  await t.test('seul un organisateur crée une série, et personne d’autre ne la lit',async()=>{
    for(const n of [2,3]){await h.login(n);await assert.rejects(save(series()),/organisateur/);await assert.rejects(h.call('select stop_series($1)',[uuid(999)]),/organisateur/);}
    await h.anonymous();await assert.rejects(save(series()),/permission denied/i);
    await h.login(1);weekly=await save(series());
    // The series holds the private address: only organizers read it, and nobody writes to it directly.
    assert.equal((await h.call('select * from session_series')).length,1);
    await h.login(2);assert.equal((await h.call('select * from session_series')).length,0);
    await assert.rejects(h.call(`insert into session_series(script,location,capacity,visibility,first_date,starts_local,duration,created_by) values('x','y',8,'public',current_date,'19:30','4 hours',$1)`,[uuid(2)]),/permission denied/i);
    await h.anonymous();await assert.rejects(h.call('select * from session_series'),/permission denied/i);
    // Opening the next dates is the scheduled job's, with the service key.
    for(const as of [()=>h.login(1),()=>h.anonymous()]){await as();await assert.rejects(h.call('select extend_series()'),/permission denied/i);}
  });

  await t.test('une série hebdomadaire ouvre ses dates quatre semaines à l’avance, chacune à 19 h 30 heure de Paris',async()=>{
    const listed=await games(weekly);
    // 2, 9, 16 and 23 days from now; the date 30 days away opens later.
    assert.deepEqual(listed.map(g=>Date.parse(g.starts_at)),[2,9,16,23].map(n=>Date.parse(at(n))));
    assert.ok(listed.every(g=>Date.parse(g.ends_at)-Date.parse(g.starts_at)===4*3600000&&g.location==='Le local'&&g.status==='published'));
    assert.ok((await parisTimes(weekly)).every(t=>t.endsWith('19:30')));
    assert.deepEqual((await h.call<{address:string}>('select distinct address from session_addresses a join sessions s on s.id=a.session_id where s.series_id=$1',[weekly])).map(r=>r.address),['1 rue du Port']);
    // Each date is a game like any other: players see it and book it.
    await h.login(3);
    const seen=(await h.call<{list_sessions:{id:string;series_id:string}[]}>('select list_sessions()'))[0].list_sessions.filter(s=>s.series_id===weekly);
    assert.equal(seen.length,4);
    assert.equal((await h.call<{book_session:string}>('select book_session($1)',[listed[1].id]))[0].book_session,'confirmed');
    // Calling again creates nothing more.
    await h.root();await h.db.exec('set role service_role');
    assert.equal((await h.call<{extend_series:number}>('select extend_series()'))[0].extend_series,0);
    assert.equal((await games(weekly)).length,4);
  });

  await t.test('une date se modifie ou se supprime seule, et n’est pas recréée',async()=>{
    const [first,,third]=await games(weekly);
    await h.login(1);
    await h.call('select save_session($1)',[{...series({starts_at:at(3,'20:00')}),id:first.id,description:'',beginners_welcome:true}]);
    await h.call('select delete_session($1)',[third.id]);
    await h.root();await h.call('select extend_series()');
    const after=await games(weekly);
    assert.deepEqual(after.map(g=>Date.parse(g.starts_at)),[Date.parse(at(3,'20:00')),Date.parse(at(9)),Date.parse(at(23))]);
  });

  await t.test('une date déplacée sur un jour suivant de la série n’y est pas doublée',async()=>{
    await h.login(1);
    const id=await save(series({starts_at:at(1),weeks_ahead:2}));
    const [first,second]=await games(id);
    await h.login(1);
    await h.call('select save_session($1)',[{...series({starts_at:at(15)}),id:second.id,description:'',beginners_welcome:true}]);
    // Weeks later the window reaches that day: the moved game stands for it, and the next dates still open.
    await h.root();await h.call('update session_series set weeks_ahead=4 where id=$1',[id]);await h.call('select extend_series($1)',[id]);
    assert.deepEqual((await games(id)).map(g=>Date.parse(g.starts_at)),[first.starts_at,at(15),at(22)].map(t=>Date.parse(t)));
  });

  await t.test('les dates passées sans traitement sont sautées, les suivantes s’ouvrent',async()=>{
    await h.root();
    const [{id}]=await h.call<{id:string}>(`insert into session_series(script,location,capacity,visibility,first_date,starts_local,duration,weeks_ahead,created_by)
      values('Bad Moon Rising','Le local',12,'public',$1,'19:30','4 hours',2,$2) returning id`,[day(-21),uuid(1)]);
    await h.call('select extend_series($1)',[id]);
    // The dates still to come within two weeks: today's or the one in two weeks (a change of hour can let in both), and next week's.
    const now=Date.now();
    const expected=[-21,-14,-7,0,7,14,21].map(n=>Date.parse(at(n))).filter(t=>t>now&&t<=now+14*86400000);
    assert.deepEqual((await games(id)).map(g=>Date.parse(g.starts_at)),expected);
    assert.ok(expected.includes(Date.parse(at(7))));
  });

  await t.test('la série d’un organisateur qui perd son rang n’ouvre plus de date',async()=>{
    await h.user(5,'organizer');await h.login(5);
    const id=await save(series({starts_at:at(1),weeks_ahead:1}));
    assert.equal((await games(id)).length,1);
    await h.root();await h.call(`update profiles set membership='suspended' where id=$1`,[uuid(5)]);
    await h.call('update session_series set weeks_ahead=12 where id=$1',[id]);
    assert.equal((await h.call<{extend_series:number}>('select extend_series($1)',[id]))[0].extend_series,0);
    await h.call(`update profiles set membership='organizer' where id=$1`,[uuid(5)]);
    assert.ok((await h.call<{extend_series:number}>('select extend_series($1)',[id]))[0].extend_series>0);
  });

  await t.test('une série un mercredi sur deux s’arrête à sa dernière date, et la première date s’ouvre même lointaine',async()=>{
    await h.login(1);
    const fortnight=await save(series({starts_at:at(5),every_weeks:2,weeks_ahead:12,ends_on:day(19)}));
    assert.deepEqual((await games(fortnight)).map(g=>Date.parse(g.starts_at)),[at(5),at(19)].map(Date.parse));
    await h.login(1);const later=await save(series({starts_at:at(60),weeks_ahead:2}));
    assert.deepEqual((await games(later)).map(g=>Date.parse(g.starts_at)),[Date.parse(at(60))]);
  });

  await t.test('les valeurs impossibles sont refusées en français',async()=>{
    await h.login(1);
    await assert.rejects(save(series({every_weeks:3})),/rythme/);
    await assert.rejects(save(series({weeks_ahead:0})),/ouvertes/);
    await assert.rejects(save(series({weeks_ahead:13})),/ouvertes/);
    await assert.rejects(save(series({ends_on:day(1)})),/dernière date/);
    await assert.rejects(save(series({starts_at:at(-1)})),/date à venir/);
    await assert.rejects(save({...series(),ends_at:at(2)}),/après le début/);
    await assert.rejects(save(series({venue_id:uuid(998)})),/plus dans la liste/);
  });

  await t.test('une série réservée aux membres reste invisible des voyageurs',async()=>{
    await h.login(1);const members=await save(series({visibility:'members',starts_at:at(4)}));
    await h.login(3);
    assert.equal((await h.call<{list_sessions:{series_id:string}[]}>('select list_sessions()'))[0].list_sessions.filter(s=>s.series_id===members).length,0);
    await h.login(2);
    assert.equal((await h.call<{list_sessions:{series_id:string}[]}>('select list_sessions()'))[0].list_sessions.filter(s=>s.series_id===members).length,4);
  });

  await t.test('une série au lieu enregistré en suit le nom et l’adresse, même une fois le lieu supprimé',async()=>{
    await h.login(1);
    const venue=(await h.call<{save_venue:string}>(`select save_venue('{"name":"Le Grenier","address":"2 rue Haute"}'::jsonb)`))[0].save_venue;
    const atVenue=await save(series({venue_id:venue,location:'ignoré',address:'ignorée',starts_at:at(6)}));
    assert.ok((await games(atVenue)).every(g=>g.location==='Le Grenier'&&g.venue_id===venue));
    await h.login(1);
    await h.call(`select save_venue($1)`,[{id:venue,name:'Le Grenier du port',address:'3 rue Basse'}]);
    await h.call('select delete_venue($1)',[venue]);
    assert.deepEqual(await h.call('select location,address,venue_id from session_series where id=$1',[atVenue]),[{location:'Le Grenier du port',address:'3 rue Basse',venue_id:null}]);
    assert.ok((await games(atVenue)).every(g=>g.location==='Le Grenier du port'&&g.venue_id===null));
  });

  await t.test('arrêter une série retire ses dates sans inscrit et garde les autres',async()=>{
    const before=await games(weekly);
    await h.login(1);
    assert.deepEqual((await h.call<{stop_series:unknown}>('select stop_series($1)',[weekly]))[0].stop_series,{removed:before.length-1,kept:1});
    await assert.rejects(h.call('select stop_series($1)',[weekly]),/déjà arrêtée/);
    await h.root();
    assert.equal((await h.call('select 1 from session_series where id=$1',[weekly])).length,0);
    // The game someone booked stays, on its own, with its registration.
    const kept=await h.call<{series_id:string|null;status:string}>(`select s.series_id,b.status from sessions s join bookings b on b.session_id=s.id where b.user_id=$1`,[uuid(3)]);
    assert.deepEqual(kept,[{series_id:null,status:'confirmed'}]);
  });
});
