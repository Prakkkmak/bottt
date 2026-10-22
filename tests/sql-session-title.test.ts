import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDatabase,uuid} from './sql-harness';

test('Une partie sans nom prend celui de son script',async t=>{
  const h=await createDatabase();
  for(const [n,m] of [[1,'organizer'],[2,'member']] as const)await h.user(n,m);
  const input=(changes:Record<string,unknown>={})=>JSON.stringify({title:'',description:'',script:'Bad Moon Rising',
    starts_at:new Date(Date.now()+11*86400000).toISOString(),ends_at:new Date(Date.now()+11*86400000+14400000).toISOString(),
    location:'Brest',address:'',capacity:8,newcomer_seats:2,release_hours:72,beginners_welcome:true,visibility:'public',...changes});
  let game='';

  await t.test('un organisateur publie une partie sans nom',async()=>{
    await h.login(1);game=(await h.call<{id:string}>('select save_session($1::jsonb) as id',[input()]))[0].id;
    await h.root();assert.deepEqual(await h.call('select title,script from sessions where id=$1',[game]),[{title:'',script:'Bad Moon Rising'}]);
  });
  await t.test('un nom reste limité à 100 caractères',async()=>{
    await h.login(1);await assert.rejects(h.call('select save_session($1::jsonb)',[input({title:'x'.repeat(101)})]),/sessions_title_check/);
  });
  await t.test('l’annulation désigne la partie sans nom par son script',async()=>{
    await h.login(2);await h.call('select book_session($1)',[game]);
    await h.login(1);await h.call('select cancel_session($1)',[game]);
    await h.root();const [notice]=await h.call<{body:string}>(`select body from notifications where user_id=$1 and title='La session a été annulée'`,[uuid(2)]);
    assert.match(notice.body,/la soirée « Bad Moon Rising » du/);
  });
});
