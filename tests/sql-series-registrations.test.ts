import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDatabase,uuid} from './sql-harness';
import {fromParisInput,parisInput} from '../lib/utils';

const today=parisInput(new Date().toISOString()).slice(0,10);
const day=(days:number)=>{const d=new Date(`${today}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);};
const at=(days:number,hour='19:30')=>fromParisInput(`${day(days)}T${hour}`);
const series=(changes:Record<string,unknown>={})=>{const starts=String(changes.starts_at??at(2));return {title:'Soirée du mercredi',script:'Trouble Brewing',starts_at:starts,ends_at:new Date(Date.parse(starts)+4*3600000).toISOString(),
  location:'Le local',address:'1 rue du Port',venue_id:null,capacity:16,visibility:'public',every_weeks:1,weeks_ahead:4,ends_on:null,...changes};};
type Listed={id:string;series_id:string|null;series:{every_weeks:number;first_date:string}|null;my_series:{self:boolean;guests:string[]}|null;my_status:string|null;my_guests:{name:string;status:string}[]};
type Saved={changed:boolean;regular:boolean;dates?:number;confirmed?:number;waitlisted?:number;already?:number;skipped?:number;released?:number};

test('Venir à chaque date d’une partie récurrente',async t=>{
  const h=await createDatabase();
  for(const [n,m] of [[1,'organizer'],[2,'member'],[3,'newcomer'],[4,'member'],[5,'member'],[6,'member'],[7,'member'],[8,'member'],[9,'member']] as const)await h.user(n,m);
  const createSeries=async(changes:Record<string,unknown>={})=>{await h.login(1);return (await h.call<{save_series:string}>('select save_series($1)',[series(changes)]))[0].save_series;};
  const dates=async(id:string)=>{await h.root();return h.call<{id:string;starts_at:string}>('select id,starts_at::text from sessions where series_id=$1 and status=$2 order by starts_at',[id,'published']);};
  const listed=async(n:number|null,id:string)=>{if(n===null)await h.anonymous();else await h.login(n);return (await h.call<{list_sessions:Listed[]}>('select list_sessions()'))[0].list_sessions.filter(s=>s.series_id===id);};
  const save=async(n:number,session:string,self:boolean,guests:string[]=[],release=false)=>{await h.login(n);return (await h.call<{save_series_registration:Saved}>('select save_series_registration($1,$2,$3,$4)',[session,self,guests,release]))[0].save_series_registration;};
  const bookings=async(session:string,n:number)=>{await h.root();return h.call<{who:string;status:string}>(`select coalesce(guest_name,'self') as who,status from bookings where session_id=$1 and (user_id=$2 or sponsor_id=$2) order by guest_name nulls first`,[session,uuid(n)]);};
  const notices=async(n:number)=>{await h.root();return h.call<{title:string;body:string;kind:string;session_id:string|null}>('select title,body,kind,session_id from notifications where user_id=$1 order by created_at,id',[uuid(n)]);};
  const openNextWeek=async(id:string,weeks=1)=>{await h.root();await h.call('update session_series set weeks_ahead=weeks_ahead+$2 where id=$1',[id,weeks]);return (await h.call<{extend_series:number}>('select extend_series($1)',[id]))[0].extend_series;};
  let weekly='';

  await t.test('une partie récurrente le dit, à tout le monde',async()=>{
    weekly=await createSeries();
    const seen=await listed(null,weekly);
    assert.equal(seen.length,4);
    assert.ok(seen.every(s=>s.series?.every_weeks===1&&s.series.first_date===day(2)&&s.my_series===null));
    // A game on its own carries no series.
    await h.session(uuid(500));
    await h.anonymous();
    const alone=(await h.call<{list_sessions:Listed[]}>('select list_sessions()'))[0].list_sessions.find(s=>s.id===uuid(500))!;
    assert.equal(alone.series,null);
  });

  await t.test('s’inscrire à chaque date, avec un invité, prend les places des dates déjà ouvertes',async()=>{
    const [first,second]=await dates(weekly);
    const result=await save(2,second.id,true,['Antoine']);
    assert.deepEqual(result,{changed:true,regular:true,dates:4,confirmed:8,waitlisted:0,already:0,skipped:0,released:0});
    for(const d of await dates(weekly))assert.deepEqual(await bookings(d.id,2),[{who:'self',status:'confirmed'},{who:'Antoine',status:'confirmed'}]);
    const seen=await listed(2,weekly);
    assert.ok(seen.every(s=>s.my_series?.self===true&&s.my_series.guests.join()==='Antoine'));
    assert.equal(seen.find(s=>s.id===first.id)!.my_status,'confirmed');
    // One e-mail sums it up, not one per date.
    const mail=await notices(2);
    assert.equal(mail.length,1);
    assert.equal(mail[0].title,'Inscription à chaque date enregistrée');
    assert.equal(mail[0].kind,'booking');assert.equal(mail[0].session_id,null);
    assert.match(mail[0].body,/« Soirée du mercredi » \(chaque [a-z]+\), une place est prise automatiquement pour toi et Antoine\. Aux dates déjà ouvertes : 8 places prises\./);
    // Others see nothing of it.
    assert.ok((await listed(4,weekly)).every(s=>s.my_series===null));
  });

  await t.test('rien ne change sans changement, et un nom retapé garde son rang',async()=>{
    const [first]=await dates(weekly);
    assert.deepEqual(await save(2,first.id,true,['Antoine']),{changed:false,regular:true});
    assert.deepEqual(await save(2,first.id,true,['ANTOINE']),{changed:true,regular:true});
    assert.equal((await notices(2)).length,1);
    assert.deepEqual((await listed(2,weekly))[0].my_series,{self:true,guests:['ANTOINE']});
    await save(2,first.id,true,['Antoine']);
  });

  await t.test('se désister d’une date garde les suivantes, et cette date n’est pas reprise',async()=>{
    const [,second]=await dates(weekly);
    await h.login(2);await h.call('select leave_session($1,$2)',[second.id,[]]);
    assert.deepEqual(await bookings(second.id,2),[{who:'self',status:'cancelled'},{who:'Antoine',status:'confirmed'}]);
    // A guest added later is taken in at the other dates; the date given up stays given up, without the people brought there.
    const result=await save(2,second.id,true,['Antoine','Léa']);
    assert.equal(result.confirmed,3);assert.equal(result.skipped,1);
    assert.deepEqual(await bookings(second.id,2),[{who:'self',status:'cancelled'},{who:'Antoine',status:'confirmed'}]);
    // The receipt not sent yet gives way to the new one.
    const receipts=(await notices(2)).filter(m=>m.title.startsWith('Inscription à chaque date'));
    assert.equal(receipts.length,1);
    assert.match(receipts[0].body,/pour toi, Antoine et Léa\. Aux dates déjà ouvertes : 3 places prises\./);
    await assert.rejects(save(2,second.id,true,['Antoine','Léa','Yann']),/2 invité·es au plus/);
    await assert.rejects(save(2,second.id,true,['Antoine','antoine','ANTOINE']),/2 invité·es au plus/);
    await assert.rejects(save(2,second.id,true,['A']),/2 à 40 caractères/);
  });

  await t.test('chaque nouvelle date prend aussitôt les habitués, sans e-mail quand il y a de la place',async()=>{
    await save(4,(await dates(weekly))[0].id,true);
    const before=(await notices(2)).length;
    assert.equal(await openNextWeek(weekly),1);
    const fresh=(await dates(weekly)).at(-1)!;
    assert.deepEqual(await bookings(fresh.id,2),[{who:'self',status:'confirmed'},{who:'Antoine',status:'confirmed'},{who:'Léa',status:'confirmed'}]);
    assert.deepEqual(await bookings(fresh.id,4),[{who:'self',status:'confirmed'}]);
    // The reminder of the day before is enough.
    assert.equal((await notices(2)).length,before);
    // The organizer is not told about moves nobody made.
    await h.root();assert.equal((await h.call(`select 1 from notifications where kind='activity'`)).length,0);
  });

  await t.test('plusieurs dates qui ouvrent ensemble prennent les habitués à chacune',async()=>{
    const before=(await notices(4)).length;
    assert.equal(await openNextWeek(weekly,2),2);
    const [first,second]=(await dates(weekly)).slice(-2);
    for(const d of [first,second])assert.deepEqual(await bookings(d.id,4),[{who:'self',status:'confirmed'}]);
    assert.equal((await notices(4)).length,before);
  });

  await t.test('une date complète met les derniers inscrits en liste d’attente, dans l’ordre des inscriptions',async()=>{
    const small=await createSeries({capacity:7,starts_at:at(3),weeks_ahead:1});
    const [first]=await dates(small);
    for(const n of [5,6,7])await save(n,first.id,true,[`Ami ${n}`]);
    // 6 seats taken; the 7th goes to the next regular, then the queue.
    await save(8,first.id,true);await save(9,first.id,true);
    assert.deepEqual(await bookings(first.id,8),[{who:'self',status:'confirmed'}]);
    assert.deepEqual(await bookings(first.id,9),[{who:'self',status:'waitlisted'}]);
    // The next date takes them in the order they registered.
    await openNextWeek(small);
    const next=(await dates(small)).at(-1)!;
    assert.deepEqual(await bookings(next.id,8),[{who:'self',status:'confirmed'}]);
    assert.deepEqual(await bookings(next.id,9),[{who:'self',status:'waitlisted'}]);
    const mail=(await notices(9)).at(-1)!;
    assert.equal(mail.title,'Nouvelle date : liste d’attente');
    assert.equal(mail.session_id,next.id);
    assert.match(mail.body,/\nToi : n° 1 sur la liste d’attente\n/);
    // Seated, player 8 hears nothing; several full dates make one e-mail for player 9.
    const [seated,waiting]=[(await notices(8)).length,(await notices(9)).length];
    assert.equal(await openNextWeek(small,2),2);
    const [third]=(await dates(small)).slice(-2);
    assert.equal((await notices(8)).length,seated);
    const more=(await notices(9)).slice(waiting);
    assert.equal(more.length,1);
    assert.equal(more[0].title,'Nouvelles dates : liste d’attente');
    assert.equal(more[0].session_id,third.id);
    assert.match(more[0].body,/mais 2 des nouvelles dates qui ouvrent sont déjà complètes : 2 inscriptions sont en liste d’attente\./);
    assert.ok(more[0].body.endsWith('\n\nLa première de ces dates :'));
  });

  await t.test('les invités pris ainsi restent dans les limites de chaque date',async()=>{
    const crowded=await createSeries({starts_at:at(6),weeks_ahead:1});
    const [first]=await dates(crowded);
    // Two people already brought by hand at this date: the one the registration brings is not added on top.
    await h.login(5);for(const name of ['Paul','Tom'])await h.call('select add_guest($1,$2)',[first.id,name]);
    const result=await save(5,first.id,true,['Zoé']);
    assert.equal(result.skipped,1);
    assert.deepEqual((await bookings(first.id,5)).map(b=>b.who),['self','Paul','Tom']);
  });

  await t.test('arrêter garde les places prises, ou les libère pour la liste d’attente',async()=>{
    const [small,second]=await dates(weekly);
    const result=await save(4,second.id,false);
    assert.equal(result.regular,false);assert.equal(result.released,0);
    for(const d of await dates(weekly))assert.deepEqual(await bookings(d.id,4),[{who:'self',status:'confirmed'}]);
    assert.equal((await notices(4)).at(-1)!.title,'Inscription à chaque date arrêtée');
    // Player 2 stops for Léa only and releases her places.
    const partial=await save(2,small.id,true,['Antoine'],true);
    assert.equal(partial.released,6);assert.equal(partial.regular,true);
    for(const d of await dates(weekly))assert.ok((await bookings(d.id,2)).every(b=>b.who!=='Léa'||b.status==='cancelled'));
    assert.deepEqual((await listed(2,weekly))[0].my_series,{self:true,guests:['Antoine']});
    // Stopping entirely with release frees every place the registration covered; the waiting list moves in.
    await save(2,small.id,false,[],true);
    for(const d of await dates(weekly))assert.ok((await bookings(d.id,2)).every(b=>b.status==='cancelled'));
    assert.match((await notices(2)).at(-1)!.body,/inscriptions aux prochaines dates sont retirées/);
    assert.ok((await listed(2,weekly)).every(s=>s.my_series===null));
  });

  await t.test('l’organisateur l’apprend en un message, pas un par date',async()=>{
    await h.login(1);await h.call('select save_notification_choices($1)',[{activity:true}]);
    const all=await dates(weekly);
    const activity=async()=>{await h.root();return h.call<{title:string;body:string;session_id:string}>(`select title,body,session_id from notifications where user_id=$1 and kind='activity' order by created_at,id`,[uuid(1)]);};
    await save(8,all[3].id,true);
    assert.deepEqual(await activity(),[{title:'Inscription à chaque date',body:`Joueur 8 vient à chaque date : ${all.length} places prises aux prochaines dates.`,session_id:all[0].id}]);
    await save(8,all[3].id,false,[],true);
    assert.deepEqual(await activity(),[{title:'Inscriptions et désistements',session_id:all[0].id,
      body:`Joueur 8 vient à chaque date : ${all.length} places prises aux prochaines dates.\nJoueur 8 ne vient plus à chaque date : ${all.length} inscriptions retirées aux prochaines dates.`}]);
    // A booking of one date is told as before.
    await h.login(9);await h.call('select book_session($1)',[all.at(-1)!.id]);
    assert.deepEqual((await activity()).map(m=>[m.title,m.session_id]),[['Inscriptions et désistements',all[0].id],['Nouvelle inscription',all.at(-1)!.id]]);
  });

  await t.test('on ne s’inscrit qu’aux séries en cours et que l’on peut voir',async()=>{
    await assert.rejects(save(2,uuid(500),true),/ne revient pas/);
    const members=await createSeries({visibility:'members',starts_at:at(4)});
    const [first]=await dates(members);
    await assert.rejects(save(3,first.id,true),/inaccessible/);
    // Stopped, a series takes nobody in, but can still be cut down or left.
    await save(4,first.id,true,['Inès']);
    await h.login(1);await h.call('select stop_series($1)',[members]);
    await assert.rejects(save(2,first.id,true),/arrêtée/);
    await assert.rejects(save(4,first.id,true,['Inès','Yann']),/arrêtée/);
    assert.equal((await save(4,first.id,true)).regular,true);
    assert.ok((await listed(4,members)).every(s=>s.series===null&&s.my_series?.self===true&&s.my_series.guests.length===0));
    assert.equal((await save(4,first.id,false)).regular,false);
    assert.ok((await listed(4,members)).every(s=>s.series===null&&s.my_series===null));
    // A series past its last day opens nothing more either.
    const ending=await createSeries({starts_at:at(4,'21:00')});
    const [last]=await dates(ending);
    await h.root();await h.call('update session_series set first_date=$2,ends_on=$2 where id=$1',[ending,day(-1)]);
    await assert.rejects(save(2,last.id,true),/arrêtée/);
    assert.ok((await listed(2,ending)).every(s=>s.series===null));
  });

  await t.test('un voyageur sur une série passée aux membres n’est plus pris',async()=>{
    const open=await createSeries({starts_at:at(5),weeks_ahead:1});
    const [first]=await dates(open);
    assert.equal((await save(3,first.id,true,['Nora'])).confirmed,2);
    await h.root();await h.call(`update session_series set visibility='members' where id=$1`,[open]);
    await openNextWeek(open);
    const next=(await dates(open)).at(-1)!;
    assert.deepEqual(await bookings(next.id,3),[]);
  });

  await t.test('les e-mails coupés ne partent pas, mais l’inscription se fait',async()=>{
    await h.login(6);await h.call('select save_notification_choices($1)',[{booking:false}]);
    const before=(await notices(6)).length;
    const small=(await h.call<{series_id:string}>(`select series_id from sessions s join bookings b on b.session_id=s.id where b.user_id=$1 limit 1`,[uuid(6)]))[0].series_id;
    await openNextWeek(small);
    const next=(await dates(small)).at(-1)!;
    assert.deepEqual(await bookings(next.id,6),[{who:'self',status:'confirmed'},{who:'Ami 6',status:'confirmed'}]);
    assert.equal((await notices(6)).length,before);
  });

  await t.test('une inscription à chaque date part 30 jours après l’arrêt ou la fin de sa série',async()=>{
    await h.root();
    const seriesOf=async(n:number)=>(await h.call<{series_id:string}>('select distinct series_id from series_registrations where user_id=$1',[uuid(n)])).map(r=>r.series_id);
    const [open]=await seriesOf(3);const [small]=await seriesOf(9);
    await h.call(`update session_series set stopped_at=now()-interval '29 days' where id=$1`,[open]);
    await h.call('update session_series set first_date=$2,ends_on=$2 where id=$1',[small,day(-29)]);
    await h.call('select maintenance()');
    assert.deepEqual([(await seriesOf(3)).length,(await seriesOf(9)).length],[1,1]);
    await h.call(`update session_series set stopped_at=now()-interval '31 days' where id=$1`,[open]);
    await h.call('update session_series set first_date=$2,ends_on=$2 where id=$1',[small,day(-31)]);
    await h.call('select maintenance()');
    assert.deepEqual([await seriesOf(3),await seriesOf(9)],[[],[]]);
    // A series still running keeps its regulars.
    assert.equal((await seriesOf(5)).length,1);
  });

  await t.test('les inscriptions récurrentes passent par la fonction, et chacun ne lit que les siennes',async()=>{
    await h.login(2);
    await assert.rejects(h.call(`insert into series_registrations(series_id,user_id) values($1,$2)`,[weekly,uuid(2)]),/permission denied/i);
    await assert.rejects(h.call('select seat_regulars($1)',[uuid(500)]),/permission denied/i);
    await assert.rejects(h.call('select welcome_regulars($1)',[[uuid(500)]]),/permission denied/i);
    await h.login(4);await save(4,(await dates(weekly))[0].id,true);
    await h.login(2);assert.equal((await h.call('select * from series_registrations')).length,0);
    await h.login(1);assert.ok((await h.call('select * from series_registrations')).length>0);
    await h.anonymous();
    await assert.rejects(h.call('select * from series_registrations'),/permission denied/i);
    await assert.rejects(h.call('select save_series_registration($1,true)',[uuid(500)]),/permission denied/i);
  });
});
