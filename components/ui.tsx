import { initials } from '@/lib/utils';
export function Avatar({ name, color = 'rose', small = false }: { name: string; color?: string; small?: boolean }) {
  return <span className={`avatar color-${color} ${small ? 'small' : ''}`} title={name}>{initials(name)}</span>;
}
/** A small turning ring for a button whose request is on its way. */
export function Spinner() {
  return <span className="spinner" aria-hidden="true" />;
}
/** Marks a refused field and points it at the message that <FieldError> shows under it. */
export const invalidField = ({ id, message }: { id: string; message?: string }) => message ? { 'aria-invalid': true, 'aria-describedby': id } as const : {};
/** Why a field is refused. Inside its label, it is hidden from the field's name and read as its description instead. */
export function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? <span className="field-error" id={id} aria-hidden="true">{message}</span> : null;
}
