import {execFileSync} from 'node:child_process';import {readdirSync,readFileSync} from 'node:fs';
const args=['compose','--env-file','.env.docker','exec','-T','db','psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'];
const run=sql=>execFileSync('docker',[...args,'-At'],{input:sql,encoding:'utf8',stdio:['pipe','pipe','pipe']});
run('create schema if not exists cercle_migrations;create table if not exists cercle_migrations.applied(name text primary key,applied_at timestamptz default now());');
for(const name of readdirSync('supabase/migrations').filter(n=>/^\d+_[a-z0-9_]+\.sql$/.test(n)).sort()){
 if(run(`select name from cercle_migrations.applied where name='${name}';`).trim())continue;
 const sql=readFileSync(`supabase/migrations/${name}`,'utf8');
 try{run(`begin;${sql}\ninsert into cercle_migrations.applied(name) values('${name}');notify pgrst,'reload schema';commit;`);console.log(`Migration appliquée : ${name}`);}catch(e){console.error(e.stderr?.toString()||'Échec de la migration.');process.exit(1);}
}
console.log('Schéma de la base à jour.');
