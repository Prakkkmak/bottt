import nodemailer from 'nodemailer';
import { dateLong, sessionName, time } from './utils';

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

/** A queued notification as public.claim_emails returns it, with the game it is about when there is one. */
export type QueuedEmail = {
  id: string; email: string; title: string; body: string; session_id: string | null;
  session_title?: string | null; session_script?: string | null; session_starts_at?: string | null; session_location?: string | null;
};

/** A notification as an e-mail: the subject names the game and its date, the text adds when and where, and a link back to it. */
export function notificationMail(m: QueuedEmail, site = siteUrl()) {
  const game = m.session_script ? sessionName({ title: m.session_title ?? '', script: m.session_script }) : '';
  const day = m.session_starts_at ? dateLong(m.session_starts_at) : '';
  const details = game ? [`Partie : ${game}`, day && `Quand : ${day} à ${time(m.session_starts_at!)}`, m.session_location && `Où : ${m.session_location}`].filter(Boolean).join('\n') : '';
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
