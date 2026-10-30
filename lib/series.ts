import type { GameSession, Series } from './types';
import { shortDate } from './utils';

const weekdays = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const weekday = (date: string) => { const d = new Date(`${date}T12:00:00Z`); return Number.isNaN(d.getTime()) ? null : weekdays[d.getUTCDay()]; };

/** « Chaque mercredi », « Un mercredi sur deux », from a date of the series (YYYY-MM-DD, Paris time); « Chaque semaine » without one. */
export function rhythmLabel(everyWeeks: number, date: string) {
  const day = weekday(date);
  if (!day) return everyWeeks === 2 ? 'Une semaine sur deux' : 'Chaque semaine';
  return everyWeeks === 2 ? `Un ${day} sur deux` : `Chaque ${day}`;
}

export const weeksAheadLabel = (weeks: number) => `${weeks} semaine${weeks > 1 ? 's' : ''} à l’avance`;

/** One line for the organizers' list: « Chaque mercredi à 19h30 · dates ouvertes 4 semaines à l’avance · jusqu’au 24 juin ». */
export function seriesSummary(s: Pick<Series, 'every_weeks' | 'first_date' | 'starts_local' | 'weeks_ahead' | 'ends_on'>) {
  const parts = [`${rhythmLabel(s.every_weeks, s.first_date)} à ${s.starts_local.slice(0, 5).replace(':', 'h')}`, `dates ouvertes ${weeksAheadLabel(s.weeks_ahead)}`];
  if (s.ends_on) parts.push(`jusqu’au ${shortDate(`${s.ends_on}T12:00:00Z`)}`);
  return parts.join(' · ');
}

/** What stop_series did: the empty dates it removed, the booked ones it left for the organizer. */
export function stoppedSeriesMessage({ removed = 0, kept = 0 }: { removed?: number; kept?: number }) {
  let message = 'La série est arrêtée : aucune nouvelle date ne s’ouvrira.';
  if (removed) message += removed > 1 ? ` ${removed} dates sans inscrit sont retirées.` : ' 1 date sans inscrit est retirée.';
  if (kept) message += kept > 1 ? ` ${kept} parties avec des inscrits restent prévues : annule-les si besoin.` : ' 1 partie avec des inscrits reste prévue : annule-la si besoin.';
  return message;
}

/** How long a game stays under « Sessions passées », as long as list_sessions shows it to players. */
export const PAST_DAYS = 30;

/**
 * The home page's three lists: the next game, the ones after it in date order, and the past ones, most recent first.
 * Cancelled games are left out, except the one a link points to, which shows where it belongs.
 */
export function groupSessions<S extends Pick<GameSession, 'id' | 'starts_at' | 'ends_at' | 'status'>>(sessions: S[], linked?: string, now = Date.now()) {
  const shown = (s: S) => s.status === 'published' || s.id === linked;
  const ended = (s: S) => Date.parse(s.ends_at) <= now;
  const upcoming = sessions.filter(s => shown(s) && !ended(s)).sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  const next = upcoming.find(s => s.status === 'published');
  const past = sessions.filter(s => shown(s) && ended(s) && (s.id === linked || Date.parse(s.ends_at) > now - PAST_DAYS * 86400000))
    .sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at));
  return { next, following: upcoming.filter(s => s !== next), past };
}
