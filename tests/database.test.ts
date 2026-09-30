import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile,readdir} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';
test('Règles de réservation et isolation des comptes',async t=>{
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
 create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),created_at timestamptz default now(),not_after timestamptz);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 grant usage on schema auth to anon,authenticated,service_role;
 grant execute on all functions in schema auth to anon,authenticated,service_role;`);
 const migrations=new URL('../supabase/migrations/',import.meta.url);
 for(const name of (await readdir(migrations)).filter(n=>n.endsWith('.sql')).sort())await db.exec(await readFile(new URL(name,migrations),'utf8'));
 const uuid=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
 async function root(){await db.exec(`reset role; select set_config('request.jwt.claim.sub','',false); select set_config('request.jwt.claims','{}',false);`);}
 async function login(n:number){await root();await db.query(`select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)`,[uuid(n),JSON.stringify({sub:uuid(n),session_id:uuid(n+1000)})]);await db.exec('set role authenticated');}
 async function user(n:number,membership='member'){await root();await db.query(`insert into auth.users values($1,$2,now(),$3)`,[uuid(n),`test${n}@cercle.test`,JSON.stringify({display_name:`Joueur ${n}`,membership:'organizer'})]);await db.query(`insert into auth.sessions(id,user_id) values($1,$2)`,[uuid(n+1000),uuid(n)]);if(membership!=='newcomer')await db.query('update public.profiles set membership=$1 where id=$2',[membership,uuid(n)]);}
 for(let i=1;i<=12;i++)await user(i,i===1?'organizer':i===7||i===8||i===11?'newcomer':'member');
 const sid=uuid(100);await root();await db.query(`insert into public.sessions(id,title,script,starts_at,ends_at,location,storyteller,capacity,newcomer_seats,created_by) values($1,'Soirée de test','Trouble Brewing',now()+interval '10 days',now()+interval '10 days 4 hours','Paris','Alex',7,4,$2)`,[sid,uuid(1)]);await db.query(`insert into public.session_addresses values($1,'Adresse privée')`,[sid]);
 await t.test('les métadonnées de création ne donnent aucun droit organisateur',async()=>{await login(7);const r=await db.query<{membership:string}>('select membership from profiles');assert.equal(r.rows.length,1);assert.equal(r.rows[0].membership,'newcomer');await assert.rejects(db.exec(`update profiles set membership='organizer' where id='${uuid(7)}'`),/permission denied/i);});
 await t.test('un visiteur voit les sessions publiques mais aucune adresse ni identité',async()=>{await root();await db.exec('set role anon');const r=await db.query<{list_sessions:any[]}>('select list_sessions()');assert.equal(r.rows[0].list_sessions.length,1);assert.deepEqual(r.rows[0].list_sessions[0].participants,[]);assert.equal(r.rows[0].list_sessions[0].my_status,null);await assert.rejects(db.exec('select * from session_addresses'),/permission denied/i);await assert.rejects(db.exec('select * from profiles'),/permission denied/i);});
 await t.test('le quota cercle ne prend pas les places des nouveaux, les doublons sont idempotents',async()=>{for(const n of [2,3,4]){await login(n);const r=await db.query<{book_session:string}>('select book_session($1)',[sid]);assert.equal(r.rows[0].book_session,'confirmed');}await login(2);assert.equal((await db.query<{book_session:string}>('select book_session($1)',[sid])).rows[0].book_session,'confirmed');await login(5);assert.equal((await db.query<{book_session:string}>('select book_session($1)',[sid])).rows[0].book_session,'waitlisted');await root();assert.equal(Number((await db.query<{count:string}>('select count(*) from bookings where status=$1',['confirmed'])).rows[0].count),3);});
 await t.test('les nouveaux attendent une validation et utilisent leur quota',async()=>{for(const n of [7,8]){await login(n);assert.equal((await db.query<{book_session:string}>('select book_session($1)',[sid])).rows[0].book_session,'pending');}await login(1);const b=await db.query<{id:string}>(`select id from bookings where status='pending'`);for(const row of b.rows)assert.equal((await db.query<{review_booking:string}>('select review_booking($1,true)',[row.id])).rows[0].review_booking,'confirmed');await root();assert.equal(Number((await db.query<{count:string}>(`select count(*) from bookings where status='confirmed'`)).rows[0].count),5);});
 await t.test('un joueur ne peut pas agir au nom d’un autre ni appeler les fonctions internes',async()=>{await login(6);await assert.rejects(db.query(`insert into bookings(session_id,user_id,status,pool) values($1,$2,'confirmed','circle')`,[sid,uuid(9)]),/permission denied/i);await assert.rejects(db.query(`update bookings set status='cancelled' where user_id=$1`,[uuid(2)]),/permission denied/i);await assert.rejects(db.query('select rebalance($1)',[sid]),/permission denied/i);await assert.rejects(db.exec('select maintenance()'),/permission denied/i);assert.equal((await db.query('select * from bookings')).rows.length,0);assert.equal((await db.query('select * from session_addresses')).rows.length,0);});
 await t.test('le désistement réserve une proposition au premier en attente',async()=>{await login(6);await db.query('select book_session($1)',[sid]);await login(2);await db.query('select cancel_booking($1)',[sid]);await login(5);const own=await db.query<{status:string}>(`select status from bookings where session_id=$1`,[sid]);assert.equal(own.rows[0].status,'offered');assert.equal((await db.query<{accept_offer:string}>('select accept_offer($1)',[sid])).rows[0].accept_offer,'confirmed');assert.equal((await db.query('select * from session_addresses')).rows.length,1);await login(6);assert.equal((await db.query<{status:string}>('select status from bookings where session_id=$1',[sid])).rows[0].status,'waitlisted');});
 await t.test('une invitation exige une identité et ne peut être réutilisée',async()=>{await login(3);const token=(await db.query<{create_invitation:string}>('select create_invitation()')).rows[0].create_invitation;assert.equal(token.length,64);await login(11);await db.query('select accept_invitation($1)',[token]);assert.equal((await db.query<{membership:string}>('select membership from profiles')).rows[0].membership,'member');await login(12);await assert.rejects(db.query('select accept_invitation($1)',[token]),/déjà été utilisée/);});
 await t.test('la session expire après 30 jours même avec un jeton encore présent',async()=>{await root();await db.query(`update auth.sessions set created_at=now()-interval '31 days' where user_id=$1`,[uuid(4)]);await login(4);assert.equal((await db.query<{active_user:boolean}>('select active_user()')).rows[0].active_user,false);await assert.rejects(db.query('select book_session($1)',[sid]),/Connecte-toi/);assert.equal((await db.query('select * from session_addresses')).rows.length,0);});
 await t.test('seul un organisateur peut créer une session ou changer un statut',async()=>{await login(3);await assert.rejects(db.query(`select save_session('{}'::jsonb)`),/organisateur/);await assert.rejects(db.query(`select set_membership($1,'member')`,[uuid(12)]),/non autorisée/);});
 await t.test('annuler une session libère toutes les participations et crée les notifications',async()=>{await login(1);await db.query('select cancel_session($1)',[sid]);await root();assert.equal(Number((await db.query<{count:string}>(`select count(*) from bookings where status in ('confirmed','offered','pending','waitlisted')`)).rows[0].count),0);const count=await db.query<{count:string}>(`select count(*) from notifications where title='La session a été annulée'`);assert.ok(Number(count.rows[0].count)>0);});
 await t.test('se proposer comme conteur ne change ni le niveau déclaré ni les droits',async()=>{
   await login(6);
   const current=await db.query<{can_storytell:boolean;membership:string}>('select can_storytell,membership from profiles');
   assert.equal(current.rows[0].can_storytell,false);
   await db.query('update profiles set beginner=true,can_storytell=true where id=$1',[uuid(6)]);
   await login(6);
   const saved=await db.query<{beginner:boolean;can_storytell:boolean;membership:string}>('select beginner,can_storytell,membership from profiles');
   assert.deepEqual(saved.rows[0],{beginner:true,can_storytell:true,membership:'member'});
   assert.equal((await db.query<{is_organizer:boolean}>('select is_organizer()')).rows[0].is_organizer,false);
   const other=await db.query('update profiles set can_storytell=true where id=$1 returning id',[uuid(9)]);
   assert.equal(other.rows.length,0);
   await assert.rejects(db.exec("update profiles set membership='organizer'"),/permission denied/i);
   await db.query('update profiles set can_storytell=false where id=$1',[uuid(6)]);
   await login(6);
   assert.deepEqual((await db.query<{beginner:boolean;can_storytell:boolean}>('select beginner,can_storytell from profiles')).rows[0],{beginner:true,can_storytell:false});
   await root();
   assert.equal((await db.query<{can_storytell:boolean}>('select can_storytell from profiles where id=$1',[uuid(9)])).rows[0].can_storytell,false);
 });
 const circleId=uuid(101);
 await root();
 await db.query(`insert into public.sessions(id,title,script,starts_at,ends_at,location,storyteller,capacity,newcomer_seats,created_by) values($1,'Le cercle interactif','Trouble Brewing',now()+interval '10 days',now()+interval '10 days 4 hours','Brest','Alex',8,1,$2)`,[circleId,uuid(1)]);
 await t.test('le + choisi persiste, les doubles clics sont idempotents et une place ne peut pas être volée',async()=>{
   await login(2);
   assert.equal((await db.query<{book_circle_seat:string}>('select book_circle_seat($1,7)',[circleId])).rows[0].book_circle_seat,'confirmed');
   await db.query('select book_circle_seat($1,0)',[circleId]);
   await login(2);
   const own=(await db.query<{list_sessions:any[]}>('select list_sessions()')).rows[0].list_sessions.find(s=>s.id===circleId);
   assert.equal(own.my_seat,7);assert.deepEqual(own.occupied_seats,[7]);
   assert.equal(own.participants[0].seat_index,7);
   await login(3);
   await assert.rejects(db.query('select book_circle_seat($1,7)',[circleId]),/vient d’être prise/);
   assert.equal((await db.query('select * from bookings where session_id=$1',[circleId])).rows.length,0);
   for(const seat of [-1,8,null])await assert.rejects(db.query('select book_circle_seat($1,$2)',[circleId,seat]),/place est invalide/);
   await root();await db.exec('set role anon');
   const publicGame=(await db.query<{list_sessions:any[]}>('select list_sessions()')).rows[0].list_sessions.find(s=>s.id===circleId);
   assert.deepEqual(publicGame.occupied_seats,[7]);assert.deepEqual(publicGame.participants,[]);assert.equal(publicGame.my_seat,null);
   await assert.rejects(db.query('select book_circle_seat($1,0)',[circleId]),/permission denied/);
 });
 await t.test('une demande en attente ne bloque pas le + et la validation attribue une autre place si nécessaire',async()=>{
   await user(13,'newcomer');await login(13);
   assert.equal((await db.query<{book_circle_seat:string}>('select book_circle_seat($1,3)',[circleId])).rows[0].book_circle_seat,'pending');
   assert.equal((await db.query<{seat_index:number|null}>('select seat_index from bookings where session_id=$1',[circleId])).rows[0].seat_index,null);
   await login(3);await db.query('select book_circle_seat($1,3)',[circleId]);
   await login(1);
   const request=(await db.query<{id:string}>('select id from bookings where session_id=$1 and user_id=$2',[circleId,uuid(13)])).rows[0].id;
   await db.query('select review_booking($1,true)',[request]);
   const reserved=await db.query<{seat_index:number}>('select seat_index from bookings where session_id=$1',[circleId]);
   assert.equal(new Set(reserved.rows.map(r=>r.seat_index)).size,3);
   await login(13);assert.notEqual((await db.query<{seat_index:number}>('select seat_index from bookings where session_id=$1',[circleId])).rows[0].seat_index,3);
 });
 await t.test('un désistement libère son jeton et la proposition suivante garde ce jeton à la confirmation',async()=>{
   for(const n of [5,6,9,11,12]){await login(n);await db.query('select book_session($1)',[circleId]);}
   await login(10);assert.equal((await db.query<{book_session:string}>('select book_session($1)',[circleId])).rows[0].book_session,'waitlisted');
   await login(2);await db.query('select cancel_booking($1)',[circleId]);
   assert.equal((await db.query<{seat_index:number|null}>('select seat_index from bookings where session_id=$1',[circleId])).rows[0].seat_index,null);
   await login(10);
   assert.deepEqual((await db.query<{status:string;seat_index:number}>('select status,seat_index from bookings where session_id=$1',[circleId])).rows[0],{status:'offered',seat_index:7});
   await db.query('select accept_offer($1)',[circleId]);
   assert.deepEqual((await db.query<{status:string;seat_index:number}>('select status,seat_index from bookings where session_id=$1',[circleId])).rows[0],{status:'confirmed',seat_index:7});
 });
 await t.test('réduire la capacité replace les jetons sans perdre une inscription',async()=>{
   await login(5);await db.query('select cancel_booking($1)',[circleId]);
   await root();await db.query('update sessions set capacity=7 where id=$1',[circleId]);
   const seated=(await db.query<{seat_index:number}>(`select seat_index from bookings where session_id=$1 and status='confirmed' order by seat_index`,[circleId])).rows.map(r=>r.seat_index);
   assert.deepEqual(seated,[0,1,2,3,4,5,6]);
 });
 await t.test('le minimum est de sept places et la création propose quinze sans MJ désigné',async()=>{
   await login(1);
   const input={title:'Capacité par défaut',description:'',script:'Trouble Brewing',starts_at:new Date(Date.now()+10*86400000).toISOString(),ends_at:new Date(Date.now()+10*86400000+14400000).toISOString(),location:'Brest',address:'',newcomer_seats:3,release_hours:72,beginners_welcome:true,visibility:'public'};
   await assert.rejects(db.query('select save_session($1::jsonb)',[JSON.stringify({...input,capacity:6})]),/sessions_capacity_check/);
   const created=(await db.query<{save_session:string}>('select save_session($1::jsonb)',[JSON.stringify(input)])).rows[0].save_session;
   const game=(await db.query<{list_sessions:any[]}>('select list_sessions()')).rows[0].list_sessions.find(s=>s.id===created);
   assert.equal(game.capacity,15);
   assert.equal(Object.hasOwn(game,'storyteller'),false);
   await root();
   assert.equal((await db.query<{storyteller:string|null}>('select storyteller from sessions where id=$1',[created])).rows[0].storyteller,null);
   await assert.rejects(db.query('update sessions set capacity=6 where id=$1',[created]),/sessions_capacity_check/);
   await db.query('update sessions set capacity=7 where id=$1',[created]);
   const direct=(await db.query<{capacity:number}>(`insert into sessions(title,script,starts_at,ends_at,location,created_by) values('Défaut SQL','Trouble Brewing',now()+interval '10 days',now()+interval '10 days 4 hours','Brest',$1) returning capacity`,[uuid(1)])).rows[0];
   assert.equal(direct.capacity,15);
 });
 await t.test('seuls les volontaires portent le signal MJ parmi les participants visibles',async()=>{
   await login(10);
   await db.query('update profiles set can_storytell=true where id=$1',[uuid(10)]);
   const games=()=>db.query<{list_sessions:any[]}>('select list_sessions()');
   let game=(await games()).rows[0].list_sessions.find(s=>s.id===circleId);
   assert.equal(Object.hasOwn(game,'storyteller'),false);
   assert.equal(game.participants.find((p:any)=>p.display_name==='Joueur 10').can_storytell,true);
   assert.equal(game.participants.find((p:any)=>p.display_name==='Joueur 3').can_storytell,false);
   await root();await db.exec('set role anon');
   assert.deepEqual((await games()).rows[0].list_sessions.find(s=>s.id===circleId).participants,[]);
   await user(14,'newcomer');await login(14);
   assert.deepEqual((await games()).rows[0].list_sessions.find(s=>s.id===circleId).participants,[]);
   await login(10);await db.query('update profiles set can_storytell=false where id=$1',[uuid(10)]);
   game=(await games()).rows[0].list_sessions.find(s=>s.id===circleId);
   assert.equal(game.participants.find((p:any)=>p.display_name==='Joueur 10').can_storytell,false);
 });
 await db.close();
});
