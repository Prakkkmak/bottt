'use client';
import { useId, useState } from 'react';
import { splitAddress, mapsUrl } from '@/lib/locations';
import { FieldError, invalidField } from './ui';

/** The private address and an optional map link, joined in the `address` form value the way the database keeps them. */
export function AddressFields({ address = '', note, errors = {} }: { address?: string; note: string; errors?: { address?: string; maps_url?: string } }) {
  const id = useId();
  const [initial] = useState(() => splitAddress(address));
  const [preciseAddress, setPreciseAddress] = useState(initial.address);
  const [map, setMap] = useState(initial.mapsUrl);
  const value = [preciseAddress.trim(), map.trim()].filter(Boolean).join('\n');
  const addressError = { id: `${id}-address`, message: errors.address }; const mapError = { id: `${id}-maps`, message: errors.maps_url };
  return <>
    <label className="field">Adresse précise <span className="field-note">{note}</span><textarea maxLength={500} rows={2} value={preciseAddress} onChange={e => setPreciseAddress(e.target.value)} onPaste={e => {
      const pasted = splitAddress(e.clipboardData.getData('text'));
      if (!pasted.mapsUrl) return;
      e.preventDefault();
      const input = e.currentTarget;
      setPreciseAddress(input.value.slice(0, input.selectionStart) + pasted.address + input.value.slice(input.selectionEnd));
      setMap(pasted.mapsUrl);
    }} placeholder="Adresse et indications d’accès" {...invalidField(addressError)} /><FieldError {...addressError} /></label>
    <label className="field">Lien Maps <span className="field-note">Facultatif · Google Maps, Apple Plans, Waze…</span><input type="url" name="maps_url" maxLength={500} pattern="https?://.*" value={map} onChange={e => setMap(e.target.value)} placeholder="Colle le lien de partage du lieu" {...invalidField(mapError)} /><FieldError {...mapError} /></label>
    <input type="hidden" name="address" value={value} />
    {value && <a className="text-link" href={mapsUrl(value)} target="_blank" rel="noopener noreferrer">Vérifier le lieu sur la carte ↗</a>}
  </>;
}
