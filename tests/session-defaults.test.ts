import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextSessionStart, sessionEnd } from '../lib/session-defaults';
import { sessionSchema } from '../lib/schemas';

test('le préremplissage propose le vendredi à 19h30 en heure de Paris', () => {
  assert.equal(nextSessionStart(new Date('2026-10-01T12:00:00Z')), '2026-10-02T19:30');
  assert.equal(nextSessionStart(new Date('2026-10-02T17:29:00Z')), '2026-10-02T19:30');
  assert.equal(nextSessionStart(new Date('2026-10-02T17:30:00Z')), '2026-10-09T19:30');
  assert.equal(nextSessionStart(new Date('2026-11-06T18:29:00Z')), '2026-11-06T19:30');
});

test('la fin est calculée côté serveur à partir du seul début', () => {
  const start = '2099-10-02T17:30:00.000Z';
  const payload = { title: 'Soirée test', script: 'Trouble Brewing', starts_at: start, location: 'Brest', address: '', newcomer_seats: 3, release_hours: 72, visibility: 'public' };
  const parsed = sessionSchema.parse(payload);
  assert.equal(parsed.ends_at, '2099-10-02T21:30:00.000Z');
  assert.equal(parsed.capacity, 15);
  const edited = sessionEnd(start, { starts_at: '2026-10-02T17:00:00Z', ends_at: '2026-10-02T20:00:00Z' });
  assert.equal(edited, '2099-10-02T20:30:00.000Z');
  assert.equal(sessionSchema.parse({ ...payload, ends_at: edited }).ends_at, edited);
  assert.equal(sessionSchema.safeParse({ ...payload, ends_at: '2099-10-02T16:30:00Z' }).success, false);
});
