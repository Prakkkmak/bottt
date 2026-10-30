import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapLinks, splitAddress } from '../lib/locations';

const links = (value: string) => mapLinks(value).map(link => [link.label, link.href]);
const searches = (value: string) => mapLinks(value).map(link => new URL(link.href).searchParams.get('query'));

test('les adresses texte ouvrent une recherche OpenStreetMap et une recherche Google Maps encodées', () => {
  const address = '1 rue de l’Église, Brest';
  const [osm, google] = mapLinks(address).map(link => ({ label: link.label, url: new URL(link.href) }));
  assert.equal(osm.label, 'OpenStreetMap');
  assert.equal(`${osm.url.origin}${osm.url.pathname}`, 'https://www.openstreetmap.org/search');
  assert.equal(osm.url.searchParams.get('query'), address);
  assert.equal(google.label, 'Google Maps');
  assert.equal(`${google.url.origin}${google.url.pathname}`, 'https://www.google.com/maps/search/');
  assert.equal(google.url.searchParams.get('api'), '1');
  assert.equal(google.url.searchParams.get('query'), address);
  assert.equal(mapLinks(address).length, 2);
});

test('les recherches ne gardent que l’adresse postale', () => {
  const search = (value: string) => {
    const queries = searches(value);
    assert.equal(queries[0], queries[1]);
    return queries[0];
  };
  assert.equal(search('  12 rue de Siam, Brest  \r\nInterphone Dupont, 3e étage'), '12 rue de Siam, Brest');
  assert.equal(search('\n\n1 rue du Port, Brest\nCode 1234'), '1 rue du Port, Brest');
  assert.equal(search('12 rue de Siam\rCode 1234'), '12 rue de Siam');
  assert.equal(search('12 rue de Siam, 29200 Brest\nCode porte 12345'), '12 rue de Siam, 29200 Brest');
  assert.equal(search('12 rue de Siam\n29200 Brest\n3e étage'), '12 rue de Siam, 29200 Brest');
  assert.equal(search('Chez Marie, 3e étage\n12 rue de Siam\n29200 Brest'), '12 rue de Siam, 29200 Brest');
  assert.equal(search('29200 Brest'), '29200 Brest');
  assert.equal(search('Le Grenier · Brest centre'), 'Le Grenier · Brest centre');
});

test('un lien collé remplace la recherche de son service, ou s’ajoute aux deux', () => {
  const osm = 'https://www.openstreetmap.org/search?query=1%20rue%20du%20Port%2C%20Brest';
  const google = 'https://www.google.com/maps/search/?api=1&query=1%20rue%20du%20Port%2C%20Brest';
  assert.deepEqual(links('1 rue du Port, Brest\nhttps://maps.app.goo.gl/x'), [['OpenStreetMap', osm], ['Google Maps', 'https://maps.app.goo.gl/x']]);
  assert.deepEqual(links('1 rue du Port, Brest\nhttps://www.google.fr/maps/place/x'), [['OpenStreetMap', osm], ['Google Maps', 'https://www.google.fr/maps/place/x']]);
  assert.deepEqual(links('1 rue du Port, Brest\nhttps://osm.org/go/x'), [['OpenStreetMap', 'https://osm.org/go/x'], ['Google Maps', google]]);
  assert.deepEqual(links('1 rue du Port, Brest\nhttps://maps.apple.com/?q=Brest'), [['OpenStreetMap', osm], ['Google Maps', google], ['Apple Plans', 'https://maps.apple.com/?q=Brest']]);
  assert.deepEqual(links('1 rue du Port, Brest\nhttps://www.mappy.com/plan/x'), [['OpenStreetMap', osm], ['Google Maps', google], ['mappy.com', 'https://www.mappy.com/plan/x']]);
  assert.deepEqual(links('https://www.waze.com/ul?ll=48.39,-4.49'), [['Waze', 'https://www.waze.com/ul?ll=48.39,-4.49']]);
  assert.deepEqual(links('https://notgoogle.com/maps'), [['notgoogle.com', 'https://notgoogle.com/maps']]);
  assert.deepEqual(links('  '), []);
});

test('les liens Maps partagés sont préservés dans une adresse privée existante', () => {
  const url = 'https://maps.app.goo.gl/Test?a=1&b=2';
  assert.deepEqual(splitAddress(`1 rue du Château, Brest\n${url}`), { address: '1 rue du Château, Brest', mapsUrl: url });
  assert.deepEqual(links(url), [['Google Maps', url]]);
  for (const link of mapLinks('javascript:alert(1)')) assert.equal(new URL(link.href).protocol, 'https:');
});
