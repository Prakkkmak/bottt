# Invités et voyageurs — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** permettre à un membre d'amener des personnes sans compte, limiter les voyageurs (anciens « nouveaux ») aux places voyageurs avec validation, et afficher qui a invité qui.

**Architecture :**
- Un invité est une ligne de `bookings` sans `user_id`, avec `guest_name` et `sponsor_id`. Il réutilise donc tel quel le moteur existant : verrous, quotas, jetons, liste d'attente.
- Toutes les règles vivent dans des fonctions PostgreSQL `security definer`, ajoutées par une migration unique. L'interface Next.js s'appuie sur une petite bibliothèque pure, `lib/guests.ts`, testée sans navigateur.

**Tech Stack :** Next.js 16 (App Router, server actions), React 19, Supabase (PostgreSQL, RLS, PostgREST), Zod 4, lucide-react, tests `node:test` via `tsx`, PGlite pour le SQL.

**Spec :** `docs/superpowers/specs/2026-10-12-invites-voyageurs-design.md` (à lire avant toute tâche).

## Avant de commencer

1. L'arbre de travail contient des modifications non commitées de l'utilisateur dans 15 fichiers, dont `components/admin.tsx`, `components/session-detail.tsx`, `lib/types.ts` et `lib/fixtures.ts`. Le code de ce plan est écrit **par-dessus ces modifications**. Demande à l'utilisateur de les commiter, sans le faire à sa place. Ensuite seulement, crée la branche : `git switch -c feat/invites-voyageurs`.
2. `pnpm install`, puis vérifie que `pnpm test` passe avant de toucher quoi que ce soit.
3. Pile locale pour les vérifications manuelles : `pnpm local:up`, `pnpm local:migrate`, `pnpm local:seed`, `pnpm dev`. Les codes de connexion arrivent dans http://127.0.0.1:54324. Comptes :
   - camille@cercle.test : organisatrice ;
   - lea@cercle.test et thomas@cercle.test : membres ;
   - maxime@cercle.test : voyageur.

## Global Constraints

- Node ≥ 22, pnpm, aucune nouvelle dépendance.
- Next.js 16 : avant d'utiliser une API Next que le projet n'emploie pas encore, lire `node_modules/next/dist/docs/`. Ce plan n'en introduit aucune.
- Une seule migration, nouvelle et additive : `supabase/migrations/202610120005_guests.sql`.
  - Ne jamais modifier une migration existante.
  - Chaque fonction existante garde exactement sa signature.
  - Chaque nouvelle fonction reçoit `revoke execute … from public,anon,authenticated` puis `grant execute … to authenticated,service_role`.
- Noms en base inchangés :
  - `pool = 'circle'` désigne les places membres, `pool = 'newcomer'` les places voyageurs ;
  - `membership = 'newcomer'` désigne un voyageur.
- `MAX_GUESTS_PER_PERSON = 2` dans `lib/session-rules.ts`, qui reproduit le littéral `2` de `public.add_guest`.
- Un prénom d'invité fait de 2 à 40 caractères, espaces consécutifs réduits à un seul. Il devient `Invité·e` 30 jours après la fin de la soirée.
- Textes en français, en écriture inclusive avec le point médian (`invité·e`, `voyageur·se`) et l'apostrophe typographique `’`, dans l'interface comme dans les chaînes SQL.
- Commentaires de code en anglais. Respecter le style du fichier modifié.

## Review Focus

1. **Deux parrains amènent chacun un « Paul ».** Les deux sont acceptés et se distinguent par « invité·e de X ». Testé dans la tâche 2.
2. **Prénom saisi avec des espaces en trop ou des accents** (`'  Marie   Hélène  '`). Il est enregistré `Marie Hélène`, accents conservés. Testé dans la tâche 1.
3. **Après la réunion des quotas**, l'invité d'un membre prend n'importe quelle place libre, même une place voyageur. Testé dans la tâche 1.
4. **Réduction de la capacité sous le nombre de places prises, invités compris.** Elle est refusée. Testé dans la tâche 4.
5. **Passage d'une session en « membres » quand seuls des invités de membres sont inscrits.** Il est accepté. Testé dans la tâche 4.

## Fichiers

| Fichier | Rôle |
|---|---|
| `supabase/migrations/202610120005_guests.sql` (créé) | Schéma, droits et fonctions des invités |
| `tests/sql-harness.ts` (créé) | Base PGlite neuve avec un faux schéma `auth` et toutes les migrations appliquées |
| `tests/sql-guests-*.test.ts` (créés) | Règles SQL, un fichier et une base par tâche |
| `lib/guests.ts` (créé) | Logique pure : libellés, action d'un +, regroupements, suggestions, accès à l'adresse |
| `tests/guests.test.ts` (créé) | Tests de `lib/guests.ts` |
| `components/guest-dialog.tsx` (créé) | Formulaire « Qui t'accompagne ? » |
| `components/session-guests.tsx` (créé) | Bloc « Tes invités » |
| `lib/types.ts`, `lib/session-rules.ts`, `lib/schemas.ts` | Types, constante, validation du prénom |
| `app/actions.ts`, `app/page.tsx`, `app/api/calendar/[id]/route.ts` | Actions serveur et accès à l'adresse |
| `components/tableau.tsx` | Jetons : anneau voyageur, maillon, invités cliquables |
| `components/session-detail.tsx`, `session-card.tsx`, `dashboard.tsx` | Parcours joueur |
| `components/admin.tsx`, `session-form.tsx` | Parcours organisateur |
| `components/invitations.tsx`, `profile.tsx`, `app/(legal)/*` | Page Inviter, profil, textes légaux |
| `lib/fixtures.ts`, `scripts/seed.ts`, `README.md`, `tests/local-integration.ts` | Démo, seed, documentation, intégration |

---

### Task 1 : schéma, droits et `add_guest`

**Files :**
- Create: `supabase/migrations/202610120005_guests.sql`
- Create: `tests/sql-harness.ts`
- Create: `tests/sql-guests-add.test.ts`
- Modify: `lib/session-rules.ts`

**Interfaces :**
- Produces :
  - `public.add_guest(p_session uuid, p_name text, p_seat integer default null) → text`, qui renvoie `'confirmed' | 'waitlisted' | 'pending'` ;
  - les colonnes `bookings.guest_name` et `bookings.sponsor_id` ;
  - `MAX_GUESTS_PER_PERSON` ;
  - `createDatabase()` et `uuid(n)` dans `tests/sql-harness.ts`.

- [ ] **Step 1 : ajouter la constante**

Dans `lib/session-rules.ts`, ajouter à la fin :

```ts
/** Mirrors the limit enforced by public.add_guest. */
export const MAX_GUESTS_PER_PERSON = 2;
```

- [ ] **Step 2 : créer le harnais SQL**

`tests/sql-harness.ts` :

```ts
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

export const uuid=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
type Membership='newcomer'|'member'|'organizer'|'suspended';
type SessionOptions={capacity?:number;travellerSeats?:number;startsIn?:string;visibility?:'public'|'members';releaseHours?:number};

/** Fresh in-memory database with a minimal Supabase auth schema and every migration applied. */
export async function createDatabase(){
  const db=new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
  create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
  create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id) on delete cascade,created_at timestamptz default now(),not_after timestamptz);
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
  grant usage on schema auth to anon,authenticated,service_role;
  grant execute on all functions in schema auth to anon,authenticated,service_role;`);
  const migrations=new URL('../supabase/migrations/',import.meta.url);
  for(const name of (await readdir(migrations)).filter(n=>n.endsWith('.sql')).sort())await db.exec(await readFile(new URL(name,migrations),'utf8'));
  async function root(){await db.exec(`reset role; select set_config('request.jwt.claim.sub','',false); select set_config('request.jwt.claims','{}',false);`);}
  async function login(n:number){await root();await db.query(`select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)`,[uuid(n),JSON.stringify({sub:uuid(n),session_id:uuid(n+1000)})]);await db.exec('set role authenticated');}
  async function anonymous(){await root();await db.exec('set role anon');}
  async function user(n:number,membership:Membership='member'){
    await root();
    await db.query(`insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),$3)`,[uuid(n),`test${n}@cercle.test`,JSON.stringify({display_name:`Joueur ${n}`})]);
    await db.query(`insert into auth.sessions(id,user_id) values($1,$2)`,[uuid(n+1000),uuid(n)]);
    await db.query('update public.profiles set membership=$1 where id=$2',[membership,uuid(n)]);
  }
  async function session(id:string,{capacity=8,travellerSeats=2,startsIn='10 days',visibility='public',releaseHours=72}:SessionOptions={}){
    await root();
    await db.query(`insert into public.sessions(id,title,script,starts_at,ends_at,location,capacity,newcomer_seats,release_hours,visibility,created_by)
      values($1,'Soirée de test','Trouble Brewing',now()+$2::interval,now()+$2::interval+interval '4 hours','Brest',$3,$4,$5,$6,$7)`,[id,startsIn,capacity,travellerSeats,releaseHours,visibility,uuid(1)]);
  }
  async function call<T=Record<string,unknown>>(sql:string,params:unknown[]=[]){return (await db.query<T>(sql,params)).rows;}
  return {db,root,login,anonymous,user,session,call};
}
```

- [ ] **Step 3 : écrire le test qui échoue**

`tests/sql-guests-add.test.ts` :

```ts
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDatabase,uuid} from './sql-harness';
import {MAX_GUESTS_PER_PERSON} from '../lib/session-rules';

type Row={guest_name:string|null;sponsor_id:string|null;user_id:string|null;status:string;pool:string;seat_index:number|null};

test('Ajout des invités',async t=>{
  const h=await createDatabase();
  await h.user(1,'organizer');await h.user(2);await h.user(3);await h.user(4,'newcomer');await h.user(5);await h.user(6);
  const game=uuid(100);await h.session(game,{capacity:8,travellerSeats:2});
  const rows=async(id=game)=>{await h.root();return h.call<Row>('select guest_name,sponsor_id,user_id,status,pool,seat_index from bookings where session_id=$1 order by created_at,id',[id]);};
  const add=async(id:string,name:string,seat?:number)=>(await h.call<{add_guest:string}>(seat===undefined?'select add_guest($1,$2)':'select add_guest($1,$2,$3)',seat===undefined?[id,name]:[id,name,seat]))[0].add_guest;

  await t.test('un membre place un invité d’office, au jeton choisi, sur une place membre',async()=>{
    await h.login(2);
    assert.equal(await add(game,'  Paul  ',5),'confirmed');
    assert.deepEqual((await rows())[0],{guest_name:'Paul',sponsor_id:uuid(2),user_id:null,status:'confirmed',pool:'circle',seat_index:5});
  });
  await t.test('un double clic avec le même prénom ne crée pas un second invité',async()=>{
    await h.login(2);
    assert.equal(await add(game,'paul',6),'confirmed');
    assert.equal((await rows()).length,1);
  });
  await t.test(`un parrain amène au plus ${MAX_GUESTS_PER_PERSON} personnes par partie`,async()=>{
    await h.login(2);
    for(let i=1;i<MAX_GUESTS_PER_PERSON;i++)await add(game,`Ami ${i}`);
    await assert.rejects(add(game,'Un de trop'),/déjà 2 personnes/);
  });
  await t.test('le prénom et le jeton sont contrôlés',async()=>{
    await h.login(3);
    for(const name of ['A','x'.repeat(41),'   '])await assert.rejects(add(game,name),/2 à 40 caractères/);
    for(const seat of [-1,8])await assert.rejects(add(game,'Marie',seat),/place est invalide/);
    await assert.rejects(add(game,'Marie',5),/vient d’être prise/);
  });
  await t.test('le prénom est nettoyé sans perdre ses accents',async()=>{
    await h.login(5);
    await add(game,'  Marie   Hélène  ');
    assert.ok((await rows()).some(r=>r.guest_name==='Marie Hélène'&&r.sponsor_id===uuid(5)));
  });
  await t.test('un voyageur et son ami attendent la validation, sans jeton, sur les places voyageurs',async()=>{
    // Seats 0 and 1 went to « Ami 1 » and « Marie Hélène » (first free tokens), seat 5 to Paul.
    await h.login(4);
    assert.equal((await h.call<{book_circle_seat:string}>('select book_circle_seat($1,2)',[game]))[0].book_circle_seat,'pending');
    assert.equal(await add(game,'Nora',3),'pending');
    const nora=(await rows()).find(r=>r.guest_name==='Nora')!;
    assert.deepEqual([nora.status,nora.pool,nora.seat_index],['pending','newcomer',null]);
  });
  await t.test('un parrain lit ses invités, personne d’autre ; personne n’écrit directement',async()=>{
    await h.login(2);
    assert.equal((await h.call('select * from bookings where sponsor_id=$1',[uuid(2)])).length,MAX_GUESTS_PER_PERSON);
    await h.login(6);
    assert.equal((await h.call('select * from bookings')).length,0);
    await assert.rejects(h.call(`insert into bookings(session_id,guest_name,sponsor_id,status,pool) values($1,'Pirate',$2,'confirmed','circle')`,[game,uuid(6)]),/permission denied/);
    await h.anonymous();
    await assert.rejects(h.call('select add_guest($1,$2)',[game,'Visiteur']),/permission denied/);
  });
  await t.test('une session réservée aux membres reste fermée aux voyageurs et à leurs amis',async()=>{
    const closed=uuid(101);await h.session(closed,{visibility:'members'});
    await h.login(4);
    await assert.rejects(add(closed,'Nora'),/inaccessible/);
    await h.login(3);
    assert.equal(await add(closed,'Lou'),'confirmed');
  });
  await t.test('l’invité d’un membre attend son tour quand les places membres sont prises',async()=>{
    const small=uuid(102);await h.session(small,{capacity:7,travellerSeats:5});
    await h.login(3);
    assert.equal((await h.call<{book_session:string}>('select book_session($1)',[small]))[0].book_session,'confirmed');
    assert.equal(await add(small,'Yann'),'confirmed');
    assert.equal(await add(small,'Zoé'),'waitlisted');
  });
  await t.test('après la réunion des quotas, l’invité d’un membre prend n’importe quelle place libre',async()=>{
    const merged=uuid(103);await h.session(merged,{capacity:7,travellerSeats:6,startsIn:'1 day',releaseHours:72});
    await h.login(6);
    assert.equal((await h.call<{book_session:string}>('select book_session($1)',[merged]))[0].book_session,'confirmed');
    assert.equal(await add(merged,'Basile'),'confirmed');
  });
  await t.test('les inscriptions closes refusent les invités',async()=>{
    const soon=uuid(104);await h.session(soon,{startsIn:'20 minutes'});
    await h.login(3);
    await assert.rejects(add(soon,'Tard'),/closes/);
  });
  await t.test('le parrain d’un invité confirmé voit l’adresse, même sans venir',async()=>{
    await h.root();await h.call(`insert into session_addresses values($1,'Adresse de test')`,[game]);
    await h.login(2);
    assert.equal((await h.call('select * from session_addresses')).length,1);
    await h.login(3);
    assert.equal((await h.call('select * from session_addresses')).length,0);
  });
  await h.db.close();
});
```

- [ ] **Step 4 : vérifier que le test échoue**

Run: `pnpm exec tsx --test tests/sql-guests-add.test.ts`
Expected: FAIL avec `function add_guest(...) does not exist`.

- [ ] **Step 5 : créer la migration**

`supabase/migrations/202610120005_guests.sql` :

```sql
-- Guests are bookings without an account, brought by a sponsor who answers for them.
-- sponsor_id references auth.users rather than profiles: a second foreign key to profiles
-- would make the deployed PostgREST embed `profile:profiles(*)` ambiguous.
alter table public.bookings alter column user_id drop not null;
alter table public.bookings add column guest_name text check (guest_name is null or char_length(guest_name) between 2 and 40);
alter table public.bookings add column sponsor_id uuid references auth.users(id) on delete cascade;
alter table public.bookings add constraint bookings_person_or_guest check (
  (user_id is not null and guest_name is null and sponsor_id is null)
  or (user_id is null and guest_name is not null and sponsor_id is not null));
create index bookings_sponsor_idx on public.bookings(sponsor_id,session_id) where sponsor_id is not null;

drop policy bookings_read on public.bookings;
create policy bookings_read on public.bookings for select to authenticated using (
  ((user_id=auth.uid() or sponsor_id=auth.uid()) and public.active_user()) or public.is_organizer());
-- A sponsor passes the address on to the guest, even without attending.
drop policy addresses_read on public.session_addresses;
create policy addresses_read on public.session_addresses for select to authenticated using (
  public.is_organizer() or (public.active_user() and exists(select 1 from public.bookings
    where session_id=session_addresses.session_id and status='confirmed' and (user_id=auth.uid() or sponsor_id=auth.uid()))));

create function public.add_guest(p_session uuid,p_name text,p_seat integer default null) returns text language plpgsql security definer set search_path='' as $$
declare s public.sessions; p public.profiles; existing public.bookings; clean text; guest_pool text; result text; brought integer;
begin
  perform public.rate_guard('guest',20,600);
  select * into p from public.profiles where id=auth.uid();
  select * into s from public.sessions where id=p_session for update;
  if s.id is null or not public.can_see_session(p_session) then raise exception 'Cette session est inaccessible.'; end if;
  if s.status<>'published' or s.starts_at<=now()+interval '30 minutes' then raise exception 'Les inscriptions sont closes.'; end if;
  clean=regexp_replace(trim(coalesce(p_name,'')),'\s+',' ','g');
  if char_length(clean) not between 2 and 40 then raise exception 'Indique un prénom ou un pseudo de 2 à 40 caractères.'; end if;
  if p_seat is not null and (p_seat<0 or p_seat>=s.capacity) then raise exception 'Cette place est invalide.'; end if;
  select * into existing from public.bookings where session_id=p_session and sponsor_id=auth.uid() and lower(guest_name)=lower(clean)
    and status<>'cancelled' order by status='declined' limit 1;
  -- Repeated clicks return the existing guest instead of adding a second one.
  if existing.status in ('pending','confirmed','waitlisted','offered') then return existing.status; end if;
  if existing.status='declined' then raise exception 'Cette personne n’a pas été retenue pour cette partie. Contacte un organisateur.'; end if;
  select count(*) into brought from public.bookings where session_id=p_session and sponsor_id=auth.uid() and status in ('pending','confirmed','waitlisted','offered');
  if brought>=2 then raise exception 'Tu amènes déjà 2 personnes à cette partie.'; end if;
  perform public.rebalance(p_session);
  if p_seat is not null and exists(select 1 from public.bookings where session_id=p_session and seat_index=p_seat and status in ('confirmed','offered')) then
    raise exception 'Cette place vient d’être prise. Choisis un autre +.';
  end if;
  -- A member vouches for the guest; a traveller's friend waits for an organizer like the traveller.
  guest_pool=case when p.membership in ('member','organizer') then 'circle' else 'newcomer' end;
  result=case when guest_pool='newcomer' then 'pending' when public.seat_available(p_session,guest_pool) then 'confirmed' else 'waitlisted' end;
  insert into public.bookings(session_id,guest_name,sponsor_id,status,pool,preferred_seat,seat_index)
    values(p_session,clean,auth.uid(),result,guest_pool,p_seat,case when result='confirmed' then p_seat end);
  return result;
end; $$;
revoke execute on function public.add_guest(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.add_guest(uuid,text,integer) to authenticated,service_role;
```

- [ ] **Step 6 : vérifier que tout passe**

Run: `pnpm exec tsx --test tests/sql-guests-add.test.ts`
Expected: PASS (12 sous-tests).
Run: `pnpm test`
Expected: PASS, y compris l'ancien `tests/database.test.ts`.

- [ ] **Step 7 : commit**

```bash
git add supabase/migrations/202610120005_guests.sql tests/sql-harness.ts tests/sql-guests-add.test.ts lib/session-rules.ts
git commit -m "Add guest bookings with add_guest and sponsor access rules"
```

---

### Task 2 : `list_sessions` affiche invités, statuts et places libres par type

**Files :**
- Modify: `supabase/migrations/202610120005_guests.sql` (ajout à la fin)
- Create: `tests/sql-guests-listing.test.ts`

**Interfaces :**
- Consumes : `add_guest` (tâche 1).
- Produces : dans chaque partie renvoyée par `list_sessions()` :
  - `participants[]` reçoit `role` (`'member' | 'guest' | 'traveller' | 'traveller_guest'`) et `invited_by: string | null` ;
  - `my_guests: {id, name, status, seat_index, offer_expires_at}[]` ;
  - `member_seats_free: number` et `traveller_seats_free: number`.

- [ ] **Step 1 : écrire le test qui échoue**

`tests/sql-guests-listing.test.ts` :

```ts
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDatabase,uuid} from './sql-harness';

test('Affichage des invités dans les parties',async t=>{
  const h=await createDatabase();
  await h.user(1,'organizer');await h.user(2);await h.user(3,'newcomer');await h.user(4);await h.user(5,'newcomer');await h.user(6);
  const game=uuid(100);await h.session(game,{capacity:8,travellerSeats:2});
  const listed=async(id=game)=>(await h.call<{list_sessions:any[]}>('select list_sessions()'))[0].list_sessions.find((s:any)=>s.id===id);
  await h.login(2);await h.call('select book_circle_seat($1,0)',[game]);await h.call('select add_guest($1,$2,$3)',[game,'Paul',1]);
  await h.login(3);await h.call('select book_circle_seat($1,2)',[game]);await h.call('select add_guest($1,$2,$3)',[game,'Nora',3]);
  await h.login(6);await h.call('select add_guest($1,$2,$3)',[game,'Paul',4]);
  // Confirm the traveller's group directly: review rules are covered elsewhere.
  await h.root();await h.call(`update bookings set status='confirmed' where status='pending'`);

  await t.test('chaque participant porte son statut et, s’il a été amené, son parrain',async()=>{
    await h.login(4);
    const people=(await listed()).participants.map((p:any)=>[p.seat_index,p.display_name,p.role,p.invited_by]);
    assert.deepEqual(people,[[0,'Joueur 2','member',null],[1,'Paul','guest','Joueur 2'],[2,'Joueur 3','traveller',null],[3,'Nora','traveller_guest','Joueur 3'],[4,'Paul','guest','Joueur 6']]);
  });
  await t.test('le parrain retrouve ses invités, les autres non',async()=>{
    await h.login(2);
    const mine=(await listed()).my_guests;
    assert.equal(mine.length,1);
    assert.deepEqual({name:mine[0].name,status:mine[0].status,seat_index:mine[0].seat_index,offer_expires_at:mine[0].offer_expires_at},{name:'Paul',status:'confirmed',seat_index:1,offer_expires_at:null});
    assert.equal(typeof mine[0].id,'string');
    await h.login(4);
    assert.deepEqual((await listed()).my_guests,[]);
  });
  await t.test('un visiteur ou un voyageur non inscrit ne voit aucun prénom',async()=>{
    await h.anonymous();
    const visitor=await listed();
    assert.deepEqual([visitor.participants,visitor.my_guests],[[],[]]);
    await h.login(5);
    assert.deepEqual((await listed()).participants,[]);
  });
  await t.test('les places libres sont comptées par type, puis réunies avant la partie',async()=>{
    await h.login(4);
    const g=await listed();
    assert.deepEqual([g.confirmed_count,g.member_seats_free,g.traveller_seats_free],[5,3,0]);
    const merged=uuid(101);await h.session(merged,{capacity:8,travellerSeats:2,startsIn:'1 day',releaseHours:72});
    await h.login(4);await h.call('select book_session($1)',[merged]);
    const m=await listed(merged);
    assert.deepEqual([m.member_seats_free,m.traveller_seats_free],[7,7]);
  });
  await h.db.close();
});
```

- [ ] **Step 2 : vérifier que le test échoue**

Run: `pnpm exec tsx --test tests/sql-guests-listing.test.ts`
Expected: FAIL. `participants` ne contient que les deux comptes, sans `role` : l'ancienne jointure sur `profiles` écarte les invités.

- [ ] **Step 3 : remplacer `list_sessions`**

Ajouter à la fin de la migration. La base est la version de la migration 4 : mêmes exclusions de champs, mêmes `occupied_seats`, `my_seat` et `can_storytell`.

```sql
create or replace function public.list_sessions() returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(payload order by starts_at),'[]'::jsonb) from (
    select s.starts_at, (to_jsonb(s)-'created_by'-'created_at'-'description'-'storyteller') || jsonb_build_object(
      'confirmed_count',used.total_used,
      'waitlist_count',(select count(*) from public.bookings b where b.session_id=s.id and b.status='waitlisted'),
      'occupied_seats',(select coalesce(jsonb_agg(b.seat_index order by b.seat_index),'[]'::jsonb) from public.bookings b where b.session_id=s.id and (b.status='confirmed' or (b.status='offered' and b.offer_expires_at>now()))),
      -- Free tokens per kind of seat, counted like seat_available; both open up once quotas merge.
      'member_seats_free',case when now()>=s.starts_at-make_interval(hours=>s.release_hours) then greatest(0,s.capacity-used.total_used)
        else greatest(0,least(s.capacity-used.total_used,s.capacity-s.newcomer_seats-used.circle_used)) end,
      'traveller_seats_free',case when now()>=s.starts_at-make_interval(hours=>s.release_hours) then greatest(0,s.capacity-used.total_used)
        else greatest(0,least(s.capacity-used.total_used,s.newcomer_seats-used.newcomer_used)) end,
      'my_status',case when public.active_user() then (select status from public.bookings b where b.session_id=s.id and b.user_id=auth.uid()) else null end,
      'my_seat',case when public.active_user() then (select seat_index from public.bookings b where b.session_id=s.id and b.user_id=auth.uid() and (b.status='confirmed' or (b.status='offered' and b.offer_expires_at>now()))) else null end,
      'my_offer_expires_at',case when public.active_user() then (select offer_expires_at from public.bookings b where b.session_id=s.id and b.user_id=auth.uid()) else null end,
      'my_guests',case when public.active_user() then (select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'name',b.guest_name,'status',b.status,'seat_index',b.seat_index,'offer_expires_at',b.offer_expires_at) order by b.created_at,b.id),'[]'::jsonb)
        from public.bookings b where b.session_id=s.id and b.sponsor_id=auth.uid() and b.status<>'cancelled') else '[]'::jsonb end,
      'participants',case when public.is_member() or (public.active_user() and exists(select 1 from public.bookings where session_id=s.id and user_id=auth.uid() and status='confirmed'))
        then (select coalesce(jsonb_agg(jsonb_build_object(
            'display_name',coalesce(b.guest_name,p.display_name),
            'avatar_color',coalesce(p.avatar_color,sponsor.avatar_color),
            'seat_index',b.seat_index,
            'can_storytell',coalesce(p.can_storytell,false),
            'role',case when b.user_id is null then case when b.pool='circle' then 'guest' else 'traveller_guest' end
              when p.membership='newcomer' then 'traveller' else 'member' end,
            'invited_by',sponsor.display_name) order by b.seat_index),'[]'::jsonb)
          from public.bookings b left join public.profiles p on p.id=b.user_id left join public.profiles sponsor on sponsor.id=b.sponsor_id
          where b.session_id=s.id and b.status='confirmed') else '[]'::jsonb end
    ) as payload
    from public.sessions s
    cross join lateral (select count(*) as total_used,count(*) filter(where b.pool='circle') as circle_used,count(*) filter(where b.pool='newcomer') as newcomer_used
      from public.bookings b where b.session_id=s.id and (b.status='confirmed' or (b.status='offered' and b.offer_expires_at>now()))) used
    where public.can_see_session(s.id) and (s.ends_at>now()-interval '30 days' or public.is_organizer())
  ) listed;
$$;
```

- [ ] **Step 4 : vérifier**

Run: `pnpm exec tsx --test tests/sql-guests-listing.test.ts`
Expected: PASS.
Run: `pnpm test`
Expected: PASS.

- [ ] **Step 5 : commit**

```bash
git add supabase/migrations/202610120005_guests.sql tests/sql-guests-listing.test.ts
git commit -m "List guests with their status, sponsor and free seats per kind"
```

---

### Task 3 : validation des voyageurs, propositions et retrait des invités

**Files :**
- Modify: `supabase/migrations/202610120005_guests.sql` (ajout à la fin)
- Create: `tests/sql-guests-review.test.ts`

**Interfaces :**
- Consumes : `add_guest` (tâche 1).
- Produces :
  - `public.review_request(p_session uuid, p_person uuid, p_approve boolean, p_promote boolean default false) → text` ;
  - `public.remove_guest(p_booking uuid) → void` ;
  - `public.accept_guest_offer(p_booking uuid) → text` ;
  - `review_booking` ne promeut plus personne ;
  - les messages qui concernent un invité partent à son parrain.

- [ ] **Step 1 : écrire le test qui échoue**

`tests/sql-guests-review.test.ts` :

```ts
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDatabase,uuid} from './sql-harness';

type Row={guest_name:string|null;status:string;pool:string;seat_index:number|null};

test('Validation des voyageurs et vie des invités',async t=>{
  const h=await createDatabase();
  for(const [n,m] of [[1,'organizer'],[2,'member'],[3,'newcomer'],[4,'member'],[5,'newcomer'],[6,'newcomer'],[7,'newcomer']] as const)await h.user(n,m);
  const game=uuid(100);await h.session(game,{capacity:8,travellerSeats:4});
  const rows=async(where:string,params:unknown[]=[])=>{await h.root();return h.call<Row>(`select guest_name,status,pool,seat_index from bookings where ${where} order by created_at,id`,params);};
  const notices=async(n:number)=>{await h.root();return h.call<{title:string;body:string}>('select title,body from notifications where user_id=$1 order by created_at,id',[uuid(n)]);};
  const membership=async(n:number)=>{await h.root();return (await h.call<{membership:string}>('select membership from profiles where id=$1',[uuid(n)]))[0].membership;};
  const idOf=async(name:string,session:string)=>{await h.root();return (await h.call<{id:string}>('select id from bookings where guest_name=$1 and session_id=$2',[name,session]))[0].id;};
  await h.login(3);await h.call('select book_circle_seat($1,0)',[game]);await h.call('select add_guest($1,$2,$3)',[game,'Nora',1]);await h.call('select add_guest($1,$2)',[game,'Yann']);

  await t.test('seul un organisateur traite une demande',async()=>{
    await h.login(2);
    await assert.rejects(h.call('select review_request($1,$2,true)',[game,uuid(3)]),/organisateur/);
  });
  await t.test('accepter le groupe confirme le voyageur et ses amis en un message, sans le passer membre',async()=>{
    await h.login(1);
    await h.call('select review_request($1,$2,true)',[game,uuid(3)]);
    const group=await rows('session_id=$1',[game]);
    assert.deepEqual(group.map(r=>[r.guest_name,r.status,r.pool]),[[null,'confirmed','newcomer'],['Nora','confirmed','newcomer'],['Yann','confirmed','newcomer']]);
    assert.deepEqual([group[0].seat_index,group[1].seat_index],[0,1]);
    assert.equal(await membership(3),'newcomer');
    const review=(await notices(3)).filter(n=>n.title==='Bienvenue, ta place est confirmée !');
    assert.equal(review.length,1);
    assert.match(review[0].body,/Nora : place confirmée/);assert.match(review[0].body,/Yann : place confirmée/);
  });
  await t.test('une demande déjà traitée ne l’est pas deux fois',async()=>{
    await h.login(1);
    await assert.rejects(h.call('select review_request($1,$2,true)',[game,uuid(3)]),/déjà été traitée/);
  });
  await t.test('review_booking ne passe plus membre automatiquement',async()=>{
    await h.login(7);await h.call('select book_session($1)',[game]);
    await h.root();const [own]=await h.call<{id:string}>('select id from bookings where user_id=$1',[uuid(7)]);
    await h.login(1);
    assert.equal((await h.call<{review_booking:string}>('select review_booking($1,true)',[own.id]))[0].review_booking,'confirmed');
    assert.equal(await membership(7),'newcomer');
  });
  await t.test('« accepter et passer membre » fait basculer la place dans le quota membre',async()=>{
    await h.login(5);await h.call('select book_session($1)',[game]);
    await h.login(1);await h.call('select review_request($1,$2,true,true)',[game,uuid(5)]);
    const [own]=await rows('user_id=$1',[uuid(5)]);
    assert.deepEqual([own.status,own.pool],['confirmed','circle']);
    assert.equal(await membership(5),'member');
  });
  await t.test('refuser un seul ami prévient son parrain, qui ne peut pas le rajouter',async()=>{
    await h.login(6);await h.call('select book_session($1)',[game]);await h.call('select add_guest($1,$2)',[game,'Ugo']);
    const ugo=await idOf('Ugo',game);
    await h.login(1);await h.call('select review_booking($1,false)',[ugo]);
    assert.ok((await notices(6)).some(n=>n.title==='La participation de Ugo n’a pas été retenue'));
    await h.login(6);
    await assert.rejects(h.call('select add_guest($1,$2)',[game,'ugo']),/pas été retenue/);
  });
  const small=uuid(101);await h.session(small,{capacity:7,travellerSeats:5});
  await t.test('une place libérée est proposée au parrain, et lui seul peut la confirmer',async()=>{
    await h.login(2);await h.call('select book_session($1)',[small]);
    await h.login(4);await h.call('select book_session($1)',[small]);
    await h.login(2);assert.equal((await h.call<{add_guest:string}>('select add_guest($1,$2)',[small,'Zoé']))[0].add_guest,'waitlisted');
    await h.login(4);await h.call('select cancel_booking($1)',[small]);
    assert.equal((await rows(`guest_name='Zoé'`))[0].status,'offered');
    assert.ok((await notices(2)).some(n=>n.title==='Une place s’est libérée pour Zoé'));
    const zoe=await idOf('Zoé',small);
    await h.login(4);await assert.rejects(h.call('select accept_guest_offer($1)',[zoe]),/non autorisée/);
    await h.login(2);assert.equal((await h.call<{accept_guest_offer:string}>('select accept_guest_offer($1)',[zoe]))[0].accept_guest_offer,'confirmed');
  });
  await t.test('une proposition expirée prévient le parrain',async()=>{
    await h.login(2);assert.equal((await h.call<{add_guest:string}>('select add_guest($1,$2)',[small,'Ugo']))[0].add_guest,'waitlisted');
    await h.call('select cancel_booking($1)',[small]);
    assert.equal((await rows(`guest_name='Ugo' and session_id=$1`,[small]))[0].status,'offered');
    await h.root();
    await h.call(`update bookings set offer_expires_at=now()-interval '1 minute' where guest_name='Ugo' and session_id=$1`,[small]);
    await h.call('select rebalance($1)',[small]);
    assert.equal((await rows(`guest_name='Ugo' and session_id=$1`,[small]))[0].status,'cancelled');
    assert.ok((await notices(2)).some(n=>n.title==='La proposition pour Ugo a expiré'));
  });
  await t.test('le parrain retire son invité ; personne d’autre ne le peut',async()=>{
    const zoe=await idOf('Zoé',small);
    await h.login(4);await assert.rejects(h.call('select remove_guest($1)',[zoe]),/non autorisée/);
    await h.login(2);await h.call('select remove_guest($1)',[zoe]);
    const [row]=await rows(`guest_name='Zoé'`);
    assert.deepEqual([row.status,row.seat_index],['cancelled',null]);
  });
  await h.db.close();
});
```

- [ ] **Step 2 : vérifier que le test échoue**

Run: `pnpm exec tsx --test tests/sql-guests-review.test.ts`
Expected: FAIL avec `function review_request(...) does not exist`.

- [ ] **Step 3 : ajouter les fonctions**

Ajouter à la fin de la migration :

```sql
-- Offers and expiries about a guest go to the sponsor, who confirms on the guest's behalf.
create or replace function public.rebalance(p_id uuid) returns void language plpgsql security definer set search_path = '' as $$
declare s public.sessions; b public.bookings; deadline timestamptz;
begin
  select * into s from public.sessions where id=p_id for update;
  if s.id is null or s.status<>'published' then return; end if;
  for b in update public.bookings set status='cancelled',offer_expires_at=null
    where session_id=p_id and status='offered' and offer_expires_at<=now() returning *
  loop
    if b.user_id is null then perform public.notify(b.sponsor_id,p_id,'La proposition pour '||b.guest_name||' a expiré','Le délai est passé. Tu peux l’ajouter à nouveau à la liste d’attente.');
    else perform public.notify(b.user_id,p_id,'La proposition a expiré','Le délai est passé. Tu peux rejoindre à nouveau la liste d’attente.'); end if;
  end loop;
  if s.starts_at<=now()+interval '30 minutes' then return; end if;
  deadline=least(now()+interval '12 hours',s.starts_at-interval '30 minutes');
  for b in select * from public.bookings where session_id=p_id and status='waitlisted' order by created_at,id for update
  loop
    if public.seat_available(p_id,b.pool) then
      update public.bookings set status='offered',offer_expires_at=deadline where id=b.id;
      if b.user_id is null then perform public.notify(b.sponsor_id,p_id,'Une place s’est libérée pour '||b.guest_name,'Confirme sa place depuis la partie avant l’expiration de la proposition.');
      else perform public.notify(b.user_id,p_id,'Une place s’est libérée !','Confirme ta présence depuis la partie avant l’expiration de la proposition.'); end if;
    end if;
  end loop;
end; $$;

create or replace function public.review_booking(p_booking uuid,p_approve boolean) returns text language plpgsql security definer set search_path = '' as $$
declare b public.bookings; result text; s public.sessions; previous text;
begin
  if not public.is_organizer() then raise exception 'Accès organisateur requis.'; end if;
  select * into b from public.bookings where id=p_booking;
  select * into s from public.sessions where id=b.session_id for update;
  select * into b from public.bookings where id=p_booking for update;
  if b.id is null then raise exception 'Participation introuvable.'; end if;
  if s.status<>'published' or s.starts_at<=now()+interval '30 minutes' then raise exception 'Cette session est close.'; end if;
  if p_approve and b.status<>'pending' then raise exception 'Cette demande a déjà été traitée.'; end if;
  previous=b.status;
  if p_approve then
    perform public.rebalance(b.session_id);
    result=case when public.seat_available(b.session_id,b.pool) then 'confirmed' else 'waitlisted' end;
  else result='declined'; end if;
  update public.bookings set status=result,offer_expires_at=null where id=b.id;
  -- Travellers stay travellers: only an organizer or a member's sponsorship link makes someone a member.
  if b.user_id is null then
    perform public.notify(b.sponsor_id,b.session_id,
      case when result='confirmed' then b.guest_name||' a sa place' when result='waitlisted' then b.guest_name||' est en liste d’attente'
        when previous='pending' then 'La participation de '||b.guest_name||' n’a pas été retenue' else b.guest_name||' a été retiré·e de la partie' end,
      case result when 'declined' then 'Contacte un organisateur si tu as une question.' else 'Retrouve les détails dans la partie.' end);
  else
    perform public.notify(b.user_id,b.session_id,
      case result when 'confirmed' then 'Bienvenue, ta place est confirmée !' when 'waitlisted' then 'Demande validée, tu es en attente' else 'Participation non retenue' end,
      case result when 'declined' then 'Contacte un organisateur si tu as une question.' else 'Retrouve les détails dans la partie.' end);
  end if;
  perform public.rebalance(b.session_id);
  return result;
end; $$;

-- Accepts or refuses, in one transaction and one message, a traveller's request and the friends they bring.
create function public.review_request(p_session uuid,p_person uuid,p_approve boolean,p_promote boolean default false) returns text language plpgsql security definer set search_path='' as $$
declare s public.sessions; b public.bookings; result text; own_result text; lines text[]=array[]::text[];
begin
  if not public.is_organizer() then raise exception 'Accès organisateur requis.'; end if;
  select * into s from public.sessions where id=p_session for update;
  if s.id is null or s.status<>'published' or s.starts_at<=now()+interval '30 minutes' then raise exception 'Cette session est close.'; end if;
  if not exists(select 1 from public.bookings where session_id=p_session and status='pending' and (user_id=p_person or sponsor_id=p_person)) then
    raise exception 'Cette demande a déjà été traitée.';
  end if;
  if p_approve and p_promote then
    update public.profiles set membership='member' where id=p_person and membership='newcomer';
    update public.bookings set pool='circle' where session_id=p_session and user_id=p_person and status='pending';
  end if;
  if p_approve then perform public.rebalance(p_session); end if;
  -- The traveller's own request is seated first, then the friends in the order they were added.
  for b in select * from public.bookings where session_id=p_session and status='pending' and (user_id=p_person or sponsor_id=p_person)
    order by user_id is null,created_at,id for update
  loop
    result=case when not p_approve then 'declined' when public.seat_available(p_session,b.pool) then 'confirmed' else 'waitlisted' end;
    update public.bookings set status=result,offer_expires_at=null where id=b.id;
    if b.user_id is not null then own_result=result; end if;
    lines=lines||(coalesce(b.guest_name,'Toi')||' : '||case result when 'confirmed' then 'place confirmée' when 'waitlisted' then 'liste d’attente' else 'non retenu·e' end);
  end loop;
  perform public.notify(p_person,p_session,
    case when not p_approve then 'Participation non retenue' when own_result='confirmed' then 'Bienvenue, ta place est confirmée !'
      when own_result='waitlisted' then 'Demande validée, tu es en attente' else 'Demande validée' end,
    array_to_string(lines,E'\n')||case when p_approve then E'\nRetrouve les détails dans la partie.' else E'\nContacte un organisateur si tu as une question.' end);
  perform public.rebalance(p_session);
  return coalesce(own_result,case when p_approve then 'confirmed' else 'declined' end);
end; $$;

create function public.remove_guest(p_booking uuid) returns void language plpgsql security definer set search_path='' as $$
declare b public.bookings;
begin
  perform public.rate_guard('booking',20,600);
  select * into b from public.bookings where id=p_booking;
  if b.id is null or b.sponsor_id is distinct from auth.uid() then raise exception 'Action non autorisée.'; end if;
  perform 1 from public.sessions where id=b.session_id for update;
  select * into b from public.bookings where id=p_booking for update;
  if b.status in ('cancelled','declined') then return; end if;
  update public.bookings set status='cancelled',offer_expires_at=null where id=b.id;
  perform public.rebalance(b.session_id);
end; $$;

create function public.accept_guest_offer(p_booking uuid) returns text language plpgsql security definer set search_path='' as $$
declare b public.bookings; s public.sessions;
begin
  perform public.rate_guard('booking',20,600);
  select * into b from public.bookings where id=p_booking;
  if b.id is null or b.sponsor_id is distinct from auth.uid() then raise exception 'Action non autorisée.'; end if;
  select * into s from public.sessions where id=b.session_id for update;
  if s.status<>'published' or s.starts_at<=now() then raise exception 'Cette session est close.'; end if;
  select * into b from public.bookings where id=p_booking for update;
  if b.status<>'offered' or b.offer_expires_at<=now() then raise exception 'Cette proposition a expiré.'; end if;
  update public.bookings set status='confirmed',offer_expires_at=null where id=b.id;
  return 'confirmed';
end; $$;

revoke execute on function public.review_request(uuid,uuid,boolean,boolean),public.remove_guest(uuid),public.accept_guest_offer(uuid) from public,anon,authenticated;
grant execute on function public.review_request(uuid,uuid,boolean,boolean),public.remove_guest(uuid),public.accept_guest_offer(uuid) to authenticated,service_role;
```

- [ ] **Step 4 : vérifier**

Run: `pnpm exec tsx --test tests/sql-guests-review.test.ts`
Expected: PASS.
Run: `pnpm test`
Expected: PASS. L'ancien test « les nouveaux attendent une validation » passe toujours : il ne vérifie pas la promotion.

- [ ] **Step 5 : commit**

```bash
git add supabase/migrations/202610120005_guests.sql tests/sql-guests-review.test.ts
git commit -m "Review traveller groups and let sponsors manage guest offers"
```

---

### Task 4 : modifications, annulation, suspension, rappels et effacement

**Files :**
- Modify: `supabase/migrations/202610120005_guests.sql` (ajout à la fin)
- Create: `tests/sql-guests-lifecycle.test.ts`

**Interfaces :**
- Consumes : `add_guest` (tâche 1) et `review_request` (tâche 3).
- Produces : `save_session`, `cancel_session`, `set_membership`, `maintenance` et `book_session` prennent en compte les invités. Signatures inchangées.

- [ ] **Step 1 : écrire le test qui échoue**

`tests/sql-guests-lifecycle.test.ts` :

```ts
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDatabase,uuid} from './sql-harness';

test('Modifications, annulation, rappels et effacement des invités',async t=>{
  const h=await createDatabase();
  for(const [n,m] of [[1,'organizer'],[2,'member'],[3,'newcomer'],[4,'member'],[5,'member'],[6,'member'],[7,'member']] as const)await h.user(n,m);
  const notices=async(n:number,title:string)=>{await h.root();return h.call<{body:string}>('select body from notifications where user_id=$1 and title=$2',[uuid(n),title]);};
  const input=(id:string,changes:Record<string,unknown>={})=>JSON.stringify({id,title:'Soirée modifiée',description:'',script:'Trouble Brewing',
    starts_at:new Date(Date.now()+11*86400000).toISOString(),ends_at:new Date(Date.now()+11*86400000+14400000).toISOString(),
    location:'Brest',address:'',capacity:8,newcomer_seats:2,release_hours:72,beginners_welcome:true,visibility:'public',...changes});
  const game=uuid(100);await h.session(game,{capacity:8,travellerSeats:2});
  await h.login(2);await h.call('select book_session($1)',[game]);for(const name of ['Paul','Lou'])await h.call('select add_guest($1,$2)',[game,name]);
  await h.login(4);await h.call('select book_session($1)',[game]);for(const name of ['Tom','Inès'])await h.call('select add_guest($1,$2)',[game,name]);
  await h.login(3);await h.call('select book_session($1)',[game]);await h.call('select add_guest($1,$2)',[game,'Nora']);
  await h.login(1);await h.call('select review_request($1,$2,true)',[game,uuid(3)]);

  await t.test('la capacité ne descend pas sous les places prises, invités compris',async()=>{
    await h.login(1);
    await assert.rejects(h.call('select save_session($1::jsonb)',[input(game,{capacity:7})]),/capacité/);
  });
  await t.test('modifier la partie envoie un seul message par personne, qui cite ses invités',async()=>{
    await h.login(1);await h.call('select save_session($1::jsonb)',[input(game)]);
    const two=await notices(2,'Les informations de ta session ont changé');const four=await notices(4,'Les informations de ta session ont changé');
    assert.equal(two.length,1);assert.match(two[0].body,/Préviens Lou, Paul\./);
    assert.equal(four.length,1);assert.match(four[0].body,/Préviens Inès, Tom\./);
  });
  await t.test('annuler la partie prévient chaque parrain une seule fois',async()=>{
    await h.login(1);await h.call('select cancel_session($1)',[game]);
    const two=await notices(2,'La session a été annulée');
    assert.equal(two.length,1);assert.match(two[0].body,/Préviens Lou, Paul\./);
  });
  const open=uuid(101);await h.session(open);
  await t.test('une session ne passe pas « membres » quand un ami de voyageur y est inscrit',async()=>{
    await h.login(3);await h.call('select add_guest($1,$2)',[open,'Mia']);
    await h.login(1);
    await assert.rejects(h.call('select save_session($1::jsonb)',[input(open,{visibility:'members'})]),/voyageurs/);
  });
  const members=uuid(102);await h.session(members);
  await t.test('les invités de membres n’empêchent pas une session « membres »',async()=>{
    await h.login(5);await h.call('select add_guest($1,$2)',[members,'Rémi']);
    await h.login(1);await h.call('select save_session($1::jsonb)',[input(members,{visibility:'members'})]);
    await h.root();
    assert.equal((await h.call<{visibility:string}>('select visibility from sessions where id=$1',[members]))[0].visibility,'members');
  });
  const tonight=uuid(103);await h.session(tonight,{startsIn:'12 hours'});
  await t.test('le rappel cite les invités, une seule fois par personne',async()=>{
    await h.login(6);await h.call('select book_session($1)',[tonight]);await h.call('select add_guest($1,$2)',[tonight,'Inès']);
    await h.login(7);await h.call('select add_guest($1,$2)',[tonight,'Tom']);
    await h.root();await h.call('select maintenance()');await h.call('select maintenance()');
    const six=await notices(6,'Ta session approche');const seven=await notices(7,'Ta session approche');
    assert.equal(six.length,1);assert.match(six[0].body,/Inès vient avec toi/);
    assert.equal(seven.length,1);assert.match(seven[0].body,/Tom est attendu·e\. Transmets-lui/);
  });
  const later=uuid(104);await h.session(later);
  await t.test('suspendre un parrain libère ses invités',async()=>{
    await h.login(5);await h.call('select add_guest($1,$2)',[later,'Gaby']);
    await h.login(1);await h.call(`select set_membership($1,'suspended')`,[uuid(5)]);
    await h.root();
    const statuses=(await h.call<{status:string}>('select status from bookings where sponsor_id=$1',[uuid(5)])).map(r=>r.status);
    assert.deepEqual(statuses,['cancelled','cancelled']);
  });
  await t.test('supprimer le compte d’un parrain supprime ses invités',async()=>{
    await h.root();
    await h.call('delete from auth.users where id=$1',[uuid(7)]);
    assert.equal((await h.call('select * from bookings where sponsor_id=$1',[uuid(7)])).length,0);
  });
  const old=uuid(105);const recent=uuid(106);
  await h.session(old,{startsIn:'-40 days'});await h.session(recent,{startsIn:'-10 days'});
  await t.test('les prénoms des invités sont effacés 30 jours après la soirée',async()=>{
    await h.root();
    await h.call(`insert into bookings(session_id,guest_name,sponsor_id,status,pool) values($1,'Ancien',$3,'confirmed','circle'),($2,'Récent',$3,'confirmed','circle')`,[old,recent,uuid(2)]);
    await h.call('select maintenance()');
    const names=await h.call<{guest_name:string}>('select guest_name from bookings where session_id in ($1,$2) order by session_id',[old,recent]);
    assert.deepEqual(names.map(n=>n.guest_name),['Invité·e','Récent']);
  });
  await h.db.close();
});
```

- [ ] **Step 2 : vérifier que le test échoue**

Run: `pnpm exec tsx --test tests/sql-guests-lifecycle.test.ts`
Expected: FAIL. Le test du message unique échoue : aujourd'hui, `save_session` envoie un message par ligne de `bookings`, donc trois pour le joueur 2, sans « Préviens ».

- [ ] **Step 3 : ajouter les fonctions**

Ajouter à la fin de la migration. `save_session` reprend la version de la migration 4 et ne change que trois choses : le contrôle « voyageurs », le message dédoublonné et la suppression des variables inutilisées.

```sql
create or replace function public.save_session(p_data jsonb) returns uuid language plpgsql security definer set search_path = '' as $$
declare sid uuid; occupied integer;
begin
  if not public.is_organizer() then raise exception 'Accès organisateur requis.'; end if;
  p_data=jsonb_build_object('capacity',15)||p_data;
  if (p_data->>'starts_at')::timestamptz<=now() then raise exception 'Choisis une date à venir.'; end if;
  sid=nullif(p_data->>'id','')::uuid;
  if sid is not null then
    perform 1 from public.sessions where id=sid for update;
    if not found then raise exception 'Session introuvable.'; end if;
    select count(*) into occupied from public.bookings where session_id=sid and (status='confirmed' or (status='offered' and offer_expires_at>now()));
    if occupied>(p_data->>'capacity')::integer then raise exception 'La capacité ne peut pas être inférieure aux places déjà réservées.'; end if;
    -- Travellers, and the friends they bring, cannot see a members-only session.
    if exists(select 1 from public.sessions where id=sid and visibility='public') and p_data->>'visibility'='members'
      and exists(select 1 from public.bookings b left join public.profiles p on p.id=b.user_id where b.session_id=sid
        and b.status in ('pending','confirmed','offered','waitlisted') and (p.membership='newcomer' or (b.user_id is null and b.pool='newcomer')))
      then raise exception 'Des voyageurs sont inscrits : garde cette session publique.'; end if;
    update public.sessions set title=p_data->>'title', description=p_data->>'description',script=p_data->>'script',
      starts_at=(p_data->>'starts_at')::timestamptz,ends_at=(p_data->>'ends_at')::timestamptz,
      location=p_data->>'location',capacity=(p_data->>'capacity')::integer,
      newcomer_seats=(p_data->>'newcomer_seats')::integer,release_hours=(p_data->>'release_hours')::integer,
      beginners_welcome=(p_data->>'beginners_welcome')::boolean,visibility=p_data->>'visibility' where id=sid;
    -- One message per person, naming the people they bring.
    insert into public.notifications(user_id,session_id,title,body)
      select recipient,sid,'Les informations de ta session ont changé','Consulte les nouveaux horaires et le lieu avant de venir.'||coalesce(' Préviens '||guests||'.','')
      from (select coalesce(user_id,sponsor_id) as recipient,string_agg(guest_name,', ' order by guest_name) filter(where user_id is null) as guests
        from public.bookings where session_id=sid and status in ('confirmed','offered','waitlisted','pending') group by 1) recipients;
  else
    insert into public.sessions(title,description,script,starts_at,ends_at,location,capacity,newcomer_seats,release_hours,beginners_welcome,visibility,created_by)
      values(p_data->>'title',p_data->>'description',p_data->>'script',(p_data->>'starts_at')::timestamptz,(p_data->>'ends_at')::timestamptz,
      p_data->>'location',(p_data->>'capacity')::integer,(p_data->>'newcomer_seats')::integer,(p_data->>'release_hours')::integer,
      (p_data->>'beginners_welcome')::boolean,p_data->>'visibility',auth.uid()) returning id into sid;
  end if;
  insert into public.session_addresses(session_id,address) values(sid,coalesce(p_data->>'address','')) on conflict(session_id) do update set address=excluded.address;
  perform public.rebalance(sid);
  return sid;
end; $$;

create or replace function public.cancel_session(p_id uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_organizer() then raise exception 'Accès organisateur requis.'; end if;
  perform 1 from public.sessions where id=p_id and status='published' for update;
  if not found then return; end if;
  update public.sessions set status='cancelled' where id=p_id;
  insert into public.notifications(user_id,session_id,title,body,dedupe_key)
    select recipient,p_id,'La session a été annulée','L’organisateur a annulé cette soirée.'||coalesce(' Préviens '||guests||'.','')||' Rendez-vous sur le site pour trouver une autre date.','cancel:'||p_id||':'||recipient
    from (select coalesce(user_id,sponsor_id) as recipient,string_agg(guest_name,', ' order by guest_name) filter(where user_id is null) as guests
      from public.bookings where session_id=p_id and status in ('pending','confirmed','waitlisted','offered') group by 1) recipients
    on conflict(dedupe_key) do nothing;
  update public.bookings set status='cancelled',offer_expires_at=null where session_id=p_id and status<>'declined';
end; $$;

create or replace function public.set_membership(p_user uuid,p_status text) returns void language plpgsql security definer set search_path = '' as $$
declare sid uuid;
begin
  if not public.is_organizer() or p_user=auth.uid() or p_status not in ('member','suspended') then raise exception 'Action non autorisée.'; end if;
  if exists(select 1 from public.profiles where id=p_user and membership='organizer') then raise exception 'Un autre organisateur ne peut pas être suspendu ici.'; end if;
  update public.profiles set membership=p_status where id=p_user;
  if p_status='suspended' then
    -- A suspended sponsor no longer vouches for the people they bring.
    for sid in select distinct session_id from public.bookings where (user_id=p_user or sponsor_id=p_user) and status in ('confirmed','offered','pending','waitlisted') order by session_id
    loop
      perform 1 from public.sessions where id=sid for update;
      update public.bookings set status='cancelled',offer_expires_at=null
        where session_id=sid and (user_id=p_user or sponsor_id=p_user) and status in ('confirmed','offered','pending','waitlisted');
      perform public.rebalance(sid);
    end loop;
  end if;
end; $$;

create or replace function public.maintenance() returns void language plpgsql security definer set search_path = '' as $$
declare sid uuid;
begin
  for sid in select id from public.sessions where status='published' and starts_at>now() order by id loop perform public.rebalance(sid); end loop;
  -- One reminder per person, naming the people they bring.
  insert into public.notifications(user_id,session_id,title,body,dedupe_key)
    select recipient,session_id,'Ta session approche',
      case when guests is null then 'Un imprévu ? Pense à libérer ta place depuis le site. À très vite !'
        when attending then guests||case when guest_count>1 then ' viennent' else ' vient' end||' avec toi. Un imprévu ? Pense à libérer vos places depuis le site.'
        else guests||case when guest_count>1 then ' sont attendu·es. Transmets-leur' else ' est attendu·e. Transmets-lui' end||' l’heure et le lieu.' end,
      'reminder:'||session_id||':'||recipient
    from (select coalesce(b.user_id,b.sponsor_id) as recipient,b.session_id,bool_or(b.user_id is not null) as attending,
        count(*) filter(where b.user_id is null) as guest_count,
        string_agg(b.guest_name,' et ' order by b.guest_name) filter(where b.user_id is null) as guests
      from public.bookings b join public.sessions s on s.id=b.session_id
      where b.status='confirmed' and s.status='published' and s.starts_at between now() and now()+interval '24 hours'
      group by 1,2) reminders
    on conflict(dedupe_key) do nothing;
  -- Guests never created an account: keep their first name only while the evening is recent.
  update public.bookings b set guest_name='Invité·e' from public.sessions s
    where s.id=b.session_id and b.guest_name is not null and b.guest_name<>'Invité·e' and s.ends_at<now()-interval '30 days';
  delete from public.action_limits where window_start<now()-interval '2 days';
end; $$;

-- Same as the first migration, except the pending message: travellers are reviewed for every game.
create or replace function public.book_session(p_id uuid) returns text language plpgsql security definer set search_path = '' as $$
declare s public.sessions; p public.profiles; existing public.bookings; result text; target_pool text;
begin
  perform public.rate_guard('booking',20,600);
  select * into p from public.profiles where id=auth.uid();
  select * into s from public.sessions where id=p_id for update;
  if s.id is null or not public.can_see_session(p_id) then raise exception 'Cette session est inaccessible.'; end if;
  if s.status<>'published' or s.starts_at<=now()+interval '30 minutes' then raise exception 'Les inscriptions sont closes.'; end if;
  select * into existing from public.bookings where session_id=p_id and user_id=auth.uid();
  if existing.status in ('pending','confirmed','waitlisted','offered') then return existing.status; end if;
  if existing.status='declined' then raise exception 'Contacte un organisateur pour cette session.'; end if;
  perform public.rebalance(p_id);
  target_pool=case when p.membership='newcomer' then 'newcomer' else 'circle' end;
  result=case when p.membership='newcomer' then 'pending' when public.seat_available(p_id,target_pool) then 'confirmed' else 'waitlisted' end;
  insert into public.bookings(session_id,user_id,status,pool) values(p_id,auth.uid(),result,target_pool)
    on conflict(session_id,user_id) do update set status=excluded.status,pool=excluded.pool,created_at=now(),offer_expires_at=null;
  perform public.notify(auth.uid(),p_id,
    case result when 'confirmed' then 'Ta place est réservée' when 'pending' then 'Demande envoyée' else 'Tu es sur la liste d’attente' end,
    case result when 'confirmed' then 'Retrouve les informations pratiques dans ta session.' when 'pending' then 'Un organisateur va valider ta demande.' else 'Nous te proposerons une place dès qu’elle se libère.' end);
  return result;
end; $$;
```

- [ ] **Step 4 : vérifier**

Run: `pnpm exec tsx --test tests/sql-guests-lifecycle.test.ts`
Expected: PASS.
Run: `pnpm test`
Expected: PASS. Le titre du test d'annulation existant (« La session a été annulée ») est conservé.

- [ ] **Step 5 : commit**

```bash
git add supabase/migrations/202610120005_guests.sql tests/sql-guests-lifecycle.test.ts
git commit -m "Notify sponsors once, free guests on suspension and erase old guest names"
```

---

### Task 5 : types et logique pure (`lib/guests.ts`)

**Files :**
- Modify: `lib/types.ts`
- Modify: `lib/schemas.ts`
- Create: `lib/guests.ts`
- Create: `tests/guests.test.ts`

**Interfaces :**
- Consumes : la forme des données de `list_sessions` (tâche 2) et `MAX_GUESTS_PER_PERSON` (tâche 1).
- Produces :
  - **types** : `ParticipantRole`, `Participant`, `MyGuest` ; nouveaux champs de `GameSession` (`member_seats_free?`, `traveller_seats_free?`, `my_guests?`) ; `Booking` (`user_id: string | null`, `guest_name`, `sponsor_id`, `profile?: Profile | null`) ;
  - **libellés** : `roleLabels`, `membershipLabels`, `guestStatusLabels`, `participantLabel(p, {mine?})`, `bookingLabel(b, sponsorName)` ;
  - **places et invités** : `activeGuests(s)`, `canSeeAddress(s, profile)`, `seatPlan(s, profile, now?) → SeatPlan`, `waitlistHint(s, traveller, now?)` ;
  - **organisateur et suggestions** : `groupRequests(bookings, profiles) → RequestGroup[]`, `orderBySponsor(bookings)`, `recentGuestNames(sessions, current, limit?)` ;
  - **validation** : `guestNameSchema`.

- [ ] **Step 1 : écrire le test qui échoue**

`tests/guests.test.ts` :

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Booking, GameSession, MyGuest, Profile } from '../lib/types';
import { bookingLabel, canSeeAddress, groupRequests, orderBySponsor, participantLabel, recentGuestNames, seatPlan, waitlistHint } from '../lib/guests';

const now = Date.parse('2026-10-12T10:00:00Z');
const session = (changes: Partial<GameSession> = {}): GameSession => ({ id: 's1', title: 'Soirée', script: 'Trouble Brewing', starts_at: '2026-10-20T17:30:00Z', ends_at: '2026-10-20T21:30:00Z', location: 'Brest', capacity: 8, newcomer_seats: 2, release_hours: 72, beginners_welcome: true, visibility: 'public', status: 'published', confirmed_count: 3, waitlist_count: 0, my_status: null, participants: [], member_seats_free: 3, traveller_seats_free: 2, my_guests: [], ...changes });
const guest = (name: string, status: MyGuest['status'] = 'confirmed', seat_index: number | null = 1): MyGuest => ({ id: `g-${name}`, name, status, seat_index, offer_expires_at: null });
const member = { membership: 'member' as const };
const traveller = { membership: 'newcomer' as const };
const none = { onFreeSeat: null, waitlist: null, limitReached: false, canBringOther: false };

test('libellés des quatre statuts', () => {
  assert.equal(participantLabel({ display_name: 'Léa', avatar_color: 'rose', role: 'member' }), 'membre');
  assert.equal(participantLabel({ display_name: 'Paul', avatar_color: 'rose', role: 'guest', invited_by: 'Léa' }), 'invité·e de Léa');
  assert.equal(participantLabel({ display_name: 'Marc', avatar_color: 'sage', role: 'traveller' }), 'voyageur·se');
  assert.equal(participantLabel({ display_name: 'Julie', avatar_color: 'sage', role: 'traveller_guest', invited_by: 'Marc' }), 'voyageur·se de Marc');
  assert.equal(participantLabel({ display_name: 'Paul', avatar_color: 'rose', role: 'guest', invited_by: 'Léa' }, { mine: true }), 'ton invité·e');
  assert.equal(participantLabel({ display_name: 'Julie', avatar_color: 'sage', role: 'traveller_guest', invited_by: 'Marc' }, { mine: true }), 'ton ami·e');
  assert.equal(participantLabel({ display_name: 'Ancien', avatar_color: 'rose' }), 'membre');
});

test('ce que fait un + selon la personne', () => {
  assert.deepEqual(seatPlan(session(), null, now), { ...none, onFreeSeat: 'signin' });
  assert.deepEqual(seatPlan(session({ confirmed_count: 8 }), null, now), { ...none, waitlist: 'self' });
  assert.deepEqual(seatPlan(session(), member, now), { ...none, onFreeSeat: 'book', canBringOther: true });
  assert.deepEqual(seatPlan(session({ member_seats_free: 0 }), member, now), { ...none, waitlist: 'self', canBringOther: true });
  assert.deepEqual(seatPlan(session({ my_status: 'confirmed' }), member, now), { ...none, onFreeSeat: 'guest' });
  assert.deepEqual(seatPlan(session({ my_status: 'confirmed', member_seats_free: 0 }), member, now), { ...none, waitlist: 'guest' });
  assert.deepEqual(seatPlan(session({ my_status: 'confirmed', my_guests: [guest('Paul'), guest('Lou', 'waitlisted', null)] }), member, now), { ...none, limitReached: true });
  assert.deepEqual(seatPlan(session({ my_status: 'confirmed', my_guests: [guest('Paul', 'cancelled', null), guest('Lou', 'declined', null)] }), member, now), { ...none, onFreeSeat: 'guest' });
  assert.deepEqual(seatPlan(session({ my_status: 'pending', traveller_seats_free: 0 }), traveller, now), { ...none, waitlist: 'guest' });
  assert.deepEqual(seatPlan(session({ traveller_seats_free: 0 }), traveller, now), { ...none, waitlist: 'self', canBringOther: true });
  assert.deepEqual(seatPlan(session({ my_status: 'declined' }), member, now), none);
  assert.deepEqual(seatPlan(session({ starts_at: '2026-10-12T10:20:00Z' }), member, now), none);
  assert.deepEqual(seatPlan(session({ status: 'cancelled' }), member, now), none);
});

test('explication de la liste d’attente', () => {
  assert.equal(waitlistHint(session({ confirmed_count: 8 }), false, now), 'Le cercle est complet, mais une place se libère souvent.');
  assert.equal(waitlistHint(session({ confirmed_count: 6 }), false, now), 'Les places membres sont prises. Les 2 places restantes sont réservées aux voyageurs jusqu’au samedi 17 octobre.');
  assert.equal(waitlistHint(session({ confirmed_count: 7 }), true, now), 'Les places voyageurs sont prises. La place restante est réservée aux membres jusqu’au samedi 17 octobre.');
});

test('regroupement des demandes pour l’organisateur', () => {
  const profiles = [{ id: 'u3', display_name: 'Sami', membership: 'newcomer' }] as Profile[];
  const base = { session_id: 's1', pool: 'newcomer' as const, created_at: '2026-10-12T10:00:00Z', offer_expires_at: null };
  const bookings: Booking[] = [
    { ...base, id: 'b1', user_id: 'u3', guest_name: null, sponsor_id: null, status: 'pending' },
    { ...base, id: 'b2', user_id: null, guest_name: 'Nora', sponsor_id: 'u3', status: 'pending' },
    { ...base, id: 'b3', user_id: null, guest_name: 'Yann', sponsor_id: 'u9', status: 'pending' },
    { ...base, id: 'b4', user_id: 'u5', guest_name: null, sponsor_id: null, status: 'confirmed' },
  ];
  assert.deepEqual(groupRequests(bookings, profiles).map(g => [g.key, g.own?.id, g.guests.map(b => b.id), g.person?.display_name]), [['s1:u3', 'b1', ['b2'], 'Sami'], ['s1:u9', undefined, ['b3'], undefined]]);
});

test('ordre des participants et libellés organisateur', () => {
  const base = { session_id: 's1', created_at: '2026-10-12T10:00:00Z', offer_expires_at: null, status: 'confirmed' as const };
  const lea: Booking = { ...base, id: 'b1', user_id: 'u1', guest_name: null, sponsor_id: null, pool: 'circle', profile: { membership: 'member' } as Profile };
  const paul: Booking = { ...base, id: 'b2', user_id: null, guest_name: 'Paul', sponsor_id: 'u1', pool: 'circle' };
  const marc: Booking = { ...base, id: 'b3', user_id: 'u2', guest_name: null, sponsor_id: null, pool: 'newcomer', profile: { membership: 'newcomer' } as Profile };
  const tom: Booking = { ...base, id: 'b4', user_id: null, guest_name: 'Tom', sponsor_id: 'u9', pool: 'circle' };
  assert.deepEqual(orderBySponsor([tom, paul, marc, lea]).map(b => b.id), ['b3', 'b1', 'b2', 'b4']);
  assert.deepEqual([bookingLabel(lea, ''), bookingLabel(paul, 'Léa'), bookingLabel(marc, ''), bookingLabel({ ...paul, pool: 'newcomer' }, 'Marc')], ['Membre', 'Invité·e de Léa', 'Voyageur·se', 'Voyageur·se de Marc']);
});

test('suggestions de prénoms', () => {
  const past = session({ id: 'old', starts_at: '2026-10-01T17:30:00Z', my_guests: [guest('Marie'), guest('Invité·e'), guest('paul')] });
  const newer = session({ id: 'new', starts_at: '2026-10-08T17:30:00Z', my_guests: [guest('Yann'), guest('Marie', 'declined', null)] });
  const current = session({ my_guests: [guest('Paul')] });
  assert.deepEqual(recentGuestNames([past, newer, current], current), ['Yann', 'Marie']);
});

test('accès à l’adresse', () => {
  assert.equal(canSeeAddress(session(), { membership: 'organizer' } as Profile), true);
  assert.equal(canSeeAddress(session({ my_status: 'confirmed' }), { membership: 'member' } as Profile), true);
  assert.equal(canSeeAddress(session({ my_guests: [guest('Paul')] }), { membership: 'member' } as Profile), true);
  assert.equal(canSeeAddress(session({ my_status: 'waitlisted', my_guests: [guest('Paul', 'pending', null)] }), { membership: 'newcomer' } as Profile), false);
  assert.equal(canSeeAddress(session(), null), false);
});
```

- [ ] **Step 2 : vérifier que le test échoue**

Run: `pnpm exec tsx --test tests/guests.test.ts`
Expected: FAIL avec `Cannot find module '../lib/guests'`.

- [ ] **Step 3 : mettre à jour les types**

Remplacer tout le contenu de `lib/types.ts` par :

```ts
export type Membership = 'newcomer' | 'member' | 'organizer' | 'suspended';
export type BookingStatus = 'pending' | 'confirmed' | 'waitlisted' | 'offered' | 'cancelled' | 'declined';
export type Profile = { id: string; display_name: string; bio: string; avatar_color: string; beginner: boolean; can_storytell: boolean; membership: Membership; sponsored_by: string | null; };
/** member: compte membre ou organisateur · guest: amené·e par un membre · traveller: compte voyageur · traveller_guest: amené·e par un voyageur. */
export type ParticipantRole = 'member' | 'guest' | 'traveller' | 'traveller_guest';
export type Participant = Pick<Profile, 'display_name' | 'avatar_color'> & { seat_index?: number; can_storytell?: boolean; role?: ParticipantRole; invited_by?: string | null };
/** Someone the viewer brings to a session, as returned by list_sessions. */
export type MyGuest = { id: string; name: string; status: BookingStatus; seat_index: number | null; offer_expires_at: string | null };
export type GameSession = {
  id: string; title: string; description?: string; script: string;
  starts_at: string; ends_at: string; location: string;
  capacity: number; newcomer_seats: number; release_hours: number;
  beginners_welcome: boolean; visibility: 'public' | 'members';
  status: 'published' | 'cancelled';
  confirmed_count: number; waitlist_count: number;
  my_status: BookingStatus | null; my_offer_expires_at?: string | null;
  occupied_seats?: number[]; my_seat?: number | null;
  member_seats_free?: number; traveller_seats_free?: number; my_guests?: MyGuest[];
  participants: Participant[];
};
export type Booking = { id: string; session_id: string; user_id: string | null; guest_name: string | null; sponsor_id: string | null; status: BookingStatus; pool: 'circle' | 'newcomer'; created_at: string; offer_expires_at: string | null; profile?: Profile | null; };
export type Invitation = { id: string; sponsor_id: string; expires_at: string; used_by: string | null; created_at: string; };
export type AppData = { profile: Profile | null; sessions: GameSession[]; invitations: Invitation[]; demo: boolean; configured: boolean; local?: boolean; error?: string; accountNotice?: string; };
export type ActionResult = { ok: boolean; message: string; value?: string; };
export type SessionInput = Omit<GameSession, 'id' | 'status' | 'confirmed_count' | 'waitlist_count' | 'my_status' | 'my_offer_expires_at' | 'occupied_seats' | 'my_seat' | 'participants' | 'member_seats_free' | 'traveller_seats_free' | 'my_guests'> & { address: string; id?: string; };
```

- [ ] **Step 4 : ajouter la validation du prénom**

Dans `lib/schemas.ts`, ajouter à la fin :

```ts
export const guestNameSchema = z.string().trim().min(2, 'Indique un prénom ou un pseudo de 2 à 40 caractères.').max(40, 'Indique un prénom ou un pseudo de 2 à 40 caractères.');
```

- [ ] **Step 5 : écrire `lib/guests.ts`**

```ts
import type { Booking, BookingStatus, GameSession, Membership, MyGuest, Participant, ParticipantRole, Profile } from './types';
import { MAX_GUESTS_PER_PERSON } from './session-rules';
import { activeBooking, dateLong } from './utils';

export const roleLabels: Record<ParticipantRole, string> = { member: 'membre', guest: 'invité·e', traveller: 'voyageur·se', traveller_guest: 'voyageur·se' };
export const membershipLabels: Record<Membership, string> = { organizer: 'Organisation', member: 'Membre', newcomer: 'Voyageur·se', suspended: 'Suspendu·e' };
export const guestStatusLabels: Record<BookingStatus, string> = { confirmed: 'place confirmée', pending: 'en attente de validation', waitlisted: 'en liste d’attente', offered: 'place proposée', declined: 'non retenu·e', cancelled: 'place libérée' };

const brought = (role?: ParticipantRole) => role === 'guest' || role === 'traveller_guest';

/** « membre », « voyageur·se », « invité·e de Léa », or « ton invité·e » for the viewer's own guests. */
export function participantLabel(p: Participant, { mine = false } = {}): string {
  const role = p.role ?? 'member';
  if (!brought(role)) return roleLabels[role];
  if (mine) return role === 'guest' ? 'ton invité·e' : 'ton ami·e';
  return p.invited_by ? `${roleLabels[role]} de ${p.invited_by}` : roleLabels[role];
}

/** Organizer view of a booking: « Membre », « Voyageur·se », « Invité·e de Léa »… */
export function bookingLabel(b: Booking, sponsorName: string): string {
  if (!b.user_id) return `${b.pool === 'circle' ? 'Invité·e' : 'Voyageur·se'} de ${sponsorName}`;
  return membershipLabels[b.profile?.membership ?? 'member'];
}

export function activeGuests(session: GameSession): MyGuest[] {
  return (session.my_guests ?? []).filter(g => activeBooking(g.status));
}

/** Organizers, confirmed players and sponsors of a confirmed guest, who passes the address on. */
export function canSeeAddress(session: GameSession, profile: Pick<Profile, 'membership'> | null): boolean {
  if (!profile) return false;
  return profile.membership === 'organizer' || session.my_status === 'confirmed' || (session.my_guests ?? []).some(g => g.status === 'confirmed');
}

export type SeatPlan = {
  /** What a click on a free + does for this viewer. */
  onFreeSeat: 'signin' | 'book' | 'guest' | null;
  /** The waitlist button shown when no + suits this viewer. */
  waitlist: 'self' | 'guest' | null;
  /** The viewer already brings the maximum number of people. */
  limitReached: boolean;
  /** Bring someone without registering yourself. */
  canBringOther: boolean;
};

export function seatPlan(session: GameSession, profile: Pick<Profile, 'membership'> | null, now = Date.now()): SeatPlan {
  const none: SeatPlan = { onFreeSeat: null, waitlist: null, limitReached: false, canBringOther: false };
  if (session.status === 'cancelled' || Date.parse(session.starts_at) <= now + 30 * 60000) return none;
  const total = Math.max(0, session.capacity - session.confirmed_count);
  if (!profile) return { ...none, onFreeSeat: total > 0 ? 'signin' : null, waitlist: total > 0 ? null : 'self' };
  if (session.my_status === 'declined') return none;
  // Seats are counted per kind until quotas merge: travellers and their friends only use traveller seats.
  const free = (profile.membership === 'newcomer' ? session.traveller_seats_free : session.member_seats_free) ?? total;
  const limitReached = activeGuests(session).length >= MAX_GUESTS_PER_PERSON;
  if (!activeBooking(session.my_status)) return { onFreeSeat: free > 0 ? 'book' : null, waitlist: free > 0 ? null : 'self', limitReached, canBringOther: !limitReached };
  if (limitReached) return { ...none, limitReached };
  return { ...none, onFreeSeat: free > 0 ? 'guest' : null, waitlist: free > 0 ? null : 'guest' };
}

/** Explains why the viewer lands on the waitlist although the circle still shows free tokens. */
export function waitlistHint(session: GameSession, traveller: boolean, now = Date.now()): string {
  const left = Math.max(0, session.capacity - session.confirmed_count);
  if (!left) return 'Le cercle est complet, mais une place se libère souvent.';
  const merge = Date.parse(session.starts_at) - session.release_hours * 3600000;
  const until = merge > now ? ` jusqu’au ${dateLong(new Date(merge).toISOString())}` : '';
  const rest = left > 1 ? `Les ${left} places restantes sont réservées` : 'La place restante est réservée';
  return `Les places ${traveller ? 'voyageurs' : 'membres'} sont prises. ${rest} aux ${traveller ? 'membres' : 'voyageurs'}${until}.`;
}

export type RequestGroup = { key: string; sessionId: string; personId: string; person?: Profile; own?: Booking; guests: Booking[] };

/** Pending requests grouped by session and by the account that made them. */
export function groupRequests(bookings: Booking[], profiles: Profile[]): RequestGroup[] {
  const groups = new Map<string, RequestGroup>();
  for (const b of bookings) {
    const personId = b.user_id ?? b.sponsor_id;
    if (b.status !== 'pending' || !personId) continue;
    const key = `${b.session_id}:${personId}`;
    const group = groups.get(key) ?? { key, sessionId: b.session_id, personId, person: profiles.find(p => p.id === personId), guests: [] };
    if (b.user_id) group.own = b; else group.guests.push(b);
    groups.set(key, group);
  }
  return [...groups.values()];
}

/** Each account's booking followed by the people it brings; guests of absent sponsors come last. */
export function orderBySponsor(bookings: Booking[]): Booking[] {
  const people = bookings.filter(b => b.user_id);
  const guests = bookings.filter(b => !b.user_id);
  const present = new Set(people.map(b => b.user_id));
  return [...people.flatMap(b => [b, ...guests.filter(g => g.sponsor_id === b.user_id)]), ...guests.filter(g => !present.has(g.sponsor_id))];
}

/** Names the viewer brought recently, newest first, without the people already coming. */
export function recentGuestNames(sessions: GameSession[], current: GameSession, limit = 5): string[] {
  const seen = new Set(activeGuests(current).map(g => g.name.toLocaleLowerCase('fr')));
  const names: string[] = [];
  for (const s of [...sessions].sort((x, y) => Date.parse(y.starts_at) - Date.parse(x.starts_at))) {
    for (const g of s.my_guests ?? []) {
      const key = g.name.toLocaleLowerCase('fr');
      if (g.name === 'Invité·e' || seen.has(key)) continue;
      seen.add(key);
      names.push(g.name);
    }
  }
  return names.slice(0, limit);
}
```

- [ ] **Step 6 : vérifier**

Run: `pnpm exec tsx --test tests/guests.test.ts`
Expected: PASS.
Run: `pnpm typecheck`
Expected: PASS. Les composants existants compilent toujours : les nouveaux champs sont facultatifs.

- [ ] **Step 7 : commit**

```bash
git add lib/types.ts lib/schemas.ts lib/guests.ts tests/guests.test.ts
git commit -m "Add guest types and pure helpers for labels, seat actions and grouping"
```

---

### Task 6 : actions serveur et accès à l'adresse

**Files :**
- Modify: `app/actions.ts`
- Modify: `app/page.tsx`
- Modify: `app/api/calendar/[id]/route.ts`

**Interfaces :**
- Consumes : les RPC des tâches 1 et 3, `guestNameSchema` et `canSeeAddress` (tâche 5).
- Produces :
  - `addGuest(sessionId: string, name: string, seat?: number): Promise<ActionResult>` ;
  - `removeGuest(bookingId: string)` ;
  - `acceptGuestOffer(bookingId: string)` ;
  - `reviewRequest(sessionId: string, personId: string, approve: boolean, promote?: boolean)` ;
  - `cancelBooking(id: string, guestIds?: string[])`.

- [ ] **Step 1 : compléter `app/actions.ts`**

Remplacer l'import des schémas :

```ts
import { profileSchema, sessionSchema, guestNameSchema } from '@/lib/schemas';
```

Remplacer la ligne `export async function cancelBooking(id: string) { … }` par :

```ts
const isUuid = (value: string) => z.uuid().safeParse(value).success;
export async function cancelBooking(id: string, guestIds: string[] = []) {
  if (!isUuid(id) || !guestIds.every(isUuid)) return failure(new Error('Participation invalide.'));
  // Guests the player chose to release go first, so their seats are offered in the same refresh.
  for (const guestId of guestIds) { const released = await rpc('remove_guest', { p_booking: guestId }); if (!released.ok) return released; }
  return rpc('cancel_booking', { p_id: id }, guestIds.length ? 'Vos places sont libérées. À une prochaine !' : 'Ton désistement est enregistré. À une prochaine !');
}
export async function addGuest(sessionId: string, name: string, seat?: number): Promise<ActionResult> {
  if (!isUuid(sessionId)) return failure(new Error('Session invalide.'));
  const parsed = guestNameSchema.safeParse(name);
  if (!parsed.success) return failure(parsed.error);
  if (seat !== undefined && !z.number().int().min(0).max(19).safeParse(seat).success) return failure(new Error('Place invalide.'));
  const result = await rpc('add_guest', { p_session: sessionId, p_name: parsed.data, p_seat: seat ?? null });
  if (!result.ok) return result;
  const who = parsed.data;
  return { ...result, message: result.value === 'confirmed' ? `${who} a sa place !` : result.value === 'pending' ? `Demande envoyée pour ${who}.` : `${who} est sur la liste d’attente.` };
}
export async function removeGuest(bookingId: string) { if (!isUuid(bookingId)) return failure(new Error('Invité·e introuvable.')); return rpc('remove_guest', { p_booking: bookingId }, 'Sa place est libérée.'); }
export async function acceptGuestOffer(bookingId: string) { if (!isUuid(bookingId)) return failure(new Error('Invité·e introuvable.')); return rpc('accept_guest_offer', { p_booking: bookingId }, 'Sa place est confirmée !'); }
export async function reviewRequest(sessionId: string, personId: string, approve: boolean, promote = false) {
  if (!isUuid(sessionId) || !isUuid(personId)) return failure(new Error('Demande invalide.'));
  return rpc('review_request', { p_session: sessionId, p_person: personId, p_approve: approve, p_promote: promote }, !approve ? 'La demande a été refusée.' : promote ? 'Demande validée : bienvenue au nouveau membre.' : 'La demande est validée.');
}
```

- [ ] **Step 2 : faire passer l'adresse par `canSeeAddress`**

Dans `app/page.tsx`, ajouter `import { canSeeAddress } from '@/lib/guests';`, puis remplacer la ligne `const addresses = …` par :

```ts
  const addresses = await getAddresses(data.sessions.filter(s => canSeeAddress(s, data.profile)).map(s => s.id));
```

Dans `app/api/calendar/[id]/route.ts`, ajouter `import { canSeeAddress } from '@/lib/guests';`, puis remplacer la ligne `const address = …` par :

```ts
  const address = canSeeAddress(session, data.profile) ? await getAddress(id) : null;
```

- [ ] **Step 3 : vérifier**

Run: `pnpm typecheck && pnpm test`
Expected: PASS.

- [ ] **Step 4 : commit**

```bash
git add app/actions.ts app/page.tsx "app/api/calendar/[id]/route.ts"
git commit -m "Add guest server actions and share the address with sponsors"
```

---

### Task 7 : jetons du cercle, démo et seed

**Files :**
- Modify: `components/tableau.tsx` (remplacer le fichier)
- Modify: `app/globals.css` (ajout à la fin)
- Modify: `lib/fixtures.ts`
- Modify: `scripts/seed.ts`

**Interfaces :**
- Consumes : `Participant`, `MyGuest` et `participantLabel` (tâche 5).
- Produces : `VillageCircle` accepte en plus `chooseLabel?: string`, `ownGuests?: MyGuest[]` et `onOwnGuest?: (guest: MyGuest) => void`.

- [ ] **Step 1 : remplacer `components/tableau.tsx`**

```tsx
import type { CSSProperties } from 'react';
import { BookOpen, Link2 } from 'lucide-react';
import type { MyGuest, Participant } from '@/lib/types';
import { initials } from '@/lib/utils';
import { participantLabel } from '@/lib/guests';

/** Original vector interpretation of the Tour Tanguy in Brest. */
export function TourTanguy({ ornate = false }: { ornate?: boolean }) {
  return <svg viewBox="0 0 120 160" fill="none" aria-hidden="true" className="tower-mark">
    {ornate && <circle cx="60" cy="71" r="49" stroke="currentColor" strokeWidth=".8" opacity=".2" />}
    <use href="/logo-tour-tanguy.svg#tour-tanguy" />
  </svg>;
}

type CircleProps = {
  reserved: number; capacity: number; occupiedSeats?: number[];
  participants?: Participant[]; mySeat?: number | null;
  interactive?: boolean; onChoose?: (seat: number) => void; chooseLabel?: string;
  onOwnSeat?: () => void; ownSeatLabel?: string; busy?: boolean;
  ownGuests?: MyGuest[]; onOwnGuest?: (guest: MyGuest) => void;
};

export function VillageCircle({ reserved, capacity, occupiedSeats, participants = [], mySeat, interactive = false, onChoose, chooseLabel = 'Prendre la place', onOwnSeat, ownSeatLabel = 'Ta place', busy = false, ownGuests = [], onOwnGuest }: CircleProps) {
  const occupied = new Set(occupiedSeats ?? Array.from({ length: reserved }, (_, i) => i));
  return <div className={`village-circle ${interactive ? 'booking-circle' : ''} ${capacity > 14 ? 'dense-circle' : ''}`} role={interactive ? 'group' : 'img'} aria-busy={busy || undefined} aria-label={`${reserved} places réservées sur ${capacity}`}>
    <div className="village-orbit" />
    <div className="village-center"><TourTanguy ornate /><span>{reserved}<i> / {capacity}</i></span></div>
    {Array.from({ length: capacity }, (_, i) => {
      const angle = (i / capacity) * Math.PI * 2 - Math.PI / 2;
      const style = { left: `${(50 + 43 * Math.cos(angle)).toFixed(3)}%`, top: `${(50 + 43 * Math.sin(angle)).toFixed(3)}%` } as CSSProperties;
      const taken = occupied.has(i);
      const own = mySeat === i && taken;
      // The viewer's own guests stay actionable, even while an offer is not yet confirmed.
      const guest = taken && !own ? ownGuests.find(g => g.seat_index === i && (g.status === 'confirmed' || g.status === 'offered')) : undefined;
      const person = participants.find(p => p.seat_index === i);
      const name = own ? 'Toi' : guest?.name ?? person?.display_name;
      const brought = !!guest || person?.role === 'guest' || person?.role === 'traveller_guest';
      const traveller = person?.role === 'traveller' || person?.role === 'traveller_guest';
      const willing = taken && person?.can_storytell;
      const detail = guest ? guest.status === 'offered' ? 'place proposée · confirmer' : `${person ? participantLabel(person, { mine: true }) : 'ton invité·e'} · retirer` : person && !own ? participantLabel(person) : '';
      const seatLabel = own ? ownSeatLabel : taken ? [`Place ${i + 1}`, name || 'Réservée', detail].filter(Boolean).join(' · ') : onChoose ? `${chooseLabel} ${i + 1}` : `Place ${i + 1} · Libre`;
      const label = `${seatLabel}${willing ? ' · Volontaire MJ' : ''}`;
      const content = <>{taken ? name ? <span className="token-initials">{own ? 'Toi' : initials(name)}</span> : <span className="token-person" /> : <span aria-hidden="true">+</span>}{willing && <span className="token-storyteller" aria-hidden="true"><BookOpen size={12} /></span>}{brought && <span className="token-guest" aria-hidden="true"><Link2 size={11} /></span>}{interactive && name && <span className="token-name">{name}</span>}</>;
      const className = `village-token ${taken ? 'taken' : 'empty'} ${own ? 'is-mine' : ''} ${traveller ? 'is-traveller' : ''} ${guest ? 'is-my-guest' : ''}`;
      if (interactive && ((!taken && onChoose) || (own && onOwnSeat) || (guest && onOwnGuest))) return <button type="button" key={i} className={className} style={style} aria-label={label} title={label} disabled={busy} onClick={() => own ? onOwnSeat?.() : guest ? onOwnGuest?.(guest) : onChoose?.(i)}>{content}</button>;
      return <span className={className} key={i} style={style} aria-hidden={!interactive || undefined} aria-label={interactive ? label : undefined} title={interactive ? label : undefined}>{content}</span>;
    })}
  </div>;
}
```

- [ ] **Step 2 : styles des jetons**

Ajouter à la fin de `app/globals.css` :

```css
/* Who brought whom: a dashed ring for travellers, a link badge for people brought by someone. */
.village-token.taken.is-traveller { border-style: dashed; }
.booking-circle .village-token.taken.is-traveller { background: #f1e2c4; border: 2px dashed #9b6a2f; }
.token-guest { position: absolute; bottom: -4px; left: -4px; display: grid; place-items: center; width: 19px; height: 19px; border: 1px solid #e7c78f; border-radius: 50%; color: #f7d69e; background: #352526; pointer-events: none; }
.booking-circle .village-token.is-my-guest { box-shadow: inset 0 0 0 3px #d4a94d55, 0 0 0 4px #f3c67540, 0 4px 0 #130f20; }
```

- [ ] **Step 3 : données de démo avec les quatre statuts**

Dans `lib/fixtures.ts` :
1. Remplacer la première ligne par `import type { AppData, GameSession, Participant, Profile } from './types';`.
2. Ajouter, juste après la ligne `const people = …` :

```ts
/** The four statuses around one table: members, a member's guests, a traveller and the friend they bring. */
const village: Participant[] = [
  { display_name: 'Léa', avatar_color: 'rose', seat_index: 0, role: 'member', can_storytell: true },
  { display_name: 'Paul', avatar_color: 'rose', seat_index: 1, role: 'guest', invited_by: 'Léa' },
  { display_name: 'Thomas', avatar_color: 'blue', seat_index: 2, role: 'member' },
  { display_name: 'Manon', avatar_color: 'sage', seat_index: 4, role: 'member' },
  { display_name: 'Inès', avatar_color: 'sage', seat_index: 5, role: 'guest', invited_by: 'Manon' },
  { display_name: 'Hugo', avatar_color: 'ochre', seat_index: 7, role: 'traveller' },
  { display_name: 'Nora', avatar_color: 'ochre', seat_index: 8, role: 'traveller_guest', invited_by: 'Hugo' },
  { display_name: 'Sarah', avatar_color: 'lilac', seat_index: 10, role: 'member' },
];
const welcome: Participant[] = [
  { display_name: 'Léa', avatar_color: 'rose', seat_index: 0, role: 'member' },
  { display_name: 'Thomas', avatar_color: 'blue', seat_index: 1, role: 'member' },
  { display_name: 'Manon', avatar_color: 'sage', seat_index: 2, role: 'member' },
  { display_name: 'Camille', avatar_color: 'rose', seat_index: 3, role: 'member' },
  { display_name: 'Antoine', avatar_color: 'rose', seat_index: 4, role: 'guest', invited_by: 'Camille' },
];
```

3. Dans la session `une-nuit-a-ravenswood`, remplacer `confirmed_count: 8, waitlist_count: 0, my_status: null, participants: people }` par :

```ts
confirmed_count: 8, waitlist_count: 0, my_status: null, occupied_seats: [0, 1, 2, 4, 5, 7, 8, 10], member_seats_free: 3, traveller_seats_free: 1, my_guests: [], participants: village }
```

4. Dans la session `bienvenue-au-village`, remplacer `confirmed_count: 4, waitlist_count: 0, my_status: 'confirmed', participants: people.slice(0, 3) }` par :

```ts
confirmed_count: 5, waitlist_count: 0, my_status: 'confirmed', my_seat: 3, occupied_seats: [0, 1, 2, 3, 4], member_seats_free: 1, traveller_seats_free: 4, my_guests: [{ id: 'demo-antoine', name: 'Antoine', status: 'confirmed', seat_index: 4, offer_expires_at: null }], participants: welcome }
```

- [ ] **Step 4 : adapter le seed**

Dans `scripts/seed.ts` :
1. Remplacer `const {id,confirmed_count,waitlist_count,my_status,participants,...session}=s;` par :

```ts
 const {id,confirmed_count,waitlist_count,my_status,participants,occupied_seats,my_seat,my_guests,member_seats_free,traveller_seats_free,...session}=s;
```

2. Juste après `const {error:bError}=await db.from('bookings').insert(rows);if(bError)throw bError;`, ajouter :

```ts
 // Guests have no account: Léa's guest has a seat at once, Maxime's friend waits with him for review.
 if(index===0){const {error:gError}=await db.from('bookings').insert([{session_id:sid,guest_name:'Paul',sponsor_id:ids[1],status:'confirmed',pool:'circle'},{session_id:sid,guest_name:'Nora',sponsor_id:ids[13],status:'pending',pool:'newcomer'}]);if(gError)throw gError;}
```

- [ ] **Step 5 : vérifier**

Run: `pnpm typecheck && pnpm test`
Expected: PASS.

Contrôle visuel en mode démo (sans Docker) : lancer `DEMO_MODE=true pnpm dev`, puis ouvrir http://127.0.0.1:3000. La première partie, dépliée, doit montrer :
- un anneau pointillé sur Hugo et Nora ;
- un maillon sur Paul, Inès et Nora ;
- le badge MJ sur Léa.

Au survol, Paul affiche « Place 2 · Paul · invité·e de Léa ». Arrêter ensuite le serveur.

- [ ] **Step 6 : commit**

```bash
git add components/tableau.tsx app/globals.css lib/fixtures.ts scripts/seed.ts
git commit -m "Show travellers and brought guests on the village circle"
```

---

### Task 8 : parcours joueur (ajouter, retirer, confirmer, se désister)

**Files :**
- Create: `components/guest-dialog.tsx`
- Create: `components/session-guests.tsx`
- Modify: `components/session-detail.tsx` (remplacer le fichier)
- Modify: `components/session-card.tsx`
- Modify: `components/dashboard.tsx`
- Modify: `app/globals.css`

**Interfaces :**
- Consumes :
  - tâche 5 : `seatPlan`, `waitlistHint`, `activeGuests`, `canSeeAddress`, `participantLabel`, `recentGuestNames`, `guestStatusLabels` ;
  - tâche 6 : `addGuest`, `removeGuest`, `acceptGuestOffer`, `cancelBooking(id, guestIds)` ;
  - tâche 7 : `VillageCircle` et ses nouvelles props.
- Produces :
  - `GuestForm({ sessionId, seat?, traveller, waitlist, suggestions, onDone })` ;
  - `SessionGuests({ session, hint, busy, onAdd?, onRemove, onConfirm })`.

- [ ] **Step 1 : créer `components/guest-dialog.tsx`**

```tsx
'use client';
import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import type { ActionResult } from '@/lib/types';
import { addGuest } from '@/app/actions';
import { useAction, Feedback } from './action-feedback';

/** Brings someone without an account: a first name is all we keep. */
export function GuestForm({ sessionId, seat, traveller, waitlist, suggestions, onDone }: { sessionId: string; seat?: number; traveller: boolean; waitlist: boolean; suggestions: string[]; onDone: (result: ActionResult) => void }) {
  const a = useAction();
  const [name, setName] = useState('');
  const who = name.trim() || 'Cette personne';
  const note = traveller ? `Comme toi, ${who} attendra la validation d’un organisateur.`
    : waitlist ? `Les places membres sont prises : ${who} rejoint la liste d’attente et tu seras prévenu·e dès qu’une place se libère.`
    : `${who} a sa place tout de suite, affiché·e comme ton invité·e. Préviens-le·la de l’heure et du lieu.`;
  const label = traveller ? 'Demander sa place' : waitlist ? 'Mettre en liste d’attente' : name.trim() ? `Placer ${name.trim()}` : 'Placer cette personne';
  return <form className="stack guest-form" onSubmit={e => { e.preventDefault(); a.run(() => addGuest(sessionId, name, seat), onDone); }}>
    <label className="field">Prénom ou pseudo<input autoFocus required minLength={2} maxLength={40} autoComplete="off" value={name} onChange={e => setName(e.target.value)} placeholder="Antoine" /></label>
    {suggestions.length > 0 && <div className="guest-suggestions"><span>Récemment :</span>{suggestions.map(s => <button type="button" key={s} className="guest-chip" aria-pressed={name === s} onClick={() => setName(s)}>{s}</button>)}</div>}
    <p className="muted">{note}</p>
    <Feedback result={a.result} />
    <button className="button primary full" disabled={a.pending}><UserPlus size={17} />{a.pending ? 'Enregistrement…' : label}</button>
  </form>;
}
```

- [ ] **Step 2 : créer `components/session-guests.tsx`**

```tsx
'use client';
import { Check, UserPlus } from 'lucide-react';
import type { GameSession, MyGuest } from '@/lib/types';
import { MAX_GUESTS_PER_PERSON } from '@/lib/session-rules';
import { activeGuests, guestStatusLabels } from '@/lib/guests';
import { dateLong, time } from '@/lib/utils';

/** The people the viewer brings to this session, and what they can still do for each of them. */
export function SessionGuests({ session, hint, busy, onAdd, onRemove, onConfirm }: { session: GameSession; hint: string; busy: boolean; onAdd?: () => void; onRemove: (guest: MyGuest) => void; onConfirm: (guest: MyGuest) => void }) {
  const guests = (session.my_guests ?? []).filter(g => g.status !== 'cancelled');
  return <section className="my-guests" aria-label="Les personnes que tu amènes">
    <div className="my-guests-heading">
      <p>Tes invités <span>· {activeGuests(session).length} sur {MAX_GUESTS_PER_PERSON}</span></p>
      {onAdd && <button type="button" className="button secondary compact" disabled={busy} onClick={onAdd}><UserPlus size={15} />Ajouter</button>}
    </div>
    {hint && <p className="my-guests-hint">{hint}</p>}
    {guests.map(g => <div className="my-guest-row" key={g.id}>
      <span>{g.name} <small className={`guest-status guest-status-${g.status}`}>· {guestStatusLabels[g.status]}{g.status === 'offered' && g.offer_expires_at ? ` jusqu’au ${dateLong(g.offer_expires_at)} à ${time(g.offer_expires_at)}` : ''}</small></span>
      <span className="row-actions">
        {g.status === 'offered' && <button type="button" className="button quiet compact" disabled={busy} onClick={() => onConfirm(g)}><Check size={15} />Confirmer pour {g.name}</button>}
        {g.status !== 'declined' && <button type="button" className="button ghost compact" disabled={busy} onClick={() => onRemove(g)}>Retirer</button>}
      </span>
    </div>)}
  </section>;
}
```

- [ ] **Step 3 : remplacer `components/session-detail.tsx`**

```tsx
'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CalendarDays, Clock3, MapPin, ChevronLeft, LockKeyhole, BookOpen } from 'lucide-react';
import type { ActionResult, AppData, GameSession, MyGuest } from '@/lib/types';
import { dateLong, time, activeBooking } from '@/lib/utils';
import { mapsUrl } from '@/lib/locations';
import { activeGuests, canSeeAddress, participantLabel, recentGuestNames, seatPlan, waitlistHint } from '@/lib/guests';
import { MAX_GUESTS_PER_PERSON } from '@/lib/session-rules';
import { CalendarLink } from './calendar-link';
import { Dialog } from './dialog';
import { AuthForm } from './auth';
import { VillageCircle } from './tableau';
import { GuestForm } from './guest-dialog';
import { SessionGuests } from './session-guests';
import { useAction, Feedback } from './action-feedback';
import { bookSession, cancelBooking, acceptOffer, removeGuest, acceptGuestOffer } from '@/app/actions';
import { Avatar } from './ui';

export function SessionDetail({ data, session: s, address, embedded = false }: { data: AppData; session: GameSession; address: string | null; embedded?: boolean }) {
  const a = useAction();
  const router = useRouter();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [releasedGuests, setReleasedGuests] = useState<string[]>([]);
  const [authRequest, setAuthRequest] = useState<{ seat?: number } | null>(null);
  const [guestRequest, setGuestRequest] = useState<{ seat?: number } | null>(null);
  const [removing, setRemoving] = useState<MyGuest | null>(null);
  const plan = seatPlan(s, data.profile);
  const traveller = data.profile?.membership === 'newcomer';
  const guests = activeGuests(s);
  const active = activeBooking(s.my_status);
  const closed = s.status === 'cancelled' || new Date(s.starts_at).getTime() <= Date.now() + 30 * 60000;
  const offered = s.my_status === 'offered';
  const liveOffer = offered && s.my_seat != null && !!s.my_offer_expires_at && new Date(s.my_offer_expires_at).getTime() > Date.now();
  const openCancel = () => { a.setResult(null); setReleasedGuests(guests.map(g => g.id)); setCancelOpen(true); };
  const openGuest = (seat?: number) => { a.setResult(null); setGuestRequest({ seat }); };
  const reserve = (seat?: number) => a.run(async () => {
    const result = await bookSession(s.id, seat);
    if (!result.ok) router.refresh();
    return result;
  });
  const choose = (seat?: number) => {
    if (!data.profile) return setAuthRequest({ seat });
    if (plan.onFreeSeat === 'guest') return openGuest(seat);
    reserve(seat);
  };
  const ownGuest = (guest: MyGuest) => {
    if (guest.status === 'offered') return a.run(() => acceptGuestOffer(guest.id));
    a.setResult(null);
    setRemoving(guest);
  };
  const guestAdded = (result: ActionResult) => { setGuestRequest(null); a.setResult(result); };
  const heading = s.status === 'cancelled' ? 'Partie annulée' : s.my_status === 'confirmed' ? 'Tu es inscrit·e.' : closed ? 'Inscriptions closes' : offered ? liveOffer ? 'Une place pour toi.' : 'Proposition expirée.' : s.my_status === 'pending' ? 'Demande envoyée.' : s.my_status === 'waitlisted' ? 'Tu es en attente.' : s.my_status === 'declined' ? 'Participation non retenue' : 'Inscris-toi';
  const hint = s.status === 'cancelled' ? 'On se retrouve à une prochaine soirée.' : s.my_status === 'confirmed' ? '' : closed ? 'Rendez-vous à la prochaine partie.' : offered ? liveOffer ? 'Clique sur ton jeton pour confirmer.' : 'Retire ta demande pour rejoindre à nouveau la liste d’attente.' : s.my_status === 'pending' ? 'Un organisateur va valider ta demande.' : s.my_status === 'waitlisted' ? 'On te prévient par e-mail dès qu’une place se libère.' : s.my_status === 'declined' ? 'Contacte un organisateur pour en discuter.' : plan.waitlist === 'self' ? waitlistHint(s, traveller) : data.profile ? 'Clique sur un + pour choisir ta place.' : 'Clique sur un + pour choisir ta place. Il te faudra juste ton e-mail.';
  const guestHint = plan.limitReached ? `Tu amènes déjà ${MAX_GUESTS_PER_PERSON} personnes, le maximum par partie.` : plan.onFreeSeat === 'guest' ? traveller ? 'Clique sur un + libre pour demander une place pour un·e ami·e.' : 'Clique sur un + libre pour placer quelqu’un.' : plan.waitlist === 'guest' ? waitlistHint(s, traveller) : '';
  const showGuests = !!data.profile && s.status !== 'cancelled' && (active || (s.my_guests ?? []).some(g => g.status !== 'cancelled'));
  const privateAddress = canSeeAddress(s, data.profile) ? address : null;
  const practical = <div className={`detail-when ${embedded ? 'session-practical' : ''}`}>
    {s.status === 'published' ? <CalendarLink session={s} address={privateAddress} /> : <span><CalendarDays size={16} />{dateLong(s.starts_at)}</span>}
    <span><Clock3 size={16} />{time(s.starts_at)}</span><a className="practical-link" href={mapsUrl(privateAddress || s.location)} target="_blank" rel="noopener noreferrer" title="Ouvrir le lieu dans Maps"><MapPin size={16} />{s.location}</a>
  </div>;
  return <>
    {!embedded && <Link className="back-link" href="/"><ChevronLeft size={16} />Les parties</Link>}
    {!embedded && <div className="detail-heading">
      <h1>{s.title}</h1>
      <div className="detail-badges"><span className="script-tag">{s.script}</span>{s.visibility === 'members' && <span className="badge"><LockKeyhole size={14} />Membres et invités</span>}</div>
      {practical}
    </div>}
    {embedded && practical}
    <section className="session-table" aria-label={`Inscriptions pour ${s.title}`}>
      {(s.my_status !== 'confirmed' || s.status === 'cancelled') && <div className="session-table-status">
        <p className="session-status-title" aria-live="polite">{heading}</p>
        {hint && <p className="table-hint">{hint}</p>}
        {plan.waitlist === 'self' && <button className="button parchment" disabled={a.pending} onClick={() => choose()}>Rejoindre la liste d’attente</button>}
        {liveOffer && !closed && <p className="table-note">À confirmer avant le {s.my_offer_expires_at ? `${dateLong(s.my_offer_expires_at)} à ${time(s.my_offer_expires_at)}` : 'délai indiqué'}.</p>}
        {(active || plan.canBringOther) && s.status !== 'cancelled' && <div className="table-actions">
          {plan.canBringOther && <button className="text-link" disabled={a.pending} onClick={() => openGuest()}>Inscrire quelqu’un d’autre</button>}
          {active && <button className="text-link" disabled={a.pending} onClick={openCancel}>Retirer ma demande</button>}
        </div>}
      </div>}
      <div className="session-table-board">
        <VillageCircle reserved={s.confirmed_count} capacity={s.capacity} occupiedSeats={s.occupied_seats} participants={s.participants} mySeat={s.my_seat} interactive busy={a.pending}
          onChoose={plan.onFreeSeat ? choose : undefined}
          chooseLabel={plan.onFreeSeat === 'guest' ? 'Placer quelqu’un à la place' : 'Prendre la place'}
          onOwnSeat={s.status === 'cancelled' ? undefined : liveOffer && !closed ? () => a.run(() => acceptOffer(s.id)) : s.my_status === 'confirmed' ? openCancel : undefined}
          ownSeatLabel={offered ? 'Confirmer ma place' : 'Ta place · me désister'}
          ownGuests={s.my_guests} onOwnGuest={s.status === 'cancelled' ? undefined : ownGuest} />
        {showGuests && <SessionGuests session={s} hint={guestHint} busy={a.pending}
          onAdd={active && (plan.onFreeSeat === 'guest' || plan.waitlist === 'guest') ? () => openGuest() : undefined}
          onRemove={g => { a.setResult(null); setRemoving(g); }} onConfirm={g => a.run(() => acceptGuestOffer(g.id))} />}
        {s.participants.length > 0 && <ul className="circle-roster" aria-label="Participants confirmés">{[...s.participants].sort((x, y) => (x.seat_index ?? 0) - (y.seat_index ?? 0)).map((p, index) => {
          const mine = p.seat_index != null && guests.some(g => g.seat_index === p.seat_index);
          return <li key={p.seat_index ?? index}><Avatar name={p.display_name} color={p.avatar_color} small /><span>{p.display_name}{s.my_seat != null && p.seat_index === s.my_seat && <small> · toi</small>}<small className="roster-role">{participantLabel(p, { mine })}</small></span>{p.can_storytell && <BookOpen size={15} role="img" aria-label="Volontaire MJ"><title>Volontaire MJ</title></BookOpen>}</li>;
        })}</ul>}
      </div>
      <Feedback result={a.result} />
    </section>
    <Dialog open={authRequest !== null} onClose={() => setAuthRequest(null)} title="Rejoins le cercle"><AuthForm configured={data.configured} onSuccess={() => { const seat = authRequest?.seat; setAuthRequest(null); reserve(seat); }} /></Dialog>
    <Dialog open={guestRequest !== null} onClose={() => setGuestRequest(null)} title={active ? traveller ? 'Qui vient avec toi ?' : 'Qui t’accompagne ?' : 'Qui inscris-tu ?'}>
      {guestRequest && <GuestForm sessionId={s.id} seat={guestRequest.seat} traveller={traveller} waitlist={!traveller && (s.member_seats_free ?? Math.max(0, s.capacity - s.confirmed_count)) === 0} suggestions={recentGuestNames(data.sessions, s)} onDone={guestAdded} />}
    </Dialog>
    <Dialog open={removing !== null} onClose={() => setRemoving(null)} title={`Retirer ${removing?.name ?? ''} ?`}><div className="stack"><p>Sa place sera proposée à quelqu’un d’autre.</p><div className="button-row"><button className="button secondary" onClick={() => setRemoving(null)}>Garder sa place</button><button className="button danger" disabled={a.pending} onClick={() => removing && a.run(() => removeGuest(removing.id), () => setRemoving(null))}>Retirer {removing?.name}</button></div><Feedback result={a.result} /></div></Dialog>
    <Dialog open={cancelOpen} onClose={() => setCancelOpen(false)} title="Libérer ta place ?"><div className="stack">
      <p>Elle sera proposée à quelqu’un d’autre. Tu pourras te réinscrire s’il reste de la place.</p>
      {guests.length > 0 && <fieldset className="guest-release"><legend>Les personnes que tu amènes</legend>{guests.map(g => <label key={g.id} className="check-field"><input type="checkbox" checked={releasedGuests.includes(g.id)} onChange={e => setReleasedGuests(ids => e.target.checked ? [...ids, g.id] : ids.filter(id => id !== g.id))} /><span>Libérer aussi la place de {g.name}</span></label>)}</fieldset>}
      <div className="button-row"><button className="button secondary" onClick={() => setCancelOpen(false)}>Garder ma place</button><button className="button danger" disabled={a.pending} onClick={() => a.run(() => cancelBooking(s.id, releasedGuests), () => setCancelOpen(false))}>Confirmer mon désistement</button></div>
      <Feedback result={a.result} />
    </div></Dialog>
  </>;
}
```

- [ ] **Step 4 : ligne de partie et bandeau d'accueil**

Dans `components/session-card.tsx` :
1. Ajouter `import { activeGuests } from '@/lib/guests';`.
2. Remplacer les deux lignes `const state = …` et `const stateType = …` par :

```tsx
  const brought = activeGuests(s).length;
  const state = cancelled ? 'Annulée' : active && s.my_status ? `${statusLabels[s.my_status]}${brought ? ` · +${brought}` : ''}` : brought ? `+${brought} invité·e${brought > 1 ? 's' : ''}` : free > 0 ? `${free} place${free > 1 ? 's' : ''} libre${free > 1 ? 's' : ''}` : 'Liste d’attente';
  const stateType = cancelled ? 'cancelled' : active && s.my_status ? s.my_status : brought ? 'confirmed' : free ? 'available' : 'waitlisted';
```

3. Remplacer `title="Réservée aux membres et aux personnes parrainées"` par `title="Réservée aux membres et à leurs invités"`.

Dans `components/dashboard.tsx`, remplacer la ligne `const offer = …` par :

```tsx
  const offer = upcoming.find(s => s.my_status === 'offered');
  const guestOffer = offer ? undefined : upcoming.map(s => ({ session: s, guest: (s.my_guests ?? []).find(g => g.status === 'offered') })).find(o => o.guest);
  const banner = offer ? { session: offer, text: <>Une place t’attend pour <strong>{offer.title}</strong>.</> } : guestOffer?.guest ? { session: guestOffer.session, text: <>Une place attend {guestOffer.guest.name} pour <strong>{guestOffer.session.title}</strong>.</> } : null;
```

Remplacer ensuite le JSX `{offer && <a className="offer-banner" …>…</a>}` par :

```tsx
    {banner && <a className="offer-banner" href={`#partie-${banner.session.id}`} onClick={() => { setFilter('all'); setExpanded(current => new Set([...current, banner.session.id])); }}><BellRing size={18} /><span>{banner.text}</span><span>Confirmer</span></a>}
```

- [ ] **Step 5 : styles**

Dans `app/globals.css`, supprimer les deux règles `.circle-roster.narrow-roster { display: none; }` et `.circle-roster.narrow-roster { display: grid; }`, puisque la liste est désormais toujours visible. Ajouter à la fin :

```css
/* The people a player brings, and the quick form to add one. */
.circle-roster small.roster-role { display: block; font-size: 12px; color: var(--muted); }
.my-guests { width: 100%; display: grid; gap: 8px; padding: 14px 16px; border: 1px solid #f3c67566; border-radius: 8px; background: #3e2a2f; }
.my-guests-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.my-guests-heading p { color: var(--parchment); font-weight: 600; }
.my-guests-heading span { color: var(--muted); font-weight: 400; }
.my-guests-hint { color: var(--muted); font-size: 13px; }
.my-guest-row { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; font-size: 14px; }
.guest-status { color: var(--muted); font-size: 13px; }
.guest-status-confirmed { color: var(--green); }
.guest-status-offered { color: var(--gold); }
.guest-suggestions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; color: var(--muted); font-size: 13px; }
.guest-chip { min-height: 36px; padding: 4px 12px; border: 1px solid var(--border); border-radius: 999px; background: transparent; color: var(--ink); font-size: 13px; }
.guest-chip:hover, .guest-chip[aria-pressed="true"] { border-color: var(--gold); color: var(--parchment); }
.guest-release { margin: 0; padding: 0; border: 0; }
.guest-release legend { margin-bottom: 4px; color: var(--parchment); font-size: 14px; }
```

- [ ] **Step 6 : vérifier**

Run: `pnpm typecheck && pnpm test && pnpm build`
Expected: PASS.

Sur la pile locale, après `pnpm local:migrate`, `pnpm local:seed` et `pnpm dev` :
1. En tant que lea@cercle.test, ouvrir la première partie. Paul apparaît avec le maillon. La liste affiche « Paul · ton invité·e ».
2. Cliquer sur un + libre. La fenêtre « Qui t'accompagne ? » s'ouvre. Ajouter « Marie » : son jeton apparaît, et « Tes invités · 2 sur 2 » s'affiche avec « Tu amènes déjà 2 personnes… ».
3. Cliquer sur le jeton de Marie, puis « Retirer Marie » : la place se libère.
4. Cliquer sur son propre jeton : la fenêtre de désistement propose « Libérer aussi la place de Paul », coché par défaut. Annuler.
5. En tant que maxime@cercle.test (voyageur, en attente), ajouter « Jade » depuis un + : message « Demande envoyée pour Jade. », sans jeton.

- [ ] **Step 7 : commit**

```bash
git add components/guest-dialog.tsx components/session-guests.tsx components/session-detail.tsx components/session-card.tsx components/dashboard.tsx app/globals.css
git commit -m "Let players bring, remove and confirm guests from the session circle"
```

---

### Task 9 : espace organisateur

**Files :**
- Modify: `components/admin.tsx` (remplacer le fichier)
- Modify: `components/session-form.tsx`
- Modify: `app/globals.css`

**Interfaces :**
- Consumes :
  - tâche 5 : `groupRequests`, `orderBySponsor`, `bookingLabel`, `membershipLabels` et le type `RequestGroup` ;
  - tâche 6 : `reviewRequest`, `reviewBooking`, `setMembership`.

- [ ] **Step 1 : remplacer `components/admin.tsx`**

Ce code reprend le comportement actuel, y compris le tri en cours de l'utilisateur (`listed`). Il y ajoute les demandes groupées, les invités sous leur parrain et les libellés « Voyageur·se ».

```tsx
'use client';
import { DateTile } from './date-tile';
import { useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Plus, CalendarDays, UsersRound, Clock3, Check, X, Pencil, ShieldCheck, BookOpen, Link2 } from 'lucide-react';
import type { AppData, GameSession, Booking, Profile } from '@/lib/types';
import { time, shortDate, statusLabels, sessionUrl } from '@/lib/utils';
import { bookingLabel, groupRequests, membershipLabels, orderBySponsor, type RequestGroup } from '@/lib/guests';
import { cancelSession, reviewBooking, reviewRequest, setMembership } from '@/app/actions';
import { Dialog } from './dialog';
import { Avatar } from './ui';
import { Feedback, useAction } from './action-feedback';
const SessionForm = dynamic(() => import('./session-form').then(mod => mod.SessionForm), { loading: () => <p className="muted">Chargement du formulaire…</p> });

export function Admin({ data, bookings, profiles, addresses, initialCreate = false }: { data: AppData; bookings: Booking[]; profiles: Profile[]; addresses: Record<string, string>; initialCreate?: boolean }) {
  const [tab, setTab] = useState<'sessions' | 'requests' | 'members'>('sessions');
  const [editing, setEditing] = useState<GameSession | 'new' | null>(initialCreate ? 'new' : null);
  const [selected, setSelected] = useState<GameSession | null>(null);
  const [cancel, setCancel] = useState<GameSession | null>(null);
  const [member, setMember] = useState<Profile | null>(null);
  const [removing, setRemoving] = useState<Booking | null>(null);
  const [refusing, setRefusing] = useState<RequestGroup | null>(null);
  const a = useAction();
  const future = data.sessions.filter(s => s.status === 'published' && new Date(s.ends_at) > new Date());
  const requests = groupRequests(bookings.filter(b => future.some(s => s.id === b.session_id)), profiles);
  const pendingCount = requests.reduce((count, r) => count + (r.own ? 1 : 0) + r.guests.length, 0);
  const template = [...data.sessions].filter(s => s.status === 'published').sort((x, y) => Date.parse(y.starts_at) - Date.parse(x.starts_at))[0];
  const isPast = (s: GameSession) => new Date(s.ends_at) <= new Date();
  // Upcoming games first in date order, then past and cancelled ones, most recent first.
  const listed = [...data.sessions].sort((x, y) => { const ax = x.status === 'published' && !isPast(x), ay = y.status === 'published' && !isPast(y); if (ax !== ay) return ax ? -1 : 1; return ax ? Date.parse(x.starts_at) - Date.parse(y.starts_at) : Date.parse(y.starts_at) - Date.parse(x.starts_at); });
  const sponsorOf = (b: Booking) => profiles.find(p => p.id === b.sponsor_id);
  const nameOf = (b: Booking) => b.guest_name ?? b.profile?.display_name ?? 'Joueur';
  const review = (b: Booking, approve: boolean) => a.run(() => reviewBooking(b.id, approve));
  const participants = selected ? orderBySponsor(bookings.filter(b => b.session_id === selected.id && !['cancelled', 'declined'].includes(b.status))) : [];
  return <><div className="page-heading admin-heading"><h1>Organiser</h1><button className="button primary compact" onClick={() => setEditing('new')}><Plus size={17} />Créer une partie</button></div>
    <div className="admin-stats"><div><CalendarDays /><span><strong>{future.length}</strong>sessions à venir</span></div><div><UsersRound /><span><strong>{profiles.filter(p => p.membership !== 'suspended').length}</strong>personnes dans le cercle</span></div><div><Clock3 /><span><strong>{pendingCount}</strong>demandes à valider</span></div></div>
    <div className="session-tabs admin-tabs" role="group" aria-label="Espace organisateur">{([['sessions', 'Les sessions'], ['requests', `À valider (${pendingCount})`], ['members', 'Les membres']] as const).map(([value, label]) => <button key={value} aria-pressed={tab === value} className={tab === value ? 'selected' : ''} onClick={() => setTab(value)}>{label}</button>)}</div><Feedback result={a.result} />
    {tab === 'sessions' ? <div className="admin-session-list">{listed.length ? listed.map(s => <article className={`admin-session-row ${s.status === 'cancelled' ? 'is-cancelled' : isPast(s) ? 'is-past' : ''}`} key={s.id}><DateTile date={s.starts_at} /><div className="admin-session-name"><Link href={sessionUrl(s.id)}><h2>{s.title}</h2></Link><p>{s.status === 'cancelled' ? <span className="session-state">Annulée · </span> : isPast(s) ? <span className="session-state">Passée · </span> : null}{s.script} · {time(s.starts_at)} · {s.visibility === 'public' ? 'Ouverte à tous' : 'Membres et invités'}</p></div><span className="badge">{s.confirmed_count}/{s.capacity} inscrits</span><div className="row-actions"><button className="button secondary compact" onClick={() => setSelected(s)}><UsersRound size={15} />Participants</button>{s.status === 'published' && !isPast(s) && <><button aria-label={`Modifier ${s.title}`} className="icon-btn" onClick={() => setEditing(s)}><Pencil size={17} /></button><button aria-label={`Annuler ${s.title}`} className="icon-btn" onClick={() => setCancel(s)}><X size={17} /></button></>}</div></article>) : <div className="empty-state"><CalendarDays /><h2>Crée votre première soirée.</h2><p>Tu choisis la date, le script et les places disponibles.</p></div>}</div>
    : tab === 'requests' ? <div className="panel">{requests.length ? requests.map(r => {
      const session = data.sessions.find(s => s.id === r.sessionId);
      const name = r.person?.display_name ?? 'Voyageur·se';
      const count = (r.own ? 1 : 0) + r.guests.length;
      return <div className="request-row" key={r.key}>
        <Avatar name={name} color={r.person?.avatar_color} />
        <div>
          <h3>{name} <small className="request-role">· {membershipLabels[r.person?.membership ?? 'newcomer']}</small></h3>
          <p>{session ? `${session.title} · ${shortDate(session.starts_at)}` : 'Partie'}</p>
          <small>{r.own ? r.person?.beginner ? 'Découvre le jeu' : 'Connaît déjà le jeu' : 'Ne vient pas, amène quelqu’un'}</small>
          {r.guests.map(g => <div className="request-guest" key={g.id}><span><Link2 size={14} aria-hidden="true" />{g.guest_name} · voyageur·se de {name}</span><button className="icon-btn" disabled={a.pending} aria-label={`Refuser ${g.guest_name}`} onClick={() => setRemoving(g)}><X size={16} /></button></div>)}
        </div>
        <div className="row-actions request-actions">
          <button className="button quiet compact" disabled={a.pending} onClick={() => a.run(() => reviewRequest(r.sessionId, r.personId, true))}><Check size={15} />{count > 1 ? `Accepter les ${count}` : 'Accepter'}</button>
          {r.person?.membership === 'newcomer' && <button className="button secondary compact" disabled={a.pending} onClick={() => a.run(() => reviewRequest(r.sessionId, r.personId, true, true))}>Accepter et passer membre</button>}
          <button className="icon-btn" disabled={a.pending} aria-label={`Refuser la demande de ${name}`} onClick={() => setRefusing(r)}><X size={17} /></button>
        </div>
      </div>;
    }) : <div className="empty-state borderless"><ShieldCheck size={35} /><h2>Tout est à jour.</h2><p>Les demandes des voyageurs et de leurs amis apparaîtront ici.</p></div>}</div>
    : <div className="panel">{profiles.map(p => <div className="member-row" key={p.id}><Avatar name={p.display_name} color={p.avatar_color} /><div><h3>{p.display_name}</h3><p>{p.bio || (p.beginner ? 'Découvre le jeu' : 'Connaît déjà le jeu')}</p></div><span className={`badge ${p.membership === 'suspended' ? 'red' : ''}`}>{membershipLabels[p.membership]}</span>{p.membership !== 'organizer' && <button className="button secondary compact" disabled={a.pending} onClick={() => setMember(p)}>{p.membership === 'suspended' ? 'Réactiver' : 'Gérer'}</button>}</div>)}</div>}
    <Dialog title={editing === 'new' ? 'Créer une partie' : 'Modifier la partie'} open={editing !== null} onClose={() => setEditing(null)} wide>{editing && <SessionForm session={editing === 'new' ? undefined : editing} template={template} address={editing === 'new' ? (template ? addresses[template.id] : undefined) : addresses[editing.id]} onSaved={() => setEditing(null)} />}</Dialog>
    <Dialog title={selected?.title || 'Participants'} open={!!selected} onClose={() => setSelected(null)} wide><div className="stack">
      {participants.map(b => <div className={`request-row ${b.user_id ? '' : 'is-guest-row'}`} key={b.id}>
        <Avatar name={nameOf(b)} color={b.profile?.avatar_color ?? sponsorOf(b)?.avatar_color} />
        <div><h3 className="participant-name">{!b.user_id && <Link2 size={14} aria-hidden="true" />}{nameOf(b)}{b.profile?.can_storytell && <BookOpen size={15} role="img" aria-label="Volontaire MJ"><title>Volontaire MJ</title></BookOpen>}</h3><p>{bookingLabel(b, sponsorOf(b)?.display_name ?? 'un membre')}</p></div>
        <span className="badge">{statusLabels[b.status]}</span>
        {b.status === 'pending' ? <button className="button quiet compact" disabled={a.pending} onClick={() => review(b, true)}>Valider</button> : null}
        <button className="icon-btn" aria-label={`Retirer ${nameOf(b)}`} disabled={a.pending} onClick={() => setRemoving(b)}><X size={16} /></button>
      </div>)}
      {selected && !participants.length && <p className="muted">Pas encore de participation.</p>}
      <Feedback result={a.result} />
    </div></Dialog>
    <Dialog title="Retirer cette participation ?" open={!!removing} onClose={() => setRemoving(null)}><div className="stack"><p>{removing && !removing.user_id ? `${sponsorOf(removing)?.display_name ?? 'La personne qui l’amène'} sera prévenu·e.` : `${removing ? nameOf(removing) : ''} sera prévenu·e.`} Une éventuelle place libérée sera proposée à la liste d’attente.</p><button className="button danger" disabled={a.pending} onClick={() => removing && a.run(() => reviewBooking(removing.id, false), () => setRemoving(null))}>Retirer la participation</button><Feedback result={a.result} /></div></Dialog>
    <Dialog title="Refuser cette demande ?" open={!!refusing} onClose={() => setRefusing(null)}><div className="stack"><p>La demande de {refusing?.person?.display_name ?? 'cette personne'}{refusing?.guests.length ? ` et celle de ${refusing.guests.map(g => g.guest_name).join(', ')}` : ''} sera refusée. Un message lui sera envoyé.</p><button className="button danger" disabled={a.pending} onClick={() => refusing && a.run(() => reviewRequest(refusing.sessionId, refusing.personId, false), () => setRefusing(null))}>Refuser la demande</button><Feedback result={a.result} /></div></Dialog>
    <Dialog title="Annuler cette soirée ?" open={!!cancel} onClose={() => setCancel(null)}><div className="stack"><p>La session « {cancel?.title} » sera annulée et les participants seront prévenus.</p><button className="button danger" disabled={a.pending} onClick={() => cancel && a.run(() => cancelSession(cancel.id), () => setCancel(null))}>Confirmer l’annulation</button><Feedback result={a.result} /></div></Dialog>
    <Dialog title={`Le compte de ${member?.display_name || ''}`} open={!!member} onClose={() => setMember(null)}><div className="stack"><p>{member?.membership === 'suspended' ? 'Réactiver ce compte lui permettra de participer à nouveau.' : 'La suspension bloque les inscriptions et libère les places futures de cette personne et de ses invités.'}</p><button className={`button ${member?.membership === 'suspended' ? 'primary' : 'danger'}`} disabled={a.pending} onClick={() => member && a.run(() => setMembership(member.id, member.membership === 'suspended' ? 'member' : 'suspended'), () => setMember(null))}>{member?.membership === 'suspended' ? 'Réactiver le compte' : 'Suspendre le compte'}</button>{member?.membership === 'newcomer' && <button className="button secondary" disabled={a.pending} onClick={() => a.run(() => setMembership(member.id, 'member'), () => setMember(null))}>Passer membre</button>}<Feedback result={a.result} /></div></Dialog>
  </>;
}
```

- [ ] **Step 2 : libellés du formulaire de partie**

Dans `components/session-form.tsx` :
- remplacer `<label className="field">Dont nouveaux<input` par `<label className="field">Dont places voyageurs<input` ;
- remplacer `<option value="members">Membres et personnes parrainées</option>` par `<option value="members">Membres et leurs invités</option>`.

- [ ] **Step 3 : styles**

Ajouter à la fin de `app/globals.css` :

```css
/* Organizer: requests grouped by traveller, guests listed under the person who brings them. */
.request-role { color: var(--muted); font-size: 13px; font-weight: 400; }
.request-guest { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 8px; padding-top: 8px; border-top: 1px solid #77678360; color: var(--ink); font-size: 13px; }
.request-guest span { display: inline-flex; align-items: center; gap: 6px; }
.request-actions { flex-wrap: wrap; justify-content: flex-end; }
.is-guest-row { padding-left: 28px; }
```

- [ ] **Step 4 : vérifier**

Run: `pnpm typecheck && pnpm test && pnpm build`
Expected: PASS.

Sur la pile locale, en tant que camille@cercle.test, ouvrir « Organiser » :
- l'onglet « À valider » montre la carte de Maxime avec « Nora · voyageur·se de Maxime » et le bouton « Accepter les 2 ». « Accepter et passer membre » passe Maxime membre ;
- dans « Participants » de la première partie, Paul apparaît sous Léa avec « Invité·e de Léa » ;
- l'onglet « Les membres » affiche « Voyageur·se » pour les comptes concernés.

- [ ] **Step 5 : commit**

```bash
git add components/admin.tsx components/session-form.tsx app/globals.css
git commit -m "Group traveller requests and show guests under their sponsor for organizers"
```

---

### Task 10 : page Inviter, profil, textes légaux et README

**Files :**
- Modify: `components/invitations.tsx`
- Modify: `components/profile.tsx`
- Modify: `app/(legal)/confidentialite/page.tsx`
- Modify: `app/(legal)/conditions/page.tsx`
- Modify: `README.md`
- Modify: `app/globals.css`

**Interfaces :**
- Consumes : `guestStatusLabels` (tâche 5), `MAX_GUESTS_PER_PERSON` (tâche 1) et `my_guests` (tâche 2).

- [ ] **Step 1 : remplacer la fonction `Invitations`**

Dans `components/invitations.tsx`, remplacer les imports et la fonction `Invitations`. `AcceptInvite` reste inchangée.

```tsx
'use client';
import { useState } from 'react';
import Link from 'next/link';
import { UserPlus, UsersRound, Link2, Copy, Check, X } from 'lucide-react';
import type { AppData } from '@/lib/types';
import { createInvitation, revokeInvitation, acceptInvitation } from '@/app/actions';
import { useAction, Feedback } from './action-feedback';
import { SignInButton } from './auth';
import { shortDate, sessionUrl } from '@/lib/utils';
import { guestStatusLabels } from '@/lib/guests';
import { MAX_GUESTS_PER_PERSON } from '@/lib/session-rules';

export function Invitations({ data }: { data: AppData }) {
  const a = useAction();
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState(false);
  const eligible = data.profile && ['member', 'organizer'].includes(data.profile.membership);
  const traveller = data.profile?.membership === 'newcomer';
  const upcoming = data.sessions.filter(s => s.status === 'published' && new Date(s.ends_at) > new Date())
    .flatMap(s => (s.my_guests ?? []).filter(g => g.status !== 'cancelled').map(guest => ({ session: s, guest })));
  return <>
    <div className="page-heading"><h1>Inviter</h1></div>
    <div className="invitation-layout">
      <section className="panel invitation-main">
        <span className="invite-icon"><UsersRound size={28} /></span>
        <h2>Amener quelqu’un à une partie.</h2>
        <p className="muted">{traveller ? 'Ouvre une partie et clique sur un + libre. Ton ami·e n’a pas besoin de compte ; un organisateur validera sa place avec la tienne.' : 'Ouvre une partie et clique sur un + libre. Ton invité·e n’a pas besoin de compte et a sa place tout de suite.'} Jusqu’à {MAX_GUESTS_PER_PERSON} personnes par partie.</p>
        {data.profile ? <Link className="button primary" href="/">Choisir une partie</Link> : <SignInButton configured={data.configured} />}
        {upcoming.length > 0 && <ul className="guest-overview" aria-label="Tes invités aux prochaines parties">{upcoming.map(({ session, guest }) => <li key={guest.id}><Link href={sessionUrl(session.id)}><strong>{guest.name}</strong><span>{session.title} · {shortDate(session.starts_at)}</span></Link><span className="badge">{guestStatusLabels[guest.status]}</span></li>)}</ul>}
      </section>
      {data.profile && <section className="panel invitation-main">
        <span className="invite-icon"><UserPlus size={28} /></span>
        <h2>Faire entrer quelqu’un dans le cercle.</h2>
        <p className="muted">Ton lien de parrainage fait de ton ami·e un·e membre : il ou elle crée son compte et réserve ses places sans validation.</p>
        {!eligible ? <div className="alert info">Le parrainage est réservé aux membres. Un organisateur peut te passer membre.</div> : <div className="stack">
          {link && <div className="share-link"><label className="field">Ton lien d’invitation<input readOnly value={link} onFocus={e => e.target.select()} /></label><button className="button secondary" onClick={async () => { try { await navigator.clipboard.writeText(link); setCopied(true); } catch { a.setResult({ ok: false, message: 'Sélectionne et copie le lien ci-dessus.' }); } }}>{copied ? <Check size={17} /> : <Copy size={17} />}{copied ? 'Copié !' : 'Copier le lien'}</button></div>}
          <button className={`button ${link ? 'ghost' : 'primary'}`} disabled={a.pending} onClick={() => a.run(createInvitation, r => { setLink(`${window.location.origin}/invite/${r.value}`); setCopied(false); })}><Link2 size={17} />{a.pending ? 'Création…' : link ? 'Créer un autre lien' : 'Créer un lien de parrainage'}</button>
          <Feedback result={a.result} />
        </div>}
        <details className="disclosure invitation-rules"><summary>Comment ça marche ?</summary><div><p>Le lien est valable 7 jours, pour une seule personne. Tu peux en créer jusqu’à 5 par jour.</p><p>Ton ami·e utilise son propre compte. Le lien lui donne directement le statut de membre ; il ou elle réserve ensuite sa place dans une partie.</p></div></details>
      </section>}
    </div>
    {data.invitations.length > 0 && <section className="panel invitation-history"><h2>Liens créés</h2>{data.invitations.map(i => <div key={i.id} className="invitation-row"><span><Link2 size={17} />{shortDate(i.created_at)}</span><span className="badge">{i.used_by ? 'Acceptée' : new Date(i.expires_at) < new Date() ? 'Expirée' : 'En attente'}</span>{!i.used_by && new Date(i.expires_at) > new Date() && <button className="icon-btn" aria-label={`Désactiver l’invitation du ${shortDate(i.created_at)}`} disabled={a.pending} onClick={() => a.run(() => revokeInvitation(i.id))}><X size={17} /></button>}</div>)}</section>}
  </>;
}
```

Dans `app/globals.css`, remplacer `.invitation-layout { max-width: 700px; margin: 0 auto; }` par `.invitation-layout { max-width: 700px; margin: 0 auto; display: grid; gap: 20px; }`. Ajouter ensuite à la fin :

```css
.guest-overview { display: grid; gap: 0; margin: 22px 0 0; padding: 0; list-style: none; text-align: left; }
.guest-overview li { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 0; border-top: 1px solid var(--border); }
.guest-overview a { display: grid; }
.guest-overview a span { color: var(--muted); font-size: 13px; }
```

- [ ] **Step 2 : profil**

Dans `components/profile.tsx`, remplacer `p.membership === 'newcomer' ? 'Nouveau visage'` par `p.membership === 'newcomer' ? 'Voyageur·se'`. Juste après la `div` `profile-preview`, ajouter :

```tsx
        {p.membership === 'newcomer' && <p className="muted">Un organisateur valide tes parties et peut te passer membre.</p>}
```

- [ ] **Step 3 : textes légaux**

Dans `app/(legal)/confidentialite/page.tsx` :
- section « Ce que nous utilisons », premier paragraphe : ajouter à la fin « Quand tu amènes quelqu’un à une partie, tu indiques seulement son prénom ou son pseudo, sans moyen de le contacter. » ;
- section « Pourquoi et sur quelle base », premier paragraphe : ajouter à la fin « L’enregistrement du prénom des personnes que tu amènes repose sur l’intérêt légitime à organiser la soirée. Préviens-les que tu les inscris ; elles peuvent exercer leurs droits au contact indiqué ci-dessus. » ;
- section « Qui peut voir quoi » :
  - à la fin du premier paragraphe, ajouter « Les personnes que tu amènes apparaissent avec la mention « invité·e de » ou « voyageur·se de » suivie de ton pseudo. » ;
  - dans le deuxième paragraphe, remplacer « accessibles aux organisateurs et aux participants confirmés » par « accessibles aux organisateurs, aux participants confirmés et aux personnes dont un·e invité·e est confirmé·e » ;
- section « Conservation », premier paragraphe : ajouter à la fin « Le prénom d’une personne amenée est remplacé par « Invité·e » 30 jours après la soirée. ».

Dans `app/(legal)/conditions/page.tsx`, section « Les inscriptions » :
- remplacer « La première participation peut être validée par un organisateur. » par « Les participations des voyageurs, et celles des personnes qu’ils amènent, sont validées par un organisateur. » ;
- ajouter un paragraphe : `<p>Tu peux amener jusqu’à deux personnes par partie, sans qu’elles aient besoin d’un compte. Tu réponds d’elles : préviens-les de l’heure et du lieu, et libère leur place si elles ne peuvent plus venir.</p>`.

- [ ] **Step 4 : README**

Dans `README.md` :
- section « Fonctionnement » :
  - remplacer « Quotas membres/nouveaux et réunion des quotas avant la soirée. » par « Quotas membres/voyageurs et réunion des quotas avant la soirée. » ;
  - remplacer la puce « Première participation des nouveaux soumise à validation… L’organisateur peut aussi valider un membre directement. » par :
    « Quatre statuts : membre, invité·e de membre, voyageur·se (compte pas encore membre) et voyageur·se amené·e par un voyageur. Un membre amène jusqu’à 2 personnes sans compte, qui ont leur place d’office sur les places membres. Les voyageurs et leurs amis prennent les places voyageurs et sont validés à chaque partie ; l’organisateur accepte le groupe en une fois et peut passer un voyageur membre. Les prénoms des invités sont effacés 30 jours après la soirée. » ;
  - à la fin de la puce « Parrainage à usage unique… », ajouter « Le lien fait directement de l’invité·e un·e membre. » ;
- section « Protection des données » : ajouter « Un invité n’a pas de compte : seul son prénom est enregistré, et la personne qui l’amène reçoit les messages qui le concernent. » ;
- section « Vérifications » : remplacer « et les désistements » par « les désistements et les invités » ;
- section « Mise en ligne », étape 2 : remplacer « applique les quatre migrations » par « applique les cinq migrations ».

- [ ] **Step 5 : vérifier**

Run: `pnpm typecheck && pnpm build`
Expected: PASS.

Sur la pile locale :
- en tant que lea@cercle.test, la page « Inviter » liste « Paul · Une nuit à Ravenswood » avec « place confirmée » ;
- en tant que maxime@cercle.test, le parrainage indique qu'il est réservé aux membres, et le profil affiche « Voyageur·se ».

- [ ] **Step 6 : commit**

```bash
git add components/invitations.tsx components/profile.tsx "app/(legal)/confidentialite/page.tsx" "app/(legal)/conditions/page.tsx" README.md app/globals.css
git commit -m "Explain guests and travellers on the invite page, profile, legal pages and README"
```

---

### Task 11 : intégration réelle et vérification finale

**Files :**
- Modify: `tests/local-integration.ts`

**Interfaces :**
- Consumes : `add_guest` à travers PostgREST, et l'embed `profile:profiles(*)` utilisé par `lib/data.ts`.

- [ ] **Step 1 : ajouter le scénario concurrent**

Dans `tests/local-integration.ts`, remplacer `let sid:string|undefined;` par `let sid:string|undefined;let guestSid:string|undefined;`. Juste avant `}finally{`, ajouter :

```ts
 const guestGame=await actors[0].rpc('save_session',{p_data:{title:'Test invités local',description:'',script:'Trouble Brewing',starts_at:date,ends_at:end,location:'Lieu de test',address:'',capacity:7,newcomer_seats:5,release_hours:72,beginners_welcome:true,visibility:'public'}});if(guestGame.error)throw guestGame.error;guestSid=guestGame.data;
 const host=await actors[1].rpc('book_session',{p_id:guestSid});assert.equal(host.data,'confirmed');
 const guests=await Promise.all([actors[2].rpc('add_guest',{p_session:guestSid,p_name:'Invité A'}),actors[3].rpc('add_guest',{p_session:guestSid,p_name:'Invité B'})]);
 assert.ok(guests.every(r=>!r.error));assert.deepEqual(guests.map(r=>r.data).sort(),['confirmed','waitlisted']);
 const embedded=await actors[0].from('bookings').select('*,profile:profiles(*)').eq('session_id',guestSid);
 assert.equal(embedded.error,null);assert.equal(embedded.data?.filter((b:{guest_name:string|null})=>b.guest_name).length,2);
 console.log('OK : deux invités ajoutés en même temps sur la dernière place membre, sans sur-réservation ; la requête organisateur reste valide.');
```

Dans le bloc `finally`, juste après `if(sid)await admin.from('sessions').delete().eq('id',sid);`, ajouter :

```ts
 if(guestSid)await admin.from('sessions').delete().eq('id',guestSid);
```

- [ ] **Step 2 : exécuter sur la pile Docker**

Run: `pnpm local:up && pnpm local:migrate`
Expected: `Migration appliquée : 202610120005_guests.sql`, puis `Schéma de la base à jour.`.
Run: `node node_modules/tsx/dist/cli.mjs --env-file=.env.local tests/local-integration.ts`
Expected : les cinq lignes `OK : …`, dont la nouvelle, puis le message de nettoyage.

- [ ] **Step 3 : vérification complète**

Run: `pnpm typecheck && pnpm test && pnpm build`
Expected: PASS, sans avertissement nouveau.

Contrôle visuel final sur http://127.0.0.1:3000, sur ordinateur puis en 375 px de large :
- **Accueil** : les 4 statuts se distinguent sur le cercle (anneau pointillé, maillon), et la liste des participants reste lisible sur mobile, où les noms des jetons sont masqués ;
- **Ajout d'un invité** : la fenêtre « Qui t'accompagne ? » propose des suggestions et Entrée valide ;
- **Bandeau** : une place proposée à un invité apparaît (« Une place attend … ») ;
- **Organiser** : les cartes groupées et « Accepter et passer membre » fonctionnent.

- [ ] **Step 4 : commit**

```bash
git add tests/local-integration.ts
git commit -m "Cover concurrent guest booking and the organizer embed in the local integration test"
```

---

## Couverture de la spec

| Exigence de la spec | Tâche |
|---|---|
| Statuts, quotas, validation, limite de 2, doublons, refus | 1, 3 |
| Promotion uniquement par l'organisateur ou par parrainage | 3 (`review_booking`, `review_request`) et 9 (« Passer membre ») |
| Données, contrainte, index, règles RLS, adresse du parrain | 1 et 6 |
| `list_sessions` : rôles, `invited_by`, `my_guests`, places libres par type | 2 |
| Notifications au parrain, un seul message par personne | 3 et 4 |
| Suspension, suppression du compte, effacement à 30 jours | 4 |
| Cercle, liste, clic sur un +, fenêtre, « Tes invités », désistement, bandeau, ligne de partie | 7 et 8 |
| Organisateur, formulaire de partie | 9 |
| Page Inviter, profil, textes légaux, README | 10 |
| Démo, seed | 7 |
| Intégration, contrôles visuels | 11 |
