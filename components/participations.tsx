'use client';
import { useState } from 'react';
import Link from 'next/link';
import { CheckCheck, Ticket } from 'lucide-react';
import type { AppData } from '@/lib/types';
import { SessionCard } from './session-card';
import { SignInButton } from './auth';
import { activeBooking, shortDate, sessionUrl } from '@/lib/utils';
import { markNoticesRead } from '@/app/actions';
import { useAction, Feedback } from './action-feedback';

export function Participations({ data, addresses }: { data: AppData; addresses: Record<string, string> }) {
  const a = useAction();
  const [expanded, setExpanded] = useState(() => new Set<string>());
  const toggle = (id: string) => setExpanded(current => { const ids = new Set(current); if (ids.has(id)) ids.delete(id); else ids.add(id); return ids; });
  const mine = data.sessions.filter(s => activeBooking(s.my_status) && s.status === 'published' && new Date(s.ends_at) > new Date());
  const unread = data.notices.filter(n => !n.read_at).length;
  return <>
    <div className="page-heading"><h1>Mes parties</h1></div>
    {!data.profile ? <div className="empty-state"><Ticket size={35} /><h2>Ta place au village.</h2><p>Connecte-toi pour retrouver tes inscriptions.</p><SignInButton configured={data.configured} /></div> : <div className="my-games">
      {mine.length ? <div className="session-list">{mine.map(s => <SessionCard key={s.id} data={data} session={s} address={addresses[s.id] || null} expanded={expanded.has(s.id)} onToggle={() => toggle(s.id)} />)}</div> : <div className="empty-state"><Ticket size={35} /><h2>Le village t’attend.</h2><p>Tu n’as pas encore de partie à venir.</p><Link href="/" className="button primary">Choisir une partie</Link></div>}
      <details className="disclosure notices"><summary>Les nouvelles du cercle {unread > 0 && <span className="count-pill">{unread} non lue{unread > 1 ? 's' : ''}</span>}</summary><div>
        {unread > 0 && <button className="button ghost compact" disabled={a.pending} onClick={() => a.run(markNoticesRead)}><CheckCheck size={17} />Tout marquer comme lu</button>}
        {data.notices.length ? data.notices.map(n => <article key={n.id} className={`notice ${n.read_at ? '' : 'unread'}`}><small>{shortDate(n.created_at)}</small><h3>{n.title}</h3><p>{n.body}</p>{n.session_id && <Link className="text-link" href={sessionUrl(n.session_id)}>Voir la partie</Link>}</article>) : <p className="muted">Les confirmations et les places proposées apparaîtront ici.</p>}
        <Feedback result={a.result} />
      </div></details>
    </div>}
  </>;
}
