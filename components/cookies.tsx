'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { COOKIE_POLICY_KEY, COOKIE_SETTINGS_EVENT, isCookiePolicyAcknowledged, cookiePolicyAcknowledgement } from '@/lib/cookie-policy';

export function CookieSettings() {
  return <button type="button" className="footer-button" onClick={() => window.dispatchEvent(new Event(COOKIE_SETTINGS_EVENT))}>Gérer les cookies</button>;
}

export function CookieBanner() {
  const [visible, setVisible] = useState(false);
  const confirm = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    try { setVisible(!isCookiePolicyAcknowledged(localStorage.getItem(COOKIE_POLICY_KEY))); }
    catch { setVisible(true); }
    const open = () => {
      returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setVisible(true);
      requestAnimationFrame(() => confirm.current?.focus());
    };
    window.addEventListener(COOKIE_SETTINGS_EVENT, open);
    return () => window.removeEventListener(COOKIE_SETTINGS_EVENT, open);
  }, []);
  if (!visible) return null;
  return <aside className="cookie-banner" aria-labelledby="cookie-heading">
    <div><h2 id="cookie-heading">Les cookies sur BOTTT</h2><p>Nous utilisons uniquement les cookies nécessaires à la connexion. Aucun cookie publicitaire ou de mesure d’audience.</p><Link href="/cookies">Lire la politique de cookies</Link></div>
    <button ref={confirm} type="button" className="button secondary compact" onClick={() => {
      try { localStorage.setItem(COOKIE_POLICY_KEY, cookiePolicyAcknowledgement()); } catch { /* Browsing remains available when storage is disabled. */ }
      setVisible(false);
      returnFocus.current?.focus();
    }}>Valider la politique</button>
  </aside>;
}
