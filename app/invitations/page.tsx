import {getData,getInvitations} from '@/lib/data';import {Shell} from '@/components/shell';import {Invitations} from '@/components/invitations';import {privatePage} from '@/lib/seo';
export const dynamic='force-dynamic';export const metadata={title:'Mes invitations',robots:privatePage};
// The invitations load alongside the page data instead of after it.
export default async function Page(){const [base,invitations]=await Promise.all([getData(),getInvitations().catch(()=>null)]);let data=base;if(data.profile) data=invitations?{...data,invitations}:{...data,error:'Impossible de charger les invitations. Réessaie dans un instant.'};return <Shell data={data}><Invitations data={data}/></Shell>;}
