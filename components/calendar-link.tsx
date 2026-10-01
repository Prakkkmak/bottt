'use client';
import { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import type { GameSession } from '@/lib/types';
import { calendarUrl, dateLong } from '@/lib/utils';
import { externalCalendarUrl } from '@/lib/calendar';
import { Dialog } from './dialog';

export function CalendarLink({ session, address }: { session: GameSession; address: string | null }) {
  const [open, setOpen] = useState(false);
  const location = address || session.location;
  return <>
    <button type="button" className="practical-link calendar-link" title="Ajouter à mon agenda" onClick={() => setOpen(true)}><CalendarDays size={16} /><span>{dateLong(session.starts_at)}</span></button>
    <Dialog open={open} onClose={() => setOpen(false)} title="Ajouter à ton agenda">
      <div className="stack"><p>{session.title}</p><a className="button secondary full" target="_blank" rel="noopener noreferrer" href={externalCalendarUrl('google', session, location)}>Google Agenda</a><a className="button secondary full" target="_blank" rel="noopener noreferrer" href={externalCalendarUrl('outlook', session, location)}>Outlook</a><a className="button secondary full" href={calendarUrl(session.id)} onClick={() => setOpen(false)}>Apple Calendar ou autre agenda (.ics)</a><p className="muted">Les informations sont préremplies. Confirme l’ajout dans ton agenda.</p></div>
    </Dialog>
  </>;
}
