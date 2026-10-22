import { initials } from '@/lib/utils';
export function Avatar({ name, color = 'rose', small = false }: { name: string; color?: string; small?: boolean }) {
  return <span className={`avatar color-${color} ${small ? 'small' : ''}`} title={name}>{initials(name)}</span>;
}
/** A small turning ring for a button whose request is on its way. */
export function Spinner() {
  return <span className="spinner" aria-hidden="true" />;
}
