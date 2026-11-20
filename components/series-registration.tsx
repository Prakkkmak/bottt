'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Repeat, UserPlus } from 'lucide-react';
import type { ActionResult, GameSession, SeriesRegistration } from '@/lib/types';
import { namesList, regularsLabel, seriesBadge } from '@/lib/series';
import { MAX_SERIES_GUESTS } from '@/lib/session-rules';
import { saveSeriesRegistration } from '@/app/actions';
import { Dialog } from './dialog';
import { useAction, Feedback } from './action-feedback';
import { Spinner } from './ui';

const sameName = (a: string, b: string) => a.toLocaleLowerCase('fr') === b.toLocaleLowerCase('fr');
const tidy = (name: string) => name.replace(/\s+/g, ' ').trim();

/** In « Ta venue », on a date of a series: whether the viewer comes to every date, with whom, and the dialog that changes it.
 * Once the series opens no more dates, only a registration already made shows, to be cut down or stopped. */
export function SeriesRegistrationRow({ session: s, suggestions }: { session: GameSession; suggestions: string[] }) {
  const a = useAction();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const badge = seriesBadge(s);
  const mine = s.my_series ?? null;
  if (!badge && !mine) return null;
  // A failure may come from a date or a series that changed meanwhile: the page is read again.
  const save = (value: Value) => a.run(async () => {
    const result = await saveSeriesRegistration(s.id, value);
    if (!result.ok) router.refresh();
    return result;
  }, () => setOpen(false));
  const rhythm = badge?.toLocaleLowerCase('fr');
  // The switch shows the state; changing it goes through the dialog, which also says who comes along.
  const label = !badge ? 'Arrêter ton inscription à chaque date' : mine ? `Modifier ton inscription ${rhythm}` : `Venir ${rhythm}`;
  return <div className="venue-group">
    <div className="venue-row">
      <span className="venue-icon" aria-hidden="true"><Repeat size={15} /></span>
      <span className="venue-copy"><strong>{badge ?? 'Inscription à chaque date'}</strong>
        <small>{!badge ? 'Cette partie n’ouvre plus de nouvelle date.' : mine ? `Place prise d’office pour ${regularsLabel(mine)}` : 'Ta place prise d’office à chaque nouvelle date'}</small></span>
      <button type="button" className={`venue-switch ${mine ? 'is-on' : ''}`} aria-haspopup="dialog" aria-label={label} title={label} disabled={a.pending} onClick={() => { a.setResult(null); setOpen(true); }}><span aria-hidden="true" /></button>
    </div>
    {!open && <Feedback result={a.result} />}
    <Dialog open={open} onClose={() => setOpen(false)} title={badge ? `Venir ${rhythm}` : 'Inscription à chaque date'} guard>
      <SeriesRegistrationForm current={mine} suggestions={suggestions} pending={a.pending} onSubmit={save} result={a.result} canAdd={!!badge} />
    </Dialog>
  </div>;
}

type Value = { self: boolean; guests: string[]; release: boolean };

/** The player, up to two people they bring, and, for those taken off, whether their places at the dates already open go too.
 * Without canAdd, for a series that opens no more dates, people can only be taken off. */
export function SeriesRegistrationForm({ current, suggestions, pending, onSubmit, result, canAdd = true }: { current: SeriesRegistration | null; suggestions: string[]; pending: boolean; onSubmit: (value: Value) => void; result: ActionResult | null; canAdd?: boolean }) {
  const [self, setSelf] = useState(current?.self ?? true);
  const [guests, setGuests] = useState<string[]>(current?.guests ?? []);
  const [typed, setTyped] = useState('');
  const [release, setRelease] = useState(false);
  const [error, setError] = useState('');
  const full = guests.length >= MAX_SERIES_GUESTS || !canAdd;
  const add = (name: string) => {
    const clean = tidy(name);
    if (clean.length < 2 || clean.length > 40) { setError('Indique un prénom ou un pseudo de 2 à 40 caractères.'); return false; }
    if (guests.some(g => sameName(g, clean))) { setTyped(''); return true; }
    if (full) { setError(`Tu peux inscrire ${MAX_SERIES_GUESTS} invité·es au plus à chaque date.`); return false; }
    setGuests(list => [...list, clean]); setTyped(''); setError(''); return true;
  };
  // Those the registration takes in now and no longer will: their places at the dates already open can go with them.
  const dropped = [...(current?.self && !self ? ['toi'] : []), ...(current?.guests ?? []).filter(g => !guests.some(n => sameName(n, g)))];
  const nobody = !self && guests.length === 0;
  const offered = suggestions.filter(n => !guests.some(g => sameName(g, n))).slice(0, 4);
  const label = nobody ? 'Arrêter l’inscription à chaque date' : current ? 'Enregistrer' : self ? 'M’inscrire à chaque date' : `Inscrire ${namesList(guests)} à chaque date`;
  const submit = () => {
    // A name typed but not added yet is taken along, rather than lost.
    let list = guests;
    if (tidy(typed)) {
      if (!add(typed)) return;
      if (!guests.some(g => sameName(g, tidy(typed)))) list = [...guests, tidy(typed)];
    }
    if (!current && !self && list.length === 0) { setError('Coche ta venue ou ajoute un·e invité·e.'); return; }
    onSubmit({ self, guests: list, release: release && dropped.length > 0 });
  };
  return <form className="stack series-form" onSubmit={e => { e.preventDefault(); submit(); }}>
    <p className="muted">{canAdd
      ? 'Les places sont prises automatiquement à chaque nouvelle date, et dès maintenant aux dates déjà ouvertes, sauf celles dont tu t’es désisté·e. Si une date est complète, c’est sur la liste d’attente, et un e-mail te prévient. Te désister d’une date ne touche pas aux suivantes.'
      : 'Cette partie n’ouvre plus de nouvelle date : retire les personnes qui ne doivent plus être prises si elle reprend.'}</p>
    {(canAdd || current?.self) && <label className="check-field"><input type="checkbox" name="self" checked={self} onChange={e => setSelf(e.target.checked)} /><span>Je viens à chaque date</span></label>}
    {(canAdd || guests.length > 0) && <fieldset className="series-guests">
      <legend>Tes invité·es à chaque date{canAdd && <span> · {guests.length} sur {MAX_SERIES_GUESTS}</span>}</legend>
      {guests.map(g => <div className="my-guest-row" key={g}><input type="hidden" name="guests" value={g} /><span>{g}</span><button type="button" className="button ghost compact" aria-label={`Retirer ${g}`} onClick={() => setGuests(list => list.filter(n => n !== g))}>Retirer</button></div>)}
      {!full && <div className="series-guest-add">
        <label className="field"><span className="sr-only">Prénom ou pseudo</span><input name="guest" maxLength={40} autoComplete="off" value={typed} placeholder="Prénom ou pseudo" onChange={e => { setTyped(e.target.value); setError(''); }}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (tidy(typed)) add(typed); } }} /></label>
        <button type="button" className="button secondary compact" disabled={!tidy(typed)} onClick={() => add(typed)}><UserPlus size={15} />Ajouter</button>
      </div>}
      {!full && offered.length > 0 && <div className="guest-suggestions"><span>Récemment :</span>{offered.map(n => <button type="button" key={n} className="guest-chip" onClick={() => add(n)}>{n}</button>)}</div>}
    </fieldset>}
    {current && dropped.length > 0 && <label className="check-field"><input type="checkbox" name="release" checked={release} onChange={e => setRelease(e.target.checked)} />
      <span>Libérer aussi {dropped[0] === 'toi' ? dropped.length > 1 ? `ta place et celle de ${namesList(dropped.slice(1))}` : 'ta place' : `la place de ${namesList(dropped)}`} aux dates déjà ouvertes</span></label>}
    {error && <p className="field-error" role="alert">{error}</p>}
    <Feedback result={result} />
    <div className="button-row">
      {current && !nobody && <button type="button" className="button secondary" disabled={pending} onClick={() => { setSelf(false); setGuests([]); setTyped(''); setError(''); }}>Tout arrêter</button>}
      <button className={`button ${nobody ? 'danger' : 'primary'}`} disabled={pending || (!current && nobody)} aria-busy={pending || undefined}>{pending && <Spinner />}{label}</button>
    </div>
  </form>;
}
