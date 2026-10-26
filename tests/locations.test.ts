import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapsUrl, splitAddress } from '../lib/locations';

test('les adresses texte ouvrent une recherche OpenStreetMap encodée', () => {
  const address = '1 rue de l’Église, Brest';
  const url = new URL(mapsUrl(address));
  assert.equal(`${url.origin}${url.pathname}`, 'https://www.openstreetmap.org/search');
  assert.equal(url.searchParams.get('query'), address);
});

test('la recherche OpenStreetMap ne garde que l’adresse postale', () => {
  const search = (value: string) => new URL(mapsUrl(value)).searchParams.get('query');
  assert.equal(search('  12 rue de Siam, Brest  \r\nInterphone Dupont, 3e étage'), '12 rue de Siam, Brest');
  assert.equal(search('\n\n1 rue du Port, Brest\nCode 1234'), '1 rue du Port, Brest');
  assert.equal(search('12 rue de Siam\rCode 1234'), '12 rue de Siam');
  assert.equal(search('12 rue de Siam, 29200 Brest\nCode porte 12345'), '12 rue de Siam, 29200 Brest');
  assert.equal(search('12 rue de Siam\n29200 Brest\n3e étage'), '12 rue de Siam, 29200 Brest');
  assert.equal(search('Chez Marie, 3e étage\n12 rue de Siam\n29200 Brest'), '12 rue de Siam, 29200 Brest');
  assert.equal(search('29200 Brest'), '29200 Brest');
  assert.equal(search('Le Grenier · Brest centre'), 'Le Grenier · Brest centre');
  assert.equal(mapsUrl('1 rue du Port, Brest\nhttps://maps.app.goo.gl/x'), 'https://maps.app.goo.gl/x');
});

test('les liens Maps partagés sont préservés dans une adresse privée existante', () => {
  const url = 'https://maps.app.goo.gl/Test?a=1&b=2';
  assert.deepEqual(splitAddress(`1 rue du Château, Brest\n${url}`), { address: '1 rue du Château, Brest', mapsUrl: url });
  assert.equal(mapsUrl(url), url);
  assert.equal(mapsUrl('https://maps.apple.com/?q=Brest'), 'https://maps.apple.com/?q=Brest');
  assert.equal(mapsUrl('https://www.waze.com/ul?ll=48.39,-4.49'), 'https://www.waze.com/ul?ll=48.39,-4.49');
  assert.equal(new URL(mapsUrl('javascript:alert(1)')).protocol, 'https:');
});
