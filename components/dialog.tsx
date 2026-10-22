'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { X } from 'lucide-react';
/** What the dialog's forms hold, to tell whether anything changed since it opened. */
const formState = (d: HTMLDialogElement | null) => JSON.stringify([...d?.querySelectorAll('form') ?? []].map(f => [...new FormData(f)].map(([k, v]) => [k, String(v)])));
/** Closes with its close button or Esc, never with a click beside it. A guarded dialog asks before dropping what was typed. */
export function Dialog({ open, onClose, title, children, wide = false, guard = false }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean; guard?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null); const titleId = useId(); const warningId = useId();
  const initial = useRef<string | null>(null); const resume = useRef<HTMLElement | null>(null); const [confirming, setConfirming] = useState(false);
  // A lazily loaded form shows up after the dialog opens: its state is read once it is there, before anyone can touch it.
  const snapshot = () => { if (initial.current === null && ref.current?.querySelector('form')) initial.current = formState(ref.current); };
  // showModal() focuses the close button first; a form marks its first field with data-autofocus to take the focus instead.
  useEffect(() => { const d=ref.current; if(open && !d?.open) { d?.showModal(); d?.querySelector<HTMLElement>('[data-autofocus]')?.focus(); snapshot(); } else if(!open && d?.open) d.close(); },[open]);
  useEffect(() => { if (!open) return; const previous = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = previous; }; },[open]);
  const requestClose = () => {
    if (!guard || initial.current === null || formState(ref.current) === initial.current) return onClose();
    const active = document.activeElement;
    if (!confirming) resume.current = active instanceof HTMLElement && ref.current?.contains(active) ? active : null;
    setConfirming(true);
  };
  const resumeEditing = () => { flushSync(() => setConfirming(false)); (resume.current?.isConnected ? resume.current : ref.current?.querySelector<HTMLElement>('input, select, textarea'))?.focus(); };
  // Esc is caught wherever the focus is, before the browser turns it into a cancel that it stops letting us refuse after once.
  useEffect(() => {
    if (!open || !guard) return;
    const escape = (e: KeyboardEvent) => { if (e.key !== 'Escape' || e.isComposing) return; e.preventDefault(); if (confirming) resumeEditing(); else requestClose(); };
    document.addEventListener('keydown', escape, true); return () => document.removeEventListener('keydown', escape, true);
  });
  return <dialog ref={ref} className={`dialog ${wide ? 'wide' : ''}`} aria-labelledby={titleId} onFocusCapture={snapshot} onPointerDownCapture={snapshot} onCancel={e => { if (guard) { e.preventDefault(); requestClose(); } }} onClose={() => { initial.current = null; resume.current = null; setConfirming(false); onClose(); }}>
    <div className="dialog-heading"><h2 id={titleId}>{title}</h2>{!confirming && <button type="button" className="icon-btn" onClick={requestClose} aria-label="Fermer"><X size={20}/></button>}</div>
    {confirming && <div className="stack"><p id={warningId}>Ce que tu as saisi n’est pas enregistré et sera perdu si tu fermes cette fenêtre.</p><div className="button-row"><button type="button" className="button secondary" autoFocus aria-describedby={warningId} onClick={resumeEditing}>Reprendre la saisie</button><button type="button" className="button danger" onClick={onClose}>Fermer sans enregistrer</button></div></div>}
    <div hidden={confirming}>{open && children}</div>
  </dialog>;
}
