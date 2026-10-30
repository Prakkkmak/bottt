import type { GameSession, Venue } from './types';
import { MIN_CAPACITY, MAX_CAPACITY, MAX_WEEKS_AHEAD } from './session-rules';
import { sessionEnd } from './session-defaults';
import { fromParisInput, parisInput } from './utils';

/** What the form says about each field, and what sessionSchema says too when the server refuses a game. */
export const sessionMessages = {
  title: 'Le nom de la partie tient en 100 caractères au plus.',
  scriptShort: 'Indique le script joué, en 2 caractères au moins.', scriptLong: 'Le nom du script tient en 100 caractères au plus.',
  start: 'Choisis le jour et l’heure du début.', past: 'Choisis une date à venir.', end: 'La fin doit être après le début.',
  locationShort: 'Indique le lieu affiché à tous, en 2 caractères au moins.', locationLong: 'Le lieu affiché tient en 150 caractères au plus.',
  address: 'L’adresse et le lien de carte doivent tenir en 500 caractères.', link: 'Colle un lien complet, qui commence par https://.',
  seats: 'Indique le nombre de places, MJ compris.', wholeSeats: 'Indique un nombre entier de places.',
  fewSeats: `Prévois au moins ${MIN_CAPACITY} places, MJ compris : c’est le minimum pour lancer une partie.`, manySeats: `Une partie compte ${MAX_CAPACITY} places au plus, MJ compris.`,
  visibility: 'Choisis qui peut voir la partie.',
  repeat: 'Choisis le rythme de la série.', weeksAhead: 'Choisis jusqu’à quand les dates sont ouvertes.',
  lastDate: 'Choisis une dernière date valide, ou laisse le champ vide.', lastBefore: 'La dernière date doit suivre la première partie.',
};

/**
 * What the game form holds, as the browser gives it: the start in Paris time, the number of seats still as typed.
 * A new game may repeat: repeat is '' for one date, '1' every week or '2' every other week, with how many weeks ahead
 * its dates open and its last date (YYYY-MM-DD), if any.
 */
export type SessionFormValues = { title: string; starts_at: string; script: string; location: string; address: string; maps_url: string; capacity: string; visibility: string; repeat?: string; weeks_ahead?: string; ends_on?: string };
export type SessionField = keyof SessionFormValues;
export type SessionFieldErrors = Partial<Record<SessionField, string>>;

// Mirrors the map link input of AddressFields (type url, pattern https?://.*), which the form no longer leaves to the browser.
const isLink = (value: string) => { if (!/^https?:\/\//.test(value)) return false; try { new URL(value); return true; } catch { return false; } };
const length = (value: string, min: number, max: number, short: string, long: string) => { const n = value.trim().length; return n < min ? short : n > max ? long : undefined; };
// Mirrors z.iso.date(): a real calendar day written YYYY-MM-DD.
const isDate = (value: string) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false; const d = new Date(`${value}T00:00:00Z`); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value; };
/** The day of an instant in Paris, YYYY-MM-DD, which a series' last date is compared with. */
export const parisDate = (iso: string) => parisInput(iso).slice(0, 10);

/**
 * Checks the game form field by field before it leaves, with sessionSchema's rules (tests/session-form.test.ts keeps them in step), so the
 * browser can say what is wrong without loading zod. `payload` is what saveSession receives, or saveSeries when it has every_weeks, only when
 * nothing is wrong; `message` is a problem no field on screen can fix. The server checks everything again.
 */
export function checkSessionForm(values: SessionFormValues, { session, venue }: { session?: Pick<GameSession, 'id' | 'starts_at' | 'ends_at'>; venue?: Venue }) {
  const errors: SessionFieldErrors = {};
  let message: string | undefined;
  const set = (field: SessionField, error?: string) => { if (error) errors[field] = error; };
  let startsAt = '';
  if (!values.starts_at) set('starts_at', sessionMessages.start);
  else try { startsAt = fromParisInput(values.starts_at); } catch (e) { set('starts_at', e instanceof Error ? e.message : sessionMessages.start); }
  if (startsAt && !(new Date(startsAt) > new Date())) set('starts_at', sessionMessages.past);
  const endsAt = session && startsAt ? sessionEnd(startsAt, session) : undefined;
  if (endsAt && !(Date.parse(endsAt) > Date.parse(startsAt))) message = sessionMessages.end;
  set('title', values.title.trim().length > 100 ? sessionMessages.title : undefined);
  set('script', length(values.script, 2, 100, sessionMessages.scriptShort, sessionMessages.scriptLong));
  // A picked venue fills the place and its address: the fields of « Autre lieu » are neither shown nor sent.
  if (!venue) {
    set('location', length(values.location, 2, 150, sessionMessages.locationShort, sessionMessages.locationLong));
    set('address', values.address.trim().length > 500 ? sessionMessages.address : undefined);
    const map = values.maps_url.trim();
    set('maps_url', map && !isLink(map) ? sessionMessages.link : undefined);
  }
  const capacity = values.capacity.trim() ? Number(values.capacity) : NaN;
  set('capacity', !Number.isFinite(capacity) ? sessionMessages.seats : !Number.isInteger(capacity) ? sessionMessages.wholeSeats : capacity < MIN_CAPACITY ? sessionMessages.fewSeats : capacity > MAX_CAPACITY ? sessionMessages.manySeats : undefined);
  set('visibility', values.visibility === 'public' || values.visibility === 'members' ? undefined : sessionMessages.visibility);
  // A game being edited is one date: its series, if any, is not changed from here.
  const repeat = session ? '' : values.repeat ?? '';
  let series: { every_weeks: number; weeks_ahead: number; ends_on: string | null } | undefined;
  if (repeat) {
    const weeks = Number(values.weeks_ahead ?? '');
    const last = values.ends_on ?? '';
    set('repeat', repeat === '1' || repeat === '2' ? undefined : sessionMessages.repeat);
    set('weeks_ahead', Number.isInteger(weeks) && weeks >= 1 && weeks <= MAX_WEEKS_AHEAD ? undefined : sessionMessages.weeksAhead);
    set('ends_on', !last ? undefined : !isDate(last) ? sessionMessages.lastDate : startsAt && last < parisDate(startsAt) ? sessionMessages.lastBefore : undefined);
    series = { every_weeks: Number(repeat), weeks_ahead: weeks, ends_on: last || null };
  }
  const payload = {
    ...(session ? { id: session.id } : {}),
    title: values.title, script: values.script, starts_at: startsAt, ...(endsAt ? { ends_at: endsAt } : {}),
    location: venue ? venue.name : values.location, address: venue ? venue.address : values.address, venue_id: venue?.id ?? null,
    capacity, visibility: values.visibility, ...series,
  };
  const valid = !Object.keys(errors).length && !message;
  return { errors, message, payload: valid ? payload : undefined };
}
