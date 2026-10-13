'use client';
import { Check, UserPlus } from 'lucide-react';
import type { GameSession, MyGuest } from '@/lib/types';
import { MAX_GUESTS_PER_PERSON } from '@/lib/session-rules';
import { activeGuests, guestStatusLabels } from '@/lib/guests';
import { dateLong, time } from '@/lib/utils';

/** The people the viewer brings to this session, and what they can still do for each of them. */
export function SessionGuests({ session, hint, busy, onAdd, onRemove, onConfirm }: { session: GameSession; hint: string; busy: boolean; onAdd?: () => void; onRemove: (guest: MyGuest) => void; onConfirm: (guest: MyGuest) => void }) {
  const guests = (session.my_guests ?? []).filter(g => g.status !== 'cancelled');
  return <section className="my-guests" aria-label="Les personnes que tu amènes">
    <div className="my-guests-heading">
      <p>Tes invités <span>· {activeGuests(session).length} sur {MAX_GUESTS_PER_PERSON}</span></p>
      {onAdd && <button type="button" className="button secondary compact" disabled={busy} onClick={onAdd}><UserPlus size={15} />Ajouter</button>}
    </div>
    {hint && <p className="my-guests-hint">{hint}</p>}
    {guests.map(g => {
      // An offer the server has not swept yet is already refused by accept_guest_offer, so it cannot be confirmed.
      const live = g.status === 'offered' && !!g.offer_expires_at && Date.parse(g.offer_expires_at) > Date.now();
      return <div className="my-guest-row" key={g.id}>
        <span>{g.name} <small className={`guest-status guest-status-${g.status}`}>· {g.status === 'offered' && !live ? 'proposition expirée' : guestStatusLabels[g.status]}{live && g.offer_expires_at ? ` jusqu’au ${dateLong(g.offer_expires_at)} à ${time(g.offer_expires_at)}` : ''}</small></span>
        <span className="row-actions">
          {live && <button type="button" className="button quiet compact" disabled={busy} onClick={() => onConfirm(g)}><Check size={15} />Confirmer pour {g.name}</button>}
          {g.status !== 'declined' && <button type="button" className="button ghost compact" disabled={busy} onClick={() => onRemove(g)}>Retirer</button>}
        </span>
      </div>;
    })}
  </section>;
}
