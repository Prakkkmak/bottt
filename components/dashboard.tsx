'use client';
import { useState } from 'react';
import Link from 'next/link';
import { CalendarDays, Plus, BellRing } from 'lucide-react';
import type { AppData } from '@/lib/types';
import { SessionCard } from './session-card';

export function Dashboard({ data, addresses, initialSessionId }: { data: AppData; addresses: Record<string, string>; initialSessionId?: string }) {
  const [filter, setFilter] = useState('all');
  const upcoming = data.sessions.filter(s => s.id === initialSessionId || new Date(s.ends_at) > new Date() && s.status === 'published').sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  const next = upcoming[0];
  const [expanded, setExpanded] = useState(() => new Set([...(next ? [next.id] : []), ...(initialSessionId ? [initialSessionId] : [])]));
  const toggle = (id: string) => setExpanded(current => { const ids = new Set(current); if (ids.has(id)) ids.delete(id); else ids.add(id); return ids; });
  const rest = upcoming.slice(1).filter(s => filter === 'all' || filter === 'available' && s.confirmed_count < s.capacity);
  const offer = upcoming.find(s => s.my_status === 'offered');
  return <div className="lobby">
    <div className="page-heading lobby-heading"><h1>La prochaine session</h1>{data.profile?.membership === 'organizer' && <Link href="/organiser?nouvelle=1" className="button secondary compact" aria-label="Créer une partie"><Plus size={17} />Créer une partie</Link>}</div>
    {offer && <a className="offer-banner" href={`#partie-${offer.id}`} onClick={() => { setFilter('all'); setExpanded(current => new Set([...current, offer.id])); }}><BellRing size={18} /><span>Une place t’attend pour <strong>{offer.title}</strong>.</span><span>Confirmer</span></a>}
    {next ? <>
      <SessionCard data={data} session={next} address={addresses[next.id] || null} expanded={expanded.has(next.id)} onToggle={() => toggle(next.id)} featured />
      {upcoming.length > 1 && <section className="upcoming-section" aria-label="Sessions suivantes">
        <div className="list-heading"><h2>Sessions suivantes</h2><label className="list-filter"><span className="sr-only">Filtrer les sessions suivantes</span><select value={filter} onChange={e => setFilter(e.target.value)}><option value="all">Toutes les sessions</option><option value="available">Places disponibles</option></select></label></div>
        <div className="session-list">{rest.map(s => <SessionCard key={s.id} data={data} session={s} address={addresses[s.id] || null} expanded={expanded.has(s.id)} onToggle={() => toggle(s.id)} />)}</div>
        {!rest.length && <div className="empty-state compact-empty"><p>Aucune autre session ne correspond à ce filtre.</p><button className="button secondary" onClick={() => setFilter('all')}>Voir toutes les sessions</button></div>}
      </section>}
    </> : <div className="empty-state"><CalendarDays size={36} /><h2>Aucune session à venir.</h2><p>Les prochaines sessions apparaîtront ici.</p></div>}
  </div>;
}
