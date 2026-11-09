import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDatabase,uuid} from './sql-harness';

const colors=['rose','blue','sage','ochre','lilac'];

test('Couleur de joueur tirée au hasard à la création du compte',async t=>{
  // Two accounts created before the migration: one kept the default rose, the other chose blue.
  const h=await createDatabase({before:'202611090017'});
  await h.user(1,'organizer');
  await h.user(2,'member');
  await h.call(`update profiles set avatar_color='blue' where id=$1`,[uuid(2)]);
  await h.migrate();
  const color=async(n:number)=>{await h.root();return (await h.call<{avatar_color:string}>('select avatar_color from profiles where id=$1',[uuid(n)]))[0].avatar_color;};

  await t.test('les comptes existants gardent leur couleur',async()=>{
    assert.equal(await color(1),'rose');
    assert.equal(await color(2),'blue');
  });
  await t.test('chaque nouveau compte reçoit une des cinq couleurs, et toutes finissent par sortir',async()=>{
    // 200 draws: the odds of one colour never coming out are about 1 in 10^19.
    const drawn=new Map<string,number>();
    for(let n=10;n<210;n++){await h.user(n,'newcomer',{});const c=await color(n);drawn.set(c,(drawn.get(c)??0)+1);}
    assert.deepEqual([...drawn.keys()].sort(),[...colors].sort());
    for(const c of colors)assert.ok(drawn.get(c)!>=10,`${c} sort ${drawn.get(c)} fois sur 200`);
  });
  await t.test('le joueur peut toujours changer de couleur',async()=>{
    await h.login(10);await h.call(`update profiles set avatar_color='lilac' where id=$1`,[uuid(10)]);
    assert.equal(await color(10),'lilac');
    await h.login(10);await assert.rejects(h.call(`update profiles set avatar_color='vert' where id=$1`,[uuid(10)]),/avatar_color_check/);
  });
});
