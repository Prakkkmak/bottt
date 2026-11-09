'use client';
import { Bell, Lock, Save } from 'lucide-react';
import { useAction, Feedback } from './action-feedback';
import { saveNotificationChoices } from '@/app/actions';
import { alwaysSent, notificationChoices, type NotificationChoices } from '@/lib/notification-choices';

/** The e-mails a player chooses, on their profile page. E-mails link here, at #notifications. ready is false while the
 * choices cannot be read, such as before their migration: they are shown with their defaults and cannot be saved yet. */
export function NotificationSettings({ choices, ready, organizer }: { choices: NotificationChoices; ready: boolean; organizer: boolean }) {
  const a = useAction();
  // An organizer's own switch is kept as it is for an account that no longer sees it.
  const shown = notificationChoices.filter(c => !c.organizersOnly || organizer);
  return <form id="notifications" className="panel stack notification-settings" onSubmit={e => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const values = Object.fromEntries(notificationChoices.map(c => [c.kind, shown.includes(c) ? f.get(c.kind) === 'on' : choices[c.kind]]));
    a.run(() => saveNotificationChoices(values));
  }}>
    <div className="notification-intro">
      <h2><Bell size={19} aria-hidden />Mes notifications</h2>
      <p className="muted">Les e-mails que BOTTT t’envoie. Coche ceux que tu veux recevoir.</p>
    </div>
    {!ready && <p className="alert info" role="status">Le choix des notifications arrive dans quelques minutes. En attendant, tu reçois les e-mails cochés ci-dessous.</p>}
    <fieldset className="notification-options">
      <legend className="sr-only">E-mails au choix</legend>
      {shown.map(c => <label key={c.kind} className="notification-option">
        <input type="checkbox" name={c.kind} defaultChecked={choices[c.kind]} />
        <span><strong>{c.label}</strong><small>{c.detail}</small></span>
      </label>)}
    </fieldset>
    <div className="notification-always"><Lock size={15} aria-hidden /><p><strong>Toujours envoyés :</strong> {alwaysSent.join(', ')}. Ils te disent si et où venir.</p></div>
    <button className="button primary" disabled={a.pending || !ready}><Save size={17} />Enregistrer mes choix</button>
    <Feedback result={a.result} />
  </form>;
}
