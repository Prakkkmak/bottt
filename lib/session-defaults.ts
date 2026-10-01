import { parisInput } from './utils';

export const DEFAULT_SESSION_HOURS = 4;

export function sessionEnd(startsAt: string, previous?: { starts_at: string; ends_at: string }) {
  const duration = previous ? Date.parse(previous.ends_at) - Date.parse(previous.starts_at) : DEFAULT_SESSION_HOURS * 3600000;
  return new Date(Date.parse(startsAt) + duration).toISOString();
}

export function nextSessionStart(now = new Date()) {
  const localNow = parisInput(now.toISOString());
  const day = new Date(`${localNow.slice(0, 10)}T12:00:00Z`);
  const untilFriday = (5 - day.getUTCDay() + 7) % 7;
  day.setUTCDate(day.getUTCDate() + (untilFriday || (localNow.slice(11) >= '19:30' ? 7 : 0)));
  return `${day.toISOString().slice(0, 10)}T19:30`;
}
