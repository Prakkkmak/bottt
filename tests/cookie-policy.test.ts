import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isCookiePolicyAcknowledged, cookiePolicyAcknowledgement } from '../lib/cookie-policy';

test('la validation expire après six mois et doit être renouvelée si la version change', () => {
  const acknowledgement = cookiePolicyAcknowledgement(new Date('2026-10-01T12:00:00Z'));
  assert.equal(isCookiePolicyAcknowledged(acknowledgement, Date.parse('2027-03-31T12:00:00Z')), true);
  assert.equal(isCookiePolicyAcknowledged(acknowledgement, Date.parse('2027-04-01T12:00:00Z')), false);
  assert.equal(isCookiePolicyAcknowledged(JSON.stringify({ version: 0, expiresAt: Date.parse('2099-01-01') })), false);
});

test('un stockage absent ou malformé redemande la validation', () => {
  for (const value of [null, '', 'invalid', 'null', '[]', '{}', '{"version":1,"expiresAt":"2099"}']) assert.equal(isCookiePolicyAcknowledged(value), false);
});
