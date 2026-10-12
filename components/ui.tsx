import { initials } from '@/lib/utils';
export function Avatar({ name, color = 'rose', small = false }: { name: string; color?: string; small?: boolean }) {
  return <span className={`avatar color-${color} ${small ? 'small' : ''}`} title={name}>{initials(name)}</span>;
}
