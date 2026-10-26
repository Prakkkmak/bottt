import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDatabase,uuid} from './sql-harness';

test('Une session ouverte avec un mot de passe n’ouvre pas le compte',async t=>{
  const h=await createDatabase();
  await h.user(1,'organizer');await h.user(2,'member');await h.user(3,'member');
  const game=uuid(100);await h.session(game,{startsIn:'1 day'});
  await h.root();await h.call(`insert into session_addresses values($1,'3 rue du Port')`,[game]);
  await h.login(2);await h.call('select book_session($1)',[game]);

  await t.test('avec un code reçu par e-mail, le joueur garde son accès',async()=>{
    for(const method of ['otp','magiclink']){
      await h.login(2,method);
      assert.deepEqual(await h.call('select active_user() as active,is_member() as member'),[{active:true,member:true}],method);
      assert.deepEqual(await h.call('select address from session_addresses'),[{address:'3 rue du Port'}],method);
    }
  });
  await t.test('avec le mot de passe, le même compte est traité comme un visiteur',async()=>{
    await h.login(2,'password');
    assert.deepEqual(await h.call('select active_user() as active,is_member() as member'),[{active:false,member:false}]);
    assert.deepEqual(await h.call('select id from profiles'),[]);
    assert.deepEqual(await h.call('select id from bookings'),[]);
    assert.deepEqual(await h.call('select address from session_addresses'),[]);
    const [listed]=(await h.call<{list_sessions:Record<string,unknown>[]}>('select list_sessions()'))[0].list_sessions;
    assert.equal(listed.my_status,null);
    await assert.rejects(h.call('select cancel_booking($1)',[game]),/Connecte-toi/);
    await h.login(3,'password');
    await assert.rejects(h.call('select book_session($1)',[game]),/Connecte-toi/);
  });
  await t.test('un organisateur connecté par mot de passe perd ses droits',async()=>{
    await h.root();
    await h.call(`select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)`,
      [uuid(1),JSON.stringify({sub:uuid(1),session_id:uuid(1001),amr:[{method:'password',timestamp:1},{method:'totp',timestamp:2}]})]);
    await h.db.exec('set role authenticated');
    assert.deepEqual(await h.call('select is_organizer() as organizer'),[{organizer:false}]);
    await assert.rejects(h.call(`select set_membership($1,'suspended')`,[uuid(3)]));
  });
});
