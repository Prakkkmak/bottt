import {randomBytes,createHmac} from 'node:crypto';import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
mkdirSync('.docker',{recursive:true});
let c;
if(existsSync('.docker/config.json'))c=JSON.parse(readFileSync('.docker/config.json','utf8'));
else {
 const jwt=randomBytes(32).toString('hex'),password=randomBytes(24).toString('hex');
 const sign=role=>{const header=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');const payload=Buffer.from(JSON.stringify({iss:'le-cercle-local',role,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+315360000})).toString('base64url');const input=`${header}.${payload}`;return `${input}.${createHmac('sha256',jwt).update(input).digest('base64url')}`;};
 c={password,jwt,anon:sign('anon'),service:sign('service_role')};writeFileSync('.docker/config.json',JSON.stringify(c));
}
if(existsSync('.env.local')){const old=readFileSync('.env.local','utf8');const url=old.match(/^NEXT_PUBLIC_SUPABASE_URL=(.+)$/m)?.[1];if(url&&!url.includes('127.0.0.1'))throw new Error('Un projet distant est configuré : .env.local est conservé.');}
writeFileSync('.env.docker',`LOCAL_DB_PASSWORD=${c.password}\nLOCAL_JWT_SECRET=${c.jwt}\nLOCAL_ANON_KEY=${c.anon}\nLOCAL_SERVICE_KEY=${c.service}\n`);
writeFileSync('.env.local',`DEMO_MODE=false\nNEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${c.anon}\nSUPABASE_SERVICE_ROLE_KEY=${c.service}\nNEXT_PUBLIC_SITE_URL=http://127.0.0.1:3000\nLOCAL_PREVIEW=true\n`);
writeFileSync('.docker/init.sql',`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
create role authenticator login noinherit password '${c.password}';grant anon,authenticated,service_role to authenticator;
create role supabase_auth_admin login noinherit password '${c.password}';
create schema auth authorization supabase_auth_admin;
alter role supabase_auth_admin set search_path = auth;
grant usage on schema public to anon,authenticated,service_role;
grant all on schema public to service_role;
create schema extensions;create extension if not exists pgcrypto with schema extensions;
create function auth.uid() returns uuid language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
alter function auth.uid() owner to supabase_auth_admin;
alter function auth.jwt() owner to supabase_auth_admin;
grant usage on schema auth to anon,authenticated,service_role;
grant execute on function auth.uid(),auth.jwt() to anon,authenticated,service_role;
`);
writeFileSync('.docker/kong.yml',`_format_version: "2.1"
_transform: true
consumers:
  - username: local-anon
    keyauth_credentials:
      - key: ${c.anon}
  - username: local-service
    keyauth_credentials:
      - key: ${c.service}
services:
  - name: auth
    url: http://auth:9999/
    routes:
      - name: auth-v1
        strip_path: true
        paths: ["/auth/v1/"]
    plugins:
      - name: key-auth
        config:
          key_names: [apikey]
          hide_credentials: true
  - name: rest
    url: http://rest:3000/
    routes:
      - name: rest-v1
        strip_path: true
        paths: ["/rest/v1/"]
    plugins:
      - name: key-auth
        config:
          key_names: [apikey]
          hide_credentials: true
`);
console.log('Configuration Docker locale prête. Les clés sont privées et ignorées par Git.');
