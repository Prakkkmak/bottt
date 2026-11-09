import { byTeam, displayName, type Character } from '@/lib/characters';

/** Characters by team, as on a script sheet: the French name and ability first, the English ones beside, and both wiki pages. */
export function CharacterList({ characters, headingLevel = 2 }: { characters: Character[]; headingLevel?: 2 | 3 }) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return <>{byTeam(characters).map(team => <section key={team.id} className={`role-team role-team-${team.id}`} aria-label={team.label}>
    <Heading className="role-team-heading">{team.label}<span>{team.characters.length}{team.note && ` · ${team.note}`}</span></Heading>
    <ul className="role-list">{team.characters.map(c => <li key={c.id} id={c.id} className="role-card">
      <p className="role-name">{displayName(c)}{c.name_fr && c.name_fr !== c.name_en && <span lang="en">{c.name_en}</span>}</p>
      {c.ability_fr ? <><p className="role-ability">{c.ability_fr}</p><p className="role-ability-en" lang="en">{c.ability_en}</p></> : <p className="role-ability" lang="en">{c.ability_en}</p>}
      <p className="role-links">{c.wiki_fr && <a href={c.wiki_fr} target="_blank" rel="noopener noreferrer">Wiki français</a>}<a href={c.wiki_en} target="_blank" rel="noopener noreferrer">Wiki anglais</a></p>
    </li>)}</ul>
  </section>)}</>;
}

/** Where the texts come from, under every list of roles. */
export function CharacterSources() {
  return <p className="role-sources">Capacités et noms anglais : <a href="https://wiki.bloodontheclocktower.com/Main_Page" target="_blank" rel="noopener noreferrer">wiki officiel de Blood on the Clocktower</a>. Noms et capacités en français : <a href="https://bambipotato.github.io/botc-fr-bambi/" target="_blank" rel="noopener noreferrer">wiki Blood on the Clocktower FR</a> de BambiPotato, traduction sous licence <a href="https://creativecommons.org/licenses/by/4.0/deed.fr" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>, reprise telle quelle. Blood on the Clocktower, ses personnages et leurs textes appartiennent à The Pandemonium Institute ; ce site de joueurs n’est pas affilié à l’éditeur.</p>;
}
