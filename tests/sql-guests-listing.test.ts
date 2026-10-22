import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDatabase,uuid} from './sql-harness';

test('Affichage des invités dans les parties',async t=>{
  const h=await createDatabase();
  await h.user(1,'organizer');await h.user(2);await h.user(3,'newcomer');await h.user(4);await h.user(5,'newcomer');await h.user(6);
  const game=uuid(100);await h.session(game,{capacity:8,travellerSeats:2});
  const listed=async(id=game)=>(await h.call<{list_sessions:any[]}>('select list_sessions()'))[0].list_sessions.find((s:any)=>s.id===id);
  await h.login(2);await h.call('select book_circle_seat($1,0)',[game]);await h.call('select add_guest($1,$2,$3)',[game,'Paul',1]);
  await h.login(3);await h.call('select book_circle_seat($1,2)',[game]);await h.call('select add_guest($1,$2,$3)',[game,'Nora',3]);
  await h.login(6);await h.call('select add_guest($1,$2,$3)',[game,'Paul',4]);
  // Confirm the traveller's group directly: review rules are covered elsewhere.
  await h.root();await h.call(`update bookings set status='confirmed' where status='pending'`);

  await t.test('chaque participant porte son statut et, s’il a été amené, son parrain',async()=>{
    await h.login(4);
    const people=(await listed()).participants.map((p:any)=>[p.seat_index,p.display_name,p.role,p.invited_by]);
    assert.deepEqual(people,[[0,'Joueur 2','member',null],[1,'Paul','guest','Joueur 2'],[2,'Joueur 3','traveller',null],[3,'Nora','traveller_guest','Joueur 3'],[4,'Paul','guest','Joueur 6']]);
  });
  await t.test('le parrain retrouve ses invités, les autres non',async()=>{
    await h.login(2);
    const mine=(await listed()).my_guests;
    assert.equal(mine.length,1);
    assert.deepEqual({name:mine[0].name,status:mine[0].status,seat_index:mine[0].seat_index,offer_expires_at:mine[0].offer_expires_at},{name:'Paul',status:'confirmed',seat_index:1,offer_expires_at:null});
    assert.equal(typeof mine[0].id,'string');
    await h.login(4);
    assert.deepEqual((await listed()).my_guests,[]);
  });
  await t.test('un visiteur ou un voyageur non inscrit ne voit aucun prénom',async()=>{
    await h.anonymous();
    const visitor=await listed();
    assert.deepEqual([visitor.participants,visitor.my_guests],[[],[]]);
    await h.login(5);
    assert.deepEqual((await listed()).participants,[]);
  });
  await t.test('les places libres sont les mêmes pour tous, quel que soit le rang',async()=>{
    await h.login(4);
    const g=await listed();
    assert.deepEqual([g.confirmed_count,g.member_seats_free,g.traveller_seats_free],[5,3,3]);
  });
  await t.test('chacun voit son rang dans la file, et celui des personnes qu’il amène',async()=>{
    const full=uuid(101);await h.session(full,{capacity:7});
    await h.login(2);for(const name of ['A1','A2','A3','A4','A5','A6','A7'])await h.call('select add_guest($1,$2)',[full,name]);
    await h.login(3);assert.equal((await h.call<{book_session:string}>('select book_session($1)',[full]))[0].book_session,'waitlisted');
    await h.login(4);await h.call('select book_session($1)',[full]);await h.call('select add_guest($1,$2)',[full,'Zoé']);
    const four=await listed(full);
    assert.equal(four.my_waitlist_position,2);
    assert.deepEqual(four.my_guests.map((g:any)=>[g.name,g.status,g.waitlist_position]),[['Zoé','waitlisted',3]]);
    assert.equal(four.waitlist_count,3);
    await h.login(3);assert.equal((await listed(full)).my_waitlist_position,1);
    await h.login(6);assert.equal((await listed(full)).my_waitlist_position,null);
    // The confirmation tells the rank too.
    await h.root();
    const [notice]=await h.call<{body:string}>(`select body from notifications where user_id=$1 and title='Zoé est sur la liste d’attente'`,[uuid(4)]);
    assert.match(notice.body,/Zoé est n° 3 sur la liste d’attente/);
  });
  await h.db.close();
});
