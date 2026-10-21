import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDatabase,uuid} from './sql-harness';

type Notice={title:string;body:string;session_id:string|null};

test('Rangs, suppression des parties, niveau d’expérience et invitations par e-mail',async t=>{
  const h=await createDatabase();
  for(const [n,m] of [[1,'organizer'],[2,'member'],[3,'newcomer'],[4,'member'],[5,'organizer'],[6,'member'],[7,'newcomer'],[8,'member']] as const)await h.user(n,m);
  const membership=async(n:number)=>{await h.root();return (await h.call<{membership:string}>('select membership from profiles where id=$1',[uuid(n)]))[0].membership;};
  const notices=async(n:number)=>{await h.root();return h.call<Notice>('select title,body,session_id from notifications where user_id=$1 order by created_at,id',[uuid(n)]);};

  await t.test('un organisateur passe un voyageur membre puis organisateur, et le prévient',async()=>{
    await h.login(1);await h.call(`select set_membership($1,'member')`,[uuid(3)]);
    assert.equal(await membership(3),'member');
    await h.login(1);await h.call(`select set_membership($1,'organizer')`,[uuid(3)]);
    assert.equal(await membership(3),'organizer');
    assert.deepEqual((await notices(3)).map(n=>[n.title,n.session_id]),[['Bienvenue parmi les membres',null],['Tu rejoins l’organisation',null]]);
  });
  await t.test('un membre repassé voyageur garde ses inscriptions, puis attend la validation',async()=>{
    const game=uuid(100);await h.session(game);const next=uuid(101);await h.session(next);
    await h.login(4);await h.call('select book_session($1)',[game]);
    await h.login(1);await h.call(`select set_membership($1,'newcomer')`,[uuid(4)]);
    assert.equal(await membership(4),'newcomer');
    assert.deepEqual(await h.call('select status,pool from bookings where user_id=$1',[uuid(4)]),[{status:'confirmed',pool:'circle'}]);
    await h.login(4);
    assert.equal((await h.call<{book_session:string}>('select book_session($1)',[next]))[0].book_session,'pending');
  });
  await t.test('un compte suspendu se réactive avec le rang choisi, sans message de bienvenue',async()=>{
    await h.login(1);await h.call(`select set_membership($1,'suspended')`,[uuid(8)]);
    assert.equal(await membership(8),'suspended');
    await h.login(1);await h.call(`select set_membership($1,'newcomer')`,[uuid(8)]);
    assert.equal(await membership(8),'newcomer');
    assert.equal((await notices(8)).length,0);
  });
  await t.test('le rang d’un autre organisateur, le sien et les valeurs inconnues sont refusés',async()=>{
    await h.login(1);
    await assert.rejects(h.call(`select set_membership($1,'member')`,[uuid(5)]),/autre organisateur/);
    await assert.rejects(h.call(`select set_membership($1,'member')`,[uuid(1)]),/non autorisée/);
    await assert.rejects(h.call(`select set_membership($1,'admin')`,[uuid(2)]),/non autorisée/);
    await assert.rejects(h.call(`select set_membership($1,'member')`,[uuid(999)]),/introuvable/);
    await h.login(2);
    await assert.rejects(h.call(`select set_membership($1,'organizer')`,[uuid(6)]),/non autorisée/);
    assert.equal(await membership(6),'member');
  });

  await t.test('une partie à venir avec des inscrits s’annule avant d’être supprimée, et le message part quand même',async()=>{
    const game=uuid(110);await h.session(game);
    await h.call(`insert into session_addresses values($1,'Adresse privée')`,[game]);
    await h.login(2);await h.call('select book_session($1)',[game]);await h.call('select add_guest($1,$2)',[game,'Paul']);
    await assert.rejects(h.call('select delete_session($1)',[game]),/organisateur/);
    await h.login(1);
    await assert.rejects(h.call('select delete_session($1)',[game]),/annule d’abord/);
    await h.call('select cancel_session($1)',[game]);
    await h.call('select delete_session($1)',[game]);
    await h.root();
    for(const table of ['sessions where id','bookings where session_id','session_addresses where session_id'])
      assert.equal((await h.call(`select * from ${table}=$1`,[game])).length,0,table);
    const cancel=(await notices(2)).filter(n=>n.title==='La session a été annulée');
    assert.equal(cancel.length,1);
    assert.equal(cancel[0].session_id,null);
    assert.match(cancel[0].body,/« Soirée de test »/);assert.match(cancel[0].body,/Préviens Paul\./);
  });
  await t.test('une partie vide ou passée se supprime directement',async()=>{
    const empty=uuid(111);await h.session(empty);const past=uuid(112);await h.session(past,{startsIn:'-3 days'});
    await h.call(`insert into bookings(session_id,user_id,status,pool) values($1,$2,'confirmed','circle')`,[past,uuid(2)]);
    await h.login(1);
    for(const id of [empty,past,uuid(113)])await h.call('select delete_session($1)',[id]);
    await h.root();
    assert.equal((await h.call('select * from sessions where id in ($1,$2)',[empty,past])).length,0);
  });

  await t.test('le niveau d’expérience suit l’ancienne case « débutant » dans les deux sens',async()=>{
    const level=async()=>{await h.root();return (await h.call<{experience:string;beginner:boolean}>('select experience,beginner from profiles where id=$1',[uuid(6)]))[0];};
    assert.deepEqual(await level(),{experience:'beginner',beginner:true});
    await h.login(6);await h.call(`update profiles set experience='experienced' where id=$1`,[uuid(6)]);
    assert.deepEqual(await level(),{experience:'experienced',beginner:false});
    // The site deployed before the migration only writes beginner.
    await h.login(6);await h.call('update profiles set beginner=true where id=$1',[uuid(6)]);
    assert.deepEqual(await level(),{experience:'beginner',beginner:true});
    await h.login(6);await h.call('update profiles set beginner=false where id=$1',[uuid(6)]);
    assert.deepEqual(await level(),{experience:'some',beginner:false});
    await h.login(6);
    await assert.rejects(h.call(`update profiles set experience='légende' where id=$1`,[uuid(6)]),/check constraint/);
    assert.equal((await h.call(`update profiles set experience='experienced' where id=$1 returning id`,[uuid(2)])).length,0);
  });

  await t.test('une invitation par e-mail garde l’adresse pour le parrain seul et s’accepte comme un lien',async()=>{
    await h.login(2);
    const token=(await h.call<{create_email_invitation:string}>('select create_email_invitation($1)',['  Ami@Exemple.FR ']))[0].create_email_invitation;
    assert.match(token,/^[a-f0-9]{64}$/);
    assert.deepEqual((await h.call<{sent_to:string}>('select sent_to from invitations')).map(r=>r.sent_to),['ami@exemple.fr']);
    await h.login(6);
    assert.equal((await h.call('select id,sent_to from invitations')).length,0);
    await h.login(7);
    await assert.rejects(h.call('select create_email_invitation($1)',['x@exemple.fr']),/parrainer/);
    await h.call('select accept_invitation($1)',[token]);
    assert.equal(await membership(7),'member');
  });
  await t.test('une adresse invalide ou la sienne est refusée sans entamer la limite, partagée avec les liens',async()=>{
    await h.login(6);
    for(const bad of ['pas-une-adresse','a@b','@exemple.fr','a b@exemple.fr',`${'x'.repeat(250)}@exemple.fr`])
      await assert.rejects(h.call('select create_email_invitation($1)',[bad]),/invalide/,bad);
    await assert.rejects(h.call('select create_email_invitation($1)',['TEST6@cercle.test']),/propre adresse/);
    await h.call('select create_invitation()');
    for(let i=0;i<4;i++)await h.call('select create_email_invitation($1)',[`ami${i}@exemple.fr`]);
    await assert.rejects(h.call('select create_email_invitation($1)',['encore@exemple.fr']),/Trop de demandes/);
  });
  await t.test('30 jours après, l’adresse invitée et les messages sans partie sont effacés',async()=>{
    await h.root();
    await h.call(`update invitations set expires_at=now()-interval '31 days' where sent_to='ami@exemple.fr'`);
    await h.call(`insert into notifications(user_id,title,body,created_at) values($1,'Ancien','x',now()-interval '31 days'),($1,'Récent','x',now())`,[uuid(2)]);
    await h.call('select maintenance()');
    assert.equal((await h.call(`select * from invitations where sent_to='ami@exemple.fr'`)).length,0);
    assert.equal((await h.call('select * from invitations where sent_to is not null')).length,4);
    assert.deepEqual((await h.call<{title:string}>(`select title from notifications where title in ('Ancien','Récent')`)).map(n=>n.title),['Récent']);
  });
  await h.db.close();
});
