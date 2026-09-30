import { initials } from '@/lib/utils';
import type { Profile } from '@/lib/types';
import {UsersRound} from 'lucide-react';
export function Avatar({ name, color = 'rose', small = false }: { name: string; color?: string; small?: boolean }) {
  return <span className={`avatar color-${color} ${small ? 'small' : ''}`} title={name}>{initials(name)}</span>;
}
export function Avatars({ people, count }: { people: Pick<Profile, 'display_name' | 'avatar_color'>[]; count: number }) {
  if(!people.length)return <span className="anonymous-participants"><UsersRound size={16}/>{count} joueur{count>1?'s':''}</span>;
  return <div className="avatar-group" aria-label={`${count} participants`}>
    {people.slice(0, 4).map((p, i) => <Avatar key={`${p.display_name}-${i}`} name={p.display_name} color={p.avatar_color} small />)}
    {count > Math.min(4,people.length) && <span className="avatar small more">+{count - Math.min(4,people.length)}</span>}
  </div>;
}
