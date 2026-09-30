'use client';
import { useId } from 'react';
import { Clock3, Check, ChevronDown, Moon, Flame, Flower2, LockKeyhole, UsersRound, BellRing, X } from 'lucide-react';
import type { AppData, GameSession } from '@/lib/types';
import { time, statusLabels, activeBooking } from '@/lib/utils';
import { SessionDetail } from './session-detail';

export function SessionCard({ data, session: s, address, expanded, onToggle, featured = false }: {
  data: AppData; session: GameSession; address: string | null;
  expanded: boolean; onToggle: () => void; featured?: boolean;
}) {
  const id = useId();
  const free = Math.max(0, s.capacity - s.confirmed_count);
  const active = activeBooking(s.my_status);
  const cancelled = s.status === 'cancelled';
  const Icon = s.script === 'Bad Moon Rising' ? Moon : s.script === 'Sects & Violets' ? Flower2 : Flame;
  const state = cancelled ? 'Annulée' : active && s.my_status ? statusLabels[s.my_status] : free > 0 ? `${free} place${free > 1 ? 's' : ''} libre${free > 1 ? 's' : ''}` : 'Liste d’attente';
  const stateType = cancelled ? 'cancelled' : active && s.my_status ? s.my_status : free ? 'available' : 'waitlisted';
  const StateIcon = cancelled ? X : s.my_status === 'confirmed' ? Check : s.my_status === 'offered' ? BellRing : stateType === 'pending' || stateType === 'waitlisted' ? Clock3 : UsersRound;
  const date = new Date(s.starts_at);
  return <article id={`partie-${s.id}`} data-script={s.script} className={`session-accordion ${expanded ? 'is-expanded' : ''} ${featured ? 'is-next' : ''} ${cancelled ? 'is-cancelled' : ''}`}>
    <h2 className="session-summary">
      <button type="button" className="session-row session-toggle" id={`${id}-summary`} aria-expanded={expanded} aria-controls={`${id}-panel`} aria-label={`${expanded ? 'Replier' : 'Déplier'} la partie ${s.title} · ${s.confirmed_count} places réservées sur ${s.capacity} · ${state}`} onClick={onToggle}>
        <span className="date-tile"><strong>{new Intl.DateTimeFormat('fr-FR', { day: '2-digit', timeZone: 'Europe/Paris' }).format(date)}</strong><span>{new Intl.DateTimeFormat('fr-FR', { month: 'short', timeZone: 'Europe/Paris' }).format(date)}</span></span>
        <span className="session-row-copy">
          {featured && <span className="next-label"><span />La prochaine partie</span>}
          <span className="session-title">{s.title}</span>
          <span className="row-meta"><span className="row-script"><Icon size={14} />{s.script}</span><span><Clock3 size={13} />{time(s.starts_at)}</span><span className="row-seats"><UsersRound size={14} aria-hidden="true" />{s.confirmed_count} / {s.capacity}<span className="sr-only"> places réservées</span></span>{s.visibility === 'members' && <LockKeyhole size={13} aria-label="Membres et invités" />}</span>
        </span>
        <span className={`row-state row-state-${stateType}`}><StateIcon size={15} aria-hidden="true" />{state}</span>
        <ChevronDown className="session-chevron" size={20} aria-hidden="true" />
      </button>
    </h2>
    <div id={`${id}-panel`} role="region" aria-labelledby={`${id}-summary`} hidden={!expanded} className="session-accordion-body">
      {expanded && <SessionDetail data={data} session={s} address={address} embedded />}
    </div>
  </article>;
}
