import type { Booking, BookingStatus, Experience, GameSession, Membership, MyGuest, Participant, ParticipantRole, Profile } from './types';
import { MAX_TRAVELLER_GUESTS, MAX_WAITING_GUESTS, TRAVELLER_ADDRESS_HOURS } from './session-rules';
import { activeBooking } from './utils';

export const roleLabels: Record<ParticipantRole, string> = { member: 'membre', guest: 'invité·e', traveller: 'voyageur·se', traveller_guest: 'voyageur·se' };
export const membershipLabels: Record<Membership, string> = { organizer: 'Organisateur·rice', member: 'Membre', newcomer: 'Voyageur·se', suspended: 'Suspendu·e' };
export const experienceLabels: Record<Experience, string> = { beginner: 'Débutant·e', some: 'Quelques parties', experienced: 'Expérimenté·e' };
/** The declared level, read from the older beginner flag while the database has no experience column yet. */
export function experienceOf(p: Pick<Profile, 'beginner'> & { experience?: Experience }): Experience {
  return p.experience ?? (p.beginner ? 'beginner' : 'some');
}
// pending and offered only remain on games played before the single waiting list.
export const guestStatusLabels: Record<BookingStatus, string> = { confirmed: 'place confirmée', pending: 'en attente', waitlisted: 'en liste d’attente', offered: 'place proposée', declined: 'non retenu·e', cancelled: 'place libérée' };
/** « n° 2 sur la liste d’attente », or the plain status when the position is not known. */
export function waitingLabel(position?: number | null): string {
  return position ? `n° ${position} sur la liste d’attente` : guestStatusLabels.waitlisted;
}

const brought = (role?: ParticipantRole) => role === 'guest' || role === 'traveller_guest';

/** « membre », « voyageur·se », « invité·e de Léa », or « ton invité·e » for the viewer's own guests. */
export function participantLabel(p: Participant, { mine = false } = {}): string {
  const role = p.role ?? 'member';
  if (!brought(role)) return roleLabels[role];
  if (mine) return role === 'guest' ? 'ton invité·e' : 'ton ami·e';
  return p.invited_by ? `${roleLabels[role]} de ${p.invited_by}` : roleLabels[role];
}

/** Organizer view of a booking: « Membre », « Voyageur·se », « Invité·e de Léa »… */
export function bookingLabel(b: Booking, sponsorName: string): string {
  if (!b.user_id) return `${b.pool === 'circle' ? 'Invité·e' : 'Voyageur·se'} de ${sponsorName}`;
  return membershipLabels[b.profile?.membership ?? 'member'];
}

export function activeGuests(session: GameSession): MyGuest[] {
  return (session.my_guests ?? []).filter(g => activeBooking(g.status));
}

/** Has a seat, for themselves or a guest they pass the address on to. */
export function hasSeat(session: GameSession): boolean {
  return session.my_status === 'confirmed' || (session.my_guests ?? []).some(g => g.status === 'confirmed');
}
/** Organizers, then members with a seat; travellers with a seat once the game is close, like public.addresses_read. */
export function canSeeAddress(session: GameSession, profile: Pick<Profile, 'membership'> | null, now = Date.now()): boolean {
  if (!profile) return false;
  if (profile.membership === 'organizer') return true;
  if (!hasSeat(session)) return false;
  return profile.membership !== 'newcomer' || Date.parse(session.starts_at) <= now + TRAVELLER_ADDRESS_HOURS * 3600000;
}

export type SeatPlan = {
  /** What a click on a free + does for this viewer. */
  onFreeSeat: 'signin' | 'book' | 'guest' | null;
  /** The waitlist button shown when the circle is full. */
  waitlist: 'self' | 'guest' | null;
  /** A traveller already brings 2 people, or a member already has 2 guests waiting for a full game. */
  limitReached: boolean;
  /** Bring someone without registering yourself. */
  canBringOther: boolean;
};

export function seatPlan(session: GameSession, profile: Pick<Profile, 'membership'> | null, now = Date.now()): SeatPlan {
  const none: SeatPlan = { onFreeSeat: null, waitlist: null, limitReached: false, canBringOther: false };
  if (session.status === 'cancelled' || Date.parse(session.starts_at) <= now + 30 * 60000) return none;
  const total = Math.max(0, session.capacity - session.confirmed_count);
  if (!profile) return { ...none, onFreeSeat: total > 0 ? 'signin' : null, waitlist: total > 0 ? null : 'self' };
  if (session.my_status === 'declined') return none;
  // One pool: every free token is open to everyone, members, travellers and the people they bring.
  const free = total;
  const guests = activeGuests(session);
  const limitReached = profile.membership === 'newcomer' ? guests.length >= MAX_TRAVELLER_GUESTS
    : free <= 0 && guests.filter(g => g.status === 'waitlisted' || g.status === 'offered').length >= MAX_WAITING_GUESTS;
  if (!activeBooking(session.my_status)) return { onFreeSeat: free > 0 ? 'book' : null, waitlist: free > 0 ? null : 'self', limitReached, canBringOther: !limitReached };
  if (limitReached) return { ...none, limitReached };
  return { ...none, onFreeSeat: free > 0 ? 'guest' : null, waitlist: free > 0 ? null : 'guest' };
}

/** What the waiting list means, shown when the circle is full. */
export function waitlistHint(session: GameSession): string {
  const waiting = session.waitlist_count > 0 ? ` ${session.waitlist_count} ${session.waitlist_count > 1 ? 'personnes attendent' : 'personne attend'} déjà.` : '';
  return `Le cercle est complet.${waiting} Si une place se libère jusqu’à 30 minutes avant le début, elle revient à la première personne de la liste, sans autre démarche, et un e-mail la prévient.`;
}

/** Place of each waitlisted booking in its game's queue, in arrival order like public.waitlist_position. */
export function waitlistPositions(bookings: Booking[]): Map<string, number> {
  const queues = new Map<string, Booking[]>();
  for (const b of bookings) if (b.status === 'waitlisted') queues.set(b.session_id, [...(queues.get(b.session_id) ?? []), b]);
  const positions = new Map<string, number>();
  // Same order as the database: arrival time, then id. Times are compared as text, in the UTC form PostgREST returns,
  // to keep the microseconds a Date drops; the lower-case id sorts like the uuid itself.
  const before = (x: Booking, y: Booking) => x.created_at < y.created_at || (x.created_at === y.created_at && x.id < y.id);
  for (const queue of queues.values()) queue.sort((x, y) => before(x, y) ? -1 : 1).forEach((b, i) => positions.set(b.id, i + 1));
  return positions;
}

/** Each account's booking followed by the people it brings; guests of absent sponsors come last. */
export function orderBySponsor(bookings: Booking[]): Booking[] {
  const people = bookings.filter(b => b.user_id);
  const guests = bookings.filter(b => !b.user_id);
  const present = new Set(people.map(b => b.user_id));
  return [...people.flatMap(b => [b, ...guests.filter(g => g.sponsor_id === b.user_id)]), ...guests.filter(g => !present.has(g.sponsor_id))];
}

/** Names the viewer brought recently, newest first, without anyone already listed for this game, refused ones included. */
export function recentGuestNames(sessions: GameSession[], current: GameSession, limit = 5): string[] {
  const seen = new Set((current.my_guests ?? []).map(g => g.name.toLocaleLowerCase('fr')));
  const names: string[] = [];
  for (const s of [...sessions].sort((x, y) => Date.parse(y.starts_at) - Date.parse(x.starts_at))) {
    for (const g of s.my_guests ?? []) {
      const key = g.name.toLocaleLowerCase('fr');
      if (g.name === 'Invité·e' || seen.has(key)) continue;
      seen.add(key);
      names.push(g.name);
    }
  }
  return names.slice(0, limit);
}
