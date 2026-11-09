import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkSessionForm, isPastStart, type SessionFormValues } from '../lib/session-form';
import { MIN_CAPACITY } from '../lib/session-rules';
import { sessionSchema, seriesSchema, seriesEditSchema } from '../lib/schemas';
import { fromParisInput } from '../lib/utils';

const values: SessionFormValues = { title: '', starts_at: '2099-10-02T19:30', script: 'Trouble Brewing', location: 'Brest', address: '', maps_url: '', capacity: '15', visibility: 'public' };
const venue = { id: '20000000-0000-4000-8000-000000000001', name: 'Le Grenier · Brest centre', address: '12 rue de Siam' };

test('le formulaire de partie dit pourquoi 2 places ne suffisent pas', () => {
  const { errors, payload } = checkSessionForm({ ...values, capacity: '2' }, {});
  assert.equal(payload, undefined);
  assert.deepEqual(errors, { capacity: `Prévois au moins ${MIN_CAPACITY} places, MJ compris : c’est le minimum pour lancer une partie.` });
});

test('chaque champ refusé reçoit son propre message en français', () => {
  const { errors, message, payload } = checkSessionForm({ title: 'x'.repeat(101), starts_at: '', script: ' a ', location: ' ', address: 'x'.repeat(501), maps_url: 'maps.google.com/lieu', capacity: '', visibility: 'secret' }, {});
  assert.equal(payload, undefined);
  assert.equal(message, undefined);
  assert.deepEqual(errors, {
    title: 'Le nom de la partie tient en 100 caractères au plus.',
    starts_at: 'Choisis le jour et l’heure du début.',
    script: 'Écris au moins 2 caractères, ou laisse le champ vide si le script n’est pas encore choisi.',
    location: 'Indique le lieu affiché à tous, en 2 caractères au moins.',
    address: 'L’adresse et le lien de carte doivent tenir en 500 caractères.',
    maps_url: 'Colle un lien complet, qui commence par https://.',
    capacity: 'Indique le nombre de places, MJ compris.',
    visibility: 'Choisis qui peut voir la partie.',
  });
});

test('les places, la date et le lien de carte sont expliqués selon l’erreur', () => {
  const check = (changes: Partial<SessionFormValues>) => checkSessionForm({ ...values, ...changes }, {}).errors;
  assert.equal(check({ capacity: '7.5' }).capacity, 'Indique un nombre entier de places.');
  assert.equal(check({ capacity: '21' }).capacity, 'Une partie compte 20 places au plus, MJ compris.');
  // A single game may take a past date, which the form asks to confirm; a series starts ahead.
  assert.equal(check({ starts_at: '2020-10-02T19:30' }).starts_at, undefined);
  assert.equal(check({ starts_at: '2020-10-02T19:30', repeat: '1', weeks_ahead: '4' }).starts_at, 'Choisis une date à venir.');
  // 29 mars 2099 : à 2 h, Paris passe directement à 3 h.
  assert.equal(check({ starts_at: '2099-03-29T02:30' }).starts_at, 'Cette heure n’existe pas lors du changement d’heure. Choisis un autre horaire.');
  assert.equal(check({ maps_url: 'javascript:alert(1)' }).maps_url, 'Colle un lien complet, qui commence par https://.');
  assert.equal(check({ maps_url: 'https://' }).maps_url, 'Colle un lien complet, qui commence par https://.');
  assert.equal(check({ maps_url: 'https://maps.app.goo.gl/abc' }).maps_url, undefined);
});

test('une partie peut attendre son script', () => {
  assert.deepEqual(checkSessionForm({ ...values, script: '' }, {}).errors, {});
  assert.equal(sessionSchema.parse({ ...checkSessionForm({ ...values, script: '  ' }, {}).payload }).script, '');
  // Sent without any script, the game has none.
  const { script: _, ...noScript } = checkSessionForm(values, {}).payload!;
  assert.equal(sessionSchema.parse(noScript).script, '');
  assert.equal(seriesSchema.parse({ ...checkSessionForm({ ...values, repeat: '1', weeks_ahead: '4', ends_on: '', script: '' }, {}).payload }).script, '');
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
    { script: '' }, { script: '   ' }, { script: ' a ' }, { script: 'ab' }, { script: 'x'.repeat(100) }, { script: 'x'.repeat(101) },
    { starts_at: '2020-10-02T19:30' },
    { location: '' }, { location: ' a ' }, { location: 'ab' }, { location: 'x'.repeat(151) }, { address: 'x'.repeat(500) }, { address: 'x'.repeat(501) },
    { capacity: '' }, { capacity: ' ' }, { capacity: '2' }, { capacity: '6' }, { capacity: '7' }, { capacity: '20' }, { capacity: '21' }, { capacity: '7.5' }, { capacity: '2.5' }, { capacity: '-3' }, { capacity: '1e400' }, { capacity: 'abc' },
    { visibility: 'members' }, { visibility: '' }, { visibility: 'secret' },
    { title: 'x'.repeat(101), script: '', location: '', capacity: '2', visibility: 'x' }, { title: 'x'.repeat(101), script: 'a', location: '', capacity: '2', visibility: 'x' },
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

test('ce que le formulaire laisse partir, le serveur l’accepte, lieu choisi ou partie modifiée', () => {
  const session = { id: '10000000-0000-4000-8000-000000000001', starts_at: '2026-10-02T17:00:00Z', ends_at: '2026-10-02T20:00:00Z' };
  for (const context of [{}, { venue }, { session }, { session, venue }]) for (const changes of [{}, { title: 'Soirée d’automne', capacity: '7' }, { script: '' }, { title: '', script: '  ' }, { capacity: '20', visibility: 'members', maps_url: 'https://maps.app.goo.gl/abc', address: '12 rue de Siam\nhttps://maps.app.goo.gl/abc' }]) {
    const { payload } = checkSessionForm({ ...values, ...changes }, context);
    assert.ok(payload, JSON.stringify([context, changes]));
    assert.equal(sessionSchema.safeParse(payload).success, true, JSON.stringify([context, changes]));
  }
  // A venue fills the place with what « Les lieux » accepted: the server then accepts it too.
  assert.equal(sessionSchema.safeParse(checkSessionForm({ ...values, location: '' }, { venue: { ...venue, name: 'ab', address: 'x'.repeat(500) } }).payload).success, true);
});

const weekly: Partial<SessionFormValues> = { repeat: '1', weeks_ahead: '4', ends_on: '' };

test('une partie récurrente donne son rythme, ses dates ouvertes et sa dernière date', () => {
  assert.deepEqual(checkSessionForm({ ...values, ...weekly }, {}).payload, {
    title: '', script: 'Trouble Brewing', starts_at: '2099-10-02T17:30:00.000Z', location: 'Brest', address: '', venue_id: null, capacity: 15, visibility: 'public',
    every_weeks: 1, weeks_ahead: 4, ends_on: null,
  });
  assert.equal(checkSessionForm({ ...values, ...weekly, repeat: '2', ends_on: '2099-12-31' }, {}).payload?.ends_on, '2099-12-31');
  // A game being edited stays one date, whatever the form holds.
  const session = { id: '10000000-0000-4000-8000-000000000001', starts_at: '2026-10-02T17:00:00Z', ends_at: '2026-10-02T20:00:00Z' };
  assert.equal('every_weeks' in (checkSessionForm({ ...values, ...weekly }, { session }).payload ?? {}), false);
  const check = (changes: Partial<SessionFormValues>) => checkSessionForm({ ...values, ...weekly, ...changes }, {}).errors;
  assert.deepEqual(check({ repeat: '3' }), { repeat: 'Choisis le rythme de la série.' });
  assert.deepEqual(check({ weeks_ahead: '13' }), { weeks_ahead: 'Choisis jusqu’à quand les dates sont ouvertes.' });
  assert.deepEqual(check({ ends_on: '2099-10-01' }), { ends_on: 'La dernière date doit suivre la première partie.' });
  assert.deepEqual(check({ ends_on: '2099-02-30' }), { ends_on: 'Choisis une dernière date valide, ou laisse le champ vide.' });
  // The last date may be the first one: the series then holds one game.
  assert.deepEqual(check({ ends_on: '2099-10-02' }), {});
});

test('le formulaire et le serveur refusent les mêmes séries avec les mêmes mots', () => {
  const cases: Partial<SessionFormValues>[] = [{}, { repeat: '2' }, { repeat: '3' }, { repeat: '0' }, { weeks_ahead: '' }, { weeks_ahead: '0' }, { weeks_ahead: '1' }, { weeks_ahead: '12' }, { weeks_ahead: '13' }, { weeks_ahead: '2.5' },
    { ends_on: '2099-10-01' }, { ends_on: '2099-10-02' }, { ends_on: '2100-01-01' }, { ends_on: '2099-02-30' }, { ends_on: '2099-13-01' }, { ends_on: 'demain' },
    { capacity: '2', weeks_ahead: '0' }, { script: '', repeat: '5', ends_on: 'x' }, { script: '' }, { script: 'a', repeat: '5' }, { starts_at: '2020-10-02T19:30' }, { starts_at: '2020-10-02T19:30', capacity: '2' }];
  for (const changes of cases) {
    const form = { ...values, ...weekly, ...changes };
    const { errors, message } = checkSessionForm(form, {});
    const parsed = seriesSchema.safeParse({ title: form.title, script: form.script, starts_at: fromParisInput(form.starts_at), location: form.location, address: form.address, venue_id: null, capacity: form.capacity.trim() ? Number(form.capacity) : NaN, visibility: form.visibility,
      every_weeks: Number(form.repeat), weeks_ahead: Number(form.weeks_ahead), ends_on: form.ends_on || null });
    const server: Record<string, string> = {};
    for (const issue of parsed.success ? [] : parsed.error.issues) server[String(issue.path[0] ?? '')] ??= issue.message;
    const client: Record<string, string> = { ...errors, ...(message ? { '': message } : {}) };
    // The form names the field of the rhythm « repeat »; the server, every_weeks.
    if (client.repeat) { client.every_weeks = client.repeat; delete client.repeat; }
    assert.deepEqual(client, server, JSON.stringify(changes));
  }
});

test('ce que le formulaire laisse partir comme série, le serveur l’accepte', () => {
  for (const context of [{}, { venue }]) for (const changes of [{}, { repeat: '2', weeks_ahead: '12', ends_on: '2100-06-30', capacity: '20', visibility: 'members' }]) {
    const { payload } = checkSessionForm({ ...values, ...weekly, ...changes }, context);
    assert.ok(payload, JSON.stringify([context, changes]));
    assert.equal(seriesSchema.safeParse(payload).success, true, JSON.stringify([context, changes]));
  }
});

test('une date passée part après confirmation, pour une partie seule ; le serveur l’accepte aussi', () => {
  const session = { id: '10000000-0000-4000-8000-000000000001', starts_at: '2026-11-11T19:00:00Z', ends_at: '2026-11-11T23:00:00Z' };
  for (const context of [{}, { session }]) {
    const { errors, payload } = checkSessionForm({ ...values, starts_at: '2026-11-04T20:00' }, context);
    assert.deepEqual(errors, {});
    assert.equal(payload?.starts_at, '2026-11-04T19:00:00.000Z');
    assert.equal(sessionSchema.safeParse(payload).success, true);
  }
  assert.equal(seriesSchema.safeParse({ ...checkSessionForm({ ...values, ...weekly }, {}).payload, starts_at: '2026-11-04T19:00:00.000Z' }).success, false);
  const now = Date.parse('2026-11-09T15:00:00Z');
  assert.equal(isPastStart('2026-11-04T20:00', now), true);
  assert.equal(isPastStart('2026-11-09T16:00', now), true);
  assert.equal(isPastStart('2026-11-09T16:01', now), false);
  assert.equal(isPastStart('', now), false);
  assert.equal(isPastStart('2099-03-29T02:30', now), false);
});

test('le mot aux inscrits ne part qu’avec une partie modifiée, et le serveur le borne comme le formulaire', () => {
  const session = { id: '10000000-0000-4000-8000-000000000001', starts_at: '2026-10-02T17:00:00Z', ends_at: '2026-10-02T20:00:00Z' };
  assert.equal(checkSessionForm({ ...values, note: '  La salle change.  ' }, { session }).payload?.note, 'La salle change.');
  // A new game has nobody to write to; an empty note is not sent.
  assert.equal('note' in (checkSessionForm({ ...values, note: 'Bonjour' }, {}).payload ?? {}), false);
  assert.equal('note' in (checkSessionForm({ ...values, note: '   ' }, { session }).payload ?? {}), false);
  for (const note of ['', 'x', 'x'.repeat(2000), ` ${'x'.repeat(2000)} `, 'x'.repeat(2001)]) {
    const { errors, payload } = checkSessionForm({ ...values, note }, { session });
    const parsed = sessionSchema.safeParse({ ...checkSessionForm(values, { session }).payload, note });
    assert.equal(errors.note, parsed.success ? undefined : parsed.error.issues[0].message, JSON.stringify(note.length));
    if (payload) assert.equal(sessionSchema.safeParse(payload).success, true);
  }
  assert.equal(checkSessionForm({ ...values, note: 'x'.repeat(2001) }, { session }).errors.note, 'Le message aux inscrits tient en 2000 caractères au plus.');
});

test('une série modifiée part de sa prochaine date, garde la durée de ses parties et toujours un rythme', () => {
  const series = { id: '30000000-0000-4000-8000-000000000001', starts_at: '1970-01-01T00:00:00.000Z', ends_at: '1970-01-01T03:30:00.000Z' };
  const { payload } = checkSessionForm({ ...values, ...weekly, repeat: '2', ends_on: '2099-12-31' }, { series });
  assert.deepEqual(payload, {
    id: series.id, title: '', script: 'Trouble Brewing', starts_at: '2099-10-02T17:30:00.000Z', ends_at: '2099-10-02T21:00:00.000Z', location: 'Brest', address: '', venue_id: null, capacity: 15, visibility: 'public',
    every_weeks: 2, weeks_ahead: 4, ends_on: '2099-12-31',
  });
  assert.equal(seriesEditSchema.safeParse(payload).success, true);
  // The last date is compared with the next one; a series without a rhythm is refused.
  assert.deepEqual(checkSessionForm({ ...values, ...weekly, ends_on: '2099-10-01' }, { series }).errors, { ends_on: 'La dernière date doit suivre la prochaine partie.' });
  assert.deepEqual(checkSessionForm({ ...values, ...weekly, repeat: '' }, { series }).errors, { repeat: 'Choisis le rythme de la série.' });
  assert.deepEqual(checkSessionForm({ ...values, ...weekly, starts_at: '2020-10-02T19:30' }, { series }).errors, { starts_at: 'Choisis une date à venir.' });
});

test('le formulaire et le serveur refusent les mêmes modifications de série avec les mêmes mots', () => {
  const series = { id: '30000000-0000-4000-8000-000000000001', starts_at: '1970-01-01T00:00:00.000Z', ends_at: '1970-01-01T04:00:00.000Z' };
  const cases: Partial<SessionFormValues>[] = [{}, { repeat: '2' }, { repeat: '3' }, { weeks_ahead: '0' }, { weeks_ahead: '13' }, { ends_on: '2099-10-01' }, { ends_on: '2099-10-02' }, { ends_on: '2099-02-30' },
    { capacity: '2', weeks_ahead: '0' }, { starts_at: '2020-10-02T19:30' }, { script: '', location: '' }];
  for (const changes of cases) {
    const form = { ...values, ...weekly, ...changes };
    const { errors, message, payload } = checkSessionForm(form, { series });
    const startsAt = fromParisInput(form.starts_at);
    const parsed = seriesEditSchema.safeParse(payload ?? { id: series.id, title: form.title, script: form.script, starts_at: startsAt, ends_at: new Date(Date.parse(startsAt) + 4 * 3600000).toISOString(), location: form.location, address: form.address, venue_id: null,
      capacity: form.capacity.trim() ? Number(form.capacity) : NaN, visibility: form.visibility, every_weeks: Number(form.repeat), weeks_ahead: Number(form.weeks_ahead), ends_on: form.ends_on || null });
    const server: Record<string, string> = {};
    for (const issue of parsed.success ? [] : parsed.error.issues) server[String(issue.path[0] ?? '')] ??= issue.message;
    const client: Record<string, string> = { ...errors, ...(message ? { '': message } : {}) };
    if (client.repeat) { client.every_weeks = client.repeat; delete client.repeat; }
    assert.deepEqual(client, server, JSON.stringify(changes));
  }
});
