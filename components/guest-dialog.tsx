'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus } from 'lucide-react';
import type { ActionResult } from '@/lib/types';
import { addGuest } from '@/app/actions';
import { useAction, Feedback } from './action-feedback';

/** Brings someone without an account: a first name is all we keep. */
export function GuestForm({ sessionId, seat, traveller, waitlist, suggestions, onDone }: { sessionId: string; seat?: number; traveller: boolean; waitlist: boolean; suggestions: string[]; onDone: (result: ActionResult) => void }) {
  const a = useAction();
  const router = useRouter();
  const [name, setName] = useState('');
  // The typed name keeps its case; the stand-in is lower case except where it starts the sentence.
  const typed = name.trim();
  const who = typed || 'cette personne';
  const note = traveller ? `Comme toi, ${who} attendra la validation d’un organisateur.`
    : waitlist ? `Les places membres sont prises : ${who} rejoint la liste d’attente et tu seras prévenu·e dès qu’une place se libère.`
    : `${typed || 'Cette personne'} a sa place tout de suite, affiché·e comme ton invité·e. Préviens-le·la de l’heure et du lieu.`;
  const label = traveller ? 'Demander sa place' : waitlist ? 'Mettre en liste d’attente' : typed ? `Placer ${typed}` : 'Placer cette personne';
  // A failure often means the seats on screen are stale (a + just taken), so load the current ones.
  const submit = () => a.run(async () => {
    const result = await addGuest(sessionId, name, seat);
    if (!result.ok) router.refresh();
    return result;
  }, onDone);
  return <form className="stack guest-form" onSubmit={e => { e.preventDefault(); submit(); }}>
    <label className="field">Prénom ou pseudo<input autoFocus data-autofocus required minLength={2} maxLength={40} autoComplete="off" value={name} onChange={e => setName(e.target.value)} placeholder="Antoine" /></label>
    {suggestions.length > 0 && <div className="guest-suggestions"><span>Récemment :</span>{suggestions.map(s => <button type="button" key={s} className="guest-chip" aria-pressed={name === s} onClick={() => setName(s)}>{s}</button>)}</div>}
    <p className="muted">{note}</p>
    <Feedback result={a.result} />
    <button className="button primary full" disabled={a.pending}><UserPlus size={17} />{a.pending ? 'Enregistrement…' : label}</button>
  </form>;
}
