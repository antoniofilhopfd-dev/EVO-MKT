// Migrações: atualização de uma instalação existente (001–006 já aplicadas, com dados) até a última, sem perder nada; e idempotência no reinício. Uso: node migracoes.test.js <install.out>
const fs=require('fs'),path=require('path'),{execFileSync,spawn}=require('child_process');
const WEB=path.join(__dirname,'..');const DB='evowebtest_upg',PORT=8097;
let ok=0,bad=0;const t=(n,c,x)=>{c?ok++:bad++;console.log(c?'OK  ':'FAIL',n);if(!c&&x!==undefined)console.log('    ',JSON.stringify(x).slice(0,500))};
const my=(db,q)=>execFileSync('mariadb',['--default-character-set=utf8mb4','-uroot','-S','/run/mysqld/mysqld.sock',...(db?[db]:[]),'-N','-e',q],{encoding:'utf8'});
const files=fs.readdirSync(path.join(WEB,'db/migrations')).filter(f=>f.endsWith('.sql')).sort();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function subir(){
 const env={...process.env,DB_NAME:DB,PORT:String(PORT)};
 const p=spawn('npx',['next','start','-p',String(PORT)],{cwd:WEB,env,stdio:'ignore'});
 for(let i=0;i<60;i++){try{if((await fetch(`http://127.0.0.1:${PORT}/api/heartbeat`)).ok)return p}catch{}await sleep(500)}
 p.kill();throw new Error('servidor de teste não subiu');
}
async function parar(p){p.kill();await sleep(800);try{execFileSync('sh',['-c',`for p in $(ss -ltnp 2>/dev/null | grep ":${PORT} " | grep -o 'pid=[0-9]*' | cut -d= -f2); do kill $p; done`])}catch{}await sleep(500)}
(async()=>{
 my('',`DROP DATABASE IF EXISTS ${DB}; CREATE DATABASE ${DB} CHARACTER SET utf8mb4;`);
 // instalação "antiga": só as 6 primeiras migrações, registradas como aplicadas, com dados reais dentro
 const antigas=files.slice(0,6);
 my(DB,'CREATE TABLE schema_migrations(name VARCHAR(190) PRIMARY KEY, applied_at VARCHAR(40) NOT NULL)');
 for(const f of antigas){const sqlTxt=fs.readFileSync(path.join(WEB,'db/migrations',f),'utf8');
  for(const stmt of sqlTxt.split(/;\s*(?:\r?\n|$)/).map(s=>s.trim()).filter(Boolean)){const body=stmt.split(/\r?\n/).filter(l=>!l.trim().startsWith('--')).join('\n').trim();if(body)try{my(DB,body)}catch(e){if(!/already exists|Duplicate/i.test(String(e.stderr||e.message)))throw e}}
  my(DB,`INSERT INTO schema_migrations(name,applied_at) VALUES('${f}','2026-01-01')`)}
 const nomeMig=my(DB,'SELECT name FROM schema_migrations ORDER BY name').trim().split('\n');
 my(DB,`INSERT INTO records(modulo,id,data,criado_em,atualizado_em) VALUES('tarefas','TAR-0001','{"id":"TAR-0001","titulo":"Tarefa da instalação antiga","status":"NOVO"}','2026-01-02','2026-01-02'),('solicitacoes','SOL-0001','{"id":"SOL-0001","titulo":"Demanda antiga","status":"EM EXECUÇÃO","segmento":"Infantil"}','2026-01-02','2026-01-02');INSERT INTO id_counters(modulo,n) VALUES('tarefas',1),('solicitacoes',1);INSERT INTO used_ids(id) VALUES('TAR-0001'),('SOL-0001');INSERT INTO status_history(modulo,registro,campo,de,para,ator,quando,motivo) VALUES('solicitacoes','SOL-0001','status','','EM EXECUÇÃO','teste','2026-01-02T10:00:00-03:00','')`);
 t('instalação antiga preparada com as 6 primeiras migrações e dados',nomeMig.length===6&&files.length>=10,[nomeMig.length,files.length]);
 const antesTab=my(DB,'SHOW TABLES').trim().split('\n');
 t('as tabelas novas (comentários, checklist, snapshots, links, notificações) ainda não existem',!['record_comments','record_checklist','ads_snapshots','approval_links','notifications','ig_posts'].some(x=>antesTab.includes(x)),antesTab);
 // 1ª subida: aplica as pendentes
 let srv=await subir();
 const key=process.env.SETUP_KEY;const dg=await (await fetch(`http://127.0.0.1:${PORT}/api/diag?key=${encodeURIComponent(key)}`)).json();
 const aplicadas=my(DB,'SELECT name FROM schema_migrations ORDER BY name').trim().split('\n');
 t(`a atualização aplicou só as pendentes (${files.length-6}) e todas ficaram registradas`,aplicadas.length===files.length&&aplicadas.join()===files.join(),aplicadas);
 const tabs=my(DB,'SHOW TABLES').trim().split('\n');
 t('as tabelas das migrações novas passaram a existir',['record_comments','record_checklist','ads_snapshots','approval_links','notifications','ig_posts'].every(x=>tabs.includes(x)),tabs);
 t('nenhum dado foi perdido (registros, contadores, IDs usados e histórico)',+my(DB,"SELECT COUNT(*) FROM records")===2&&+my(DB,"SELECT n FROM id_counters WHERE modulo='tarefas'")===1&&+my(DB,'SELECT COUNT(*) FROM used_ids')===2&&+my(DB,'SELECT COUNT(*) FROM status_history')===1);
 t('a conexão do diagnóstico confirma banco e migrações',dg.resultado&&dg.resultado.conexao==='ok',dg.resultado);
 // reinício: nada a aplicar
 await parar(srv);srv=await subir();await fetch(`http://127.0.0.1:${PORT}/api/diag?key=${encodeURIComponent(key)}`);
 t('reiniciar não reaplica nem duplica nada (idempotente)',+my(DB,'SELECT COUNT(*) FROM schema_migrations')===files.length&&+my(DB,'SELECT COUNT(*) FROM records')===2);
 await parar(srv);my('',`DROP DATABASE ${DB}`);
 console.log(`${ok} ok, ${bad} falhas`);process.exit(bad?1:0);
})().catch(e=>{console.error(e);try{my('',`DROP DATABASE IF EXISTS ${DB}`)}catch{}process.exit(1)});
