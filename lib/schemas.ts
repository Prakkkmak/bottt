import { z } from 'zod';
import { MIN_PLAYERS, DEFAULT_CAPACITY, MAX_CAPACITY } from './session-rules';
import { sessionEnd } from './session-defaults';
import { sessionMessages as m } from './session-form';
// « Nouveau joueur » is the placeholder of an account that has not chosen yet (see the nickname migration).
export const nicknameSchema = z.string().trim().min(2,'Choisis un pseudo d’au moins 2 caractères.').max(40).refine(name => name !== 'Nouveau joueur', 'Choisis un pseudo à toi.');
export const profileSchema = z.object({ display_name: nicknameSchema, bio: z.string().trim().max(300), avatar_color: z.enum(['rose','blue','sage','ochre','lilac']), experience: z.enum(['beginner','some','experienced'], 'Choisis ton niveau.'), can_storytell: z.boolean().optional() });
export const sessionSchema = z.object({
  id: z.uuid('Cette partie est introuvable.').optional(), title: z.string(m.title).trim().max(100, m.title).default(''), description: z.string('La description tient en 4000 caractères au plus.').trim().max(4000, 'La description tient en 4000 caractères au plus.').default(''),
  script: z.string(m.scriptShort).trim().min(2, m.scriptShort).max(100, m.scriptLong),
  starts_at: z.iso.datetime({ offset: true, error: m.start }).refine(s => new Date(s) > new Date(), m.past), ends_at: z.iso.datetime({ offset: true, error: 'La fin de la partie est invalide.' }).optional(),
  location: z.string(m.locationShort).trim().min(2, m.locationShort).max(150, m.locationLong), venue_id: z.uuid('Ce lieu n’est plus dans la liste. Choisis-en un autre.').nullable().default(null), address: z.string(m.address).trim().max(500, m.address),
  capacity: z.number(m.seats).int(m.wholeSeats).min(MIN_PLAYERS, m.fewSeats).max(MAX_CAPACITY, m.manySeats).default(DEFAULT_CAPACITY),
  visibility: z.enum(['public','members'], m.visibility)
}, 'La partie envoyée est incomplète. Recharge la page et réessaie.').transform(s => ({ ...s, ends_at: s.ends_at ?? sessionEnd(s.starts_at) })).refine(s => new Date(s.ends_at)>new Date(s.starts_at), m.end);
export const venueSchema = z.object({
  id: z.uuid('Ce lieu est introuvable.').optional(), name: z.string().trim().min(2, 'Donne au lieu un nom de 2 à 150 caractères.').max(150, 'Donne au lieu un nom de 2 à 150 caractères.'),
  address: z.string().trim().max(500, 'L’adresse et le lien Maps doivent tenir en 500 caractères.')
});
export const guestNameSchema = z.string().trim().min(2, 'Indique un prénom ou un pseudo de 2 à 40 caractères.').max(40, 'Indique un prénom ou un pseudo de 2 à 40 caractères.');
export const invitationEmailSchema = z.string().trim().toLowerCase().pipe(z.email('Cette adresse e-mail est invalide.').max(254, 'Cette adresse e-mail est invalide.'));
