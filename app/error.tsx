'use client';
import Link from 'next/link';
import { Shell } from '@/components/shell';
import type { AppData } from '@/lib/types';
const publicData: AppData = { profile: null, sessions: [], invitations: [], demo: false, configured: true };
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <Shell data={publicData}><div className="centered-panel panel"><h1>Un petit contretemps.</h1><p>La page n’a pas pu être chargée. Tes inscriptions sont conservées.</p><div className="button-row"><button className="button primary" onClick={reset}>Réessayer</button><Link href="/" className="button secondary">Retour aux sessions</Link></div></div></Shell>;
}
