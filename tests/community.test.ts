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

test('les logos sont un fichier statique servi sans passer par le proxy', async () => {
  const { readFile } = await import('node:fs/promises');
  const sprite = await readFile(new URL('../public/community.svg', import.meta.url), 'utf8');
  for (const { id } of communityLinks) assert.match(sprite, new RegExp(`<symbol id="${id}" viewBox="0 0 24 24"><path d="[^"]+"/></symbol>`));
  const source = await readFile(new URL('../proxy.ts', import.meta.url), 'utf8');
  const matcher = new RegExp(`^${JSON.parse(`"${/matcher: \['(.*)'\]/.exec(source)![1]}"`)}$`);
  assert.ok(!matcher.test('/community.svg'));
  assert.ok(matcher.test('/community.svg.html'));
});
