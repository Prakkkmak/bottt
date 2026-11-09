/** The three scripts of the base box: always offered, never edited. Their roles are the characters of their edition. */
export const baseScripts = [
  { slug: 'trouble-brewing', name: 'Trouble Brewing', edition: 'tb' },
  { slug: 'bad-moon-rising', name: 'Bad Moon Rising', edition: 'bmr' },
  { slug: 'sects-violets', name: 'Sects & Violets', edition: 'snv' },
] as const;

/** A script of the circle, added by an organizer: its name, who wrote it and its characters, by id (see lib/characters.ts). */
export type CustomScript = { id: string; name: string; slug: string; author: string; characters: string[] };

/** The address of a script's name: lower case letters and digits joined by dashes, accents dropped. */
export function scriptSlug(name: string) {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100).replace(/-+$/, '');
}
/** The page that lists a script's roles. A game names its script, which leads there. */
export const scriptPath = (name: string) => `/apprendre/scripts/${scriptSlug(name)}`;
// « Sects & Violets » is also written « Sects and Violets ».
const plain = (name: string) => scriptSlug(name.replace(/&/g, ' and '));
/** A name the base box's scripts keep for themselves, however it is written. */
export const isBaseScript = (name: string) => baseScripts.some(s => plain(s.name) === plain(name) || s.slug === scriptSlug(name));

/** A character id as the official Script Tool writes it or not: lower case letters and digits only (« Fortune Teller », fortune_teller → fortuneteller). */
export const characterId = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Reads a script exported by the official Script Tool: a JSON list of character ids, or of objects with an id, led by an
 * optional { id: '_meta', name, author }. `characters` keeps, in order and once each, the ids found in `known`; `unknown`
 * lists the others (homebrew characters, typos), for the organizer to see what was left out.
 */
export function readScriptTool(text: string, known: ReadonlySet<string>) {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new Error('Ce texte n’est pas un script au format JSON. Copie-le depuis l’outil de script officiel.'); }
  if (!Array.isArray(parsed)) throw new Error('Ce JSON n’est pas une liste de personnages.');
  let name = ''; let author = '';
  const characters: string[] = []; const unknown: string[] = [];
  for (const entry of parsed) {
    const raw = typeof entry === 'string' ? entry : entry && typeof entry === 'object' && typeof (entry as { id?: unknown }).id === 'string' ? (entry as { id: string }).id : null;
    if (raw === null) continue;
    if (raw === '_meta') {
      const meta = entry as { name?: unknown; author?: unknown };
      if (typeof meta.name === 'string') name = meta.name.trim();
      if (typeof meta.author === 'string') author = meta.author.trim();
      continue;
    }
    const id = characterId(raw);
    if (known.has(id)) { if (!characters.includes(id)) characters.push(id); }
    else if (raw.trim() && !unknown.includes(raw.trim())) unknown.push(raw.trim());
  }
  return { name, author, characters, unknown };
}
