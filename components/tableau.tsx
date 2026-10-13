import type { CSSProperties } from 'react';
import { BookOpen, Link2 } from 'lucide-react';
import type { MyGuest, Participant } from '@/lib/types';
import { initials } from '@/lib/utils';
import { participantLabel } from '@/lib/guests';

/** Original vector interpretation of the Tour Tanguy in Brest. */
export function TourTanguy({ ornate = false }: { ornate?: boolean }) {
  return <svg viewBox="0 0 120 160" fill="none" aria-hidden="true" className="tower-mark">
    {ornate && <circle cx="60" cy="71" r="49" stroke="currentColor" strokeWidth=".8" opacity=".2" />}
    <use href="/logo-tour-tanguy.svg#tour-tanguy" />
  </svg>;
}

type CircleProps = {
  reserved: number; capacity: number; occupiedSeats?: number[];
  participants?: Participant[]; mySeat?: number | null;
  interactive?: boolean; onChoose?: (seat: number) => void; chooseLabel?: string;
  onOwnSeat?: () => void; ownSeatLabel?: string; busy?: boolean;
  ownGuests?: MyGuest[]; onOwnGuest?: (guest: MyGuest) => void;
};

export function VillageCircle({ reserved, capacity, occupiedSeats, participants = [], mySeat, interactive = false, onChoose, chooseLabel = 'Prendre la place', onOwnSeat, ownSeatLabel = 'Ta place', busy = false, ownGuests = [], onOwnGuest }: CircleProps) {
  const occupied = new Set(occupiedSeats ?? Array.from({ length: reserved }, (_, i) => i));
  return <div className={`village-circle ${interactive ? 'booking-circle' : ''} ${capacity > 14 ? 'dense-circle' : ''}`} role={interactive ? 'group' : 'img'} aria-busy={busy || undefined} aria-label={`${reserved} places réservées sur ${capacity}`}>
    <div className="village-orbit" />
    <div className="village-center"><TourTanguy ornate /><span>{reserved}<i> / {capacity}</i></span></div>
    {Array.from({ length: capacity }, (_, i) => {
      const angle = (i / capacity) * Math.PI * 2 - Math.PI / 2;
      const style = { left: `${(50 + 43 * Math.cos(angle)).toFixed(3)}%`, top: `${(50 + 43 * Math.sin(angle)).toFixed(3)}%` } as CSSProperties;
      const taken = occupied.has(i);
      const own = mySeat === i && taken;
      // The viewer's own guests stay actionable, even while an offer is not yet confirmed.
      const guest = taken && !own ? ownGuests.find(g => g.seat_index === i && (g.status === 'confirmed' || g.status === 'offered')) : undefined;
      const person = participants.find(p => p.seat_index === i);
      const name = own ? 'Toi' : guest?.name ?? person?.display_name;
      const brought = !!guest || person?.role === 'guest' || person?.role === 'traveller_guest';
      const traveller = !own && (person?.role === 'traveller' || person?.role === 'traveller_guest');
      const willing = taken && person?.can_storytell;
      const detail = guest ? guest.status === 'offered' ? 'place proposée · confirmer' : `${person ? participantLabel(person, { mine: true }) : 'ton invité·e'} · retirer` : person && !own ? participantLabel(person) : '';
      const seatLabel = own ? ownSeatLabel : taken ? [`Place ${i + 1}`, name || 'Réservée', detail].filter(Boolean).join(' · ') : onChoose ? `${chooseLabel} ${i + 1}` : `Place ${i + 1} · Libre`;
      const label = `${seatLabel}${willing ? ' · Volontaire MJ' : ''}`;
      const content = <>{taken ? name ? <span className="token-initials">{own ? 'Toi' : initials(name)}</span> : <span className="token-person" /> : <span aria-hidden="true">+</span>}{willing && <span className="token-storyteller" aria-hidden="true"><BookOpen size={12} /></span>}{brought && <span className="token-guest" aria-hidden="true"><Link2 size={11} /></span>}{interactive && name && <span className="token-name">{name}</span>}</>;
      const className = `village-token ${taken ? 'taken' : 'empty'} ${own ? 'is-mine' : ''} ${traveller ? 'is-traveller' : ''} ${guest ? 'is-my-guest' : ''}`;
      if (interactive && ((!taken && onChoose) || (own && onOwnSeat) || (guest && onOwnGuest))) return <button type="button" key={i} className={className} style={style} aria-label={label} title={label} disabled={busy} onClick={() => own ? onOwnSeat?.() : guest ? onOwnGuest?.(guest) : onChoose?.(i)}>{content}</button>;
      return <span className={className} key={i} style={style} aria-hidden={!interactive || undefined} aria-label={interactive ? label : undefined} title={interactive ? label : undefined}>{content}</span>;
    })}
  </div>;
}
