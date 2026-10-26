import type { GameSession } from './types';
import { sessionName } from './utils';

export const siteName = 'Blood on the Tanguy Tower';
export const siteShortName = 'BOTTT';
const contactEmail = 'bonjour@bottt.fr';
export const guidePath = '/blood-on-the-clocktower';

/** The address search engines and link previews should credit, as in the e-mails. It falls back to Vercel's production domain, and never throws: the layout builds a URL from it. */
export function siteOrigin() {
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const candidates = [process.env.NEXT_PUBLIC_SITE_URL, production && `https://${production}`].map(url => url?.trim().replace(/\/+$/, ''));
  return candidates.find(url => url && /^https?:\/\//.test(url) && URL.canParse(url)) || 'http://127.0.0.1:3000';
}
/** Only the production site is offered to search engines; Vercel previews stay out of their results. */
export const indexable = () => !process.env.VERCEL_ENV || process.env.VERCEL_ENV === 'production';

export const homeTitle = 'Blood on the Clocktower à Brest — Blood on the Tanguy Tower';
export const homeDescription = 'Soirées Blood on the Clocktower à Brest, ouvertes aux débutants. Un jeu de bluff et de déduction sociale, cousin du Loup-Garou : réserve ta place en ligne.';
/** The picture shown when a page is shared. It lives in public/: a page's own openGraph would drop an app/opengraph-image file. */
export const shareImage = { url: '/og-image.png', width: 1200, height: 630, alt: 'La Tour Tanguy dorée et « Blood on the Clocktower à Brest »' };
/** Shared by every page that sets its own Open Graph fields, since a page's openGraph replaces the layout's. */
export const openGraphBase = { type: 'website', locale: 'fr_FR', siteName, images: shareImage } as const;
/** Title, description, canonical link and sharing card of a public page. */
export function pageMetadata(title: string, description: string, path: string) {
  return { title, description, alternates: { canonical: path }, openGraph: { ...openGraphBase, title, description, url: path } };
}
/** The robots field of account pages and redirects: nothing on them is meant to be found through a search. */
export const privatePage = { index: false, follow: true } as const;

/** JSON for a <script type="application/ld+json">: organizer-typed names cannot close the tag. */
export const serializeJsonLd = (data: object) => JSON.stringify(data).replace(/</g, '\\u003c');

const brest = { '@type': 'PostalAddress', addressLocality: 'Brest', addressRegion: 'Bretagne', addressCountry: 'FR' } as const;

function eventName(s: GameSession) {
  const name = sessionName(s);
  if (/clocktower/i.test(name)) return name;
  return s.title.trim() ? `${name} · Blood on the Clocktower` : `Blood on the Clocktower : ${name}`;
}

/** The public games still to come, for search engines, located in Brest without their private address. A cancelled one stays listed as cancelled, so a search that picked it up does not keep it as planned. */
export function sessionEvents(sessions: GameSession[], origin: string, now = Date.now()) {
  const organizer = { '@type': 'Organization', name: siteName, url: origin };
  return sessions.filter(s => s.visibility === 'public' && Date.parse(s.ends_at) > now).map(s => ({
    '@type': 'Event',
    name: eventName(s),
    description: `Partie de Blood on the Clocktower à Brest sur le script ${s.script}, ouverte aux débutants comme aux habitués.`,
    startDate: s.starts_at,
    endDate: s.ends_at,
    eventStatus: s.status === 'cancelled' ? 'https://schema.org/EventCancelled' : 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: { '@type': 'Place', name: s.location, address: brest },
    image: [`${origin}${shareImage.url}`],
    organizer,
    url: `${origin}/?partie=${encodeURIComponent(s.id)}`,
    inLanguage: 'fr',
    maximumAttendeeCapacity: s.capacity,
    remainingAttendeeCapacity: Math.max(0, s.capacity - s.confirmed_count)
  }));
}

/** Who runs the site and what it is about, with the games to come. */
export function homeJsonLd(sessions: GameSession[], origin: string, now = Date.now()) {
  const organization = `${origin}/#organization`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebSite', '@id': `${origin}/#website`, name: siteName, alternateName: siteShortName, url: origin, inLanguage: 'fr-FR', publisher: { '@id': organization } },
      {
        '@type': 'Organization', '@id': organization, name: siteName, alternateName: siteShortName, url: origin,
        logo: `${origin}/apple-touch-icon.png`, email: contactEmail,
        description: 'Un groupe de joueurs de Blood on the Clocktower à Brest, ouvert aux débutants comme aux habitués.',
        address: brest, areaServed: { '@type': 'City', name: 'Brest' },
        knowsAbout: ['Blood on the Clocktower', 'Jeux de déduction sociale', 'Jeux de bluff', 'Loup-Garou']
      },
      ...sessionEvents(sessions, origin, now)
    ]
  };
}

/** Questions answered on the guide page, as FAQPage data matching the text shown. */
export function faqJsonLd(questions: { question: string; answer: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: questions.map(({ question, answer }) => ({ '@type': 'Question', name: question, acceptedAnswer: { '@type': 'Answer', text: answer } }))
  };
}
