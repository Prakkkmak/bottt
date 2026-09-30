import type { BookingStatus } from './types';
export const statusLabels: Record<BookingStatus, string> = { confirmed: 'Inscrit·e', waitlisted: 'En liste d’attente', pending: 'À valider', offered: 'Une place pour toi', cancelled: 'Désisté·e', declined: 'Non retenu·e' };
export const dateLong = (date: string) => new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Paris' }).format(new Date(date));
export const shortDate = (date: string) => new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'Europe/Paris' }).format(new Date(date));
export const time = (date: string) => new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }).format(new Date(date)).replace(':', 'h');
export const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(s => s[0]).join('').toUpperCase();
export const activeBooking = (status: BookingStatus | null) => status !== null && !['cancelled', 'declined'].includes(status);
export function calendarUrl(id: string) { return `/api/calendar/${encodeURIComponent(id)}`; }
export function sessionUrl(id: string) { const encoded = encodeURIComponent(id); return `/?partie=${encoded}#partie-${encoded}`; }
export function parisInput(iso: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23' }).formatToParts(new Date(iso));
  const get=(type:string)=>parts.find(p=>p.type===type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}
export function fromParisInput(value: string) {
  const target=Date.parse(`${value}:00Z`); if(!Number.isFinite(target))throw new Error('La date est invalide.');
  let result=target;
  for(let i=0;i<3;i++)result+=target-Date.parse(`${parisInput(new Date(result).toISOString())}:00Z`);
  const iso=new Date(result).toISOString();
  if(parisInput(iso)!==value)throw new Error('Cette heure n’existe pas lors du changement d’heure. Choisis un autre horaire.');
  return iso;
}
