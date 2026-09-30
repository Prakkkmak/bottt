import {deliverNotifications} from '../lib/notifications';
const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
if(!url||new URL(url).hostname!=='127.0.0.1'||process.env.VERCEL)throw new Error('Ce worker est réservé au développement local.');
let stopped=false;process.on('SIGINT',()=>{stopped=true;process.exit(0);});process.on('SIGTERM',()=>{stopped=true;process.exit(0);});
async function tick(){try{const r=await deliverNotifications();if(r.sent||r.failed)console.log(`Notifications locales : ${r.sent} livrées, ${r.failed} en échec.`);}catch(e){console.error('Service de notifications temporairement indisponible.');}if(!stopped)setTimeout(tick,60000);}
void tick();
