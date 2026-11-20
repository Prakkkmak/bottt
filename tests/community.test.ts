import { test } from 'node:test';
import assert from 'node:assert/strict';
import { communityLinks } from '../lib/community';

test('les groupes du cercle pointent vers leurs services, en HTTPS', () => {
  const hosts = Object.fromEntries(communityLinks.map(l => [l.id, new URL(l.href)]));
  assert.deepEqual(Object.keys(hosts), ['facebook', 'signal', 'discord']);
  for (const url of Object.values(hosts)) assert.equal(url.protocol, 'https:');
  assert.equal(hosts.facebook.hostname, 'www.facebook.com');
  assert.equal(hosts.signal.hostname, 'signal.group');
  assert.ok(hosts.signal.hash.length > 20, 'le lien Signal garde son invitation');
  assert.equal(hosts.discord.hostname, 'discord.gg');
});
