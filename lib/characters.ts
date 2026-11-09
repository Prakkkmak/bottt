import data from '@/data/characters.json';
import { baseScripts, characterId } from './scripts';

export type Team = 'townsfolk' | 'outsider' | 'minion' | 'demon' | 'traveller' | 'fabled' | 'loric';
export type Edition = 'tb' | 'bmr' | 'snv' | 'carousel' | 'other';
/**
 * A character of Blood on the Clocktower, from the official wiki and its French translation (scripts/fetch-characters.mjs
 * writes data/characters.json). The French name and ability are null where the translation has none yet.
 */
export type Character = {
  id: string; team: Team; edition: Edition;
  name_en: string; ability_en: string; wiki_en: string;
  name_fr: string | null; ability_fr: string | null; wiki_fr: string | null;
};

export const characters = data.characters as Character[];
const byId = new Map(characters.map(c => [c.id, c]));
export const characterById = (id: string) => byId.get(characterId(id));
export const knownCharacterIds: ReadonlySet<string> = new Set(byId.keys());

/** In the order of a script sheet: the good teams, the evil ones, then the characters outside the game's count. */
export const teams: { id: Team; label: string; label_en: string; note?: string; note_en?: string }[] = [
  { id: 'townsfolk', label: 'Villageois', label_en: 'Townsfolk', note: 'Bien', note_en: 'Good' }, { id: 'outsider', label: 'Marginaux', label_en: 'Outsiders', note: 'Bien', note_en: 'Good' },
  { id: 'minion', label: 'Sbires', label_en: 'Minions', note: 'Mal', note_en: 'Evil' }, { id: 'demon', label: 'Démons', label_en: 'Demons', note: 'Mal', note_en: 'Evil' },
  { id: 'traveller', label: 'Voyageurs', label_en: 'Travellers' }, { id: 'fabled', label: 'Légendaires', label_en: 'Fabled' }, { id: 'loric', label: 'Lorics', label_en: 'Loric' },
];
export const editions: { id: Edition; label: string }[] = [
  { id: 'tb', label: 'Trouble Brewing' }, { id: 'bmr', label: 'Bad Moon Rising' }, { id: 'snv', label: 'Sects & Violets' },
  { id: 'carousel', label: 'Le Carrousel (personnages expérimentaux)' }, { id: 'other', label: 'Autres personnages' },
];

/** The name a French reader looks for: the translation, else the official English name. */
export const displayName = (c: Character) => c.name_fr ?? c.name_en;
/** Characters by team in sheet order, each team in alphabetical order of its names in the language read. */
export function byTeam(list: Character[], language: 'fr' | 'en' = 'fr') {
  const name = language === 'en' ? (c: Character) => c.name_en : displayName;
  return teams.map(team => ({ ...team, characters: list.filter(c => c.team === team.id).sort((x, y) => name(x).localeCompare(name(y), language)) })).filter(t => t.characters.length);
}
export const charactersOf = (ids: readonly unknown[]) => ids.filter((id): id is string => typeof id === 'string').map(characterById).filter((c): c is Character => !!c);
/** The roles of a base script: every character of its edition, travellers included. */
export const baseScriptCharacters = (edition: (typeof baseScripts)[number]['edition']) => characters.filter(c => c.edition === edition);
/** What the role picker of « Organiser » needs, without the abilities, so that the page stays light. */
export const characterChoices = () => characters.map(({ id, team, edition, name_en, name_fr }) => ({ id, team, edition, name: name_fr || name_en, name_en }));
export type CharacterChoice = ReturnType<typeof characterChoices>[number];
