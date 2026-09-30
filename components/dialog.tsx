'use client';
import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
export function Dialog({ open, onClose, title, children, wide = false }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null); const titleId = useId();
  useEffect(() => { const d=ref.current; if(open && !d?.open) d?.showModal(); else if(!open && d?.open) d.close(); },[open]);
  useEffect(() => { if (!open) return; const previous = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = previous; }; },[open]);
  return <dialog ref={ref} className={`dialog ${wide ? 'wide' : ''}`} aria-labelledby={titleId} onCancel={onClose} onClose={onClose} onClick={e=>{ if(e.target===ref.current) { const r=ref.current.getBoundingClientRect(); if(e.clientX<r.left || e.clientX>r.right || e.clientY<r.top || e.clientY>r.bottom) onClose(); } }}><div className="dialog-heading"><h2 id={titleId}>{title}</h2><button type="button" className="icon-btn" onClick={onClose} aria-label="Fermer"><X size={20}/></button></div>{open && children}</dialog>;
}
