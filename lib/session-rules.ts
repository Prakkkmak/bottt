export const MIN_PLAYERS = 7;
export const DEFAULT_CAPACITY = 15;
export const MAX_CAPACITY = 20;

/** Mirrors the limits enforced by public.add_guest: travellers bring 2 people, members as many as member seats allow… */
export const MAX_TRAVELLER_GUESTS = 2;
/** …then 2 more on the waitlist once the game is full. */
export const MAX_WAITING_GUESTS = 2;
/** Mirrors the addresses_read policy: travellers book without an organizer, and read the exact address this close to the game. */
export const TRAVELLER_ADDRESS_HOURS = 48;
