import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDatabase,uuid} from './sql-harness';

test('Les colonnes internes des parties ne sont pas lisibles par l’API',async t=>{
  const h=await createDatabase();
  for(const [n,m] of [[1,'organizer'],[2,'member'],[3,'newcomer']] as const)await h.user(n,m);
  const game=uuid(100);await h.session(game,{startsIn:'1 day'});
  await h.root();await h.call(`update sessions set storyteller='Alex',description='Ancien texte' where id=$1`,[game]);
  await h.call(`insert into session_addresses values($1,'3 rue du Port')`,[game]);

  await t.test('un visiteur et un joueur lisent les informations affichées, sans le MJ, la description ni le compte organisateur',async()=>{
    for(const as of [()=>h.anonymous(),()=>h.login(2)]){
      await as();
      assert.deepEqual(await h.call('select title,script,location,capacity,status,visibility from sessions where id=$1',[game]),
        [{title:'Soirée de test',script:'Trouble Brewing',location:'Brest',capacity:8,status:'published',visibility:'public'}]);
      for(const column of ['storyteller','description','created_by','created_at','*'])
        await assert.rejects(h.call(`select ${column} from sessions`),/permission denied/i,column);
    }
  });
  await t.test('les parties restent listées et l’adresse suit toujours la règle des 48 heures',async()=>{
    await h.login(3);await h.call('select book_session($1)',[game]);
    const [listed]=(await h.call<{list_sessions:Record<string,unknown>[]}>('select list_sessions()'))[0].list_sessions;
    assert.equal(listed.id,game);assert.equal(listed.my_status,'confirmed');assert.equal(Object.hasOwn(listed,'storyteller'),false);
    assert.deepEqual(await h.call('select address from session_addresses'),[{address:'3 rue du Port'}]);
  });
});
