import Link from 'next/link';
import { Shell } from '@/components/shell';
import type { AppData } from '@/lib/types';

const publicData: AppData = { profile: null, sessions: [], invitations: [], notices: [], demo: false, configured: true };

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return <Shell data={publicData}><article className="legal-page"><Link href="/" className="back-link">← Revenir aux parties</Link>{children}<p className="legal-updated">Mise à jour : 1er octobre 2026.</p></article></Shell>;
}
