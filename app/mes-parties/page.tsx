import { getData, getAddresses } from '@/lib/data';
import { Shell } from '@/components/shell';
import { Participations } from '@/components/participations';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mes participations' };
export default async function Page() {
  const data = await getData();
  const addresses = await getAddresses(data.sessions.filter(s => s.my_status === 'confirmed').map(s => s.id));
  return <Shell data={data}><Participations data={data} addresses={addresses} /></Shell>;
}
