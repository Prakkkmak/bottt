import nodemailer from 'nodemailer';
import { dateLong, parisInput, sessionName, time } from './utils';

export type Mail = { to: string; subject: string; text: string; idempotencyKey?: string };

/** The local Docker stack delivers to Mailpit; every other environment goes through Resend. */
export function localMail() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return !!url && new URL(url).hostname === '127.0.0.1' && !process.env.VERCEL;
}
export function canSendMail() { return localMail() || Boolean(process.env.RESEND_API_KEY); }
/** Absolute links for e-mails, which are read outside the site. */
export function siteUrl(fallback = 'http://127.0.0.1:3000') { return (process.env.NEXT_PUBLIC_SITE_URL || fallback).replace(/\/+$/, ''); }

let smtp: ReturnType<typeof nodemailer.createTransport> | null = null;
export async function sendMail({ to, subject, text, idempotencyKey }: Mail) {
  if (localMail()) {
    smtp ??= nodemailer.createTransport({ host: '127.0.0.1', port: 54325, secure: false });
    await smtp.sendMail({ from: 'Blood on the Tanguy Tower <bonjour@cercle.test>', to, subject, text });
    return;
  }
  if (!process.env.RESEND_API_KEY) throw new Error('Email provider not configured');
  const post = () => fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json', ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) },
    body: JSON.stringify({ from: process.env.MAIL_FROM, to, subject, text }),
    signal: AbortSignal.timeout(15000),
  });
  let result = await post();
  // Resend allows a few requests per second: a burst, such as a cancelled game, waits its turn once.
  if (result.status === 429) { await new Promise(resolve => setTimeout(resolve, 1000)); result = await post(); }
  if (!result.ok) throw new Error('Email provider unavailable');
}

/** A field of a game that an organizer changed, with the value it had and the one it has now, as public.notify_session_change writes it.
 * An address the person could not read before comes without its former value. */
export type Change = { field: 'starts_at' | 'location' | 'address'; before?: string; after: string };

/** A queued notification as public.claim_emails returns it, with the game it is about when there is one. */
export type QueuedEmail = {
  id: string; email: string; title: string; body: string; session_id: string | null;
  session_title?: string | null; session_script?: string | null; session_starts_at?: string | null; session_location?: string | null;
  changes?: unknown;
};

const changedFields: readonly Change['field'][] = ['starts_at', 'location', 'address'];
const validDate = (value: string) => Number.isFinite(Date.parse(value));
/** The changes kept from the outbox, by field. One that is not well formed is left out, so the message still leaves. */
function readChanges(value: unknown) {
  const found: Partial<Record<Change['field'], Change>> = {};
  for (const item of Array.isArray(value) ? value : []) {
    const c = item as Partial<Change> | null;
    if (!c || !changedFields.includes(c.field!) || typeof c.after !== 'string') continue;
    if (typeof c.before !== 'string' && !(c.field === 'address' && c.before === undefined)) continue;
    if (c.field === 'starts_at' && !(validDate(c.before!) && validDate(c.after))) continue;
    found[c.field!] = c as Change;
  }
  return found;
}
const moment = (date: string) => `${dateLong(date)} à ${time(date)}`;
/** A place or an address on one line, its lines joined, or a word when there is none. */
const oneLine = (value: string, none: string) => value.split(/\r\n|[\r\n\u2028\u2029]/).map(line => line.trim()).filter(Boolean).join(', ') || none;

/** A notification as an e-mail: the subject names the game and its date, the text adds when and where, and a link back to it.
 * When the game changed, each changed line reads as before → now, a time alone after the arrow when the day stays the same. */
export function notificationMail(m: QueuedEmail, site = siteUrl()) {
  // Every game has a date, not always a script: the date says the message is about a game still on the site.
  const game = m.session_starts_at ? sessionName({ title: m.session_title ?? '', script: m.session_script ?? '' }) : '';
  const day = m.session_starts_at ? dateLong(m.session_starts_at) : '';
  const { starts_at: moved, location: place, address } = readChanges(m.changes);
  const sameDay = moved && parisInput(moved.before!).slice(0, 10) === parisInput(moved.after).slice(0, 10);
  const when = moved ? `Quand : ${moment(moved.before!)} → ${sameDay ? time(moved.after) : moment(moved.after)}` : day && `Quand : ${day} à ${time(m.session_starts_at!)}`;
  const where = place ? `Où : ${oneLine(place.before!, 'non précisé')} → ${oneLine(place.after, 'non précisé')}` : m.session_location && `Où : ${m.session_location}`;
  const exact = address && (address.before === undefined ? `Adresse : ${oneLine(address.after, 'aucune')}` : `Adresse : ${oneLine(address.before, 'aucune')} → ${oneLine(address.after, 'aucune')}`);
  const details = game ? [`Partie : ${game}`, when, where, exact].filter(Boolean).join('\n') : '';
  const link = `${site}${m.session_id ? `/sessions/${m.session_id}` : '/'}`;
  // Guest names reach the title: a line break must not end the subject header.
  const subject = [m.title, game && [game, day].filter(Boolean).join(', ')].filter(Boolean).join(' · ').replace(/\s+/g, ' ').trim();
  return { subject, text: [m.body, details, link, 'Blood on the Tanguy Tower'].filter(Boolean).join('\n\n') };
}

/** The sponsorship e-mail: fixed text, so a member cannot use it to send arbitrary content. */
export function invitationMail(sponsorName: string, link: string) {
  const sponsor = sponsorName.replace(/\s+/g, ' ').trim() || 'Un membre';
  return {
    subject: `${sponsor} t’invite à rejoindre Blood on the Tanguy Tower`,
    text: [
      'Bonjour,',
      `${sponsor} t’invite à rejoindre Blood on the Tanguy Tower, le groupe de joueurs de Blood on the Clocktower à Brest. Débutant·es comme habitué·es, tout le monde est bienvenu.`,
      'Ouvre ce lien, crée ton compte avec ton adresse e-mail (un code suffit, sans mot de passe) puis accepte l’invitation : tu entres directement comme membre du cercle et tu choisis ta place aux prochaines parties.',
      link,
      `Le lien est valable 7 jours et ne sert qu’une fois. Si cette invitation ne te dit rien, ignore simplement ce message : ton adresse, indiquée par ${sponsor}, ne sert qu’à cet envoi et sera effacée au plus tard 37 jours après. Pour la faire effacer dès maintenant, ne plus recevoir d’invitation ou pour toute question : bonjour@bottt.fr. Tes données : ${new URL(link).origin}/confidentialite`,
      'Blood on the Tanguy Tower (Lévy MARQUES)',
    ].join('\n\n'),
  };
}
