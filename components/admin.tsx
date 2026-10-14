'use client';
import { DateTile } from './date-tile';
import { useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Plus, CalendarDays, UsersRound, Clock3, Check, X, Pencil, ShieldCheck, BookOpen, Link2 } from 'lucide-react';
import type { AppData, GameSession, Booking, Profile } from '@/lib/types';
import { time, shortDate, statusLabels, sessionUrl, activeBooking } from '@/lib/utils';
import { bookingLabel, groupRequests, membershipLabels, orderBySponsor, refusalText, requestNote, type RequestGroup } from '@/lib/guests';
import { cancelSession, reviewBooking, reviewRequest, setMembership } from '@/app/actions';
import { Dialog } from './dialog';
import { Avatar } from './ui';
import { Feedback, useAction } from './action-feedback';
const SessionForm = dynamic(() => import('./session-form').then(mod => mod.SessionForm), { loading: () => <p className="muted">Chargement du formulaire…</p> });

export function Admin({ data, bookings, profiles, addresses, initialCreate = false }: { data: AppData; bookings: Booking[]; profiles: Profile[]; addresses: Record<string, string>; initialCreate?: boolean }) {
  const [tab, setTab] = useState<'sessions' | 'requests' | 'members'>('sessions');
  const [editing, setEditing] = useState<GameSession | 'new' | null>(initialCreate ? 'new' : null);
  const [selected, setSelected] = useState<GameSession | null>(null);
  const [cancel, setCancel] = useState<GameSession | null>(null);
  const [member, setMember] = useState<Profile | null>(null);
  const [removing, setRemoving] = useState<Booking | null>(null);
  const [refusing, setRefusing] = useState<RequestGroup | null>(null);
  const a = useAction();
  const future = data.sessions.filter(s => s.status === 'published' && new Date(s.ends_at) > new Date());
  const requests = groupRequests(bookings.filter(b => future.some(s => s.id === b.session_id)), profiles);
  const pendingCount = requests.reduce((count, r) => count + (r.own ? 1 : 0) + r.guests.length, 0);
  const template = [...data.sessions].filter(s => s.status === 'published').sort((x, y) => Date.parse(y.starts_at) - Date.parse(x.starts_at))[0];
  const isPast = (s: GameSession) => new Date(s.ends_at) <= new Date();
  // Upcoming games first in date order, then past and cancelled ones, most recent first.
  const listed = [...data.sessions].sort((x, y) => { const ax = x.status === 'published' && !isPast(x), ay = y.status === 'published' && !isPast(y); if (ax !== ay) return ax ? -1 : 1; return ax ? Date.parse(x.starts_at) - Date.parse(y.starts_at) : Date.parse(y.starts_at) - Date.parse(x.starts_at); });
  const sponsorOf = (b: Booking) => profiles.find(p => p.id === b.sponsor_id);
  const nameOf = (b: Booking) => b.guest_name ?? b.profile?.display_name ?? 'Joueur';
  const review = (b: Booking, approve: boolean) => a.run(() => reviewBooking(b.id, approve));
  const participants = selected ? orderBySponsor(bookings.filter(b => b.session_id === selected.id && !['cancelled', 'declined'].includes(b.status))) : [];
  return <><div className="page-heading admin-heading"><h1>Organiser</h1><button className="button primary compact" onClick={() => setEditing('new')}><Plus size={17} />Créer une partie</button></div>
    <div className="admin-stats"><div><CalendarDays /><span><strong>{future.length}</strong>sessions à venir</span></div><div><UsersRound /><span><strong>{profiles.filter(p => p.membership !== 'suspended').length}</strong>personnes dans le cercle</span></div><div><Clock3 /><span><strong>{pendingCount}</strong>demandes à valider</span></div></div>
    <div className="session-tabs admin-tabs" role="group" aria-label="Espace organisateur">{([['sessions', 'Les sessions'], ['requests', `À valider (${pendingCount})`], ['members', 'Les membres']] as const).map(([value, label]) => <button key={value} aria-pressed={tab === value} className={tab === value ? 'selected' : ''} onClick={() => setTab(value)}>{label}</button>)}</div><Feedback result={a.result} />
    {tab === 'sessions' ? <div className="admin-session-list">{listed.length ? listed.map(s => <article className={`admin-session-row ${s.status === 'cancelled' ? 'is-cancelled' : isPast(s) ? 'is-past' : ''}`} key={s.id}><DateTile date={s.starts_at} /><div className="admin-session-name"><Link href={sessionUrl(s.id)}><h2>{s.title}</h2></Link><p>{s.status === 'cancelled' ? <span className="session-state">Annulée · </span> : isPast(s) ? <span className="session-state">Passée · </span> : null}{s.script} · {time(s.starts_at)} · {s.visibility === 'public' ? 'Ouverte à tous' : 'Membres et invités'}</p></div><span className="badge">{s.confirmed_count}/{s.capacity} inscrits</span><div className="row-actions"><button className="button secondary compact" onClick={() => setSelected(s)}><UsersRound size={15} />Participants</button>{s.status === 'published' && !isPast(s) && <><button aria-label={`Modifier ${s.title}`} className="icon-btn" onClick={() => setEditing(s)}><Pencil size={17} /></button><button aria-label={`Annuler ${s.title}`} className="icon-btn" onClick={() => setCancel(s)}><X size={17} /></button></>}</div></article>) : <div className="empty-state"><CalendarDays /><h2>Crée votre première soirée.</h2><p>Tu choisis la date, le script et les places disponibles.</p></div>}</div>
    : tab === 'requests' ? <div className="panel">{requests.length ? requests.map(r => {
      const session = data.sessions.find(s => s.id === r.sessionId);
      const name = r.person?.display_name ?? 'Voyageur·se';
      const count = (r.own ? 1 : 0) + r.guests.length;
      // Tells apart a sponsor who is already registered from one who only sends friends.
      const attending = bookings.some(b => b.session_id === r.sessionId && b.user_id === r.personId && activeBooking(b.status));
      return <div className="request-row" key={r.key}>
        <Avatar name={name} color={r.person?.avatar_color} />
        <div>
          <h3>{name} <small className="request-role">· {membershipLabels[r.person?.membership ?? 'newcomer']}</small></h3>
          <p>{session ? `${session.title} · ${shortDate(session.starts_at)}` : 'Partie'}</p>
          <small>{requestNote(r, attending)}</small>
          {r.guests.map(g => <div className="request-guest" key={g.id}><span><Link2 size={14} aria-hidden="true" />{g.guest_name} · voyageur·se de {name}</span><button className="icon-btn" disabled={a.pending} aria-label={`Refuser ${g.guest_name}`} onClick={() => setRemoving(g)}><X size={16} /></button></div>)}
        </div>
        <div className="row-actions request-actions">
          <button className="button quiet compact" disabled={a.pending} onClick={() => a.run(() => reviewRequest(r.sessionId, r.personId, true))}><Check size={15} />{count > 1 ? `Accepter les ${count}` : 'Accepter'}</button>
          {r.person?.membership === 'newcomer' && <button className="button secondary compact" disabled={a.pending} onClick={() => a.run(() => reviewRequest(r.sessionId, r.personId, true, true))}>Accepter et passer membre</button>}
          <button className="icon-btn" disabled={a.pending} aria-label={`Refuser la demande de ${name}`} onClick={() => setRefusing(r)}><X size={17} /></button>
        </div>
      </div>;
    }) : <div className="empty-state borderless"><ShieldCheck size={35} /><h2>Tout est à jour.</h2><p>Les demandes des voyageurs et de leurs amis apparaîtront ici.</p></div>}</div>
    : <div className="panel">{profiles.map(p => <div className="member-row" key={p.id}><Avatar name={p.display_name} color={p.avatar_color} /><div><h3>{p.display_name}</h3><p>{p.bio || (p.beginner ? 'Découvre le jeu' : 'Connaît déjà le jeu')}</p></div><span className={`badge ${p.membership === 'suspended' ? 'red' : ''}`}>{membershipLabels[p.membership]}</span>{p.membership !== 'organizer' && <button className="button secondary compact" disabled={a.pending} onClick={() => setMember(p)}>{p.membership === 'suspended' ? 'Réactiver' : 'Gérer'}</button>}</div>)}</div>}
    <Dialog title={editing === 'new' ? 'Créer une partie' : 'Modifier la partie'} open={editing !== null} onClose={() => setEditing(null)} wide>{editing && <SessionForm session={editing === 'new' ? undefined : editing} template={template} address={editing === 'new' ? (template ? addresses[template.id] : undefined) : addresses[editing.id]} onSaved={() => setEditing(null)} />}</Dialog>
    <Dialog title={selected?.title || 'Participants'} open={!!selected} onClose={() => setSelected(null)} wide><div className="stack">
      {participants.map(b => <div className={`request-row ${b.user_id ? '' : 'is-guest-row'}`} key={b.id}>
        <Avatar name={nameOf(b)} color={b.profile?.avatar_color ?? sponsorOf(b)?.avatar_color} />
        <div><h3 className="participant-name">{!b.user_id && <Link2 size={14} aria-hidden="true" />}{nameOf(b)}{b.profile?.can_storytell && <BookOpen size={15} role="img" aria-label="Volontaire MJ"><title>Volontaire MJ</title></BookOpen>}</h3><p>{bookingLabel(b, sponsorOf(b)?.display_name ?? 'un membre')}</p></div>
        <span className="badge">{statusLabels[b.status]}</span>
        {b.status === 'pending' ? <button className="button quiet compact" disabled={a.pending} onClick={() => review(b, true)}>Valider</button> : null}
        <button className="icon-btn" aria-label={`Retirer ${nameOf(b)}`} disabled={a.pending} onClick={() => setRemoving(b)}><X size={16} /></button>
      </div>)}
      {selected && !participants.length && <p className="muted">Pas encore de participation.</p>}
      <Feedback result={a.result} />
    </div></Dialog>
    <Dialog title="Retirer cette participation ?" open={!!removing} onClose={() => setRemoving(null)}><div className="stack"><p>{removing && !removing.user_id ? `${sponsorOf(removing)?.display_name ?? 'La personne qui l’amène'} sera prévenu·e.` : `${removing ? nameOf(removing) : ''} sera prévenu·e.`} Une éventuelle place libérée sera proposée à la liste d’attente.</p><button className="button danger" disabled={a.pending} onClick={() => removing && a.run(() => reviewBooking(removing.id, false), () => setRemoving(null))}>Retirer la participation</button><Feedback result={a.result} /></div></Dialog>
    <Dialog title="Refuser cette demande ?" open={!!refusing} onClose={() => setRefusing(null)}><div className="stack"><p>{refusing && refusalText(refusing)}</p><button className="button danger" disabled={a.pending} onClick={() => refusing && a.run(() => reviewRequest(refusing.sessionId, refusing.personId, false), () => setRefusing(null))}>Refuser la demande</button><Feedback result={a.result} /></div></Dialog>
    <Dialog title="Annuler cette soirée ?" open={!!cancel} onClose={() => setCancel(null)}><div className="stack"><p>La session « {cancel?.title} » sera annulée et les participants seront prévenus.</p><button className="button danger" disabled={a.pending} onClick={() => cancel && a.run(() => cancelSession(cancel.id), () => setCancel(null))}>Confirmer l’annulation</button><Feedback result={a.result} /></div></Dialog>
    <Dialog title={`Le compte de ${member?.display_name || ''}`} open={!!member} onClose={() => setMember(null)}><div className="stack"><p>{member?.membership === 'suspended' ? 'Réactiver ce compte lui permettra de participer à nouveau.' : 'La suspension bloque les inscriptions et libère les places futures de cette personne et de ses invités.'}</p><button className={`button ${member?.membership === 'suspended' ? 'primary' : 'danger'}`} disabled={a.pending} onClick={() => member && a.run(() => setMembership(member.id, member.membership === 'suspended' ? 'member' : 'suspended'), () => setMember(null))}>{member?.membership === 'suspended' ? 'Réactiver le compte' : 'Suspendre le compte'}</button>{member?.membership === 'newcomer' && <button className="button secondary" disabled={a.pending} onClick={() => a.run(() => setMembership(member.id, 'member'), () => setMember(null))}>Passer membre</button>}<Feedback result={a.result} /></div></Dialog>
  </>;
}
