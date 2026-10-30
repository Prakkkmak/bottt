'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, Plus } from 'lucide-react';
import type { AppData } from '@/lib/types';
import { groupSessions } from '@/lib/series';
import { SessionCard } from './session-card';

/** titled: the page already has its main heading above the list, so the list's own heading steps down a level. */
export function Dashboard({ data, addresses, initialSessionId, titled = false }: { data: AppData; addresses: Record<string, string>; initialSessionId?: string; titled?: boolean }) {
  const [filter, setFilter] = useState('all');
  // The next game first, then the ones after it, then the past ones: a recurring game shows its next date on top.
  const { next, following, past } = groupSessions(data.sessions, initialSessionId);
  const [expanded, setExpanded] = useState(() => new Set([...(next ? [next.id] : []), ...(initialSessionId ? [initialSessionId] : [])]));
  // The loading screen comes first, so the browser could not jump to a linked session (#partie-…) on its own.
  useEffect(() => { if (initialSessionId && location.hash === `#partie-${initialSessionId}`) document.getElementById(`partie-${initialSessionId}`)?.scrollIntoView(); }, [initialSessionId]);
  const toggle = (id: string) => setExpanded(current => { const ids = new Set(current); if (ids.has(id)) ids.delete(id); else ids.add(id); return ids; });
  const Title = titled ? 'h2' : 'h1';
  const rest = following.filter(s => filter === 'all' || filter === 'available' && s.confirmed_count < s.capacity);
  return <div className="lobby">
    <div className="page-heading lobby-heading"><Title>La prochaine session</Title>{data.profile?.membership === 'organizer' && <Link href="/organiser?nouvelle=1" className="button secondary compact" aria-label="Créer une partie"><Plus size={17} />Créer une partie</Link>}</div>
    {next ? <SessionCard data={data} session={next} address={addresses[next.id] || null} expanded={expanded.has(next.id)} onToggle={() => toggle(next.id)} featured />
      : <div className="empty-state"><CalendarDays size={36} /><h2>Aucune session à venir.</h2><p>Les prochaines sessions apparaîtront ici.</p></div>}
    {following.length > 0 && <section className="upcoming-section" aria-label="Sessions suivantes">
      <div className="list-heading"><h2>Sessions suivantes</h2><label className="list-filter"><span className="sr-only">Filtrer les sessions suivantes</span><select value={filter} onChange={e => setFilter(e.target.value)}><option value="all">Toutes les sessions</option><option value="available">Places disponibles</option></select></label></div>
      <div className="session-list">{rest.map(s => <SessionCard key={s.id} data={data} session={s} address={addresses[s.id] || null} expanded={expanded.has(s.id)} onToggle={() => toggle(s.id)} />)}</div>
      {!rest.length && <div className="empty-state compact-empty"><p>Aucune autre session ne correspond à ce filtre.</p><button className="button secondary" onClick={() => setFilter('all')}>Voir toutes les sessions</button></div>}
    </section>}
    {past.length > 0 && <section className="upcoming-section past-section" aria-label="Sessions passées">
      <div className="list-heading"><h2>Sessions passées</h2></div>
      <div className="session-list">{past.map(s => <SessionCard key={s.id} data={data} session={s} address={addresses[s.id] || null} expanded={expanded.has(s.id)} onToggle={() => toggle(s.id)} past />)}</div>
    </section>}
  </div>;
}
