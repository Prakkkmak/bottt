/** The three scripts of the base box: always offered, never edited. Their roles are the characters of their edition. */
export const baseScripts = [
  { slug: 'trouble-brewing', name: 'Trouble Brewing', edition: 'tb' },
  { slug: 'bad-moon-rising', name: 'Bad Moon Rising', edition: 'bmr' },
  { slug: 'sects-violets', name: 'Sects & Violets', edition: 'snv' },
] as const;

/** A script of the circle, added by an organizer: its name, who wrote it and its characters, by id (see lib/characters.ts). */
export type CustomScript = { id: string; name: string; slug: string; author: string; characters: string[] };

/** The address of a script's name: lower case letters and digits joined by dashes, accents dropped (« Cœur » gives coeur). */
export function scriptSlug(name: string) {
  return name.replace(/[œŒ]/g, 'oe').replace(/[æÆ]/g, 'ae').replace(/ß/g, 'ss').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100).replace(/-+$/, '');
}
/** The page that lists a script's roles, by the address it keeps. */
export const scriptPagePath = (slug: string) => `/apprendre/scripts/${slug}`;
// « Sects & Violets » is also written « Sects and Violets ».
const plain = (name: string) => scriptSlug(name.replace(/&/g, ' and '));
/** The base box's script a name stands for, however it is written. */
export const baseScriptOf = (name: string) => baseScripts.find(s => plain(s.name) === plain(name) || s.slug === scriptSlug(name));
/** A name the base box's scripts keep for themselves. */
export const isBaseScript = (name: string) => !!baseScriptOf(name);
/**
 * Where a game's script leads: the page of a base script, however its name is written, or of one of the circle's, by its
 * exact name. A name the site has no page for (a deleted script, a name typed before the list existed) leads nowhere.
 */
export function scriptHref(name: string, scripts: readonly Pick<CustomScript, 'name' | 'slug'>[]) {
  const base = baseScriptOf(name);
  if (base) return scriptPagePath(base.slug);
  const key = name.trim().toLowerCase();
  const own = key && scripts.find(s => s.name.toLowerCase() === key);
  return own ? scriptPagePath(own.slug) : null;
}

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
