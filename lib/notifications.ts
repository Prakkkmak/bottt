import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';
export async function deliverNotifications() {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)throw new Error('Base de données non configurée.');
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {error:maintenanceError}=await db.rpc('maintenance');if(maintenanceError)throw new Error(maintenanceError.message);
  const local=new URL(url).hostname==='127.0.0.1'&&!process.env.VERCEL;
  if(!local&&!process.env.RESEND_API_KEY)return {sent:0,failed:0,pending:true};
  const {data:messages,error}=await db.rpc('claim_emails');if(error)throw new Error(error.message);
  const smtp=local?nodemailer.createTransport({host:'127.0.0.1',port:54325,secure:false}):null;
  let sent=0,failed=0;
  for(const m of messages||[]){
    const base=process.env.NEXT_PUBLIC_SITE_URL||'http://127.0.0.1:3000';
    const link=`${base}${m.session_id?`/sessions/${m.session_id}`:'/'}`;
    const text=`${m.body}\n\n${link}\n\nBlood on the Tanguy Tower`;
    try {
      if(smtp)await smtp.sendMail({from:'Blood on the Tanguy Tower <bonjour@cercle.test>',to:m.email,subject:m.title,text});
      else {const result=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':m.id},body:JSON.stringify({from:process.env.MAIL_FROM,to:m.email,subject:m.title,text}),signal:AbortSignal.timeout(15000)});if(!result.ok)throw new Error('Email provider unavailable');}
      const {error:saveError}=await db.from('notifications').update({emailed_at:new Date().toISOString(),claimed_until:null}).eq('id',m.id);if(saveError)throw saveError;sent++;
    }catch{failed++;}
  }
  return {sent,failed,pending:false};
}
