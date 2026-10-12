import Link from 'next/link';
import { Clock3 } from 'lucide-react';
import { getData } from '@/lib/data';
import { Shell } from '@/components/shell';
import { SignInButton } from '@/components/auth';
export default async function NotFound() {
  const data = await getData();
  return <Shell data={data}><div className="centered-panel panel"><Clock3 size={35} /><h1>Le village est ailleurs.</h1><p>{data.profile ? 'Cette page n’existe pas ou cette session n’est plus disponible.' : 'Cette page n’existe pas ou cette session est réservée aux membres. Connecte-toi pour retrouver tes soirées.'}</p><Link href="/" className="button primary">Revenir aux sessions</Link>{!data.profile && <SignInButton label="Me connecter" className="button secondary" configured={data.configured} />}</div></Shell>;
}
