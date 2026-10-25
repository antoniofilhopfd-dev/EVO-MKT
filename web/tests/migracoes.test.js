// Migração v5.17 → v6: instalação com dados antigos (025 aplicada) sobe até a última sem perder o que fica; antes de mexer faz backup completo e uma cópia do que sai;
// converte status, segmentos e materiais; preserva o histórico de anúncios; gera o relatório; e é idempotente no reinício. Uso: node migracoes.test.js <install.out>
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
 const antigas=files.filter(f=>parseInt(f,10)<=25);
 my(DB,'CREATE TABLE schema_migrations(name VARCHAR(190) PRIMARY KEY, applied_at VARCHAR(40) NOT NULL)');
 for(const f of antigas){const sqlTxt=fs.readFileSync(path.join(WEB,'db/migrations',f),'utf8');
  for(const stmt of sqlTxt.split(/;\s*(?:\r?\n|$)/).map(s=>s.trim()).filter(Boolean)){const body=stmt.split(/\r?\n/).filter(l=>!l.trim().startsWith('--')).join('\n').trim();if(body)try{my(DB,body)}catch(e){if(!/already exists|Duplicate/i.test(String(e.stderr||e.message)))throw e}}
  my(DB,`INSERT INTO schema_migrations(name,applied_at) VALUES('${f}','2026-01-01')`)}
 const rec=(mod,id,o)=>`('${mod}','${id}','${JSON.stringify({id,...o}).replace(/'/g,"''")}','2026-01-02','2026-01-02')`;
 const lista=[
  rec('conteudos','CON-0001',{titulo:'Revisão antiga',status:'REVISÃO',segmento:'Infantil',perfil:'@evolucaopb',formato:'Feed',legenda:'texto',publicacaoEm:'2026-03-10T10:00',anexos:'ANEXOS/SOLICITACOES/SOL-0001/ref.pdf | https://drive.google.com/file/d/ZZZ/view'}),
  rec('conteudos','CON-0002',{titulo:'Programado antigo',status:'PROGRAMADO',segmento:'Anos Iniciais',midiaInstagram:'ANEXOS/CONTEUDOS/CON-0002/midia_a.jpg',publicarInstagram:'SIM',publicacaoEm:'2026-03-12T10:00'}),
  rec('conteudos','CON-0003',{titulo:'Briefing',status:'BRIEFING',segmento:'Geral'}),
  rec('conteudos','CON-0004',{titulo:'Produção',status:'PRODUÇÃO',segmento:'Anos Finais',arquivoFinal:'https://drive.google.com/file/d/FINAL/view'}),
  rec('solicitacoes','SOL-0001',{titulo:'Demanda antiga',status:'EM EXECUÇÃO',segmento:'Infantil'}),rec('tarefas','TAR-0001',{titulo:'Tarefa antiga',status:'NOVO'}),
  rec('projetos','PRJ-0001',{titulo:'Projeto antigo'}),rec('equipe','EQP-0001',{titulo:'Antônio Filho',email:'antonio@teste.com'}),
  rec('arquivos','ARQ-0001',{titulo:'Cartaz da biblioteca',conteudoId:'CON-0001',caminhoArquivo:'BIBLIOTECA/IMAGENS/cartaz.jpg'}),
  rec('calendario','CAL-0001',{titulo:'Reunião antiga',inicioEm:'2026-03-15T10:00',dataInicio:'2026-03-15'}),rec('ideias','IDE-0001',{titulo:'Ideia',segmento:'Anos Finais'}),
  rec('calescolar','ESC-0001',{titulo:'Prova',dataInicio:'2026-04-01',dataFim:'2026-04-01',tipoEvento:'PROVA',segmentos:'ANO1|FUND2'}),
 ].join(',');
 my(DB,`INSERT INTO users(codigo,nome,role,label,admin,pass_hash,must_change,ativo) VALUES('NAT-3301','Natália Mello','manager','Administrador',1,'x',0,1),('ANT-3302','Antônio Filho','team','Equipe de Marketing',0,'x',0,1);
  INSERT INTO records(modulo,id,data,criado_em,atualizado_em) VALUES ${lista};
  INSERT INTO id_counters(modulo,n) VALUES('conteudos',4),('solicitacoes',1),('tarefas',1);
  INSERT INTO used_ids(id) VALUES('CON-0001'),('CON-0002'),('CON-0003'),('CON-0004'),('SOL-0001'),('TAR-0001');
  INSERT INTO arquivos(caminho,mime,tamanho,conteudo,criado_em) VALUES('ANEXOS/SOLICITACOES/SOL-0001/ref.pdf','application/pdf',5,'%PDF-','2026-01-02'),('ANEXOS/SOLICITACOES/SOL-0001/orfao.pdf','application/pdf',5,'%PDF-','2026-01-02'),('ANEXOS/CONTEUDOS/CON-0002/midia_a.jpg','image/jpeg',3,'abc','2026-01-02'),('BIBLIOTECA/IMAGENS/cartaz.jpg','image/jpeg',3,'abc','2026-01-02'),('BIBLIOTECA/IMAGENS/solta.jpg','image/jpeg',3,'abc','2026-01-02');
  INSERT INTO portal_users(codigo,nome,perfil,segmentos,pass_hash,ativo) VALUES('INF-2601','Infantil','Coordenação','Infantil','x',1);
  INSERT INTO ads_acoes(quando,quem,nivel,objeto_id,nome,acao,antes,depois,resultado) VALUES('2026-02-01','ANT-3302','ad','a1','Anúncio','pausar','ACTIVE','PAUSED','OK');`);
 t('instalação antiga preparada (025 aplicada, com dados e fichas)',+my(DB,'SELECT COUNT(*) FROM schema_migrations')===antigas.length&&antigas.length===25&&files.length>=28,[antigas.length,files.length]);
 const antesTab=my(DB,'SHOW TABLES').trim().split('\n');
 t('antes: Portal e links de aprovação existem; relatório ainda não',antesTab.includes('portal_users')&&antesTab.includes('approval_links')&&!antesTab.includes('relatorio_migracao'));
 let srv=await subir();
 await fetch(`http://127.0.0.1:${PORT}/api/heartbeat`);
 const aplicadas=my(DB,'SELECT name FROM schema_migrations ORDER BY name').trim().split('\n');
 t('todas as migrações novas foram aplicadas e registradas',aplicadas.join()===files.join(),aplicadas.slice(-4));
 const tabs=my(DB,'SHOW TABLES').trim().split('\n');
 t('Portal, avisos e links de aprovação foram removidos; o relatório existe',!['portal_users','notices','approval_links'].some(x=>tabs.includes(x))&&tabs.includes('relatorio_migracao'),tabs);
 const nomes=my(DB,'SELECT nome FROM backups ORDER BY nome').trim().split('\n');
 t('houve backup completo antes de mexer e uma cópia do que saiu (só consulta)',nomes.some(n=>/_prereestruturacao\.json\.gz$/.test(n))&&nomes.some(n=>/_legadov6\.json\.gz$/.test(n)),nomes);
 const mods=my(DB,"SELECT modulo,COUNT(*) FROM records GROUP BY modulo ORDER BY modulo").trim().split('\n').map(l=>l.split('\t'));const m=Object.fromEntries(mods);
 t('módulos descontinuados saíram dos registros; os mantidos ficaram intactos',!['solicitacoes','tarefas','projetos','equipe','arquivos'].some(x=>m[x])&&m.conteudos==='4'&&m.calendario==='1'&&m.ideias==='1'&&m.calescolar==='1',m);
 const c=id=>JSON.parse(my(DB,`SELECT data FROM records WHERE modulo='conteudos' AND id='${id}'`).trim());
 t('status antigos viraram o fluxo novo (REVISÃO, PROGRAMADO, BRIEFING, PRODUÇÃO)',c('CON-0001').status==='EM REVISÃO'&&c('CON-0002').status==='AGENDADO'&&c('CON-0003').status==='RASCUNHO'&&c('CON-0004').status==='EM PRODUÇÃO');
 t('segmentos antigos viraram o catálogo único',c('CON-0001').segmento==='Educação Infantil'&&c('CON-0002').segmento==='Ensino Fundamental – Anos Iniciais'&&c('CON-0003').segmento==='Todos'&&c('CON-0004').segmento==='Ensino Fundamental – Anos Finais'&&JSON.parse(my(DB,"SELECT data FROM records WHERE modulo='ideias'").trim()).segmento==='Ensino Fundamental – Anos Finais');
 t('segmentos do calendário escolar: 1º ano virou Anos Iniciais',JSON.parse(my(DB,"SELECT data FROM records WHERE modulo='calescolar'").trim()).segmentos==='FUND1|FUND2');
 const m1=c('CON-0001').materiais||[],m2=c('CON-0002').materiais||[],m4=c('CON-0004').materiais||[];
 t('anexos e arquivos viraram materiais da publicação (referência, arquivo final) com o Drive só como link',m1.some(x=>x.papel==='referencia'&&x.tipo==='arquivo'&&/ref\.pdf$/.test(x.caminho))&&m1.some(x=>x.papel==='referencia'&&x.tipo==='drive')&&m1.some(x=>/cartaz\.jpg/.test(x.caminho||''))&&m2.some(x=>x.papel==='final'&&/midia_a\.jpg/.test(x.caminho))&&m4.some(x=>x.papel==='final'&&x.tipo==='drive'),{m1,m2,m4});
 t('o e-mail da antiga ficha da Equipe passou para o usuário',my(DB,"SELECT email FROM users WHERE codigo='ANT-3302'").trim()==='antonio@teste.com');
 t('contadores e IDs usados continuam (nenhum ID é reutilizado)',+my(DB,"SELECT n FROM id_counters WHERE modulo='conteudos'")===4&&+my(DB,"SELECT COUNT(*) FROM used_ids WHERE id LIKE 'CON-%'")===4);
 t('usuários preservados',+my(DB,'SELECT COUNT(*) FROM users')===2);
 t('histórico de ações em anúncios foi preservado intacto (somente leitura)',+my(DB,'SELECT COUNT(*) FROM ads_acoes')===1);
 const arq=my(DB,'SELECT caminho FROM arquivos ORDER BY caminho').trim().split('\n');
 t('anexo usado por publicação continua; o que ninguém usa foi para o relatório (nada apagado da biblioteca)',arq.includes('ANEXOS/SOLICITACOES/SOL-0001/ref.pdf')&&!arq.includes('ANEXOS/SOLICITACOES/SOL-0001/orfao.pdf')&&arq.includes('BIBLIOTECA/IMAGENS/solta.jpg')&&arq.includes('BIBLIOTECA/IMAGENS/cartaz.jpg'),arq);
 const rel=JSON.parse(my(DB,"SELECT v FROM relatorio_migracao WHERE k='cinco_areas'").trim());
 t('relatório: o que foi removido, mantido e migrado, e os arquivos sem vínculo',rel.removidos.solicitacoes===1&&rel.removidos.tarefas===1&&rel.mantidos.publicacoes===4&&rel.materiaisMigrados>=4&&rel.arquivosSemVinculo.lista.some(x=>x.caminho==='BIBLIOTECA/IMAGENS/solta.jpg')&&!!rel.backup&&!!rel.copiaDosDadosRemovidos,rel);
 await parar(srv);srv=await subir();await fetch(`http://127.0.0.1:${PORT}/api/heartbeat`);
 t('reiniciar não reaplica, não refaz backup nem duplica nada (idempotente)',+my(DB,'SELECT COUNT(*) FROM schema_migrations')===files.length&&+my(DB,"SELECT COUNT(*) FROM backups WHERE nome LIKE '%prereestruturacao%'")===1&&+my(DB,"SELECT COUNT(*) FROM records WHERE modulo='conteudos'")===4&&c('CON-0001').materiais.length===m1.length);
 await parar(srv);my('',`DROP DATABASE ${DB}`);
 console.log(`${ok} ok, ${bad} falhas`);process.exit(bad?1:0);
})().catch(e=>{console.error(e);try{my('',`DROP DATABASE IF EXISTS ${DB}`)}catch{}process.exit(1)});
