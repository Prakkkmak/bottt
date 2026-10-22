import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDatabase,uuid} from './sql-harness';

type Row={user_id:string|null;guest_name:string|null;status:string;seat_index:number|null;offer_expires_at:string|null};

test('Liste d’attente unique, sans validation',async t=>{
  const h=await createDatabase();
  for(const [n,m] of [[1,'organizer'],[2,'member'],[3,'newcomer'],[4,'member'],[5,'newcomer'],[6,'member'],[7,'member'],[8,'member'],[9,'member']] as const)await h.user(n,m);
  const game=uuid(100);await h.session(game,{capacity:7,travellerSeats:2});
  const row=async(where:string,params:unknown[]=[])=>{await h.root();return (await h.call<Row>(`select user_id,guest_name,status,seat_index,offer_expires_at from bookings where session_id=$1 and ${where}`,[game,...params]))[0];};
  const notices=async(n:number)=>{await h.root();return h.call<{title:string;body:string}>('select title,body from notifications where user_id=$1 order by created_at,id',[uuid(n)]);};
  const book=async(n:number,id=game)=>{await h.login(n);return (await h.call<{book_session:string}>('select book_session($1)',[id]))[0].book_session;};
  const add=async(n:number,name:string,id=game)=>{await h.login(n);return (await h.call<{add_guest:string}>('select add_guest($1,$2)',[id,name]))[0].add_guest;};

  await t.test('un voyageur s’inscrit directement et reçoit la confirmation, sans organisateur',async()=>{
    assert.equal(await book(3),'confirmed');
    assert.deepEqual((await notices(3)).map(n=>n.title),['Ta place est réservée']);
    // More travellers than the former traveller seats: nobody is held back by rank any more.
    assert.equal(await book(5),'confirmed');
    assert.equal(await add(5,'Nora'),'confirmed');
    assert.deepEqual((await notices(5)).map(n=>n.title),['Ta place est réservée','Nora a sa place']);
  });
  await t.test('une fois le cercle complet, une seule file dans l’ordre d’arrivée, invités compris',async()=>{
    for(const n of [2,4,6])assert.equal(await book(n),'confirmed');
    assert.equal(await add(2,'Paul'),'confirmed');
    // 7 tokens taken: the queue starts.
    assert.equal(await add(5,'Yann'),'waitlisted');
    assert.equal(await book(7),'waitlisted');
    assert.equal(await add(4,'Inès'),'waitlisted');
    assert.equal(await book(8),'waitlisted');
    const yann=(await notices(5)).at(-1)!;
    assert.equal(yann.title,'Yann est sur la liste d’attente');assert.match(yann.body,/Yann est n° 1 sur la liste d’attente/);
    const seven=(await notices(7)).at(-1)!;
    assert.equal(seven.title,'Tu es sur la liste d’attente');assert.match(seven.body,/tu es n° 2 sur la liste d’attente/);
    assert.match((await notices(8)).at(-1)!.body,/n° 4/);
    // A second click keeps the place in the queue.
    assert.equal(await book(7),'waitlisted');
    assert.equal((await notices(7)).length,1);
  });
  await t.test('un désistement donne aussitôt la place au premier de la file, et c’est son parrain qui est prévenu',async()=>{
    await h.login(6);await h.call('select cancel_booking($1)',[game]);
    const yann=await row(`guest_name='Yann'`);
    assert.deepEqual([yann.status,yann.offer_expires_at],['confirmed',null]);
    assert.notEqual(yann.seat_index,null);
    const notice=(await notices(5)).at(-1)!;
    assert.equal(notice.title,'Une place s’est libérée pour Yann');
    assert.equal((await row('user_id=$2',[uuid(7)])).status,'waitlisted');
  });
  await t.test('retirer un invité fait monter la personne suivante, prévenue par un message',async()=>{
    await h.root();const [paul]=await h.call<{id:string}>(`select id from bookings where guest_name='Paul'`);
    await h.login(2);await h.call('select remove_guest($1)',[paul.id]);
    assert.equal((await row('user_id=$2',[uuid(7)])).status,'confirmed');
    assert.deepEqual((await notices(7)).at(-1)!.title,'Une place s’est libérée : tu es inscrit·e');
    assert.equal((await row(`guest_name='Inès'`)).status,'waitlisted');
  });
  await t.test('quitter la file la raccourcit, et revenir place à la fin',async()=>{
    await h.login(8);await h.call('select cancel_booking($1)',[game]);
    assert.equal(await book(8),'waitlisted');
    assert.match((await notices(8)).at(-1)!.body,/n° 2/);
  });
  await t.test('un organisateur qui retire quelqu’un fait monter la file',async()=>{
    await h.root();const [own]=await h.call<{id:string}>('select id from bookings where session_id=$1 and user_id=$2',[game,uuid(3)]);
    await h.login(1);await h.call('select review_booking($1,false)',[own.id]);
    assert.equal((await row(`guest_name='Inès'`)).status,'confirmed');
    assert.equal((await notices(4)).at(-1)!.title,'Une place s’est libérée pour Inès');
  });
  await t.test('agrandir la partie fait entrer les suivants, sans message de changement',async()=>{
    await h.root();const [s]=await h.call<{starts_at:Date;ends_at:Date}>('select starts_at,ends_at from sessions where id=$1',[game]);
    await h.login(1);
    await h.call('select save_session($1::jsonb)',[JSON.stringify({id:game,title:'Soirée de test',description:'',script:'Trouble Brewing',starts_at:s.starts_at.toISOString(),ends_at:s.ends_at.toISOString(),location:'Brest',address:'',capacity:8,beginners_welcome:true,visibility:'public'})]);
    assert.equal((await row('user_id=$2',[uuid(8)])).status,'confirmed');
    await h.root();
    assert.equal((await h.call(`select 1 from notifications where title='Les informations de ta session ont changé'`)).length,0);
    // Without the former quotas in the request, the stored values stay as they were.
    assert.deepEqual(await h.call('select capacity,newcomer_seats,release_hours from sessions where id=$1',[game]),[{capacity:8,newcomer_seats:2,release_hours:72}]);
  });
  await t.test('personne n’entre à moins de 30 minutes du début',async()=>{
    const soon=uuid(101);await h.session(soon,{capacity:7,startsIn:'2 hours'});
    for(const n of [2,3,4,5,6,7,8])await book(n,soon);
    assert.equal(await book(9,soon),'waitlisted');
    await h.root();await h.call(`update sessions set starts_at=now()+interval '20 minutes',ends_at=now()+interval '4 hours' where id=$1`,[soon]);
    await h.login(2);await h.call('select cancel_booking($1)',[soon]);
    await h.root();
    assert.equal((await h.call<{status:string}>('select status from bookings where session_id=$1 and user_id=$2',[soon,uuid(9)]))[0].status,'waitlisted');
  });
  await t.test('la boîte d’envoi donne la partie avec chaque message, et seulement au service',async()=>{
    await h.login(2);
    await assert.rejects(h.call('select * from claim_emails()'),/permission denied/);
    await assert.rejects(h.call('select waitlist_position($1)',[uuid(1)]),/permission denied/);
    await h.root();
    const claimed=await h.call<{email:string;title:string;session_title:string;session_script:string;session_location:string;session_starts_at:Date}>('select * from claim_emails() where session_id=$1',[game]);
    assert.ok(claimed.length>0);
    assert.ok(claimed.every(m=>m.session_title==='Soirée de test'&&m.session_script==='Trouble Brewing'&&m.session_location==='Brest'&&m.session_starts_at instanceof Date));
    assert.ok(claimed.some(m=>m.email==='test5@cercle.test'&&m.title==='Une place s’est libérée pour Yann'));
  });
  const second=uuid(102);
  const guestId=async(name:string)=>{await h.root();return (await h.call<{id:string}>('select id from bookings where session_id=$1 and guest_name=$2',[second,name]))[0].id;};
  const statusIn=async(where:string,params:unknown[]=[])=>{await h.root();return (await h.call<{status:string}>(`select status from bookings where session_id=$1 and ${where}`,[second,...params]))[0].status;};
  const leave=async(n:number,guests:string[]=[])=>{await h.login(n);await h.call('select leave_session($1,$2::uuid[])',[second,guests]);};
  await t.test('se désister avec ses invités en une fois : la place va à la file, jamais à une personne qui part aussi',async()=>{
    await h.session(second,{capacity:7});
    assert.equal(await book(2,second),'confirmed');assert.equal(await add(2,'Gaby',second),'confirmed');assert.equal(await add(9,'Lou',second),'confirmed');
    for(const n of [3,4,5,6])assert.equal(await book(n,second),'confirmed');
    assert.equal(await add(2,'Hugo',second),'waitlisted');assert.equal(await book(9,second),'waitlisted');assert.equal(await book(8,second),'waitlisted');
    const before=(await notices(2)).length;
    await leave(2,[await guestId('Gaby'),await guestId('Hugo')]);
    assert.deepEqual([await statusIn('user_id=$2',[uuid(2)]),await statusIn(`guest_name='Gaby'`),await statusIn(`guest_name='Hugo'`)],['cancelled','cancelled','cancelled']);
    assert.deepEqual([await statusIn('user_id=$2',[uuid(9)]),await statusIn('user_id=$2',[uuid(8)])],['confirmed','confirmed']);
    // Hugo leaves with his sponsor: no message says he has a seat.
    assert.deepEqual((await notices(2)).slice(before).map(n=>n.title),['Désistement enregistré']);
  });
  await t.test('se désister seul garde les invités, et quitter la file a son propre message',async()=>{
    await leave(9);
    assert.deepEqual([await statusIn('user_id=$2',[uuid(9)]),await statusIn(`guest_name='Lou'`)],['cancelled','confirmed']);
    assert.equal(await book(7,second),'confirmed');
    assert.equal(await book(2,second),'waitlisted');
    await leave(2);
    assert.equal((await notices(2)).at(-1)!.title,'Tu as quitté la liste d’attente');
  });
  await t.test('on ne retire pas les invités d’un autre',async()=>{
    const lou=await guestId('Lou');await h.login(3);
    await assert.rejects(h.call('select leave_session($1,$2::uuid[])',[second,[lou]]),/Action non autorisée/);
    assert.deepEqual([await statusIn('user_id=$2',[uuid(3)]),await statusIn(`guest_name='Lou'`)],['confirmed','confirmed']);
  });
  await t.test('un message qui n’a pas pu partir à temps ne part plus : un jour après, ou la partie commencée',async()=>{
    const started=uuid(103);await h.session(started,{capacity:7,startsIn:'-1 hour'});
    await h.root();
    await h.call(`insert into notifications(user_id,session_id,title,body,created_at) values($1,null,'Trop ancien','x',now()-interval '25 hours'),($1,$2,'Partie commencée','x',now()),($1,null,'À envoyer','x',now())`,[uuid(4),started]);
    for(let round=0;round<20&&(await h.call('select * from claim_emails()')).length;round++);
    const outbox=await h.call<{title:string;email_attempts:number}>(`select title,email_attempts from notifications where title in ('Trop ancien','Partie commencée','À envoyer') order by title`);
    assert.deepEqual(outbox.map(n=>[n.title,n.email_attempts]),[['Partie commencée',0],['Trop ancien',0],['À envoyer',1]]);
  });
  await t.test('sans validation, un·e voyageur·se lit l’adresse exacte 48 h avant la partie ; un membre dès sa place',async()=>{
    const far=uuid(104),near=uuid(105);await h.session(far,{capacity:7,startsIn:'5 days'});await h.session(near,{capacity:7,startsIn:'30 hours'});
    await h.root();await h.call(`insert into session_addresses(session_id,address) values($1,'1 rue loin'),($2,'2 rue près')`,[far,near]);
    for(const id of [far,near])assert.equal(await book(3,id),'confirmed');
    assert.equal(await book(4,far),'confirmed');assert.equal(await add(5,'Nina',far),'confirmed');
    const read=async(n:number)=>{await h.login(n);return (await h.call<{address:string}>('select address from session_addresses where session_id in ($1,$2) order by address',[far,near])).map(a=>a.address);};
    assert.deepEqual(await read(3),['2 rue près']);
    assert.deepEqual(await read(4),['1 rue loin']);
    assert.deepEqual(await read(5),[]);
    assert.deepEqual(await read(1),['1 rue loin','2 rue près']);
  });
  await h.db.close();
});

test('Passage à la liste d’attente des inscriptions existantes',async t=>{
  const h=await createDatabase({before:'202610220010'});
  for(const [n,m] of [[1,'organizer'],[2,'member'],[3,'newcomer'],[4,'member'],[5,'newcomer'],[6,'member'],[7,'member'],[8,'member']] as const)await h.user(n,m);
  const game=uuid(100);await h.session(game,{capacity:7,travellerSeats:2});
  const full=uuid(101);await h.session(full,{capacity:7,travellerSeats:1});
  const soon=uuid(102);await h.session(soon,{capacity:7,travellerSeats:1,startsIn:'2 hours'});
  const status=async(id:string,where:string)=>{await h.root();return (await h.call<{status:string}>(`select status from bookings where session_id=$1 and ${where}`,[id]))[0].status;};
  const notices=async(n:number,id:string)=>{await h.root();return h.call<{title:string;body:string}>('select title,body from notifications where user_id=$1 and session_id=$2 order by created_at,id',[uuid(n),id]);};
  // Before the switch. First game: a traveller and the friend they bring wait for an organizer while tokens are free.
  for(const n of [2,4]){await h.login(n);await h.call('select book_session($1)',[game]);}
  await h.login(3);await h.call('select book_session($1)',[game]);await h.call('select add_guest($1,$2)',[game,'Nora']);
  // Second game: the member seats are taken, one of them by an offer still open, so a member waits while
  // the traveller seat is free; then a traveller asks for that seat.
  for(const n of [2,4,6,7]){await h.login(n);await h.call('select book_session($1)',[full]);}
  await h.login(2);for(const name of ['Ana','Bob'])await h.call('select add_guest($1,$2)',[full,name]);
  await h.login(8);await h.call('select book_session($1)',[full]);
  await h.login(5);await h.call('select book_session($1)',[full]);
  await h.login(3);await h.call('select book_session($1)',[soon]);
  await h.root();
  await h.call(`update sessions set starts_at=now()+interval '20 minutes',ends_at=now()+interval '4 hours' where id=$1`,[soon]);
  await h.call(`update bookings set status='offered',offer_expires_at=now()+interval '2 hours' where session_id=$1 and user_id=$2`,[full,uuid(7)]);
  await h.call(`insert into notifications(user_id,title,body,created_at) values($1,'Ancien message','x',now()-interval '2 days'),($1,'Message récent','x',now()-interval '5 minutes')`,[uuid(2)]);
  assert.deepEqual([await status(game,`user_id='${uuid(3)}'`),await status(game,`guest_name='Nora'`),await status(full,`user_id='${uuid(8)}'`),await status(full,`user_id='${uuid(5)}'`)],['pending','pending','waitlisted','pending']);
  await h.migrate();

  await t.test('les demandes en attente de validation prennent les places libres, et leurs auteurs sont prévenus',async()=>{
    assert.deepEqual([await status(game,`user_id='${uuid(3)}'`),await status(game,`guest_name='Nora'`)],['confirmed','confirmed']);
    // Both come from the same switch, at the same instant.
    const told=(await notices(3,game)).slice(-2).sort((x,y)=>x.title.localeCompare(y.title));
    assert.deepEqual(told.map(n=>n.title),['Nora a sa place','Ta place est confirmée']);
    assert.ok(told.every(n=>n.body.startsWith('Plus besoin de validation')));
  });
  await t.test('une proposition encore ouverte devient une place confirmée',async()=>{
    assert.equal(await status(full,`user_id='${uuid(7)}'`),'confirmed');
    assert.equal((await notices(7,full)).at(-1)!.title,'Ta place est confirmée');
  });
  await t.test('la dernière place va à la personne arrivée la première ; le voyageur suivant rejoint la file et en est prévenu',async()=>{
    assert.equal(await status(full,`user_id='${uuid(8)}'`),'confirmed');
    assert.equal((await notices(8,full)).at(-1)!.title,'Une place s’est libérée : tu es inscrit·e');
    assert.equal(await status(full,`user_id='${uuid(5)}'`),'waitlisted');
    const last=(await notices(5,full)).at(-1)!;
    assert.equal(last.title,'Tu es sur la liste d’attente');
    assert.match(last.body,/Plus besoin de validation : la partie est complète et tu es n° 1 sur la liste d’attente/);
    await h.root();
    assert.equal((await h.call(`select 1 from bookings where session_id in ($1,$2) and status in ('pending','offered')`,[game,full])).length,0);
  });
  await t.test('les anciens messages jamais envoyés ne partent pas en retard, les récents si',async()=>{
    await h.root();
    const outbox=await h.call<{title:string;email_attempts:number}>(`select title,email_attempts from notifications where title in ('Ancien message','Message récent') order by title`);
    assert.deepEqual(outbox.map(n=>[n.title,n.email_attempts]),[['Ancien message',5],['Message récent',0]]);
  });
  await t.test('ce que l’ancien parcours avait mis en attente d’envoi pour ces personnes ne part pas',async()=>{
    await h.root();
    const old=await h.call<{title:string;email_attempts:number;emailed_at:string|null}>(`select title,email_attempts from notifications where title in ('Demande envoyée','Tu es sur la liste d’attente') and body not like 'Plus besoin%' and session_id in ($1,$2)`,[game,full]);
    assert.ok(old.length>=3);
    assert.ok(old.every(n=>n.email_attempts===5));
    // Someone already seated before the switch still gets the confirmation of the booking.
    assert.equal((await h.call<{email_attempts:number}>(`select email_attempts from notifications where user_id=$1 and session_id=$2 and title='Ta place est réservée'`,[uuid(2),full]))[0].email_attempts,0);
  });
  await t.test('une partie qui commence dans moins de 30 minutes reste en l’état',async()=>{
    assert.equal(await status(soon,`user_id='${uuid(3)}'`),'pending');
    assert.deepEqual((await notices(3,soon)).map(n=>n.title),['Demande envoyée']);
  });
  await h.db.close();
});
