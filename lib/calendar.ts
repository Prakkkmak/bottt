import type { GameSession } from './types';

const stamp = (date: string) => new Date(date).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const escapeText = (value: string) => value.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');

export function externalCalendarUrl(provider: 'google' | 'outlook', session: GameSession, location: string) {
  if (provider === 'google') {
    const params = new URLSearchParams({ action: 'TEMPLATE', text: session.title, dates: `${stamp(session.starts_at)}/${stamp(session.ends_at)}`, details: session.script, location, ctz: 'Europe/Paris' });
    return `https://calendar.google.com/calendar/render?${params}`;
  }
  const params = new URLSearchParams({ path: '/calendar/action/compose', rru: 'addevent', subject: session.title, startdt: session.starts_at, enddt: session.ends_at, body: session.script, location });
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params}`;
}

// iCalendar limits physical lines to 75 UTF-8 octets, including the continuation space.
function foldLine(line: string) {
  const encoder = new TextEncoder();
  const lines: string[] = [];
  let part = '';
  let bytes = 0;
  for (const character of line) {
    const size = encoder.encode(character).length;
    if (bytes + size > 75) { lines.push(part); part = ' '; bytes = 1; }
    part += character;
    bytes += size;
  }
  lines.push(part);
  return lines.join('\r\n');
}

export function sessionCalendar(session: GameSession, location: string, now = new Date()) {
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//BOTTT//Blood on the Tanguy Tower//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
    `UID:${escapeText(session.id)}@bottt.fr`, `DTSTAMP:${stamp(now.toISOString())}`, `DTSTART:${stamp(session.starts_at)}`, `DTEND:${stamp(session.ends_at)}`,
    `SUMMARY:${escapeText(session.title)}`, `LOCATION:${escapeText(location)}`, `DESCRIPTION:${escapeText(session.script)}`, 'END:VEVENT', 'END:VCALENDAR',
  ];
  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}
