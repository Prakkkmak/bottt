'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CalendarDays, Clock3, MapPin, ChevronLeft, LockKeyhole, BookOpen } from 'lucide-react';
import type { AppData, GameSession } from '@/lib/types';
import { dateLong, time, activeBooking } from '@/lib/utils';
import { mapsUrl } from '@/lib/locations';
import { CalendarLink } from './calendar-link';
import { Dialog } from './dialog';
import { AuthForm } from './auth';
import { VillageCircle } from './tableau';
import { useAction, Feedback } from './action-feedback';
import { bookSession, cancelBooking, acceptOffer } from '@/app/actions';
import { Avatar } from './ui';

export function SessionDetail({ data, session: s, address, embedded = false }: { data: AppData; session: GameSession; address: string | null; embedded?: boolean }) {
  const a = useAction();
  const router = useRouter();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [authRequest, setAuthRequest] = useState<{ seat?: number } | null>(null);
  const active = activeBooking(s.my_status);
  const closed = s.status === 'cancelled' || new Date(s.starts_at).getTime() <= Date.now() + 30 * 60000;
  const free = Math.max(0, s.capacity - s.confirmed_count);
  const canJoin = !active && !closed && s.my_status !== 'declined';
  const offered = s.my_status === 'offered';
  const liveOffer = offered && s.my_seat != null && !!s.my_offer_expires_at && new Date(s.my_offer_expires_at).getTime() > Date.now();
  const openCancel = () => { a.setResult(null); setCancelOpen(true); };
  const reserve = (seat?: number) => a.run(async () => {
    const result = await bookSession(s.id, seat);
    if (!result.ok) router.refresh();
    return result;
  });
  const choose = (seat?: number) => data.profile ? reserve(seat) : setAuthRequest({ seat });
  const heading = s.status === 'cancelled' ? 'Partie annulée' : s.my_status === 'confirmed' ? 'Tu es inscrit·e.' : closed ? 'Inscriptions closes' : offered ? liveOffer ? 'Une place pour toi.' : 'Proposition expirée.' : s.my_status === 'pending' ? 'Demande envoyée.' : s.my_status === 'waitlisted' ? 'Tu es en attente.' : s.my_status === 'declined' ? 'Participation non retenue' : 'Inscris-toi';
  const hint = s.status === 'cancelled' ? 'On se retrouve à une prochaine soirée.' : s.my_status === 'confirmed' ? '' : closed ? 'Rendez-vous à la prochaine partie.' : offered ? liveOffer ? 'Clique sur ton jeton pour confirmer.' : 'Retire ta demande pour rejoindre à nouveau la liste d’attente.' : s.my_status === 'pending' ? 'Un organisateur va valider ta première participation.' : s.my_status === 'waitlisted' ? 'On te prévient par e-mail dès qu’une place se libère.' : s.my_status === 'declined' ? 'Contacte un organisateur pour en discuter.' : '';
  const privateAddress = s.my_status === 'confirmed' || data.profile?.membership === 'organizer' ? address : null;
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
        {canJoin && !free && <button className="button parchment" disabled={a.pending} onClick={() => choose()}>Rejoindre la liste d’attente</button>}
        {liveOffer && !closed && <p className="table-note">À confirmer avant le {s.my_offer_expires_at ? `${dateLong(s.my_offer_expires_at)} à ${time(s.my_offer_expires_at)}` : 'délai indiqué'}.</p>}
        {active && s.status !== 'cancelled' && <div className="table-actions"><button className="text-link" disabled={a.pending} onClick={openCancel}>Retirer ma demande</button></div>}
      </div>}
      <div className="session-table-board">
        <VillageCircle reserved={s.confirmed_count} capacity={s.capacity} occupiedSeats={s.occupied_seats} participants={s.participants} mySeat={s.my_seat} interactive busy={a.pending}
          onChoose={canJoin ? choose : undefined}
          onOwnSeat={s.status === 'cancelled' ? undefined : liveOffer && !closed ? () => a.run(() => acceptOffer(s.id)) : s.my_status === 'confirmed' ? openCancel : undefined}
          ownSeatLabel={offered ? 'Confirmer ma place' : 'Ta place · me désister'} />
        {s.participants.length > 0 && <ul className={`circle-roster ${s.capacity <= 14 ? 'narrow-roster' : ''}`} aria-label="Participants confirmés">{[...s.participants].sort((a, b) => (a.seat_index ?? 0) - (b.seat_index ?? 0)).map((p, index) => <li key={p.seat_index ?? index}><Avatar name={p.display_name} color={p.avatar_color} small /><span>{p.display_name}{p.seat_index === s.my_seat && <small> · toi</small>}</span>{p.can_storytell && <BookOpen size={15} role="img" aria-label="Volontaire MJ"><title>Volontaire MJ</title></BookOpen>}</li>)}</ul>}
      </div>
      <Feedback result={a.result} />
    </section>
    <Dialog open={authRequest !== null} onClose={() => setAuthRequest(null)} title="Rejoins le cercle"><AuthForm configured={data.configured} onSuccess={() => { const seat = authRequest?.seat; setAuthRequest(null); reserve(seat); }} /></Dialog>
    <Dialog open={cancelOpen} onClose={() => setCancelOpen(false)} title="Libérer ta place ?"><div className="stack"><p>Elle sera proposée à quelqu’un d’autre. Tu pourras te réinscrire s’il reste de la place.</p><div className="button-row"><button className="button secondary" onClick={() => setCancelOpen(false)}>Garder ma place</button><button className="button danger" disabled={a.pending} onClick={() => a.run(() => cancelBooking(s.id), () => setCancelOpen(false))}>Confirmer mon désistement</button></div><Feedback result={a.result} /></div></Dialog>
  </>;
}
