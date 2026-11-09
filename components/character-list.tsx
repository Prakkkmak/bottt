import type { ReactNode } from 'react';
import { byTeam, displayName, type Character } from '@/lib/characters';
import { iconPath } from '@/lib/role-art';
import type { SheetLanguage } from './sheet-language';

/**
 * Characters by team, laid out like an official script sheet: the icon, the name, the ability, in French (the other
 * name beside) or in English. Each name leads to the role's wiki page in that language.
 */
export function CharacterList({ characters, headingLevel = 2, language = 'fr' }: { characters: Character[]; headingLevel?: 2 | 3; language?: SheetLanguage }) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const english = language === 'en';
  return <>{byTeam(characters, language).map(team => {
    const label = english ? team.label_en : team.label;
    const note = english ? team.note_en : team.note;
    return <section key={team.id} className={`role-team role-team-${team.id}`} aria-label={label} lang={english ? 'en' : undefined}>
      <Heading className="role-team-heading"><span>{label}</span><small>{note && `${note} · `}{team.characters.length}</small></Heading>
      <ul className="role-list">{team.characters.map(c => {
        const fr = displayName(c);
        const name = english ? c.name_en : fr;
        const other = english ? c.name_fr : c.name_en;
        const icon = iconPath(c.id);
        return <li key={c.id} id={c.id} className="role-card">
          {/* Decorative: the name beside says who it is. */}
          {icon ? <img className="role-icon" src={icon} alt="" width={56} height={56} loading="lazy" decoding="async" /> : <span className="role-icon" aria-hidden="true" />}
          <div className="role-text">
            <p className="role-name"><a href={english ? c.wiki_en : c.wiki_fr ?? c.wiki_en} target="_blank" rel="noopener noreferrer">{name}</a>
              {other && other !== name && <small lang={english ? 'fr' : 'en'}>{other}</small>}</p>
            {english ? <p className="role-ability">{c.ability_en}</p> : <p className="role-ability" lang={c.ability_fr ? undefined : 'en'}>{c.ability_fr ?? c.ability_en}</p>}
          </div>
        </li>;
      })}</ul>
    </section>;
  })}</>;
}

/** A parchment sheet, as printed for the table: its title (a logo or a name), a line under it, then its roles. */
export function Sheet({ title, byline, aside, children, id, labelledBy }: { title: ReactNode; byline?: ReactNode; aside?: ReactNode; children: ReactNode; id?: string; labelledBy?: string }) {
  return <section className="role-sheet" id={id} aria-labelledby={labelledBy}>
    <header className="sheet-head">{title}{byline && <p className="sheet-byline">{byline}</p>}{aside}</header>
    {children}
  </section>;
}

/** Where the texts and the art come from, under every list of roles. */
export function CharacterSources() {
  return <p className="role-sources">Capacités et noms anglais : <a href="https://wiki.bloodontheclocktower.com/Main_Page" target="_blank" rel="noopener noreferrer">wiki officiel de Blood on the Clocktower</a>. Noms et capacités en français : <a href="https://bambipotato.github.io/botc-fr-bambi/" target="_blank" rel="noopener noreferrer">wiki Blood on the Clocktower FR</a> de BambiPotato, traduction sous licence <a href="https://creativecommons.org/licenses/by/4.0/deed.fr" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>, reprise telle quelle. Icônes des rôles et logos des scripts : illustrations officielles, reprises du wiki français. Blood on the Clocktower, ses personnages, leurs textes et leurs illustrations appartiennent à The Pandemonium Institute ; ce site de joueurs gratuit n’est pas affilié à l’éditeur.</p>;
}
