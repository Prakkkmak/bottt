import Link from 'next/link';
import { faqJsonLd, guidePath, pageMetadata } from '@/lib/seo';
import { JsonLd } from '@/components/json-ld';

export const metadata = pageMetadata('Blood on the Clocktower, le jeu et nos soirées à Brest', 'Blood on the Clocktower, jeu de bluff et de déduction sociale cousin du Loup-Garou : le principe, une soirée à Brest et les réponses pour débuter.', guidePath);

// Shown on the page and given to search engines as they are, so both always say the same thing.
const questions = [
  { question: 'Faut-il connaître les règles pour venir ?', answer: 'Non. Toutes les soirées accueillent les débutants : le principe s’explique en quelques minutes et le conteur accompagne les nouveaux pendant la partie.' },
  { question: 'Combien de joueurs faut-il pour une partie ?', answer: 'Le jeu se joue à partir de 5 joueurs, plus le conteur qui mène la partie. Nos parties comptent de 7 à 20 places, conteur compris : 16 places, par exemple, pour 15 joueurs et leur conteur.' },
  { question: 'Comment réserver ma place ?', answer: 'Connecte-toi avec ton adresse e-mail, choisis une partie sur la page d’accueil et prends un jeton libre autour de la tour. Si la partie est complète, tu rejoins la liste d’attente et un e-mail te prévient dès qu’une place te revient.' },
  { question: 'Où ont lieu les parties ?', answer: 'À Brest. Le lieu est indiqué sur chaque partie et l’adresse précise s’affiche pour les personnes inscrites avant la soirée.' },
  { question: 'Puis-je venir avec des amis ?', answer: 'Oui. Depuis la partie, inscris les personnes que tu amènes, même si elles n’ont pas de compte : elles prennent une place libre ou la liste d’attente comme tout le monde.' }
];

export default function Page() {
  return <article className="legal-page guide-page">
    <JsonLd data={faqJsonLd(questions)} />
    <Link href="/" className="back-link">← Voir les prochaines parties</Link>
    <h1>Découvrir Blood on the Clocktower</h1>
    <p className="guide-lead">Blood on the Tanguy Tower réunit à Brest des joueurs de Blood on the Clocktower, débutants comme habitués. Voici l’essentiel pour comprendre le jeu et venir à ta première soirée.</p>
    <section>
      <h2>Un jeu de bluff et de déduction sociale</h2>
      <p>Blood on the Clocktower, souvent abrégé BotC, est un jeu de déduction sociale à rôles cachés créé par Steven Medway et édité par The Pandemonium Institute. Dans le village de Ravenswood Bluff, un démon se cache parmi les joueurs et frappe chaque nuit. Le camp du bien doit le démasquer et l’exécuter ; le démon et ses sbires sèment le doute jusqu’à ce qu’il ne reste plus que deux joueurs en vie.</p>
      <p>Chaque joueur reçoit un personnage doté d’un pouvoir : villageois, étranger, sbire ou démon. Un conteur mène la partie, distribue les informations pendant la nuit et veille à ce que l’histoire reste palpitante jusqu’au dernier vote.</p>
    </section>
    <section>
      <h2>Si tu aimes le Loup-Garou</h2>
      <p>Tu as joué aux Loups-Garous de Thiercelieux ? Tu retrouveras le principe : la nuit, le mal frappe ; le jour, le village débat puis vote. Blood on the Clocktower va plus loin : chacun a un rôle qui compte, les informations reçues peuvent être fausses, et les joueurs morts continuent de parler et gardent un dernier vote. Personne ne regarde la partie depuis le banc : tout le monde joue jusqu’au bout.</p>
    </section>
    <section>
      <h2>Une soirée à Brest</h2>
      <p>Les parties ont lieu à Brest, dans le Finistère. Chaque session est annoncée sur la <Link href="/">page d’accueil</Link> avec sa date, son script et le nombre de places restantes. Tu peux venir seul·e ou avec des amis : il suffit de réserver ta place autour de la tour et de te laisser guider le jour venu.</p>
    </section>
    <section>
      <h2>Les scripts</h2>
      <p>Chaque partie annonce son script, c’est-à-dire les personnages en jeu. Les trois scripts de la boîte de base : Trouble Brewing, le plus accessible, idéal pour une première partie ; Bad Moon Rising, où les morts s’enchaînent et où il faut protéger les siens ; Sects & Violets, plein de personnages qui changent de rôle, pour les amateurs de casse-têtes.</p>
    </section>
    <section>
      <h2>Questions fréquentes</h2>
      {questions.map(({ question, answer }) => <div key={question} className="guide-question"><h3>{question}</h3><p>{answer}</p></div>)}
    </section>
    <section>
      <h2>Qui sommes-nous ?</h2>
      <p>Blood on the Tanguy Tower, ou BOTTT, doit son nom à la tour Tanguy, au bord de la Penfeld. Nous sommes un groupe de joueurs brestois : tout le monde est le bienvenu, l’essentiel est d’être sympa, de respecter les autres et de passer une bonne soirée ensemble.</p>
      <p><Link href="/" className="button primary">Voir les prochaines parties</Link></p>
    </section>
  </article>;
}
