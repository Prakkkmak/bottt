import { test } from 'node:test';
import assert from 'node:assert/strict';
import { notificationMail } from '../lib/mail';
import { notificationChoices, optionalKinds, sessionMessageSent, withDefaults } from '../lib/notification-choices';
import { notificationChoicesSchema } from '../lib/schemas';

const game = { id: 'n1', email: 'lea@exemple.fr', session_id: 's1', session_title: '', session_script: 'Trouble Brewing', session_starts_at: '2026-10-23T17:30:00Z', session_location: 'Le Grenier' };

test('chaque e-mail dit où choisir ses notifications', () => {
  const reminder = notificationMail({ ...game, kind: 'reminder', title: 'Ta session approche', body: 'À très vite !' }, 'https://bottt.fr');
  assert.deepEqual(reminder.text.split('\n\n').slice(-2), [
    'Tu reçois cet e-mail car « Rappel avant la partie » est activé dans tes notifications. Pour le changer : https://bottt.fr/profil#notifications',
    'Blood on the Tanguy Tower',
  ]);
  // A message always sent names no choice, and still says where the others are.
  const cancelled = notificationMail({ ...game, kind: 'cancel', title: 'La session a été annulée', body: 'L’organisateur a annulé la soirée.' }, 'https://bottt.fr');
  assert.equal(cancelled.text.split('\n\n').at(-2), 'Choisis les e-mails que tu reçois : https://bottt.fr/profil#notifications');
  // Before the migration, a message without a kind keeps its former text.
  assert.equal(notificationMail({ ...game, title: 'Ta place est réservée', body: 'Ton inscription est confirmée.' }, 'https://bottt.fr').text.split('\n\n').length, 4);
});

test('une nouvelle partie et l’activité d’une partie disent combien de places sont prises', () => {
  const opened = notificationMail({ ...game, kind: 'new_game', title: 'Nouvelle partie', body: 'Les inscriptions sont ouvertes.', session_capacity: 12, session_taken: 0, session_waiting: 0 }, 'https://bottt.fr');
  assert.equal(opened.subject, 'Nouvelle partie · Trouble Brewing, vendredi 23 octobre');
  assert.equal(opened.text.split('\n\n')[1], 'Partie : Trouble Brewing\nQuand : vendredi 23 octobre à 19h30\nOù : Le Grenier\nPlaces prises : 0 sur 12');
  const busy = notificationMail({ ...game, kind: 'activity', title: 'Désistement', body: 'Léa a libéré sa place.', session_capacity: 8, session_taken: 8, session_waiting: 2 }, 'https://bottt.fr');
  assert.equal(busy.text.split('\n\n')[1].split('\n').at(-1), 'Places prises : 8 sur 8, 2 en liste d’attente');
  // Counts that are missing or not well formed are left out.
  for (const seats of [{}, { session_capacity: null, session_taken: 3 }, { session_capacity: 8, session_taken: -1 }, { session_capacity: 8, session_taken: 2.5 }]) {
    assert.equal(notificationMail({ ...game, kind: 'activity', title: 'x', body: 'y', ...seats } as never, 'https://bottt.fr').text.split('\n\n')[1], 'Partie : Trouble Brewing\nQuand : vendredi 23 octobre à 19h30\nOù : Le Grenier');
  }
});

test('les choix enregistrés sont complétés par ceux par défaut', () => {
  assert.deepEqual(withDefaults(), { booking: true, reminder: true, message: true, announcement: true, new_game: false, activity: false });
  // A kind no longer offered, or a value that is not a yes or a no, is ignored.
  assert.deepEqual(withDefaults({ reminder: false, new_game: true, waitlist: false, message: 'no' as never }), { booking: true, reminder: false, message: true, announcement: true, new_game: true, activity: false });
  // The form sends every kind offered, nothing else.
  assert.deepEqual(Object.keys(notificationChoicesSchema.shape).sort(), [...optionalKinds].sort());
  assert.ok(notificationChoicesSchema.safeParse(withDefaults()).success);
  for (const bad of [{ ...withDefaults(), change: false }, { ...withDefaults(), booking: 'false' }, { booking: true }, null]) assert.equal(notificationChoicesSchema.safeParse(bad).success, false);
  // Only organizers see the switch for their games' activity.
  assert.deepEqual(notificationChoices.filter(c => c.organizersOnly).map(c => c.kind), ['activity']);
});

test('l’organisateur lit à combien de personnes son message part', () => {
  assert.equal(sessionMessageSent({ sent: 5, muted: 0 }), 'Ton message part à 5 personnes.');
  assert.equal(sessionMessageSent({ sent: 1, muted: 1 }), 'Ton message part à 1 personne. Un·e autre inscrit·e a coupé les messages des organisateurs.');
  assert.equal(sessionMessageSent({ sent: 3, muted: 2 }), 'Ton message part à 3 personnes. 2 autres inscrits ont coupé les messages des organisateurs.');
  // Before the migration, the function returned the count alone.
  assert.equal(sessionMessageSent(4), 'Ton message part à 4 personnes.');
});
