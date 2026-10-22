'use client';
import type { Ref } from 'react';
import { UserPlus } from 'lucide-react';
import type { ActionResult, GameSession, MyGuest } from '@/lib/types';
import { activeGuests, guestStatusLabels, waitingLabel } from '@/lib/guests';
import { Feedback } from './action-feedback';

/** The people the viewer brings to this session, the one button to bring someone else, and the answer to the last change. */
export function SessionGuests({ ref, session, limit, hint, busy, result = null, onAdd, onRemove }: { ref?: Ref<HTMLElement>; session: GameSession; limit?: number; hint: string; busy: boolean; result?: ActionResult | null; onAdd?: () => void; onRemove: (guest: MyGuest) => void }) {
  const guests = (session.my_guests ?? []).filter(g => g.status !== 'cancelled');
  return <section ref={ref} className="my-guests" aria-label="Les personnes que tu amènes">
    <div className="my-guests-heading">
      <p>Tes invités <span>· {activeGuests(session).length}{limit !== undefined && ` sur ${limit}`}</span></p>
      {onAdd && <button type="button" className="button secondary compact" disabled={busy} onClick={onAdd}><UserPlus size={15} />Inscrire quelqu’un d’autre</button>}
    </div>
    {hint && <p className="my-guests-hint">{hint}</p>}
    {guests.map(g => <div className="my-guest-row" key={g.id}>
      <span>{g.name} <small className={`guest-status guest-status-${g.status}`}>· {g.status === 'waitlisted' ? waitingLabel(g.waitlist_position) : guestStatusLabels[g.status]}</small></span>
      <span className="row-actions">
        {g.status !== 'declined' && <button type="button" className="button ghost compact" disabled={busy} aria-label={`Retirer ${g.name}`} onClick={() => onRemove(g)}>Retirer</button>}
      </span>
    </div>)}
    <Feedback result={result} />
  </section>;
}
