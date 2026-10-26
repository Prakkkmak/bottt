import type { Metadata, Viewport } from 'next';
import './globals.css';
import { CookieBanner } from '@/components/cookies';
import { SiteFrame, headerKey } from '@/components/shell';
import { getData } from '@/lib/data';
import { ViewerProvider } from '@/components/viewer';
import { homeDescription, homeTitle, indexable, openGraphBase, shareImage, siteName, siteOrigin } from '@/lib/seo';
export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin()),
  title: { default: homeTitle, template: '%s · BOTTT' },
  description: homeDescription,
  applicationName: siteName,
  icons: { icon: '/favicon.svg?v=tanguy', apple: '/apple-touch-icon.png' },
  openGraph: { ...openGraphBase, title: homeTitle, description: homeDescription },
  twitter: { card: 'summary_large_image', images: shareImage },
  robots: indexable() ? { index: true, follow: true, googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 } } : { index: false, follow: false },
  verification: process.env.GOOGLE_SITE_VERIFICATION ? { google: process.env.GOOGLE_SITE_VERIFICATION } : undefined
};
export const viewport: Viewport = { themeColor: '#161321' };
// The header lives here so it stays on screen while the next page loads; getData is shared with the page in the same request.
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const data = await getData();
  return <html lang="fr"><head><link rel="preload" href="/fonts/dm-sans-latin.woff2" as="font" type="font/woff2" crossOrigin="anonymous" /><link rel="preload" href="/fonts/cinzel-latin.woff2" as="font" type="font/woff2" crossOrigin="anonymous" /></head><body><ViewerProvider value={{ signedIn: !!data.profile, configured: data.configured, header: headerKey(data) }}><SiteFrame data={data}>{children}</SiteFrame></ViewerProvider><CookieBanner /></body></html>;
}
