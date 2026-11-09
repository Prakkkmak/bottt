import Link from 'next/link';
import { ScrollText, BookOpenText } from 'lucide-react';
import { getScripts } from '@/lib/data';
import { baseScripts, scriptPagePath } from '@/lib/scripts';
import { baseScriptCharacters, charactersOf } from '@/lib/characters';
import { logoThumbOf } from '@/lib/role-art';
import { RulesSheet } from '@/components/rules-sheet';
import { guidePath, pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata('Apprendre Blood on the Clocktower', 'La feuille de règles de Blood on the Clocktower, les scripts joués à Brest par Blood on the Tanguy Tower et tous les rôles, en français et en anglais.', '/apprendre');

const rolesLabel = (n: number) => n ? `${n} rôle${n > 1 ? 's' : ''}` : 'Rôles à venir';

export default async function Page() {
  const custom = await getScripts();
  const scripts = [
    ...baseScripts.map(s => ({ key: s.slug, slug: s.slug, name: s.name, logo: logoThumbOf(s.edition), note: 'Boîte de base', roles: baseScriptCharacters(s.edition).length })),
    ...custom.map(s => ({ key: s.id, slug: s.slug, name: s.name, logo: null, note: s.author ? `Script maison · par ${s.author}` : 'Script maison', roles: charactersOf(s.characters).length })),
  ];
  return <article className="legal-page guide-page learn-page">
    <h1>Apprendre</h1>
    <p className="guide-lead">La feuille de règles qu’on donne aux joueurs, les scripts que nous jouons et la fiche de chaque rôle, pour arriver prêt·e à ta prochaine partie.</p>
    <section aria-labelledby="regles">
      <h2 id="regles">La feuille de règles</h2>
      <p>Recto verso, comme la feuille officielle : tout ce qu’il faut savoir pour jouer sa première partie.</p>
      <RulesSheet />
      <p className="role-sources">Feuille de règles officielle (« <a href="https://wiki.bloodontheclocktower.com/Rules_Explanation" target="_blank" rel="noopener noreferrer">Rules Explanation</a> ») de The Pandemonium Institute, dans la <a href="https://bambipotato.github.io/botc-fr-bambi/regles.html" target="_blank" rel="noopener noreferrer">traduction française</a> de BambiPotato, sous licence <a href="https://creativecommons.org/licenses/by/4.0/deed.fr" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>, légèrement adaptée : signaux du Conteur décrits en mots, règle du vote précisée, répétitions retirées. Pour découvrir le jeu autrement : <Link href={guidePath}>Découvrir Blood on the Clocktower</Link>.</p>
    </section>
    <section aria-labelledby="scripts">
      <h2 id="scripts">Les scripts du cercle</h2>
      <p>Un script, c’est la liste des personnages en jeu. Chaque partie annonce le sien : ouvre sa fiche pour découvrir ses rôles avant de venir.</p>
      <ul className="script-cards">{scripts.map(s => <li key={s.key}><Link href={scriptPagePath(s.slug)} className="script-card">{s.logo ? <span className="script-logo"><img src={s.logo.src} alt="" width={s.logo.width} height={s.logo.height} loading="lazy" decoding="async" /></span> : <ScrollText size={20} aria-hidden="true" />}<span><strong>{s.name}</strong><small>{s.note} · {rolesLabel(s.roles)}</small></span></Link></li>)}</ul>
    </section>
    <section aria-labelledby="roles">
      <h2 id="roles">Tous les rôles</h2>
      <p>Villageois, Marginaux, Sbires et Démons des trois scripts de base et du Carrousel, avec les Voyageurs et les Légendaires : une fiche par module, en français ou en anglais.</p>
      <p><Link href="/apprendre/roles" className="button secondary"><BookOpenText size={17} />Voir tous les rôles</Link></p>
    </section>
  </article>;
}
