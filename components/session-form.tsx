'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { CalendarDays, MapPin, Settings2 } from 'lucide-react';
import { MIN_PLAYERS, DEFAULT_CAPACITY, MAX_CAPACITY } from '@/lib/session-rules';
import type { GameSession, Venue } from '@/lib/types';
import { parisInput, fromParisInput, dateLong, time } from '@/lib/utils';
import { checkSessionForm, type SessionField, type SessionFieldErrors } from '@/lib/session-form';
import { nextSessionStart, sessionEnd, DEFAULT_SESSION_HOURS } from '@/lib/session-defaults';
import { splitAddress, mapsUrl } from '@/lib/locations';
import { saveSession } from '@/app/actions';
import { Feedback, useAction } from './action-feedback';
import { AddressFields } from './address-fields';
import { FieldError, invalidField } from './ui';

export function SessionForm({ session, address = '', template, venues = [], onSaved }: { session?: GameSession; address?: string; template?: GameSession; venues?: Venue[]; onSaved: () => void }) {
  const a = useAction();
  const defaults = session || template;
  const [start, setStart] = useState(() => session ? parisInput(session.starts_at) : nextSessionStart());
  const [script, setScript] = useState(defaults?.script || 'Trouble Brewing');
  const [location, setLocation] = useState(defaults?.location || 'Brest');
  // A game opens on its venue, a new one on the last game's; '' is a place typed in for this game only.
  const [venueId, setVenueId] = useState(() => { const id = defaults ? defaults.venue_id : venues[0]?.id; return venues.some(v => v.id === id) ? id! : ''; });
  const venue = venues.find(v => v.id === venueId);
  const id = useId(); const form = useRef<HTMLFormElement>(null);
  const [errors, setErrors] = useState<SessionFieldErrors>({}); const [edits, setEdits] = useState(0);
  const check = (f: HTMLFormElement) => {
    const d = new FormData(f); const value = (name: string) => String(d.get(name) ?? '');
    return checkSessionForm({ title: value('title'), starts_at: start, script, location, address: value('address'), maps_url: value('maps_url'), capacity: value('capacity'), visibility: value('visibility') }, { session, venue });
  };
  // Once a try is refused, a flagged field's message follows what is typed and leaves as soon as it is right; anything new waits for the next try.
  // Checked after the render, when the form shows what was just changed (a venue picked hides the fields it fills).
  useEffect(() => {
    if (!edits || !form.current) return;
    const next = check(form.current).errors;
    setErrors(flagged => { const kept: SessionFieldErrors = {}; for (const k of Object.keys(flagged) as SessionField[]) if (next[k]) kept[k] = next[k]; return kept; });
  }, [edits]);
  const error = (name: SessionField) => ({ id: `${id}-${name}`, message: errors[name] });
  const wrong = Object.keys(errors).length;
  let endLabel = '';
  try { const end = sessionEnd(fromParisInput(start), session); endLabel = `${dateLong(end)} à ${time(end)}`; } catch { /* Validation explains an invalid Paris time on submit. */ }
  // The browser's own checks stay off: they cannot point at a field inside the closed settings, and then say nothing at all.
  return <form ref={form} className="stack session-form" noValidate onChange={() => { if (wrong) setEdits(n => n + 1); }} onSubmit={e => {
    e.preventDefault();
    const f = e.currentTarget;
    const { errors: found, message, payload } = check(f);
    flushSync(() => setErrors(found));
    if (!payload) {
      a.setResult(message && !Object.keys(found).length ? { ok: false, message } : null);
      const first = f.querySelector<HTMLElement>('[aria-invalid="true"]');
      const settings = first?.closest('details'); if (settings) settings.open = true;
      // Centred, the field and its message stay clear of the sticky submit button.
      first?.focus({ preventScroll: true }); first?.scrollIntoView({ block: 'center' });
      return;
    }
    a.run(() => saveSession(payload), onSaved);
  }}>
    <p className="muted">{!session && template ? 'Le lieu, le script et les réglages de la dernière partie sont repris. Choisis la date et ajuste ce dont tu as besoin.' : 'Choisis le début de la soirée, vérifie le lieu et publie.'}</p>
    <fieldset className="form-section"><legend><CalendarDays size={18} />La soirée</legend>
      <label className="field">Nom de la partie <span className="field-note">Facultatif · sans nom, la partie prend celui du script</span><input name="title" maxLength={100} defaultValue={session?.title || ''} placeholder={script.trim() || 'Trouble Brewing'} autoFocus={!session} data-autofocus={!session || undefined} {...invalidField(error('title'))} /><FieldError {...error('title')} /></label>
      <div className="form-grid"><label className="field">Début · heure de Paris<input name="starts_at" required type="datetime-local" value={start} onChange={e => setStart(e.target.value)} {...invalidField(error('starts_at'))} /><FieldError {...error('starts_at')} /></label><label className="field">Script<input name="script" required list="session-scripts" minLength={2} maxLength={100} value={script} onChange={e => setScript(e.target.value)} {...invalidField(error('script'))} /><FieldError {...error('script')} /><datalist id="session-scripts"><option>Trouble Brewing</option><option>Bad Moon Rising</option><option>Sects &amp; Violets</option></datalist></label></div>
      <p className="field-note">{session ? 'La durée de la partie est conservée.' : `Durée estimée de ${DEFAULT_SESSION_HOURS} h pour l’agenda.`}{endLabel && ` Fin prévue : ${endLabel}.`}</p>
    </fieldset>
    <fieldset className="form-section"><legend><MapPin size={18} />Le lieu</legend>
      {venues.length > 0 && <fieldset className="choice-options"><legend>Où se joue la partie ?</legend>
        {venues.map(v => <label key={v.id} className="check-field rank-choice"><input type="radio" name="venue" value={v.id} checked={venueId === v.id} onChange={() => setVenueId(v.id)} /><span><strong>{v.name}</strong><small className="venue-address">{splitAddress(v.address).address || 'Adresse à compléter dans « Les lieux »'}</small></span></label>)}
        <label className="check-field rank-choice"><input type="radio" name="venue" value="" checked={!venue} onChange={() => setVenueId('')} /><span><strong>Autre lieu</strong><small>Pour cette partie seulement, sans l’ajouter aux lieux.</small></span></label>
      </fieldset>}
      {venue && <>
        <p className="field-note">Le nom du lieu est affiché à tous ; l’adresse, aux inscrits confirmés et aux personnes dont un·e invité·e est confirmé·e. Elle se modifie dans l’onglet « Les lieux ».</p>
        {venue.address && <a className="text-link" href={mapsUrl(venue.address)} target="_blank" rel="noopener noreferrer">Vérifier le lieu sur la carte ↗</a>}
      </>}
      {/* Kept while a venue is picked, so that coming back to « Autre lieu » finds what was typed; disabled, it is neither checked nor sent. */}
      <fieldset className="venue-other" disabled={!!venue} hidden={!!venue}>
        <label className="field">Lieu affiché à tous<input name="location" required minLength={2} maxLength={150} value={location} onChange={e => setLocation(e.target.value)} placeholder="Brest · quartier ou lieu de rendez-vous" {...invalidField(error('location'))} /><FieldError {...error('location')} /></label>
        <AddressFields address={address} note="Visible des inscrits confirmés et des personnes dont un·e invité·e est confirmé·e" errors={errors} />
        {!venues.length && <p className="field-note">Enregistre vos lieux habituels dans l’onglet « Les lieux » pour les choisir ici en un clic.</p>}
      </fieldset>
    </fieldset>
    <details className="disclosure session-options"><summary><span><Settings2 size={16} />Réglages de la partie</span></summary><div className="stack">
      <div className="form-grid"><label className="field">Places joueurs<input name="capacity" type="number" required min={MIN_PLAYERS} max={MAX_CAPACITY} defaultValue={defaults?.capacity ?? DEFAULT_CAPACITY} {...invalidField(error('capacity'))} /><FieldError {...error('capacity')} /></label><label className="field">Visibilité<select name="visibility" defaultValue={defaults?.visibility || 'public'} {...invalidField(error('visibility'))}><option value="public">Ouverte à tous</option><option value="members">Membres et leurs invités</option></select><FieldError {...error('visibility')} /></label></div>
      <p className="field-note">Les places vont aux premiers inscrits, membres, voyageurs et invités confondus. Une fois le cercle complet, une liste d’attente prend le relais : chaque place libérée revient à la première personne qui attend.</p>
    </div></details>
    {wrong > 0 && <p className="alert error" role="alert">{wrong > 1 ? `${wrong} champs sont à corriger` : 'Un champ est à corriger'} {session ? 'avant d’enregistrer les modifications' : 'avant de publier la partie'}.</p>}
    <Feedback result={a.result} /><button className="button primary full" disabled={a.pending}>{a.pending ? 'Enregistrement…' : session ? 'Enregistrer les modifications' : 'Publier la partie'}</button>
  </form>;
}
