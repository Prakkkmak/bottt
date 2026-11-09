import type { CSSProperties, ReactNode } from 'react';
import { byTeam, displayName, type Character } from '@/lib/characters';
import { iconPath } from '@/lib/role-art';

/**
 * Characters by team, laid out like an official script sheet: the icon, the name, the ability. Both languages are in the
 * page; the sheet around them (SheetLanguage) shows French or English, French by default. Each name leads to its wiki page.
 */
export function CharacterList({ characters, headingLevel = 2 }: { characters: Character[]; headingLevel?: 2 | 3 }) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return <>{byTeam(characters).map(team => {
    // In English, the sheet sorts by the English names: the grid moves each card, the page keeps one copy of each.
    const english = [...team.characters].sort((x, y) => x.name_en.localeCompare(y.name_en, 'en')).map(c => c.id);
    return <section key={team.id} className={`role-team role-team-${team.id}`} aria-label={team.label}>
      <Heading className="role-team-heading"><span className="only-fr">{team.label}</span><span className="only-en" lang="en">{team.label_en}</span>
        <small><span className="only-fr">{team.note && `${team.note} · `}</span><span className="only-en" lang="en">{team.note_en && `${team.note_en} · `}</span>{team.characters.length}</small></Heading>
      <ul className="role-list">{team.characters.map(c => {
        const fr = displayName(c);
        return <li key={c.id} id={c.id} className="role-card" style={{ '--en-order': english.indexOf(c.id) } as CSSProperties}>
          {/* Decorative: the name beside says who it is. */}
          <img className="role-icon" src={iconPath(c.id)} alt="" width={56} height={56} loading="lazy" decoding="async" />
          <div className="role-text">
            {/* The name leads to the role's wiki page, in the language shown. */}
            <p className="role-name"><a className="only-fr" href={c.wiki_fr ?? c.wiki_en} target="_blank" rel="noopener noreferrer">{fr}</a><a className="only-en" lang="en" href={c.wiki_en} target="_blank" rel="noopener noreferrer">{c.name_en}</a>
              {fr !== c.name_en && <small><span className="only-fr" lang="en">{c.name_en}</span><span className="only-en">{fr}</span></small>}</p>
            <p className="role-ability only-fr" lang={c.ability_fr ? undefined : 'en'}>{c.ability_fr ?? c.ability_en}</p>
            <p className="role-ability only-en" lang="en">{c.ability_en}</p>
          </div>
        </li>;
      })}</ul>
    </section>;
  })}</>;
}

/** A parchment sheet, as printed for the table: its title (a logo or a name), a line under it, then its roles. */
export function Sheet({ title, byline, children, id, labelledBy }: { title: ReactNode; byline?: ReactNode; children: ReactNode; id?: string; labelledBy?: string }) {
  return <section className="role-sheet" id={id} aria-labelledby={labelledBy}>
    <header className="sheet-head">{title}{byline && <p className="sheet-byline">{byline}</p>}</header>
    {children}
  </section>;
}

/** Where the texts and the art come from, under every list of roles. */
export function CharacterSources() {
  return <p className="role-sources">Capacités et noms anglais : <a href="https://wiki.bloodontheclocktower.com/Main_Page" target="_blank" rel="noopener noreferrer">wiki officiel de Blood on the Clocktower</a>. Noms et capacités en français : <a href="https://bambipotato.github.io/botc-fr-bambi/" target="_blank" rel="noopener noreferrer">wiki Blood on the Clocktower FR</a> de BambiPotato, traduction sous licence <a href="https://creativecommons.org/licenses/by/4.0/deed.fr" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>, reprise telle quelle. Icônes des rôles et logos des scripts : illustrations officielles, reprises du wiki français. Blood on the Clocktower, ses personnages, leurs textes et leurs illustrations appartiennent à The Pandemonium Institute ; ce site de joueurs gratuit n’est pas affilié à l’éditeur.</p>;
}
