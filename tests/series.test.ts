import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupSessions, rhythmLabel, seriesSummary, stoppedSeriesMessage } from '../lib/series';

test('le rythme d’une série se dit avec son jour', () => {
  // 4 novembre 2026 : un mercredi.
  assert.equal(rhythmLabel(1, '2026-11-04'), 'Chaque mercredi');
  assert.equal(rhythmLabel(2, '2026-11-04'), 'Un mercredi sur deux');
  assert.equal(rhythmLabel(1, '2026-11-08'), 'Chaque dimanche');
  // While the start is being typed, the form still names a rhythm.
  assert.equal(rhythmLabel(1, ''), 'Chaque semaine');
  assert.equal(rhythmLabel(2, '2026-13-45'), 'Une semaine sur deux');
});

test('une série se résume en une ligne pour les organisateurs', () => {
  const series = { every_weeks: 1, first_date: '2026-11-04', starts_local: '19:30:00', weeks_ahead: 4, ends_on: null };
  assert.equal(seriesSummary(series), 'Chaque mercredi à 19h30 · dates ouvertes 4 semaines à l’avance');
  assert.equal(seriesSummary({ ...series, every_weeks: 2, weeks_ahead: 1, ends_on: '2027-06-23' }), 'Un mercredi sur deux à 19h30 · dates ouvertes 1 semaine à l’avance · jusqu’au 23 juin');
});

test('l’arrêt d’une série dit ce qu’il retire et ce qu’il garde', () => {
  assert.equal(stoppedSeriesMessage({ removed: 0, kept: 0 }), 'La série est arrêtée : aucune nouvelle date ne s’ouvrira.');
  assert.equal(stoppedSeriesMessage({ removed: 3, kept: 1 }), 'La série est arrêtée : aucune nouvelle date ne s’ouvrira. 3 dates sans inscrit sont retirées. 1 partie avec des inscrits reste prévue : annule-la si besoin.');
  assert.equal(stoppedSeriesMessage({ removed: 1, kept: 2 }), 'La série est arrêtée : aucune nouvelle date ne s’ouvrira. 1 date sans inscrit est retirée. 2 parties avec des inscrits restent prévues : annule-les si besoin.');
});

test('l’accueil montre la prochaine partie, puis les suivantes, puis les passées', () => {
  const now = Date.parse('2026-11-04T12:00:00Z');
  const game = (id: string, startsInDays: number, status: 'published' | 'cancelled' = 'published') => {
    const starts = now + startsInDays * 86400000;
    return { id, starts_at: new Date(starts).toISOString(), ends_at: new Date(starts + 4 * 3600000).toISOString(), status };
  };
  const sessions = [game('in-14', 14), game('in-7', 7), game('cancelled-2', 2, 'cancelled'), game('in-0', 0), game('ago-7', -7), game('ago-14', -14), game('ago-40', -40), game('ago-3-cancelled', -3, 'cancelled')];
  const ids = (list: { id: string }[]) => list.map(s => s.id);
  const groups = groupSessions(sessions, undefined, now);
  // A game under way is still the next one; cancelled ones and those over for more than 30 days are not listed.
  assert.equal(groups.next?.id, 'in-0');
  assert.deepEqual(ids(groups.following), ['in-7', 'in-14']);
  assert.deepEqual(ids(groups.past), ['ago-7', 'ago-14']);
  // A link to a cancelled or old game shows it where it belongs, never as the next one.
  assert.deepEqual(ids(groupSessions(sessions, 'cancelled-2', now).following), ['cancelled-2', 'in-7', 'in-14']);
  assert.equal(groupSessions(sessions, 'cancelled-2', now).next?.id, 'in-0');
  assert.deepEqual(ids(groupSessions(sessions, 'ago-40', now).past), ['ago-7', 'ago-14', 'ago-40']);
  assert.deepEqual(groupSessions([game('ago-1', -1)], undefined, now), { next: undefined, following: [], past: [game('ago-1', -1)] });
});
