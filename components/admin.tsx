'use client';
import { DateTile } from './date-tile';
import { useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Plus, CalendarDays, UsersRound, Clock3, X, Pencil, BookOpen, Link2, Trash2 } from 'lucide-react';
import type { AppData, GameSession, Booking, Membership, Profile, Venue } from '@/lib/types';
import { time, statusLabels, sessionUrl, activeBooking, sessionName } from '@/lib/utils';
import { bookingLabel, experienceLabels, experienceOf, membershipLabels, orderBySponsor, waitlistPositions } from '@/lib/guests';
import { cancelSession, deleteSession, removeParticipant, setMembership } from '@/app/actions';
import { Dialog } from './dialog';
import { Avatar } from './ui';
import { Venues } from './venues';
import { Feedback, useAction } from './action-feedback';
/** The three ranks an organizer can give; suspension is a separate action. */
const rankChoices: { value: Exclude<Membership, 'suspended'>; label: string; note: string }[] = [
  { value: 'newcomer', label: 'Voyageur·se', note: 'S’inscrit comme tout le monde, amène 2 personnes au plus, ne voit pas les parties réservées aux membres et ne parraine pas.' },
  { value: 'member', label: 'Membre', note: 'Amène des invité·es sans limite tant qu’il reste des places (2 au plus en liste d’attente) et parraine ses ami·es.' },
  { value: 'organizer', label: 'Organisateur·rice', note: 'Crée les parties, gère les participants et les comptes. Retirer ce rang demande ensuite un accès à la base.' },
];
const SessionForm = dynamic(() => import('./session-form').then(mod => mod.SessionForm), { loading: () => <p className="muted">Chargement du formulaire…</p> });

export function Admin({ data, bookings, profiles, addresses, venues, initialCreate = false }: { data: AppData; bookings: Booking[]; profiles: Profile[]; addresses: Record<string, string>; venues: Venue[]; initialCreate?: boolean }) {
  const [tab, setTab] = useState<'sessions' | 'members' | 'venues'>('sessions');
  const [editing, setEditing] = useState<GameSession | 'new' | null>(initialCreate ? 'new' : null);
  const [selected, setSelected] = useState<GameSession | null>(null);
  const [cancel, setCancel] = useState<GameSession | null>(null);
  const [removal, setRemoval] = useState<GameSession | null>(null);
  const [member, setMember] = useState<Profile | null>(null);
  const [removing, setRemoving] = useState<Booking | null>(null);
  const a = useAction();
  // One action hook serves every dialog: each opens without the previous dialog's message.
  const open = <T,>(set: (value: T) => void, value: T) => { a.setResult(null); set(value); };
  const future = data.sessions.filter(s => s.status === 'published' && new Date(s.ends_at) > new Date());
  const waitingCount = future.reduce((count, s) => count + s.waitlist_count, 0);
  const template = [...data.sessions].filter(s => s.status === 'published').sort((x, y) => Date.parse(y.starts_at) - Date.parse(x.starts_at))[0];
  const isPast = (s: GameSession) => new Date(s.ends_at) <= new Date();
  // An upcoming game with people in it is cancelled first, so that everyone is told.
  const deletable = (s: GameSession) => s.status === 'cancelled' || isPast(s) || (s.confirmed_count === 0 && !bookings.some(b => b.session_id === s.id && activeBooking(b.status)));
  // Upcoming games first in date order, then past and cancelled ones, most recent first.
  const listed = [...data.sessions].sort((x, y) => { const ax = x.status === 'published' && !isPast(x), ay = y.status === 'published' && !isPast(y); if (ax !== ay) return ax ? -1 : 1; return ax ? Date.parse(x.starts_at) - Date.parse(y.starts_at) : Date.parse(y.starts_at) - Date.parse(x.starts_at); });
  const sponsorOf = (b: Booking) => profiles.find(p => p.id === b.sponsor_id);
  const nameOf = (b: Booking) => b.guest_name ?? b.profile?.display_name ?? 'Joueur';
  const participants = selected ? orderBySponsor(bookings.filter(b => b.session_id === selected.id && !['cancelled', 'declined'].includes(b.status))) : [];
  const queue = waitlistPositions(participants);
  return <><div className="page-heading admin-heading"><h1>Organiser</h1><button className="button primary compact" onClick={() => setEditing('new')}><Plus size={17} />Créer une partie</button></div>
    <div className="admin-stats"><div><CalendarDays /><span><strong>{future.length}</strong>sessions à venir</span></div><div><UsersRound /><span><strong>{profiles.filter(p => p.membership !== 'suspended').length}</strong>personnes dans le cercle</span></div><div><Clock3 /><span><strong>{waitingCount}</strong>{waitingCount > 1 ? 'personnes' : 'personne'} en liste d’attente</span></div></div>
    <div className="session-tabs admin-tabs" role="group" aria-label="Espace organisateur">{([['sessions', 'Les sessions'], ['members', 'Les membres'], ['venues', 'Les lieux']] as const).map(([value, label]) => <button key={value} aria-pressed={tab === value} className={tab === value ? 'selected' : ''} onClick={() => setTab(value)}>{label}</button>)}</div><Feedback result={a.result} />
    {tab === 'sessions' ? <div className="admin-session-list">{listed.length ? listed.map(s => <article className={`admin-session-row ${s.status === 'cancelled' ? 'is-cancelled' : isPast(s) ? 'is-past' : ''}`} key={s.id}><DateTile date={s.starts_at} /><div className="admin-session-name"><Link href={sessionUrl(s.id)}><h2>{sessionName(s)}</h2></Link><p>{s.status === 'cancelled' ? <span className="session-state">Annulée · </span> : isPast(s) ? <span className="session-state">Passée · </span> : null}{s.script} · {time(s.starts_at)} · {s.visibility === 'public' ? 'Ouverte à tous' : 'Membres et invités'}</p></div><span className="badge">{s.confirmed_count}/{s.capacity} inscrits</span><div className="row-actions"><button className="button secondary compact" onClick={() => open(setSelected, s)}><UsersRound size={15} />Participants</button>{s.status === 'published' && !isPast(s) && <><button aria-label={`Modifier ${sessionName(s)}`} className="icon-btn" onClick={() => open(setEditing, s)}><Pencil size={17} /></button><button aria-label={`Annuler ${sessionName(s)}`} className="icon-btn" onClick={() => open(setCancel, s)}><X size={17} /></button></>}{deletable(s) && <button aria-label={`Supprimer ${sessionName(s)}`} title="Supprimer définitivement" className="icon-btn" onClick={() => open(setRemoval, s)}><Trash2 size={17} /></button>}</div></article>) : <div className="empty-state"><CalendarDays /><h2>Crée votre première soirée.</h2><p>Tu choisis la date, le script et les places disponibles.</p></div>}</div>
    : tab === 'venues' ? <Venues venues={venues} sessions={data.sessions} />
    : <div className="panel">{profiles.map(p => <div className="member-row" key={p.id}><Avatar name={p.display_name} color={p.avatar_color} /><div><h3>{p.display_name}</h3><p>{experienceLabels[experienceOf(p)]}{p.can_storytell && ' · volontaire MJ'}{p.bio && ` · ${p.bio}`}</p></div><span className={`badge ${p.membership === 'suspended' ? 'red' : ''}`}>{membershipLabels[p.membership]}</span>{p.membership !== 'organizer' && <button className="button secondary compact" disabled={a.pending} onClick={() => open(setMember, p)}>{p.membership === 'suspended' ? 'Réactiver' : 'Gérer'}</button>}</div>)}</div>}
    <Dialog title={editing === 'new' ? 'Créer une partie' : 'Modifier la partie'} open={editing !== null} onClose={() => setEditing(null)} wide guard>{editing && <SessionForm session={editing === 'new' ? undefined : editing} template={template} address={editing === 'new' ? (template ? addresses[template.id] : undefined) : addresses[editing.id]} venues={venues} onSaved={() => setEditing(null)} />}</Dialog>
    <Dialog title={selected ? sessionName(selected) : 'Participants'} open={!!selected} onClose={() => setSelected(null)} wide><div className="stack">
      {participants.map(b => <div className={`request-row ${b.user_id ? '' : 'is-guest-row'}`} key={b.id}>
        <Avatar name={nameOf(b)} color={b.profile?.avatar_color ?? sponsorOf(b)?.avatar_color} />
        <div><h3 className="participant-name">{!b.user_id && <Link2 size={14} aria-hidden="true" />}{nameOf(b)}{b.profile?.can_storytell && <BookOpen size={15} role="img" aria-label="Volontaire MJ"><title>Volontaire MJ</title></BookOpen>}</h3><p>{bookingLabel(b, sponsorOf(b)?.display_name ?? 'un membre')}</p></div>
        <span className="badge">{statusLabels[b.status]}{queue.has(b.id) && ` · n° ${queue.get(b.id)}`}</span>
        <button className="icon-btn" aria-label={`Retirer ${nameOf(b)}`} disabled={a.pending} onClick={() => open(setRemoving, b)}><X size={16} /></button>
      </div>)}
      {selected && !participants.length && <p className="muted">Pas encore de participation.</p>}
      <Feedback result={a.result} />
    </div></Dialog>
    <Dialog title="Retirer cette participation ?" open={!!removing} onClose={() => setRemoving(null)}><div className="stack"><p>{removing && !removing.user_id ? `${sponsorOf(removing)?.display_name ?? 'La personne qui l’amène'} sera prévenu·e.` : `${removing ? nameOf(removing) : ''} sera prévenu·e.`} Sa place éventuelle revient à la première personne de la liste d’attente.</p><button className="button danger" disabled={a.pending} onClick={() => removing && a.run(() => removeParticipant(removing.id), () => setRemoving(null))}>Retirer la participation</button><Feedback result={a.result} /></div></Dialog>
    <Dialog title="Annuler cette soirée ?" open={!!cancel} onClose={() => setCancel(null)}><div className="stack"><p>La session « {cancel && sessionName(cancel)} » sera annulée et les participants seront prévenus.</p><button className="button danger" disabled={a.pending} onClick={() => cancel && a.run(() => cancelSession(cancel.id), () => setCancel(null))}>Confirmer l’annulation</button><Feedback result={a.result} /></div></Dialog>
    <Dialog title="Supprimer cette partie ?" open={!!removal} onClose={() => setRemoval(null)}><div className="stack"><p>« {removal && sessionName(removal)} », ses inscriptions et son adresse seront effacées définitivement.{removal?.venue_id && ' Son lieu reste dans « Les lieux » tant que tu ne le supprimes pas.'} Les messages déjà prévus, comme une annulation, partiront quand même.</p><div className="button-row"><button className="button secondary" onClick={() => setRemoval(null)}>Garder la partie</button><button className="button danger" disabled={a.pending} onClick={() => removal && a.run(() => deleteSession(removal.id), () => setRemoval(null))}><Trash2 size={16} />Supprimer définitivement</button></div><Feedback result={a.result} /></div></Dialog>
    <Dialog title={`Le compte de ${member?.display_name || ''}`} open={!!member} onClose={() => setMember(null)}>{member && <MemberAccount key={member.id} member={member} pending={a.pending} onChange={status => a.run(() => setMembership(member.id, status), () => setMember(null))} />}<Feedback result={a.result} /></Dialog>
  </>;
}

function MemberAccount({ member, pending, onChange }: { member: Profile; pending: boolean; onChange: (status: Membership) => void }) {
  const suspended = member.membership === 'suspended';
  const [rank, setRank] = useState<Membership>(suspended ? 'member' : member.membership);
  return <div className="stack">
    <form className="stack" onSubmit={e => { e.preventDefault(); onChange(rank); }}>
      <fieldset className="choice-options"><legend>{suspended ? 'Réactiver le compte avec le rang' : 'Son rang'}</legend>{rankChoices.map(c => { const locked = c.value === 'organizer' && member.membership !== 'member'; return <label key={c.value} className="check-field rank-choice"><input type="radio" name="rank" value={c.value} checked={rank === c.value} disabled={locked} onChange={() => setRank(c.value)} /><span><strong>{c.label}{c.value === member.membership && ' · actuel'}</strong><small>{locked ? 'Passe d’abord ce compte membre.' : c.note}</small></span></label>; })}</fieldset>
      {!suspended && <p className="muted">{rank === 'newcomer' && member.membership !== 'newcomer' ? 'Ses places et celles de ses invité·es aux parties réservées aux membres sont retirées ; ses autres inscriptions sont conservées.' : 'Ses inscriptions en cours sont conservées ; le nouveau rang vaut pour les suivantes.'}</p>}
      <button className="button primary" disabled={pending || rank === member.membership}>{suspended ? 'Réactiver le compte' : rank === member.membership ? 'Choisis un autre rang' : `Passer ${rankChoices.find(c => c.value === rank)?.label.toLocaleLowerCase('fr')}`}</button>
    </form>
    {!suspended && <><p className="muted">La suspension bloque les inscriptions et libère les places futures de cette personne et de ses invités.</p><button className="button danger" disabled={pending} onClick={() => onChange('suspended')}>Suspendre le compte</button></>}
  </div>;
}
