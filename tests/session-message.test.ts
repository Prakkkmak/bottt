import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Booking } from '../lib/types';
import { messageRecipients } from '../lib/guests';
import { notificationMail } from '../lib/mail';
import { sessionMessageSchema } from '../lib/schemas';

const booking = (id: string, status: Booking['status'], person: { user?: string; guest?: string; sponsor?: string }, session_id = 's1'): Booking => ({
  id, session_id, status, user_id: person.user ?? null, guest_name: person.guest ?? null, sponsor_id: person.sponsor ?? null, pool: 'circle', created_at: '2026-11-01T10:00:00Z', offer_expires_at: null,
});

test('destinataires d’un message aux inscrits', () => {
  const bookings = [
    booking('b1', 'confirmed', { user: 'writer' }),
    booking('b2', 'confirmed', { user: 'lea' }),
    booking('b3', 'confirmed', { guest: 'Paul', sponsor: 'lea' }),
    // Brings someone without coming: reads it for them.
    booking('b4', 'confirmed', { guest: 'Léo', sponsor: 'marc' }),
    booking('b5', 'waitlisted', { user: 'nora' }),
    // Waiting, but already written to for the guest who has a seat.
    booking('b6', 'waitlisted', { user: 'marc' }),
    booking('b7', 'cancelled', { user: 'yann' }),
    booking('b8', 'declined', { user: 'ines' }),
    booking('b9', 'confirmed', { guest: 'Zoé', sponsor: 'writer' }),
    booking('b10', 'confirmed', { user: 'autre' }, 's2'),
  ];
  assert.deepEqual(messageRecipients(bookings, 's1', 'writer'), { registered: 2, waiting: 1 });
  // Seen by someone else, the writer and the guest they bring count once.
  assert.deepEqual(messageRecipients(bookings, 's1', 'lea'), { registered: 2, waiting: 1 });
  assert.deepEqual(messageRecipients(bookings, 's3', 'writer'), { registered: 0, waiting: 0 });
});

test('le message d’un organisateur par e-mail', () => {
  const body = 'Apportez de quoi grignoter « maison ».\nÀ ce soir !\n\nTransmets ce message à Paul.';
  const mail = notificationMail({ id: 'n1', email: 'lea@exemple.fr', session_id: 's1', title: 'Message de Lévy', body, session_title: '', session_script: 'Trouble Brewing', session_starts_at: '2026-11-05T18:30:00Z', session_location: 'Le Grenier' }, 'https://bottt.fr');
  assert.equal(mail.subject, 'Message de Lévy · Trouble Brewing, jeudi 5 novembre');
  // The line breaks the organizer typed are kept, before the game's details and the link.
  assert.ok(mail.text.startsWith(`${body}\n\nPartie : Trouble Brewing\nQuand : jeudi 5 novembre à 19h30\nOù : Le Grenier`));
  assert.ok(mail.text.includes('https://bottt.fr/sessions/s1'));
});

test('longueur du message', () => {
  assert.equal(sessionMessageSchema.parse('  À ce soir  '), 'À ce soir');
  for (const text of ['', ' x ', 'a'.repeat(2001)]) assert.equal(sessionMessageSchema.safeParse(text).success, false);
  assert.equal(sessionMessageSchema.safeParse('a'.repeat(2000)).success, true);
});
