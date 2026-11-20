'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { UsersRound } from 'lucide-react';
import { communityLinks, type CommunityId } from '@/lib/community';

// The logos are symbols of one cached file, like the Tour Tanguy, rather than path data in every page.
function Logo({ id, size }: { id: CommunityId; size: number }) {
  return <svg width={size} height={size} fill="currentColor" aria-hidden="true" focusable="false"><use href={`/community.svg#${id}`} /></svg>;
}

/** The circle's groups in the header: three round links on wide screens, one button opening the same list where the header has no room for them. */
export function CommunityLinks() {
  // The header stays mounted from page to page: a new page (Back and Forward included) starts with the list closed.
  const path = usePathname();
  return <Community key={path} />;
}

function Community() {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const root = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); toggle.current?.focus(); } };
    // From 1200 px the button gives way to the round links: the list must not come back when the screen narrows again.
    const wide = matchMedia('(min-width: 1200px)');
    const widened = () => { if (wide.matches) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    wide.addEventListener('change', widened);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); wide.removeEventListener('change', widened); };
  }, [open]);
  // Leaving the list with the keyboard closes it; a tap elsewhere is handled above.
  return <div className="community" ref={root} onBlur={e => { if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
    <ul className="community-icons" aria-label="Nos groupes">{communityLinks.map(l => <li key={l.id}><a className={`community-icon community-${l.id}`} href={l.href} target="_blank" rel="noopener noreferrer" aria-label={`${l.label} (nouvel onglet)`}><Logo id={l.id} size={19} /><span className="community-tip" aria-hidden="true">{l.label}</span></a></li>)}</ul>
    <button ref={toggle} type="button" className="community-toggle" aria-expanded={open} aria-controls={menuId} aria-label="Nos groupes" onClick={() => setOpen(o => !o)}><UsersRound size={19} /></button>
    <div className="community-menu" id={menuId} hidden={!open}>
      <p>Retrouve-nous entre deux soirées</p>
      {/* The chosen link disappears with the list: focus goes back to the button rather than to the top of the page. */}
      <ul>{communityLinks.map(l => <li key={l.id}><a className={`community-${l.id}`} href={l.href} target="_blank" rel="noopener noreferrer" onClick={() => { setOpen(false); toggle.current?.focus(); }}><span className="community-logo"><Logo id={l.id} size={18} /></span>{l.label}<span className="sr-only"> (nouvel onglet)</span></a></li>)}</ul>
    </div>
  </div>;
}
