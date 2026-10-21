import nodemailer from 'nodemailer';

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
  const result = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json', ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) },
    body: JSON.stringify({ from: process.env.MAIL_FROM, to, subject, text }),
    signal: AbortSignal.timeout(15000),
  });
  if (!result.ok) throw new Error('Email provider unavailable');
}

/** The sponsorship e-mail: fixed text, so a member cannot use it to send arbitrary content. */
export function invitationMail(sponsorName: string, link: string) {
  const sponsor = sponsorName.replace(/\s+/g, ' ').trim() || 'Un membre';
  return {
    subject: `${sponsor} t’invite à rejoindre Blood on the Tanguy Tower`,
    text: [
      'Bonjour,',
      `${sponsor} t’invite à rejoindre Blood on the Tanguy Tower, le groupe de joueurs de Blood on the Clocktower à Brest. Débutants comme habitués, tout le monde est le bienvenu.`,
      'Ouvre ce lien, crée ton compte avec ton adresse e-mail (un code suffit, sans mot de passe) puis accepte l’invitation : tu entres directement comme membre du cercle et tu choisis ta place aux prochaines parties.',
      link,
      `Le lien est valable 7 jours et ne sert qu’une fois. Si tu ne connais pas ${sponsor}, ignore simplement ce message.`,
      'Blood on the Tanguy Tower',
    ].join('\n\n'),
  };
}
