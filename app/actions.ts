'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { supabase, authenticatedClient } from '@/lib/supabase';
import { isConfigured, isDemo } from '@/lib/config';
import { profileSchema, sessionSchema } from '@/lib/schemas';
import type { ActionResult } from '@/lib/types';
function failure(e: unknown): ActionResult { return { ok: false, message: e instanceof z.ZodError ? e.issues[0].message : e instanceof Error ? e.message : 'La demande n’a pas abouti. Réessaie.' }; }
function invalidate() { revalidatePath('/', 'layout'); }
async function rpc(name: string, args: Record<string, unknown> = {}, message = 'C’est enregistré.'): Promise<ActionResult> {
  try {
    if (isDemo()) return { ok: false, message: 'L’aperçu est en cours de raccordement à la base locale.' };
    const { db } = await authenticatedClient();
    const { data, error } = await db.rpc(name, args);
    if (error) throw new Error(error.message);
    invalidate(); return { ok: true, message, value: typeof data === 'string' ? data : undefined };
  } catch(e) { return failure(e); }
}
export async function sendCode(input: { email: string; name: string; captcha: string; website: string }): Promise<ActionResult> {
  try {
    if (!isConfigured() || isDemo()) throw new Error('La connexion locale est en cours de préparation.');
    if (input.website) throw new Error('La demande n’a pas abouti.');
    const email = z.email().max(254).parse(input.email.trim().toLowerCase());
    const name = z.string().trim().min(2,'Indique ton prénom ou ton pseudo.').max(40).parse(input.name);
    if (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && !input.captcha) throw new Error('Valide la vérification avant de continuer.');
    // Production fails closed if CAPTCHA has not been configured. Local Auth never sends real email.
    if (process.env.VERCEL && !process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) throw new Error('Les inscriptions ne sont pas encore ouvertes.');
    const db = await supabase();
    const { error } = await db.auth.signInWithOtp({ email, options: { data: { display_name: name }, captchaToken: input.captcha || undefined } });
    if (error) { if (error.status === 429) throw new Error('Patiente une minute avant de demander un nouveau code.'); throw new Error('Impossible d’envoyer le code. Vérifie l’adresse et réessaie.'); }
    return { ok: true, message: 'Ton code est envoyé. Regarde dans ta boîte mail.' };
  } catch(e) { return failure(e); }
}
export async function verifyCode(input: { email: string; code: string }): Promise<ActionResult> {
  try {
    const email = z.email().max(254).parse(input.email.trim().toLowerCase());
    const token = z.string().regex(/^\d{6}$/, 'Le code contient 6 chiffres.').parse(input.code.trim());
    const db = await supabase();
    const { error } = await db.auth.verifyOtp({ email, token, type: 'email' });
    if (error) throw new Error('Ce code est invalide ou a expiré. Demande un nouveau code.');
    invalidate(); return { ok: true, message: 'Bienvenue sur Blood on Breizh !' };
  } catch(e) { return failure(e); }
}
export async function signOut(): Promise<ActionResult> { try { const db = await supabase(); await db.auth.signOut({ scope: 'local' }); invalidate(); return { ok: true, message: 'Tu es déconnecté·e.' }; } catch(e) { return failure(e); } }
export async function bookSession(id: string, seat?: number) {
  if (!z.uuid().safeParse(id).success) return failure(new Error('Session invalide.'));
  if (seat !== undefined && !z.number().int().min(0).max(19).safeParse(seat).success) return failure(new Error('Place invalide.'));
  const result = await (seat === undefined ? rpc('book_session', { p_id: id }) : rpc('book_circle_seat', { p_id: id, p_seat: seat }));
  if (!result.ok) return result;
  return { ...result, message: result.value === 'confirmed' ? 'Ta place est réservée !' : result.value === 'pending' ? 'Demande envoyée. Un organisateur va la valider.' : result.value === 'waitlisted' ? 'Tu es sur la liste d’attente.' : 'Ta participation est déjà enregistrée.' };
}
export async function cancelBooking(id: string) { return rpc('cancel_booking', { p_id: id }, 'Ton désistement est enregistré. À une prochaine !'); }
export async function acceptOffer(id: string) { return rpc('accept_offer', { p_id: id }, 'Ta place est confirmée !'); }
export async function reviewBooking(id: string, approve: boolean) { return rpc('review_booking', { p_booking: id, p_approve: approve }, approve ? 'La demande est validée.' : 'La participation a été retirée.'); }
export async function createInvitation() { return rpc('create_invitation', {}, 'Ton lien d’invitation est prêt.'); }
export async function acceptInvitation(token: string) { if (!/^[a-f0-9]{64}$/.test(token)) return failure(new Error('Invitation invalide.')); return rpc('accept_invitation', { p_token: token }, 'Bienvenue ! Tu fais maintenant partie du cercle.'); }
export async function revokeInvitation(id: string) { return rpc('revoke_invitation', { p_id: id }, 'Cette invitation est désactivée.'); }
export async function saveSession(input: unknown) { const parsed = sessionSchema.safeParse(input); if (!parsed.success) return failure(parsed.error); return rpc('save_session', { p_data: { ...parsed.data, beginners_welcome: true } }, 'La session est publiée.'); }
export async function cancelSession(id: string) { return rpc('cancel_session', { p_id: id }, 'La session est annulée. Les participants seront prévenus.'); }
export async function setMembership(id: string, status: 'member' | 'suspended') { return rpc('set_membership', { p_user: id, p_status: status }, 'Le compte a été mis à jour.'); }
export async function markNoticesRead() { return rpc('mark_notices_read'); }
export async function saveProfile(input: unknown): Promise<ActionResult> {
  try { const parsed = profileSchema.parse(input); const { db, user } = await authenticatedClient(); const { error } = await db.from('profiles').update(parsed).eq('id', user.id); if (error) throw new Error('Le profil n’a pas pu être enregistré.'); invalidate(); return { ok: true, message: 'Ton profil a été mis à jour.' }; } catch(e) { return failure(e); }
}
