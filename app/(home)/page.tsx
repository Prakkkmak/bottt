import { getData, getAddresses } from '@/lib/data';
import { canSeeAddress } from '@/lib/guests';
import { Shell } from '@/components/shell';
import { Dashboard } from '@/components/dashboard';
export const dynamic = 'force-dynamic';
export default async function Home({ searchParams }: { searchParams: Promise<{ partie?: string | string[] }> }) {
  // Addresses load alongside the sessions; only those of the sessions shown to this viewer are passed on.
  const [data, readable] = await Promise.all([getData(), getAddresses()]);
  const { partie } = await searchParams;
  const selected = typeof partie === 'string' && data.sessions.some(s => s.id === partie) ? partie : undefined;
  const addresses = Object.fromEntries(data.sessions.filter(s => canSeeAddress(s, data.profile) && readable[s.id] !== undefined).map(s => [s.id, readable[s.id]]));
  return <Shell data={data}><Dashboard key={selected || 'all'} data={data} addresses={addresses} initialSessionId={selected} /></Shell>;
}
