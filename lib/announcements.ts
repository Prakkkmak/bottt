import type { AnnouncementAudience } from './types';

const people = (n: number) => `${n} personne${n > 1 ? 's' : ''}`;

/** The two audiences, in the order the form offers them. */
export const audienceLabels: Record<AnnouncementAudience, { label: string; note: string }> = {
  everyone: { label: 'Tout le cercle', note: 'Membres, organisateur·rices et voyageur·ses.' },
  members: { label: 'Les membres seulement', note: 'Membres et organisateur·rices, sans les voyageur·ses.' },
};

/** How many people an announcement reaches, and how many chose not to get it: « 12 personnes, 2 ont coupé les annonces ». */
export function reachLabel({ sent, muted }: { sent: number; muted: number }) {
  return `${people(sent)}${muted ? `, ${muted > 1 ? `${muted} ont` : '1 a'} coupé les annonces` : ''}`;
}

/** What the organizer reads once send_announcement returned {sent, muted}. */
export function announcementSent(data: unknown) {
  const result = (data ?? {}) as { sent?: unknown; muted?: unknown };
  const sent = Number(result.sent) || 0, muted = Number(result.muted) || 0;
  return `Ton annonce part à ${people(sent)}.${muted ? ` ${muted > 1 ? `${muted} personnes ont` : 'Une personne a'} coupé les annonces.` : ''} Les e-mails partent par lots : tout le monde ne la reçoit pas au même moment.`;
}
