import { test } from 'node:test';
import assert from 'node:assert/strict';
import { invitationMail, notificationMail } from '../lib/mail';

test('e-mail d’invitation', () => {
  const link = 'https://bottt.fr/invite/' + 'a'.repeat(64);
  const mail = invitationMail('Léa', link);
  assert.equal(mail.subject, 'Léa t’invite à rejoindre Blood on the Tanguy Tower');
  assert.ok(mail.text.split('\n\n').includes(link), 'the link stands on its own line');
  assert.match(mail.text, /valable 7 jours/);
  assert.match(mail.text, /indiquée par Léa/);
  // First contact with the invited person: who is responsible, how to object, where the policy is.
  assert.match(mail.text, /bonjour@bottt\.fr/);
  assert.match(mail.text, /https:\/\/bottt\.fr\/confidentialite/);
  // A pseudo cannot break the subject line, and an empty one still reads as a sentence.
  assert.equal(invitationMail('  Léa\r\nBcc: x@y.z ', link).subject, 'Léa Bcc: x@y.z t’invite à rejoindre Blood on the Tanguy Tower');
  assert.equal(invitationMail('', link).subject, 'Un membre t’invite à rejoindre Blood on the Tanguy Tower');
});

test('e-mails d’inscription, de liste d’attente et de place libérée', () => {
  const game = { id: 'n1', email: 'lea@exemple.fr', session_id: 's1', session_title: '', session_script: 'Trouble Brewing', session_starts_at: '2026-10-23T17:30:00Z', session_location: 'Le Grenier · Brest centre' };
  const booked = notificationMail({ ...game, title: 'Ta place est réservée', body: 'Ton inscription est confirmée.' }, 'https://bottt.fr');
  // An unnamed game goes by its script, and the date is in Paris time.
  assert.equal(booked.subject, 'Ta place est réservée · Trouble Brewing, vendredi 23 octobre');
  assert.deepEqual(booked.text.split('\n\n'), [
    'Ton inscription est confirmée.',
    'Partie : Trouble Brewing\nQuand : vendredi 23 octobre à 19h30\nOù : Le Grenier · Brest centre',
    'https://bottt.fr/sessions/s1',
    'Blood on the Tanguy Tower',
  ]);
  const named = notificationMail({ ...game, session_title: 'Une nuit à Ravenswood', title: 'Une place s’est libérée pour Valentine', body: 'Valentine était sur la liste d’attente.' }, 'https://bottt.fr');
  assert.equal(named.subject, 'Une place s’est libérée pour Valentine · Une nuit à Ravenswood, vendredi 23 octobre');
  // A guest name cannot break the subject line.
  assert.equal(notificationMail({ ...game, title: 'Val\r\nBcc: x@y.z a sa place', body: '' }, 'https://bottt.fr').subject, 'Val Bcc: x@y.z a sa place · Trouble Brewing, vendredi 23 octobre');
  // A message about no game, or about a deleted one, links to the home page without details.
  const welcome = notificationMail({ id: 'n2', email: 'lea@exemple.fr', session_id: null, title: 'Bienvenue parmi les membres', body: 'Tu vois désormais les parties réservées aux membres.' }, 'https://bottt.fr');
  assert.deepEqual([welcome.subject, welcome.text], ['Bienvenue parmi les membres', 'Tu vois désormais les parties réservées aux membres.\n\nhttps://bottt.fr/\n\nBlood on the Tanguy Tower']);
});
