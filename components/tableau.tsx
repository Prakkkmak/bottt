import type { CSSProperties } from 'react';
import { BookOpen } from 'lucide-react';
import type { GameSession } from '@/lib/types';
import { initials } from '@/lib/utils';

/** Original vector interpretation of the Tour Tanguy in Brest. */
export function TourTanguy({ ornate = false }: { ornate?: boolean }) {
  return <svg viewBox="0 0 120 160" fill="none" aria-hidden="true" className="tower-mark">
    {ornate && <circle cx="60" cy="71" r="49" stroke="currentColor" strokeWidth=".8" opacity=".2" />}
    <use href="/logo-tour-tanguy.svg#tour-tanguy" />
  </svg>;
}

type CircleProps = {
  reserved: number; capacity: number; occupiedSeats?: number[];
  participants?: GameSession['participants']; mySeat?: number | null;
  interactive?: boolean; onChoose?: (seat: number) => void;
  onOwnSeat?: () => void; ownSeatLabel?: string; busy?: boolean;
};

export function VillageCircle({ reserved, capacity, occupiedSeats, participants = [], mySeat, interactive = false, onChoose, onOwnSeat, ownSeatLabel = 'Ta place', busy = false }: CircleProps) {
  const occupied = new Set(occupiedSeats ?? Array.from({ length: reserved }, (_, i) => i));
  return <div className={`village-circle ${interactive ? 'booking-circle' : ''} ${capacity > 14 ? 'dense-circle' : ''}`} role={interactive ? 'group' : 'img'} aria-busy={busy || undefined} aria-label={`${reserved} places réservées sur ${capacity}`}>
    <div className="village-orbit" />
    <div className="village-center"><TourTanguy ornate /><span>{reserved}<i> / {capacity}</i></span></div>
    {Array.from({ length: capacity }, (_, i) => {
      const angle = (i / capacity) * Math.PI * 2 - Math.PI / 2;
      const style = { left: `${(50 + 43 * Math.cos(angle)).toFixed(3)}%`, top: `${(50 + 43 * Math.sin(angle)).toFixed(3)}%` } as CSSProperties;
      const taken = occupied.has(i);
      const own = mySeat === i && taken;
      const person = participants.find(p => p.seat_index === i);
      const name = own ? 'Toi' : person?.display_name;
      const willing = taken && person?.can_storytell;
      const seatLabel = own ? ownSeatLabel : taken ? `Place ${i + 1} · ${name || 'Réservée'}` : onChoose ? `Prendre la place ${i + 1}` : `Place ${i + 1} · Libre`;
      const label = `${seatLabel}${willing ? ' · Volontaire MJ' : ''}`;
      const content = <>{taken ? name ? <span className="token-initials">{own ? 'Toi' : initials(name)}</span> : <span className="token-person" /> : <span aria-hidden="true">+</span>}{willing && <span className="token-storyteller" aria-hidden="true"><BookOpen size={12} /></span>}{interactive && name && <span className="token-name">{name}</span>}</>;
      const className = `village-token ${taken ? 'taken' : 'empty'} ${own ? 'is-mine' : ''}`;
      if (interactive && ((!taken && onChoose) || (own && onOwnSeat))) return <button type="button" key={i} className={className} style={style} aria-label={label} title={label} disabled={busy} onClick={() => own ? onOwnSeat?.() : onChoose?.(i)}>{content}</button>;
      return <span className={className} key={i} style={style} aria-hidden={!interactive || undefined} aria-label={interactive ? label : undefined} title={interactive ? label : undefined}>{content}</span>;
    })}
  </div>;
}
