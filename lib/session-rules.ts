// The storyteller is one of the people who book (see the « Volontaire MJ » badge): every count of places includes them.
export const MIN_CAPACITY = 7;
/** 15 players and the storyteller. The database keeps 15 as its own fallback, which the site never relies on: it always sends the number. */
export const DEFAULT_CAPACITY = 16;
export const MAX_CAPACITY = 20;

/** Mirrors the limits enforced by public.add_guest: travellers bring 2 people, members as many as member seats allow… */
export const MAX_TRAVELLER_GUESTS = 2;
/** …then 2 more on the waitlist once the game is full. */
export const MAX_WAITING_GUESTS = 2;
/** Mirrors the addresses_read policy: travellers book without an organizer, and read the exact address this close to the game. */
export const TRAVELLER_ADDRESS_HOURS = 48;

/** How far ahead a recurring game opens its dates, as offered in the form; the database accepts 1 to 12 weeks. */
export const SERIES_WEEKS_AHEAD = [2, 4, 8, 12] as const;
export const DEFAULT_WEEKS_AHEAD = 4;
export const MAX_WEEKS_AHEAD = 12;
