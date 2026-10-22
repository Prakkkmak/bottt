import {createClient,type SupabaseClient} from '@supabase/supabase-js';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;if(!url||new URL(url).hostname!=='127.0.0.1')throw new Error('Tests strictement locaux.');
const publicKey=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
const ids:string[]=[];const actors:SupabaseClient[]=[];let sid:string|undefined;let guestSid:string|undefined;const batch=randomUUID().slice(0,8);
try{
 for(let i=0;i<7;i++){
  const email=`qa-${batch}-${i}@cercle.test`;const created=await admin.auth.admin.createUser({email,email_confirm:true,user_metadata:{display_name:`Test ${i}`}});if(created.error)throw created.error;
  const id=created.data.user.id;ids.push(id);await admin.from('profiles').update({membership:i===0?'organizer':i===6?'newcomer':'member'}).eq('id',id);
  const link=await admin.auth.admin.generateLink({type:'magiclink',email});if(link.error)throw link.error;
  const client=createClient(url,publicKey,{auth:{persistSession:false,autoRefreshToken:false}});const auth=await client.auth.verifyOtp({token_hash:link.data.properties.hashed_token,type:'email'});if(auth.error)throw auth.error;actors.push(client);
 }
 const date=new Date(Date.now()+10*86400000).toISOString();const end=new Date(Date.now()+10*86400000+14400000).toISOString();
 const saved=await actors[0].rpc('save_session',{p_data:{title:'Test transactionnel local',description:'Données de test temporaires',script:'Trouble Brewing',starts_at:date,ends_at:end,location:'Lieu de test',address:'Adresse secrète de test',capacity:7,beginners_welcome:true,visibility:'public'}});if(saved.error)throw saved.error;sid=saved.data;
 const results=await Promise.all(actors.slice(1,6).map(c=>c.rpc('book_session',{p_id:sid})));
 assert.ok(results.every(r=>!r.error));assert.ok(results.every(r=>r.data==='confirmed'));
 console.log('OK : cinq réservations simultanées, toutes confirmées sans validation.');
 const volunteered=await actors[1].from('profiles').update({can_storytell:true}).eq('id',ids[1]);assert.equal(volunteered.error,null);
 const visible=await actors[1].rpc('list_sessions');assert.equal(visible.error,null);
 const game=visible.data.find((s:{id:string})=>s.id===sid);
 assert.equal(Object.hasOwn(game,'storyteller'),false);
 assert.equal(game.participants.find((p:{display_name:string})=>p.display_name==='Test 1').can_storytell,true);
 assert.ok(game.participants.filter((p:{display_name:string})=>p.display_name!=='Test 1').every((p:{can_storytell:boolean})=>p.can_storytell===false));
 const visitor=createClient(url,publicKey,{auth:{persistSession:false,autoRefreshToken:false}});
 const publicGames=await visitor.rpc('list_sessions');assert.equal(publicGames.error,null);assert.deepEqual(publicGames.data.find((s:{id:string})=>s.id===sid).participants,[]);
 console.log('OK : les volontaires MJ sont visibles parmi les participants, sans désignation sur la partie.');
 const friend=await actors[1].rpc('add_guest',{p_session:sid,p_name:'Invitée C'});assert.equal(friend.data,'confirmed');
 // A traveller and the organizer ask for the last seat at the same instant.
 const last=await Promise.all([actors[6],actors[0]].map(c=>c.rpc('book_session',{p_id:sid})));
 assert.ok(last.every(r=>!r.error));assert.deepEqual(last.map(r=>r.data).sort(),['confirmed','waitlisted']);
 const waiterIndex=last[0].data==='waitlisted'?6:0;
 const queued=(await actors[waiterIndex].rpc('list_sessions')).data.find((s:{id:string})=>s.id===sid);assert.equal(queued.my_waitlist_position,1);
 console.log('OK : deux demandes simultanées sur la dernière place : une place, l’autre n° 1 de la liste d’attente.');
 const forbidden=await actors[1].from('profiles').update({membership:'organizer'}).eq('id',ids[1]);assert.ok(forbidden.error);
 if(waiterIndex===6){const address=await actors[6].from('session_addresses').select('address').eq('session_id',sid);assert.equal(address.data?.length,0);}
 const ownOnly=await actors[1].from('bookings').select('user_id,sponsor_id').eq('session_id',sid);assert.ok(ownOnly.data?.length===2&&ownOnly.data.every(b=>b.user_id===ids[1]||b.sponsor_id===ids[1]));
 console.log('OK : rôle, participations et adresse privée restent protégés par la base.');
 const cancelled=await actors[2].rpc('cancel_booking',{p_id:sid});assert.equal(cancelled.error,null);
 const promoted=await actors[waiterIndex].from('bookings').select('status').eq('session_id',sid).eq('user_id',ids[waiterIndex]).single();assert.equal(promoted.data?.status,'confirmed');
 const final=await admin.from('bookings').select('id',{count:'exact'}).eq('session_id',sid).eq('status','confirmed');assert.equal(final.count,7);
 const told=await admin.from('notifications').select('title').eq('session_id',sid).eq('user_id',ids[waiterIndex]);
 assert.deepEqual(told.data?.map(n=>n.title).sort(),['Tu es sur la liste d’attente','Une place s’est libérée : tu es inscrit·e']);
 console.log('OK : un désistement donne aussitôt la place au premier de la file, prévenu par un message, sans sur-réservation.');
 const guestGame=await actors[0].rpc('save_session',{p_data:{title:'Test invités local',description:'',script:'Trouble Brewing',starts_at:date,ends_at:end,location:'Lieu de test',address:'',capacity:7,beginners_welcome:true,visibility:'public'}});if(guestGame.error)throw guestGame.error;guestSid=guestGame.data;
 for(const i of [1,4,5,6]){const host=await actors[i].rpc('book_session',{p_id:guestSid});assert.equal(host.data,'confirmed');}
 for(const name of ['Invité D','Invité E']){const own=await actors[1].rpc('add_guest',{p_session:guestSid,p_name:name});assert.equal(own.data,'confirmed');}
 const guests=await Promise.all([actors[2].rpc('add_guest',{p_session:guestSid,p_name:'Invité A'}),actors[3].rpc('add_guest',{p_session:guestSid,p_name:'Invité B'})]);
 assert.ok(guests.every(r=>!r.error));assert.deepEqual(guests.map(r=>r.data).sort(),['confirmed','waitlisted']);
 const embedded=await actors[0].from('bookings').select('*,profile:profiles(*)').eq('session_id',guestSid);
 assert.equal(embedded.error,null);assert.equal(embedded.data?.filter((b:{guest_name:string|null})=>b.guest_name).length,4);
 console.log('OK : deux invités ajoutés en même temps sur la dernière place, sans sur-réservation ; la requête organisateur reste valide.');
}finally{
 if(sid)await admin.from('sessions').delete().eq('id',sid);
 if(guestSid)await admin.from('sessions').delete().eq('id',guestSid);
 if(ids.length)await admin.from('action_limits').delete().in('user_id',ids);
 for(const id of ids)await admin.auth.admin.deleteUser(id);
 console.log('Données temporaires des tests supprimées ; exemples du site conservés.');
}
