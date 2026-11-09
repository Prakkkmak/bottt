import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDatabase,uuid} from './sql-harness';
import {fromParisInput,parisInput} from '../lib/utils';

type Game={id:string;starts_at:string;ends_at:string;title:string;location:string;capacity:number;series_id:string|null};
type Result={resumed:boolean;updated:number;opened:number;removed:number;kept:number};
const today=parisInput(new Date().toISOString()).slice(0,10);
const day=(days:number)=>{const d=new Date(`${today}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);};
const at=(days:number,hour='19:30')=>fromParisInput(`${day(days)}T${hour}`);
const series=(changes:Record<string,unknown>={})=>{const starts=String(changes.starts_at??at(2));return {title:'',script:'Trouble Brewing',starts_at:starts,ends_at:new Date(Date.parse(starts)+4*3600000).toISOString(),
  location:'Le local',address:'1 rue du Port',venue_id:null,capacity:16,visibility:'public',every_weeks:1,weeks_ahead:4,ends_on:null,...changes};};
const times=(list:{starts_at:string}[])=>list.map(g=>Date.parse(g.starts_at));

test('Modifier une série',async t=>{
  const h=await createDatabase();
  for(const [n,m] of [[1,'organizer'],[2,'member'],[3,'newcomer'],[5,'organizer']] as const)await h.user(n,m);
  const games=async(id:string)=>{await h.root();return h.call<Game>(`select id,starts_at::text,ends_at::text,title,location,capacity,series_id from sessions where series_id=$1 and status='published' order by starts_at`,[id]);};
  const create=async(changes:Record<string,unknown>={},as=1)=>{await h.login(as);return (await h.call<{save_series:string}>('select save_series($1)',[series(changes)]))[0].save_series;};
  const edit=async(id:string,changes:Record<string,unknown>={},as=1)=>{await h.login(as);return (await h.call<{edit_series:Result}>('select edit_series($1)',[{...series(changes),id}]))[0].edit_series;};
  const book=async(n:number,game:string)=>{await h.login(n);return (await h.call<{book_session:string}>('select book_session($1)',[game]))[0].book_session;};

  await t.test('seul un organisateur modifie ou supprime une série',async()=>{
    const id=await create();
    for(const n of [2,3]){await h.login(n);await assert.rejects(edit(id,{},n),/organisateur/);await assert.rejects(h.call('select delete_series($1)',[id]),/organisateur/);}
    await h.anonymous();
    await assert.rejects(h.call('select edit_series($1)',[{...series(),id}]),/permission denied/i);
    await assert.rejects(h.call('select delete_series($1)',[id]),/permission denied/i);
  });

  await t.test('l’heure, le lieu et le nom changent pour toutes les dates à venir, chacune garde son jour, et les inscrits sont prévenus',async()=>{
    const id=await create();
    const [,second]=await games(id);
    assert.equal(await book(2,second.id),'confirmed');
    await h.root();await h.call('delete from notifications');
    const result=await edit(id,{starts_at:at(2,'20:30'),title:'Le mercredi',location:'La cave',address:'5 rue Haute',capacity:12});
    assert.deepEqual(result,{resumed:false,updated:4,opened:0,removed:0,kept:0});
    const listed=await games(id);
    assert.deepEqual(times(listed),[2,9,16,23].map(n=>Date.parse(at(n,'20:30'))));
    assert.ok(listed.every(g=>g.title==='Le mercredi'&&g.location==='La cave'&&g.capacity===12&&Date.parse(g.ends_at)-Date.parse(g.starts_at)===4*3600000));
    assert.deepEqual((await h.call<{address:string}>('select distinct address from session_addresses a join sessions s on s.id=a.session_id where s.series_id=$1',[id])).map(r=>r.address),['5 rue Haute']);
    // The member registered hears about the new hour, place and address of their game, once.
    const sent=await h.call<{user_id:string;session_id:string;changes:{field:string}[]}>('select user_id,session_id,changes from notifications');
    assert.deepEqual(sent.map(n=>[n.user_id,n.session_id,n.changes.map(c=>c.field)]),[[uuid(2),second.id,['starts_at','location','address']]]);
    // The next dates open with the new settings.
    await h.call('update session_series set weeks_ahead=5 where id=$1',[id]);await h.call('select extend_series($1)',[id]);
    const opened=(await games(id)).at(-1)!;
    assert.equal(Date.parse(opened.starts_at),Date.parse(at(30,'20:30')));
    assert.equal(opened.location,'La cave');
  });

  await t.test('une date changée à la main garde ce que la série ne change pas',async()=>{
    const id=await create();
    const [,second]=await games(id);
    // That date is for members, at someone's home, an hour later.
    await h.login(1);
    await h.call('select save_session($1)',[{...series({starts_at:at(9,'20:30'),visibility:'members',location:'Chez Alex',address:'12 rue Privée',capacity:10}),id:second.id,description:'',beginners_welcome:true}]);
    await h.root();await h.call('delete from notifications');
    assert.deepEqual(await edit(id,{title:'Le mercredi'}),{resumed:false,updated:4,opened:0,removed:0,kept:0});
    await h.root();
    const own=await h.call<{title:string;visibility:string;location:string;capacity:number;starts_at:string;address:string}>(
      `select s.title,s.visibility,s.location,s.capacity,s.starts_at::text,a.address from sessions s join session_addresses a on a.session_id=s.id where s.id=$1`,[second.id]);
    assert.deepEqual(own.map(g=>({...g,starts_at:Date.parse(g.starts_at)})),[{title:'Le mercredi',visibility:'members',location:'Chez Alex',capacity:10,starts_at:Date.parse(at(9,'20:30')),address:'12 rue Privée'}]);
    // Nobody hears about a new name.
    assert.equal((await h.call('select 1 from notifications')).length,0);
    // A setting changed for the whole series reaches that date too.
    await edit(id,{title:'Le mercredi',visibility:'members',starts_at:at(2,'21:00')});
    await h.root();
    assert.deepEqual(await h.call(`select distinct visibility,to_char(starts_at at time zone 'Europe/Paris','HH24:MI') as hour from sessions where series_id=$1`,[id]),[{visibility:'members',hour:'21:00'}]);
    assert.deepEqual(await h.call(`select location from sessions where id=$1`,[second.id]),[{location:'Chez Alex'}]);
  });

  await t.test('une série peut se passer de script, comme une partie',async()=>{
    const id=await create();
    assert.deepEqual(await edit(id,{script:''}),{resumed:false,updated:4,opened:0,removed:0,kept:0});
    await h.root();
    assert.deepEqual(await h.call(`select distinct script from sessions where series_id=$1 union all select script from session_series where id=$1`,[id]),[{script:''},{script:''}]);
  });

  await t.test('une date supprimée à la main n’est pas rouverte, une semaine sautée est retirée',async()=>{
    const id=await create();
    const [,,third]=await games(id);
    await h.login(1);await h.call('select delete_session($1)',[third.id]);
    assert.deepEqual(await edit(id,{title:'Sans le 16'}),{resumed:false,updated:3,opened:0,removed:0,kept:0});
    assert.deepEqual(times(await games(id)),[2,9,23].map(n=>Date.parse(at(n))));
    // The next date set a week later skips the one before it.
    assert.deepEqual(await edit(id,{starts_at:at(9)}),{resumed:false,updated:2,opened:0,removed:1,kept:0});
    assert.deepEqual(times(await games(id)),[9,23].map(n=>Date.parse(at(n))));
  });

  await t.test('un autre jour relance la série : les dates vides sont retirées, celles avec des inscrits restent à part',async()=>{
    const id=await create();
    const [,second]=await games(id);
    assert.equal(await book(3,second.id),'confirmed');
    assert.deepEqual(await edit(id,{starts_at:at(3)}),{resumed:false,updated:0,opened:4,removed:3,kept:1});
    assert.deepEqual(times(await games(id)),[at(3),at(10),at(17),at(24)].map(Date.parse));
    // The booked date stays where it was, with its player, and no longer moves with the series.
    await h.root();
    assert.deepEqual(await h.call('select series_id,status,location from sessions where id=$1',[second.id]),[{series_id:null,status:'published',location:'Le local'}]);
    // Every other week on the same day: the dates off the new rhythm go.
    assert.deepEqual(await edit(id,{starts_at:at(3),every_weeks:2,location:'La cave'}),{resumed:false,updated:2,opened:0,removed:2,kept:0});
    assert.deepEqual(times(await games(id)),[at(3),at(17)].map(Date.parse));
    await h.root();assert.deepEqual(await h.call('select location from sessions where id=$1',[second.id]),[{location:'Le local'}]);
    await h.root();
    assert.deepEqual(await h.call(`select every_weeks,first_date::text from session_series where id=$1`,[id]),[{every_weeks:2,first_date:day(3)}]);
  });

  await t.test('une dernière date avancée retire les dates suivantes',async()=>{
    const id=await create();
    assert.deepEqual(await edit(id,{ends_on:day(10)}),{resumed:false,updated:2,opened:0,removed:2,kept:0});
    assert.deepEqual(times(await games(id)),[2,9].map(n=>Date.parse(at(n))));
    // Pushed back, it opens them again.
    assert.deepEqual(await edit(id,{ends_on:null}),{resumed:false,updated:2,opened:2,removed:0,kept:0});
    assert.deepEqual(times(await games(id)),[2,9,16,23].map(n=>Date.parse(at(n))));
  });

  await t.test('une série arrêtée reste dans la liste, n’ouvre plus rien, et reprend une fois modifiée',async()=>{
    const id=await create();
    const [,second]=await games(id);
    assert.equal(await book(2,second.id),'confirmed');
    await h.login(1);
    assert.deepEqual((await h.call<{stop_series:unknown}>('select stop_series($1)',[id]))[0].stop_series,{removed:3,kept:1});
    await h.root();await h.call('update session_series set weeks_ahead=12 where id=$1',[id]);
    await h.db.exec('set role service_role');
    assert.equal((await h.call<{extend_series:number}>('select extend_series($1)',[id]))[0].extend_series,0);
    // Resumed, the series opens its dates again, the ones removed when it stopped included.
    assert.deepEqual(await edit(id,{location:'La cave'}),{resumed:true,updated:1,opened:3,removed:0,kept:0});
    const listed=await games(id);
    assert.deepEqual(times(listed),[2,9,16,23].map(n=>Date.parse(at(n))));
    assert.ok(listed.every(g=>g.location==='La cave'));
    await h.root();assert.deepEqual(await h.call('select stopped_at from session_series where id=$1',[id]),[{stopped_at:null}]);
  });

  await t.test('une série reprise rouvre aussi le jour d’une date annulée entre-temps',async()=>{
    const id=await create();
    const [,second]=await games(id);
    assert.equal(await book(2,second.id),'confirmed');
    await h.login(1);
    await h.call('select stop_series($1)',[id]);
    await h.call('select cancel_session($1)',[second.id]);
    assert.deepEqual(await edit(id),{resumed:true,updated:0,opened:4,removed:0,kept:0});
    assert.deepEqual(times(await games(id)),[2,9,16,23].map(n=>Date.parse(at(n))));
    // The cancellation already written to the player still leaves.
    await h.root();
    assert.ok((await h.call(`select 1 from notifications where user_id=$1 and emailed_at is null and title ilike '%annul%'`,[uuid(2)])).length>0);
  });

  await t.test('seule une série arrêtée se supprime, et ses parties restent',async()=>{
    const id=await create();
    const [first]=await games(id);
    assert.equal(await book(2,first.id),'confirmed');
    await h.login(1);
    await assert.rejects(h.call('select delete_series($1)',[id]),/Arrête d’abord/);
    await h.call('select stop_series($1)',[id]);
    await h.call('select delete_series($1)',[id]);
    // Already gone: nothing happens.
    await h.call('select delete_series($1)',[id]);
    await h.root();
    assert.equal((await h.call('select 1 from session_series where id=$1',[id])).length,0);
    assert.deepEqual(await h.call(`select series_id,status from sessions where id=$1`,[first.id]),[{series_id:null,status:'published'}]);
    await h.login(1);await assert.rejects(edit(id),/introuvable/);
  });

  await t.test('une date trop pleine ou avec des voyageurs est nommée dans le refus, et rien ne change',async()=>{
    const id=await create({capacity:8});
    const [first,second]=await games(id);
    for(let n=10;n<18;n++){await h.user(n,'member');assert.equal(await book(n,first.id),'confirmed');}
    assert.equal(await book(3,second.id),'confirmed');
    const label=(iso:string)=>parisInput(iso).slice(0,10).split('-').reverse().slice(0,2).join('/');
    await assert.rejects(edit(id,{capacity:7}),new RegExp(`partie du ${label(first.starts_at)} compte déjà 8 places`));
    await assert.rejects(edit(id,{visibility:'members'}),new RegExp(`voyageurs sont inscrits à la partie du ${label(second.starts_at)}`));
    assert.ok((await games(id)).every(g=>g.capacity===8));
  });

  await t.test('les valeurs impossibles sont refusées en français',async()=>{
    const id=await create();
    await assert.rejects(edit(id,{starts_at:at(-1)}),/date à venir/);
    await assert.rejects(edit(id,{every_weeks:3}),/rythme/);
    await assert.rejects(edit(id,{weeks_ahead:13}),/ouvertes/);
    await assert.rejects(edit(id,{ends_on:day(1)}),/suivre la prochaine partie/);
    await assert.rejects(edit(id,{venue_id:uuid(998)}),/plus dans la liste/);
    await assert.rejects(edit(uuid(997)),/introuvable/);
  });

  await t.test('l’organisateur qui modifie la série d’un autre ayant perdu son rang la reprend',async()=>{
    const id=await create({weeks_ahead:2},5);
    await h.root();await h.call(`update profiles set membership='member' where id=$1`,[uuid(5)]);
    assert.deepEqual(await edit(id,{weeks_ahead:4}),{resumed:false,updated:2,opened:2,removed:0,kept:0});
    await h.root();assert.deepEqual(await h.call('select created_by from session_series where id=$1',[id]),[{created_by:uuid(1)}]);
  });
});
