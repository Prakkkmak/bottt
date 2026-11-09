'use client';
import { useEffect, useState, type ReactNode } from 'react';

type Language = 'fr' | 'en';
const key = 'bottt-sheet-language';

/**
 * The sheets of a page in French or in English, as the official ones are printed in English: both texts are in the page,
 * and this only says which one shows. The choice stays on this device; without it, or without script, French shows.
 */
export function SheetLanguage({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>('fr');
  useEffect(() => {
    try { if (localStorage.getItem(key) === 'en') setLanguage('en'); } catch { /* storage refused: French */ }
  }, []);
  const choose = (value: Language) => {
    setLanguage(value);
    try { localStorage.setItem(key, value); } catch { /* the choice lasts for this page only */ }
  };
  return <div className="sheet-language" data-lang={language}>
    <div className="session-tabs sheet-tabs" role="group" aria-label="Langue des fiches">
      {(['fr', 'en'] as const).map(value => <button key={value} type="button" aria-pressed={language === value} className={language === value ? 'selected' : ''} lang={value === 'en' ? 'en' : undefined} onClick={() => choose(value)}>{value === 'fr' ? 'En français' : 'In English'}</button>)}
    </div>
    {children}
  </div>;
}
