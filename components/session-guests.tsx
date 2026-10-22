'use client';
import { UserPlus } from 'lucide-react';
import type { GameSession, MyGuest } from '@/lib/types';
import { activeGuests, guestStatusLabels, waitingLabel } from '@/lib/guests';

/** The people the viewer brings to this session, and what they can still do for each of them. */
export function SessionGuests({ session, limit, hint, busy, onAdd, onRemove }: { session: GameSession; limit?: number; hint: string; busy: boolean; onAdd?: () => void; onRemove: (guest: MyGuest) => void }) {
  const guests = (session.my_guests ?? []).filter(g => g.status !== 'cancelled');
  return <section className="my-guests" aria-label="Les personnes que tu amènes">
    <div className="my-guests-heading">
      <p>Tes invités <span>· {activeGuests(session).length}{limit !== undefined && ` sur ${limit}`}</span></p>
      {onAdd && <button type="button" className="button secondary compact" disabled={busy} onClick={onAdd}><UserPlus size={15} />Ajouter</button>}
    </div>
    {hint && <p className="my-guests-hint">{hint}</p>}
    {guests.map(g => <div className="my-guest-row" key={g.id}>
      <span>{g.name} <small className={`guest-status guest-status-${g.status}`}>· {g.status === 'waitlisted' ? waitingLabel(g.waitlist_position) : guestStatusLabels[g.status]}</small></span>
      <span className="row-actions">
        {g.status !== 'declined' && <button type="button" className="button ghost compact" disabled={busy} aria-label={`Retirer ${g.name}`} onClick={() => onRemove(g)}>Retirer</button>}
      </span>
    </div>)}
  </section>;
}
