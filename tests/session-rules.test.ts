import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sessionSchema } from '../lib/schemas';

const input = {
  title: 'Une soirée au village', script: 'Trouble Brewing',
  starts_at: '2050-10-01T18:00:00Z', ends_at: '2050-10-01T22:00:00Z',
  location: 'Brest', address: '', newcomer_seats: 3, release_hours: 72, visibility: 'public'
};

test('une partie se crée sans MJ désigné et propose quinze places', () => {
  const session = sessionSchema.parse(input);
  assert.equal(session.capacity, 15);
  assert.equal(Object.hasOwn(session, 'storyteller'), false);
});

test('la capacité et les quotas sont validés avant enregistrement', () => {
  for (const capacity of [6, 7.5, 21]) assert.equal(sessionSchema.safeParse({ ...input, capacity }).success, false);
  for (const capacity of [7, 15, 20]) assert.equal(sessionSchema.safeParse({ ...input, capacity }).success, true);
  assert.equal(sessionSchema.safeParse({ ...input, capacity: 7, newcomer_seats: 8 }).success, false);
});
