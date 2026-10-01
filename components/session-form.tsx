'use client';
import { useState } from 'react';
import { CalendarDays, MapPin, Settings2 } from 'lucide-react';
import { MIN_PLAYERS, DEFAULT_CAPACITY, MAX_CAPACITY } from '@/lib/session-rules';
import type { GameSession } from '@/lib/types';
import { parisInput, fromParisInput, dateLong, time } from '@/lib/utils';
import { nextSessionStart, sessionEnd, DEFAULT_SESSION_HOURS } from '@/lib/session-defaults';
import { splitAddress, mapsUrl } from '@/lib/locations';
import { saveSession } from '@/app/actions';
import { Feedback, useAction } from './action-feedback';

export function SessionForm({ session, address = '', template, onSaved }: { session?: GameSession; address?: string; template?: GameSession; onSaved: () => void }) {
  const a = useAction();
  const defaults = session || template;
  const releaseHours = defaults?.release_hours ?? 72;
  const releaseOptions = [...new Set([0, 24, 48, 72, 168, releaseHours])].sort((a, b) => a - b);
  const [start, setStart] = useState(() => session ? parisInput(session.starts_at) : nextSessionStart());
  const [location, setLocation] = useState(defaults?.location || 'Brest');
  const previousAddress = splitAddress(address);
  const [preciseAddress, setPreciseAddress] = useState(previousAddress.address);
  const [map, setMap] = useState(previousAddress.mapsUrl);
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
        location, address: [preciseAddress.trim(), map.trim()].filter(Boolean).join('\n'),
        capacity: Number(f.get('capacity')), newcomer_seats: Number(f.get('newcomer_seats')),
        release_hours: Number(f.get('release_hours')), visibility: String(f.get('visibility')),
      };
      a.run(() => saveSession(payload), onSaved);
    } catch (err) { a.setResult({ ok: false, message: err instanceof Error ? err.message : 'Vérifie la date.' }); }
  }}>
    <p className="muted">{!session && template ? 'Les réglages de la dernière partie sont repris. Ajuste ce dont tu as besoin.' : 'Choisis le début de la soirée, vérifie le lieu et publie.'}</p>
    <fieldset className="form-section"><legend><CalendarDays size={18} />La soirée</legend>
      <label className="field">Nom de la partie<input name="title" required minLength={3} maxLength={100} defaultValue={defaults?.title || 'Soirée Blood on the Clocktower'} /></label>
      <div className="form-grid"><label className="field">Début · heure de Paris<input name="starts_at" required type="datetime-local" value={start} onChange={e => setStart(e.target.value)} /></label><label className="field">Script<input name="script" required list="session-scripts" minLength={2} maxLength={100} defaultValue={defaults?.script || 'Trouble Brewing'} /><datalist id="session-scripts"><option>Trouble Brewing</option><option>Bad Moon Rising</option><option>Sects &amp; Violets</option></datalist></label></div>
      <p className="field-note">{session ? 'La durée de la partie est conservée.' : `Durée estimée de ${DEFAULT_SESSION_HOURS} h pour l’agenda.`}{endLabel && ` Fin prévue : ${endLabel}.`}</p>
    </fieldset>
    <fieldset className="form-section"><legend><MapPin size={18} />Le lieu</legend>
      <label className="field">Lieu affiché à tous<input name="location" required minLength={2} maxLength={150} value={location} onChange={e => setLocation(e.target.value)} placeholder="Brest · quartier ou lieu de rendez-vous" /></label>
      <label className="field">Adresse précise <span className="field-note">Visible uniquement des inscrits confirmés</span><textarea name="address" maxLength={500} rows={2} value={preciseAddress} onChange={e => setPreciseAddress(e.target.value)} onPaste={e => {
        const pasted = splitAddress(e.clipboardData.getData('text'));
        if (!pasted.mapsUrl) return;
        e.preventDefault();
        const input = e.currentTarget;
        setPreciseAddress(input.value.slice(0, input.selectionStart) + pasted.address + input.value.slice(input.selectionEnd));
        setMap(pasted.mapsUrl);
      }} placeholder="Adresse et indications d’accès" /></label>
      <label className="field">Lien Maps <span className="field-note">Facultatif · Google Maps, Apple Plans, Waze…</span><input type="url" name="maps_url" maxLength={500} pattern="https?://.*" value={map} onChange={e => setMap(e.target.value)} placeholder="Colle le lien de partage du lieu" /></label>
      {(map || preciseAddress) && <a className="text-link" href={mapsUrl([preciseAddress, map].filter(Boolean).join('\n'))} target="_blank" rel="noopener noreferrer">Vérifier le lieu sur la carte ↗</a>}
    </fieldset>
    <details className="disclosure session-options"><summary><span><Settings2 size={16} />Réglages de la partie</span></summary><div className="stack">
      <div className="form-grid"><label className="field">Places joueurs<input name="capacity" type="number" required min={MIN_PLAYERS} max={MAX_CAPACITY} defaultValue={defaults?.capacity ?? DEFAULT_CAPACITY} /></label><label className="field">Dont nouveaux<input name="newcomer_seats" type="number" required min={0} max={MAX_CAPACITY} defaultValue={defaults?.newcomer_seats ?? 3} /></label></div>
      <div className="form-grid"><label className="field">Quotas réunis à<select name="release_hours" defaultValue={releaseHours}>{releaseOptions.map(hours => <option key={hours} value={hours}>{hours === 0 ? 'L’heure de début' : hours % 24 === 0 ? `J−${hours / 24}` : `${hours} h avant`}</option>)}</select></label><label className="field">Visibilité<select name="visibility" defaultValue={defaults?.visibility || 'public'}><option value="public">Ouverte à tous</option><option value="members">Membres et personnes parrainées</option></select></label></div>
    </div></details>
    <Feedback result={a.result} /><button className="button primary full" disabled={a.pending}>{a.pending ? 'Enregistrement…' : session ? 'Enregistrer les modifications' : 'Publier la partie'}</button>
  </form>;
}
