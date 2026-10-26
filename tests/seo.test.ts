import { test } from 'node:test';
import assert from 'node:assert/strict';
import { homeJsonLd, indexable, serializeJsonLd, sessionEvents, siteOrigin } from '../lib/seo';
import { demoSessions } from '../lib/fixtures';
import type { GameSession } from '../lib/types';

const origin = 'https://bottt.fr';
const now = Date.parse('2026-10-26T12:00:00Z');
const session = (changes: Partial<GameSession>): GameSession => ({ ...demoSessions()[0], id: 'a', title: '', script: 'Trouble Brewing', starts_at: '2026-10-30T18:30:00.000Z', ends_at: '2026-10-30T22:30:00.000Z', location: 'Le Grenier · Brest centre', status: 'published', visibility: 'public', capacity: 15, confirmed_count: 4, ...changes });

function withEnv(values: Record<string, string | undefined>, run: () => void) {
  const saved = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  try { run(); } finally { for (const [key, value] of Object.entries(saved)) if (value === undefined) delete process.env[key]; else process.env[key] = value; }
}

test('seules les parties publiques à venir sont décrites comme événements, annulées comprises, sans adresse privée', () => {
  const events = sessionEvents([
    session({ id: 'public' }),
    session({ id: 'members', visibility: 'members' }),
    session({ id: 'cancelled', status: 'cancelled' }),
    session({ id: 'past', starts_at: '2026-10-20T18:30:00.000Z', ends_at: '2026-10-20T22:30:00.000Z' })
  ], origin, now);
  assert.deepEqual(events.map(e => e.url), [`${origin}/?partie=public`, `${origin}/?partie=cancelled`]);
  assert.deepEqual(events.map(e => e.eventStatus), ['https://schema.org/EventScheduled', 'https://schema.org/EventCancelled']);
  const [event] = events;
  assert.equal(event.name, 'Blood on the Clocktower : Trouble Brewing');
  assert.equal(event.startDate, '2026-10-30T18:30:00.000Z');
  assert.deepEqual(event.location, { '@type': 'Place', name: 'Le Grenier · Brest centre', address: { '@type': 'PostalAddress', addressLocality: 'Brest', addressRegion: 'Bretagne', addressCountry: 'FR' } });
  assert.equal(event.remainingAttendeeCapacity, 11);
});

test('le nom d’une partie garde le jeu en vue sans le répéter', () => {
  const names = sessionEvents([session({ id: 'b', title: 'Soirée d’Halloween' }), session({ id: 'c', title: 'Blood on the Clocktower spécial débutants' }), session({ id: 'd', confirmed_count: 18, capacity: 15 })], origin, now);
  assert.deepEqual(names.map(e => e.name), ['Soirée d’Halloween · Blood on the Clocktower', 'Blood on the Clocktower spécial débutants', 'Blood on the Clocktower : Trouble Brewing']);
  assert.equal(names[2].remainingAttendeeCapacity, 0);
});

test('les données structurées ne peuvent pas fermer la balise script', () => {
  const json = serializeJsonLd(homeJsonLd([session({ title: '</script><script>alert(1)</script>' })], origin, now));
  assert.ok(!json.includes('<'));
  assert.equal(JSON.parse(json)['@graph'][2].name, '</script><script>alert(1)</script> · Blood on the Clocktower');
});

test('l’adresse du site vient de la configuration, sinon du domaine de production Vercel', () => {
  withEnv({ NEXT_PUBLIC_SITE_URL: 'https://bottt.fr/', VERCEL_PROJECT_PRODUCTION_URL: 'bottt.vercel.app' }, () => assert.equal(siteOrigin(), 'https://bottt.fr'));
  withEnv({ NEXT_PUBLIC_SITE_URL: undefined, VERCEL_PROJECT_PRODUCTION_URL: 'bottt.vercel.app' }, () => assert.equal(siteOrigin(), 'https://bottt.vercel.app'));
  withEnv({ NEXT_PUBLIC_SITE_URL: 'bottt.fr', VERCEL_PROJECT_PRODUCTION_URL: undefined }, () => assert.equal(siteOrigin(), 'http://127.0.0.1:3000'));
});

test('seule la production est proposée aux moteurs de recherche', () => {
  withEnv({ VERCEL_ENV: 'production' }, () => assert.equal(indexable(), true));
  withEnv({ VERCEL_ENV: 'preview' }, () => assert.equal(indexable(), false));
  withEnv({ VERCEL_ENV: undefined }, () => assert.equal(indexable(), true));
});
