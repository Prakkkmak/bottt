/** The kinds of messages, as public.notification_kinds lists them. Each e-mail carries one. */
export type NotificationKind = 'booking' | 'reminder' | 'message' | 'announcement' | 'new_game' | 'activity' | 'waitlist' | 'review' | 'change' | 'cancel' | 'account' | 'other';
/** The kinds a player may switch on or off; the others are always sent. */
export type OptionalKind = 'booking' | 'reminder' | 'message' | 'announcement' | 'new_game' | 'activity';
export type NotificationChoices = Record<OptionalKind, boolean>;
export type NotificationChoice = { kind: OptionalKind; label: string; detail: string; defaultOn: boolean; organizersOnly?: boolean };

/** What the profile page offers, in its order: what each kind sends, and whether it is on for someone who never chose. */
export const notificationChoices: readonly NotificationChoice[] = [
  { kind: 'booking', label: 'Mes inscriptions', detail: 'La confirmation quand tu t’inscris, inscris un·e invité·e, rejoins ou quittes la liste d’attente, ou te désistes.', defaultOn: true },
  { kind: 'reminder', label: 'Rappel avant la partie', detail: 'Moins de 24 h avant une partie où toi ou les personnes que tu amènes avez une place.', defaultOn: true },
  { kind: 'message', label: 'Messages des organisateurs', detail: 'Ce qu’un organisateur écrit aux inscrits d’une partie où tu es inscrit·e.', defaultOn: true },
  { kind: 'announcement', label: 'Annonces du cercle', detail: 'Les nouvelles qu’un organisateur envoie à tout le monde.', defaultOn: true },
  { kind: 'new_game', label: 'Nouvelles parties', detail: 'Dès qu’une partie que tu peux rejoindre ouvre ses inscriptions. Pour une partie récurrente, seulement sa première date.', defaultOn: false },
  { kind: 'activity', label: 'Inscriptions et désistements', detail: 'Quand quelqu’un prend ou libère une place à une partie que tu as créée.', defaultOn: false, organizersOnly: true },
];
export const optionalKinds = notificationChoices.map(c => c.kind);

/** Always sent, since they tell whether and where to come; switching them off would leave a seat empty or a player at a closed door. */
export const alwaysSent = [
  'une place obtenue depuis la liste d’attente',
  'la décision d’un organisateur sur ton inscription',
  'une partie déplacée, changée de lieu ou annulée',
  'un changement de ton rang dans le cercle',
];

/** The choices saved, completed with the defaults for the kinds never chosen. Anything else read from the database is left out. */
export function withDefaults(saved: Partial<Record<string, boolean>> = {}): NotificationChoices {
  return Object.fromEntries(notificationChoices.map(c => [c.kind, typeof saved[c.kind] === 'boolean' ? saved[c.kind] : c.defaultOn])) as NotificationChoices;
}

export const choiceOf = (kind: string | null | undefined) => notificationChoices.find(c => c.kind === kind);

/** What an organizer reads once a message to the people registered for a game is sent: send_session_message returns {sent, muted},
 * and only the count before the notification choices. */
export function sessionMessageSent(data: unknown) {
  const result = (typeof data === 'number' ? { sent: data } : data ?? {}) as { sent?: unknown; muted?: unknown };
  const sent = Number(result.sent) || 0, muted = Number(result.muted) || 0;
  const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;
  return `Ton message part à ${plural(sent, 'personne')}.${muted ? ` ${muted > 1 ? `${muted} autres inscrits ont` : 'Un·e autre inscrit·e a'} coupé les messages des organisateurs.` : ''}`;
}
