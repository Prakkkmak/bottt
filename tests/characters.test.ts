import { test } from 'node:test';
import assert from 'node:assert/strict';
import { characters, characterById, baseScriptCharacters, byTeam, charactersOf, knownCharacterIds, teams, editions } from '../lib/characters';
import { baseScripts, isBaseScript, readScriptTool, scriptHref, scriptSlug } from '../lib/scripts';
import { scriptSchema } from '../lib/schemas';

test('chaque personnage a un identifiant unique, une équipe, un module et sa capacité', () => {
  assert.ok(characters.length > 150);
  assert.equal(new Set(characters.map(c => c.id)).size, characters.length);
  const teamIds = new Set(teams.map(t => t.id)); const editionIds = new Set(editions.map(e => e.id));
  for (const c of characters) {
    assert.match(c.id, /^[a-z0-9]{1,40}$/, c.name_en);
    assert.ok(teamIds.has(c.team) && editionIds.has(c.edition), c.name_en);
    assert.ok(c.name_en && c.ability_en && c.wiki_en.startsWith('https://wiki.bloodontheclocktower.com/'), c.name_en);
    assert.ok(!c.wiki_fr || c.wiki_fr.startsWith('https://bambipotato.github.io/botc-fr-bambi/'), c.name_en);
  }
  // The Carousel is there too, with its own Demons.
  assert.ok(characters.some(c => c.edition === 'carousel' && c.team === 'demon'));
});

test('les trois scripts de base ont la composition de la boîte', () => {
  for (const s of baseScripts) {
    const count = (team: string) => baseScriptCharacters(s.edition).filter(c => c.team === team).length;
    assert.deepEqual([count('townsfolk'), count('outsider'), count('minion')], [13, 4, 4], s.name);
    assert.ok(count('demon') >= 1, s.name);
  }
  assert.deepEqual(baseScriptCharacters('tb').filter(c => c.team === 'demon').map(c => c.id), ['imp']);
});

test('un personnage se retrouve quelle que soit l’écriture de son identifiant', () => {
  assert.equal(characterById('fortune_teller')?.name_en, 'Fortune Teller');
  assert.equal(characterById('Fortune Teller')?.id, 'fortuneteller');
  assert.equal(characterById('inconnu'), undefined);
  assert.deepEqual(charactersOf(['imp', 'nope', 'washerwoman']).map(c => c.id), ['imp', 'washerwoman']);
  assert.deepEqual(charactersOf(['imp', null, 7, 'washerwoman']).map(c => c.id), ['imp', 'washerwoman']);
  // On a sheet: good teams first, then evil ones.
  assert.deepEqual(byTeam(charactersOf(['imp', 'poisoner', 'washerwoman', 'butler'])).map(t => t.id), ['townsfolk', 'outsider', 'minion', 'demon']);
});

test('l’adresse d’un script vient de son nom', () => {
  assert.equal(scriptSlug('Sects & Violets'), 'sects-violets');
  assert.equal(scriptSlug('  Les Nuits de Brest ! '), 'les-nuits-de-brest');
  assert.equal(scriptSlug('Été maudit'), 'ete-maudit');
  assert.equal(scriptSlug('Cœur de Brest'), scriptSlug('Coeur de Brest'));
  assert.equal(scriptSlug('Straße'), 'strasse');
  const own = [{ name: 'Les nuits de Brest', slug: 'les-nuits-de-brest' }];
  assert.equal(scriptHref('Trouble Brewing', own), '/apprendre/scripts/trouble-brewing');
  assert.equal(scriptHref('Sects and Violets', own), '/apprendre/scripts/sects-violets');
  assert.equal(scriptHref('les nuits de brest', own), '/apprendre/scripts/les-nuits-de-brest');
  // A deleted script, or a name typed before the list, has no page: no link to a 404.
  for (const name of ['Un script supprimé', 'TB', 'Trouble Brewing (débutants)', 'Ночь', ' ']) assert.equal(scriptHref(name, own), null);
  assert.ok(baseScripts.every(s => scriptSlug(s.name) === s.slug));
  assert.ok(isBaseScript('bad moon rising') && isBaseScript('Sects and Violets') && !isBaseScript('Les nuits de Brest'));
});

test('un script de l’outil officiel se lit, ses personnages inconnus mis de côté', () => {
  const tool = JSON.stringify([{ id: '_meta', name: 'Nuits bretonnes', author: 'Léa' }, 'washerwoman', { id: 'fortune_teller' }, 'imp', 'washerwoman', { id: 'homebrew_guy', name: 'Maison' }, 42]);
  assert.deepEqual(readScriptTool(tool, knownCharacterIds), { name: 'Nuits bretonnes', author: 'Léa', characters: ['washerwoman', 'fortuneteller', 'imp'], unknown: ['homebrew_guy'] });
  assert.throws(() => readScriptTool('pas du json', knownCharacterIds), /JSON/);
  assert.throws(() => readScriptTool('{"id":"imp"}', knownCharacterIds), /liste/);
});

test('un script du cercle a un nom à lui et des personnages connus', () => {
  const parsed = scriptSchema.parse({ name: '  Les   nuits de Brest ', author: ' Léa ', characters: ['imp', 'washerwoman', 'imp'] });
  assert.deepEqual(parsed, { name: 'Les nuits de Brest', author: 'Léa', characters: ['imp', 'washerwoman'], slug: 'les-nuits-de-brest' });
  const issue = (input: unknown) => { const r = scriptSchema.safeParse(input); return r.success ? undefined : r.error.issues[0].message; };
  assert.equal(issue({ name: 'a' }), 'Donne au script un nom de 2 à 100 caractères.');
  assert.equal(issue({ name: 'Trouble brewing' }), 'Ce nom est celui d’un script de base.');
  assert.equal(issue({ name: '!!' }), 'Donne au script un nom avec des lettres latines ou des chiffres.');
  assert.equal(issue({ name: 'Mon script', characters: ['imp', 'personne'] }), 'Un des personnages choisis est inconnu. Recharge la page et réessaie.');
  assert.equal(issue({ name: 'Mon script', author: 'x'.repeat(101) }), 'Le nom de l’auteur tient en 100 caractères au plus.');
});
