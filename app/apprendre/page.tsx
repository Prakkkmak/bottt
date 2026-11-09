import Link from 'next/link';
import { ScrollText, BookOpenText } from 'lucide-react';
import { getScripts } from '@/lib/data';
import { baseScripts, scriptPath } from '@/lib/scripts';
import { baseScriptCharacters, charactersOf } from '@/lib/characters';
import { guidePath, pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata('Apprendre Blood on the Clocktower', 'Les règles de Blood on the Clocktower en bref, les scripts joués à Brest par Blood on the Tanguy Tower et tous les rôles, en français et en anglais.', '/apprendre');

const rolesLabel = (n: number) => n ? `${n} rôle${n > 1 ? 's' : ''}` : 'Rôles à venir';

// The rules in three points, said in our own words from the official rules; the wikis hold the full text.
const rules = [
  { title: 'Deux camps, un démon caché', text: [
    'Chaque joueur reçoit en secret un personnage. Les Villageois et les Marginaux forment le camp du Bien ; les Sbires et le Démon, celui du Mal. Les joueurs du Mal savent qui sont leurs alliés, le Bien ne sait rien.',
    'Le Bien gagne dès que le Démon meurt. Le Mal gagne quand il ne reste plus que deux joueurs en vie. Le Conteur mène la partie : il connaît tous les personnages et fait vivre l’histoire.',
  ] },
  { title: 'La nuit, les capacités ; le jour, la parole', text: [
    'La nuit, tout le monde ferme les yeux. Le Conteur réveille un à un les personnages dont la capacité agit : le Démon choisit sa victime, d’autres apprennent une information.',
    'Le jour, on discute librement, en groupe ou en aparté. Chacun peut mentir sur son personnage, et une information peut être fausse : un joueur ivre ou empoisonné reçoit parfois de mauvaises réponses sans le savoir.',
  ] },
  { title: 'Nominer, voter, exécuter', text: [
    'Chaque jour, un joueur vivant peut nominer un autre joueur, une fois. Chacun ne peut être nominé qu’une fois par jour. Tout le monde vote à main levée. Le joueur qui récolte le plus de voix, et au moins autant que la moitié des joueurs vivants, monte sur le billot ; en cas d’égalité, personne.',
    'À la fin du jour, le joueur sur le billot est exécuté ; au plus une exécution par jour. Les morts restent à la table : ils parlent toujours, perdent leur capacité et gardent un dernier vote pour toute la partie.',
  ] },
];

export default async function Page() {
  const custom = await getScripts();
  const scripts = [
    ...baseScripts.map(s => ({ key: s.slug, name: s.name, note: 'Boîte de base', roles: baseScriptCharacters(s.edition).length })),
    ...custom.map(s => ({ key: s.id, name: s.name, note: s.author ? `Script maison · par ${s.author}` : 'Script maison', roles: charactersOf(s.characters).length })),
  ];
  return <article className="legal-page guide-page learn-page">
    <h1>Apprendre</h1>
    <p className="guide-lead">Les règles en trois points, les scripts que nous jouons et la fiche de chaque rôle, pour arriver prêt·e à ta prochaine partie.</p>
    <section aria-labelledby="regles">
      <h2 id="regles">Les règles en bref</h2>
      <ol className="rule-list">{rules.map(rule => <li key={rule.title}><h3>{rule.title}</h3>{rule.text.map(p => <p key={p}>{p}</p>)}</li>)}</ol>
      <p>Pour aller plus loin : les <a href="https://bambipotato.github.io/botc-fr-bambi/regles.html" target="_blank" rel="noopener noreferrer">règles complètes en français</a>, la <a href="https://wiki.bloodontheclocktower.com/Rules_Explanation" target="_blank" rel="noopener noreferrer">version anglaise officielle</a> et notre page <Link href={guidePath}>Découvrir Blood on the Clocktower</Link>.</p>
    </section>
    <section aria-labelledby="scripts">
      <h2 id="scripts">Les scripts du cercle</h2>
      <p>Un script, c’est la liste des personnages en jeu. Chaque partie annonce le sien : ouvre sa fiche pour découvrir ses rôles avant de venir.</p>
      <ul className="script-cards">{scripts.map(s => <li key={s.key}><Link href={scriptPath(s.name)} className="script-card"><ScrollText size={20} aria-hidden="true" /><span><strong>{s.name}</strong><small>{s.note} · {rolesLabel(s.roles)}</small></span></Link></li>)}</ul>
    </section>
    <section aria-labelledby="roles">
      <h2 id="roles">Tous les rôles</h2>
      <p>Villageois, Marginaux, Sbires et Démons des trois scripts de base et du Carrousel, avec les Voyageurs et les Légendaires : chaque capacité en français, avec le texte anglais officiel.</p>
      <p><Link href="/apprendre/roles" className="button secondary"><BookOpenText size={17} />Voir tous les rôles</Link></p>
    </section>
  </article>;
}
