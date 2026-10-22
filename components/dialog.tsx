'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { X } from 'lucide-react';
/** What the dialog's forms hold, to tell whether anything changed since it opened. */
const formState = (d: HTMLDialogElement | null) => JSON.stringify([...d?.querySelectorAll('form') ?? []].map(f => [...new FormData(f)].map(([k, v]) => [k, String(v)])));
/** Closes with its close button or Esc, never with a click beside it. A guarded dialog asks before dropping what was typed. */
export function Dialog({ open, onClose, title, children, wide = false, guard = false }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean; guard?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null); const titleId = useId(); const warningId = useId();
  const initial = useRef(''); const resume = useRef<HTMLElement | null>(null); const [confirming, setConfirming] = useState(false);
  // showModal() focuses the close button first; a form marks its first field with data-autofocus to take the focus instead.
  useEffect(() => { const d=ref.current; if(open && !d?.open) { d?.showModal(); d?.querySelector<HTMLElement>('[data-autofocus]')?.focus(); initial.current = formState(d); } else if(!open && d?.open) d.close(); },[open]);
  useEffect(() => { if (!open) return; const previous = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = previous; }; },[open]);
  // Back to the form: the focus returns where it was.
  useEffect(() => { if (!confirming) resume.current?.focus(); },[confirming]);
  const requestClose = () => {
    if (!guard || formState(ref.current) === initial.current) return onClose();
    if (!confirming) resume.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setConfirming(true);
  };
  // Esc is handled before the browser turns it into a cancel, which it may stop honouring after a first refusal.
  return <dialog ref={ref} className={`dialog ${wide ? 'wide' : ''}`} aria-labelledby={titleId} onKeyDown={e => { if (!guard || e.key !== 'Escape' || e.nativeEvent.isComposing) return; e.preventDefault(); if (confirming) setConfirming(false); else requestClose(); }} onCancel={e => { if (guard) { e.preventDefault(); requestClose(); } }} onClose={() => { resume.current = null; setConfirming(false); onClose(); }}>
    <div className="dialog-heading"><h2 id={titleId}>{title}</h2><button type="button" className="icon-btn" onClick={requestClose} aria-label="Fermer"><X size={20}/></button></div>
    {confirming && <div className="stack"><p id={warningId}>Ce que tu as saisi n’est pas enregistré et sera perdu si tu fermes cette fenêtre.</p><div className="button-row"><button type="button" className="button secondary" autoFocus aria-describedby={warningId} onClick={() => setConfirming(false)}>Reprendre la saisie</button><button type="button" className="button danger" onClick={onClose}>Fermer sans enregistrer</button></div></div>}
    <div hidden={confirming}>{open && children}</div>
  </dialog>;
}
