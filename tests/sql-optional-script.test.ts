import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDatabase,uuid} from './sql-harness';

test('Une partie peut attendre son script',async t=>{
  const h=await createDatabase();
  for(const [n,m] of [[1,'organizer'],[2,'member']] as const)await h.user(n,m);
  const starts=new Date(Date.now()+11*86400000);
  const input=(changes:Record<string,unknown>={})=>JSON.stringify({title:'',description:'',script:'',
    starts_at:starts.toISOString(),ends_at:new Date(starts.getTime()+14400000).toISOString(),
    location:'Brest',address:'',capacity:8,beginners_welcome:true,visibility:'public',...changes});
  let game='';

  await t.test('un organisateur publie une partie sans nom ni script',async()=>{
    await h.login(1);game=(await h.call<{id:string}>('select save_session($1::jsonb) as id',[input()]))[0].id;
    await h.root();assert.deepEqual(await h.call('select title,script from sessions where id=$1',[game]),[{title:'',script:''}]);
  });
  await t.test('un script donné compte toujours de 2 à 100 caractères',async()=>{
    await h.login(1);
    for(const script of ['a','x'.repeat(101)])await assert.rejects(h.call('select save_session($1::jsonb)',[input({script})]),/sessions_script_check/);
    await h.call('select save_session($1::jsonb)',[input({id:game,script:'Bad Moon Rising'})]);
    await h.call('select save_session($1::jsonb)',[input({id:game})]);
    await h.root();assert.deepEqual(await h.call('select script from sessions where id=$1',[game]),[{script:''}]);
  });
  await t.test('l’annulation d’une partie sans nom ni script la désigne par sa date',async()=>{
    await h.login(2);await h.call('select book_session($1)',[game]);
    await h.login(1);await h.call('select cancel_session($1)',[game]);
    await h.root();const [notice]=await h.call<{body:string}>(`select body from notifications where user_id=$1 and title='La session a été annulée'`,[uuid(2)]);
    const day=new Intl.DateTimeFormat('fr-FR',{day:'2-digit',month:'2-digit',timeZone:'Europe/Paris'}).format(starts);
    assert.equal(notice.body,`L’organisateur a annulé la soirée du ${day}. Rendez-vous sur le site pour trouver une autre date.`);
  });
  await t.test('une série sans script ouvre des dates sans script',async()=>{
    await h.login(1);
    const [{save_series:series}]=await h.call<{save_series:string}>('select save_series($1)',[{...JSON.parse(input()),every_weeks:1,weeks_ahead:4,ends_on:null,venue_id:null}]);
    await h.root();
    const dates=await h.call<{script:string}>('select script from sessions where series_id=$1',[series]);
    assert.ok(dates.length>=2);assert.ok(dates.every(d=>d.script===''));
    assert.deepEqual(await h.call('select script from session_series where id=$1',[series]),[{script:''}]);
  });
});
