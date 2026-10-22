import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDatabase,uuid} from './sql-harness';
import {MAX_TRAVELLER_GUESTS} from '../lib/session-rules';

type Row={guest_name:string|null;sponsor_id:string|null;user_id:string|null;status:string;pool:string;seat_index:number|null};

test('Ajout des invités',async t=>{
  const h=await createDatabase();
  await h.user(1,'organizer');await h.user(2);await h.user(3);await h.user(4,'newcomer');await h.user(5);await h.user(6);
  const game=uuid(100);await h.session(game,{capacity:8,travellerSeats:2});
  const rows=async(id=game)=>{await h.root();return h.call<Row>('select guest_name,sponsor_id,user_id,status,pool,seat_index from bookings where session_id=$1 order by created_at,id',[id]);};
  const add=async(id:string,name:string,seat?:number)=>(await h.call<{add_guest:string}>(seat===undefined?'select add_guest($1,$2)':'select add_guest($1,$2,$3)',seat===undefined?[id,name]:[id,name,seat]))[0].add_guest;

  await t.test('un membre place un invité d’office, au jeton choisi, sur une place membre',async()=>{
    await h.login(2);
    assert.equal(await add(game,'  Paul  ',5),'confirmed');
    assert.deepEqual((await rows())[0],{guest_name:'Paul',sponsor_id:uuid(2),user_id:null,status:'confirmed',pool:'circle',seat_index:5});
  });
  await t.test('un double clic avec le même prénom ne crée pas un second invité',async()=>{
    await h.login(2);
    assert.equal(await add(game,'paul',6),'confirmed');
    assert.equal((await rows()).length,1);
  });
  await t.test('un membre amène autant de personnes que les places membres le permettent, puis deux en liste d’attente',async()=>{
    const crowd=uuid(105);await h.session(crowd,{capacity:7,travellerSeats:2});
    await h.login(2);
    await add(game,'Ami 1');
    for(const name of ['Jo','Lu','Max','Néo','Sam'])assert.equal(await add(crowd,name),'confirmed');
    assert.equal(await add(crowd,'Tim'),'waitlisted');
    assert.equal(await add(crowd,'Ugo'),'waitlisted');
    await assert.rejects(add(crowd,'Val'),/déjà 2 personnes en liste d’attente/);
  });
  await t.test('le prénom et le jeton sont contrôlés',async()=>{
    await h.login(3);
    for(const name of ['A','x'.repeat(41),'   ','\t\nA'])await assert.rejects(add(game,name),/2 à 40 caractères/);
    for(const seat of [-1,8])await assert.rejects(add(game,'Marie',seat),/place est invalide/);
    await assert.rejects(add(game,'Marie',5),/vient d’être prise/);
  });
  await t.test('le prénom est nettoyé sans perdre ses accents',async()=>{
    await h.login(5);
    await add(game,'  Marie   Hélène  ');
    assert.ok((await rows()).some(r=>r.guest_name==='Marie Hélène'&&r.sponsor_id===uuid(5)));
  });
  await t.test('un voyageur et son ami attendent la validation, sans jeton, sur les places voyageurs',async()=>{
    // Seats 0 and 1 went to « Ami 1 » and « Marie Hélène » (first free tokens), seat 5 to Paul.
    await h.login(4);
    assert.equal((await h.call<{book_circle_seat:string}>('select book_circle_seat($1,2)',[game]))[0].book_circle_seat,'pending');
    assert.equal(await add(game,'Nora',3),'pending');
    const nora=(await rows()).find(r=>r.guest_name==='Nora')!;
    assert.deepEqual([nora.status,nora.pool,nora.seat_index],['pending','newcomer',null]);
  });
  await t.test(`un voyageur amène au plus ${MAX_TRAVELLER_GUESTS} personnes par partie`,async()=>{
    await h.login(4);
    assert.equal(await add(game,'Lina'),'pending');
    await assert.rejects(add(game,'Un de trop'),new RegExp(`déjà ${MAX_TRAVELLER_GUESTS} personnes`));
  });
  await t.test('un parrain lit ses invités, personne d’autre ; personne n’écrit directement',async()=>{
    await h.login(2);
    assert.equal((await h.call('select * from bookings where sponsor_id=$1 and session_id=$2',[uuid(2),game])).length,2);
    await h.login(6);
    assert.equal((await h.call('select * from bookings')).length,0);
    await assert.rejects(h.call(`insert into bookings(session_id,guest_name,sponsor_id,status,pool) values($1,'Pirate',$2,'confirmed','circle')`,[game,uuid(6)]),/permission denied/);
    await h.anonymous();
    await assert.rejects(h.call('select add_guest($1,$2)',[game,'Visiteur']),/permission denied/);
  });
  await t.test('une session réservée aux membres reste fermée aux voyageurs et à leurs amis',async()=>{
    const closed=uuid(101);await h.session(closed,{visibility:'members'});
    await h.login(4);
    await assert.rejects(add(closed,'Nora'),/inaccessible/);
    await h.login(3);
    assert.equal(await add(closed,'Lou'),'confirmed');
  });
  await t.test('l’invité d’un membre attend son tour quand les places membres sont prises',async()=>{
    const small=uuid(102);await h.session(small,{capacity:7,travellerSeats:5});
    await h.login(3);
    assert.equal((await h.call<{book_session:string}>('select book_session($1)',[small]))[0].book_session,'confirmed');
    assert.equal(await add(small,'Yann'),'confirmed');
    assert.equal(await add(small,'Zoé'),'waitlisted');
  });
  await t.test('après la réunion des quotas, l’invité d’un membre prend n’importe quelle place libre',async()=>{
    const merged=uuid(103);await h.session(merged,{capacity:7,travellerSeats:6,startsIn:'1 day',releaseHours:72});
    await h.login(6);
    assert.equal((await h.call<{book_session:string}>('select book_session($1)',[merged]))[0].book_session,'confirmed');
    assert.equal(await add(merged,'Basile'),'confirmed');
  });
  await t.test('les inscriptions closes refusent les invités',async()=>{
    const soon=uuid(104);await h.session(soon,{startsIn:'20 minutes'});
    await h.login(3);
    await assert.rejects(add(soon,'Tard'),/closes/);
  });
  await t.test('le parrain d’un invité confirmé voit l’adresse, même sans venir',async()=>{
    await h.root();await h.call(`insert into session_addresses values($1,'Adresse de test')`,[game]);
    await h.login(2);
    assert.equal((await h.call('select * from session_addresses')).length,1);
    await h.login(3);
    assert.equal((await h.call('select * from session_addresses')).length,0);
  });
  await h.db.close();
});
