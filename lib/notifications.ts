import { createClient } from '@supabase/supabase-js';
import { canSendMail, localMail, MailRateLimited, notificationMail, sendMail, type QueuedEmail } from './mail';

/** The outbox is read with the service key: a player never sees another player's address. */
export function serviceClient() {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)return null;
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}

/** Sends the queued messages. A message that fails stays queued and is tried again later, five times at most.
 * When the provider asks to slow down, or the deadline passes, the messages not tried yet go back to the outbox untouched. */
export async function sendQueuedEmails(db=serviceClient(),deadline=Infinity){
  if(!db)throw new Error('Base de données non configurée.');
  if(!canSendMail())return {sent:0,failed:0,pending:true,stopped:false};
  const {data:messages,error}=await db.rpc('claim_emails');if(error)throw new Error(error.message);
  const list=(messages||[]) as QueuedEmail[];
  // rest: where the messages not tried start, once the sender stops early.
  let sent=0,failed=0,rest=-1;
  for(const [i,m] of list.entries()){
    if(Date.now()>deadline){rest=i;break;}
    try {
      // Resend accepts a few messages per second: a cancelled game writing to everyone is paced.
      if(sent+failed>0&&!localMail())await new Promise(resolve=>setTimeout(resolve,500));
      await sendMail({to:m.email,...notificationMail(m),idempotencyKey:m.id});
      const {error:saveError}=await db.from('notifications').update({emailed_at:new Date().toISOString(),claimed_until:null}).eq('id',m.id);if(saveError)throw saveError;sent++;
    }catch(e){
      if(e instanceof MailRateLimited){rest=i;break;}
      failed++;
    }
  }
  if(rest>=0)await releaseEmails(db,list.slice(rest));
  return {sent,failed,pending:false,stopped:rest>=0};
}
/** Puts back messages claimed but not tried. Never throws: unreleased, they come back by themselves after five minutes. */
async function releaseEmails(db:NonNullable<ReturnType<typeof serviceClient>>,messages:QueuedEmail[]){
  if(!messages.length)return;
  const {error}=await db.rpc('release_emails',{p_ids:messages.map(m=>m.id)});
  if(error)console.error('E-mails non remis en file',error.message);
}

/** Opens the next dates of the recurring games. Never throws: before the series migration, the rest of the job still runs. */
export async function extendSeries(db=serviceClient()){
  if(!db)return 0;
  const {data,error}=await db.rpc('extend_series');
  if(error){console.error('Séries indisponibles',error.message);return 0;}
  return Number(data)||0;
}

/** Reminders, waiting lists moved on and housekeeping. Never throws, like extendSeries. */
export async function runMaintenance(db=serviceClient()){
  if(!db)return false;
  const {error}=await db.rpc('maintenance');
  if(error){console.error('Maintenance indisponible',error.message);return false;}
  return true;
}

/** The scheduled job: the next dates of the recurring games, reminders and housekeeping, then the messages. */
export async function deliverNotifications() {
  const db=serviceClient();
  if(!db)throw new Error('Base de données non configurée.');
  await extendSeries(db);
  const {error:maintenanceError}=await db.rpc('maintenance');if(maintenanceError)throw new Error(maintenanceError.message);
  return sendQueuedEmails(db);
}

let flushing:Promise<void>|null=null;let again=false;
/** public.claim_emails hands out this many messages at a time. */
const CLAIM_BATCH=30;
/** Right after an action, so that a booking, a place on the waiting list or a freed seat is told at once. Never throws.
 * Flushes asked for while one runs are folded into one more round, so the sender's pace holds. A full batch, such as
 * a message to a game with a long waiting list, is followed by the next one for 40 seconds at most, then left to the cron. */
export function flushEmails():Promise<void> {
  if(!canSendMail())return Promise.resolve();
  if(!process.env.SUPABASE_SERVICE_ROLE_KEY){console.error('E-mails en attente : SUPABASE_SERVICE_ROLE_KEY n’est pas configurée.');return Promise.resolve();}
  if(flushing){again=true;return flushing;}
  flushing=(async()=>{
    const deadline=Date.now()+40000;
    try{
      do{
        again=false;
        try{
          const r=await sendQueuedEmails(undefined,deadline);if(r.failed)console.error(`E-mails : ${r.failed} en échec, nouvel essai plus tard.`);
          if(!r.failed&&!r.stopped&&r.sent>=CLAIM_BATCH&&Date.now()<deadline)again=true;
        }
        catch(e){console.error('E-mails indisponibles',e instanceof Error?e.message:'erreur');}
      }while(again);
    }finally{flushing=null;}
  })();
  return flushing;
}
