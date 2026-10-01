import { test } from 'node:test';
import assert from 'node:assert/strict';
import { externalCalendarUrl, sessionCalendar } from '../lib/calendar';
import { demoSessions } from '../lib/fixtures';

const session = { ...demoSessions()[0], starts_at: '2026-10-25T00:30:00.000Z', ends_at: '2026-10-25T04:30:00.000Z' };

test('les liens agenda encodent le lieu et gardent les instants UTC au changement d’heure', () => {
  const location = 'Brest, 1 rue de l’Église\nhttps://maps.app.goo.gl/test?a=1&b=2';
  const google = new URL(externalCalendarUrl('google', session, location));
  assert.equal(google.searchParams.get('dates'), '20261025T003000Z/20261025T043000Z');
  assert.equal(google.searchParams.get('ctz'), 'Europe/Paris');
  assert.equal(google.searchParams.get('location'), location);
  const outlook = new URL(externalCalendarUrl('outlook', session, location));
  assert.equal(outlook.searchParams.get('startdt'), session.starts_at);
  assert.equal(outlook.searchParams.get('enddt'), session.ends_at);
  assert.equal(outlook.searchParams.get('location'), location);
});

test('iCalendar échappe les retours à la ligne et replie les lignes sans couper les caractères UTF-8', () => {
  const title = `Soirée ${'Éléonore '.repeat(15)}; bluff, mystère\\jeu`;
  const calendar = sessionCalendar({ ...session, title }, 'Brest\r\nBEGIN:VEVENT\rAdresse', new Date('2026-10-01T12:00:00Z'));
  assert.ok(calendar.endsWith('\r\n'));
  for (const line of calendar.split('\r\n')) assert.ok(Buffer.byteLength(line, 'utf8') <= 75);
  const unfolded = calendar.replace(/\r\n /g, '');
  assert.ok(unfolded.includes('DTSTART:20261025T003000Z'));
  assert.ok(unfolded.includes('LOCATION:Brest\\nBEGIN:VEVENT\\nAdresse'));
  assert.ok(unfolded.includes('\\; bluff\\, mystère\\\\jeu'));
  assert.equal(unfolded.split('\r\n').filter(line => line === 'BEGIN:VEVENT').length, 1);
  assert.ok(unfolded.includes('Éléonore '.repeat(15)));
});
