import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkSessionForm, type SessionFormValues } from '../lib/session-form';
import { MIN_PLAYERS } from '../lib/session-rules';
import { sessionSchema } from '../lib/schemas';
import { fromParisInput } from '../lib/utils';

const values: SessionFormValues = { title: '', starts_at: '2099-10-02T19:30', script: 'Trouble Brewing', location: 'Brest', address: '', maps_url: '', capacity: '15', visibility: 'public' };
const venue = { id: '20000000-0000-4000-8000-000000000001', name: 'Le Grenier · Brest centre', address: '12 rue de Siam' };

test('le formulaire de partie dit pourquoi 2 places joueurs ne suffisent pas', () => {
  const { errors, payload } = checkSessionForm({ ...values, capacity: '2' }, {});
  assert.equal(payload, undefined);
  assert.deepEqual(errors, { capacity: `Prévois au moins ${MIN_PLAYERS} places joueurs : c’est le minimum pour lancer une partie.` });
});

test('chaque champ refusé reçoit son propre message en français', () => {
  const { errors, message, payload } = checkSessionForm({ title: 'x'.repeat(101), starts_at: '', script: ' a ', location: ' ', address: 'x'.repeat(501), maps_url: 'maps.google.com/lieu', capacity: '', visibility: 'secret' }, {});
  assert.equal(payload, undefined);
  assert.equal(message, undefined);
  assert.deepEqual(errors, {
    title: 'Le nom de la partie tient en 100 caractères au plus.',
    starts_at: 'Choisis le jour et l’heure du début.',
    script: 'Indique le script joué, en 2 caractères au moins.',
    location: 'Indique le lieu affiché à tous, en 2 caractères au moins.',
    address: 'L’adresse et le lien Maps doivent tenir en 500 caractères.',
    maps_url: 'Colle un lien complet, qui commence par https://.',
    capacity: 'Indique le nombre de places joueurs.',
    visibility: 'Choisis qui peut voir la partie.',
  });
});

test('les places joueurs, la date et le lien Maps sont expliqués selon l’erreur', () => {
  const check = (changes: Partial<SessionFormValues>) => checkSessionForm({ ...values, ...changes }, {}).errors;
  assert.equal(check({ capacity: '7.5' }).capacity, 'Indique un nombre entier de places joueurs.');
  assert.equal(check({ capacity: '21' }).capacity, 'Une partie compte 20 places joueurs au plus.');
  assert.equal(check({ starts_at: '2020-10-02T19:30' }).starts_at, 'Choisis une date à venir.');
  // 29 mars 2099 : à 2 h, Paris passe directement à 3 h.
  assert.equal(check({ starts_at: '2099-03-29T02:30' }).starts_at, 'Cette heure n’existe pas lors du changement d’heure. Choisis un autre horaire.');
  assert.equal(check({ maps_url: 'javascript:alert(1)' }).maps_url, 'Colle un lien complet, qui commence par https://.');
  assert.equal(check({ maps_url: 'https://' }).maps_url, 'Colle un lien complet, qui commence par https://.');
  assert.equal(check({ maps_url: 'https://maps.app.goo.gl/abc' }).maps_url, undefined);
});

test('un formulaire juste donne ce que saveSession attend', () => {
  assert.deepEqual(checkSessionForm(values, {}), { errors: {}, message: undefined, payload: {
    title: '', script: 'Trouble Brewing', starts_at: '2099-10-02T17:30:00.000Z', location: 'Brest', address: '', venue_id: null, capacity: 15, visibility: 'public',
  } });
  const session = { id: '10000000-0000-4000-8000-000000000001', starts_at: '2026-10-02T17:00:00Z', ends_at: '2026-10-02T20:00:00Z' };
  const edited = checkSessionForm(values, { session }).payload;
  assert.equal(edited?.id, session.id);
  assert.equal(edited?.ends_at, '2099-10-02T20:30:00.000Z');
});

test('un lieu choisi remplace les champs « Autre lieu », qui ne sont plus vérifiés', () => {
  const { errors, payload } = checkSessionForm({ ...values, location: '', maps_url: 'pas un lien' }, { venue });
  assert.deepEqual(errors, {});
  assert.equal(payload?.location, venue.name);
  assert.equal(payload?.address, venue.address);
  assert.equal(payload?.venue_id, venue.id);
});

test('une durée enregistrée impossible est signalée pour toute la partie', () => {
  const session = { id: '10000000-0000-4000-8000-000000000001', starts_at: '2026-10-02T20:00:00Z', ends_at: '2026-10-02T17:00:00Z' };
  const { errors, message, payload } = checkSessionForm(values, { session });
  assert.deepEqual([errors, message, payload], [{}, 'La fin doit être après le début.', undefined]);
});

// The browser checks the form without zod: on every case below, it must refuse what the server refuses, with the same message.
test('le formulaire et le serveur refusent les mêmes valeurs avec les mêmes mots', () => {
  const cases: Partial<SessionFormValues>[] = [{},
    { title: 'x'.repeat(100) }, { title: 'x'.repeat(101) }, { title: `  ${'x'.repeat(100)}  ` },
    { script: '' }, { script: ' a ' }, { script: 'ab' }, { script: 'x'.repeat(100) }, { script: 'x'.repeat(101) },
    { starts_at: '2020-10-02T19:30' },
    { location: '' }, { location: ' a ' }, { location: 'ab' }, { location: 'x'.repeat(151) }, { address: 'x'.repeat(500) }, { address: 'x'.repeat(501) },
    { capacity: '' }, { capacity: ' ' }, { capacity: '2' }, { capacity: '6' }, { capacity: '7' }, { capacity: '20' }, { capacity: '21' }, { capacity: '7.5' }, { capacity: '2.5' }, { capacity: '-3' }, { capacity: '1e400' }, { capacity: 'abc' },
    { visibility: 'members' }, { visibility: '' }, { visibility: 'secret' },
    { title: 'x'.repeat(101), script: '', location: '', capacity: '2', visibility: 'x' },
  ];
  for (const changes of cases) {
    const form = { ...values, ...changes };
    const { errors, message } = checkSessionForm(form, {});
    const parsed = sessionSchema.safeParse({ title: form.title, script: form.script, starts_at: fromParisInput(form.starts_at), location: form.location, address: form.address, venue_id: null, capacity: form.capacity.trim() ? Number(form.capacity) : NaN, visibility: form.visibility });
    const server: Record<string, string> = {};
    for (const issue of parsed.success ? [] : parsed.error.issues) server[String(issue.path[0] ?? '')] ??= issue.message;
    assert.deepEqual({ ...errors, ...(message ? { '': message } : {}) }, server, JSON.stringify(changes));
  }
});
