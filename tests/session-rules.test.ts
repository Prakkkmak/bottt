import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sessionSchema } from '../lib/schemas';

const input = {
  title: 'Une soirée au village', script: 'Trouble Brewing',
  starts_at: '2050-10-01T18:00:00Z', ends_at: '2050-10-01T22:00:00Z',
  location: 'Brest', address: '', visibility: 'public'
};

test('une partie se crée sans MJ désigné et propose quinze places', () => {
  const session = sessionSchema.parse(input);
  assert.equal(session.capacity, 15);
  assert.equal(Object.hasOwn(session, 'storyteller'), false);
});

test('la capacité est validée avant enregistrement, sans quota par rang', () => {
  for (const capacity of [6, 7.5, 21]) assert.equal(sessionSchema.safeParse({ ...input, capacity }).success, false);
  for (const capacity of [7, 15, 20]) assert.equal(sessionSchema.safeParse({ ...input, capacity }).success, true);
  // The former quotas are not sent any more: the database keeps the stored values.
  const session = sessionSchema.parse({ ...input, capacity: 7, newcomer_seats: 8, release_hours: 72 });
  assert.deepEqual([Object.hasOwn(session, 'newcomer_seats'), Object.hasOwn(session, 'release_hours')], [false, false]);
});
