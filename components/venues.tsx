'use client';
import { useState } from 'react';
import { MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import type { GameSession, Venue } from '@/lib/types';
import { splitAddress } from '@/lib/locations';
import { deleteVenue, saveVenue } from '@/app/actions';
import { Dialog } from './dialog';
import { AddressFields } from './address-fields';
import { Feedback, useAction } from './action-feedback';

const gamesLabel = (count: number) => count ? `${count} partie${count > 1 ? 's' : ''} à venir` : 'Aucune partie à venir';

/** The usual places, which organizers add, edit and remove; a game then picks one in its form. */
export function Venues({ venues, sessions }: { venues: Venue[]; sessions: GameSession[] }) {
  const [editing, setEditing] = useState<Venue | 'new' | null>(null);
  const [removal, setRemoval] = useState<Venue | null>(null);
  const a = useAction();
  const open = <T,>(set: (value: T) => void, value: T) => { a.setResult(null); set(value); };
  // Counted like save_venue: the games it updates when the venue changes.
  const upcoming = (v: Venue) => sessions.filter(s => s.venue_id === v.id && s.status === 'published' && new Date(s.starts_at) > new Date()).length;
  return <>
    <Feedback result={a.result} />
    <div className="panel venue-panel">
      <div className="panel-heading"><h2><MapPin size={20} />Vos lieux</h2><button className="button secondary compact" onClick={() => open(setEditing, 'new')}><Plus size={16} />Ajouter un lieu</button></div>
      {venues.length ? <>
        <p className="muted">Choisis l’un de ces lieux en créant une partie. Son nom est affiché à tous ; son adresse, aux inscrits confirmés de chaque partie.</p>
        {venues.map(v => <div className="member-row venue-row" key={v.id}>
          <span className="venue-icon" aria-hidden="true"><MapPin size={18} /></span>
          <div><h3>{v.name}</h3><p className="venue-address">{splitAddress(v.address).address || 'Pas encore d’adresse'}</p></div>
          <span className="badge">{gamesLabel(upcoming(v))}</span>
          <div className="row-actions"><button aria-label={`Modifier ${v.name}`} className="icon-btn" onClick={() => open(setEditing, v)}><Pencil size={17} /></button><button aria-label={`Supprimer ${v.name}`} className="icon-btn" onClick={() => open(setRemoval, v)}><Trash2 size={17} /></button></div>
        </div>)}
      </> : <div className="empty-state borderless"><MapPin size={35} /><h2>Aucun lieu enregistré.</h2><p>Ajoute les endroits où vous jouez d’habitude : tu les choisiras en un clic à la création d’une partie.</p></div>}
    </div>
    <Dialog title={editing === 'new' ? 'Ajouter un lieu' : 'Modifier le lieu'} open={editing !== null} onClose={() => setEditing(null)}>{editing && <VenueForm venue={editing === 'new' ? undefined : editing} upcoming={editing === 'new' ? 0 : upcoming(editing)} onSaved={() => setEditing(null)} />}</Dialog>
    <Dialog title="Supprimer ce lieu ?" open={!!removal} onClose={() => setRemoval(null)}><div className="stack">
      <p>« {removal?.name} » disparaîtra de la liste des lieux. Les parties qui s’y tiennent gardent leur lieu et leur adresse.</p>
      <div className="button-row"><button className="button secondary" onClick={() => setRemoval(null)}>Garder le lieu</button><button className="button danger" disabled={a.pending} onClick={() => removal && a.run(() => deleteVenue(removal.id), () => setRemoval(null))}><Trash2 size={16} />Supprimer le lieu</button></div>
      <Feedback result={a.result} />
    </div></Dialog>
  </>;
}

function VenueForm({ venue, upcoming, onSaved }: { venue?: Venue; upcoming: number; onSaved: () => void }) {
  const a = useAction();
  return <form className="stack" onSubmit={e => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    a.run(() => saveVenue({ ...(venue ? { id: venue.id } : {}), name: String(f.get('name')), address: String(f.get('address') ?? '') }), onSaved);
  }}>
    <label className="field">Nom affiché à tous<input name="name" required minLength={2} maxLength={150} defaultValue={venue?.name || ''} placeholder="Brest · nom du lieu ou quartier" autoFocus data-autofocus /></label>
    <AddressFields address={venue?.address} note="Visible des organisateurs, et des inscrits confirmés de chaque partie dans ce lieu" />
    {upcoming > 0 && <p className="field-note">Si tu changes le nom ou l’adresse, {upcoming > 1 ? `les ${upcoming} parties à venir ici sont mises à jour et leurs inscrits prévenus` : 'la partie à venir ici est mise à jour et ses inscrits prévenus'}.</p>}
    <Feedback result={a.result} /><button className="button primary full" disabled={a.pending}>{a.pending ? 'Enregistrement…' : venue ? 'Enregistrer le lieu' : 'Ajouter le lieu'}</button>
  </form>;
}
