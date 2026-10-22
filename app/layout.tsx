import type { Metadata } from 'next';
import './globals.css';
import { CookieBanner } from '@/components/cookies';
import { SiteFrame, headerKey } from '@/components/shell';
import { getData } from '@/lib/data';
import { ViewerProvider } from '@/components/viewer';
export const metadata: Metadata = { title: { default: 'Blood on the Tanguy Tower — Blood on the Clocktower à Brest', template: '%s · BOTTT' }, description: 'Les soirées Blood on the Clocktower à Brest. Retrouve les prochaines parties de Blood on the Tanguy Tower, réserve ta place et invite tes amis.', icons: { icon: '/favicon.svg?v=tanguy' }, robots: { index: false, follow: false } };
// The header lives here so it stays on screen while the next page loads; getData is shared with the page in the same request.
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const data = await getData();
  return <html lang="fr"><head><link rel="preload" href="/fonts/dm-sans-latin.woff2" as="font" type="font/woff2" crossOrigin="anonymous" /><link rel="preload" href="/fonts/cinzel-latin.woff2" as="font" type="font/woff2" crossOrigin="anonymous" /></head><body><ViewerProvider value={{ signedIn: !!data.profile, configured: data.configured, header: headerKey(data) }}><SiteFrame data={data}>{children}</SiteFrame></ViewerProvider><CookieBanner /></body></html>;
}
