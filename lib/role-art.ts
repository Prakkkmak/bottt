import art from '@/data/role-art.json';
import type { Edition } from './characters';

// Light enough for the browser: the role picker shows the icons without loading the characters' texts.
// scripts/build-role-icons.py writes public/roles/ and data/role-art.json from the official art.
const icons: ReadonlySet<string> = new Set(art.icons);
type Logo = { src: string; width: number; height: number };
const logos = art.logos as Partial<Record<Edition, { width: number; height: number; small: { width: number; height: number } }>>;

/** A character's icon, if the site has one. */
export const iconPath = (id: string) => icons.has(id) ? `/roles/${id}.webp` : null;
/** The logo of an edition, as on its box, at its size: the base scripts and the Carousel have one. */
export function logoOf(edition: Edition): Logo | null {
  const logo = logos[edition];
  return logo ? { src: `/roles/editions/${edition}.webp`, width: logo.width, height: logo.height } : null;
}
/** The same logo, small, for a card. */
export function logoThumbOf(edition: Edition): Logo | null {
  const logo = logos[edition];
  return logo ? { src: `/roles/editions/${edition}-small.webp`, ...logo.small } : null;
}
