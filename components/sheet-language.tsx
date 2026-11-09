import Link from 'next/link';

/** The language of the role sheets: French by default, English as the official sheets are printed. */
export type SheetLanguage = 'fr' | 'en';
/** ?lang=en asks for English; anything else is French. */
export const sheetLanguage = (value: string | string[] | undefined): SheetLanguage => value === 'en' ? 'en' : 'fr';

/**
 * Two links to the same page in each language: the address says the language, so a link can be shared, the page is
 * rendered in the right order from the start, and nothing is stored on the device.
 */
export function LanguageSwitch({ path, language }: { path: string; language: SheetLanguage }) {
  return <nav className="language-switch" aria-label="Langue des fiches">
    <Link href={path} scroll={false} prefetch={false} aria-current={language === 'fr' ? 'true' : undefined}>En français</Link>
    <Link href={`${path}?lang=en`} scroll={false} prefetch={false} lang="en" hrefLang="en" aria-current={language === 'en' ? 'true' : undefined}>In English</Link>
  </nav>;
}
