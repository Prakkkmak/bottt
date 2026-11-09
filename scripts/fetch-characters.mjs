#!/usr/bin/env node
// Builds data/characters.json: every Blood on the Clocktower character, English + French, which the pages of « Apprendre »
// and the scripts of « Organiser » read (lib/characters.ts). Run it again when new characters come out, then review the diff.
//
//   node scripts/fetch-characters.mjs [--out data/characters.json] [--cache <dir>] [--verbose]
//
// Plain Node 22 ESM, no dependencies.
// English: the official wiki (MediaWiki API, wikitext of each character page).
// French:  the fan translation at bambipotato.github.io/botc-fr-bambi (one HTML page per role).
// --cache <dir> keeps every downloaded page on disk and reuses it on the next run (handy while
// tweaking the parser; leave it out to always fetch fresh copies).

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const argValue = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const OUT = argValue('--out') ? path.resolve(argValue('--out')) : path.resolve(HERE, '../data/characters.json');
const CACHE = argValue('--cache') ? path.resolve(argValue('--cache')) : null;
const VERBOSE = args.includes('--verbose');

const WIKI = 'https://wiki.bloodontheclocktower.com';
const WIKI_API = `${WIKI}/api.php`;
const FR_BASE = 'https://bambipotato.github.io/botc-fr-bambi/';
const USER_AGENT = 'BOTTT character list builder (Node fetch)';

const TEAM_CATEGORIES = {
  Townsfolk: 'townsfolk',
  Outsiders: 'outsider',
  Minions: 'minion',
  Demons: 'demon',
  Travellers: 'traveller',
  Fabled: 'fabled',
  Loric: 'loric',
};
const EDITION_CATEGORIES = {
  'Trouble Brewing': 'tb',
  'Bad Moon Rising': 'bmr',
  'Sects & Violets': 'snv',
};
const EXPERIMENTAL_CATEGORY = 'Experimental Characters';
// Base-edition Travellers are not in the edition categories; their page shows the edition logo
// under "Appears in" instead.
const EDITION_LOGOS = {
  'trouble brewing': 'tb',
  'bad moon rising': 'bmr',
  'sects & violets': 'snv',
  'sects and violets': 'snv',
};

// Wiki pages that sit in a character category but are not characters of their own.
const EXCLUDED_WIKI_PAGES = {
  Qutler:
    'April Fools page (created 2026-04-01): a copy of the Butler with the name changed; not a real character.',
  'God of Ug (Ug Mode)':
    'Joke rewrite of the God of Ug page in "Ug" speak; same character as God of Ug, which is kept.',
};

const FR_INDEX_PAGES = [
  'villageois.html',
  'etrangers.html',
  'sbires.html',
  'demons.html',
  'voyageurs/voyageurs.html',
  'legendaire.html',
  'loric.html',
  'trouble_brewing.html',
  'bmr.html',
  'sv.html',
  'experimentaux.html',
];
// Folders that hold one page per role on the French site.
const FR_ROLE_DIRS = [
  'tb_roles/',
  'bmr_roles/',
  'sv_roles/',
  'roles_experimentaux/',
  'legendaire_roles/',
  'loric_roles/',
  'voyageurs/',
];
const FR_NOT_ROLES = new Set(['voyageurs/voyageurs.html']);
const FR_TEAM_BY_INDEX = {
  'villageois.html': 'townsfolk',
  'etrangers.html': 'outsider',
  'sbires.html': 'minion',
  'demons.html': 'demon',
  'voyageurs/voyageurs.html': 'traveller',
  'legendaire.html': 'fabled',
  'loric.html': 'loric',
};

// ---------------------------------------------------------------- helpers

const toId = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, '');

const log = (...a) => console.log(...a);
const debug = (...a) => VERBOSE && console.log(...a);

async function fetchText(url, { attempts = 4 } = {}) {
  let cacheFile = null;
  if (CACHE) {
    cacheFile = path.join(CACHE, crypto.createHash('sha1').update(url).digest('hex') + '.txt');
    if (fs.existsSync(cacheFile)) return fs.readFileSync(cacheFile, 'utf8');
  }
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      const text = await res.text();
      if (cacheFile) {
        fs.mkdirSync(CACHE, { recursive: true });
        fs.writeFileSync(cacheFile, text);
      }
      return text;
    } catch (e) {
      lastError = e;
      if (/HTTP 404/.test(e.message)) break;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
    }
  }
  throw lastError;
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', thinsp: ' ',
  ensp: ' ', emsp: ' ', rsquo: '’', lsquo: '‘', ldquo: '“',
  rdquo: '”', laquo: '«', raquo: '»', hellip: '…', ndash: '–',
  mdash: '—', middot: '·', bull: '•', rarr: '→', larr: '←',
  eacute: 'é', egrave: 'è', ecirc: 'ê', euml: 'ë', agrave: 'à', aacute: 'á', acirc: 'â',
  auml: 'ä', ccedil: 'ç', icirc: 'î', iuml: 'ï', igrave: 'ì', ocirc: 'ô', ouml: 'ö',
  ograve: 'ò', ucirc: 'û', ugrave: 'ù', uuml: 'ü', oelig: 'œ', aelig: 'æ', yuml: 'ÿ',
  Eacute: 'É', Egrave: 'È', Ecirc: 'Ê', Agrave: 'À', Acirc: 'Â', Ccedil: 'Ç', Icirc: 'Î',
  Ocirc: 'Ô', Ucirc: 'Û', OElig: 'Œ', AElig: 'Æ', deg: '°', times: '×', copy: '©',
};
const unknownEntities = new Set();
function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return String.fromCodePoint(code);
    }
    if (e in NAMED_ENTITIES) return NAMED_ENTITIES[e];
    unknownEntities.add(m);
    return m;
  });
}

// HTML fragment -> plain text on one line (tags dropped, entities decoded, whitespace collapsed).
function htmlToText(html) {
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/[ \t\r\n]+/g, ' ')
    .trim();
}

// Remove one pair of enclosing quotes (straight, curly or guillemets) and the spaces inside them.
function stripOuterQuotes(s, open, close) {
  let t = s.trim();
  if (open.includes(t[0])) t = t.slice(1);
  if (close.includes(t[t.length - 1])) t = t.slice(0, -1);
  return t.replace(/^[\s  ]+|[\s  ]+$/g, '');
}

// ---------------------------------------------------------------- English wiki

async function wikiApi(params) {
  const qs = new URLSearchParams({ format: 'json', formatversion: '2', ...params });
  return JSON.parse(await fetchText(`${WIKI_API}?${qs}`));
}

async function categoryMembers(category) {
  const titles = [];
  let cont = {};
  for (;;) {
    const r = await wikiApi({
      action: 'query',
      list: 'categorymembers',
      cmtitle: `Category:${category}`,
      cmlimit: '500',
      cmnamespace: '0',
      ...cont,
    });
    titles.push(...r.query.categorymembers.map((m) => m.title));
    if (!r.continue) break;
    cont = r.continue;
  }
  return titles;
}

async function pageContents(titles) {
  const pages = new Map();
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const r = await wikiApi({
      action: 'query',
      prop: 'revisions|info',
      rvprop: 'content',
      rvslots: 'main',
      inprop: 'url',
      titles: batch.join('|'),
    });
    for (const p of r.query.pages) {
      if (p.missing) throw new Error(`Wiki page missing: ${p.title}`);
      pages.set(p.title, { url: p.fullurl, wikitext: p.revisions[0].slots.main.content });
    }
  }
  return pages;
}

// Turn the wikitext of an ability line into the text a reader sees on the page.
const wikiMarkupNotes = [];
function wikiInlineToText(s, title) {
  const before = s;
  let t = s
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\/?nowiki\s*\/?>/gi, '')
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1') // [[target|label]] / [[target]]
    .replace(/\[(?:https?:)?\/\/\S+\s+([^\]]*)\]/g, '$1') // [url label]
    .replace(/'''''|'''|''/g, '') // bold / italics
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '');
  t = decodeEntities(t).replace(/[ \t]+/g, ' ').trim();
  if (t !== before.trim()) wikiMarkupNotes.push({ title, wikitext: before.trim(), text: t });
  return t;
}

function extractWikiAbility(title, wikitext) {
  const m = wikitext.match(/^==\s*Summary\s*==\s*$/m);
  if (!m) return null;
  const after = wikitext.slice(m.index + m[0].length).split('\n');
  for (const raw of after) {
    const line = raw.trim();
    if (!line) continue;
    if (/^==/.test(line)) return null; // reached the next section without a quote
    if (/^["“]/.test(line)) {
      return stripOuterQuotes(wikiInlineToText(line, title), '"“', '"”');
    }
    // First non-empty line is not a quote: keep looking a few lines (some pages put a <div> first).
    if (/^</.test(line)) continue;
    return null;
  }
  return null;
}

function wikiEdition(title, categoriesByTitle, wikitext) {
  const cats = categoriesByTitle.get(title) ?? new Set();
  if (cats.has(EXPERIMENTAL_CATEGORY)) return 'carousel';
  for (const [cat, ed] of Object.entries(EDITION_CATEGORIES)) if (cats.has(cat)) return ed;
  const appears = wikitext.match(/Appears in<\/span>([\s\S]*?)<\/div>/);
  if (appears) {
    for (const link of appears[1].matchAll(/link=([^\]|]+)/g)) {
      const ed = EDITION_LOGOS[link[1].trim().toLowerCase()];
      if (ed) return ed;
    }
  }
  return 'other';
}

async function loadEnglish() {
  const categoriesByTitle = new Map();
  const teamByTitle = new Map();
  for (const cat of [...Object.keys(TEAM_CATEGORIES), ...Object.keys(EDITION_CATEGORIES), EXPERIMENTAL_CATEGORY]) {
    for (const title of await categoryMembers(cat)) {
      if (!categoriesByTitle.has(title)) categoriesByTitle.set(title, new Set());
      categoriesByTitle.get(title).add(cat);
      const team = TEAM_CATEGORIES[cat];
      if (team) {
        if (teamByTitle.has(title) && teamByTitle.get(title) !== team) {
          throw new Error(`${title} is in two team categories`);
        }
        teamByTitle.set(title, team);
      }
    }
  }
  const pagesWithoutTeam = [...categoriesByTitle.keys()].filter((t) => !teamByTitle.has(t));

  const excluded = [];
  const titles = [...teamByTitle.keys()].filter((t) => {
    if (EXCLUDED_WIKI_PAGES[t]) {
      excluded.push({ source: 'wiki_en', title: t, url: `${WIKI}/${encodeURIComponent(t.replace(/ /g, '_'))}`, reason: EXCLUDED_WIKI_PAGES[t] });
      return false;
    }
    return true;
  });
  const pages = await pageContents(titles);

  const characters = [];
  const problems = [];
  for (const title of titles) {
    const page = pages.get(title);
    const ability = extractWikiAbility(title, page.wikitext);
    if (!ability) problems.push(`No ability found on wiki page ${title}`);
    characters.push({
      id: toId(title),
      team: teamByTitle.get(title),
      edition: wikiEdition(title, categoriesByTitle, page.wikitext),
      name_en: title,
      ability_en: ability,
      wiki_en: page.url,
    });
  }
  const ids = new Map();
  for (const c of characters) {
    if (ids.has(c.id)) problems.push(`Duplicate id ${c.id}: ${ids.get(c.id)} / ${c.name_en}`);
    ids.set(c.id, c.name_en);
  }
  return { characters, excluded, problems, pagesWithoutTeam };
}

// ---------------------------------------------------------------- French site

function frRolePath(href, pageUrl) {
  const abs = new URL(href, pageUrl);
  if (!abs.href.startsWith(FR_BASE)) return null;
  const rel = decodeURIComponent(abs.pathname.slice(new URL(FR_BASE).pathname.length));
  if (!rel.endsWith('.html') || FR_NOT_ROLES.has(rel)) return null;
  if (!FR_ROLE_DIRS.some((d) => rel.startsWith(d) && !rel.slice(d.length).includes('/'))) return null;
  return rel;
}

function mainContent(html) {
  const start = html.search(/<main[\s>]/i);
  const end = html.search(/<\/main>/i);
  return start >= 0 ? html.slice(start, end > start ? end : undefined) : html;
}

function parseFrenchRole(rel, html) {
  const main = mainContent(html);
  const url = FR_BASE + rel;

  // "Nom original : <a href="https://wiki.bloodontheclocktower.com/Fortune_Teller">Fortune Teller</a>"
  let originalName = null;
  let originalUrl = null;
  const orig = main.match(/Nom original\s*:?\s*<\/strong>\s*:?\s*(?:<em>\s*)?(?:<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>|([^<]+))/i);
  if (orig) {
    originalUrl = orig[1] ?? null;
    originalName = htmlToText(orig[2] ?? orig[3] ?? '') || null;
  }

  // Header icon: <img src="../images/Icon_fortuneteller.png" alt="Voyante">
  const icon = main.match(/<img\b[^>]*src="[^"]*\/[Ii]con_([^"/.]+)\.png"[^>]*>/);
  const iconId = icon ? toId(icon[1]) : null;
  const iconAlt = icon ? (icon[0].match(/alt="([^"]*)"/) ?? [])[1] : null;

  // Name shown in big under the icon (may carry an emoji in front).
  let headerName = null;
  if (icon) {
    const afterIcon = main.slice(main.indexOf(icon[0]) + icon[0].length);
    const span = afterIcon.match(/<span\b[^>]*>([\s\S]*?)<\/span>/);
    if (span) headerName = htmlToText(span[1]);
  }
  const titleTag = (html.match(/<title>([\s\S]*?)<\/title>/i) ?? [])[1];

  // Ability: the paragraph opening with « right after the "Résumé" heading. A few pages print it
  // without the guillemets; then it is the first paragraph after the heading, before the flavour
  // paragraph (class "botc-flavour-text").
  let ability = null;
  let abilityNote = null;
  const resume = main.search(/<h[1-6]\b[^>]*>(?:(?!<\/h[1-6]>)[\s\S])*R[ée]sum[ée]/i);
  const scope = resume >= 0 ? main.slice(resume) : main;
  const paragraphs = [...scope.matchAll(/<(p|div|blockquote)\b([^>]*)>([\s\S]*?)<\/\1>/gi)]
    .map((p) => ({ attrs: p[2], text: htmlToText(p[3]) }))
    .filter((p) => p.text);
  const quoted = paragraphs.findIndex((p) => /^[«"“]/.test(p.text));
  if (quoted >= 0) {
    ability = stripOuterQuotes(paragraphs[quoted].text, '«"“', '»"”');
    if (quoted > 0) abilityNote = `ability is paragraph #${quoted + 1} after the Résumé heading`;
  } else if (paragraphs[0] && !/botc-flavour-text/.test(paragraphs[0].attrs)) {
    ability = paragraphs[0].text;
    abilityNote = 'ability printed without « » on the page; took the first paragraph after the Résumé heading';
  }

  // The big name under the icon is what the page shows (it matches <title> and the index cards);
  // the icon's alt text is often a stale or English name, so it is only a last resort.
  const name = cleanFrenchName(headerName) || cleanFrenchName(titleTag) || cleanFrenchName(iconAlt);
  return { rel, url, name, headerName, iconAlt, titleTag, iconId, originalName, originalUrl, ability, abilityNote };
}

function cleanFrenchName(s) {
  if (!s) return null;
  // Drop leading emoji / symbols ("🤸 Acrobate").
  const t = decodeEntities(s).replace(/^[^\p{L}\p{N}]+/u, '').replace(/\s+/g, ' ').trim();
  return t || null;
}

async function loadFrench() {
  const roleSources = new Map(); // rel -> Set(index page)
  for (const index of FR_INDEX_PAGES) {
    const pageUrl = FR_BASE + index;
    const html = mainContent(await fetchText(pageUrl));
    for (const m of html.matchAll(/href="([^"#]+)(?:#[^"]*)?"/g)) {
      const rel = frRolePath(m[1], pageUrl);
      if (!rel) continue;
      if (!roleSources.has(rel)) roleSources.set(rel, new Set());
      roleSources.get(rel).add(index);
    }
  }
  const rels = [...roleSources.keys()].sort();
  const roles = await mapLimit(rels, 6, async (rel) => {
    const linkedFrom = [...roleSources.get(rel)];
    try {
      const role = parseFrenchRole(rel, await fetchText(FR_BASE + rel));
      const teams = linkedFrom.map((i) => FR_TEAM_BY_INDEX[i]).filter(Boolean);
      role.team = teams[0] ?? null;
      role.linkedFrom = linkedFrom;
      return role;
    } catch (e) {
      return { rel, url: FR_BASE + rel, linkedFrom, error: e.message };
    }
  });
  return roles;
}

// Which English character is this French page about?
function frenchCandidates(role) {
  const out = [];
  if (role.originalUrl && role.originalUrl.startsWith(WIKI)) {
    const t = decodeURIComponent(role.originalUrl.slice(WIKI.length + 1).split(/[?#]/)[0]).replace(/_/g, ' ');
    out.push(['wiki link', toId(t)]);
  }
  if (role.originalName) out.push(['original name', toId(role.originalName)]);
  if (role.iconId) out.push(['icon file', role.iconId]);
  out.push(['page file', toId(path.posix.basename(role.rel, '.html'))]);
  return out;
}

// ---------------------------------------------------------------- main

async function main() {
  log('Fetching the English wiki…');
  const en = await loadEnglish();
  log(`  ${en.characters.length} characters, ${en.excluded.length} excluded pages`);

  log('Fetching the French site…');
  const fr = await loadFrench();
  log(`  ${fr.length} role pages`);

  const byId = new Map(en.characters.map((c) => [c.id, c]));
  const matchedFrench = new Map(); // id -> role
  const unmatchedFr = [];
  const matchNotes = [];
  const frProblems = [];

  const brokenLinks = [];
  for (const role of fr) {
    if (role.error) {
      if (/HTTP 404/.test(role.error)) {
        // A dead link on an index page; the role itself is normally reachable under another file name.
        brokenLinks.push({ url: role.url, linked_from: role.linkedFrom.map((i) => FR_BASE + i) });
      } else {
        frProblems.push(`${role.rel}: ${role.error}`);
        unmatchedFr.push({ name_fr: null, url: role.url, reason: role.error });
      }
      continue;
    }
    if (role.abilityNote) matchNotes.push(`${role.rel}: ${role.abilityNote}`);
    const titleName = cleanFrenchName(role.titleTag);
    if (titleName && titleName.toLowerCase() !== role.name.toLowerCase()) {
      matchNotes.push(`${role.rel}: name "${role.name}" (the page <title> says "${titleName}")`);
    }
    const cands = frenchCandidates(role);
    const hit = cands.find(([, id]) => byId.has(id));
    if (!hit) {
      unmatchedFr.push({
        name_fr: role.name,
        original_name: role.originalName,
        url: role.url,
        reason: `no English character for ${cands.map(([how, id]) => `${how}=${id}`).join(', ')}`,
      });
      continue;
    }
    const [how, id] = hit;
    const disagreeing = cands.filter(([, other]) => byId.has(other) && other !== id);
    if (disagreeing.length) {
      matchNotes.push(`${role.rel}: matched ${id} by ${how}, but ${disagreeing.map(([h, o]) => `${h}=${o}`).join(', ')}`);
    }
    if (how !== 'wiki link') matchNotes.push(`${role.rel}: matched ${id} by ${how} (no usable "Nom original" wiki link)`);
    if (matchedFrench.has(id)) {
      frProblems.push(`${id} has two French pages: ${matchedFrench.get(id).rel} and ${role.rel}`);
      continue;
    }
    if (role.team && role.team !== byId.get(id).team) {
      matchNotes.push(`${role.rel}: French site lists it as ${role.team}, wiki says ${byId.get(id).team}`);
    }
    if (!role.ability) frProblems.push(`${role.rel}: no French ability found`);
    if (!role.name) frProblems.push(`${role.rel}: no French name found`);
    matchedFrench.set(id, role);
  }

  const teamOrder = Object.values(TEAM_CATEGORIES);
  const editionOrder = ['tb', 'bmr', 'snv', 'carousel', 'other'];
  const characters = en.characters
    .map((c) => {
      const role = matchedFrench.get(c.id);
      return {
        ...c,
        name_fr: role?.name ?? null,
        ability_fr: role?.ability ?? null,
        wiki_fr: role?.url ?? null,
      };
    })
    .sort(
      (a, b) =>
        teamOrder.indexOf(a.team) - teamOrder.indexOf(b.team) ||
        editionOrder.indexOf(a.edition) - editionOrder.indexOf(b.edition) ||
        a.name_en.localeCompare(b.name_en, 'en'),
    );

  const unmatchedEn = characters.filter((c) => !c.wiki_fr).map((c) => c.name_en);

  const result = {
    fetched_at: new Date().toISOString(),
    sources: {
      en: `${WIKI}/ (official Blood on the Clocktower wiki, The Pandemonium Institute)`,
      fr: `${FR_BASE} (Wiki Blood on the Clocktower FR, fan translation)`,
    },
    characters,
    unmatched: {
      en_without_fr: unmatchedEn,
      fr_without_en: unmatchedFr,
    },
    excluded: en.excluded,
    fr_broken_links: brokenLinks,
  };
  fs.writeFileSync(OUT, JSON.stringify(result, null, 2) + '\n', 'utf8');

  // ------------------------------------------------------------ report
  const count = (key) =>
    Object.fromEntries(
      [...new Set(characters.map((c) => c[key]))].map((k) => [k, characters.filter((c) => c[key] === k).length]),
    );
  log(`\nWrote ${path.relative(process.cwd(), OUT) || OUT}: ${characters.length} characters`);
  log('  per team:   ', JSON.stringify(count('team')));
  log('  per edition:', JSON.stringify(count('edition')));
  log(`  with French text: ${characters.filter((c) => c.ability_fr).length}, with French name: ${characters.filter((c) => c.name_fr).length}`);
  log(`  English without French (${unmatchedEn.length}): ${unmatchedEn.join(', ') || '-'}`);
  log(`  French without English (${unmatchedFr.length}): ${unmatchedFr.map((u) => u.name_fr ?? u.url).join(', ') || '-'}`);
  for (const u of unmatchedFr) debug('    ', JSON.stringify(u));
  if (brokenLinks.length) log(`  Dead links on the French site (${brokenLinks.length}): ${brokenLinks.map((b) => `${b.url} (from ${b.linked_from.join(', ')})`).join('; ')}`);
  const problems = [...en.problems, ...frProblems];
  if (en.pagesWithoutTeam.length) problems.push(`Wiki pages in an edition category but no team: ${en.pagesWithoutTeam.join(', ')}`);
  if (unknownEntities.size) problems.push(`Unknown HTML entities left as is: ${[...unknownEntities].join(' ')}`);
  if (problems.length) log(`\nProblems (${problems.length}):\n  - ${problems.join('\n  - ')}`);
  if (matchNotes.length) log(`\nMatching notes (${matchNotes.length}):\n  - ${matchNotes.join('\n  - ')}`);
  if (VERBOSE && wikiMarkupNotes.length) {
    log(`\nWiki abilities with markup removed (${wikiMarkupNotes.length}):`);
    for (const n of wikiMarkupNotes) log(`  ${n.title}: ${n.wikitext}\n    -> ${n.text}`);
  }
  if (problems.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
