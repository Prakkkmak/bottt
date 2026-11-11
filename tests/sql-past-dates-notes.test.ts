import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDatabase,uuid} from './sql-harness';

type Change={field:string;before?:string;after:string};
type Notice={user_id:string;title:string;body:string;changes:Change[];note:string|null;sender_id:string|null};
const title='Les informations de ta session ont changé';

test('Une partie peut prendre une date passée, et l’organisateur peut joindre un mot à ses changements',async t=>{
  const h=await createDatabase();
  for(const [n,m] of [[1,'organizer'],[2,'member'],[3,'newcomer'],[4,'member'],[6,'organizer']] as const)await h.user(n,m);
  const book=async(n:number,id:string)=>{await h.login(n);return (await h.call<{book_session:string}>('select book_session($1)',[id]))[0].book_session;};
  const current=async(id:string)=>{await h.root();return (await h.call<{starts_at:Date;ends_at:Date;location:string;title:string;capacity:number}>('select starts_at,ends_at,location,title,capacity from sessions where id=$1',[id]))[0];};
  const edit=async(id:string,changes:Record<string,unknown>,by=1)=>{
    const s=await current(id);
    await h.login(by);
    await h.call('select save_session($1::jsonb)',[JSON.stringify({id,title:s.title,description:'',script:'Trouble Brewing',starts_at:s.starts_at.toISOString(),ends_at:s.ends_at.toISOString(),
      location:s.location,address:'1 rue du Port, Brest',capacity:s.capacity,beginners_welcome:true,visibility:'public',...changes})]);
  };
  const at=(days:number)=>{const starts=new Date(Date.now()+days*86400000);return {starts_at:starts.toISOString(),ends_at:new Date(starts.getTime()+4*3600000).toISOString()};};
  const notices=async(id:string)=>{await h.root();return h.call<Notice>('select user_id,title,body,changes,note,sender_id from notifications where session_id=$1 and emailed_at is null and email_attempts<5 order by user_id,created_at',[id]);};
  const clear=async(id:string)=>{await h.root();await h.call('delete from notifications where session_id=$1',[id]);};

  await t.test('une partie à venir passe à une date passée : close, rangée avec les passées, sans message à personne',async()=>{
    const game=uuid(100);await h.session(game,{startsIn:'2 days'});
    await h.root();await h.call(`insert into session_addresses values($1,'1 rue du Port, Brest')`,[game]);
    assert.equal(await book(2,game),'confirmed');assert.equal(await book(3,game),'confirmed');
    await clear(game);
    await edit(game,{...at(-5),location:'La Tour',note:'On l’a jouée mercredi dernier.'});
    const s=await current(game);
    assert.ok(s.ends_at.getTime()<Date.now());
    assert.equal(s.location,'La Tour');
    assert.deepEqual(await notices(game),[]);
    // Its players still read it, among the past games, with their seat.
    await h.login(2);
    const listed=(await h.call<{list_sessions:{id:string;my_status:string}[]}>('select list_sessions()'))[0].list_sessions.find(g=>g.id===game);
    assert.equal(listed?.my_status,'confirmed');
    await assert.rejects(book(4,game),/closes/);
    // Edited again in the past, it still writes to nobody, and the note counts for nothing.
    await edit(game,{location:'Brest',note:'Encore un mot.'});
    assert.deepEqual(await notices(game),[]);
    await h.root();
    assert.equal((await h.call(`select 1 from action_limits where user_id=$1 and action='session_message'`,[uuid(1)])).length,0);
    // Brought back to the future, the game writes again, with its new date alone: nobody was told about the past one.
    await edit(game,at(3));
    assert.deepEqual((await notices(game)).map(n=>[n.user_id,n.title,n.changes.map(c=>[c.field,'before' in c])]),
      [[uuid(2),title,[['starts_at',false]]],[uuid(3),title,[['starts_at',false]]]]);
    await clear(game);
  });
  await t.test('une nouvelle partie peut être créée à une date passée ; une série, non',async()=>{
    await h.login(1);
    const id=(await h.call<{save_session:string}>('select save_session($1::jsonb)',[JSON.stringify({title:'',description:'',script:'Trouble Brewing',...at(-2),location:'Brest',address:'',capacity:8,beginners_welcome:true,visibility:'public'})]))[0].save_session;
    assert.ok((await current(id)).starts_at.getTime()<Date.now());
    await h.login(1);
    await assert.rejects(h.call('select save_series($1::jsonb)',[JSON.stringify({title:'',script:'Trouble Brewing',...at(-2),location:'Brest',address:'',capacity:8,visibility:'public',every_weeks:1,weeks_ahead:4})]),/date à venir/);
    await h.login(1);
    await assert.rejects(h.call('select save_session($1::jsonb)',[JSON.stringify({title:'',description:'',script:'Trouble Brewing',location:'Brest',address:'',capacity:8,beginners_welcome:true,visibility:'public'})]),/jour et l’heure/);
  });
  await t.test('le mot part avec les changements, signé, à chacun, son auteur compris quand il reçoit le changement',async()=>{
    const game=uuid(101);await h.session(game,{startsIn:'10 days'});
    await h.root();await h.call(`insert into session_addresses values($1,'1 rue du Port, Brest')`,[game]);
    for(const n of [1,2,3])assert.equal(await book(n,game),'confirmed');
    await h.login(2);await h.call('select add_guest($1,$2)',[game,'Paul']);
    await clear(game);
    await edit(game,{...at(11),note:'\r\n  La salle est prise mercredi :\r\non décale à jeudi.‮  '});
    const sent=await notices(game);
    assert.deepEqual(sent.map(n=>[n.user_id,n.title,n.changes.map(c=>c.field)]),[[uuid(1),title,['starts_at']],[uuid(2),title,['starts_at']],[uuid(3),title,['starts_at']]]);
    const note='Message de Joueur 1 :\nLa salle est prise mercredi :\non décale à jeudi.';
    // The writer, registered too, gets the change with their own words, as the others read them.
    assert.deepEqual([sent[0].body,sent[0].note],[`Vérifie ce qui change avant de venir.\n\n${note}`,note]);
    assert.deepEqual([sent[1].body,sent[1].note],[`Vérifie ce qui change avant de venir. Préviens Paul.\n\n${note}`,note]);
    assert.equal(sent[2].body,`Vérifie ce qui change avant de venir.\n\n${note}`);
    // The message keeps the account that wrote its note.
    await h.root();
    assert.deepEqual((await h.call<{user_id:string;sender_id:string|null}>('select user_id,sender_id from notifications where session_id=$1 order by user_id',[game])).map(n=>n.sender_id),[uuid(1),uuid(1),uuid(1)]);
    // The outbox gives the note within the text.
    await h.root();
    assert.ok((await h.call<{body:string}>('select body from claim_emails() where session_id=$1',[game])).every(m=>m.body.startsWith('Vérifie ce qui change')));
    await clear(game);
    // A note with nothing changed writes to the others only: its writer is not sent their own words alone.
    await edit(game,{note:'Pensez à vos gâteaux.'});
    assert.deepEqual((await notices(game)).map(n=>[n.user_id,n.title]),[[uuid(2),'Un mot sur ta session'],[uuid(3),'Un mot sur ta session']]);
    await clear(game);
    // A change made with no note leaves without one, for its writer as for the others.
    await edit(game,at(12));
    assert.deepEqual((await notices(game)).map(n=>[n.user_id,n.note]),[[uuid(1),null],[uuid(2),null],[uuid(3),null]]);
    // Another organizer's note, added before it leaves, reaches the first one too, with the change.
    await edit(game,{note:'Je ramène le grimoire.'},6);
    const other='Message de Joueur 6 :\nJe ramène le grimoire.';
    assert.deepEqual((await notices(game)).map(n=>[n.user_id,n.title,n.changes.map(c=>c.field),n.note,n.sender_id]),[
      [uuid(1),title,['starts_at'],other,uuid(6)],[uuid(2),title,['starts_at'],other,uuid(6)],[uuid(3),title,['starts_at'],other,uuid(6)]]);
    await clear(game);
  });
  await t.test('un mot sans changement visible part quand même, à tous les inscrits et à la liste d’attente',async()=>{
    const game=uuid(102);await h.session(game,{capacity:7,startsIn:'10 days'});
    await h.root();await h.call(`insert into session_addresses values($1,'1 rue du Port, Brest')`,[game]);
    assert.equal(await book(3,game),'confirmed');
    await h.login(4);for(const name of ['Lou','Tom','Inès','Ana','Zoé','Max'])await h.call('select add_guest($1,$2)',[game,name]);
    assert.equal(await book(2,game),'waitlisted');
    await clear(game);
    // A new name writes to nobody…
    await edit(game,{title:'Soirée d’automne'});
    assert.deepEqual(await notices(game),[]);
    // …unless the organizer adds a note. A traveller who cannot read the address gets the note alone.
    await edit(game,{title:'Soirée d’hiver',address:'2 rue du Port, Brest',note:'Deux places de plus la semaine prochaine.'},6);
    const note='Message de Joueur 6 :\nDeux places de plus la semaine prochaine.';
    assert.deepEqual((await notices(game)).map(n=>[n.user_id,n.title,n.body,n.changes.map(c=>c.field)]),[
      [uuid(2),'Un mot sur ta session',note,[]],
      [uuid(3),'Un mot sur ta session',note,[]],
      [uuid(4),title,`Vérifie ce qui change avant de venir. Préviens Ana et Inès et Lou et Max et Tom et Zoé.\n\n${note}`,['address']],
    ]);
    // A later edit before it leaves keeps the note and adds the change; a second note follows the first.
    const first=await current(game);
    await edit(game,{...at(12),address:'2 rue du Port, Brest'});
    await edit(game,{address:'2 rue du Port, Brest',note:'Et on commence à 20 h.'});
    const second='Message de Joueur 1 :\nEt on commence à 20 h.';
    const waiting=await notices(game);
    assert.deepEqual(waiting.map(n=>[n.user_id,n.changes.map(c=>c.field),n.note]),[
      [uuid(2),['starts_at'],`${note}\n\n${second}`],
      [uuid(3),['starts_at'],`${note}\n\n${second}`],
      [uuid(4),['starts_at','address'],`${note}\n\n${second}`],
    ]);
    assert.equal(waiting[0].body,`Vérifie ce qui change avant de venir.\n\n${note}\n\n${second}`);
    assert.equal(waiting[2].body,`Vérifie ce qui change avant de venir. Préviens Ana et Inès et Lou et Max et Tom et Zoé.\n\n${note}\n\n${second}`);
    // A change undone keeps the note, which the organizer still wants read.
    await edit(game,{starts_at:first.starts_at.toISOString(),ends_at:first.ends_at.toISOString(),address:'1 rue du Port, Brest'});
    assert.deepEqual((await notices(game)).map(n=>[n.user_id,n.changes.length,n.body.endsWith(second)]),[[uuid(2),0,true],[uuid(3),0,true],[uuid(4),0,true]]);
    await clear(game);
    // A note that could not leave within a day is out of date: the next message leaves it out.
    await edit(game,{note:'Vieux mot.'});
    await h.root();await h.call(`update notifications set created_at=now()-interval '2 days',email_attempts=1 where session_id=$1`,[game]);
    await edit(game,{...at(13),note:'Nouveau mot.'},6);
    assert.deepEqual((await notices(game)).map(n=>[n.note,n.sender_id]),[
      ['Message de Joueur 6 :\nNouveau mot.',uuid(6)],['Message de Joueur 6 :\nNouveau mot.',uuid(6)],['Message de Joueur 6 :\nNouveau mot.',uuid(6)]]);
    // A later edit without a note keeps the account of the one it carries.
    await edit(game,at(14));
    assert.deepEqual((await notices(game)).map(n=>n.sender_id),[uuid(6),uuid(6),uuid(6)]);
    await clear(game);
    // A message to the people registered is never merged with a note.
    await h.login(1);await h.call('select send_session_message($1,$2)',[game,'Pensez aux gâteaux.']);
    await edit(game,{note:'Rien ne change.'});
    await h.root();
    assert.deepEqual((await h.call<{title:string}>('select distinct title from notifications where session_id=$1 and email_attempts<5 order by 1',[game])).map(n=>n.title),['Message de Joueur 1','Un mot sur ta session']);
    await clear(game);
  });
  await t.test('un mot trop long est refusé ; les mots comptent parmi les dix messages du jour',async()=>{
    const game=uuid(103);await h.session(game,{startsIn:'10 days'});
    assert.equal(await book(2,game),'confirmed');
    await assert.rejects(edit(game,{note:'x'.repeat(2001)}),/2000 caractères/);
    await h.root();await h.call(`update action_limits set hits=10 where user_id=$1 and action='session_message'`,[uuid(1)]);
    await assert.rejects(edit(game,{location:'Quimper',note:'Un mot de trop.'}),/10 messages aujourd’hui/);
    assert.equal((await current(game)).location,'Brest');
    // Without a note, the edit goes through.
    await edit(game,{location:'Quimper'});
    assert.equal((await current(game)).location,'Quimper');
    await clear(game);
  });
  await t.test('personne n’écrit aux inscrits avec la fonction d’envoi',async()=>{
    for(const n of [1,2]){
      await h.login(n);
      await assert.rejects(h.call(`select notify_session_change($1,'x','x','[]'::jsonb,null,now(),'x')`,[uuid(101)]),/permission denied/);
    }
    await h.anonymous();
    await assert.rejects(h.call(`select notify_session_change($1,'x','x','[]'::jsonb,null,now(),'x')`,[uuid(101)]),/permission denied/);
  });
});
