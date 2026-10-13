'use client';
import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import type { ActionResult } from '@/lib/types';
import { addGuest } from '@/app/actions';
import { useAction, Feedback } from './action-feedback';

/** Brings someone without an account: a first name is all we keep. */
export function GuestForm({ sessionId, seat, traveller, waitlist, suggestions, onDone }: { sessionId: string; seat?: number; traveller: boolean; waitlist: boolean; suggestions: string[]; onDone: (result: ActionResult) => void }) {
  const a = useAction();
  const [name, setName] = useState('');
  const who = name.trim() || 'Cette personne';
  const note = traveller ? `Comme toi, ${who} attendra la validation d’un organisateur.`
    : waitlist ? `Les places membres sont prises : ${who} rejoint la liste d’attente et tu seras prévenu·e dès qu’une place se libère.`
    : `${who} a sa place tout de suite, affiché·e comme ton invité·e. Préviens-le·la de l’heure et du lieu.`;
  const label = traveller ? 'Demander sa place' : waitlist ? 'Mettre en liste d’attente' : name.trim() ? `Placer ${name.trim()}` : 'Placer cette personne';
  return <form className="stack guest-form" onSubmit={e => { e.preventDefault(); a.run(() => addGuest(sessionId, name, seat), onDone); }}>
    <label className="field">Prénom ou pseudo<input autoFocus required minLength={2} maxLength={40} autoComplete="off" value={name} onChange={e => setName(e.target.value)} placeholder="Antoine" /></label>
    {suggestions.length > 0 && <div className="guest-suggestions"><span>Récemment :</span>{suggestions.map(s => <button type="button" key={s} className="guest-chip" aria-pressed={name === s} onClick={() => setName(s)}>{s}</button>)}</div>}
    <p className="muted">{note}</p>
    <Feedback result={a.result} />
    <button className="button primary full" disabled={a.pending}><UserPlus size={17} />{a.pending ? 'Enregistrement…' : label}</button>
  </form>;
}
