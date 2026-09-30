import {getData} from '@/lib/data';import {Shell} from '@/components/shell';import {ProfileView} from '@/components/profile';
export const dynamic='force-dynamic';export const metadata={title:'Mon profil'};
export default async function Page(){const data=await getData();return <Shell data={data}><ProfileView key={data.profile?.id||'anonymous'} data={data}/></Shell>;}
