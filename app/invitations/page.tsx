import {getData,getInvitations} from '@/lib/data';import {Shell} from '@/components/shell';import {Invitations} from '@/components/invitations';
export const dynamic='force-dynamic';export const metadata={title:'Mes invitations'};
export default async function Page(){let data=await getData();if(data.profile) {try {data={...data,invitations:await getInvitations()};} catch {data={...data,error:'Impossible de charger les invitations. Réessaie dans un instant.'};}}return <Shell data={data}><Invitations data={data}/></Shell>;}
