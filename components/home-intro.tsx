import Link from 'next/link';
import { guidePath } from '@/lib/seo';

/** What someone arriving from a search reads first: the game, the town, and that beginners are welcome. Signed-in players go straight to the sessions. */
export function HomeIntro() {
  return <section className="home-intro" aria-labelledby="home-intro-title">
    <h1 id="home-intro-title">Blood on the Clocktower à Brest</h1>
    <p>Des soirées ouvertes à tout le monde, débutants compris. Blood on the Clocktower est un jeu de bluff et de déduction sociale, cousin du Loup-Garou : de 7 à 20 joueurs, guidés par un conteur, cherchent le démon caché parmi eux. Choisis une partie et réserve ta place.</p>
    <Link href={guidePath} className="text-link">Découvrir le jeu et nos soirées</Link>
  </section>;
}
