'use client';
import { useState } from 'react';
import { LogOut, Save } from 'lucide-react';
import type { AppData } from '@/lib/types';
import { Avatar } from './ui';
import { AuthForm } from './auth';
import { useAction, Feedback } from './action-feedback';
import { saveProfile, signOut } from '@/app/actions';

export function ProfileView({ data }: { data: AppData }) {
  const p = data.profile;
  const a = useAction();
  const [color, setColor] = useState(p?.avatar_color || 'rose');
  const [name, setName] = useState(p?.display_name || '');
  return <>
    <div className="page-heading"><div><h1>Mon profil</h1><p>Juste ce qu’il faut pour faire connaissance.</p></div></div>
    {!p ? <div className="panel centered-panel"><AuthForm configured={data.configured} /></div> : <div className="profile-editor">
      <form className="panel stack" onSubmit={e => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        a.run(() => saveProfile({
          display_name: name,
          bio: String(f.get('bio')),
          avatar_color: color,
          beginner: f.get('beginner') === 'on',
          can_storytell: f.get('can_storytell') === 'on',
        }));
      }}>
        <div className="profile-preview"><Avatar name={name || 'Moi'} color={color} /><div><h2>{name || 'Ton pseudo'}</h2><span className="badge">{p.membership === 'organizer' ? 'Organisateur·rice' : p.membership === 'newcomer' ? 'Nouveau visage' : 'Membre du cercle'}</span></div></div>
        <fieldset className="color-options"><legend>Ta couleur</legend>{['rose', 'blue', 'sage', 'ochre', 'lilac'].map(c => <label key={c} className={`color-option color-${c}`} title={c}><input type="radio" name="color" value={c} checked={color === c} onChange={() => setColor(c)} aria-label={`Couleur ${c}`} /><span /></label>)}</fieldset>
        <label className="field">Prénom ou pseudo<input required minLength={2} maxLength={40} value={name} onChange={e => setName(e.target.value)} /></label>
        <label className="field">Quelques mots sur toi <span className="field-note">Facultatif</span><textarea name="bio" rows={3} maxLength={300} defaultValue={p.bio} placeholder="Plutôt bon menteur ou détective du dimanche ?" /></label>
        <div>
          <label className="check-field"><input type="checkbox" name="beginner" defaultChecked={p.beginner} /><span>Je découvre Blood on the Clocktower</span></label>
          <label className="check-field"><input type="checkbox" name="can_storytell" defaultChecked={p.can_storytell} /><span>Je veux bien être MJ (conteur ou conteuse)</span></label>
        </div>
        <button className="button primary" disabled={a.pending}><Save size={17} />Enregistrer mon profil</button>
        <Feedback result={a.result} />
      </form>
      <button className="button ghost" disabled={a.pending} onClick={() => a.run(signOut)}><LogOut size={16} />Me déconnecter</button>
    </div>}
  </>;
}
