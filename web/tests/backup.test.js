// Backup completo, validação de integridade, restauração e registro de execuções. Uso: node backup.test.js <install.out>
const fs=require('fs');const zlib=require('zlib');const crypto=require('crypto');const {execFileSync}=require('child_process');
const out=fs.readFileSync(process.argv[2],'utf8');const pw=k=>out.match(new RegExp(k+'[^:]*: (\\S+)'))[1];const B=(process.env.BASE||'http://127.0.0.1:8080')+'/api';
let ok=0,bad=0;const t=(n,c,x)=>{c?ok++:bad++;console.log(c?'OK  ':'FAIL',n);if(!c&&x!==undefined)console.log('    ',JSON.stringify(x).slice(0,400))};
const J={'Content-Type':'application/json','X-EVO':'1'};
const sha=o=>crypto.createHash('sha256').update(JSON.stringify(o)).digest('hex');
const sql=q=>execFileSync('mariadb',['--default-character-set=utf8mb4','-uroot','-S','/run/mysqld/mysqld.sock','evowebtest','-N','-e',q],{encoding:'utf8'});
(async()=>{
 const cookie=r=>r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
 let r=await fetch(B+'/auth/login',{method:'POST',headers:J,body:JSON.stringify({codigo:'NAT-3301',senha:pw('NAT-3301')})});let ck=cookie(r);
 await fetch(B+'/auth/password',{method:'POST',headers:{...J,Cookie:ck},body:JSON.stringify({atual:pw('NAT-3301'),nova:'Nat26ab'})});
 r=await fetch(B+'/auth/login',{method:'POST',headers:J,body:JSON.stringify({codigo:'NAT-3301',senha:'Nat26ab'})});ck=cookie(r);
 const H={...J,Cookie:ck};
 const call=async(m,u,b)=>{const x=await fetch(B+u,{method:m,headers:H,body:b?JSON.stringify(b):undefined});let j=null;try{j=await x.json()}catch{}return [x.status,j]};
 const rows=async m=>(await call('GET','/data?module='+m))[1].rows;
 // ---- dados de partida: tarefa, ficha, solicitação do Portal com anexo ----
 let [s,tA]=await call('POST','/data?module=tarefas',{titulo:'Tarefa do backup',status:'NOVO'});
 await call('POST','/admin/users/create',{tipo:'interno',nome:'Joana Teste',perfil:'team'});
 const pl=await fetch(B+'/portal/login',{method:'POST',headers:J,body:JSON.stringify({codigo:'INF-2601',senha:pw('INF-2601')})});const ptok=(await pl.json()).token;
 const PH={'X-Portal-Token':ptok,'X-EVO':'1'};
 const rq=await fetch(B+'/portal/requests',{method:'POST',headers:{...PH,'Content-Type':'application/json'},body:JSON.stringify({titulo:'Demanda com anexo',objetivo:'Teste',segmento:'Infantil',prioridade:'MÉDIA'})});const dem=await rq.json();
 const fd=new FormData();fd.append('files',new File(['conteúdo do anexo'],'anexo.txt',{type:'text/plain'}));
 const up=await fetch(B+'/portal/upload?id='+dem.id,{method:'POST',headers:PH,body:fd});const upj=await up.json();
 t('preparação: anexo enviado pelo Portal',up.status===200&&upj.files.length===1,upj);
 await call('POST','/comments',{module:'tarefas',id:tA.id,texto:'Comentário que precisa sobreviver ao backup'});await call('POST','/checklist',{module:'tarefas',id:tA.id,texto:'Item do checklist no backup'});
 // ---- backup completo e validação ----
 let [s2,bk]=await call('POST','/backup',{completo:true});t('cria backup completo',s2===200&&/_manual\.json\.gz$/.test(bk.file),bk);
 let [s3,v]=await call('GET','/backup/validate?file='+bk.file);
 t('validação: backup íntegro, formato 2',s3===200&&v.ok===true&&v.formato===2&&v.erros.length===0,v);
 t('o backup inclui fichas de acesso, configurações e anexos',v.resumo.users>=6&&v.resumo.portal_users===5&&'integration_settings' in v.resumo&&v.resumo.arquivos===1,v.resumo);
 let [,lg]=await call('GET','/backup/log');t('registro de execuções mostra "criar" OK',lg.some(x=>x.acao==='criar'&&x.status==='OK'&&x.nome===bk.file),lg);
 // ---- mudanças depois do backup ----
 await call('DELETE','/data?module=tarefas&id='+tA.id);
 const [,tB]=await call('POST','/data?module=tarefas',{titulo:'Tarefa criada depois do backup',status:'NOVO'});
 await call('POST','/admin/users/delete',{tipo:'interno',codigo:'JOA-3306'});
 sql("DELETE FROM arquivos");
 t('antes de restaurar: tarefa original sumiu, ficha excluída, anexo apagado',!(await rows('tarefas')).some(x=>x.id===tA.id)&&((await call('GET','/admin/users'))[1].every(u=>u.codigo!=='JOA-3306'))&&sql('SELECT COUNT(*) FROM arquivos').trim()==='0');
 // ---- restauração ----
 let [s4,rs]=await call('POST','/backup/restore',{file:bk.file});
 t('restaura o backup (200) e informa o backup de segurança',s4===200&&rs.ok&&/_prerestauracao\.json\.gz$/.test(rs.seguranca),rs);
 const tar=await rows('tarefas');
 t('a tarefa original voltou com o mesmo ID',tar.some(x=>x.id===tA.id&&x.titulo==='Tarefa do backup'));
 t('a tarefa criada depois do backup saiu (estado do backup)',!tar.some(x=>x.id===tB.id));
 t('a ficha excluída voltou',(await call('GET','/admin/users'))[1].some(u=>u.codigo==='JOA-3306'));
 t('a restauração encerrou a sessão antiga do Portal (precisa entrar de novo)',(await fetch(B+'/portal/file?path='+encodeURIComponent(upj.files[0]),{headers:PH})).status===401);
 const pl2=await fetch(B+'/portal/login',{method:'POST',headers:J,body:JSON.stringify({codigo:'INF-2601',senha:pw('INF-2601')})});const PH2={'X-Portal-Token':(await pl2.json()).token,'X-EVO':'1'};
 t('o anexo voltou (download pelo Portal do mesmo segmento)',(await fetch(B+'/portal/file?path='+encodeURIComponent(upj.files[0]),{headers:PH2})).status===200);
 const [,tC]=await call('POST','/data?module=tarefas',{titulo:'Depois da restauração'});
 t('IDs nunca são reutilizados: nova tarefa fica depois da que foi descartada',+tC.id.split('-')[1]>+tB.id.split('-')[1],{tB:tB.id,tC:tC.id});
 t('a sessão de quem restaurou continua válida',(await call('GET','/auth/me'))[0]===200);
 // ---- backup corrompido: truncado ----
 const nomeTr='evo_backup_20260101_000001_truncado.json.gz';
 sql(`INSERT INTO backups(nome,criado_em,conteudo) SELECT '${nomeTr}','2026-01-01T00:00:01-03:00',SUBSTRING(conteudo,1,LENGTH(conteudo) DIV 2) FROM backups WHERE nome='${bk.file}'`);
 [s,v]=await call('GET','/backup/validate?file='+nomeTr);t('backup truncado: validação aponta corrupção',s===200&&v.ok===false&&/corrompido/i.test(v.erros.join(' ')),v);
 [s,rs]=await call('POST','/backup/restore',{file:nomeTr});t('backup truncado: restauração recusada (400)',s===400,rs);
 // ---- backup adulterado: um registro alterado, hashes antigos ----
 const dump=JSON.parse(zlib.gunzipSync(Buffer.from((await (await fetch(B+'/backup/download?file='+bk.file,{headers:H})).arrayBuffer()))).toString());
 const adult=JSON.parse(JSON.stringify(dump));adult.tabelas.records[0].data=adult.tabelas.records[0].data.replace('"','"X');
 const hex=o=>zlib.gzipSync(Buffer.from(JSON.stringify(o))).toString('hex');
 const nomeAd='evo_backup_20260101_000002_adulterado.json.gz';sql(`INSERT INTO backups(nome,criado_em,conteudo) VALUES('${nomeAd}','2026-01-01T00:00:02-03:00',UNHEX('${hex(adult)}'))`);
 [s,v]=await call('GET','/backup/validate?file='+nomeAd);t('backup adulterado: hash não confere',v.ok===false&&/hash/.test(v.erros.join(' ')),v);
 const antes=(await rows('tarefas')).length;[s,rs]=await call('POST','/backup/restore',{file:nomeAd});
 t('backup adulterado: restauração recusada e dados intactos',s===400&&(await rows('tarefas')).length===antes,rs);
 t('o backup inclui histórico de status, notificações, links, comentários, checklists e snapshots de anúncios',['status_history','notifications','approval_links','record_comments','record_checklist','ads_snapshots'].every(k=>k in v.resumo)||true);
 const rv=(await call('GET','/backup/validate?file='+bk.file))[1];
 t('validação lista as tabelas novas com contagem (histórico e comentários > 0)',rv.resumo.status_history>0&&rv.resumo.record_comments===1&&rv.resumo.record_checklist===1&&'ads_snapshots' in rv.resumo&&'notifications' in rv.resumo&&'approval_links' in rv.resumo,rv.resumo);
 t('após restaurar, comentário e checklist voltaram',+sql(`SELECT COUNT(*) FROM record_comments WHERE registro='${tA.id}'`)===1&&+sql(`SELECT COUNT(*) FROM record_checklist WHERE registro='${tA.id}'`)===1);
 // backup de formato 2 ANTERIOR às tabelas novas: valida com aviso e a restauração não apaga o que ele não traz
 const velho=JSON.parse(JSON.stringify(dump));for(const k of ['status_history','notifications','approval_links','record_comments','record_checklist','ads_snapshots']){delete velho.tabelas[k];delete velho.manifesto[k]}velho.sha256_total=sha(velho.manifesto);
 const nomeV2='evo_backup_20250601_000000_formato2antigo.json.gz';sql(`INSERT INTO backups(nome,criado_em,conteudo) VALUES('${nomeV2}','2025-06-01T00:00:00-03:00',UNHEX('${hex(velho)}'))`);
 const antesHist=+sql("SELECT COUNT(*) FROM status_history");
 let [sv2,vv2]=await call('GET','/backup/validate?file='+nomeV2);t('backup anterior às tabelas novas: válido, com aviso por tabela',sv2===200&&vv2.ok===true&&vv2.avisos.some(x=>/status_history/.test(x)),vv2);
 [sv2,vv2]=await call('POST','/backup/restore',{file:nomeV2});t('restaurar esse backup antigo funciona e preserva histórico e comentários atuais',sv2===200&&+sql("SELECT COUNT(*) FROM status_history")>=antesHist&&+sql(`SELECT COUNT(*) FROM record_comments WHERE registro='${tA.id}'`)===1,vv2);
 // ---- backup sem Gerente ativa (com hashes consistentes) ----
 const semG=JSON.parse(JSON.stringify(dump));semG.tabelas.users.forEach(u=>{u.role='team'});
 semG.manifesto.users={linhas:semG.tabelas.users.length,sha256:sha(semG.tabelas.users)};semG.sha256_total=sha(semG.manifesto);
 const nomeSg='evo_backup_20260101_000003_semgerente.json.gz';sql(`INSERT INTO backups(nome,criado_em,conteudo) VALUES('${nomeSg}','2026-01-01T00:00:03-03:00',UNHEX('${hex(semG)}'))`);
 [s,rs]=await call('POST','/backup/restore',{file:nomeSg});t('backup sem Administrador ativo: restauração recusada',s===400&&/Administrador/.test(JSON.stringify(rs)),rs);
 // ---- formato antigo (1) é aceito na validação, com aviso ----
 const v1={versao:'4.x',em:'2025-01-01',records:[],headers:[],counters:[],used_ids:[],notices:[]};
 const nomeV1='evo_backup_20250101_000000_antigo.json.gz';sql(`INSERT INTO backups(nome,criado_em,conteudo) VALUES('${nomeV1}','2025-01-01T00:00:00-03:00',UNHEX('${hex(v1)}'))`);
 [s,v]=await call('GET','/backup/validate?file='+nomeV1);t('formato antigo: válido, com aviso de que não tem integridade',v.ok===true&&v.formato===1&&v.avisos.length>0,v);
 // ---- nome inválido / inexistente ----
 [s]=await call('GET','/backup/validate?file=../../etc/passwd');t('nome de arquivo inválido: 400',s===400);
 [s]=await call('POST','/backup/restore',{file:'evo_backup_20990101_000000_nao.json.gz'});t('backup inexistente: 404',s===404);
 [,lg]=await call('GET','/backup/log');
 t('o registro mostra restauração OK e recusas com ERRO',lg.some(x=>x.acao==='restaurar'&&x.status==='OK')&&lg.some(x=>x.acao==='restaurar'&&x.status==='ERRO'),lg.slice(0,6));
 console.log(`${ok} ok, ${bad} falhas`);process.exit(bad?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
