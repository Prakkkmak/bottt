'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CalendarDays, Clock3, MapPin, ChevronLeft, LockKeyhole, BookOpen } from 'lucide-react';
import type { ActionResult, AppData, GameSession, MyGuest } from '@/lib/types';
import { dateLong, time, activeBooking } from '@/lib/utils';
import { mapsUrl } from '@/lib/locations';
import { activeGuests, canSeeAddress, participantLabel, recentGuestNames, seatPlan, waitlistHint } from '@/lib/guests';
import { MAX_TRAVELLER_GUESTS, MAX_WAITING_GUESTS } from '@/lib/session-rules';
import { CalendarLink } from './calendar-link';
import { Dialog } from './dialog';
import { AuthForm } from './auth';
import { VillageCircle } from './tableau';
import { GuestForm } from './guest-dialog';
import { SessionGuests } from './session-guests';
import { useAction, Feedback } from './action-feedback';
import { bookSession, cancelBooking, acceptOffer, removeGuest, acceptGuestOffer } from '@/app/actions';
import { Avatar } from './ui';

export function SessionDetail({ data, session: s, address, embedded = false }: { data: AppData; session: GameSession; address: string | null; embedded?: boolean }) {
  const a = useAction();
  const router = useRouter();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [releasedGuests, setReleasedGuests] = useState<string[]>([]);
  const [authRequest, setAuthRequest] = useState<{ seat?: number } | null>(null);
  const [guestRequest, setGuestRequest] = useState<{ seat?: number } | null>(null);
  const [removing, setRemoving] = useState<MyGuest | null>(null);
  const plan = seatPlan(s, data.profile);
  const traveller = data.profile?.membership === 'newcomer';
  const guests = activeGuests(s);
  const active = activeBooking(s.my_status);
  const closed = s.status === 'cancelled' || new Date(s.starts_at).getTime() <= Date.now() + 30 * 60000;
  const offered = s.my_status === 'offered';
  const liveOffer = offered && s.my_seat != null && !!s.my_offer_expires_at && new Date(s.my_offer_expires_at).getTime() > Date.now();
  const openCancel = () => { a.setResult(null); setReleasedGuests(guests.map(g => g.id)); setCancelOpen(true); };
  const openGuest = (seat?: number) => { a.setResult(null); setGuestRequest({ seat }); };
  const reserve = (seat?: number) => a.run(async () => {
    const result = await bookSession(s.id, seat);
    if (!result.ok) router.refresh();
    return result;
  });
  const choose = (seat?: number) => {
    if (!data.profile) return setAuthRequest({ seat });
    if (plan.onFreeSeat === 'guest') return openGuest(seat);
    reserve(seat);
  };
  const ownGuest = (guest: MyGuest) => {
    if (guest.status === 'offered') return a.run(() => acceptGuestOffer(guest.id));
    a.setResult(null);
    setRemoving(guest);
  };
  const guestAdded = (result: ActionResult) => { setGuestRequest(null); a.setResult(result); };
  const heading = s.status === 'cancelled' ? 'Partie annulée' : s.my_status === 'confirmed' ? 'Tu es inscrit·e.' : closed ? 'Inscriptions closes' : offered ? liveOffer ? 'Une place pour toi.' : 'Proposition expirée.' : s.my_status === 'pending' ? 'Demande envoyée.' : s.my_status === 'waitlisted' ? 'Tu es en attente.' : s.my_status === 'declined' ? 'Participation non retenue' : 'Inscris-toi';
  const hint = s.status === 'cancelled' ? 'On se retrouve à une prochaine soirée.' : s.my_status === 'confirmed' ? '' : closed ? 'Rendez-vous à la prochaine partie.' : offered ? liveOffer ? 'Clique sur ton jeton pour confirmer.' : 'Retire ta demande pour rejoindre à nouveau la liste d’attente.' : s.my_status === 'pending' ? 'Un organisateur va valider ta demande.' : s.my_status === 'waitlisted' ? 'On te prévient par e-mail dès qu’une place se libère.' : s.my_status === 'declined' ? 'Contacte un organisateur pour en discuter.' : plan.waitlist === 'self' ? waitlistHint(s, traveller) : data.profile ? 'Clique sur un + pour choisir ta place.' : 'Clique sur un + pour choisir ta place. Il te faudra juste ton e-mail.';
  const guestHint = plan.limitReached ? traveller ? `Tu amènes déjà ${MAX_TRAVELLER_GUESTS} personnes, le maximum pour un·e voyageur·se.` : `La partie est complète et ${MAX_WAITING_GUESTS} de tes invité·es attendent déjà une place.` : plan.onFreeSeat === 'guest' ? traveller ? 'Clique sur un + libre pour demander une place pour un·e ami·e.' : 'Clique sur un + libre pour placer quelqu’un.' : plan.waitlist === 'guest' ? waitlistHint(s, traveller) : '';
  const showGuests = !!data.profile && s.status !== 'cancelled' && (active || (s.my_guests ?? []).some(g => g.status !== 'cancelled'));
  const privateAddress = canSeeAddress(s, data.profile) ? address : null;
  const practical = <div className={`detail-when ${embedded ? 'session-practical' : ''}`}>
    {s.status === 'published' ? <CalendarLink session={s} address={privateAddress} /> : <span><CalendarDays size={16} />{dateLong(s.starts_at)}</span>}
    <span><Clock3 size={16} />{time(s.starts_at)}</span><a className="practical-link" href={mapsUrl(privateAddress || s.location)} target="_blank" rel="noopener noreferrer" title="Ouvrir le lieu dans Maps"><MapPin size={16} />{s.location}</a>
  </div>;
  return <>
    {!embedded && <Link className="back-link" href="/"><ChevronLeft size={16} />Les parties</Link>}
    {!embedded && <div className="detail-heading">
      <h1>{s.title}</h1>
      <div className="detail-badges"><span className="script-tag">{s.script}</span>{s.visibility === 'members' && <span className="badge"><LockKeyhole size={14} />Membres et invités</span>}</div>
      {practical}
    </div>}
    {embedded && practical}
    <section className="session-table" aria-label={`Inscriptions pour ${s.title}`}>
      {(s.my_status !== 'confirmed' || s.status === 'cancelled') && <div className="session-table-status">
        <p className="session-status-title" aria-live="polite">{heading}</p>
        {hint && <p className="table-hint">{hint}</p>}
        {plan.waitlist === 'self' && <button className="button parchment" disabled={a.pending} onClick={() => choose()}>Rejoindre la liste d’attente</button>}
        {liveOffer && !closed && <p className="table-note">À confirmer avant le {s.my_offer_expires_at ? `${dateLong(s.my_offer_expires_at)} à ${time(s.my_offer_expires_at)}` : 'délai indiqué'}.</p>}
        {(active || plan.canBringOther) && s.status !== 'cancelled' && <div className="table-actions">
          {plan.canBringOther && <button className="text-link" disabled={a.pending} onClick={() => openGuest()}>Inscrire quelqu’un d’autre</button>}
          {active && <button className="text-link" disabled={a.pending} onClick={openCancel}>Retirer ma demande</button>}
        </div>}
      </div>}
      <div className="session-table-board">
        <VillageCircle reserved={s.confirmed_count} capacity={s.capacity} occupiedSeats={s.occupied_seats} participants={s.participants} mySeat={s.my_seat} interactive busy={a.pending}
          onChoose={plan.onFreeSeat ? choose : undefined}
          chooseLabel={plan.onFreeSeat === 'guest' ? 'Placer quelqu’un à la place' : 'Prendre la place'}
          onOwnSeat={s.status === 'cancelled' ? undefined : liveOffer && !closed ? () => a.run(() => acceptOffer(s.id)) : s.my_status === 'confirmed' ? openCancel : undefined}
          ownSeatLabel={offered ? 'Confirmer ma place' : 'Ta place · me désister'}
          ownGuests={s.my_guests} onOwnGuest={s.status === 'cancelled' ? undefined : ownGuest} />
        {showGuests && <SessionGuests session={s} limit={traveller ? MAX_TRAVELLER_GUESTS : undefined} hint={guestHint} busy={a.pending}
          onAdd={active && (plan.onFreeSeat === 'guest' || plan.waitlist === 'guest') ? () => openGuest() : undefined}
          onRemove={g => { a.setResult(null); setRemoving(g); }} onConfirm={g => a.run(() => acceptGuestOffer(g.id))} />}
        {s.participants.length > 0 && <ul className="circle-roster" aria-label="Participants confirmés">{[...s.participants].sort((x, y) => (x.seat_index ?? 0) - (y.seat_index ?? 0)).map((p, index) => {
          const mine = p.seat_index != null && guests.some(g => g.seat_index === p.seat_index);
          return <li key={p.seat_index ?? index}><Avatar name={p.display_name} color={p.avatar_color} small /><span>{p.display_name}{s.my_seat != null && p.seat_index === s.my_seat && <small> · toi</small>}<small className="roster-role">{participantLabel(p, { mine })}</small></span>{p.can_storytell && <BookOpen size={15} role="img" aria-label="Volontaire MJ"><title>Volontaire MJ</title></BookOpen>}</li>;
        })}</ul>}
      </div>
      <Feedback result={a.result} />
    </section>
    <Dialog open={authRequest !== null} onClose={() => setAuthRequest(null)} title="Rejoins le cercle"><AuthForm configured={data.configured} onSuccess={() => { const seat = authRequest?.seat; setAuthRequest(null); reserve(seat); }} /></Dialog>
    <Dialog open={guestRequest !== null} onClose={() => setGuestRequest(null)} title={active ? traveller ? 'Qui vient avec toi ?' : 'Qui t’accompagne ?' : 'Qui inscris-tu ?'}>
      {guestRequest && <GuestForm sessionId={s.id} seat={guestRequest.seat} traveller={traveller} waitlist={!traveller && (s.member_seats_free ?? Math.max(0, s.capacity - s.confirmed_count)) === 0} suggestions={recentGuestNames(data.sessions, s)} onDone={guestAdded} />}
    </Dialog>
    <Dialog open={removing !== null} onClose={() => setRemoving(null)} title={`Retirer ${removing?.name ?? ''} ?`}><div className="stack"><p>Sa place sera proposée à quelqu’un d’autre.</p><div className="button-row"><button className="button secondary" onClick={() => setRemoving(null)}>Garder sa place</button><button className="button danger" disabled={a.pending} onClick={() => removing && a.run(() => removeGuest(removing.id), () => setRemoving(null))}>Retirer {removing?.name}</button></div><Feedback result={a.result} /></div></Dialog>
    <Dialog open={cancelOpen} onClose={() => setCancelOpen(false)} title="Libérer ta place ?"><div className="stack">
      <p>Elle sera proposée à quelqu’un d’autre. Tu pourras te réinscrire s’il reste de la place.</p>
      {guests.length > 0 && <fieldset className="guest-release"><legend>Les personnes que tu amènes</legend>{guests.map(g => <label key={g.id} className="check-field"><input type="checkbox" checked={releasedGuests.includes(g.id)} onChange={e => setReleasedGuests(ids => e.target.checked ? [...ids, g.id] : ids.filter(id => id !== g.id))} /><span>Libérer aussi la place de {g.name}</span></label>)}</fieldset>}
      <div className="button-row"><button className="button secondary" onClick={() => setCancelOpen(false)}>Garder ma place</button><button className="button danger" disabled={a.pending} onClick={() => a.run(() => cancelBooking(s.id, releasedGuests), () => setCancelOpen(false))}>Confirmer mon désistement</button></div>
      <Feedback result={a.result} />
    </div></Dialog>
  </>;
}
