import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDatabase,uuid} from './sql-harness';

type Nickname={display_name:string;nickname_chosen:boolean};

test('Pseudo choisi après la première connexion',async t=>{
  // Accounts created before the migration: one gave a name on the old form, the other left it empty.
  const h=await createDatabase({before:'202610220007'});
  await h.user(1,'organizer');
  await h.user(2,'member',{display_name:'Nouveau joueur'});
  await h.migrate();
  const profile=async(n:number)=>{await h.root();return (await h.call<Nickname>('select display_name,nickname_chosen from profiles where id=$1',[uuid(n)]))[0];};

  await t.test('un compte existant garde son nom, un compte resté « Nouveau joueur » choisit son pseudo',async()=>{
    assert.deepEqual(await profile(1),{display_name:'Joueur 1',nickname_chosen:true});
    assert.deepEqual(await profile(2),{display_name:'Nouveau joueur',nickname_chosen:false});
  });
  await t.test('un nouveau compte connecté par code attend son pseudo',async()=>{
    await h.user(3,'newcomer',{});
    assert.deepEqual(await profile(3),{display_name:'Nouveau joueur',nickname_chosen:false});
  });
  await t.test('un nom donné à l’inscription compte comme choisi, sauf le nom par défaut de l’ancien formulaire',async()=>{
    await h.user(4,'newcomer',{display_name:'  Morgane  '});
    assert.deepEqual(await profile(4),{display_name:'Morgane',nickname_chosen:true});
    await h.user(5,'newcomer',{display_name:'Nouveau joueur'});
    assert.deepEqual(await profile(5),{display_name:'Nouveau joueur',nickname_chosen:false});
  });
  await t.test('enregistrer son pseudo le marque comme choisi, et il reste modifiable',async()=>{
    await h.login(3);await h.call('update profiles set display_name=$1 where id=$2',['Corbeau',uuid(3)]);
    assert.deepEqual(await profile(3),{display_name:'Corbeau',nickname_chosen:true});
    await h.login(3);await h.call('update profiles set display_name=$1 where id=$2',['Corbeau noir',uuid(3)]);
    assert.deepEqual(await profile(3),{display_name:'Corbeau noir',nickname_chosen:true});
  });
  await t.test('les autres changements du profil ne valent pas choix du pseudo',async()=>{
    await h.login(2);await h.call(`update profiles set bio='Bonjour',experience='some' where id=$1`,[uuid(2)]);
    assert.equal((await profile(2)).nickname_chosen,false);
  });
  await t.test('un joueur ne peut pas passer l’étape sans choisir de pseudo',async()=>{
    await h.login(5);
    await assert.rejects(h.call('update profiles set nickname_chosen=true where id=$1',[uuid(5)]),/permission denied/i);
    assert.equal((await profile(5)).nickname_chosen,false);
  });
  await t.test('un joueur ne modifie pas le pseudo d’un autre',async()=>{
    await h.login(5);await h.call('update profiles set display_name=$1 where id=$2',['Usurpation',uuid(2)]);
    assert.deepEqual(await profile(2),{display_name:'Nouveau joueur',nickname_chosen:false});
  });
});
