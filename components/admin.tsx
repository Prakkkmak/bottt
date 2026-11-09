'use client';
import { DateTile } from './date-tile';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Plus, CalendarDays, UsersRound, Clock3, X, Pencil, BookOpen, Link2, Trash2, Repeat, Mail, Send, Play } from 'lucide-react';
import type { ActionResult, AppData, GameSession, Booking, Membership, Profile, Series, Venue } from '@/lib/types';
import { time, statusLabels, sessionUrl, activeBooking, sessionName, dateLong } from '@/lib/utils';
import { seriesSummary } from '@/lib/series';
import { bookingLabel, experienceLabels, experienceOf, membershipLabels, messageRecipients, orderBySponsor, waitlistPositions } from '@/lib/guests';
import { cancelSession, deleteSeries, deleteSession, removeParticipant, sendSessionMessage, setMembership, stopSeries } from '@/app/actions';
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

export function Admin({ data, bookings, profiles, addresses, venues, series = [], initialCreate = false }: { data: AppData; bookings: Booking[]; profiles: Profile[]; addresses: Record<string, string>; venues: Venue[]; series?: Series[]; initialCreate?: boolean }) {
  const [tab, setTab] = useState<'sessions' | 'members' | 'venues'>('sessions');
  const [editing, setEditing] = useState<GameSession | 'new' | null>(initialCreate ? 'new' : null);
  const [selected, setSelected] = useState<GameSession | null>(null);
  const [cancel, setCancel] = useState<GameSession | null>(null);
  const [removal, setRemoval] = useState<GameSession | null>(null);
  const [member, setMember] = useState<Profile | null>(null);
  const [removing, setRemoving] = useState<Booking | null>(null);
  const [stopping, setStopping] = useState<Series | null>(null);
  const [changing, setChanging] = useState<Series | null>(null);
  const [forgetting, setForgetting] = useState<Series | null>(null);
  const [writing, setWriting] = useState<GameSession | null>(null);
  // Counts the answers given once their dialog has closed (a message sent, a series changed): the answer, at the top of the page,
  // comes into view, so that nobody sends twice and the dates a series removed or kept are read.
  const [sent, setSent] = useState(0);
  const feedbackRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (sent) feedbackRef.current?.scrollIntoView({ block: 'nearest' }); }, [sent]);
  const a = useAction();
  const announce = (result: ActionResult) => { a.setResult(result); setSent(n => n + 1); };
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
  // The first game still to come, or under way, stands out from the dates of a series that all look alike.
  const nextGame = listed.find(s => s.status === 'published' && !isPast(s));
  // Stopped series last: they open nothing until resumed.
  const seriesListed = [...series].sort((x, y) => Number(!!x.stopped_at) - Number(!!y.stopped_at));
  const booked = (s: GameSession) => s.confirmed_count > 0 || bookings.some(b => b.session_id === s.id && activeBooking(b.status));
  // Counted like stop_series: the upcoming dates it removes, the ones with someone registered that it leaves.
  const datesOf = (r: Series) => data.sessions.filter(s => s.series_id === r.id && new Date(s.starts_at) > new Date());
  const stopPlan = stopping ? { removed: datesOf(stopping).filter(s => !booked(s)).length, kept: datesOf(stopping).filter(s => s.status === 'published' && booked(s)).length } : null;
  const sponsorOf = (b: Booking) => profiles.find(p => p.id === b.sponsor_id);
  const nameOf = (b: Booking) => b.guest_name ?? b.profile?.display_name ?? 'Joueur';
  const participants = selected ? orderBySponsor(bookings.filter(b => b.session_id === selected.id && !['cancelled', 'declined'].includes(b.status))) : [];
  const queue = waitlistPositions(participants);
  // A message reaches the people registered for a game that has not started yet, the writer aside (see send_session_message).
  const recipientsOf = (s: GameSession) => messageRecipients(bookings, s.id, data.profile?.id);
  const writable = (s: GameSession) => { if (s.status !== 'published' || new Date(s.starts_at) <= new Date()) return false; const r = recipientsOf(s); return r.registered + r.waiting > 0; };
  return <><div className="page-heading admin-heading"><h1>Organiser</h1><button className="button primary compact" onClick={() => setEditing('new')}><Plus size={17} />Créer une partie</button></div>
    <div className="admin-stats"><div><CalendarDays /><span><strong>{future.length}</strong>sessions à venir</span></div><div><UsersRound /><span><strong>{profiles.filter(p => p.membership !== 'suspended').length}</strong>personnes dans le cercle</span></div><div><Clock3 /><span><strong>{waitingCount}</strong>{waitingCount > 1 ? 'personnes' : 'personne'} en liste d’attente</span></div></div>
    <div className="session-tabs admin-tabs" role="group" aria-label="Espace organisateur">{([['sessions', 'Les sessions'], ['members', 'Les membres'], ['venues', 'Les lieux']] as const).map(([value, label]) => <button key={value} aria-pressed={tab === value} className={tab === value ? 'selected' : ''} onClick={() => setTab(value)}>{label}</button>)}</div><div ref={feedbackRef}><Feedback result={a.result} /></div>
    {tab === 'sessions' ? <>{series.length > 0 && <div className="panel venue-panel series-panel">
      <div className="panel-heading"><h2><Repeat size={20} />Parties récurrentes</h2></div>
      <p className="muted">Chaque série ouvre ses prochaines dates d’elle-même. « Modifier » change toutes ses dates à venir ; une date se modifie ou s’annule aussi seule dans la liste ci-dessous. Une série arrêtée reste ici pour reprendre plus tard.</p>
      {seriesListed.map(r => { const upcoming = datesOf(r).filter(s => s.status === 'published').sort((x, y) => Date.parse(x.starts_at) - Date.parse(y.starts_at)); const next = upcoming[0]; return <div className={`member-row venue-row ${r.stopped_at ? 'is-stopped' : ''}`} key={r.id}>
        <span className="venue-icon" aria-hidden="true"><Repeat size={18} /></span>
        <div><h3>{sessionName(r)}</h3><p>{seriesSummary(r)} · {venues.find(v => v.id === r.venue_id)?.name ?? r.location}</p>{next && <p>Prochaine date : {dateLong(next.starts_at)} à {time(next.starts_at)}</p>}</div>
        <span className={`badge ${r.stopped_at ? 'red' : ''}`}>{r.stopped_at ? 'Arrêtée' : upcoming.length ? `${upcoming.length} date${upcoming.length > 1 ? 's' : ''} à venir` : 'Aucune date à venir'}</span>
        <div className="row-actions">{r.stopped_at ? <>
          <button className="button secondary compact" aria-label={`Reprendre la série ${sessionName(r)}`} onClick={() => open(setChanging, r)}><Play size={15} />Reprendre</button>
          <button className="icon-btn" aria-label={`Supprimer la série ${sessionName(r)}`} title="Retirer de la liste" onClick={() => open(setForgetting, r)}><Trash2 size={17} /></button>
        </> : <>
          <button className="button secondary compact" aria-label={`Modifier la série ${sessionName(r)}`} onClick={() => open(setChanging, r)}><Pencil size={15} />Modifier</button>
          <button className="button secondary compact" disabled={a.pending} aria-label={`Arrêter la série ${sessionName(r)}`} onClick={() => open(setStopping, r)}>Arrêter</button>
        </>}</div>
      </div>; })}
    </div>}<div className="admin-session-list">{listed.length ? listed.map(s => <article className={`admin-session-row ${s.status === 'cancelled' ? 'is-cancelled' : isPast(s) ? 'is-past' : s === nextGame ? 'is-next' : ''}`} key={s.id}><DateTile date={s.starts_at} /><div className="admin-session-name"><Link href={sessionUrl(s.id)}><h2>{sessionName(s)}</h2></Link><p>{s.status === 'cancelled' ? <span className="session-state">Annulée · </span> : isPast(s) ? <span className="session-state">Passée · </span> : s === nextGame ? <span className="session-state">{new Date(s.starts_at) <= new Date() ? 'En cours · ' : 'Prochaine partie · '}</span> : null}{s.script && `${s.script} · `}{time(s.starts_at)} · {s.visibility === 'public' ? 'Ouverte à tous' : 'Membres et invités'}{s.series_id && ' · Série'}</p></div><span className="badge">{s.confirmed_count}/{s.capacity} inscrits</span><div className="row-actions"><button className="button secondary compact" onClick={() => open(setSelected, s)}><UsersRound size={15} />Participants</button>{writable(s) && <button aria-label={`Écrire aux inscrits de ${sessionName(s)}`} title="Écrire aux inscrits" className="icon-btn" onClick={() => open(setWriting, s)}><Mail size={17} /></button>}{s.status === 'published' && <button aria-label={`Modifier ${sessionName(s)}`} className="icon-btn" onClick={() => open(setEditing, s)}><Pencil size={17} /></button>}{s.status === 'published' && !isPast(s) && <button aria-label={`Annuler ${sessionName(s)}`} className="icon-btn" onClick={() => open(setCancel, s)}><X size={17} /></button>}{deletable(s) && <button aria-label={`Supprimer ${sessionName(s)}`} title="Supprimer définitivement" className="icon-btn" onClick={() => open(setRemoval, s)}><Trash2 size={17} /></button>}</div></article>) : <div className="empty-state"><CalendarDays /><h2>Crée votre première soirée.</h2><p>Tu choisis la date, le script et les places disponibles.</p></div>}</div></>
    : tab === 'venues' ? <Venues venues={venues} sessions={data.sessions} />
    : <div className="panel">{profiles.map(p => <div className="member-row" key={p.id}><Avatar name={p.display_name} color={p.avatar_color} /><div><h3>{p.display_name}</h3><p>{experienceLabels[experienceOf(p)]}{p.can_storytell && ' · volontaire MJ'}{p.bio && ` · ${p.bio}`}</p></div><span className={`badge ${p.membership === 'suspended' ? 'red' : ''}`}>{membershipLabels[p.membership]}</span>{p.membership !== 'organizer' && <button className="button secondary compact" disabled={a.pending} onClick={() => open(setMember, p)}>{p.membership === 'suspended' ? 'Réactiver' : 'Gérer'}</button>}</div>)}</div>}
    <Dialog title={editing === 'new' ? 'Créer une partie' : 'Modifier la partie'} open={editing !== null} onClose={() => setEditing(null)} wide guard>{editing && <SessionForm session={editing === 'new' ? undefined : editing} template={template} address={editing === 'new' ? (template ? addresses[template.id] : undefined) : addresses[editing.id]} venues={venues} recipients={editing === 'new' ? 0 : (r => r.registered + r.waiting)(recipientsOf(editing))} onSaved={() => setEditing(null)} />}</Dialog>
    <Dialog title={changing?.stopped_at ? 'Reprendre la série' : 'Modifier la série'} open={!!changing} onClose={() => setChanging(null)} wide guard>{changing && <SessionForm key={changing.id} series={changing} address={changing.address} venues={venues} onSaved={result => { setChanging(null); announce(result); }} />}</Dialog>
    <Dialog title={selected ? sessionName(selected) : 'Participants'} open={!!selected} onClose={() => setSelected(null)} wide><div className="stack">
      {participants.map(b => <div className={`request-row ${b.user_id ? '' : 'is-guest-row'}`} key={b.id}>
        <Avatar name={nameOf(b)} color={b.profile?.avatar_color ?? sponsorOf(b)?.avatar_color} />
        <div><h3 className="participant-name">{!b.user_id && <Link2 size={14} aria-hidden="true" />}{nameOf(b)}{b.profile?.can_storytell && <BookOpen size={15} role="img" aria-label="Volontaire MJ"><title>Volontaire MJ</title></BookOpen>}</h3><p>{bookingLabel(b, sponsorOf(b)?.display_name ?? 'un membre')}</p></div>
        <span className="badge">{statusLabels[b.status]}{queue.has(b.id) && ` · n° ${queue.get(b.id)}`}</span>
        <button className="icon-btn" aria-label={`Retirer ${nameOf(b)}`} disabled={a.pending} onClick={() => open(setRemoving, b)}><X size={16} /></button>
      </div>)}
      {selected && !participants.length && <p className="muted">Pas encore de participation.</p>}
      {selected && writable(selected) && <button className="button secondary" onClick={() => { open(setWriting, selected); setSelected(null); }}><Mail size={16} />Écrire aux inscrits</button>}
      <Feedback result={a.result} />
    </div></Dialog>
    <Dialog title="Retirer cette participation ?" open={!!removing} onClose={() => setRemoving(null)}><div className="stack"><p>{removing && !removing.user_id ? `${sponsorOf(removing)?.display_name ?? 'La personne qui l’amène'} sera prévenu·e.` : `${removing ? nameOf(removing) : ''} sera prévenu·e.`} Sa place éventuelle revient à la première personne de la liste d’attente.</p><button className="button danger" disabled={a.pending} onClick={() => removing && a.run(() => removeParticipant(removing.id), () => setRemoving(null))}>Retirer la participation</button><Feedback result={a.result} /></div></Dialog>
    <Dialog title="Annuler cette soirée ?" open={!!cancel} onClose={() => setCancel(null)}><div className="stack"><p>La session « {cancel && sessionName(cancel)} » sera annulée et les participants seront prévenus.</p><button className="button danger" disabled={a.pending} onClick={() => cancel && a.run(() => cancelSession(cancel.id), () => setCancel(null))}>Confirmer l’annulation</button><Feedback result={a.result} /></div></Dialog>
    <Dialog title="Supprimer cette partie ?" open={!!removal} onClose={() => setRemoval(null)}><div className="stack"><p>« {removal && sessionName(removal)} », ses inscriptions et son adresse seront effacées définitivement.{removal?.venue_id && ' Son lieu reste dans « Les lieux » tant que tu ne le supprimes pas.'} Les messages déjà prévus, comme une annulation, partiront quand même.</p><div className="button-row"><button className="button secondary" onClick={() => setRemoval(null)}>Garder la partie</button><button className="button danger" disabled={a.pending} onClick={() => removal && a.run(() => deleteSession(removal.id), () => setRemoval(null))}><Trash2 size={16} />Supprimer définitivement</button></div><Feedback result={a.result} /></div></Dialog>
    <Dialog title="Arrêter cette série ?" open={!!stopping} onClose={() => setStopping(null)}><div className="stack">
      <p>« {stopping && sessionName(stopping)} » n’ouvrira plus de nouvelle date.{stopPlan && stopPlan.removed > 0 && (stopPlan.removed > 1 ? ` Ses ${stopPlan.removed} dates à venir sans inscrit seront retirées.` : ' Sa date à venir sans inscrit sera retirée.')}{stopPlan && stopPlan.kept > 0 && (stopPlan.kept > 1 ? ` Ses ${stopPlan.kept} parties avec des inscrits restent prévues : tu pourras les annuler une par une pour prévenir chacun.` : ' Sa partie avec des inscrits reste prévue : tu pourras l’annuler pour prévenir chacun.')} Elle reste dans la liste : tu pourras la reprendre plus tard.</p>
      <div className="button-row"><button className="button secondary" onClick={() => setStopping(null)}>Garder la série</button><button className="button danger" disabled={a.pending} onClick={() => stopping && a.run(() => stopSeries(stopping.id), () => setStopping(null))}>Arrêter la série</button></div><Feedback result={a.result} />
    </div></Dialog>
    <Dialog title="Supprimer cette série ?" open={!!forgetting} onClose={() => setForgetting(null)}><div className="stack">
      <p>« {forgetting && sessionName(forgetting)} » quitte la liste des parties récurrentes et ne pourra plus reprendre. Ses parties déjà prévues restent, chacune seule.</p>
      <div className="button-row"><button className="button secondary" onClick={() => setForgetting(null)}>Garder la série</button><button className="button danger" disabled={a.pending} onClick={() => forgetting && a.run(() => deleteSeries(forgetting.id), () => setForgetting(null))}><Trash2 size={16} />Supprimer la série</button></div><Feedback result={a.result} />
    </div></Dialog>
    <Dialog title="Écrire aux inscrits" open={!!writing} onClose={() => setWriting(null)} guard>{writing && <MessageForm key={writing.id} session={writing} recipients={recipientsOf(writing)} onSent={result => { setWriting(null); announce(result); }} />}</Dialog>
    <Dialog title={`Le compte de ${member?.display_name || ''}`} open={!!member} onClose={() => setMember(null)}>{member && <MemberAccount key={member.id} member={member} pending={a.pending} onChange={status => a.run(() => setMembership(member.id, status), () => setMember(null))} />}<Feedback result={a.result} /></Dialog>
  </>;
}

/** The organizer's message to the people registered for a game, sent by e-mail with the game's name, date and place. */
function MessageForm({ session, recipients, onSent }: { session: GameSession; recipients: { registered: number; waiting: number }; onSent: (result: ActionResult) => void }) {
  const a = useAction();
  const [waitlist, setWaitlist] = useState(true);
  const count = recipients.registered + (waitlist ? recipients.waiting : 0);
  const people = (n: number) => `${n} personne${n > 1 ? 's' : ''}`;
  return <form className="stack" onSubmit={e => {
    e.preventDefault();
    const message = String(new FormData(e.currentTarget).get('message') ?? '');
    a.run(() => sendSessionMessage(session.id, message, waitlist), onSent);
  }}>
    <p className="muted">Pour « {sessionName(session)} ». Chaque personne le reçoit par e-mail, avec le nom de la partie, sa date et son lieu. Les personnes qui amènent des invité·es le reçoivent pour eux. Tu n’en reçois pas de copie.</p>
    <label className="field">Ton message<span className="field-note">La liste d’attente et les voyageur·ses n’ont pas toujours l’adresse exacte : n’y mets ni l’adresse ni un code d’accès.</span><textarea name="message" rows={6} required minLength={2} maxLength={2000} placeholder="Ce qu’il faut apporter, l’heure d’accueil, un mot pour les débutant·es…" data-autofocus /></label>
    {recipients.waiting > 0 && <label className="check-field"><input type="checkbox" name="waitlist" checked={waitlist} onChange={e => setWaitlist(e.target.checked)} /><span>Aussi {recipients.waiting > 1 ? `les ${people(recipients.waiting)}` : 'la personne'} en liste d’attente</span></label>}
    <Feedback result={a.result} />
    <button className="button primary full" disabled={a.pending || count === 0}><Send size={16} />{a.pending ? 'Envoi…' : count ? `Envoyer à ${people(count)}` : 'Personne à prévenir'}</button>
  </form>;
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
