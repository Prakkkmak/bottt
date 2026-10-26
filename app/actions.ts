'use server';
import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { z } from 'zod';
import { supabase, authenticatedClient } from '@/lib/supabase';
import { isConfigured, isDemo } from '@/lib/config';
import { profileSchema, nicknameSchema, sessionSchema, venueSchema, guestNameSchema, invitationEmailSchema } from '@/lib/schemas';
import { canSendMail, invitationMail, sendMail, siteUrl } from '@/lib/mail';
import { flushEmails } from '@/lib/notifications';
import type { ActionResult, Membership } from '@/lib/types';
function failure(e: unknown): ActionResult { return { ok: false, message: e instanceof z.ZodError ? e.issues[0].message : e instanceof Error ? e.message : 'La demande n’a pas abouti. Réessaie.' }; }
function invalidate() { revalidatePath('/', 'layout'); }
// Only the French messages raised by our own functions reach the player, never PostgREST internals.
function databaseMessage(error: { code?: string; message: string }) { return error.code === 'P0001' ? error.message : 'La demande n’a pas abouti. Réessaie.'; }
async function rpc(name: string, args: Record<string, unknown> = {}, message = 'C’est enregistré.'): Promise<ActionResult> {
  try {
    if (isDemo()) return { ok: false, message: 'L’aperçu est en cours de raccordement à la base locale.' };
    const { db } = await authenticatedClient();
    const { data, error } = await db.rpc(name, args);
    if (error) throw new Error(databaseMessage(error));
    // The messages this action queued (booking, waiting list, a seat passed on to the next person) leave once the page has its answer.
    after(flushEmails);
    invalidate(); return { ok: true, message, value: typeof data === 'string' ? data : undefined };
  } catch(e) { return failure(e); }
}
export async function sendCode(input: { email: string; captcha: string; website: string }): Promise<ActionResult> {
  try {
    if (!isConfigured() || isDemo()) throw new Error('La connexion locale est en cours de préparation.');
    if (input.website) throw new Error('La demande n’a pas abouti.');
    const email = z.email().max(254).parse(input.email.trim().toLowerCase());
    if (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && !input.captcha) throw new Error('Valide la vérification avant de continuer.');
    // Production fails closed if CAPTCHA has not been configured. Local Auth never sends real email.
    if (process.env.VERCEL && !process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) throw new Error('Les inscriptions ne sont pas encore ouvertes.');
    const db = await supabase();
    const { error } = await db.auth.signInWithOtp({ email, options: { captchaToken: input.captcha || undefined } });
    if (error) { if (error.status === 429) throw new Error('Patiente une minute avant de demander un nouveau code.'); throw new Error('Impossible d’envoyer le code. Vérifie l’adresse et réessaie.'); }
    return { ok: true, message: 'Ton code est envoyé. Regarde dans ta boîte mail.' };
  } catch(e) { return failure(e); }
}
export async function verifyCode(input: { email: string; code: string }): Promise<ActionResult> {
  try {
    const email = z.email().max(254).parse(input.email.trim().toLowerCase());
    const token = z.string().regex(/^\d{6}$/, 'Le code contient 6 chiffres.').parse(input.code.trim());
    const db = await supabase();
    const { data, error } = await db.auth.verifyOtp({ email, token, type: 'email' });
    if (error) throw new Error('Ce code est invalide ou a expiré. Demande un nouveau code.');
    // A new account chooses its pseudo first, so the seat it clicked before signing in is not booked yet.
    const { data: profile } = await db.from('profiles').select('nickname_chosen').eq('id', data.user?.id ?? '').maybeSingle();
    invalidate(); return { ok: true, message: 'Bienvenue sur BOTTT !', value: profile?.nickname_chosen === false ? 'nickname' : undefined };
  } catch(e) { return failure(e); }
}
export async function signOut(): Promise<ActionResult> { try { const db = await supabase(); await db.auth.signOut({ scope: 'local' }); invalidate(); return { ok: true, message: 'Tu es déconnecté·e.' }; } catch(e) { return failure(e); } }
export async function bookSession(id: string, seat?: number) {
  if (!z.uuid().safeParse(id).success) return failure(new Error('Session invalide.'));
  if (seat !== undefined && !z.number().int().min(0).max(19).safeParse(seat).success) return failure(new Error('Place invalide.'));
  const result = await (seat === undefined ? rpc('book_session', { p_id: id }) : rpc('book_circle_seat', { p_id: id, p_seat: seat }));
  if (!result.ok) return result;
  return { ...result, message: result.value === 'confirmed' ? 'Ta place est réservée !' : result.value === 'waitlisted' ? 'Tu es sur la liste d’attente. Si une place se libère, elle est à toi et tu recevras un e-mail.' : 'Ta participation est déjà enregistrée.' };
}
const isUuid = (value: string) => z.uuid().safeParse(value).success;
export async function cancelBooking(id: string, guestIds: string[] = []) {
  if (!isUuid(id) || !guestIds.every(isUuid)) return failure(new Error('Participation invalide.'));
  // The player and the guests they release leave together, before the waiting list moves.
  return rpc('leave_session', { p_id: id, p_guests: guestIds }, guestIds.length ? 'Vos places sont libérées. À une prochaine !' : 'Ton désistement est enregistré. À une prochaine !');
}
export async function addGuest(sessionId: string, name: string, seat?: number): Promise<ActionResult> {
  if (!isUuid(sessionId)) return failure(new Error('Session invalide.'));
  const parsed = guestNameSchema.safeParse(name);
  if (!parsed.success) return failure(parsed.error);
  if (seat !== undefined && !z.number().int().min(0).max(19).safeParse(seat).success) return failure(new Error('Place invalide.'));
  const result = await rpc('add_guest', { p_session: sessionId, p_name: parsed.data, p_seat: seat ?? null });
  if (!result.ok) return result;
  const who = parsed.data;
  return { ...result, message: result.value === 'confirmed' ? `${who} a sa place !` : result.value === 'waitlisted' ? `${who} est sur la liste d’attente.` : `${who} est déjà inscrit·e.` };
}
export async function removeGuest(bookingId: string) { if (!isUuid(bookingId)) return failure(new Error('Invité·e introuvable.')); return rpc('remove_guest', { p_booking: bookingId }, 'Sa place est libérée.'); }
/** An organizer takes someone off a game; their seat passes to the first person waiting. */
export async function removeParticipant(id: string) { if (!isUuid(id)) return failure(new Error('Participation introuvable.')); return rpc('review_booking', { p_booking: id, p_approve: false }, 'La participation a été retirée.'); }
export async function createInvitation() { return rpc('create_invitation', {}, 'Ton lien d’invitation est prêt.'); }
export async function acceptInvitation(token: string) { if (!/^[a-f0-9]{64}$/.test(token)) return failure(new Error('Invitation invalide.')); return rpc('accept_invitation', { p_token: token }, 'Bienvenue ! Tu fais maintenant partie du cercle.'); }
/** Creates a sponsorship link and e-mails it; when the e-mail cannot leave, the link comes back so the sponsor can pass it on. */
export async function sendInvitation(input: string): Promise<ActionResult> {
  try {
    if (isDemo()) return { ok: false, message: 'L’aperçu est en cours de raccordement à la base locale.' };
    const email = invitationEmailSchema.parse(input);
    const { db, user } = await authenticatedClient();
    const manual = 'Copie le lien ci-dessous et transmets-le toi-même.';
    // Without a provider, or without the site's public address for the link, no e-mail leaves and no address is kept.
    if (!canSendMail() || (process.env.VERCEL && !process.env.NEXT_PUBLIC_SITE_URL)) {
      const { data: token, error } = await db.rpc('create_invitation');
      if (error) throw new Error(databaseMessage(error));
      invalidate();
      return { ok: true, message: `L’envoi d’e-mails n’est pas encore configuré. ${manual}`, value: token };
    }
    const { data: token, error } = await db.rpc('create_email_invitation', { p_email: email });
    if (error) throw new Error(databaseMessage(error));
    invalidate();
    const { data: sponsor } = await db.from('profiles').select('display_name').eq('id', user.id).maybeSingle();
    const link = `${siteUrl()}/invite/${token}`;
    try { await sendMail({ to: email, ...invitationMail(sponsor?.display_name ?? '', link) }); }
    catch { return { ok: true, message: `L’e-mail n’a pas pu partir. ${manual}`, value: token }; }
    return { ok: true, message: `Invitation envoyée à ${email}.` };
  } catch(e) { return failure(e); }
}
export async function revokeInvitation(id: string) { if (!isUuid(id)) return failure(new Error('Invitation introuvable.')); return rpc('revoke_invitation', { p_id: id }, 'Cette invitation est désactivée.'); }
export async function saveSession(input: unknown) { const parsed = sessionSchema.safeParse(input); if (!parsed.success) return failure(parsed.error); return rpc('save_session', { p_data: { ...parsed.data, beginners_welcome: true } }, 'La session est publiée.'); }
export async function saveVenue(input: unknown) { const parsed = venueSchema.safeParse(input); if (!parsed.success) return failure(parsed.error); return rpc('save_venue', { p_data: parsed.data }, parsed.data.id ? 'Le lieu est enregistré.' : 'Le lieu est ajouté.'); }
export async function deleteVenue(id: string) { if (!isUuid(id)) return failure(new Error('Lieu introuvable.')); return rpc('delete_venue', { p_id: id }, 'Le lieu est retiré de la liste.'); }
export async function cancelSession(id: string) { if (!isUuid(id)) return failure(new Error('Session invalide.')); return rpc('cancel_session', { p_id: id }, 'La session est annulée. Les participants seront prévenus.'); }
export async function deleteSession(id: string) { if (!isUuid(id)) return failure(new Error('Session invalide.')); return rpc('delete_session', { p_id: id }, 'La partie est supprimée.'); }
const rankMessages: Record<Membership, string> = { newcomer: 'Le compte est passé voyageur·se.', member: 'Le compte est passé membre.', organizer: 'Le compte rejoint l’organisation.', suspended: 'Le compte est suspendu.' };
export async function setMembership(id: string, status: Membership) { if (!isUuid(id) || !Object.hasOwn(rankMessages, status)) return failure(new Error('Action non autorisée.')); return rpc('set_membership', { p_user: id, p_status: status }, rankMessages[status]); }
/** First pseudo of a new account, asked right after the code: saving it lets the player into the site. */
export async function saveNickname(input: string): Promise<ActionResult> {
  try { const display_name = nicknameSchema.parse(input); const { db, user } = await authenticatedClient(); const { error } = await db.from('profiles').update({ display_name }).eq('id', user.id); if (error) throw new Error('Ton pseudo n’a pas pu être enregistré.'); invalidate(); return { ok: true, message: `Bienvenue, ${display_name} !` }; } catch(e) { return failure(e); }
}
export async function saveProfile(input: unknown): Promise<ActionResult> {
  try { const parsed = profileSchema.parse(input); const { db, user } = await authenticatedClient(); const { error } = await db.from('profiles').update(parsed).eq('id', user.id); if (error) throw new Error('Le profil n’a pas pu être enregistré.'); invalidate(); return { ok: true, message: 'Ton profil a été mis à jour.' }; } catch(e) { return failure(e); }
}
