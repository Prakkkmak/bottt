import { getData, getAddresses } from '@/lib/data';
import { Shell } from '@/components/shell';
import { Dashboard } from '@/components/dashboard';
export const dynamic = 'force-dynamic';
export default async function Home({ searchParams }: { searchParams: Promise<{ partie?: string | string[] }> }) {
  const data = await getData();
  const { partie } = await searchParams;
  const selected = typeof partie === 'string' && data.sessions.some(s => s.id === partie) ? partie : undefined;
  const addresses = await getAddresses(data.sessions.filter(s => s.my_status === 'confirmed' || data.profile?.membership === 'organizer').map(s => s.id));
  return <Shell data={data}><Dashboard key={selected || 'all'} data={data} addresses={addresses} initialSessionId={selected} /></Shell>;
}
