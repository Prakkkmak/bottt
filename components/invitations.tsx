'use client';
import { useState } from 'react';
import Link from 'next/link';
import { UserPlus, UsersRound, Link2, Copy, Check, X, Mail } from 'lucide-react';
import type { AppData } from '@/lib/types';
import { createInvitation, revokeInvitation, acceptInvitation, sendInvitation } from '@/app/actions';
import { useAction, Feedback } from './action-feedback';
import { SignInButton } from './auth';
import { shortDate, sessionUrl } from '@/lib/utils';
import { guestStatusLabels } from '@/lib/guests';
import { MAX_TRAVELLER_GUESTS } from '@/lib/session-rules';

export function Invitations({ data }: { data: AppData }) {
  const a = useAction();
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [email, setEmail] = useState('');
  const showLink = (token: string) => { setLink(`${window.location.origin}/invite/${token}`); setCopied(false); };
  const eligible = data.profile && ['member', 'organizer'].includes(data.profile.membership);
  const traveller = data.profile?.membership === 'newcomer';
  const upcoming = data.sessions.filter(s => s.status === 'published' && new Date(s.ends_at) > new Date())
    .flatMap(s => (s.my_guests ?? []).filter(g => g.status !== 'cancelled').map(guest => ({ session: s, guest })));
  return <>
    <div className="page-heading"><h1>Inviter</h1></div>
    <div className="invitation-layout">
      <section className="panel invitation-main">
        <span className="invite-icon"><UsersRound size={28} /></span>
        <h2>Amener quelqu’un à une partie.</h2>
        <p className="muted">{traveller ? `Ouvre une partie et clique sur un + libre. Ton ami·e n’a pas besoin de compte ; un organisateur validera sa place avec la tienne. Jusqu’à ${MAX_TRAVELLER_GUESTS} personnes par partie.` : 'Ouvre une partie et clique sur un + libre. Ton invité·e n’a pas besoin de compte et a sa place tout de suite. Amène autant de monde que les places membres le permettent.'}</p>
        {data.profile ? <Link className="button primary" href="/">Choisir une partie</Link> : <SignInButton configured={data.configured} />}
        {upcoming.length > 0 && <ul className="guest-overview" aria-label="Tes invités aux prochaines parties">{upcoming.map(({ session, guest }) => <li key={guest.id}><Link href={sessionUrl(session.id)}><strong>{guest.name}</strong><span>{session.title} · {shortDate(session.starts_at)}</span></Link><span className="badge">{guestStatusLabels[guest.status]}</span></li>)}</ul>}
      </section>
      {data.profile && <section className="panel invitation-main">
        <span className="invite-icon"><UserPlus size={28} /></span>
        <h2>Faire entrer quelqu’un dans le cercle.</h2>
        <p className="muted">Envoie-lui une invitation par e-mail : ton ami·e crée son compte avec un simple code et entre directement comme membre, sans validation.</p>
        {!eligible ? <div className="alert info">Le parrainage est réservé aux membres. Un organisateur peut te passer membre.</div> : <div className="stack">
          <form className="invite-email" onSubmit={e => { e.preventDefault(); a.run(() => sendInvitation(email), r => { if (r.value) showLink(r.value); else { setLink(''); setEmail(''); } }); }}>
            <label className="field">Son adresse e-mail<input type="email" required maxLength={254} autoComplete="off" placeholder="ami@exemple.fr" value={email} onChange={e => setEmail(e.target.value)} /></label>
            <button className="button primary" disabled={a.pending}><Mail size={17} />{a.pending ? 'Envoi…' : 'Envoyer l’invitation'}</button>
          </form>
          {link && <div className="share-link"><label className="field">Ton lien d’invitation<input readOnly value={link} onFocus={e => e.target.select()} /></label><button className="button secondary" onClick={async () => { try { await navigator.clipboard.writeText(link); setCopied(true); } catch { a.setResult({ ok: false, message: 'Sélectionne et copie le lien ci-dessus.' }); } }}>{copied ? <Check size={17} /> : <Copy size={17} />}{copied ? 'Copié !' : 'Copier le lien'}</button></div>}
          <button className="button ghost" disabled={a.pending} onClick={() => a.run(createInvitation, r => { if (r.value) showLink(r.value); })}><Link2 size={17} />{link ? 'Créer un autre lien' : 'Ou crée un lien à partager toi-même'}</button>
          <Feedback result={a.result} />
        </div>}
        <details className="disclosure invitation-rules"><summary>Comment ça marche ?</summary><div><p>Le lien est valable 7 jours, pour une seule personne. Tu peux en créer jusqu’à 5 par jour, envoyés par e-mail ou partagés toi-même.</p><p>Pour une invitation par e-mail, l’adresse est gardée pour te montrer qui tu as invité, puis effacée 30 jours après la fin de validité du lien.</p><p>Ton ami·e utilise son propre compte. Le lien lui donne directement le statut de membre ; il ou elle réserve ensuite sa place dans une partie.</p></div></details>
      </section>}
    </div>
    {data.invitations.length > 0 && <section className="panel invitation-history"><h2>Liens créés</h2>{data.invitations.map(i => <div key={i.id} className="invitation-row"><span>{i.sent_to ? <Mail size={17} /> : <Link2 size={17} />}{shortDate(i.created_at)}{i.sent_to && ` · ${i.sent_to}`}</span><span className="badge">{i.used_by ? 'Acceptée' : new Date(i.expires_at) < new Date() ? 'Expirée' : 'En attente'}</span>{!i.used_by && new Date(i.expires_at) > new Date() && <button className="icon-btn" aria-label={`Désactiver l’invitation du ${shortDate(i.created_at)}`} disabled={a.pending} onClick={() => a.run(() => revokeInvitation(i.id))}><X size={17} /></button>}</div>)}</section>}
  </>;
}

export function AcceptInvite({ data, token }: { data: AppData; token: string }) {
  const a = useAction();
  return <div className="centered-panel panel"><span className="invite-icon"><UserPlus size={30} /></span><h1>BOTTT t’invite.</h1><p>Connecte-toi avec ton e-mail, puis accepte l’invitation pour choisir une partie.</p>{!data.profile ? <SignInButton label="Me connecter pour rejoindre" configured={data.configured} /> : a.result?.ok ? <Link className="button primary" href="/">Choisir ma première partie</Link> : <button className="button primary" disabled={a.pending} onClick={() => a.run(() => acceptInvitation(token))}>Accepter l’invitation</button>}<Feedback result={a.result} /></div>;
}
