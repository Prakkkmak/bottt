import type { Booking, BookingStatus, GameSession, Membership, MyGuest, Participant, ParticipantRole, Profile } from './types';
import { MAX_GUESTS_PER_PERSON } from './session-rules';
import { activeBooking, dateLong } from './utils';

export const roleLabels: Record<ParticipantRole, string> = { member: 'membre', guest: 'invité·e', traveller: 'voyageur·se', traveller_guest: 'voyageur·se' };
export const membershipLabels: Record<Membership, string> = { organizer: 'Organisation', member: 'Membre', newcomer: 'Voyageur·se', suspended: 'Suspendu·e' };
export const guestStatusLabels: Record<BookingStatus, string> = { confirmed: 'place confirmée', pending: 'en attente de validation', waitlisted: 'en liste d’attente', offered: 'place proposée', declined: 'non retenu·e', cancelled: 'place libérée' };

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

/** Organizers, confirmed players and sponsors of a confirmed guest, who passes the address on. */
export function canSeeAddress(session: GameSession, profile: Pick<Profile, 'membership'> | null): boolean {
  if (!profile) return false;
  return profile.membership === 'organizer' || session.my_status === 'confirmed' || (session.my_guests ?? []).some(g => g.status === 'confirmed');
}

export type SeatPlan = {
  /** What a click on a free + does for this viewer. */
  onFreeSeat: 'signin' | 'book' | 'guest' | null;
  /** The waitlist button shown when no + suits this viewer. */
  waitlist: 'self' | 'guest' | null;
  /** The viewer already brings the maximum number of people. */
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
  // Seats are counted per kind until quotas merge: travellers and their friends only use traveller seats.
  const free = (profile.membership === 'newcomer' ? session.traveller_seats_free : session.member_seats_free) ?? total;
  const limitReached = activeGuests(session).length >= MAX_GUESTS_PER_PERSON;
  if (!activeBooking(session.my_status)) return { onFreeSeat: free > 0 ? 'book' : null, waitlist: free > 0 ? null : 'self', limitReached, canBringOther: !limitReached };
  if (limitReached) return { ...none, limitReached };
  return { ...none, onFreeSeat: free > 0 ? 'guest' : null, waitlist: free > 0 ? null : 'guest' };
}

/** Explains why the viewer lands on the waitlist although the circle still shows free tokens. */
export function waitlistHint(session: GameSession, traveller: boolean, now = Date.now()): string {
  const left = Math.max(0, session.capacity - session.confirmed_count);
  if (!left) return 'Le cercle est complet, mais une place se libère souvent.';
  const merge = Date.parse(session.starts_at) - session.release_hours * 3600000;
  const until = merge > now ? ` jusqu’au ${dateLong(new Date(merge).toISOString())}` : '';
  const rest = left > 1 ? `Les ${left} places restantes sont réservées` : 'La place restante est réservée';
  return `Les places ${traveller ? 'voyageurs' : 'membres'} sont prises. ${rest} aux ${traveller ? 'membres' : 'voyageurs'}${until}.`;
}

export type RequestGroup = { key: string; sessionId: string; personId: string; person?: Profile; own?: Booking; guests: Booking[] };

/** Pending requests grouped by session and by the account that made them. */
export function groupRequests(bookings: Booking[], profiles: Profile[]): RequestGroup[] {
  const groups = new Map<string, RequestGroup>();
  for (const b of bookings) {
    const personId = b.user_id ?? b.sponsor_id;
    if (b.status !== 'pending' || !personId) continue;
    const key = `${b.session_id}:${personId}`;
    const group = groups.get(key) ?? { key, sessionId: b.session_id, personId, person: profiles.find(p => p.id === personId), guests: [] };
    if (b.user_id) group.own = b; else group.guests.push(b);
    groups.set(key, group);
  }
  return [...groups.values()];
}

/** What an organizer card says under the name: the person's own request, or why only their friends are waiting. */
export function requestNote(group: RequestGroup, attending: boolean): string {
  if (group.own) return group.person?.beginner ? 'Découvre le jeu' : 'Connaît déjà le jeu';
  return attending ? 'Déjà inscrit·e, amène quelqu’un' : 'Ne vient pas, amène quelqu’un';
}

/** Asks an organizer to confirm refusing a whole group, naming the friends and who gets the message. */
export function refusalText(group: RequestGroup): string {
  const names = group.guests.map(g => g.guest_name).join(' et ');
  const several = group.guests.length > 1;
  const person = group.person?.display_name;
  if (group.own) return `La demande de ${person ?? 'cette personne'} sera refusée${group.guests.length ? `, ainsi que ${several ? 'celles' : 'celle'} de ${names}` : ''}. Un message lui sera envoyé.`;
  return `${several ? `Les demandes pour ${names} seront refusées` : `La demande pour ${names} sera refusée`}. ${person ?? 'Cette personne'} sera prévenu·e.`;
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
