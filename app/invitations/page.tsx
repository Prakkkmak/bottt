import {getData} from '@/lib/data';import {Shell} from '@/components/shell';import {Invitations} from '@/components/invitations';
export const dynamic='force-dynamic';export const metadata={title:'Mes invitations'};
export default async function Page(){const data=await getData();return <Shell data={data}><Invitations data={data}/></Shell>;}
