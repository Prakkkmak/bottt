import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDatabase,uuid} from './sql-harness';

test('Modifications, annulation, rappels et effacement des invités',async t=>{
  const h=await createDatabase();
  for(const [n,m] of [[1,'organizer'],[2,'member'],[3,'newcomer'],[4,'member'],[5,'member'],[6,'member'],[7,'member']] as const)await h.user(n,m);
  const notices=async(n:number,title:string)=>{await h.root();return h.call<{body:string}>('select body from notifications where user_id=$1 and title=$2',[uuid(n),title]);};
  const input=(id:string,changes:Record<string,unknown>={})=>JSON.stringify({id,title:'Soirée modifiée',description:'',script:'Trouble Brewing',
    starts_at:new Date(Date.now()+11*86400000).toISOString(),ends_at:new Date(Date.now()+11*86400000+14400000).toISOString(),
    location:'Brest',address:'',capacity:8,newcomer_seats:2,release_hours:72,beginners_welcome:true,visibility:'public',...changes});
  const game=uuid(100);await h.session(game,{capacity:8,travellerSeats:2});
  await h.login(2);await h.call('select book_session($1)',[game]);for(const name of ['Paul','Lou'])await h.call('select add_guest($1,$2)',[game,name]);
  await h.login(4);await h.call('select book_session($1)',[game]);for(const name of ['Tom','Inès'])await h.call('select add_guest($1,$2)',[game,name]);
  await h.login(3);await h.call('select book_session($1)',[game]);await h.call('select add_guest($1,$2)',[game,'Nora']);
  await h.login(1);await h.call('select review_request($1,$2,true)',[game,uuid(3)]);

  await t.test('la capacité ne descend pas sous les places prises, invités compris',async()=>{
    await h.login(1);
    await assert.rejects(h.call('select save_session($1::jsonb)',[input(game,{capacity:7})]),/capacité/);
  });
  await t.test('modifier la partie envoie un seul message par personne, qui cite ses invités',async()=>{
    await h.login(1);await h.call('select save_session($1::jsonb)',[input(game)]);
    const two=await notices(2,'Les informations de ta session ont changé');const four=await notices(4,'Les informations de ta session ont changé');
    assert.equal(two.length,1);assert.match(two[0].body,/Préviens Lou, Paul\./);
    assert.equal(four.length,1);assert.match(four[0].body,/Préviens Inès, Tom\./);
  });
  await t.test('annuler la partie prévient chaque parrain une seule fois',async()=>{
    await h.login(1);await h.call('select cancel_session($1)',[game]);
    const two=await notices(2,'La session a été annulée');
    assert.equal(two.length,1);assert.match(two[0].body,/Préviens Lou, Paul\./);
  });
  const open=uuid(101);await h.session(open);
  await t.test('une session ne passe pas « membres » quand un ami de voyageur y est inscrit',async()=>{
    await h.login(3);await h.call('select add_guest($1,$2)',[open,'Mia']);
    await h.login(1);
    await assert.rejects(h.call('select save_session($1::jsonb)',[input(open,{visibility:'members'})]),/voyageurs/);
  });
  const members=uuid(102);await h.session(members);
  await t.test('les invités de membres n’empêchent pas une session « membres »',async()=>{
    await h.login(5);await h.call('select add_guest($1,$2)',[members,'Rémi']);
    await h.login(1);await h.call('select save_session($1::jsonb)',[input(members,{visibility:'members'})]);
    await h.root();
    assert.equal((await h.call<{visibility:string}>('select visibility from sessions where id=$1',[members]))[0].visibility,'members');
  });
  const tonight=uuid(103);await h.session(tonight,{startsIn:'12 hours'});
  await t.test('le rappel cite les invités, une seule fois par personne',async()=>{
    await h.login(6);await h.call('select book_session($1)',[tonight]);await h.call('select add_guest($1,$2)',[tonight,'Inès']);
    await h.login(7);await h.call('select add_guest($1,$2)',[tonight,'Tom']);
    await h.root();await h.call('select maintenance()');await h.call('select maintenance()');
    const six=await notices(6,'Ta session approche');const seven=await notices(7,'Ta session approche');
    assert.equal(six.length,1);assert.match(six[0].body,/Inès vient avec toi/);
    assert.equal(seven.length,1);assert.match(seven[0].body,/Tom est attendu·e\. Transmets-lui/);
  });
  const later=uuid(104);await h.session(later);
  await t.test('suspendre un parrain libère ses invités',async()=>{
    await h.login(5);await h.call('select add_guest($1,$2)',[later,'Gaby']);
    await h.login(1);await h.call(`select set_membership($1,'suspended')`,[uuid(5)]);
    await h.root();
    const statuses=(await h.call<{status:string}>('select status from bookings where sponsor_id=$1',[uuid(5)])).map(r=>r.status);
    assert.deepEqual(statuses,['cancelled','cancelled']);
  });
  await t.test('supprimer le compte d’un parrain supprime ses invités',async()=>{
    await h.root();
    await h.call('delete from auth.users where id=$1',[uuid(7)]);
    assert.equal((await h.call('select * from bookings where sponsor_id=$1',[uuid(7)])).length,0);
  });
  const old=uuid(105);const recent=uuid(106);
  await h.session(old,{startsIn:'-40 days'});await h.session(recent,{startsIn:'-10 days'});
  await t.test('les prénoms des invités sont effacés 30 jours après la soirée',async()=>{
    await h.root();
    await h.call(`insert into bookings(session_id,guest_name,sponsor_id,status,pool) values($1,'Ancien',$3,'confirmed','circle'),($2,'Récent',$3,'confirmed','circle')`,[old,recent,uuid(2)]);
    await h.call(`insert into notifications(user_id,session_id,title,body) values($1,$2,'Ancien','x'),($1,$3,'Récent','x')`,[uuid(2),old,recent]);
    await h.call('select maintenance()');
    const names=await h.call<{guest_name:string}>('select guest_name from bookings where session_id in ($1,$2) order by session_id',[old,recent]);
    assert.deepEqual(names.map(n=>n.guest_name),['Invité·e','Récent']);
    const kept=await h.call<{title:string}>('select title from notifications where session_id in ($1,$2)',[old,recent]);
    assert.deepEqual(kept.map(n=>n.title),['Récent']);
  });
  await h.db.close();
});
