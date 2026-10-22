import {createClient} from '@supabase/supabase-js';import {demoSessions,demoVenues} from '../lib/fixtures';
const url=process.env.NEXT_PUBLIC_SUPABASE_URL;const secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!secret||new URL(url).hostname!=='127.0.0.1'||process.env.VERCEL)throw new Error('Les exemples sont strictement réservés à la base locale.');
const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
const names=['Camille','Léa','Thomas','Manon','Hugo','Sarah','Alex','Julien','Inès','Noah','Chloé','Louis','Émilie','Maxime','Jade','Robin'];
const emails=names.map(n=>`${n.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()}@cercle.test`);
const {data:{users},error}=await db.auth.admin.listUsers({page:1,perPage:1000});if(error)throw error;
const ids:string[]=[];
for(let i=0;i<names.length;i++){
 let user=users.find(u=>u.email===emails[i]);const isNew=!user;
 if(!user){const r=await db.auth.admin.createUser({email:emails[i],email_confirm:true,user_metadata:{display_name:names[i]}});if(r.error)throw r.error;user=r.data.user;}
 ids.push(user.id);
 if(isNew){const {error:pError}=await db.from('profiles').update({display_name:names[i],avatar_color:['rose','blue','sage','ochre','lilac'][i%5],experience:i>11?'beginner':i%3===0?'experienced':'some',membership:i===0?'organizer':i>11?'newcomer':'member'}).eq('id',user.id);if(pError)throw pError;}
}
// The usual places, then the games held there, take their name and address from them as the form does.
const venueIds:Record<string,string>={};
for(const v of demoVenues){
 const {data:existing,error:vError}=await db.from('venues').select('id').eq('name',v.name).maybeSingle();if(vError)throw vError;
 if(existing){venueIds[v.id]=existing.id;continue;}
 const {data:created,error:cError}=await db.from('venues').insert({name:v.name,address:v.address}).select('id').single();if(cError)throw cError;
 venueIds[v.id]=created.id;
}
const sessionIds=['10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000004'];
for(const [index,s] of demoSessions().entries()){
 const {data:existing}=await db.from('sessions').select('id').eq('id',sessionIds[index]).maybeSingle();if(existing)continue;
 const {id,confirmed_count,waitlist_count,my_status,participants,occupied_seats,my_seat,my_guests,member_seats_free,traveller_seats_free,venue_id,...session}=s;
 const venue=demoVenues.find(v=>v.id===venue_id)!;
 const sid=sessionIds[index];const {error}=await db.from('sessions').insert({...session,id:sid,venue_id:venueIds[venue.id],created_by:ids[0]});if(error)throw error;
 await db.from('session_addresses').insert({session_id:sid,address:venue.address});
 const players=index===2?[0,1,2,12]:Array.from({length:confirmed_count},(_,j)=>j+1);
 const rows=players.map(p=>({session_id:sid,user_id:ids[p],status:'confirmed',pool:p>11?'newcomer':'circle'}));
 if(index===1){rows.push({session_id:sid,user_id:ids[0],status:'waitlisted',pool:'circle'},{session_id:sid,user_id:ids[14],status:'waitlisted',pool:'newcomer'});}
 if(index===0)rows.push({session_id:sid,user_id:ids[13],status:'pending',pool:'newcomer'});
 const {error:bError}=await db.from('bookings').insert(rows);if(bError)throw bError;
 // Guests have no account: Léa's guest has a seat at once, Maxime's friend waits with him for review.
 if(index===0){const {error:gError}=await db.from('bookings').insert([{session_id:sid,guest_name:'Paul',sponsor_id:ids[1],status:'confirmed',pool:'circle'},{session_id:sid,guest_name:'Nora',sponsor_id:ids[13],status:'pending',pool:'newcomer'}]);if(gError)throw gError;}
}
console.log('Exemples locaux prêts : 2 lieux, 4 sessions, 16 profils. Compte organisateur : camille@cercle.test.');
