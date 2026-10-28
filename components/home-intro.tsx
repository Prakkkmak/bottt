import Link from 'next/link';
import { guidePath } from '@/lib/seo';

/** What someone arriving from a search reads first: the game, the town, and that beginners are welcome. Signed-in players go straight to the sessions. */
export function HomeIntro() {
  return <section className="home-intro" aria-labelledby="home-intro-title">
    <h1 id="home-intro-title">Blood on the Clocktower à Brest</h1>
    <p>Des soirées pour débutants comme pour habitués. Blood on the Clocktower est un jeu de bluff et de déduction sociale, cousin du Loup-Garou : guidés par un conteur, les joueurs cherchent le démon caché parmi eux. Nos parties comptent de 7 à 20 places, conteur compris. Choisis une partie et réserve ta place.</p>
    <Link href={guidePath} className="text-link">Découvrir le jeu et nos soirées</Link>
  </section>;
}
