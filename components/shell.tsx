import Link from 'next/link';
import type { AppData } from '@/lib/types';
import { Avatar } from './ui';
import { SignInButton } from './auth';
import { WebTools } from './webmcp';
import { TourTanguy } from './tableau';
import { Navigation } from './navigation';
import { CookieSettings } from './cookies';
import { NicknameStep } from './nickname';
import { ActivityBar } from './activity';
import { ViewerCheck } from './viewer';

/** Header and footer, rendered once by the root layout so they stay in place while a page loads. */
export function SiteFrame({ data, children }: { data: AppData; children: React.ReactNode }) {
  // While a new account chooses its pseudo (see Shell), the header offers nowhere else to go.
  const welcome = data.profile?.nickname_chosen === false;
  return <div className="app-shell">
    <ActivityBar />
    <a className="skip-link" href="#main-content">Aller au contenu</a>
    <header className="site-header">
      <Link href="/" className="brand" aria-label="Blood on the Tanguy Tower, accueil"><span className="brand-seal"><TourTanguy /></span><span>BOTTT<small>Blood on the Tanguy Tower</small></span></Link>
      {!welcome && <Navigation organizer={data.profile?.membership === 'organizer' || data.demo} />}
      <div className="header-account">{welcome ? null : data.profile ? <Link href="/profil" className="account-link" aria-label={`Mon profil : ${data.profile.display_name}`}><Avatar name={data.profile.display_name} color={data.profile.avatar_color} /><span>{data.profile.display_name}</span></Link> : <SignInButton configured={data.configured} className="button secondary compact" />}</div>
    </header>
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

/** What a page adds inside the frame: the notices of its own request and the browser tools for its sessions. */
export function Shell({ data, children }: { data: AppData; children: React.ReactNode }) {
  // A new account chooses its pseudo before anything else, then lands on the page it opened.
  // Until the migration adds the flag, it is undefined and nobody is held back.
  const welcome = data.profile?.nickname_chosen === false;
  return <>
    <ViewerCheck signedIn={!!data.profile} welcome={welcome} />
    <WebTools sessions={data.sessions} />
    {data.error && <div className="alert error site-error" role="alert">{data.error}</div>}
    {data.accountNotice && <div className="alert info site-error" role="status">{data.accountNotice}</div>}
    {welcome ? <NicknameStep /> : children}
  </>;
}
