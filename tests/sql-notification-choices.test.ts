import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDatabase,uuid} from './sql-harness';
import {notificationChoices} from '../lib/notification-choices';

type Notice={user_id:string;title:string;body:string;kind:string};
const inDays=(days:number)=>new Date(Date.now()+days*86400000).toISOString();
const game=(changes:Record<string,unknown>={})=>{const starts=String(changes.starts_at??inDays(5));return {title:'',script:'Trouble Brewing',starts_at:starts,
  ends_at:new Date(Date.parse(starts)+4*3600000).toISOString(),location:'Le local',address:'1 rue du Port',venue_id:null,capacity:8,visibility:'public',
  description:'',beginners_welcome:true,...changes};};

test('Choix des notifications',async t=>{
  const h=await createDatabase();
  // 1 and 7 organize, 5 is a traveller; 9 brings the people who fill the games and is left out of what is checked.
  for(const [n,m] of [[1,'organizer'],[2,'member'],[3,'member'],[4,'member'],[5,'newcomer'],[6,'member'],[7,'organizer'],[9,'member']] as const)await h.user(n,m);
  const choose=async(n:number,choices:Record<string,unknown>)=>{await h.login(n);await h.call('select save_notification_choices($1)',[choices]);};
  const all=(on:boolean)=>Object.fromEntries(notificationChoices.map(c=>[c.kind,on]));
  const reset=(n:number)=>choose(n,Object.fromEntries(notificationChoices.map(c=>[c.kind,c.defaultOn])));
  const notices=async(where='true',params:unknown[]=[])=>{await h.root();return h.call<Notice>(`select user_id,title,body,kind from notifications where user_id<>'${uuid(9)}' and ${where} order by created_at,user_id`,params);};
  /** A game of 7 seats with only `free` left. */
  const tight=async(id:string,free:number)=>{await h.session(id,{capacity:7});await h.root();
    for(let i=0;i<7-free;i++)await h.call(`insert into bookings(session_id,guest_name,sponsor_id,status,pool) values($1,$2,$3,'confirmed','circle')`,[id,`Rempli ${i}`,uuid(9)]);};
  const clear=async()=>{await h.root();await h.call('delete from notifications');await h.call('delete from action_limits');};
  const book=async(n:number,id:string)=>{await h.login(n);return (await h.call<{book_session:string}>('select book_session($1)',[id]))[0].book_session;};

  await t.test('la liste des types est la même côté site et côté base',async()=>{
    await h.root();
    const kinds=await h.call<{kind:string;default_on:boolean}>('select kind,default_on from notification_kinds where optional order by kind');
    assert.deepEqual(kinds,notificationChoices.map(c=>({kind:c.kind,default_on:c.defaultOn})).sort((a,b)=>a.kind.localeCompare(b.kind)));
  });

  await t.test('chacun lit et change ses propres choix, et seulement ceux qui se coupent',async()=>{
    await choose(2,{booking:false,new_game:true});
    await h.login(2);
    assert.deepEqual(await h.call('select kind,enabled from notification_choices order by kind'),[{kind:'booking',enabled:false},{kind:'new_game',enabled:true}]);
    await choose(2,{booking:true});
    assert.deepEqual(await h.call('select kind,enabled from notification_choices order by kind'),[{kind:'booking',enabled:true},{kind:'new_game',enabled:true}]);
    // Someone else's choices stay out of reach, and nobody writes them directly.
    await h.login(3);assert.deepEqual(await h.call('select kind from notification_choices'),[]);
    await assert.rejects(h.call(`insert into notification_choices(user_id,kind,enabled) values($1,'booking',false)`,[uuid(3)]),/permission denied/i);
    await assert.rejects(h.call(`update notification_choices set enabled=false`),/permission denied/i);
    await assert.rejects(h.call('select user_id,updated_at from notification_choices'),/permission denied/i);
    // What tells someone whether and where to come cannot be switched off.
    for(const bad of [{waitlist:false},{change:false},{cancel:false},{review:false},{account:false},{other:false},{nope:true},{booking:'no'},{booking:null},[true],'"x"'])
      await assert.rejects(choose(3,bad as Record<string,unknown>),/invalides/);
    await h.anonymous();await assert.rejects(h.call('select save_notification_choices($1)',[{booking:false}]),/permission denied/i);
    // A suspended account changes nothing.
    await h.root();await h.call(`update profiles set membership='suspended' where id=$1`,[uuid(6)]);
    await assert.rejects(choose(6,{booking:false}),/Connecte-toi/);
    await h.root();await h.call(`update profiles set membership='member' where id=$1`,[uuid(6)]);
    await reset(2);
    await clear();
  });

  await t.test('un type coupé ne part plus, les messages essentiels partent toujours',async()=>{
    const id=uuid(100);await tight(id,2);
    await choose(3,{...all(false)});
    assert.equal(await book(2,id),'confirmed');
    assert.equal(await book(3,id),'confirmed');
    assert.equal(await book(4,id),'waitlisted');
    // 3 gets no receipt; 2 and 4 keep the default.
    assert.deepEqual((await notices()).map(n=>[n.user_id,n.kind]),[[uuid(2),'booking'],[uuid(4),'booking']]);
    await clear();
    // 4 switches everything off, yet the seat freed by 2 is still told.
    await choose(4,{...all(false)});
    await h.login(2);await h.call('select leave_session($1)',[id]);
    assert.deepEqual((await notices()).map(n=>[n.user_id,n.title,n.kind]),[[uuid(2),'Désistement enregistré','booking'],[uuid(4),'Une place s’est libérée : tu es inscrit·e','waitlist']]);
    await clear();
    // A change of date and a cancellation reach 3, who switched everything off; the rank change too.
    await h.login(1);await h.call('select save_session($1)',[{...game({starts_at:inDays(6),capacity:7}),id}]);
    assert.deepEqual((await notices()).map(n=>[n.user_id,n.kind]),[[uuid(3),'change'],[uuid(4),'change']]);
    await clear();
    await h.login(1);await h.call('select cancel_session($1)',[id]);
    assert.deepEqual((await notices()).map(n=>[n.user_id,n.kind]),[[uuid(3),'cancel'],[uuid(4),'cancel']]);
    await clear();
    await h.login(1);await h.call(`select set_membership($1,'newcomer')`,[uuid(3)]);await h.call(`select set_membership($1,'member')`,[uuid(3)]);
    assert.deepEqual((await notices()).map(n=>[n.user_id,n.kind]),[[uuid(3),'account']]);
    await reset(3);await reset(4);
    await clear();
  });

  await t.test('un mot joint à une modification part comme le changement, même à qui a coupé les messages',async()=>{
    const id=uuid(107);await h.session(id);
    assert.equal(await book(2,id),'confirmed');
    await choose(2,{message:false});
    await clear();
    await h.login(1);await h.call('select save_session($1)',[{...game({starts_at:new Date(Date.now()+10*86400000).toISOString()}),id,location:'Brest',address:'',note:'La porte est sur le côté.'}]);
    const [n]=await notices();
    assert.deepEqual([n.user_id,n.kind],[uuid(2),'change']);
    assert.match(n.body,/La porte est sur le côté/);
    await reset(2);
    await clear();
  });

  await t.test('le rappel suit le choix de chacun',async()=>{
    const id=uuid(101);await h.session(id,{startsIn:'20 hours'});
    for(const n of [2,3])assert.equal(await book(n,id),'confirmed');
    await choose(3,{reminder:false});
    await clear();
    await h.root();await h.call('select maintenance()');
    assert.deepEqual((await notices()).map(n=>[n.user_id,n.title,n.kind]),[[uuid(2),'Ta session approche','reminder']]);
    // Switched back on, the reminder comes at the next run; never twice.
    await choose(3,{reminder:true});
    await h.root();await h.call('select maintenance()');await h.call('select maintenance()');
    assert.deepEqual((await notices()).map(n=>n.user_id),[uuid(2),uuid(3)]);
    await clear();
  });

  await t.test('l’organisateur sait combien de personnes ont coupé ses messages',async()=>{
    const id=uuid(102);await h.session(id);
    for(const n of [2,3,4])assert.equal(await book(n,id),'confirmed');
    await choose(3,{message:false});await choose(4,{message:false});
    await clear();
    await h.login(1);
    assert.deepEqual((await h.call('select send_session_message_counts($1,$2) as r',[id,'Apportez des gâteaux']))[0].r,{sent:1,muted:2});
    assert.deepEqual((await notices()).map(n=>[n.user_id,n.kind]),[[uuid(2),'message']]);
    // The site already deployed still reads the number of people reached.
    await h.login(1);assert.deepEqual((await h.call('select send_session_message($1,$2) as r',[id,'Et des boissons']))[0].r,1);
    await choose(2,{message:false});
    await h.login(1);await assert.rejects(h.call('select send_session_message_counts($1,$2)',[id,'Encore moi']),/ont coupé les messages/);
    await h.anonymous();await assert.rejects(h.call('select send_session_message_counts($1,$2)',[id,'Bonjour']),/permission denied/i);
    for(const n of [2,3,4])await choose(n,{message:true});
    await clear();
  });

  await t.test('une nouvelle partie est annoncée à ceux qui l’ont demandé et peuvent la voir',async()=>{
    // 2 (member), 5 (traveller), 6 (suspended later) and 1 (the organizer creating it) asked; 3 did not.
    for(const n of [1,2,5,6])await choose(n,{new_game:true});
    await h.root();await h.call(`update profiles set membership='suspended' where id=$1`,[uuid(6)]);
    await h.login(1);
    const open=(await h.call<{save_session:string}>('select save_session($1)',[game({title:'Soirée ouverte'})]))[0].save_session;
    const members=(await h.call<{save_session:string}>('select save_session($1)',[game({title:'Entre membres',visibility:'members'})]))[0].save_session;
    const told=async(id:string)=>(await notices('session_id=$1',[id])).map(n=>n.user_id);
    assert.deepEqual(await told(open),[uuid(2),uuid(5)]);
    assert.deepEqual(await told(members),[uuid(2)]);
    const [first]=await notices('session_id=$1',[members]);
    assert.equal(first.title,'Nouvelle partie');assert.equal(first.kind,'new_game');
    assert.match(first.body,/réservée aux membres/);
    // Editing it again tells nobody new.
    await h.login(1);await h.call('select save_session($1)',[{...game({title:'Soirée ouverte'}),id:open}]);
    assert.deepEqual(await told(open),[uuid(2),uuid(5)]);
    // A game starting within the half hour, or in the past, is no news.
    await h.root();await h.call(`insert into sessions(title,script,starts_at,ends_at,location,capacity,visibility,created_by) values
      ('Tout de suite','TB',now()+interval '10 minutes',now()+interval '4 hours','Ici',8,'public',$1),('Hier','TB',now()-interval '1 day',now()-interval '20 hours','Ici',8,'public',$1)`,[uuid(1)]);
    assert.equal((await notices(`title='Nouvelle partie' and session_id not in ($1,$2)`,[open,members])).length,0);
    await h.root();await h.call(`update profiles set membership='member' where id=$1`,[uuid(6)]);
    await clear();
  });

  await t.test('une partie récurrente est annoncée une fois, par sa première date',async()=>{
    await h.login(7);
    const {starts_at,ends_at}=game({starts_at:inDays(2)});
    const series=(await h.call<{save_series:string}>('select save_series($1)',[{...game(),starts_at,ends_at,every_weeks:1,weeks_ahead:4,ends_on:null}]))[0].save_series;
    await h.root();
    const dates=await h.call<{id:string}>('select id from sessions where series_id=$1 order by starts_at',[series]);
    assert.ok(dates.length>=4);
    const told=await notices(`title='Nouvelle partie'`);
    assert.deepEqual(told.map(n=>n.user_id),[uuid(1),uuid(2),uuid(5),uuid(6)]);
    assert.match(told[0].body,/revient chaque semaine/);
    assert.ok((await h.call<{session_id:string}>(`select distinct session_id from notifications where title='Nouvelle partie'`)).every(r=>r.session_id===dates[0].id));
    // The dates opened later, week after week, are not announced, even once the earlier ones are gone.
    await h.call(`update session_series set weeks_ahead=8 where id=$1`,[series]);await h.call('select extend_series($1)',[series]);
    assert.equal((await notices(`title='Nouvelle partie'`)).length,4);
    await h.call('delete from sessions where series_id=$1',[series]);
    await h.call(`update session_series set weeks_ahead=12 where id=$1`,[series]);await h.call('select extend_series($1)',[series]);
    assert.ok((await h.call('select 1 from sessions where series_id=$1',[series])).length>0);
    // The four messages already written stay, about no game any more; no new one.
    assert.equal((await notices(`title='Nouvelle partie'`)).length,4);
    for(const n of [1,2,5,6])await choose(n,{new_game:false});
    await clear();
  });

  await t.test('l’organisateur qui l’a demandé suit les inscriptions et désistements de ses parties',async()=>{
    const id=uuid(103);await tight(id,3);
    await choose(1,{activity:true});
    const activity=async()=>(await notices(`kind='activity'`));
    assert.equal(await book(2,id),'confirmed');
    let [n]=await activity();
    assert.deepEqual([n.user_id,n.title,n.body],[uuid(1),'Nouvelle inscription','Joueur 2 a pris une place.']);
    // Sent: the next move is a message of its own.
    await h.root();await h.call(`update notifications set emailed_at=now(),email_attempts=1 where kind='activity'`);
    await h.login(3);await h.call('select add_guest($1,$2)',[id,'Léa']);
    assert.equal(await book(3,id),'confirmed');
    assert.equal(await book(4,id),'waitlisted');
    await h.login(3);await h.call('select leave_session($1,$2)',[id,(await h.call<{id:string}>(`select id from bookings where guest_name='Léa'`)).map(r=>r.id)]);
    const moves=await activity();
    assert.equal(moves.length,2);
    // Until it leaves, the message gathers what follows. 4 taking the seat freed is nobody's own move: it is not written.
    assert.deepEqual([moves[1].title,moves[1].body],['Inscriptions et désistements',
      'Léa, invité·e de Joueur 3 a pris une place.\nJoueur 3 a pris une place.\nJoueur 4 est sur la liste d’attente.\nLéa, invité·e de Joueur 3 a libéré sa place.\nJoueur 3 a libéré sa place.']);
    await clear();
    // An organizer's own moves and decisions, and a game created by someone else, tell nothing.
    await h.login(1);await h.call('select book_session($1)',[id]);
    await h.call('select review_booking((select id from bookings where user_id=$1 and session_id=$2),false)',[uuid(2),id]);
    assert.deepEqual(await activity(),[]);
    await h.root();await h.call('update sessions set created_by=$1 where id=$2',[uuid(7),id]);
    assert.equal(await book(5,id),'confirmed');
    assert.deepEqual(await activity(),[]);
    // Once 7 asks, they are told; a cancelled game is not news.
    await choose(7,{activity:true});
    await h.login(5);await h.call('select leave_session($1)',[id]);
    assert.deepEqual((await activity()).map(n=>[n.user_id,n.title,n.body]),[[uuid(7),'Désistement','Joueur 5 a libéré sa place.']]);
    await clear();
    await h.login(7);await h.call('select cancel_session($1)',[id]);
    assert.deepEqual(await activity(),[]);
    await clear();
  });

  await t.test('l’envoi connaît le type de chaque message et les places des parties annoncées',async()=>{
    const id=uuid(104);await tight(id,2);
    await choose(7,{activity:true});
    await h.root();await h.call('update sessions set created_by=$1 where id=$2',[uuid(7),id]);
    for(const n of [2,3,4])await book(n,id);
    type Claimed={email:string;kind:string;session_capacity:number|null;session_taken:number|null;session_waiting:number|null};
    const claim=async()=>{await h.root();await h.db.exec('set role service_role');
      return (await h.call<Claimed>('select email,kind,session_capacity,session_taken,session_waiting from claim_emails() order by email')).map(c=>[c.email,c.kind,c.session_capacity,c.session_taken,c.session_waiting]);};
    // The activity of a game waits a quarter of an hour, so that what follows joins it.
    assert.deepEqual(await claim(),[['test2@cercle.test','booking',null,null,null],['test3@cercle.test','booking',null,null,null],['test4@cercle.test','booking',null,null,null]]);
    await h.root();await h.call(`update notifications set created_at=now()-interval '16 minutes' where kind='activity'`);
    assert.deepEqual(await claim(),[['test7@cercle.test','activity',7,7,1]]);
    // A message put back, such as when the provider asks to slow down, does not spend one of its attempts.
    await h.call(`select release_emails(array(select id from notifications where kind='activity'))`);
    await h.root();assert.deepEqual(await h.call(`select email_attempts,claimed_until from notifications where kind='activity'`),[{email_attempts:0,claimed_until:null}]);
    await h.login(7);await assert.rejects(h.call('select release_emails($1)',[[uuid(1)]]),/permission denied/i);
    await clear();
  });

  await t.test('ce qui dit si et où venir part avant les nouvelles parties',async()=>{
    await choose(2,{new_game:true});
    await h.login(1);const id=(await h.call<{save_session:string}>('select save_session($1)',[game({title:'Plus tard'})]))[0].save_session;
    const other=uuid(105);await h.session(other);
    assert.equal(await book(3,other),'confirmed');
    await h.root();await h.call(`update notifications set created_at=now()-interval '1 minute' where kind='new_game'`);
    await h.db.exec('set role service_role');
    // Two new games for 2, the one created on the site and the one of 3's booking, written before it: the booking leaves first.
    assert.deepEqual((await h.call<{kind:string}>('select kind from claim_emails()')).map(c=>c.kind),['booking','new_game','new_game']);
    await clear();
    // A new game is checked again as it leaves: still published, still visible to the person.
    await h.login(1);await h.call('select save_session($1)',[{...game({title:'Plus tard',visibility:'public'}),id}]);
    await h.root();await h.call(`insert into notifications(user_id,session_id,title,body,kind) values($1,$2,'Nouvelle partie','x','new_game'),($3,$2,'Nouvelle partie','x','new_game')`,[uuid(2),id,uuid(5)]);
    await h.call(`update sessions set visibility='members' where id=$1`,[id]);
    await h.db.exec('set role service_role');
    assert.deepEqual((await h.call<{email:string}>('select email from claim_emails()')).map(c=>c.email),['test2@cercle.test']);
    await h.root();await h.call(`update notifications set claimed_until=null,email_attempts=0`);
    await h.call(`update profiles set membership='suspended' where id=$1`,[uuid(2)]);
    await h.db.exec('set role service_role');
    assert.deepEqual(await h.call('select email from claim_emails()'),[]);
    await h.root();await h.call(`update profiles set membership='member' where id=$1`,[uuid(2)]);
    await h.call(`update notifications set claimed_until=null,email_attempts=0`);
    await h.login(1);await h.call('select cancel_session($1)',[id]);
    await h.root();await h.db.exec('set role service_role');
    assert.deepEqual((await h.call<{kind:string}>('select kind from claim_emails()')).map(c=>c.kind),[]);
    await clear();
  });

  await t.test('dix nouvelles parties par jour au plus pour une même personne',async()=>{
    await h.login(1);
    for(let i=0;i<12;i++)await h.call('select save_session($1)',[game({title:`Partie ${i}`,starts_at:inDays(3+i)})]);
    assert.equal((await notices(`user_id=$1 and kind='new_game'`,[uuid(2)])).length,10);
    await reset(2);
    await clear();
  });

  await t.test('un nom ne peut pas fausser l’e-mail de l’organisateur',async()=>{
    const id=uuid(106);await h.session(id);
    await choose(1,{activity:true});
    await h.root();await h.call(`update profiles set display_name=$1 where id=$2`,['X\nConnexion : https://evil.tld/\u202Emoc',uuid(4)]);
    await h.call(`update profiles set display_name=$1 where id=$2`,['X\u2028Y\u0007\u200F',uuid(4)]);
    assert.equal(await book(4,id),'confirmed');
    await h.login(3);await h.call('select add_guest($1,$2)',[id,'Léa\u2066 \u2069']);
    assert.deepEqual((await notices(`kind='activity'`)).map(n=>n.body),['X Y a pris une place.\nLéa, invité·e de Joueur 3 a pris une place.']);
    await h.root();await h.call(`update profiles set display_name='Joueur 4' where id=$1`,[uuid(4)]);
    await reset(1);
    await clear();
  });
});
