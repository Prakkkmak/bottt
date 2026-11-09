import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDatabase,uuid} from './sql-harness';

test('Scripts du cercle',async t=>{
  const h=await createDatabase();
  for(const [n,m] of [[1,'organizer'],[2,'member']] as const)await h.user(n,m);
  const save=async(data:Record<string,unknown>)=>(await h.call<{save_script:string}>('select save_script($1)',[data]))[0].save_script;
  let id='';

  await t.test('seul un organisateur ajoute ou supprime un script',async()=>{
    await h.login(2);await assert.rejects(save({name:'Nuits',slug:'nuits'}),/organisateur/);
    await assert.rejects(h.call('select delete_script($1)',[uuid(9)]),/organisateur/);
    await assert.rejects(h.call(`insert into scripts(name,slug) values('x y','x-y')`),/permission denied/i);
    await h.anonymous();await assert.rejects(save({name:'Nuits',slug:'nuits'}),/permission denied/i);
    await h.login(1);id=await save({name:'  Les   nuits de Brest ',slug:'les-nuits-de-brest',author:'Léa',characters:['imp','washerwoman','imp']});
    await h.root();assert.deepEqual(await h.call('select name,slug,author,characters,created_by from scripts'),[{name:'Les nuits de Brest',slug:'les-nuits-de-brest',author:'Léa',characters:['imp','washerwoman'],created_by:uuid(1)}]);
  });
  await t.test('tout le monde lit les scripts, sans savoir qui les a ajoutés',async()=>{
    for(const as of [()=>h.anonymous(),()=>h.login(2)]){
      await as();assert.deepEqual(await h.call('select name,slug,author,characters from scripts'),[{name:'Les nuits de Brest',slug:'les-nuits-de-brest',author:'Léa',characters:['imp','washerwoman']}]);
      await assert.rejects(h.call('select created_by from scripts'),/permission denied/i);
    }
  });
  await t.test('les noms des scripts de base et les doublons sont refusés',async()=>{
    await h.login(1);
    await assert.rejects(save({name:'Trouble Brewing',slug:'trouble-brewing-2'}),/script de base/);
    await assert.rejects(save({name:'Autre',slug:'sects-violets'}),/script de base/);
    await assert.rejects(save({name:'LES NUITS DE BREST',slug:'les-nuits-de-brest-bis'}),/porte déjà ce nom/);
    await assert.rejects(save({name:'Les nuits, de Brest',slug:'les-nuits-de-brest'}),/porte déjà ce nom/);
    await assert.rejects(save({name:'!!',slug:''}),/lettres latines ou des chiffres/);
    for(const characters of [['Imp'],['imp',null],['imp,washerwoman'],['']])
      await assert.rejects(save({name:'Bad ids',slug:'bad-ids',characters}),/script envoyé est incomplet/);
    // The table holds the same line, whoever writes to it.
    await h.root();
    for(const characters of ['{imp,NULL}','{"imp,washerwoman"}','{"imp washerwoman"}','{""}'])
      await assert.rejects(h.call(`insert into scripts(name,slug,characters) values('Bad','bad',$1)`,[characters]),/scripts_characters_check/);
    await h.call(`insert into scripts(name,slug,characters) values('Good','good','{imp,washerwoman}'),('Empty','empty','{}')`);
    await h.call(`delete from scripts where slug in ('good','empty')`);
    await h.login(1);
  });
  await t.test('un script renommé emmène ses parties et ses séries',async()=>{
    await h.session(uuid(50));await h.session(uuid(51));
    await h.root();await h.call(`update sessions set script='Les nuits de Brest' where id=$1`,[uuid(50)]);
    await h.login(1);await save({id,name:'Nuits bretonnes',slug:'nuits-bretonnes',author:'',characters:[]});
    await h.root();
    assert.deepEqual(await h.call('select id,script from sessions order by id'),[{id:uuid(50),script:'Nuits bretonnes'},{id:uuid(51),script:'Trouble Brewing'}]);
    assert.deepEqual(await h.call('select slug,author,characters from scripts'),[{slug:'nuits-bretonnes',author:'',characters:[]}]);
  });
  await t.test('un script supprimé laisse son nom aux parties qui l’ont joué',async()=>{
    await h.login(1);await h.call('select delete_script($1)',[id]);
    await h.root();assert.equal((await h.call('select * from scripts')).length,0);
    assert.deepEqual(await h.call('select script from sessions where id=$1',[uuid(50)]),[{script:'Nuits bretonnes'}]);
  });
});
