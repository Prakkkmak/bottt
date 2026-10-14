import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDatabase,uuid} from './sql-harness';

type Row={guest_name:string|null;status:string;pool:string;seat_index:number|null};

test('Validation des voyageurs et vie des invités',async t=>{
  const h=await createDatabase();
  for(const [n,m] of [[1,'organizer'],[2,'member'],[3,'newcomer'],[4,'member'],[5,'newcomer'],[6,'newcomer'],[7,'newcomer'],[8,'newcomer']] as const)await h.user(n,m);
  const game=uuid(100);await h.session(game,{capacity:8,travellerSeats:4});
  const rows=async(where:string,params:unknown[]=[])=>{await h.root();return h.call<Row>(`select guest_name,status,pool,seat_index from bookings where ${where} order by created_at,id`,params);};
  const notices=async(n:number)=>{await h.root();return h.call<{title:string;body:string}>('select title,body from notifications where user_id=$1 order by created_at,id',[uuid(n)]);};
  const membership=async(n:number)=>{await h.root();return (await h.call<{membership:string}>('select membership from profiles where id=$1',[uuid(n)]))[0].membership;};
  const idOf=async(name:string,session:string)=>{await h.root();return (await h.call<{id:string}>('select id from bookings where guest_name=$1 and session_id=$2',[name,session]))[0].id;};
  await h.login(3);await h.call('select book_circle_seat($1,0)',[game]);await h.call('select add_guest($1,$2,$3)',[game,'Nora',1]);await h.call('select add_guest($1,$2)',[game,'Yann']);

  await t.test('seul un organisateur traite une demande',async()=>{
    await h.login(2);
    await assert.rejects(h.call('select review_request($1,$2,true)',[game,uuid(3)]),/organisateur/);
  });
  await t.test('accepter le groupe confirme le voyageur et ses amis en un message, sans le passer membre',async()=>{
    await h.login(1);
    await h.call('select review_request($1,$2,true)',[game,uuid(3)]);
    const group=await rows('session_id=$1',[game]);
    assert.deepEqual(group.map(r=>[r.guest_name,r.status,r.pool]),[[null,'confirmed','newcomer'],['Nora','confirmed','newcomer'],['Yann','confirmed','newcomer']]);
    assert.deepEqual([group[0].seat_index,group[1].seat_index],[0,1]);
    assert.equal(await membership(3),'newcomer');
    const review=(await notices(3)).filter(n=>n.title==='Bienvenue, ta place est confirmée !');
    assert.equal(review.length,1);
    assert.match(review[0].body,/Nora : place confirmée/);assert.match(review[0].body,/Yann : place confirmée/);
  });
  await t.test('une demande déjà traitée ne l’est pas deux fois',async()=>{
    await h.login(1);
    await assert.rejects(h.call('select review_request($1,$2,true)',[game,uuid(3)]),/déjà été traitée/);
  });
  await t.test('review_booking ne passe plus membre automatiquement',async()=>{
    await h.login(7);await h.call('select book_session($1)',[game]);
    await h.root();const [own]=await h.call<{id:string}>('select id from bookings where user_id=$1',[uuid(7)]);
    await h.login(1);
    assert.equal((await h.call<{review_booking:string}>('select review_booking($1,true)',[own.id]))[0].review_booking,'confirmed');
    assert.equal(await membership(7),'newcomer');
  });
  await t.test('refuser les amis d’un voyageur déjà inscrit garde sa place et le prévient en un seul message',async()=>{
    await h.login(7);await h.call('select add_guest($1,$2)',[game,'Mila']);
    const before=(await notices(7)).length;
    await h.login(1);await h.call('select review_request($1,$2,false)',[game,uuid(7)]);
    const [own]=await rows('user_id=$1',[uuid(7)]);
    assert.equal(own.status,'confirmed');
    assert.equal((await rows(`guest_name='Mila'`))[0].status,'declined');
    const fresh=(await notices(7)).slice(before);
    assert.deepEqual(fresh.map(n=>n.title),['Demande refusée pour Mila']);
    assert.match(fresh[0].body,/Mila : non retenu·e/);
  });
  const trip=uuid(102);await h.session(trip,{capacity:8,travellerSeats:4});
  await t.test('valider les amis d’un voyageur déjà inscrit les nomme tous dans le message',async()=>{
    await h.login(3);await h.call('select book_session($1)',[trip]);
    await h.login(1);await h.call('select review_request($1,$2,true)',[trip,uuid(3)]);
    await h.login(3);for(const name of ['Éva','Tao'])await h.call('select add_guest($1,$2)',[trip,name]);
    const before=(await notices(3)).length;
    await h.login(1);await h.call('select review_request($1,$2,true)',[trip,uuid(3)]);
    assert.deepEqual((await rows('session_id=$1',[trip])).map(r=>[r.guest_name,r.status]),[[null,'confirmed'],['Éva','confirmed'],['Tao','confirmed']]);
    assert.deepEqual((await notices(3)).slice(before).map(n=>n.title),['Demande validée pour Éva et Tao']);
  });
  await t.test('« accepter et passer membre » fait basculer la place dans le quota membre',async()=>{
    await h.login(5);await h.call('select book_session($1)',[game]);
    await h.login(1);await h.call('select review_request($1,$2,true,true)',[game,uuid(5)]);
    const [own]=await rows('user_id=$1',[uuid(5)]);
    assert.deepEqual([own.status,own.pool],['confirmed','circle']);
    assert.equal(await membership(5),'member');
  });
  const promoted=uuid(103);await h.session(promoted);
  await t.test('un voyageur déjà passé membre prend une place membre, même sans « passer membre » à la validation',async()=>{
    await h.login(8);await h.call('select book_session($1)',[promoted]);
    await h.login(1);await h.call(`select set_membership($1,'member')`,[uuid(8)]);
    await h.call('select review_request($1,$2,true)',[promoted,uuid(8)]);
    const [own]=await rows('user_id=$1',[uuid(8)]);
    assert.deepEqual([own.status,own.pool],['confirmed','circle']);
  });
  await t.test('refuser un seul ami prévient son parrain, qui ne peut pas le rajouter',async()=>{
    await h.login(6);await h.call('select book_session($1)',[game]);await h.call('select add_guest($1,$2)',[game,'Ugo']);
    const ugo=await idOf('Ugo',game);
    await h.login(1);await h.call('select review_booking($1,false)',[ugo]);
    assert.ok((await notices(6)).some(n=>n.title==='Ugo n’a pas été retenu·e pour cette partie'));
    await h.login(6);
    await assert.rejects(h.call('select add_guest($1,$2)',[game,'ugo']),/pas été retenue/);
  });
  const small=uuid(101);await h.session(small,{capacity:7,travellerSeats:5});
  await t.test('une place libérée est proposée au parrain, et lui seul peut la confirmer',async()=>{
    await h.login(2);await h.call('select book_session($1)',[small]);
    await h.login(4);await h.call('select book_session($1)',[small]);
    await h.login(2);assert.equal((await h.call<{add_guest:string}>('select add_guest($1,$2)',[small,'Zoé']))[0].add_guest,'waitlisted');
    await h.login(4);await h.call('select cancel_booking($1)',[small]);
    assert.equal((await rows(`guest_name='Zoé'`))[0].status,'offered');
    assert.ok((await notices(2)).some(n=>n.title==='Une place s’est libérée pour Zoé'));
    const zoe=await idOf('Zoé',small);
    await h.login(4);await assert.rejects(h.call('select accept_guest_offer($1)',[zoe]),/non autorisée/);
    await h.login(2);assert.equal((await h.call<{accept_guest_offer:string}>('select accept_guest_offer($1)',[zoe]))[0].accept_guest_offer,'confirmed');
  });
  await t.test('une proposition expirée prévient le parrain',async()=>{
    await h.login(2);assert.equal((await h.call<{add_guest:string}>('select add_guest($1,$2)',[small,'Ugo']))[0].add_guest,'waitlisted');
    await h.call('select cancel_booking($1)',[small]);
    assert.equal((await rows(`guest_name='Ugo' and session_id=$1`,[small]))[0].status,'offered');
    await h.root();
    await h.call(`update bookings set offer_expires_at=now()-interval '1 minute' where guest_name='Ugo' and session_id=$1`,[small]);
    await h.call('select rebalance($1)',[small]);
    assert.equal((await rows(`guest_name='Ugo' and session_id=$1`,[small]))[0].status,'cancelled');
    assert.ok((await notices(2)).some(n=>n.title==='La proposition pour Ugo a expiré'));
  });
  await t.test('le parrain retire son invité ; personne d’autre ne le peut',async()=>{
    const zoe=await idOf('Zoé',small);
    await h.login(4);await assert.rejects(h.call('select remove_guest($1)',[zoe]),/non autorisée/);
    await h.login(2);await h.call('select remove_guest($1)',[zoe]);
    const [row]=await rows(`guest_name='Zoé'`);
    assert.deepEqual([row.status,row.seat_index],['cancelled',null]);
  });
  await h.db.close();
});
