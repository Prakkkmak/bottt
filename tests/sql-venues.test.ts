import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDatabase,uuid} from './sql-harness';

type Venue={id:string;name:string;address:string};
const game=(starts:string,venue:string|null=null)=>({title:'Soirée au lieu',script:'Trouble Brewing',starts_at:starts,ends_at:new Date(Date.parse(starts)+4*3600000).toISOString(),location:'Lieu saisi à la main',address:'Adresse saisie à la main',
  capacity:10,newcomer_seats:2,release_hours:72,visibility:'public',beginners_welcome:true,description:'',venue_id:venue});
const inDays=(days:number)=>new Date(Date.now()+days*86400000).toISOString();

test('Les lieux déjà utilisés deviennent des lieux enregistrés',async()=>{
  const h=await createDatabase({before:'202610220009'});
  await h.user(1,'organizer');
  const add=async(n:number,location:string,address:string|null,startsIn:string,status='published')=>{
    await h.session(uuid(n),{startsIn});
    await h.call('update sessions set location=$1,status=$2 where id=$3',[location,status,uuid(n)]);
    if(address!==null)await h.call('insert into session_addresses values($1,$2)',[uuid(n),address]);
  };
  await add(100,'Le Grenier','1 rue Ancienne','-30 days');
  await add(101,'le grenier ','2 rue Nouvelle','-3 days');
  await add(102,'Le Grenier','','5 days');
  await add(103,'Chez Camille','3 place du Marché','10 days');
  await add(104,'Bar fermé','4 quai Perdu','20 days','cancelled');
  await h.migrate();
  const venues=await h.call<Venue>('select id,name,address from venues order by name');
  // The latest address given wins, an empty address does not replace it, and a cancelled game adds nothing.
  assert.deepEqual(venues.map(v=>[v.name,v.address]),[['Chez Camille','3 place du Marché'],['le grenier','2 rue Nouvelle']]);
  const linked=await h.call<{id:string;venue_id:string|null}>('select id,venue_id from sessions order by id');
  const venueOf=(n:number)=>linked.find(s=>s.id===uuid(n))?.venue_id;
  assert.equal(venueOf(101),venues[1].id);assert.equal(venueOf(103),venues[0].id);
  // A game with another address keeps it and stays unlinked, so that editing the venue never changes it.
  for(const n of [100,102,104])assert.equal(venueOf(n),null,`session ${n}`);
});

test('Gestion des lieux par les organisateurs',async t=>{
  const h=await createDatabase();
  for(const [n,m] of [[1,'organizer'],[2,'member'],[3,'newcomer'],[4,'member']] as const)await h.user(n,m);
  let grenier='';let camille='';

  await t.test('seul un organisateur crée, lit, modifie et supprime un lieu',async()=>{
    for(const n of [2,3]){
      await h.login(n);
      await assert.rejects(h.call(`select save_venue('{"name":"Chez moi","address":"Secret"}'::jsonb)`),/organisateur/);
      await assert.rejects(h.call(`select delete_venue($1)`,[uuid(999)]),/organisateur/);
      await assert.rejects(h.call(`insert into venues(name) values('Direct')`),/permission denied/i);
    }
    await h.login(1);
    grenier=(await h.call<{save_venue:string}>(`select save_venue('{"name":"  Le   Grenier ","address":" 1 rue du Port, Brest\\nhttps://maps.app.goo.gl/x "}'::jsonb)`))[0].save_venue;
    camille=(await h.call<{save_venue:string}>(`select save_venue('{"name":"Chez Camille","address":""}'::jsonb)`))[0].save_venue;
    assert.deepEqual((await h.call<Venue>('select name,address from venues order by name')).map(v=>[v.name,v.address]),
      [['Chez Camille',''],['Le Grenier','1 rue du Port, Brest\nhttps://maps.app.goo.gl/x']]);
    // The private address stays with organizers.
    await h.login(2);assert.equal((await h.call('select * from venues')).length,0);
    await h.anonymous();await assert.rejects(h.call('select * from venues'),/permission denied/i);
    await h.login(2);await assert.rejects(h.call(`update venues set name='Pris' where id=$1`,[grenier]),/permission denied/i);
  });
  await t.test('un nom vide ou déjà pris est refusé',async()=>{
    await h.login(1);
    await assert.rejects(h.call(`select save_venue('{"name":" x "}'::jsonb)`),/nom de 2 à 150/);
    await assert.rejects(h.call(`select save_venue('{"name":"le grenier"}'::jsonb)`),/déjà ce nom/);
    await assert.rejects(h.call(`select save_venue($1)`,[{id:camille,name:'LE GRENIER'}]),/déjà ce nom/);
    await assert.rejects(h.call(`select save_venue($1)`,[{id:uuid(999),name:'Inconnu'}]),/introuvable/);
    // Changing only the case of its own name is allowed.
    await h.call(`select save_venue($1)`,[{id:camille,name:'chez Camille',address:''}]);
    await h.call(`select save_venue($1)`,[{id:camille,name:'Chez Camille',address:''}]);
  });
  await t.test('une partie au lieu enregistré en reprend le nom et l’adresse',async()=>{
    await h.login(1);
    const sid=(await h.call<{save_session:string}>('select save_session($1)',[game(inDays(5),grenier)]))[0].save_session;
    assert.deepEqual(await h.call('select location,venue_id from sessions where id=$1',[sid]),[{location:'Le Grenier',venue_id:grenier}]);
    assert.equal((await h.call<{address:string}>('select address from session_addresses where session_id=$1',[sid]))[0].address,'1 rue du Port, Brest\nhttps://maps.app.goo.gl/x');
    await h.login(2);await h.call('select book_session($1)',[sid]);
    assert.equal((await h.call<{address:string}>('select address from session_addresses where session_id=$1',[sid]))[0].address,'1 rue du Port, Brest\nhttps://maps.app.goo.gl/x');
    const listed=(await h.call<{list_sessions:{id:string;venue_id:string;location:string}[]}>('select list_sessions()'))[0].list_sessions.find(s=>s.id===sid);
    assert.deepEqual([listed?.location,listed?.venue_id],['Le Grenier',grenier]);
    // A game moved to another place leaves the venue and keeps the place typed in.
    await h.login(1);
    const other=(await h.call<{save_session:string}>('select save_session($1)',[game(inDays(6),camille)]))[0].save_session;
    await h.call('select save_session($1)',[{...game(inDays(6)),id:other}]);
    assert.deepEqual(await h.call('select location,venue_id from sessions where id=$1',[other]),[{location:'Lieu saisi à la main',venue_id:null}]);
    assert.equal((await h.call<{address:string}>('select address from session_addresses where session_id=$1',[other]))[0].address,'Adresse saisie à la main');
  });
  await t.test('modifier un lieu met à jour ses parties à venir et prévient leurs inscrits',async()=>{
    await h.login(1);
    const upcoming=(await h.call<{id:string}>('select id from sessions where venue_id=$1',[grenier]))[0].id;
    await h.login(4);await h.call('select book_session($1)',[upcoming]);await h.call('select add_guest($1,$2)',[upcoming,'Paul']);
    // Past and cancelled games keep the place they had.
    const past=uuid(200);await h.session(past,{startsIn:'-3 days'});
    const cancelled=uuid(201);await h.session(cancelled);
    await h.call(`update sessions set venue_id=$1,location='Le Grenier',status=case when id=$3 then 'cancelled' else status end where id in ($2,$3)`,[grenier,past,cancelled]);
    await h.call(`insert into session_addresses values($1,'1 rue du Port, Brest'),($2,'1 rue du Port, Brest')`,[past,cancelled]);
    await h.login(1);
    await h.call('select save_venue($1)',[{id:grenier,name:'Le Grenier du port',address:'8 rue du Port, Brest'}]);
    await h.root();
    assert.deepEqual(await h.call('select s.id,s.location,a.address from sessions s join session_addresses a on a.session_id=s.id where s.venue_id=$1 order by s.id',[grenier]),[
      {id:past,location:'Le Grenier',address:'1 rue du Port, Brest'},{id:cancelled,location:'Le Grenier',address:'1 rue du Port, Brest'},
      {id:upcoming,location:'Le Grenier du port',address:'8 rue du Port, Brest'}]);
    const notices=await h.call<{user_id:string;title:string;body:string}>(`select user_id,title,body from notifications where title='Le lieu de ta session a changé' order by user_id`);
    assert.deepEqual(notices.map(n=>[n.user_id,n.body]),[[uuid(2),'Consulte le lieu mis à jour avant de venir.'],[uuid(4),'Consulte le lieu mis à jour avant de venir. Préviens Paul.']]);
    // Saving a venue unchanged sends nothing.
    const count=async()=>{await h.root();return Number((await h.call<{count:string}>('select count(*) from notifications'))[0].count);};
    const before=await count();
    await h.login(1);await h.call('select save_venue($1)',[{id:grenier,name:'Le Grenier du port',address:'8 rue du Port, Brest'}]);
    assert.equal(await count(),before);
  });
  await t.test('supprimer un lieu laisse ses parties à leur place',async()=>{
    await h.login(1);
    await h.call('select delete_venue($1)',[grenier]);
    assert.equal((await h.call('select * from venues where id=$1',[grenier])).length,0);
    assert.deepEqual((await h.call<{location:string;venue_id:string|null}>(`select location,venue_id from sessions where location like 'Le Grenier%' order by location`)).map(s=>[s.location,s.venue_id]),
      [['Le Grenier',null],['Le Grenier',null],['Le Grenier du port',null]]);
    await assert.rejects(h.call('select save_session($1)',[game(inDays(7),grenier)]),/plus dans la liste/);
  });
});
