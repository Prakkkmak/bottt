import { createClient } from '@supabase/supabase-js';
import { canSendMail, sendMail, siteUrl } from './mail';
export async function deliverNotifications() {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)throw new Error('Base de données non configurée.');
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {error:maintenanceError}=await db.rpc('maintenance');if(maintenanceError)throw new Error(maintenanceError.message);
  if(!canSendMail())return {sent:0,failed:0,pending:true};
  const {data:messages,error}=await db.rpc('claim_emails');if(error)throw new Error(error.message);
  let sent=0,failed=0;
  for(const m of messages||[]){
    const link=`${siteUrl()}${m.session_id?`/sessions/${m.session_id}`:'/'}`;
    const text=`${m.body}\n\n${link}\n\nBlood on the Tanguy Tower`;
    try {
      await sendMail({to:m.email,subject:m.title,text,idempotencyKey:m.id});
      const {error:saveError}=await db.from('notifications').update({emailed_at:new Date().toISOString(),claimed_until:null}).eq('id',m.id);if(saveError)throw saveError;sent++;
    }catch{failed++;}
  }
  return {sent,failed,pending:false};
}
