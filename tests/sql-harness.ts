import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

export const uuid=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
type Membership='newcomer'|'member'|'organizer'|'suspended';
type SessionOptions={capacity?:number;travellerSeats?:number;startsIn?:string;visibility?:'public'|'members';releaseHours?:number};

/** Fresh in-memory database with a minimal Supabase auth schema and every migration applied, or those before `before` only. */
export async function createDatabase({before}:{before?:string}={}){
  const db=new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
  create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
  create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id) on delete cascade,created_at timestamptz default now(),not_after timestamptz);
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
  grant usage on schema auth to anon,authenticated,service_role;
  grant execute on all functions in schema auth to anon,authenticated,service_role;`);
  const migrations=new URL('../supabase/migrations/',import.meta.url);
  const names=(await readdir(migrations)).filter(n=>n.endsWith('.sql')).sort();
  const apply=async(list:string[])=>{for(const name of list)await db.exec(await readFile(new URL(name,migrations),'utf8'));};
  await apply(names.filter(n=>!before||n<before));
  async function root(){await db.exec(`reset role; select set_config('request.jwt.claim.sub','',false); select set_config('request.jwt.claims','{}',false);`);}
  async function login(n:number){await root();await db.query(`select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)`,[uuid(n),JSON.stringify({sub:uuid(n),session_id:uuid(n+1000)})]);await db.exec('set role authenticated');}
  async function anonymous(){await root();await db.exec('set role anon');}
  /** Applies the migrations held back by `before`, as production does on a database that already has accounts. */
  async function migrate(){await root();await apply(names.filter(n=>before&&n>=before));}
  async function user(n:number,membership:Membership='member',metadata:Record<string,string>={display_name:`Joueur ${n}`}){
    await root();
    await db.query(`insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),$3)`,[uuid(n),`test${n}@cercle.test`,JSON.stringify(metadata)]);
    await db.query(`insert into auth.sessions(id,user_id) values($1,$2)`,[uuid(n+1000),uuid(n)]);
    await db.query('update public.profiles set membership=$1 where id=$2',[membership,uuid(n)]);
  }
  async function session(id:string,{capacity=8,travellerSeats=2,startsIn='10 days',visibility='public',releaseHours=72}:SessionOptions={}){
    await root();
    await db.query(`insert into public.sessions(id,title,script,starts_at,ends_at,location,capacity,newcomer_seats,release_hours,visibility,created_by)
      values($1,'Soirée de test','Trouble Brewing',now()+$2::interval,now()+$2::interval+interval '4 hours','Brest',$3,$4,$5,$6,$7)`,[id,startsIn,capacity,travellerSeats,releaseHours,visibility,uuid(1)]);
  }
  async function call<T=Record<string,unknown>>(sql:string,params:unknown[]=[]){return (await db.query<T>(sql,params)).rows;}
  return {db,root,login,anonymous,user,session,call,migrate};
}
