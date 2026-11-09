import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { getScripts } from '@/lib/data';
import { baseScripts } from '@/lib/scripts';
import { baseScriptCharacters, charactersOf } from '@/lib/characters';
import { pageMetadata } from '@/lib/seo';
import { CharacterList, CharacterSources } from '@/components/character-list';

/** A base script by its address, else one of the circle's. */
const findScript = cache(async (slug: string) => {
  const base = baseScripts.find(s => s.slug === slug);
  if (base) return { name: base.name, author: '', note: 'Script de la boîte de base', characters: baseScriptCharacters(base.edition) };
  const custom = (await getScripts()).find(s => s.slug === slug);
  return custom ? { name: custom.name, author: custom.author, note: 'Script maison du cercle', characters: charactersOf(custom.characters) } : null;
});

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const script = await findScript(slug);
  if (!script) return { title: 'Script introuvable' };
  return pageMetadata(`${script.name} : les rôles du script`, `Les rôles du script ${script.name} de Blood on the Clocktower, en français et en anglais, joué à Brest par Blood on the Tanguy Tower.`, `/apprendre/scripts/${slug}`);
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const script = await findScript(slug);
  if (!script) notFound();
  return <article className="legal-page guide-page learn-page">
    <Link href="/apprendre" className="back-link">← Apprendre</Link>
    <h1>{script.name}</h1>
    <p className="guide-lead">{script.note}{script.author && ` · par ${script.author}`}{script.characters.length > 0 && ` · ${script.characters.length} rôles`}</p>
    {script.characters.length ? <CharacterList characters={script.characters} /> : <p>La liste des rôles de ce script n’est pas encore renseignée. Un organisateur peut la compléter dans « Organiser », onglet « Les scripts ».</p>}
    <CharacterSources />
  </article>;
}
