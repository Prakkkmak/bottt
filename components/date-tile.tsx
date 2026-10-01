import { dateLong } from '@/lib/utils';

const formatter = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'short', day: '2-digit', month: 'short', timeZone: 'Europe/Paris',
});

export function DateTile({ date }: { date: string }) {
  const parts = formatter.formatToParts(new Date(date));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value;
  return <time className="date-tile" dateTime={date} title={dateLong(date)}>
    <span className="date-weekday">{part('weekday')}</span>
    <strong>{part('day')}</strong>
    <span>{part('month')}</span>
  </time>;
}
