'use client';
import Link from 'next/link';
import { SignInButton } from './auth';
import { useViewer } from './viewer';

export function NotFoundNote() {
  const { signedIn, configured } = useViewer();
  return <><p>{signedIn ? 'Cette page n’existe pas ou cette session n’est plus disponible.' : 'Cette page n’existe pas ou cette session est réservée aux membres. Connecte-toi pour retrouver tes soirées.'}</p><Link href="/" className="button primary">Revenir aux sessions</Link>{!signedIn && <SignInButton label="Me connecter" className="button secondary" configured={configured} />}</>;
}
