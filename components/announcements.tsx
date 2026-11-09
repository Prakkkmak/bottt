'use client';
import { useEffect, useRef, useState } from 'react';
import { Megaphone, Send } from 'lucide-react';
import type { ActionResult, Announcement, AnnouncementAudience, AnnouncementCounts, Profile } from '@/lib/types';
import { shortDate } from '@/lib/utils';
import { audienceLabels, reachLabel } from '@/lib/announcements';
import { sendAnnouncement } from '@/app/actions';
import { Dialog } from './dialog';
import { Feedback, useAction } from './action-feedback';

/** The organizers' messages: announcements to the whole circle or to its members, and the ones sent this past year. */
export function Announcements({ announcements, counts, profiles, writer }: { announcements: Announcement[]; counts: AnnouncementCounts | null; profiles: Profile[]; writer: string }) {
  const [writing, setWriting] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);
  // Counts the announcements sent: the confirmation, above the list, comes into view so that nobody sends twice.
  const [sent, setSent] = useState(0);
  const feedbackRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (sent) feedbackRef.current?.scrollIntoView({ block: 'nearest' }); }, [sent]);
  // A writer whose account is gone leaves the announcement unsigned in the list.
  const nameOf = (id: string | null) => profiles.find(p => p.id === id)?.display_name ?? null;
  return <>
    <div ref={feedbackRef}><Feedback result={result} /></div>
    <div className="panel venue-panel">
      <div className="panel-heading"><h2><Megaphone size={20} />Annonces</h2><button className="button secondary compact" disabled={!counts} onClick={() => { setResult(null); setWriting(true); }}><Megaphone size={16} />Écrire une annonce</button></div>
      <p className="muted">Une annonce part par e-mail à tout le cercle, ou aux seuls membres. Chacun peut couper les annonces dans son profil. Pour écrire aux inscrits d’une partie, utilise l’enveloppe de la partie dans « Les sessions ».</p>
      {!counts && <p className="alert warning" role="status">Les annonces seront disponibles une fois la base de données mise à jour.</p>}
      {announcements.length ? announcements.map(n => <AnnouncementRow key={n.id} announcement={n} sender={nameOf(n.sender_id)} />)
        : <div className="empty-state borderless"><Megaphone size={35} /><h2>Aucune annonce envoyée.</h2><p>Les annonces de l’année passée s’affichent ici, avec le nombre de personnes qu’elles ont touchées.</p></div>}
    </div>
    <Dialog title="Écrire une annonce" open={writing} onClose={() => setWriting(false)} wide guard>
      {writing && counts && <AnnouncementForm counts={counts} writer={writer} onSent={r => { setWriting(false); setResult(r); setSent(n => n + 1); }} />}
    </Dialog>
  </>;
}

function AnnouncementRow({ announcement: n, sender }: { announcement: Announcement; sender: string | null }) {
  const [open, setOpen] = useState(false);
  // A long text shows its first lines until asked for the rest.
  const long = n.body.length > 280 || n.body.split('\n').length > 4;
  return <article className="member-row venue-row announcement-row">
    <span className="venue-icon" aria-hidden="true"><Megaphone size={18} /></span>
    <div>
      <h3>{n.subject || (sender ? `Annonce de ${sender}` : 'Annonce')}</h3>
      <p>{[shortDate(n.created_at), sender, audienceLabels[n.audience].label, reachLabel(n)].filter(Boolean).join(' · ')}</p>
      <p className={`announcement-body ${long && !open ? 'is-clamped' : ''}`}>{n.body}</p>
      {long && <button type="button" className="text-link" aria-expanded={open} onClick={() => setOpen(o => !o)}>{open ? 'Réduire' : 'Tout lire'}</button>}
    </div>
  </article>;
}

function AnnouncementForm({ counts, writer, onSent }: { counts: AnnouncementCounts; writer: string; onSent: (result: ActionResult) => void }) {
  const a = useAction();
  const [audience, setAudience] = useState<AnnouncementAudience>('everyone');
  const reach = counts[audience].sent;
  return <form className="stack" onSubmit={e => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    a.run(() => sendAnnouncement({ subject: String(f.get('subject') ?? ''), message: String(f.get('message') ?? ''), audience }), onSent);
  }}>
    <fieldset className="choice-options"><legend>À qui</legend>{(Object.keys(audienceLabels) as AnnouncementAudience[]).map(value => <label key={value} className="check-field rank-choice">
      <input type="radio" name="audience" value={value} checked={audience === value} onChange={() => setAudience(value)} />
      <span><strong>{audienceLabels[value].label} · {reachLabel(counts[value])}</strong><small>{audienceLabels[value].note}</small></span>
    </label>)}</fieldset>
    <label className="field">Objet <span className="field-note">Facultatif. Sans objet, l’e-mail s’intitule « Annonce de {writer} ».</span><input name="subject" maxLength={100} placeholder={`Annonce de ${writer}`} /></label>
    <label className="field">Ton annonce<span className="field-note">Signée de ton pseudo. N’y mets ni l’adresse d’un lieu ni un code d’accès : tout le monde ne les voit pas.</span><textarea name="message" rows={8} required minLength={2} maxLength={4000} placeholder="Une soirée spéciale, un nouveau lieu, les nouvelles du cercle…" data-autofocus /></label>
    <p className="muted">Tu n’en reçois pas de copie. Trois annonces par jour au plus.</p>
    <Feedback result={a.result} />
    <button className="button primary full" disabled={a.pending || reach === 0}><Send size={16} />{a.pending ? 'Envoi…' : reach ? `Envoyer à ${reach} personne${reach > 1 ? 's' : ''}` : 'Personne à prévenir'}</button>
  </form>;
}
