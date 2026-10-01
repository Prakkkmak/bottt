import type { Metadata } from 'next';
import './globals.css';
import { CookieBanner } from '@/components/cookies';
export const metadata: Metadata = { title: { default: 'Blood on the Tanguy Tower — Blood on the Clocktower à Brest', template: '%s · BOTTT' }, description: 'Les soirées Blood on the Clocktower à Brest. Retrouve les prochaines parties de Blood on the Tanguy Tower, réserve ta place et invite tes amis.', icons: { icon: '/favicon.svg?v=tanguy' }, robots: { index: false, follow: false } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="fr"><head><link rel="preload" href="/fonts/dm-sans-latin.woff2" as="font" type="font/woff2" crossOrigin="anonymous" /></head><body>{children}<CookieBanner /></body></html>; }
