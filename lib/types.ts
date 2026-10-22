export type Membership = 'newcomer' | 'member' | 'organizer' | 'suspended';
/** Self-declared level: débutant·e, quelques parties, expérimenté·e. */
export type Experience = 'beginner' | 'some' | 'experienced';
export type BookingStatus = 'pending' | 'confirmed' | 'waitlisted' | 'offered' | 'cancelled' | 'declined';
export type Profile = { id: string; display_name: string; bio: string; avatar_color: string; beginner: boolean; experience: Experience; can_storytell: boolean; membership: Membership; sponsored_by: string | null; nickname_chosen: boolean; };
/** member: compte membre ou organisateur · guest: amené·e par un membre · traveller: compte voyageur · traveller_guest: amené·e par un voyageur. */
export type ParticipantRole = 'member' | 'guest' | 'traveller' | 'traveller_guest';
export type Participant = Pick<Profile, 'display_name' | 'avatar_color'> & { seat_index?: number; can_storytell?: boolean; role?: ParticipantRole; invited_by?: string | null };
/** Someone the viewer brings to a session, as returned by list_sessions. */
export type MyGuest = { id: string; name: string; status: BookingStatus; seat_index: number | null; offer_expires_at: string | null };
export type GameSession = {
  id: string; title: string; description?: string; script: string;
  starts_at: string; ends_at: string; location: string;
  /** The saved venue the game takes its name and address from; null for a place typed in for this game only. */
  venue_id?: string | null;
  capacity: number; newcomer_seats: number; release_hours: number;
  beginners_welcome: boolean; visibility: 'public' | 'members';
  status: 'published' | 'cancelled';
  confirmed_count: number; waitlist_count: number;
  my_status: BookingStatus | null; my_offer_expires_at?: string | null;
  occupied_seats?: number[]; my_seat?: number | null;
  member_seats_free?: number; traveller_seats_free?: number; my_guests?: MyGuest[];
  participants: Participant[];
};
/** A usual place, managed by organizers. The address is private, like a game's, and may end with a map link. */
export type Venue = { id: string; name: string; address: string; };
export type Booking = { id: string; session_id: string; user_id: string | null; guest_name: string | null; sponsor_id: string | null; status: BookingStatus; pool: 'circle' | 'newcomer'; created_at: string; offer_expires_at: string | null; profile?: Profile | null; };
/** sent_to: the address the link was e-mailed to, erased 30 days after the link expires. */
export type Invitation = { id: string; sponsor_id: string; expires_at: string; used_by: string | null; created_at: string; sent_to?: string | null; };
export type AppData = { profile: Profile | null; sessions: GameSession[]; invitations: Invitation[]; demo: boolean; configured: boolean; local?: boolean; error?: string; accountNotice?: string; };
export type ActionResult = { ok: boolean; message: string; value?: string; };
export type SessionInput = Omit<GameSession, 'id' | 'status' | 'confirmed_count' | 'waitlist_count' | 'my_status' | 'my_offer_expires_at' | 'occupied_seats' | 'my_seat' | 'participants' | 'member_seats_free' | 'traveller_seats_free' | 'my_guests'> & { address: string; id?: string; };
