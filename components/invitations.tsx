'use client';
import { useState } from 'react';
import Link from 'next/link';
import { UserPlus, Link2, Copy, Check, X } from 'lucide-react';
import type { AppData } from '@/lib/types';
import { createInvitation, revokeInvitation, acceptInvitation } from '@/app/actions';
import { useAction, Feedback } from './action-feedback';
import { SignInButton } from './auth';
import { shortDate } from '@/lib/utils';

export function Invitations({ data }: { data: AppData }) {
  const a = useAction();
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState(false);
  const eligible = data.profile && ['member', 'organizer'].includes(data.profile.membership);
  return <>
    <div className="page-heading"><h1>Inviter un ami</h1></div>
    <div className="invitation-layout"><section className="panel invitation-main">
      <span className="invite-icon"><UserPlus size={28} /></span>
      <h2>Un nouveau visage au village.</h2>
      <p className="muted">Crée un lien, envoie-le à ton ami. Il rejoint le cercle et choisit sa partie.</p>
      {!data.profile ? <SignInButton configured={data.configured} /> : !eligible ? <div className="alert info">Tu pourras inviter tes amis après validation de ta première participation.</div> : <div className="stack">
        {link && <div className="share-link"><label className="field">Ton lien d’invitation<input readOnly value={link} onFocus={e => e.target.select()} /></label><button className="button secondary" onClick={async () => { try { await navigator.clipboard.writeText(link); setCopied(true); } catch { a.setResult({ ok: false, message: 'Sélectionne et copie le lien ci-dessus.' }); } }}>{copied ? <Check size={17} /> : <Copy size={17} />}{copied ? 'Copié !' : 'Copier le lien'}</button></div>}
        <button className={`button ${link ? 'ghost' : 'primary'}`} disabled={a.pending} onClick={() => a.run(createInvitation, r => { setLink(`${window.location.origin}/invite/${r.value}`); setCopied(false); })}><Link2 size={17} />{a.pending ? 'Création…' : link ? 'Créer un autre lien' : 'Créer un lien d’invitation'}</button>
        <Feedback result={a.result} />
      </div>}
      <details className="disclosure invitation-rules"><summary>Comment ça marche ?</summary><div><p>Le lien est valable 7 jours, pour une seule personne. Tu peux en créer jusqu’à 5 par jour.</p><p>Ton ami utilise son propre compte. L’invitation lui donne accès au cercle ; il doit ensuite réserver sa place dans une partie.</p></div></details>
    </section></div>
    {data.invitations.length > 0 && <section className="panel invitation-history"><h2>Liens créés</h2>{data.invitations.map(i => <div key={i.id} className="invitation-row"><span><Link2 size={17} />{shortDate(i.created_at)}</span><span className="badge">{i.used_by ? 'Acceptée' : new Date(i.expires_at) < new Date() ? 'Expirée' : 'En attente'}</span>{!i.used_by && new Date(i.expires_at) > new Date() && <button className="icon-btn" aria-label={`Désactiver l’invitation du ${shortDate(i.created_at)}`} disabled={a.pending} onClick={() => a.run(() => revokeInvitation(i.id))}><X size={17} /></button>}</div>)}</section>}
  </>;
}

export function AcceptInvite({ data, token }: { data: AppData; token: string }) {
  const a = useAction();
  return <div className="centered-panel panel"><span className="invite-icon"><UserPlus size={30} /></span><h1>BOTTT t’invite.</h1><p>Connecte-toi avec ton e-mail, puis accepte l’invitation pour choisir une partie.</p>{!data.profile ? <SignInButton label="Me connecter pour rejoindre" configured={data.configured} /> : a.result?.ok ? <Link className="button primary" href="/">Choisir ma première partie</Link> : <button className="button primary" disabled={a.pending} onClick={() => a.run(() => acceptInvitation(token))}>Accepter l’invitation</button>}<Feedback result={a.result} /></div>;
}
