'use client';
import { useState } from 'react';
import { CalendarDays, MapPin, Settings2 } from 'lucide-react';
import { MIN_PLAYERS, DEFAULT_CAPACITY, MAX_CAPACITY } from '@/lib/session-rules';
import type { GameSession, Venue } from '@/lib/types';
import { parisInput, fromParisInput, dateLong, time } from '@/lib/utils';
import { nextSessionStart, sessionEnd, DEFAULT_SESSION_HOURS } from '@/lib/session-defaults';
import { splitAddress, mapsUrl } from '@/lib/locations';
import { saveSession } from '@/app/actions';
import { Feedback, useAction } from './action-feedback';
import { AddressFields } from './address-fields';

export function SessionForm({ session, address = '', template, venues = [], onSaved }: { session?: GameSession; address?: string; template?: GameSession; venues?: Venue[]; onSaved: () => void }) {
  const a = useAction();
  const defaults = session || template;
  const releaseHours = defaults?.release_hours ?? 72;
  const releaseOptions = [...new Set([0, 24, 48, 72, 168, releaseHours])].sort((a, b) => a - b);
  const [start, setStart] = useState(() => session ? parisInput(session.starts_at) : nextSessionStart());
  const [script, setScript] = useState(defaults?.script || 'Trouble Brewing');
  const [location, setLocation] = useState(defaults?.location || 'Brest');
  // A game opens on its venue, a new one on the last game's; '' is a place typed in for this game only.
  const [venueId, setVenueId] = useState(() => { const id = defaults ? defaults.venue_id : venues[0]?.id; return venues.some(v => v.id === id) ? id! : ''; });
  const venue = venues.find(v => v.id === venueId);
  let endLabel = '';
  try { const end = sessionEnd(fromParisInput(start), session); endLabel = `${dateLong(end)} à ${time(end)}`; } catch { /* Validation explains an invalid Paris time on submit. */ }
  return <form className="stack session-form" onSubmit={e => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      const startsAt = fromParisInput(String(f.get('starts_at')));
      const payload = {
        ...(session ? { id: session.id } : {}),
        title: String(f.get('title')), script: String(f.get('script')), starts_at: startsAt,
        ...(session ? { ends_at: sessionEnd(startsAt, session) } : {}),
        location: venue ? venue.name : location, address: venue ? venue.address : String(f.get('address') ?? ''), venue_id: venue?.id ?? null,
        capacity: Number(f.get('capacity')), newcomer_seats: Number(f.get('newcomer_seats')),
        release_hours: Number(f.get('release_hours')), visibility: String(f.get('visibility')),
      };
      a.run(() => saveSession(payload), onSaved);
    } catch (err) { a.setResult({ ok: false, message: err instanceof Error ? err.message : 'Vérifie la date.' }); }
  }}>
    <p className="muted">{!session && template ? 'Le lieu, le script et les réglages de la dernière partie sont repris. Choisis la date et ajuste ce dont tu as besoin.' : 'Choisis le début de la soirée, vérifie le lieu et publie.'}</p>
    <fieldset className="form-section"><legend><CalendarDays size={18} />La soirée</legend>
      <label className="field">Nom de la partie <span className="field-note">Facultatif · sans nom, la partie prend celui du script</span><input name="title" maxLength={100} defaultValue={session?.title || ''} placeholder={script.trim() || 'Trouble Brewing'} autoFocus={!session} data-autofocus={!session || undefined} /></label>
      <div className="form-grid"><label className="field">Début · heure de Paris<input name="starts_at" required type="datetime-local" value={start} onChange={e => setStart(e.target.value)} /></label><label className="field">Script<input name="script" required list="session-scripts" minLength={2} maxLength={100} value={script} onChange={e => setScript(e.target.value)} /><datalist id="session-scripts"><option>Trouble Brewing</option><option>Bad Moon Rising</option><option>Sects &amp; Violets</option></datalist></label></div>
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
        <label className="field">Lieu affiché à tous<input name="location" required minLength={2} maxLength={150} value={location} onChange={e => setLocation(e.target.value)} placeholder="Brest · quartier ou lieu de rendez-vous" /></label>
        <AddressFields address={address} note="Visible des inscrits confirmés et des personnes dont un·e invité·e est confirmé·e" />
        {!venues.length && <p className="field-note">Enregistre vos lieux habituels dans l’onglet « Les lieux » pour les choisir ici en un clic.</p>}
      </fieldset>
    </fieldset>
    <details className="disclosure session-options"><summary><span><Settings2 size={16} />Réglages de la partie</span></summary><div className="stack">
      <div className="form-grid"><label className="field">Places joueurs<input name="capacity" type="number" required min={MIN_PLAYERS} max={MAX_CAPACITY} defaultValue={defaults?.capacity ?? DEFAULT_CAPACITY} /></label><label className="field">Dont places voyageurs<input name="newcomer_seats" type="number" required min={0} max={MAX_CAPACITY} defaultValue={defaults?.newcomer_seats ?? 3} /></label></div>
      <div className="form-grid"><label className="field">Quotas réunis à<select name="release_hours" defaultValue={releaseHours}>{releaseOptions.map(hours => <option key={hours} value={hours}>{hours === 0 ? 'L’heure de début' : hours % 24 === 0 ? `J−${hours / 24}` : `${hours} h avant`}</option>)}</select></label><label className="field">Visibilité<select name="visibility" defaultValue={defaults?.visibility || 'public'}><option value="public">Ouverte à tous</option><option value="members">Membres et leurs invités</option></select></label></div>
    </div></details>
    <Feedback result={a.result} /><button className="button primary full" disabled={a.pending}>{a.pending ? 'Enregistrement…' : session ? 'Enregistrer les modifications' : 'Publier la partie'}</button>
  </form>;
}
