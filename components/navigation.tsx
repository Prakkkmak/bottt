'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CalendarDays, UserPlus, BookOpen } from 'lucide-react';

export function Navigation({ organizer }: { organizer: boolean }) {
  const path = usePathname();
  const links = [
    { href: '/', label: 'Jouer', icon: CalendarDays },
    { href: '/invitations', label: 'Inviter', icon: UserPlus },
    ...(organizer ? [{ href: '/organiser', label: 'Organiser', icon: BookOpen }] : []),
  ];
  return <nav className="main-nav" aria-label="Navigation principale">{links.map(({ href, label, icon: Icon }) => {
    const selected = path === href || (href === '/' && path.startsWith('/sessions'));
    return <Link key={href} href={href} className={selected ? 'active' : ''} aria-current={selected ? 'page' : undefined}><Icon size={17} /><span>{label}</span></Link>;
  })}</nav>;
}
