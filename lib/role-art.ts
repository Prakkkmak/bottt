import type { Edition } from './characters';

// Light enough for the browser: the role picker shows the icons without loading the characters' texts.
/** A character's icon, from the official art (scripts/build-role-icons.py writes public/roles/). */
export const iconPath = (id: string) => `/roles/${id}.webp`;
/** The logo of an edition, as on its box: the base scripts and the Carousel have one. */
export const logoPath = (edition: Edition) => edition === 'other' ? null : `/roles/editions/${edition}.webp`;
