import Link from 'next/link';
import { characters, editions } from '@/lib/characters';
import { pageMetadata } from '@/lib/seo';
import { CharacterList, CharacterSources } from '@/components/character-list';

export const metadata = pageMetadata('Tous les rôles de Blood on the Clocktower', 'Tous les personnages de Blood on the Clocktower, des trois scripts de base au Carrousel, avec les Voyageurs et les Légendaires : leur capacité en français et en anglais.', '/apprendre/roles');

export default function Page() {
  const groups = editions.map(e => ({ ...e, characters: characters.filter(c => c.edition === e.id) })).filter(e => e.characters.length);
  return <article className="legal-page guide-page learn-page">
    <Link href="/apprendre" className="back-link">← Apprendre</Link>
    <h1>Tous les rôles</h1>
    <p className="guide-lead">{characters.length} personnages, rangés par module puis par camp. Chaque capacité est donnée en français quand la traduction existe, avec le texte anglais officiel.</p>
    <nav className="role-toc" aria-label="Modules">{groups.map(e => <a key={e.id} href={`#${e.id}`}>{e.label}</a>)}</nav>
    {groups.map(e => <section key={e.id} id={e.id} className="role-edition" aria-labelledby={`${e.id}-titre`}>
      <h2 id={`${e.id}-titre`}>{e.label}</h2>
      <CharacterList characters={e.characters} headingLevel={3} />
    </section>)}
    <CharacterSources />
  </article>;
}
