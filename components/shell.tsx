'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CalendarDays, Ticket, UserPlus, BookOpen } from 'lucide-react';
import type { AppData } from '@/lib/types';
import { Avatar } from './ui';
import { SignInButton } from './auth';
import { WebTools } from './webmcp';
import { TourTanguy } from './tableau';

export function Shell({ data, children }: { data: AppData; children: React.ReactNode }) {
  const path = usePathname();
  const count = data.sessions.filter(s => ['confirmed', 'offered'].includes(s.my_status || '') && s.status === 'published' && new Date(s.ends_at) > new Date()).length;
  const links = [
    { href: '/', label: 'Jouer', icon: CalendarDays },
    { href: '/mes-parties', label: 'Mes parties', icon: Ticket },
    { href: '/invitations', label: 'Inviter', icon: UserPlus },
    ...(data.profile?.membership === 'organizer' || data.demo ? [{ href: '/organiser', label: 'Organiser', icon: BookOpen }] : []),
  ];
  return <div className="app-shell">
    <WebTools sessions={data.sessions} />
    <a className="skip-link" href="#main-content">Aller au contenu</a>
    <header className="site-header">
      <Link href="/" className="brand" aria-label="Blood on Breizh, accueil"><span className="brand-seal"><TourTanguy /></span><span>Blood on Breizh<small>Blood on the Clocktower à Brest</small></span></Link>
      <nav className="main-nav" aria-label="Navigation principale">{links.map(({ href, label, icon: Icon }) => {
        const selected = path === href || (href === '/' && path.startsWith('/sessions'));
        return <Link key={href} href={href} className={selected ? 'active' : ''} aria-current={selected ? 'page' : undefined}><Icon size={17} /><span>{label}</span>{href === '/mes-parties' && count > 0 && <span className="nav-count">{count}</span>}</Link>;
      })}</nav>
      <div className="header-account">{data.profile ? <Link href="/profil" className="account-link" aria-label={`Mon profil : ${data.profile.display_name}`}><Avatar name={data.profile.display_name} color={data.profile.avatar_color} /><span>{data.profile.display_name}</span></Link> : <SignInButton configured={data.configured} className="button secondary compact" />}</div>
    </header>
    {data.error && <div className="alert error site-error" role="alert">{data.error}</div>}
    <main id="main-content" className="main-content">{children}</main>
    <footer className="footer"><span>Blood on Breizh · Communauté indépendante à Brest.</span>{data.local ? <a href="http://127.0.0.1:54324" target="_blank" rel="noreferrer">Test local · boîte mail</a> : data.demo ? <span>Données de démonstration</span> : <Link href="/invitations">Inviter un ami</Link>}</footer>
  </div>;
}
