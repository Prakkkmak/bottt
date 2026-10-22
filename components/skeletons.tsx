import type { CSSProperties } from 'react';

/** A grey placeholder of a given size that shimmers while the page loads. */
function Bone({ width = '100%', height = 14, round = false, style }: { width?: number | string; height?: number | string; round?: boolean; style?: CSSProperties }) {
  return <span className={`bone ${round ? 'round' : ''}`} style={{ width, height, ...style }} />;
}

/** The page's real title shows at once; the rest of the page fades in as placeholders when loading takes a moment. */
function Loading({ title, intro, action, heading = '', children }: { title: string; intro?: string; action?: boolean; heading?: string; children: React.ReactNode }) {
  return <div className="page-loading">
    <p className="sr-only" role="status">Chargement de la page…</p>
    <div className={`page-heading ${heading}`}><div><h1>{title}</h1>{intro && <p>{intro}</p>}</div>{action && <Bone width={160} height={40} />}</div>
    <div className="page-loading-body" aria-hidden="true">{children}</div>
  </div>;
}

function SessionRow({ open = false }: { open?: boolean }) {
  return <div className={`session-accordion skeleton-card ${open ? 'is-open' : ''}`}>
    <div className="session-row session-toggle">
      <Bone width={58} height={76} />
      <span className="skeleton-lines"><Bone width="55%" height={22} /><Bone width="38%" /></span>
      <Bone width={110} height={18} />
    </div>
    {open && <div className="skeleton-circle"><Bone width="min(100%, 310px)" height="auto" round style={{ aspectRatio: 1 }} /></div>}
  </div>;
}

export function DashboardLoading() {
  return <Loading title="La prochaine session" heading="lobby-heading">
    <SessionRow open />
    <div className="upcoming-section">
      <div className="list-heading"><Bone width="min(200px, 45%)" height={24} /><Bone width="min(190px, 40%)" height={40} /></div>
      <div className="session-list"><SessionRow /><SessionRow /></div>
    </div>
  </Loading>;
}

export function ProfileLoading() {
  return <Loading title="Mon profil" intro="Juste ce qu’il faut pour faire connaissance.">
    <div className="profile-editor"><div className="panel stack">
      <div className="skeleton-inline"><Bone width={52} height={52} round /><span className="skeleton-lines"><Bone width={180} height={24} /><Bone width={130} /></span></div>
      <Bone width={220} height={34} />
      <Bone height={46} /><Bone height={86} /><Bone width="70%" height={70} /><Bone width={200} height={46} />
    </div></div>
  </Loading>;
}

export function InvitationsLoading() {
  return <Loading title="Inviter">
    <div className="invitation-layout">{[0, 1].map(i => <div key={i} className="panel invitation-main skeleton-centered">
      <Bone width={56} height={56} round /><Bone width="60%" height={28} /><Bone width="80%" /><Bone width="70%" /><Bone width={180} height={46} />
    </div>)}</div>
  </Loading>;
}

export function OrganiserLoading() {
  return <Loading title="Organiser" action>
    <div className="admin-stats">{[0, 1, 2].map(i => <Bone key={i} width={170} height={22} />)}</div>
    <div className="skeleton-tabs">{[0, 1, 2].map(i => <Bone key={i} width={110} height={20} />)}</div>
    <div className="skeleton-rows">{[0, 1, 2, 3].map(i => <div key={i} className="skeleton-inline"><Bone width={58} height={76} /><span className="skeleton-lines"><Bone width="45%" height={20} /><Bone width="65%" /></span></div>)}</div>
  </Loading>;
}

export function TextLoading() {
  return <div className="page-loading">
    <p className="sr-only" role="status">Chargement de la page…</p>
    <div className="page-loading-body skeleton-text" aria-hidden="true"><Bone width="65%" height={34} />{[92, 100, 84, 96, 70].map((width, i) => <Bone key={i} width={`${width}%`} />)}</div>
  </div>;
}
