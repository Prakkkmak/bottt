import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapsUrl, splitAddress } from '../lib/locations';

test('les adresses texte ouvrent une recherche cartographique encodée', () => {
  const address = '1 rue de l’Église, Brest';
  const url = new URL(mapsUrl(address));
  assert.equal(url.searchParams.get('api'), '1');
  assert.equal(url.searchParams.get('query'), address);
});

test('les liens Maps partagés sont préservés dans une adresse privée existante', () => {
  const url = 'https://maps.app.goo.gl/Test?a=1&b=2';
  assert.deepEqual(splitAddress(`1 rue du Château, Brest\n${url}`), { address: '1 rue du Château, Brest', mapsUrl: url });
  assert.equal(mapsUrl(url), url);
  assert.equal(mapsUrl('https://maps.apple.com/?q=Brest'), 'https://maps.apple.com/?q=Brest');
  assert.equal(mapsUrl('https://www.waze.com/ul?ll=48.39,-4.49'), 'https://www.waze.com/ul?ll=48.39,-4.49');
  assert.equal(new URL(mapsUrl('javascript:alert(1)')).protocol, 'https:');
});
