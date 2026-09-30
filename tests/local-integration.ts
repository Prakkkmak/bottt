import {createClient,type SupabaseClient} from '@supabase/supabase-js';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;if(!url||new URL(url).hostname!=='127.0.0.1')throw new Error('Tests strictement locaux.');
const publicKey=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
const ids:string[]=[];const actors:SupabaseClient[]=[];let sid:string|undefined;const batch=randomUUID().slice(0,8);
try{
 for(let i=0;i<7;i++){
  const email=`qa-${batch}-${i}@cercle.test`;const created=await admin.auth.admin.createUser({email,email_confirm:true,user_metadata:{display_name:`Test ${i}`}});if(created.error)throw created.error;
  const id=created.data.user.id;ids.push(id);await admin.from('profiles').update({membership:i===0?'organizer':i===6?'newcomer':'member'}).eq('id',id);
  const link=await admin.auth.admin.generateLink({type:'magiclink',email});if(link.error)throw link.error;
  const client=createClient(url,publicKey,{auth:{persistSession:false,autoRefreshToken:false}});const auth=await client.auth.verifyOtp({token_hash:link.data.properties.hashed_token,type:'email'});if(auth.error)throw auth.error;actors.push(client);
 }
 const date=new Date(Date.now()+10*86400000).toISOString();const end=new Date(Date.now()+10*86400000+14400000).toISOString();
 const saved=await actors[0].rpc('save_session',{p_data:{title:'Test transactionnel local',description:'Données de test temporaires',script:'Trouble Brewing',starts_at:date,ends_at:end,location:'Lieu de test',address:'Adresse secrète de test',capacity:7,newcomer_seats:3,release_hours:72,beginners_welcome:true,visibility:'public'}});if(saved.error)throw saved.error;sid=saved.data;
 const results=await Promise.all(actors.slice(1,6).map(c=>c.rpc('book_session',{p_id:sid})));
 assert.ok(results.every(r=>!r.error));assert.equal(results.filter(r=>r.data==='confirmed').length,4);assert.equal(results.filter(r=>r.data==='waitlisted').length,1);
 console.log('OK : cinq réservations simultanées respectent le quota de quatre places membres.');
 const volunteerIndex=results.findIndex(r=>r.data==='confirmed')+1;
 const volunteered=await actors[volunteerIndex].from('profiles').update({can_storytell:true}).eq('id',ids[volunteerIndex]);assert.equal(volunteered.error,null);
 const visible=await actors[1].rpc('list_sessions');assert.equal(visible.error,null);
 const game=visible.data.find((s:{id:string})=>s.id===sid);
 assert.equal(Object.hasOwn(game,'storyteller'),false);
 assert.equal(game.participants.find((p:{display_name:string})=>p.display_name===`Test ${volunteerIndex}`).can_storytell,true);
 assert.ok(game.participants.filter((p:{display_name:string})=>p.display_name!==`Test ${volunteerIndex}`).every((p:{can_storytell:boolean})=>p.can_storytell===false));
 const visitor=createClient(url,publicKey,{auth:{persistSession:false,autoRefreshToken:false}});
 const publicGames=await visitor.rpc('list_sessions');assert.equal(publicGames.error,null);assert.deepEqual(publicGames.data.find((s:{id:string})=>s.id===sid).participants,[]);
 console.log('OK : les volontaires MJ sont visibles parmi les participants, sans désignation sur la partie.');
 const newbie=await actors[6].rpc('book_session',{p_id:sid});assert.equal(newbie.data,'pending');
 const forbidden=await actors[1].from('profiles').update({membership:'organizer'}).eq('id',ids[1]);assert.ok(forbidden.error);
 const address=await actors[6].from('session_addresses').select('address').eq('session_id',sid);assert.equal(address.data?.length,0);
 const ownOnly=await actors[1].from('bookings').select('user_id').eq('session_id',sid);assert.ok(ownOnly.data?.every(b=>b.user_id===ids[1]));
 console.log('OK : rôle, participations et adresse privée restent protégés par la base.');
 const booking=await admin.from('bookings').select('id').eq('session_id',sid).eq('user_id',ids[6]).single();
 const approve=await actors[0].rpc('review_booking',{p_booking:booking.data!.id,p_approve:true});assert.equal(approve.data,'confirmed');
 const confirmedIndex=results.findIndex(r=>r.data==='confirmed')+1;const waiterIndex=results.findIndex(r=>r.data==='waitlisted')+1;
 const cancelled=await actors[confirmedIndex].rpc('cancel_booking',{p_id:sid});assert.equal(cancelled.error,null);
 const waiting=await actors[waiterIndex].from('bookings').select('status').eq('session_id',sid).single();assert.equal(waiting.data?.status,'offered');
 const accepted=await actors[waiterIndex].rpc('accept_offer',{p_id:sid});assert.equal(accepted.data,'confirmed');
 const final=await admin.from('bookings').select('id',{count:'exact'}).eq('session_id',sid).eq('status','confirmed');assert.equal(final.count,5);
 console.log('OK : validation, désistement, proposition puis confirmation sans sur-réservation.');
}finally{
 if(sid)await admin.from('sessions').delete().eq('id',sid);
 if(ids.length)await admin.from('action_limits').delete().in('user_id',ids);
 for(const id of ids)await admin.auth.admin.deleteUser(id);
 console.log('Données temporaires des tests supprimées ; exemples du site conservés.');
}
