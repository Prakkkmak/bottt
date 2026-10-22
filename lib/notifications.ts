import { createClient } from '@supabase/supabase-js';
import { canSendMail, localMail, notificationMail, sendMail, type QueuedEmail } from './mail';

/** The outbox is read with the service key: a player never sees another player's address. */
function serviceClient() {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)return null;
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}

/** Sends the queued messages. A message that fails stays queued and is tried again later, five times at most. */
export async function sendQueuedEmails(db=serviceClient()){
  if(!db)throw new Error('Base de données non configurée.');
  if(!canSendMail())return {sent:0,failed:0,pending:true};
  const {data:messages,error}=await db.rpc('claim_emails');if(error)throw new Error(error.message);
  let sent=0,failed=0;
  for(const m of (messages||[]) as QueuedEmail[]){
    try {
      // Resend accepts a few messages per second: a cancelled game writing to everyone is paced.
      if(sent+failed>0&&!localMail())await new Promise(resolve=>setTimeout(resolve,500));
      await sendMail({to:m.email,...notificationMail(m),idempotencyKey:m.id});
      const {error:saveError}=await db.from('notifications').update({emailed_at:new Date().toISOString(),claimed_until:null}).eq('id',m.id);if(saveError)throw saveError;sent++;
    }catch{failed++;}
  }
  return {sent,failed,pending:false};
}

/** The scheduled job: reminders and housekeeping, then the messages. */
export async function deliverNotifications() {
  const db=serviceClient();
  if(!db)throw new Error('Base de données non configurée.');
  const {error:maintenanceError}=await db.rpc('maintenance');if(maintenanceError)throw new Error(maintenanceError.message);
  return sendQueuedEmails(db);
}

let flushing:Promise<void>|null=null;let again=false;
/** Right after an action, so that a booking, a place on the waiting list or a freed seat is told at once. Never throws.
 * Flushes asked for while one runs are folded into one more round, so the sender's pace holds. */
export function flushEmails():Promise<void> {
  if(!canSendMail())return Promise.resolve();
  if(!process.env.SUPABASE_SERVICE_ROLE_KEY){console.error('E-mails en attente : SUPABASE_SERVICE_ROLE_KEY n’est pas configurée.');return Promise.resolve();}
  if(flushing){again=true;return flushing;}
  flushing=(async()=>{
    try{
      do{
        again=false;
        try{const r=await sendQueuedEmails();if(r.failed)console.error(`E-mails : ${r.failed} en échec, nouvel essai plus tard.`);}
        catch(e){console.error('E-mails indisponibles',e instanceof Error?e.message:'erreur');}
      }while(again);
    }finally{flushing=null;}
  })();
  return flushing;
}
