'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { CalendarDays, MapPin, Settings2 } from 'lucide-react';
import { MIN_CAPACITY, DEFAULT_CAPACITY, MAX_CAPACITY, SERIES_WEEKS_AHEAD, DEFAULT_WEEKS_AHEAD } from '@/lib/session-rules';
import type { GameSession, Venue } from '@/lib/types';
import { parisInput, fromParisInput, dateLong, time } from '@/lib/utils';
import { checkSessionForm, type SessionField, type SessionFieldErrors } from '@/lib/session-form';
import { nextSessionStart, sessionEnd, DEFAULT_SESSION_HOURS } from '@/lib/session-defaults';
import { splitAddress } from '@/lib/locations';
import { rhythmLabel, weeksAheadLabel } from '@/lib/series';
import { saveSeries, saveSession } from '@/app/actions';
import { Feedback, useAction } from './action-feedback';
import { AddressFields } from './address-fields';
import { MapLinks } from './map-links';
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
  // A new game may come back every week or every other week ('1', '2'); '' is one date. A game being edited stays one date.
  const [repeat, setRepeat] = useState('');
  const [weeksAhead, setWeeksAhead] = useState(String(DEFAULT_WEEKS_AHEAD));
  const repeating = !session && repeat !== '';
  const id = useId(); const form = useRef<HTMLFormElement>(null);
  const [errors, setErrors] = useState<SessionFieldErrors>({}); const [edits, setEdits] = useState(0);
  const check = (f: HTMLFormElement) => {
    const d = new FormData(f); const value = (name: string) => String(d.get(name) ?? '');
    return checkSessionForm({ title: value('title'), starts_at: start, script, location, address: value('address'), maps_url: value('maps_url'), capacity: value('capacity'), visibility: value('visibility'),
      ...(repeating ? { repeat, weeks_ahead: weeksAhead, ends_on: value('ends_on') } : {}) }, { session, venue });
  };
  // Once a try is refused, a flagged field's message follows what is typed and leaves as soon as it is right; anything new waits for the next try.
  // Checked after the render, when the form shows what was just changed (a venue picked hides the fields it fills).
  useEffect(() => {
    if (!edits || !form.current) return;
    const next = check(form.current).errors;
    setErrors(flagged => {
      const kept: SessionFieldErrors = {}; for (const k of Object.keys(flagged) as SessionField[]) if (next[k]) kept[k] = next[k];
      // Unchanged, the same object spares a second render on each keystroke.
      return (Object.keys(flagged) as SessionField[]).every(k => kept[k] === flagged[k]) ? flagged : kept;
    });
  }, [edits]);
  const error = (name: SessionField) => ({ id: `${id}-${name}`, message: errors[name] });
  const wrong = Object.keys(errors).length;
  // A map link pasted into the address fills both fields without a change event.
  const recheck = () => { if (wrong) setEdits(n => n + 1); };
  let endLabel = '';
  try { const end = sessionEnd(fromParisInput(start), session); endLabel = `${dateLong(end)} à ${time(end)}`; } catch { /* Validation explains an invalid Paris time on submit. */ }
  // The browser's own checks stay off: they cannot point at a field inside the closed settings, and then say nothing at all.
  return <form ref={form} className="stack session-form" noValidate onChange={recheck} onPaste={recheck} onSubmit={e => {
    e.preventDefault();
    const f = e.currentTarget;
    const { errors: found, message, payload } = check(f);
    flushSync(() => setErrors(found));
    if (!payload) {
      a.setResult(message && !Object.keys(found).length ? { ok: false, message } : null);
      // The settings open whenever one of their fields is wrong, even when another field comes first.
      const settings = f.querySelector('details [aria-invalid="true"]')?.closest('details'); if (settings) settings.open = true;
      const first = f.querySelector<HTMLElement>('[aria-invalid="true"]');
      // Centred, the field and its message stay clear of the sticky submit button.
      first?.focus({ preventScroll: true }); first?.scrollIntoView({ block: 'center' });
      return;
    }
    a.run(() => 'every_weeks' in payload ? saveSeries(payload) : saveSession(payload), onSaved);
  }}>
    <p className="muted">{!session && template ? 'Le lieu, le script et les réglages de la dernière partie sont repris. Choisis la date et ajuste ce dont tu as besoin.' : 'Choisis le début de la soirée, vérifie le lieu et publie.'}</p>
    <fieldset className="form-section"><legend><CalendarDays size={18} />La soirée</legend>
      <label className="field">Nom de la partie <span className="field-note">Facultatif · sans nom, la partie prend celui du script</span><input name="title" maxLength={100} defaultValue={session?.title || ''} placeholder={script.trim() || 'Trouble Brewing'} autoFocus={!session} data-autofocus={!session || undefined} {...invalidField(error('title'))} /><FieldError {...error('title')} /></label>
      <div className="form-grid"><label className="field">Début · heure de Paris<input name="starts_at" required type="datetime-local" value={start} onChange={e => setStart(e.target.value)} {...invalidField(error('starts_at'))} /><FieldError {...error('starts_at')} /></label><label className="field">Script<input name="script" required list="session-scripts" minLength={2} maxLength={100} value={script} onChange={e => setScript(e.target.value)} {...invalidField(error('script'))} /><FieldError {...error('script')} /><datalist id="session-scripts"><option>Trouble Brewing</option><option>Bad Moon Rising</option><option>Sects &amp; Violets</option></datalist></label></div>
      <p className="field-note">{session ? 'La durée de la partie est conservée.' : `Durée estimée de ${DEFAULT_SESSION_HOURS} h pour l’agenda.`}{endLabel && ` Fin prévue : ${endLabel}.`}</p>
      {!session && <>
        <div className="form-grid">
          <label className="field">Répétition<select name="repeat" value={repeat} onChange={e => setRepeat(e.target.value)} {...invalidField(error('repeat'))}><option value="">Une seule fois</option><option value="1">{rhythmLabel(1, start.slice(0, 10))}</option><option value="2">{rhythmLabel(2, start.slice(0, 10))}</option></select><FieldError {...error('repeat')} /></label>
          {repeating && <label className="field">Dates ouvertes<select name="weeks_ahead" value={weeksAhead} onChange={e => setWeeksAhead(e.target.value)} {...invalidField(error('weeks_ahead'))}>{SERIES_WEEKS_AHEAD.map(n => <option key={n} value={n}>{weeksAheadLabel(n)}</option>)}</select><FieldError {...error('weeks_ahead')} /></label>}
        </div>
        {repeating && <>
          <label className="field">Dernière date <span className="field-note">Facultatif · sans date, la série continue jusqu’à ce que tu l’arrêtes</span><input name="ends_on" type="date" min={start.slice(0, 10)} {...invalidField(error('ends_on'))} /><FieldError {...error('ends_on')} /></label>
          <p className="field-note">Chaque date devient une partie à part, avec ses propres inscrits : tu peux la modifier ou l’annuler sans toucher aux autres. Les dates s’ouvrent au fur et à mesure, {weeksAheadLabel(Number(weeksAhead))}, pour que chacun puisse s’inscrire à l’avance.</p>
        </>}
      </>}
    </fieldset>
    <fieldset className="form-section"><legend><MapPin size={18} />Le lieu</legend>
      {venues.length > 0 && <fieldset className="choice-options"><legend>Où se joue la partie ?</legend>
        {venues.map(v => <label key={v.id} className="check-field rank-choice"><input type="radio" name="venue" value={v.id} checked={venueId === v.id} onChange={() => setVenueId(v.id)} /><span><strong>{v.name}</strong><small className="venue-address">{splitAddress(v.address).address || 'Adresse à compléter dans « Les lieux »'}</small></span></label>)}
        <label className="check-field rank-choice"><input type="radio" name="venue" value="" checked={!venue} onChange={() => setVenueId('')} /><span><strong>Autre lieu</strong><small>Pour cette partie seulement, sans l’ajouter aux lieux.</small></span></label>
      </fieldset>}
      {venue && <>
        <p className="field-note">Le nom du lieu est affiché à tous ; l’adresse, aux inscrits confirmés et aux personnes dont un·e invité·e est confirmé·e. Elle se modifie dans l’onglet « Les lieux ».</p>
        {venue.address && <p className="map-check">Vérifier sur <MapLinks value={venue.address} className="text-link" external /></p>}
      </>}
      {/* Kept while a venue is picked, so that coming back to « Autre lieu » finds what was typed; disabled, it is neither checked nor sent. */}
      <fieldset className="venue-other" disabled={!!venue} hidden={!!venue}>
        <label className="field">Lieu affiché à tous<input name="location" required minLength={2} maxLength={150} value={location} onChange={e => setLocation(e.target.value)} placeholder="Brest · quartier ou lieu de rendez-vous" {...invalidField(error('location'))} /><FieldError {...error('location')} /></label>
        <AddressFields address={address} note="Visible des inscrits confirmés et des personnes dont un·e invité·e est confirmé·e" errors={errors} />
        {!venues.length && <p className="field-note">Enregistre vos lieux habituels dans l’onglet « Les lieux » pour les choisir ici en un clic.</p>}
      </fieldset>
    </fieldset>
    <details className="disclosure session-options"><summary><span><Settings2 size={16} />Réglages de la partie</span></summary><div className="stack">
      <div className="form-grid"><label className="field">Places, MJ compris<input name="capacity" type="number" required min={MIN_CAPACITY} max={MAX_CAPACITY} defaultValue={defaults?.capacity ?? DEFAULT_CAPACITY} {...invalidField(error('capacity'))} /><FieldError {...error('capacity')} /></label><label className="field">Visibilité<select name="visibility" defaultValue={defaults?.visibility || 'public'} {...invalidField(error('visibility'))}><option value="public">Ouverte à tous</option><option value="members">Membres et leurs invités</option></select><FieldError {...error('visibility')} /></label></div>
      <p className="field-note">Le MJ prend l’une de ces places : {DEFAULT_CAPACITY} places, par exemple, pour {DEFAULT_CAPACITY - 1} joueurs et le MJ. Une nouvelle partie reprend le nombre de la dernière. Les places vont aux premiers inscrits, membres, voyageurs et invités confondus. Une fois le cercle complet, une liste d’attente prend le relais : chaque place libérée revient à la première personne qui attend.</p>
    </div></details>
    {wrong > 0 && <p className="alert error" role="alert">{wrong > 1 ? `${wrong} champs sont à corriger` : 'Un champ est à corriger'} {session ? 'avant d’enregistrer les modifications' : repeating ? 'avant de publier la série' : 'avant de publier la partie'}.</p>}
    <Feedback result={a.result} /><button className="button primary full" disabled={a.pending}>{a.pending ? 'Enregistrement…' : session ? 'Enregistrer les modifications' : repeating ? 'Publier la série' : 'Publier la partie'}</button>
  </form>;
}
