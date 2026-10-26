import { getData, getAddresses } from '@/lib/data';
import { canSeeAddress } from '@/lib/guests';
import { homeDescription, homeJsonLd, homeTitle, openGraphBase, siteOrigin } from '@/lib/seo';
import { Shell } from '@/components/shell';
import { Dashboard } from '@/components/dashboard';
import { HomeIntro } from '@/components/home-intro';
import { JsonLd } from '@/components/json-ld';
export const dynamic = 'force-dynamic';
// A link to one session (?partie=) is the same page as the list.
export const metadata = { alternates: { canonical: '/' }, openGraph: { ...openGraphBase, title: homeTitle, description: homeDescription, url: '/' } };
export default async function Home({ searchParams }: { searchParams: Promise<{ partie?: string | string[] }> }) {
  // Addresses load alongside the sessions; only those of the sessions shown to this viewer are passed on.
  const [data, readable] = await Promise.all([getData(), getAddresses()]);
  const { partie } = await searchParams;
  const selected = typeof partie === 'string' && data.sessions.some(s => s.id === partie) ? partie : undefined;
  const addresses = Object.fromEntries(data.sessions.filter(s => canSeeAddress(s, data.profile) && readable[s.id] !== undefined).map(s => [s.id, readable[s.id]]));
  // Search engines visit signed out: they get the introduction and the games as structured data, players go straight to the sessions.
  const visitor = !data.profile;
  return <Shell data={data}>{visitor && <><JsonLd data={homeJsonLd(data.sessions, siteOrigin())} /><HomeIntro /></>}<Dashboard key={selected || 'all'} data={data} addresses={addresses} initialSessionId={selected} titled={visitor} /></Shell>;
}
