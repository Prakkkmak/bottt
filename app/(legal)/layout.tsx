import Link from 'next/link';

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return <article className="legal-page"><Link href="/" className="back-link">← Revenir aux parties</Link>{children}<p className="legal-updated">Mise à jour : 22 octobre 2026.</p></article>;
}
