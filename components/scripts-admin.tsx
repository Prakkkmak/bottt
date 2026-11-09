'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Pencil, Plus, ScrollText, Trash2, Upload } from 'lucide-react';
import type { GameSession } from '@/lib/types';
import { baseScripts, readScriptTool, scriptPagePath, type CustomScript } from '@/lib/scripts';
import type { CharacterChoice, Edition, Team } from '@/lib/characters';
import { deleteScript, saveScript } from '@/app/actions';
import { Dialog } from './dialog';
import { Feedback, useAction } from './action-feedback';

const teamLabels: Record<Team, string> = { townsfolk: 'Villageois', outsider: 'Marginaux', minion: 'Sbires', demon: 'Démons', traveller: 'Voyageurs', fabled: 'Légendaires', loric: 'Lorics' };
const editionLabels: Record<Edition, string> = { tb: 'Trouble Brewing', bmr: 'Bad Moon Rising', snv: 'Sects & Violets', carousel: 'Carrousel', other: 'Autres' };
const rolesLabel = (n: number) => n ? `${n} rôle${n > 1 ? 's' : ''}` : 'Rôles à compléter';
const gamesLabel = (n: number) => n ? `${n} partie${n > 1 ? 's' : ''} à venir` : 'Aucune partie à venir';

/** The scripts a game picks from: the base box's three, always there, and the circle's own, which organizers add, edit and remove. */
export function ScriptsAdmin({ scripts, characters, sessions }: { scripts: CustomScript[]; characters: CharacterChoice[]; sessions: GameSession[] }) {
  const [editing, setEditing] = useState<CustomScript | 'new' | null>(null);
  const [removal, setRemoval] = useState<CustomScript | null>(null);
  const a = useAction();
  const open = <T,>(set: (value: T) => void, value: T) => { a.setResult(null); set(value); };
  const upcoming = (name: string) => sessions.filter(s => s.script === name && s.status === 'published' && new Date(s.starts_at) > new Date()).length;
  return <>
    <Feedback result={a.result} />
    <div className="panel venue-panel">
      <div className="panel-heading"><h2><ScrollText size={20} />Vos scripts</h2><button className="button secondary compact" onClick={() => open(setEditing, 'new')}><Plus size={16} />Ajouter un script</button></div>
      <p className="muted">Une partie choisit son script dans cette liste. Chaque script a sa page dans « Apprendre », avec ses rôles, pour que chacun puisse lire la fiche avant de venir.</p>
      {baseScripts.map(s => <div className="member-row venue-row" key={s.slug}>
        <span className="venue-icon" aria-hidden="true"><ScrollText size={18} /></span>
        <div><h3><Link href={scriptPagePath(s.slug)}>{s.name}</Link></h3><p>Script de la boîte de base</p></div>
        <span className="badge">{gamesLabel(upcoming(s.name))}</span>
      </div>)}
      {scripts.map(s => <div className="member-row venue-row" key={s.id}>
        <span className="venue-icon" aria-hidden="true"><ScrollText size={18} /></span>
        <div><h3><Link href={scriptPagePath(s.slug)}>{s.name}</Link></h3><p>{[s.author && `par ${s.author}`, rolesLabel(s.characters.length)].filter(Boolean).join(' · ')}</p></div>
        <span className="badge">{gamesLabel(upcoming(s.name))}</span>
        <div className="row-actions"><button aria-label={`Modifier ${s.name}`} className="icon-btn" onClick={() => open(setEditing, s)}><Pencil size={17} /></button><button aria-label={`Supprimer ${s.name}`} className="icon-btn" onClick={() => open(setRemoval, s)}><Trash2 size={17} /></button></div>
      </div>)}
    </div>
    <Dialog title={editing === 'new' ? 'Ajouter un script' : 'Modifier le script'} open={editing !== null} onClose={() => setEditing(null)} wide guard>{editing && <ScriptForm script={editing === 'new' ? undefined : editing} characters={characters} games={editing === 'new' ? 0 : upcoming(editing.name)} onSaved={() => setEditing(null)} />}</Dialog>
    <Dialog title="Supprimer ce script ?" open={!!removal} onClose={() => setRemoval(null)}><div className="stack">
      <p>« {removal?.name} » disparaîtra de la liste des scripts et sa page ne sera plus disponible. Les parties qui le jouent gardent son nom{removal && upcoming(removal.name) > 0 && ` (${gamesLabel(upcoming(removal.name)).toLowerCase()})`}, sans lien vers ses rôles.</p>
      <div className="button-row"><button className="button secondary" onClick={() => setRemoval(null)}>Garder le script</button><button className="button danger" disabled={a.pending} onClick={() => removal && a.run(() => deleteScript(removal.id), () => setRemoval(null))}><Trash2 size={16} />Supprimer le script</button></div>
      <Feedback result={a.result} />
    </div></Dialog>
  </>;
}

function ScriptForm({ script, characters, games, onSaved }: { script?: CustomScript; characters: CharacterChoice[]; games: number; onSaved: () => void }) {
  const a = useAction();
  const [name, setName] = useState(script?.name ?? '');
  const [author, setAuthor] = useState(script?.author ?? '');
  const known = useMemo(() => new Set(characters.map(c => c.id)), [characters]);
  // A role the site no longer knows (renamed in the wiki since) has no box to untick: it is left out, so the script still saves.
  const [picked, setPicked] = useState<string[]>(() => (script?.characters ?? []).filter(id => known.has(id)));
  const [filter, setFilter] = useState('');
  const [edition, setEdition] = useState<Edition | ''>('');
  const [onlyPicked, setOnlyPicked] = useState(false);
  const [imported, setImported] = useState<{ ok: boolean; message: string } | null>(null);
  const query = filter.trim().toLocaleLowerCase('fr');
  const shown = characters.filter(c => (!onlyPicked || picked.includes(c.id)) && (!edition || c.edition === edition) && (!query || c.name.toLocaleLowerCase('fr').includes(query) || c.name_en.toLowerCase().includes(query)));
  const groups = (Object.keys(teamLabels) as Team[]).map(team => ({ team, list: shown.filter(c => c.team === team).sort((x, y) => x.name.localeCompare(y.name, 'fr')) })).filter(g => g.list.length);
  const toggle = (id: string) => setPicked(list => list.includes(id) ? list.filter(x => x !== id) : [...list, id]);
  const importScript = (text: string) => {
    try {
      const found = readScriptTool(text, known);
      setPicked(found.characters);
      if (found.name && !name.trim()) setName(found.name.slice(0, 100));
      if (found.author && !author.trim()) setAuthor(found.author.slice(0, 100));
      const left = found.unknown.length ? ` Personnages ignorés, inconnus du site : ${found.unknown.join(', ')}.` : '';
      setImported({ ok: true, message: `${rolesLabel(found.characters.length)} importé${found.characters.length > 1 ? 's' : ''}.${left}` });
    } catch (e) { setImported({ ok: false, message: e instanceof Error ? e.message : 'Ce script n’a pas pu être lu.' }); }
  };
  return <form className="stack script-form" onSubmit={e => { e.preventDefault(); a.run(() => saveScript({ ...(script ? { id: script.id } : {}), name, author, characters: picked }), onSaved); }}>
    <div className="form-grid">
      <label className="field">Nom du script<input name="name" required minLength={2} maxLength={100} value={name} onChange={e => setName(e.target.value)} autoFocus data-autofocus /></label>
      <label className="field">Auteur · facultatif<input name="author" maxLength={100} value={author} onChange={e => setAuthor(e.target.value)} /></label>
    </div>
    {games > 0 && <p className="field-note">Un nouveau nom suit les parties qui jouent ce script ({gamesLabel(games).toLowerCase()}), sans message aux inscrits.</p>}
    <details className="disclosure"><summary><span><Upload size={16} />Importer depuis l’outil de script officiel</span></summary><div className="stack">
      <label className="field">Script au format JSON <span className="field-note">Dans l’outil de script officiel, télécharge ou copie le script en JSON, puis colle-le ici : ses personnages sont cochés ci-dessous.</span><textarea name="import" rows={4} placeholder='[{"id":"_meta","name":"Mon script"},"washerwoman","imp"]' onChange={() => setImported(null)} /></label>
      <div className="button-row"><button type="button" className="button secondary compact" onClick={e => importScript((e.currentTarget.form?.elements.namedItem('import') as HTMLTextAreaElement | null)?.value ?? '')}>Importer</button></div>
      {imported && <p className={`alert ${imported.ok ? '' : 'error'}`} role={imported.ok ? 'status' : 'alert'}>{imported.message}</p>}
    </div></details>
    <input type="hidden" name="characters" value={picked.join(',')} />
    <fieldset className="form-section role-picker"><legend>Les rôles · {picked.length} choisi{picked.length > 1 ? 's' : ''}</legend>
      <div className="form-grid">
        <label className="field">Chercher un rôle<input type="search" value={filter} onChange={e => setFilter(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }} placeholder="Lavandière, Imp…" /></label>
        <label className="field">Module<select value={edition} onChange={e => setEdition(e.target.value as Edition | '')}><option value="">Tous les modules</option>{(Object.keys(editionLabels) as Edition[]).map(id => <option key={id} value={id}>{editionLabels[id]}</option>)}</select></label>
      </div>
      <label className="check-field"><input type="checkbox" checked={onlyPicked} onChange={e => setOnlyPicked(e.target.checked)} />Seulement les rôles choisis</label>
      {groups.length ? groups.map(g => <fieldset key={g.team} className="role-group"><legend>{teamLabels[g.team]}</legend><div className="role-options">
        {g.list.map(c => <label key={c.id} className="check-field"><input type="checkbox" checked={picked.includes(c.id)} onChange={() => toggle(c.id)} /><span>{c.name}{c.name !== c.name_en && <small lang="en"> · {c.name_en}</small>}</span></label>)}
      </div></fieldset>) : <p className="muted">{onlyPicked && !picked.length ? 'Aucun rôle choisi pour l’instant.' : 'Aucun rôle ne correspond à cette recherche.'}</p>}
    </fieldset>
    <Feedback result={a.result} /><button className="button primary full" disabled={a.pending}>{a.pending ? 'Enregistrement…' : script ? 'Enregistrer le script' : 'Ajouter le script'}</button>
  </form>;
}
