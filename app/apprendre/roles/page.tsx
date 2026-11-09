import Link from 'next/link';
import { characters, editions } from '@/lib/characters';
import { logoPath } from '@/lib/role-art';
import { pageMetadata } from '@/lib/seo';
import { CharacterList, CharacterSources, Sheet } from '@/components/character-list';
import { SheetLanguage } from '@/components/sheet-language';

export const metadata = pageMetadata('Tous les rôles de Blood on the Clocktower', 'Tous les personnages de Blood on the Clocktower, des trois scripts de base au Carrousel, avec les Voyageurs et les Légendaires : leur capacité en français et en anglais.', '/apprendre/roles');

export default function Page() {
  const groups = editions.map(e => ({ ...e, logo: logoPath(e.id), characters: characters.filter(c => c.edition === e.id) })).filter(e => e.characters.length);
  return <article className="legal-page guide-page learn-page">
    <Link href="/apprendre" className="back-link">← Apprendre</Link>
    <h1>Tous les rôles</h1>
    <p className="guide-lead">{characters.length} personnages, une fiche par module, rangés par camp comme sur les fiches officielles. Chaque capacité existe en français et en anglais.</p>
    <nav className="role-toc" aria-label="Modules">{groups.map(e => <a key={e.id} href={`#${e.id}`}>{e.label}</a>)}</nav>
    <SheetLanguage>{groups.map(e => <Sheet key={e.id} id={e.id} labelledBy={`${e.id}-titre`}
      title={<h2 id={`${e.id}-titre`} className="sheet-title">{e.logo ? <img src={e.logo} alt={e.label} width={240} height={240} loading="lazy" /> : e.label}</h2>}
      byline={`${e.characters.length} personnages`}>
      <CharacterList characters={e.characters} headingLevel={3} />
    </Sheet>)}</SheetLanguage>
    <CharacterSources />
  </article>;
}
