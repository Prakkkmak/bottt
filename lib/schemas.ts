import { z } from 'zod';
import { MIN_PLAYERS, DEFAULT_CAPACITY, MAX_CAPACITY } from './session-rules';
import { sessionEnd } from './session-defaults';
// « Nouveau joueur » is the placeholder of an account that has not chosen yet (see the nickname migration).
export const nicknameSchema = z.string().trim().min(2,'Choisis un pseudo d’au moins 2 caractères.').max(40).refine(name => name !== 'Nouveau joueur', 'Choisis un pseudo à toi.');
export const profileSchema = z.object({ display_name: nicknameSchema, bio: z.string().trim().max(300), avatar_color: z.enum(['rose','blue','sage','ochre','lilac']), experience: z.enum(['beginner','some','experienced'], 'Choisis ton niveau.'), can_storytell: z.boolean().optional() });
export const sessionSchema = z.object({
  id: z.uuid().optional(), title: z.string().trim().max(100).default(''), description: z.string().trim().max(4000).default(''),
  script: z.string().trim().min(2).max(100), starts_at: z.iso.datetime({ offset: true }), ends_at: z.iso.datetime({ offset: true }).optional(),
  location: z.string().trim().min(2).max(150), venue_id: z.uuid().nullable().default(null), address: z.string().trim().max(500, 'L’adresse et le lien Maps doivent tenir en 500 caractères.'),
  capacity: z.number().int().min(MIN_PLAYERS, 'Prévois au moins 7 places joueurs.').max(MAX_CAPACITY).default(DEFAULT_CAPACITY), newcomer_seats: z.number().int().min(0).max(MAX_CAPACITY), release_hours: z.number().int().min(0).max(336),
  visibility: z.enum(['public','members'])
}).transform(s => ({ ...s, ends_at: s.ends_at ?? sessionEnd(s.starts_at) })).refine(s => s.newcomer_seats <= s.capacity, 'Les places voyageurs dépassent la capacité.').refine(s => new Date(s.ends_at)>new Date(s.starts_at), 'La fin doit être après le début.').refine(s=>new Date(s.starts_at)>new Date(), 'Choisis une date à venir.');
export const venueSchema = z.object({
  id: z.uuid().optional(), name: z.string().trim().min(2, 'Donne au lieu un nom de 2 à 150 caractères.').max(150, 'Donne au lieu un nom de 2 à 150 caractères.'),
  address: z.string().trim().max(500, 'L’adresse et le lien Maps doivent tenir en 500 caractères.')
});
export const guestNameSchema = z.string().trim().min(2, 'Indique un prénom ou un pseudo de 2 à 40 caractères.').max(40, 'Indique un prénom ou un pseudo de 2 à 40 caractères.');
export const invitationEmailSchema = z.string().trim().toLowerCase().pipe(z.email('Cette adresse e-mail est invalide.').max(254, 'Cette adresse e-mail est invalide.'));
