import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDatabase,uuid} from './sql-harness';

type Change={field:string;before:string;after:string};
type Notice={user_id:string;title:string;body:string;changes:Change[]};

test('Les messages de modification donnent l’ancienne et la nouvelle valeur',async t=>{
  const h=await createDatabase();
  for(const [n,m] of [[1,'organizer'],[2,'member'],[3,'newcomer'],[4,'member'],[5,'member']] as const)await h.user(n,m);
  const game=uuid(100);await h.session(game,{capacity:7,startsIn:'10 days'});
  await h.root();await h.call(`insert into session_addresses values($1,'1 rue du Port, Brest')`,[game]);
  const book=async(n:number,id=game)=>{await h.login(n);return (await h.call<{book_session:string}>('select book_session($1)',[id]))[0].book_session;};
  assert.deepEqual([await book(2),await book(3),await book(4)],['confirmed','confirmed','confirmed']);
  await h.login(4);for(const name of ['Paul','Tom','Lou','Inès'])await h.call('select add_guest($1,$2)',[game,name]);
  assert.equal(await book(5),'waitlisted');
  const current=async(id=game)=>{await h.root();return (await h.call<{starts_at:Date;ends_at:Date;location:string}>('select starts_at,ends_at,location from sessions where id=$1',[id]))[0];};
  const edit=async(changes:Record<string,unknown>,id=game)=>{
    const s=await current(id);
    await h.login(1);
    await h.call('select save_session($1::jsonb)',[JSON.stringify({id,title:'Soirée de test',description:'',script:'Trouble Brewing',starts_at:s.starts_at.toISOString(),ends_at:s.ends_at.toISOString(),
      location:s.location,address:'1 rue du Port, Brest',capacity:7,beginners_welcome:true,visibility:'public',...changes})]);
  };
  const notices=async(title:string)=>{await h.root();const rows=await h.call<Notice>('select user_id,title,body,changes from notifications where title=$1 order by user_id',[title]);
    await h.call('delete from notifications where title=$1',[title]);return rows;};
  const fields=(n:Notice)=>n.changes.map(c=>c.field);

  await t.test('une nouvelle date et un nouveau lieu donnent l’avant et l’après à chacun, l’adresse exacte à qui la lit sur le site',async()=>{
    const before=await current();
    const starts=new Date(before.starts_at.getTime()+86400000+1800000);
    await edit({starts_at:starts.toISOString(),ends_at:new Date(starts.getTime()+4*3600000).toISOString(),location:'La Tour',address:'8 rue de Siam, Brest'});
    const sent=await notices('Les informations de ta session ont changé');
    assert.deepEqual(sent.map(n=>[n.user_id,fields(n)]),[
      [uuid(2),['starts_at','location','address']],
      // A traveller reads the exact address 48 hours before the game only, and nobody on the waiting list reads it.
      [uuid(3),['starts_at','location']],
      [uuid(4),['starts_at','location','address']],
      [uuid(5),['starts_at','location']],
    ]);
    const [moved,place,address]=sent[0].changes;
    assert.deepEqual([Date.parse(moved.before),Date.parse(moved.after)],[before.starts_at.getTime(),starts.getTime()]);
    assert.deepEqual([place.before,place.after],['Brest','La Tour']);
    assert.deepEqual([address.before,address.after],['1 rue du Port, Brest','8 rue de Siam, Brest']);
    assert.equal(sent[0].body,'Vérifie ce qui change avant de venir.');
    assert.equal(sent[2].body,'Vérifie ce qui change avant de venir. Préviens Inès et Lou et Paul et Tom.');
  });
  await t.test('seule l’adresse change : seuls ceux qui la lisent sont prévenus',async()=>{
    await h.root();await h.call(`update session_addresses set address='8 rue de Siam, Brest' where session_id=$1`,[game]);
    await edit({address:'12 rue de Siam, Brest'});
    const sent=await notices('Les informations de ta session ont changé');
    assert.deepEqual(sent.map(n=>[n.user_id,n.changes]),[
      [uuid(2),[{field:'address',before:'8 rue de Siam, Brest',after:'12 rue de Siam, Brest'}]],
      [uuid(4),[{field:'address',before:'8 rue de Siam, Brest',after:'12 rue de Siam, Brest'}]],
    ]);
    // Nothing that is written to the people registered changed: nobody hears about it.
    await edit({title:'Nouveau nom',address:'12 rue de Siam, Brest'});
    assert.equal((await notices('Les informations de ta session ont changé')).length,0);
  });
  await t.test('à 48 heures de la partie, un·e voyageur·se inscrit·e reçoit aussi l’adresse',async()=>{
    const soon=uuid(101);await h.session(soon,{capacity:7,startsIn:'30 hours'});
    await h.root();await h.call(`insert into session_addresses values($1,'1 rue du Port, Brest')`,[soon]);
    assert.equal(await book(3,soon),'confirmed');
    await edit({address:'2 rue du Port, Brest'},soon);
    assert.deepEqual((await notices('Les informations de ta session ont changé')).map(n=>[n.user_id,fields(n)]),[[uuid(3),['address']]]);
    // An account suspended directly in the database keeps its seat, but not the address.
    await h.root();await h.call(`update profiles set membership='suspended' where id=$1`,[uuid(3)]);
    await edit({address:'3 rue du Port, Brest'},soon);
    assert.equal((await notices('Les informations de ta session ont changé')).length,0);
    await h.root();await h.call(`update profiles set membership='newcomer' where id=$1`,[uuid(3)]);
  });
  await t.test('une partie ramenée à moins de 48 heures donne à un·e voyageur·se la nouvelle adresse seule',async()=>{
    const far=uuid(102);await h.session(far,{capacity:7,startsIn:'10 days'});
    await h.root();await h.call(`insert into session_addresses values($1,'Chez Léa, 4 rue Privée')`,[far]);
    assert.equal(await book(3,far),'confirmed');assert.equal(await book(2,far),'confirmed');
    const starts=new Date(Date.now()+30*3600000);
    await edit({starts_at:starts.toISOString(),ends_at:new Date(starts.getTime()+4*3600000).toISOString(),address:'5 rue du Port, Brest'},far);
    const sent=await notices('Les informations de ta session ont changé');
    assert.deepEqual(sent.map(n=>[n.user_id,n.changes.find(c=>c.field==='address')]),[
      [uuid(2),{field:'address',before:'Chez Léa, 4 rue Privée',after:'5 rue du Port, Brest'}],
      [uuid(3),{field:'address',after:'5 rue du Port, Brest'}],
    ]);
    // Moved back beyond 48 hours, the traveller reads neither address.
    const later=new Date(Date.now()+5*86400000);
    await edit({starts_at:later.toISOString(),ends_at:new Date(later.getTime()+4*3600000).toISOString(),address:'6 rue du Port, Brest'},far);
    assert.deepEqual((await notices('Les informations de ta session ont changé')).map(n=>[n.user_id,fields(n)]),[[uuid(2),['starts_at','address']],[uuid(3),['starts_at']]]);
  });
  await t.test('modifier un lieu donne, partie par partie, l’ancien et le nouveau lieu',async()=>{
    await h.login(1);
    const venue=(await h.call<{save_venue:string}>(`select save_venue('{"name":"Le Grenier","address":"1 rue du Port, Brest"}'::jsonb)`))[0].save_venue;
    const s=await current();
    await h.login(1);
    await h.call('select save_session($1::jsonb)',[JSON.stringify({id:game,title:'Soirée de test',description:'',script:'Trouble Brewing',starts_at:s.starts_at.toISOString(),ends_at:s.ends_at.toISOString(),
      venue_id:venue,capacity:7,beginners_welcome:true,visibility:'public'})]);
    await notices('Les informations de ta session ont changé');
    await h.login(1);await h.call('select save_venue($1)',[{id:venue,name:'Le Grenier du port',address:'8 rue du Port, Brest'}]);
    const sent=await notices('Le lieu de ta session a changé');
    assert.deepEqual(sent.map(n=>[n.user_id,n.changes]),[
      [uuid(2),[{field:'location',before:'Le Grenier',after:'Le Grenier du port'},{field:'address',before:'1 rue du Port, Brest',after:'8 rue du Port, Brest'}]],
      [uuid(3),[{field:'location',before:'Le Grenier',after:'Le Grenier du port'}]],
      [uuid(4),[{field:'location',before:'Le Grenier',after:'Le Grenier du port'},{field:'address',before:'1 rue du Port, Brest',after:'8 rue du Port, Brest'}]],
      [uuid(5),[{field:'location',before:'Le Grenier',after:'Le Grenier du port'}]],
    ]);
    assert.equal(sent[2].body,'Vérifie le nouveau lieu avant de venir. Préviens Inès et Lou et Paul et Tom.');
    // Fixing the capitals of the name while moving the address only gives the address, to those who read it.
    await h.login(1);await h.call('select save_venue($1)',[{id:venue,name:'Le Grenier du Port',address:'9 rue du Port, Brest'}]);
    assert.deepEqual((await notices('Le lieu de ta session a changé')).map(n=>[n.user_id,fields(n)]),[[uuid(2),['address']],[uuid(4),['address']]]);
  });
  await t.test('deux modifications avant l’envoi font un seul message, du premier état au dernier',async()=>{
    const twice=uuid(103);await h.session(twice,{capacity:7,startsIn:'10 days'});
    await h.root();await h.call(`insert into session_addresses values($1,'1 rue du Port, Brest')`,[twice]);
    assert.equal(await book(2,twice),'confirmed');
    const waiting=async()=>{await h.root();return (await h.call<{changes:Change[]}>(`select changes from notifications where user_id=$1 and session_id=$2 and changes<>'[]' and emailed_at is null and email_attempts<5 order by created_at`,[uuid(2),twice])).map(n=>n.changes);};
    const first=await current(twice);
    await edit({location:'La Tour'},twice);
    const moved=new Date(first.starts_at.getTime()+86400000);
    await edit({location:'Quimper',starts_at:moved.toISOString(),ends_at:new Date(moved.getTime()+4*3600000).toISOString()},twice);
    const [only,...rest]=await waiting();
    assert.equal(rest.length,0);
    assert.deepEqual(only.map(c=>[c.field,c.field==='starts_at'?Date.parse(c.before):c.before,c.field==='starts_at'?Date.parse(c.after):c.after]),
      [['starts_at',first.starts_at.getTime(),moved.getTime()],['location','Brest','Quimper']]);
    // Undone before it leaves, a change tells nothing; the date still moved, from its first value.
    await edit({location:'Brest'},twice);
    assert.deepEqual((await waiting()).map(changes=>changes.map(c=>c.field)),[['starts_at']]);
    await edit({starts_at:first.starts_at.toISOString(),ends_at:first.ends_at.toISOString()},twice);
    assert.deepEqual(await waiting(),[]);
    // A message already sent, or being sent, stays as it is: the next one starts from where it left off.
    await edit({location:'La Tour'},twice);
    await h.root();await h.call(`update notifications set emailed_at=now() where session_id=$1 and changes<>'[]'`,[twice]);
    await edit({location:'Quimper'},twice);
    await h.root();await h.call(`update notifications set claimed_until=now()+interval '5 minutes' where session_id=$1 and emailed_at is null`,[twice]);
    await edit({location:'Morlaix'},twice);
    assert.deepEqual((await waiting()).map(changes=>changes.map(c=>[c.before,c.after])),[[['La Tour','Quimper']],[['Quimper','Morlaix']]]);
    // The outbox gives them in the order written.
    await h.call(`update notifications set claimed_until=null where session_id=$1`,[twice]);
    assert.deepEqual((await h.call<{changes:Change[]}>(`select changes from claim_emails() where session_id=$1 and changes<>'[]'`,[twice])).map(m=>m.changes[0].after),['Quimper','Morlaix']);
    await h.call('delete from notifications where session_id=$1',[twice]);
  });
  await t.test('la boîte d’envoi donne les changements ; personne d’autre n’écrit avec la fonction d’envoi',async()=>{
    await edit({location:'Quimper'});
    await h.root();
    const claimed=await h.call<{email:string;changes:Change[]}>('select email,changes from claim_emails() where session_id=$1 order by email',[game]);
    assert.ok(claimed.some(m=>m.email==='test2@cercle.test'&&m.changes.some(c=>c.field==='location'&&c.before==='Le Grenier du Port'&&c.after==='Quimper')));
    // Messages written before keep an empty list.
    await h.call(`insert into notifications(user_id,session_id,title,body) values($1,$2,'Ancien message','x')`,[uuid(2),game]);
    assert.deepEqual((await h.call<{changes:Change[]}>(`select changes from claim_emails() where title='Ancien message'`)).map(m=>m.changes),[[]]);
    for(const n of [1,2]){
      await h.login(n);
      await assert.rejects(h.call(`select notify_session_change($1,'x','x','[]'::jsonb,null,now())`,[game]),/permission denied/);
    }
    await h.anonymous();
    await assert.rejects(h.call(`select notify_session_change($1,'x','x','[]'::jsonb,null,now())`,[game]),/permission denied/);
  });
});
