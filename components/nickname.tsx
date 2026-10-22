'use client';
import { useState } from 'react';
import { LogOut, UserRound } from 'lucide-react';
import { useAction, Feedback } from './action-feedback';
import { saveNickname, signOut } from '@/app/actions';

/** First screen of a new account: the rest of the site opens once the player has chosen a pseudo. */
export function NicknameStep() {
  const a = useAction();
  const [name, setName] = useState('');
  return <div className="centered-panel panel">
    <span className="invite-icon"><UserRound size={30} /></span>
    <h1>Bienvenue dans le cercle !</h1>
    <p>Choisis le pseudo que verront les autres joueurs. Tu pourras le changer à tout moment dans ton profil.</p>
    <form className="stack auth-form" onSubmit={e => { e.preventDefault(); a.run(() => saveNickname(name)); }}>
      <label className="field">Ton pseudo<input autoFocus required minLength={2} maxLength={40} autoComplete="nickname" placeholder="Comment t’appelle-t-on ?" value={name} onChange={e => setName(e.target.value)} /></label>
      <button className="button primary full" disabled={a.pending}>{a.pending ? 'Enregistrement…' : 'Entrer'}</button>
    </form>
    <Feedback result={a.result} />
    <button className="button ghost" disabled={a.pending} onClick={() => a.run(signOut)}><LogOut size={16} />Me déconnecter</button>
  </div>;
}
