import { z } from 'zod';
import { MIN_PLAYERS, DEFAULT_CAPACITY, MAX_CAPACITY } from './session-rules';
import { sessionEnd } from './session-defaults';
export const profileSchema = z.object({ display_name: z.string().trim().min(2,'Choisis un pseudo d’au moins 2 caractères.').max(40), bio: z.string().trim().max(300), avatar_color: z.enum(['rose','blue','sage','ochre','lilac']), beginner: z.boolean(), can_storytell: z.boolean().optional() });
export const sessionSchema = z.object({
  id: z.uuid().optional(), title: z.string().trim().min(3).max(100), description: z.string().trim().max(4000).default(''),
  script: z.string().trim().min(2).max(100), starts_at: z.iso.datetime({ offset: true }), ends_at: z.iso.datetime({ offset: true }).optional(),
  location: z.string().trim().min(2).max(150), address: z.string().trim().max(500, 'L’adresse et le lien Maps doivent tenir en 500 caractères.'),
  capacity: z.number().int().min(MIN_PLAYERS, 'Prévois au moins 7 places joueurs.').max(MAX_CAPACITY).default(DEFAULT_CAPACITY), newcomer_seats: z.number().int().min(0).max(MAX_CAPACITY), release_hours: z.number().int().min(0).max(336),
  visibility: z.enum(['public','members'])
}).transform(s => ({ ...s, ends_at: s.ends_at ?? sessionEnd(s.starts_at) })).refine(s => s.newcomer_seats <= s.capacity, 'Le quota des nouveaux dépasse la capacité.').refine(s => new Date(s.ends_at)>new Date(s.starts_at), 'La fin doit être après le début.').refine(s=>new Date(s.starts_at)>new Date(), 'Choisis une date à venir.');
