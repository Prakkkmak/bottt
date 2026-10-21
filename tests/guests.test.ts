import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Booking, GameSession, MyGuest, Profile } from '../lib/types';
import { bookingLabel, canSeeAddress, experienceOf, groupRequests, orderBySponsor, participantLabel, recentGuestNames, refusalText, requestNote, seatPlan, waitlistHint, type RequestGroup } from '../lib/guests';

const now = Date.parse('2026-10-12T10:00:00Z');
const session = (changes: Partial<GameSession> = {}): GameSession => ({ id: 's1', title: 'Soirée', script: 'Trouble Brewing', starts_at: '2026-10-20T17:30:00Z', ends_at: '2026-10-20T21:30:00Z', location: 'Brest', capacity: 8, newcomer_seats: 2, release_hours: 72, beginners_welcome: true, visibility: 'public', status: 'published', confirmed_count: 3, waitlist_count: 0, my_status: null, participants: [], member_seats_free: 3, traveller_seats_free: 2, my_guests: [], ...changes });
const guest = (name: string, status: MyGuest['status'] = 'confirmed', seat_index: number | null = 1): MyGuest => ({ id: `g-${name}`, name, status, seat_index, offer_expires_at: null });
const member = { membership: 'member' as const };
const traveller = { membership: 'newcomer' as const };
const none = { onFreeSeat: null, waitlist: null, limitReached: false, canBringOther: false };

test('libellés des quatre statuts', () => {
  assert.equal(participantLabel({ display_name: 'Léa', avatar_color: 'rose', role: 'member' }), 'membre');
  assert.equal(participantLabel({ display_name: 'Paul', avatar_color: 'rose', role: 'guest', invited_by: 'Léa' }), 'invité·e de Léa');
  assert.equal(participantLabel({ display_name: 'Marc', avatar_color: 'sage', role: 'traveller' }), 'voyageur·se');
  assert.equal(participantLabel({ display_name: 'Julie', avatar_color: 'sage', role: 'traveller_guest', invited_by: 'Marc' }), 'voyageur·se de Marc');
  assert.equal(participantLabel({ display_name: 'Paul', avatar_color: 'rose', role: 'guest', invited_by: 'Léa' }, { mine: true }), 'ton invité·e');
  assert.equal(participantLabel({ display_name: 'Julie', avatar_color: 'sage', role: 'traveller_guest', invited_by: 'Marc' }, { mine: true }), 'ton ami·e');
  assert.equal(participantLabel({ display_name: 'Ancien', avatar_color: 'rose' }), 'membre');
});

test('ce que fait un + selon la personne', () => {
  assert.deepEqual(seatPlan(session(), null, now), { ...none, onFreeSeat: 'signin' });
  assert.deepEqual(seatPlan(session({ confirmed_count: 8 }), null, now), { ...none, waitlist: 'self' });
  assert.deepEqual(seatPlan(session(), member, now), { ...none, onFreeSeat: 'book', canBringOther: true });
  assert.deepEqual(seatPlan(session({ member_seats_free: 0 }), member, now), { ...none, waitlist: 'self', canBringOther: true });
  assert.deepEqual(seatPlan(session({ my_status: 'confirmed' }), member, now), { ...none, onFreeSeat: 'guest' });
  assert.deepEqual(seatPlan(session({ my_status: 'confirmed', member_seats_free: 0 }), member, now), { ...none, waitlist: 'guest' });
  // Members bring as many people as member seats allow; travellers stop at two.
  assert.deepEqual(seatPlan(session({ my_status: 'confirmed', my_guests: [guest('Paul'), guest('Lou', 'waitlisted', null)] }), member, now), { ...none, onFreeSeat: 'guest' });
  assert.deepEqual(seatPlan(session({ my_status: 'pending', my_guests: [guest('Nora', 'pending', null), guest('Yann', 'pending', null)] }), traveller, now), { ...none, limitReached: true });
  assert.deepEqual(seatPlan(session({ my_guests: [guest('Nora', 'pending', null), guest('Yann', 'pending', null)] }), traveller, now), { ...none, onFreeSeat: 'book', limitReached: true });
  assert.deepEqual(seatPlan(session({ my_status: 'confirmed', my_guests: [guest('Paul', 'cancelled', null), guest('Lou', 'declined', null)] }), member, now), { ...none, onFreeSeat: 'guest' });
  assert.deepEqual(seatPlan(session({ my_status: 'pending', traveller_seats_free: 0 }), traveller, now), { ...none, waitlist: 'guest' });
  assert.deepEqual(seatPlan(session({ traveller_seats_free: 0 }), traveller, now), { ...none, waitlist: 'self', canBringOther: true });
  assert.deepEqual(seatPlan(session({ my_status: 'declined' }), member, now), none);
  assert.deepEqual(seatPlan(session({ starts_at: '2026-10-12T10:20:00Z' }), member, now), none);
  assert.deepEqual(seatPlan(session({ status: 'cancelled' }), member, now), none);
});

test('explication de la liste d’attente', () => {
  assert.equal(waitlistHint(session({ confirmed_count: 8 }), false, now), 'Le cercle est complet, mais une place se libère souvent.');
  assert.equal(waitlistHint(session({ confirmed_count: 6 }), false, now), 'Les places membres sont prises. Les 2 places restantes sont réservées aux voyageurs jusqu’au samedi 17 octobre.');
  assert.equal(waitlistHint(session({ confirmed_count: 7 }), true, now), 'Les places voyageurs sont prises. La place restante est réservée aux membres jusqu’au samedi 17 octobre.');
});

test('regroupement des demandes pour l’organisateur', () => {
  const profiles = [{ id: 'u3', display_name: 'Sami', membership: 'newcomer' }] as Profile[];
  const base = { session_id: 's1', pool: 'newcomer' as const, created_at: '2026-10-12T10:00:00Z', offer_expires_at: null };
  const bookings: Booking[] = [
    { ...base, id: 'b1', user_id: 'u3', guest_name: null, sponsor_id: null, status: 'pending' },
    { ...base, id: 'b2', user_id: null, guest_name: 'Nora', sponsor_id: 'u3', status: 'pending' },
    { ...base, id: 'b3', user_id: null, guest_name: 'Yann', sponsor_id: 'u9', status: 'pending' },
    { ...base, id: 'b4', user_id: 'u5', guest_name: null, sponsor_id: null, status: 'confirmed' },
  ];
  assert.deepEqual(groupRequests(bookings, profiles).map(g => [g.key, g.own?.id, g.guests.map(b => b.id), g.person?.display_name]), [['s1:u3', 'b1', ['b2'], 'Sami'], ['s1:u9', undefined, ['b3'], undefined]]);
});

test('cartes de demande et confirmation de refus pour l’organisateur', () => {
  const sami = { id: 'u3', display_name: 'Sami', membership: 'newcomer', beginner: true } as Profile;
  const base = { session_id: 's1', pool: 'newcomer' as const, created_at: '2026-10-12T10:00:00Z', offer_expires_at: null, status: 'pending' as const };
  const own: Booking = { ...base, id: 'b1', user_id: 'u3', guest_name: null, sponsor_id: null };
  const nora: Booking = { ...base, id: 'b2', user_id: null, guest_name: 'Nora', sponsor_id: 'u3' };
  const yann: Booking = { ...base, id: 'b3', user_id: null, guest_name: 'Yann', sponsor_id: 'u3' };
  const group = (guests: Booking[], withOwn: boolean, person: Profile | null = sami): RequestGroup => ({ key: 's1:u3', sessionId: 's1', personId: 'u3', person: person ?? undefined, ...(withOwn ? { own } : {}), guests });
  // Own pending request: the declared level, whether or not the person is also counted as attending.
  assert.equal(requestNote(group([nora], true), true), 'Débutant·e');
  assert.equal(requestNote(group([], true, { ...sami, experience: 'experienced' }), true), 'Expérimenté·e');
  // Before the experience column exists, the beginner flag still gives a level.
  assert.equal(requestNote(group([], true, { ...sami, beginner: false }), true), 'Quelques parties');
  // Only friends pending: already registered, or not coming at all.
  assert.equal(requestNote(group([nora], false), true), 'Déjà inscrit·e, amène quelqu’un');
  assert.equal(requestNote(group([nora], false), false), 'Ne vient pas, amène quelqu’un');
  assert.equal(refusalText(group([], true)), 'La demande de Sami sera refusée. Un message lui sera envoyé.');
  assert.equal(refusalText(group([nora], true)), 'La demande de Sami sera refusée, ainsi que celle de Nora. Un message lui sera envoyé.');
  assert.equal(refusalText(group([nora, yann], true)), 'La demande de Sami sera refusée, ainsi que celles de Nora et Yann. Un message lui sera envoyé.');
  assert.equal(refusalText(group([nora], false)), 'La demande pour Nora sera refusée. Sami sera prévenu·e.');
  assert.equal(refusalText(group([nora, yann], false)), 'Les demandes pour Nora et Yann seront refusées. Sami sera prévenu·e.');
  // Without a profile the person is still named, capitalised only where a sentence starts.
  assert.equal(refusalText(group([], true, null)), 'La demande de cette personne sera refusée. Un message lui sera envoyé.');
  assert.equal(refusalText(group([nora], false, null)), 'La demande pour Nora sera refusée. Cette personne sera prévenu·e.');
});

test('ordre des participants et libellés organisateur', () => {
  const base = { session_id: 's1', created_at: '2026-10-12T10:00:00Z', offer_expires_at: null, status: 'confirmed' as const };
  const lea: Booking = { ...base, id: 'b1', user_id: 'u1', guest_name: null, sponsor_id: null, pool: 'circle', profile: { membership: 'member' } as Profile };
  const paul: Booking = { ...base, id: 'b2', user_id: null, guest_name: 'Paul', sponsor_id: 'u1', pool: 'circle' };
  const marc: Booking = { ...base, id: 'b3', user_id: 'u2', guest_name: null, sponsor_id: null, pool: 'newcomer', profile: { membership: 'newcomer' } as Profile };
  const tom: Booking = { ...base, id: 'b4', user_id: null, guest_name: 'Tom', sponsor_id: 'u9', pool: 'circle' };
  assert.deepEqual(orderBySponsor([tom, paul, marc, lea]).map(b => b.id), ['b3', 'b1', 'b2', 'b4']);
  assert.deepEqual([bookingLabel(lea, ''), bookingLabel(paul, 'Léa'), bookingLabel(marc, ''), bookingLabel({ ...paul, pool: 'newcomer' }, 'Marc')], ['Membre', 'Invité·e de Léa', 'Voyageur·se', 'Voyageur·se de Marc']);
});

test('suggestions de prénoms', () => {
  const past = session({ id: 'old', starts_at: '2026-10-01T17:30:00Z', my_guests: [guest('Marie'), guest('Invité·e'), guest('paul')] });
  const newer = session({ id: 'new', starts_at: '2026-10-08T17:30:00Z', my_guests: [guest('Yann'), guest('Marie', 'declined', null)] });
  const current = session({ my_guests: [guest('Paul')] });
  assert.deepEqual(recentGuestNames([past, newer, current], current), ['Yann', 'Marie']);
  // A name refused for this very game is not suggested again, whatever the older games say.
  const refused = session({ my_guests: [guest('Zoé', 'declined', null)] });
  assert.deepEqual(recentGuestNames([session({ id: 'older', starts_at: '2026-10-01T17:30:00Z', my_guests: [guest('Zoé'), guest('Léo')] }), refused], refused), ['Léo']);
});

test('accès à l’adresse', () => {
  assert.equal(canSeeAddress(session(), { membership: 'organizer' } as Profile), true);
  assert.equal(canSeeAddress(session({ my_status: 'confirmed' }), { membership: 'member' } as Profile), true);
  assert.equal(canSeeAddress(session({ my_guests: [guest('Paul')] }), { membership: 'member' } as Profile), true);
  assert.equal(canSeeAddress(session({ my_status: 'waitlisted', my_guests: [guest('Paul', 'pending', null)] }), { membership: 'newcomer' } as Profile), false);
  assert.equal(canSeeAddress(session(), null), false);
});

test('niveau déclaré, avec repli sur l’ancienne case « débutant »', () => {
  assert.equal(experienceOf({ beginner: true }), 'beginner');
  assert.equal(experienceOf({ beginner: false }), 'some');
  assert.equal(experienceOf({ beginner: false, experience: 'experienced' }), 'experienced');
  assert.equal(experienceOf({ beginner: true, experience: 'some' }), 'some');
});
