import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDatabase,uuid} from './sql-harness';

type Notice={user_id:string;title:string;body:string};

test('Message d’un organisateur aux inscrits d’une partie',async t=>{
  const h=await createDatabase();
  for(const [n,m] of [[1,'organizer'],[2,'member'],[3,'member'],[4,'member'],[5,'newcomer'],[6,'member'],[7,'organizer']] as const)await h.user(n,m);
  const game=uuid(100);await h.session(game,{capacity:7});
  const book=async(n:number,id=game)=>{await h.login(n);return (await h.call<{book_session:string}>('select book_session($1)',[id]))[0].book_session;};
  const add=async(n:number,name:string,id=game)=>{await h.login(n);return (await h.call<{add_guest:string}>('select add_guest($1,$2)',[id,name]))[0].add_guest;};
  const send=async(n:number,message:string,waitlist?:boolean,id=game)=>{
    await h.login(n);
    type Sent={send_session_message:{sent:number;muted:number}};
    const rows=waitlist===undefined?await h.call<Sent>('select send_session_message($1,$2)',[id,message])
      :await h.call<Sent>('select send_session_message($1,$2,$3)',[id,message,waitlist]);
    // Nobody here switched the organizers' messages off.
    assert.equal(rows[0].send_session_message.muted,0);
    return rows[0].send_session_message.sent;
  };
  const messages=async(title='Message de Joueur 1')=>{await h.root();return h.call<Notice>('select user_id,title,body from notifications where session_id=$1 and title=$2 order by user_id',[game,title]);};
  const clear=async()=>{await h.root();await h.call(`delete from notifications where title like 'Message de %'`);await h.call(`delete from action_limits where action='session_message'`);};

  // The writer plays too; 2 brings Paul and Zoé, 3 brings Léo without coming; 4 and 6 wait, 5 left.
  assert.equal(await book(1),'confirmed');
  assert.equal(await book(2),'confirmed');
  assert.equal(await add(2,'Zoé'),'confirmed');
  assert.equal(await add(2,'Paul'),'confirmed');
  assert.equal(await add(3,'Léo'),'confirmed');
  assert.equal(await book(5),'confirmed');
  await h.login(5);await h.call('select cancel_booking($1)',[game]);
  assert.equal(await book(7),'confirmed');
  assert.equal(await book(4),'confirmed');
  assert.equal(await book(6),'waitlisted');

  await t.test('seul un organisateur écrit aux inscrits',async()=>{
    for(const n of [2,5])await assert.rejects(send(n,'Bonjour à tous'),/organisateur/);
    await h.anonymous();await assert.rejects(h.call('select send_session_message($1,$2)',[game,'Bonjour']),/permission denied/i);
    assert.equal((await messages('Message de Joueur 2')).length,0);
  });
  await t.test('chaque inscrit reçoit un message, les invité·es par la personne qui les amène, sans copie pour l’auteur',async()=>{
    assert.equal(await send(1,'  Apportez de quoi grignoter « maison ».\r\nÀ ce soir !\n  '),5);
    const sent=await messages();
    assert.deepEqual(sent.map(m=>m.user_id),[uuid(2),uuid(3),uuid(4),uuid(6),uuid(7)]);
    const of=(n:number)=>sent.find(m=>m.user_id===uuid(n))!.body;
    // Line endings are tidied and the people brought are named, in order.
    assert.equal(of(4),'Apportez de quoi grignoter « maison ».\nÀ ce soir !');
    assert.equal(of(2),'Apportez de quoi grignoter « maison ».\nÀ ce soir !\n\nTransmets ce message à Paul et Zoé.');
    assert.equal(of(3),'Apportez de quoi grignoter « maison ».\nÀ ce soir !\n\nTransmets ce message à Léo.');
    // The writing account is kept with each message, out of the players' reach.
    await h.root();assert.deepEqual((await h.call<{sender_id:string}>('select distinct sender_id from notifications where title=$1',['Message de Joueur 1'])).map(r=>r.sender_id),[uuid(1)]);
    await h.login(2);await assert.rejects(h.call('select sender_id from notifications'),/permission denied/i);
    assert.equal((await h.call('select title from notifications where title=$1',['Message de Joueur 1'])).length,1);
    // Someone who left is not written to.
    await h.root();assert.equal((await h.call('select 1 from notifications where user_id=$1 and title like $2',[uuid(5),'Message de %'])).length,0);
    await clear();
  });
  await t.test('la liste d’attente peut être laissée de côté',async()=>{
    assert.equal(await send(1,'Pour les joueurs confirmés',false),4);
    assert.deepEqual((await messages()).map(m=>m.user_id),[uuid(2),uuid(3),uuid(4),uuid(7)]);
    await clear();
  });
  await t.test('le message part par e-mail avec la partie',async()=>{
    await send(7,'Je ramène le grimoire.');
    await h.root();await h.db.exec('set role service_role');
    const claimed=await h.call<{email:string;title:string;body:string;session_script:string}>('select * from claim_emails() where session_id=$1 and title=$2',[game,'Message de Joueur 7']);
    // The other organizer, who played too, gets it; its writer does not.
    assert.deepEqual(claimed.map(m=>m.email).sort(),['test1@cercle.test','test2@cercle.test','test3@cercle.test','test4@cercle.test','test6@cercle.test']);
    assert.ok(claimed.every(m=>m.session_script==='Trouble Brewing'&&m.body.startsWith('Je ramène le grimoire.')));
    await clear();
  });
  await t.test('un message vide, trop long ou sans destinataire est refusé',async()=>{
    for(const text of ['',' x ','\n\n','\u202Ex\u0007','a'.repeat(2001)])await assert.rejects(send(1,text),/2 à 2000 caractères/);
    // Control characters and direction marks, which could disguise a link, are dropped; emoji and tabs stay.
    assert.equal(await send(1,'Lien\u202E : moc.elpmaxe\u2066\u0007\tà ce soir 👋🏽\u0085'),5);
    await h.root();assert.deepEqual((await h.call<{body:string}>('select distinct body from notifications where user_id=$1 and title=$2',[uuid(4),'Message de Joueur 1'])).map(r=>r.body),['Lien : moc.elpmaxe\tà ce soir 👋🏽']);
    assert.equal(await send(1,'é'.repeat(2000)),5);
    const lonely=uuid(101);await h.session(lonely);
    await assert.rejects(send(1,'Il y a quelqu’un ?',true,lonely),/Personne d’autre/);
    // Only the writer registered: still nobody to write to.
    assert.equal(await book(1,lonely),'confirmed');
    await assert.rejects(send(1,'Il y a quelqu’un ?',true,lonely),/Personne d’autre/);
    await assert.rejects(send(1,'Bonjour',true,uuid(999)),/introuvable/);
    await clear();
  });
  await t.test('ni une partie annulée ni une partie commencée',async()=>{
    const started=uuid(102);await h.session(started,{startsIn:'-1 hour'});
    await h.root();await h.call(`insert into bookings(session_id,user_id,status,pool) values($1,$2,'confirmed','circle')`,[started,uuid(2)]);
    await assert.rejects(send(1,'Vous êtes où ?',true,started),/a commencé/);
    const cancelled=uuid(103);await h.session(cancelled);
    assert.equal(await book(2,cancelled),'confirmed');
    await h.login(1);await h.call('select cancel_session($1)',[cancelled]);
    await assert.rejects(send(1,'Désolé',true,cancelled),/annulée/);
  });
  await t.test('dix messages par jour au plus, les refus ne comptant pas',async()=>{
    await clear();
    await assert.rejects(send(1,'x'),/2 à 2000/);
    for(let i=1;i<=10;i++)assert.equal(await send(1,`Message ${i}`),5);
    await assert.rejects(send(1,'Un de trop'),/déjà envoyé 10 messages aujourd’hui/);
    // Another organizer still writes.
    assert.equal(await send(7,'À ce soir'),5);
  });
});
