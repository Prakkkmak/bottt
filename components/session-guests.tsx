'use client';
import type { Ref } from 'react';
import { Plus, UserPlus } from 'lucide-react';
import type { ActionResult, GameSession, MyGuest } from '@/lib/types';
import { activeGuests, guestStatusLabels, waitingLabel } from '@/lib/guests';
import { Feedback } from './action-feedback';
import { Avatar } from './ui';

/** In « Ta venue »: the people the viewer brings to this session, the one button to bring someone else, and the answer to the last change. */
export function SessionGuests({ ref, session, limit, hint, busy, result = null, onAdd, onRemove }: { ref?: Ref<HTMLDivElement>; session: GameSession; limit?: number; hint: string; busy: boolean; result?: ActionResult | null; onAdd?: () => void; onRemove: (guest: MyGuest) => void }) {
  const guests = (session.my_guests ?? []).filter(g => g.status !== 'cancelled');
  return <div ref={ref} className="venue-group" role="group" aria-label="Les personnes que tu amènes">
    <div className="venue-row">
      <span className="venue-icon" aria-hidden="true"><UserPlus size={15} /></span>
      <span className="venue-copy"><strong>Tes invités <span>· {activeGuests(session).length}{limit !== undefined && ` sur ${limit}`}</span></strong>{hint && <small>{hint}</small>}</span>
      {onAdd && <button type="button" className="button secondary compact venue-add" disabled={busy} onClick={onAdd}><Plus size={15} aria-hidden="true" />Inviter</button>}
    </div>
    {guests.map(g => <div className="venue-guest" key={g.id}>
      {/* Seated, a guest wears the colour the circle gives them. */}
      <Avatar name={g.name} color={session.participants.find(p => g.seat_index != null && p.seat_index === g.seat_index)?.avatar_color} small />
      <span>{g.name} <small className={`guest-status guest-status-${g.status}`}>· {g.status === 'waitlisted' ? waitingLabel(g.waitlist_position) : guestStatusLabels[g.status]}</small></span>
      {g.status !== 'declined' && <button type="button" className="venue-link" disabled={busy} aria-label={`Retirer ${g.name}`} onClick={() => onRemove(g)}>Retirer</button>}
    </div>)}
    <Feedback result={result} />
  </div>;
}
