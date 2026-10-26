'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { CalendarDays, Clock3, MapPin, ChevronLeft, LockKeyhole, BookOpen } from 'lucide-react';
import type { ActionResult, AppData, GameSession, MyGuest } from '@/lib/types';
import { dateLong, time, activeBooking, sessionName } from '@/lib/utils';
import { mapsUrl } from '@/lib/locations';
import { activeGuests, canSeeAddress, hasSeat, participantLabel, recentGuestNames, seatPlan, waitingLabel, waitlistHint } from '@/lib/guests';
import { MAX_TRAVELLER_GUESTS, MAX_WAITING_GUESTS, TRAVELLER_ADDRESS_HOURS } from '@/lib/session-rules';
import { CalendarLink } from './calendar-link';
import { Dialog } from './dialog';
import { AuthForm } from './auth';
import { VillageCircle } from './tableau';
import { GuestForm } from './guest-dialog';
import { SessionGuests } from './session-guests';
import { useAction, Feedback } from './action-feedback';
import { bookSession, cancelBooking, removeGuest } from '@/app/actions';
import { Avatar, Spinner } from './ui';

export function SessionDetail({ data, session: s, address, embedded = false }: { data: AppData; session: GameSession; address: string | null; embedded?: boolean }) {
  const a = useAction();
  const router = useRouter();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [releasedGuests, setReleasedGuests] = useState<string[]>([]);
  const [authRequest, setAuthRequest] = useState<{ seat?: number } | null>(null);
  const [guestRequest, setGuestRequest] = useState<{ seat?: number } | null>(null);
  const [removing, setRemoving] = useState<MyGuest | null>(null);
  // What the running request is about (a seat number, the waitlist, a guest id), so only that control shows it is working.
  const [target, setTarget] = useState<number | string | null>(null);
  // The answer about a guest shows in the guests block, by the button and the list; the others under the circle.
  const [feedbackSpot, setFeedbackSpot] = useState<'guests' | 'table'>('table');
  // Counts the guest changes that succeeded: started from the circle further down, the block above comes back into view.
  const [guestChanges, setGuestChanges] = useState(0);
  const guestsRef = useRef<HTMLElement>(null);
  useEffect(() => { if (guestChanges) guestsRef.current?.scrollIntoView({ block: 'nearest' }); }, [guestChanges]);
  const busyOn = a.pending ? target : null;
  const act = (on: number | string, action: () => Promise<ActionResult>, after?: (result: ActionResult) => void, spot: 'guests' | 'table' = 'table') => {
    setTarget(on); setFeedbackSpot(spot);
    a.run(action, spot === 'guests' ? result => { after?.(result); setGuestChanges(n => n + 1); } : after);
  };
  const plan = seatPlan(s, data.profile);
  const traveller = data.profile?.membership === 'newcomer';
  const guests = activeGuests(s);
  const active = activeBooking(s.my_status);
  const closed = s.status === 'cancelled' || new Date(s.starts_at).getTime() <= Date.now() + 30 * 60000;
  const waiting = s.my_status === 'waitlisted';
  // Within the last 30 minutes, a freed seat goes to nobody.
  const lastMinute = closed && s.status !== 'cancelled';
  // Leaving the queue keeps the people one brings unless chosen; giving up a seat releases them too by default.
  const openCancel = () => { a.setResult(null); setReleasedGuests(waiting ? [] : guests.map(g => g.id)); setCancelOpen(true); };
  const openGuest = (seat?: number) => { a.setResult(null); setGuestRequest({ seat }); };
  const reserve = (seat?: number) => act(seat ?? 'waitlist', async () => {
    const result = await bookSession(s.id, seat);
    if (!result.ok) router.refresh();
    return result;
  });
  const choose = (seat?: number) => {
    if (!data.profile) return setAuthRequest({ seat });
    if (plan.onFreeSeat === 'guest') return openGuest(seat);
    reserve(seat);
  };
  const ownGuest = (guest: MyGuest) => { a.setResult(null); setRemoving(guest); };
  const guestAdded = (result: ActionResult) => { setGuestRequest(null); setFeedbackSpot('guests'); a.setResult(result); setGuestChanges(n => n + 1); };
  const heading = s.status === 'cancelled' ? 'Partie annulée' : s.my_status === 'confirmed' ? 'Tu es inscrit·e.' : closed ? 'Inscriptions closes' : waiting ? `Tu es ${waitingLabel(s.my_waitlist_position)}.` : s.my_status === 'declined' ? 'Participation non retenue' : 'Inscris-toi';
  const hint = s.status === 'cancelled' ? 'On se retrouve à une prochaine soirée.' : s.my_status === 'confirmed' ? '' : closed ? 'Rendez-vous à la prochaine partie.' : waiting ? 'Si une place se libère jusqu’à 30 minutes avant le début, elle est à toi automatiquement : tu recevras un e-mail de confirmation.' : s.my_status === 'declined' ? 'Contacte un organisateur pour en discuter.' : plan.waitlist === 'self' ? waitlistHint(s) : data.profile ? 'Clique sur un + pour choisir ta place.' : 'Clique sur un + pour choisir ta place. Il te faudra juste ton e-mail.';
  const guestHint = plan.limitReached ? traveller ? `Tu amènes déjà ${MAX_TRAVELLER_GUESTS} personnes, le maximum pour un·e voyageur·se.` : `La partie est complète et ${MAX_WAITING_GUESTS} de tes invité·es attendent déjà une place.` : plan.canBringOther ? 'Tu peux inscrire quelqu’un même sans venir toi-même.' : plan.onFreeSeat === 'guest' ? traveller ? 'Clique sur un + libre pour placer un·e ami·e.' : 'Clique sur un + libre pour placer quelqu’un.' : plan.waitlist === 'guest' ? waitlistHint(s) : '';
  // One way to bring someone, booked or not: the same button, above the circle, with the people already brought.
  const canAddGuest = plan.canBringOther || plan.onFreeSeat === 'guest' || plan.waitlist === 'guest';
  const showGuests = !!data.profile && s.status !== 'cancelled' && (canAddGuest || (s.my_guests ?? []).some(g => g.status !== 'cancelled'));
  const privateAddress = canSeeAddress(s, data.profile) ? address : null;
  const addressLater = data.profile?.membership === 'newcomer' && hasSeat(s) && !privateAddress;
  const practical = <div className={`detail-when ${embedded ? 'session-practical' : ''}`}>
    {s.status === 'published' ? <CalendarLink session={s} address={privateAddress} /> : <span><CalendarDays size={16} />{dateLong(s.starts_at)}</span>}
    <span><Clock3 size={16} />{time(s.starts_at)}</span><a className="practical-link" href={mapsUrl(privateAddress || s.location)} target="_blank" rel="noopener noreferrer" title="Ouvrir le lieu sur la carte"><MapPin size={16} />{s.location}</a>
    {addressLater && <span className="address-later">Adresse exacte {TRAVELLER_ADDRESS_HOURS} h avant la partie</span>}
  </div>;
  return <>
    {!embedded && <Link className="back-link" href="/"><ChevronLeft size={16} />Les parties</Link>}
    {!embedded && <div className="detail-heading">
      <h1>{sessionName(s)}</h1>
      <div className="detail-badges"><span className="script-tag">{s.script}</span>{s.visibility === 'members' && <span className="badge"><LockKeyhole size={14} />Membres et invités</span>}</div>
      {practical}
    </div>}
    {embedded && practical}
    <section className="session-table" aria-label={`Inscriptions pour ${sessionName(s)}`}>
      {(s.my_status !== 'confirmed' || s.status === 'cancelled') && <div className="session-table-status">
        <p className="session-status-title" aria-live="polite">{heading}</p>
        {hint && <p className="table-hint">{hint}</p>}
        {plan.waitlist === 'self' && <button className="button parchment" disabled={a.pending} aria-busy={busyOn === 'waitlist' || undefined} onClick={() => choose()}>{busyOn === 'waitlist' && <Spinner />}Rejoindre la liste d’attente</button>}
        {active && s.status !== 'cancelled' && <div className="table-actions"><button className="text-link" disabled={a.pending} onClick={openCancel}>{waiting ? 'Quitter la liste d’attente' : 'Retirer ma demande'}</button></div>}
      </div>}
      {showGuests && <SessionGuests ref={guestsRef} session={s} limit={traveller ? MAX_TRAVELLER_GUESTS : undefined} hint={guestHint} busy={a.pending}
        result={feedbackSpot === 'guests' ? a.result : null} onAdd={canAddGuest ? () => openGuest() : undefined}
        onRemove={g => { a.setResult(null); setRemoving(g); }} />}
      <div className="session-table-board">
        <VillageCircle reserved={s.confirmed_count} capacity={s.capacity} occupiedSeats={s.occupied_seats} participants={s.participants} mySeat={s.my_seat} interactive busy={a.pending} pendingSeat={typeof busyOn === 'number' ? busyOn : null}
          onChoose={plan.onFreeSeat ? choose : undefined}
          chooseLabel={plan.onFreeSeat === 'guest' ? 'Placer quelqu’un à la place' : 'Prendre la place'}
          onOwnSeat={s.status === 'cancelled' || s.my_status !== 'confirmed' ? undefined : openCancel}
          ownSeatLabel="Ta place · me désister"
          ownGuests={s.my_guests} onOwnGuest={s.status === 'cancelled' ? undefined : ownGuest} />
        {s.participants.length > 0 && <ul className="circle-roster" aria-label="Participants confirmés">{[...s.participants].sort((x, y) => (x.seat_index ?? 0) - (y.seat_index ?? 0)).map((p, index) => {
          const mine = p.seat_index != null && guests.some(g => g.seat_index === p.seat_index);
          return <li key={p.seat_index ?? index}><Avatar name={p.display_name} color={p.avatar_color} small /><span>{p.display_name}{s.my_seat != null && p.seat_index === s.my_seat && <small> · toi</small>}<small className="roster-role">{participantLabel(p, { mine })}</small></span>{p.can_storytell && <BookOpen size={15} role="img" aria-label="Volontaire MJ"><title>Volontaire MJ</title></BookOpen>}</li>;
        })}</ul>}
      </div>
      {(feedbackSpot === 'table' || !showGuests) && <Feedback result={a.result} />}
    </section>
    <Dialog open={authRequest !== null} onClose={() => setAuthRequest(null)} title="Rejoins le cercle"><AuthForm configured={data.configured} onSuccess={result => { const seat = authRequest?.seat; setAuthRequest(null); if (result.value !== 'nickname') reserve(seat); }} /></Dialog>
    <Dialog open={guestRequest !== null} onClose={() => setGuestRequest(null)} title="Qui inscris-tu ?">
      {guestRequest && <GuestForm sessionId={s.id} seat={guestRequest.seat} waitlist={s.confirmed_count >= s.capacity} suggestions={recentGuestNames(data.sessions, s)} onDone={guestAdded} />}
    </Dialog>
    <Dialog open={removing !== null} onClose={() => setRemoving(null)} title={`Retirer ${removing?.name ?? ''} ?`}><div className="stack"><p>{removing?.status === 'waitlisted' ? 'Sa demande quittera la liste d’attente.' : lastMinute ? 'La partie commence bientôt : sa place ne sera pas réattribuée.' : 'Sa place reviendra à la première personne de la liste d’attente.'}</p><div className="button-row"><button className="button secondary" onClick={() => setRemoving(null)}>Garder sa place</button><button className="button danger" disabled={a.pending} aria-busy={a.pending || undefined} onClick={() => removing && act('remove', () => removeGuest(removing.id), () => setRemoving(null), 'guests')}>{a.pending && <Spinner />}Retirer {removing?.name}</button></div><Feedback result={a.result} /></div></Dialog>
    <Dialog open={cancelOpen} onClose={() => setCancelOpen(false)} title={waiting ? 'Quitter la liste d’attente ?' : 'Libérer ta place ?'}><div className="stack">
      <p>{waiting ? lastMinute ? 'Les inscriptions sont closes : tu ne pourras pas revenir sur la liste.' : 'Tu perdras ton rang. Tu pourras te réinscrire, à la fin de la liste.' : lastMinute ? 'La partie commence bientôt : ta place ne sera pas réattribuée.' : 'Elle reviendra à la première personne de la liste d’attente. Tu pourras te réinscrire s’il reste de la place.'}</p>
      {guests.length > 0 && <fieldset className="guest-release"><legend>Les personnes que tu amènes</legend>{guests.map(g => <label key={g.id} className="check-field"><input type="checkbox" checked={releasedGuests.includes(g.id)} onChange={e => setReleasedGuests(ids => e.target.checked ? [...ids, g.id] : ids.filter(id => id !== g.id))} /><span>Libérer aussi la place de {g.name}</span></label>)}</fieldset>}
      <div className="button-row"><button className="button secondary" onClick={() => setCancelOpen(false)}>{waiting ? 'Rester sur la liste' : 'Garder ma place'}</button><button className="button danger" disabled={a.pending} aria-busy={a.pending || undefined} onClick={() => act('cancel', () => cancelBooking(s.id, releasedGuests), () => setCancelOpen(false))}>{a.pending && <Spinner />}{waiting ? 'Quitter la liste d’attente' : 'Confirmer mon désistement'}</button></div>
      <Feedback result={a.result} />
    </div></Dialog>
  </>;
}
