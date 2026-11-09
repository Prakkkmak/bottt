import type { GameSession, Series } from './types';
import { parisInput, shortDate } from './utils';
import { DEFAULT_SESSION_HOURS } from './session-defaults';

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

const addDays = (date: string, days: number) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };

/**
 * The next date on the series' rhythm whose start is still to come, in the form's Paris time (YYYY-MM-DDTHH:MM): where its form
 * starts. A date moved or deleted by hand does not change it, so that the series keeps its rhythm unless the organizer changes it.
 */
export function nextSeriesStart(s: Pick<Series, 'first_date' | 'starts_local' | 'every_weeks'>, now = new Date()) {
  const hour = s.starts_local.slice(0, 5), step = 7 * s.every_weeks, current = parisInput(now.toISOString());
  const days = Math.round((Date.parse(`${current.slice(0, 10)}T12:00:00Z`) - Date.parse(`${s.first_date}T12:00:00Z`)) / 86400000);
  let slot = days > 0 ? addDays(s.first_date, Math.ceil(days / step) * step) : s.first_date;
  if (`${slot}T${hour}` <= current) slot = addDays(slot, step);
  return `${slot}T${hour}`;
}

/** The length of each game of a series in milliseconds, from the interval the database gives ('04:00:00', '1 day', '1 day 02:30:00'). */
export function seriesDuration(interval: string) {
  const m = /^(?:(\d+) days?)?\s*(?:(\d+):(\d+)(?::(\d+(?:\.\d+)?))?)?$/.exec(interval.trim());
  const ms = m ? ((Number(m[1] ?? 0) * 24 + Number(m[2] ?? 0)) * 60 + Number(m[3] ?? 0)) * 60000 + Number(m[4] ?? 0) * 1000 : NaN;
  return ms > 0 ? ms : DEFAULT_SESSION_HOURS * 3600000;
}

/** What edit_series did: the upcoming dates that took the changes, those it opened, the empty ones it removed and the booked ones it left. */
export function editedSeriesMessage({ resumed = false, updated = 0, opened = 0, removed = 0, kept = 0 }: { resumed?: boolean; updated?: number; opened?: number; removed?: number; kept?: number }) {
  let message = resumed ? 'La série reprend.' : 'La série est modifiée.';
  if (updated) message += updated > 1 ? ` Ses ${updated} dates à venir suivent ces changements.` : ' Sa date à venir suit ces changements.';
  if (opened) message += opened > 1 ? ` ${opened} nouvelles dates sont ouvertes aux inscriptions.` : ' 1 nouvelle date est ouverte aux inscriptions.';
  if (removed) message += removed > 1 ? ` ${removed} dates sans inscrit sont retirées.` : ' 1 date sans inscrit est retirée.';
  if (kept) message += kept > 1 ? ` ${kept} parties avec des inscrits restent à leur date : annule-les si besoin.` : ' 1 partie avec des inscrits reste à sa date : annule-la si besoin.';
  return message;
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
