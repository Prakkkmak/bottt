import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Booking, GameSession, MyGuest, Profile } from '../lib/types';
import { bookingLabel, canSeeAddress, experienceOf, orderBySponsor, participantLabel, recentGuestNames, seatPlan, waitingLabel, waitlistHint, waitlistPositions } from '../lib/guests';

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
  assert.deepEqual(seatPlan(session({ confirmed_count: 8 }), member, now), { ...none, waitlist: 'self', canBringOther: true });
  assert.deepEqual(seatPlan(session({ my_status: 'confirmed' }), member, now), { ...none, onFreeSeat: 'guest' });
  assert.deepEqual(seatPlan(session({ my_status: 'confirmed', confirmed_count: 8 }), member, now), { ...none, waitlist: 'guest' });
  // One pool: the former per-rank counts no longer hide a free token from anyone.
  assert.deepEqual(seatPlan(session({ member_seats_free: 0, traveller_seats_free: 0 }), member, now), { ...none, onFreeSeat: 'book', canBringOther: true });
  assert.deepEqual(seatPlan(session({ member_seats_free: 0, traveller_seats_free: 0 }), traveller, now), { ...none, onFreeSeat: 'book', canBringOther: true });
  // Members bring as many people as tokens allow, then 2 on the waitlist; travellers stop at two.
  assert.deepEqual(seatPlan(session({ my_status: 'confirmed', my_guests: [guest('Paul'), guest('Lou', 'waitlisted', null)] }), member, now), { ...none, onFreeSeat: 'guest' });
  const waiting = [guest('Lou', 'waitlisted', null), guest('Tim', 'waitlisted', null)];
  assert.deepEqual(seatPlan(session({ my_status: 'confirmed', confirmed_count: 8, my_guests: [guest('Paul'), guest('Lou', 'waitlisted', null)] }), member, now), { ...none, waitlist: 'guest' });
  assert.deepEqual(seatPlan(session({ my_status: 'confirmed', confirmed_count: 8, my_guests: waiting }), member, now), { ...none, limitReached: true });
  assert.deepEqual(seatPlan(session({ confirmed_count: 8, my_guests: waiting }), member, now), { ...none, waitlist: 'self', limitReached: true });
  assert.deepEqual(seatPlan(session({ my_status: 'confirmed', my_guests: waiting }), member, now), { ...none, onFreeSeat: 'guest' });
  assert.deepEqual(seatPlan(session({ my_status: 'confirmed', my_guests: [guest('Nora'), guest('Yann', 'waitlisted', null)] }), traveller, now), { ...none, limitReached: true });
  assert.deepEqual(seatPlan(session({ my_guests: [guest('Nora'), guest('Yann')] }), traveller, now), { ...none, onFreeSeat: 'book', limitReached: true });
  assert.deepEqual(seatPlan(session({ my_status: 'confirmed', my_guests: [guest('Paul', 'cancelled', null), guest('Lou', 'declined', null)] }), member, now), { ...none, onFreeSeat: 'guest' });
  assert.deepEqual(seatPlan(session({ my_status: 'waitlisted', confirmed_count: 8 }), traveller, now), { ...none, waitlist: 'guest' });
  assert.deepEqual(seatPlan(session({ confirmed_count: 8 }), traveller, now), { ...none, waitlist: 'self', canBringOther: true });
  assert.deepEqual(seatPlan(session({ my_status: 'declined' }), member, now), none);
  assert.deepEqual(seatPlan(session({ starts_at: '2026-10-12T10:20:00Z' }), member, now), none);
  assert.deepEqual(seatPlan(session({ status: 'cancelled' }), member, now), none);
});

test('explication et rang de la liste d’attente', () => {
  assert.equal(waitlistHint(session({ confirmed_count: 8 })), 'Le cercle est complet. Si une place se libère, elle revient à la première personne de la liste, sans autre démarche, et un e-mail la prévient.');
  assert.equal(waitlistHint(session({ confirmed_count: 8, waitlist_count: 1 })), 'Le cercle est complet. 1 personne attend déjà. Si une place se libère, elle revient à la première personne de la liste, sans autre démarche, et un e-mail la prévient.');
  assert.match(waitlistHint(session({ confirmed_count: 8, waitlist_count: 3 })), /3 personnes attendent déjà\./);
  assert.equal(waitingLabel(2), 'n° 2 sur la liste d’attente');
  assert.equal(waitingLabel(null), 'en liste d’attente');
});

test('rang de chacun dans la file, pour l’organisateur', () => {
  const base = { pool: 'circle' as const, offer_expires_at: null, user_id: null, guest_name: 'X', sponsor_id: 'u1' };
  const bookings: Booking[] = [
    { ...base, id: 'b', session_id: 's1', status: 'waitlisted', created_at: '2026-10-12T10:05:00Z' },
    { ...base, id: 'a', session_id: 's1', status: 'confirmed', created_at: '2026-10-12T10:00:00Z' },
    { ...base, id: 'd', session_id: 's1', status: 'waitlisted', created_at: '2026-10-12T10:01:00Z' },
    { ...base, id: 'c', session_id: 's1', status: 'waitlisted', created_at: '2026-10-12T10:01:00Z' },
    { ...base, id: 'e', session_id: 's2', status: 'waitlisted', created_at: '2026-10-12T11:00:00Z' },
  ];
  // Arrival order first, then the id for two people who arrived at the same instant, game by game.
  assert.deepEqual([...waitlistPositions(bookings)].sort(), [['b', 3], ['c', 1], ['d', 2], ['e', 1]]);
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
  assert.equal(canSeeAddress(session({ my_status: 'waitlisted', my_guests: [guest('Paul', 'waitlisted', null)] }), { membership: 'newcomer' } as Profile), false);
  assert.equal(canSeeAddress(session(), null), false);
});

test('niveau déclaré, avec repli sur l’ancienne case « débutant »', () => {
  assert.equal(experienceOf({ beginner: true }), 'beginner');
  assert.equal(experienceOf({ beginner: false }), 'some');
  assert.equal(experienceOf({ beginner: false, experience: 'experienced' }), 'experienced');
  assert.equal(experienceOf({ beginner: true, experience: 'some' }), 'some');
});
