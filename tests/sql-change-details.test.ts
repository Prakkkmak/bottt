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
      await assert.rejects(h.call(`select notify_session_change($1,'x','x','[]'::jsonb,null)`,[game]),/permission denied/);
    }
    await h.anonymous();
    await assert.rejects(h.call(`select notify_session_change($1,'x','x','[]'::jsonb,null)`,[game]),/permission denied/);
  });
});
