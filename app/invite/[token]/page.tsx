import {notFound} from 'next/navigation';import {getData} from '@/lib/data';import {Shell} from '@/components/shell';import {AcceptInvite} from '@/components/invitations';
export const dynamic='force-dynamic';export const metadata={title:'Une invitation pour toi',referrer:'no-referrer' as const,robots:{index:false,follow:false}};
export default async function Page({params}:{params:Promise<{token:string}>}){const {token}=await params;if(!/^[a-f0-9]{64}$/.test(token))notFound();const data=await getData();return <Shell data={data}><AcceptInvite data={data} token={token}/></Shell>;}
