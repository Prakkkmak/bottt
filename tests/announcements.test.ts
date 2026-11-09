import { test } from 'node:test';
import assert from 'node:assert/strict';
import { announcementSent, reachLabel } from '../lib/announcements';
import { announcementSchema } from '../lib/schemas';
import { notificationMail } from '../lib/mail';

test('ce que l’organisateur lit après une annonce', () => {
  assert.match(announcementSent({ sent: 12, muted: 0 }), /^Ton annonce part à 12 personnes\. Les e-mails partent par lots/);
  assert.match(announcementSent({ sent: 1, muted: 1 }), /^Ton annonce part à 1 personne\. Une personne a coupé les annonces\./);
  assert.match(announcementSent({ sent: 5, muted: 3 }), /^Ton annonce part à 5 personnes\. 3 personnes ont coupé les annonces\./);
  assert.match(announcementSent(null), /^Ton annonce part à 0 personne\./);
  assert.equal(reachLabel({ sent: 12, muted: 0 }), '12 personnes');
  assert.equal(reachLabel({ sent: 1, muted: 1 }), '1 personne, 1 a coupé les annonces');
  assert.equal(reachLabel({ sent: 4, muted: 2 }), '4 personnes, 2 ont coupé les annonces');
});

test('formulaire d’annonce', () => {
  assert.deepEqual(announcementSchema.parse({ message: '  Bonjour  ', audience: 'members' }), { subject: '', message: 'Bonjour', audience: 'members' });
  assert.equal(announcementSchema.parse({ subject: '  Soirée  ', message: 'Bonjour', audience: 'everyone' }).subject, 'Soirée');
  for (const bad of [{ message: 'x', audience: 'everyone' }, { message: 'a'.repeat(4001), audience: 'everyone' }, { message: 'Bonjour', audience: 'tous' },
    { subject: 'o'.repeat(101), message: 'Bonjour', audience: 'everyone' }, { message: 'Bonjour' }, null])
    assert.equal(announcementSchema.safeParse(bad).success, false);
});

test('une annonce par e-mail', () => {
  const mail = notificationMail({ id: 'n1', email: 'lea@exemple.fr', session_id: null, kind: 'announcement', title: 'Soirée spéciale\r\nBcc: x@y.z', body: 'Venez déguisés.\n\n— Lévy' }, 'https://bottt.fr');
  // The subject holds on one line, and the e-mail links to the home page, about no game.
  assert.equal(mail.subject, 'Soirée spéciale Bcc: x@y.z');
  assert.ok(mail.text.startsWith('Venez déguisés.\n\n— Lévy\n\nhttps://bottt.fr/'));
  assert.match(mail.text, /Annonces du cercle/);
});
