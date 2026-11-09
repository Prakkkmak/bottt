import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDatabase,uuid} from './sql-harness';

type Notice={user_id:string;title:string;body:string;kind:string;session_id:string|null;sender_id:string};
type Counts={everyone:{sent:number;muted:number};members:{sent:number;muted:number}};

test('Annonces à tout le cercle',async t=>{
  const h=await createDatabase();
  // 1 and 7 organize; 2, 3, 4 are members; 5 and 6 travellers; 8 is suspended.
  for(const [n,m] of [[1,'organizer'],[2,'member'],[3,'member'],[4,'member'],[5,'newcomer'],[6,'newcomer'],[7,'organizer'],[8,'suspended']] as const)await h.user(n,m);
  // 9 asked for a code and never typed it: the account exists, its address was never confirmed.
  await h.root();await h.call(`insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,'test9@cercle.test',null,'{}')`,[uuid(9)]);
  const send=async(n:number,message:string,audience='everyone',subject='')=>{
    await h.login(n);return (await h.call<{send_announcement:{sent:number;muted:number}}>('select send_announcement($1,$2,$3)',[subject,message,audience]))[0].send_announcement;
  };
  const counts=async(n=1)=>{await h.login(n);return (await h.call<{announcement_counts:Counts}>('select announcement_counts()'))[0].announcement_counts;};
  const notices=async()=>{await h.root();return h.call<Notice>(`select user_id,title,body,kind,session_id,sender_id from notifications where kind='announcement' order by user_id`);};
  const clear=async()=>{await h.root();await h.call('delete from notifications');await h.call('delete from action_limits');await h.call('delete from announcements');};

  await t.test('seul un organisateur écrit une annonce ou compte ses destinataires',async()=>{
    for(const n of [2,5]){
      await assert.rejects(send(n,'Bonjour à tous'),/organisateur/);
      await assert.rejects(counts(n),/organisateur/);
    }
    await h.anonymous();
    await assert.rejects(h.call('select send_announcement($1,$2,$3)',['','Bonjour','everyone']),/permission denied/i);
    await assert.rejects(h.call('select announcement_counts()'),/permission denied/i);
    await h.login(2);await assert.rejects(h.call('select * from announcement_audience($1)',['everyone']),/permission denied/i);
    assert.equal((await notices()).length,0);
  });
  await t.test('tout le cercle : membres, organisateurs et voyageur·ses, sauf l’auteur, les comptes suspendus et les adresses jamais confirmées',async()=>{
    assert.deepEqual(await counts(),{everyone:{sent:6,muted:0},members:{sent:4,muted:0}});
    assert.deepEqual(await send(1,'  Soirée spéciale samedi !\r\nVenez déguisés.\n'),{sent:6,muted:0});
    const sent=await notices();
    assert.deepEqual(sent.map(m=>m.user_id),[2,3,4,5,6,7].map(uuid));
    // Titled by its writer when no subject is given, signed, about no game, and the writer is kept.
    assert.ok(sent.every(m=>m.title==='Annonce de Joueur 1'&&m.body==='Soirée spéciale samedi !\nVenez déguisés.\n\n— Joueur 1'&&m.session_id===null&&m.sender_id===uuid(1)));
    await clear();
  });
  await t.test('les membres seulement, avec un objet',async()=>{
    assert.deepEqual(await send(7,'Assemblée des membres jeudi.','members','  Assemblée\r\ndu cercle  '),{sent:4,muted:0});
    const sent=await notices();
    assert.deepEqual(sent.map(m=>m.user_id),[1,2,3,4].map(uuid));
    // A subject always starts with « Annonce », so that it never passes for a login e-mail.
    assert.ok(sent.every(m=>m.title==='Annonce · Assemblée du cercle'));
    await clear();
  });
  await t.test('qui a coupé les annonces ne les reçoit pas, et l’organisateur le sait',async()=>{
    for(const n of [3,5]){await h.login(n);await h.call('select save_notification_choices($1)',[{announcement:false}]);}
    assert.deepEqual(await counts(),{everyone:{sent:4,muted:2},members:{sent:3,muted:1}});
    assert.deepEqual(await send(1,'Nouveau lieu à partir de décembre.'),{sent:4,muted:2});
    assert.deepEqual((await notices()).map(m=>m.user_id),[2,4,6,7].map(uuid));
    await h.login(1);
    assert.deepEqual(await h.call('select audience,subject,body,sent,muted,sender_id from announcements'),
      [{audience:'everyone',subject:'',body:'Nouveau lieu à partir de décembre.',sent:4,muted:2,sender_id:uuid(1)}]);
    // Nobody left to write to: refused, and nothing kept.
    for(const n of [1,2,4]){await h.login(n);await h.call('select save_notification_choices($1)',[{announcement:false}]);}
    await assert.rejects(send(7,'Il y a quelqu’un ?','members'),/coupé les annonces/);
    await h.login(1);assert.equal((await h.call('select 1 from announcements')).length,1);
    for(const n of [1,2,3,4,5]){await h.login(n);await h.call('select save_notification_choices($1)',[{announcement:true}]);}
    await clear();
  });
  await t.test('l’historique reste aux organisateurs, un an',async()=>{
    await send(1,'Une annonce');
    for(const n of [2,5]){await h.login(n);assert.equal((await h.call('select id from announcements')).length,0);}
    await h.anonymous();await assert.rejects(h.call('select id from announcements'),/permission denied/i);
    await h.login(2);await assert.rejects(h.call(`insert into announcements(audience,body) values('everyone','Fausse')`),/permission denied/i);
    await h.login(7);assert.equal((await h.call('select id from announcements')).length,1);
    await assert.rejects(h.call(`update announcements set body='Changée'`),/permission denied/i);
    // Older than a year: hidden, then dropped by the maintenance, which leaves the recent ones.
    await h.root();await h.call(`update announcements set created_at=now()-interval '13 months'`);
    await h.login(7);assert.equal((await h.call('select id from announcements')).length,0);
    await send(7,'La suivante');
    await h.root();await h.call('select maintenance()');
    assert.deepEqual((await h.call<{body:string}>('select body from announcements')).map(r=>r.body),['La suivante']);
    await clear();
  });
  await t.test('le texte est nettoyé et sa longueur bornée',async()=>{
    for(const text of ['',' x ','\n\n','‮x\u0007','a'.repeat(4001)])await assert.rejects(send(1,text),/2 à 4000 caractères/);
    await assert.rejects(send(1,'Bonjour','everyone','o'.repeat(101)),/100 caractères/);
    await assert.rejects(send(1,'Bonjour','tous'),/à qui/);
    await assert.rejects(send(1,'Bonjour',null as unknown as string),/à qui/);
    assert.deepEqual(await send(1,'Lien‮ : moc.elpmaxe⁦\u0007\tà bientôt 👋🏽','everyone','Objet\u0007‮piégé'),{sent:6,muted:0});
    const [first]=await notices();
    assert.equal(first.body,'Lien : moc.elpmaxe\tà bientôt 👋🏽\n\n— Joueur 1');
    assert.equal(first.title,'Annonce · Objet piégé');
    await clear();
  });
  await t.test('trois annonces par jour au plus, les refus ne comptant pas',async()=>{
    await assert.rejects(send(1,'x'),/2 à 4000/);
    for(let i=1;i<=3;i++)assert.equal((await send(1,`Annonce ${i}`)).sent,6);
    await assert.rejects(send(1,'Une de trop'),/déjà envoyé 3 annonces aujourd’hui/);
    // Another organizer still writes, up to five announcements a day for the whole circle.
    assert.equal((await send(7,'À samedi')).sent,6);
    assert.equal((await send(7,'À dimanche')).sent,6);
    await assert.rejects(send(7,'Encore une'),/5 annonces en 24 heures/);
    await h.root();assert.equal((await h.call('select 1 from announcements')).length,5);
    // A day later, the circle writes again.
    await h.call(`update announcements set created_at=now()-interval '25 hours'`);await h.call('delete from action_limits');
    assert.equal((await send(1,'Le lendemain')).sent,6);
    await clear();
  });
  await t.test('l’annonce part par e-mail, après les messages essentiels',async()=>{
    await send(1,'Les nouvelles du mois');
    await h.root();await h.call(`insert into notifications(user_id,title,body,kind) values($1,'Ta place est confirmée','…','waitlist')`,[uuid(2)]);
    await h.db.exec('set role service_role');
    const claimed=await h.call<{email:string;title:string;kind:string;session_id:string|null}>('select email,title,kind,session_id from claim_emails()');
    assert.equal(claimed[0].kind,'waitlist');
    const announcements=claimed.filter(m=>m.kind==='announcement');
    assert.deepEqual(announcements.map(m=>m.email).sort(),[2,3,4,5,6,7].map(n=>`test${n}@cercle.test`));
    assert.ok(announcements.every(m=>m.title==='Annonce de Joueur 1'&&m.session_id===null));
  });
});
