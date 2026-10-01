import Link from 'next/link';
import type { AppData } from '@/lib/types';
import { Avatar } from './ui';
import { SignInButton } from './auth';
import { WebTools } from './webmcp';
import { TourTanguy } from './tableau';
import { Navigation } from './navigation';
import { CookieSettings } from './cookies';

export function Shell({ data, children }: { data: AppData; children: React.ReactNode }) {
  return <div className="app-shell">
    <WebTools sessions={data.sessions} />
    <a className="skip-link" href="#main-content">Aller au contenu</a>
    <header className="site-header">
      <Link href="/" className="brand" aria-label="Blood on the Tanguy Tower, accueil"><span className="brand-seal"><TourTanguy /></span><span>BOTTT<small>Blood on the Tanguy Tower</small></span></Link>
      <Navigation organizer={data.profile?.membership === 'organizer' || data.demo} />
      <div className="header-account">{data.profile ? <Link href="/profil" className="account-link" aria-label={`Mon profil : ${data.profile.display_name}`}><Avatar name={data.profile.display_name} color={data.profile.avatar_color} /><span>{data.profile.display_name}</span></Link> : <SignInButton configured={data.configured} className="button secondary compact" />}</div>
    </header>
    {data.error && <div className="alert error site-error" role="alert">{data.error}</div>}
    <main id="main-content" className="main-content">{children}</main>
    <footer className="footer">
      <div className="footer-about">
        <h2>Blood on the Tanguy Tower</h2>
        <p>Nous sommes un groupe de joueurs de Blood on the Clocktower à Brest. Tout le monde est le bienvenu, débutants comme habitués. L’essentiel, c’est d’être sympa, de respecter les autres et de passer une bonne session ensemble.</p>
      </div>
      <nav className="footer-links" aria-label="Informations légales"><Link href="/conditions">Conditions d’utilisation</Link><Link href="/confidentialite">Données personnelles</Link><Link href="/cookies">Cookies</Link><CookieSettings /></nav>
    </footer>
  </div>;
}
