// Portal das Coordenações SUSPENSO por padrão: páginas, login, APIs e links bloqueados; dados e códigos preservados;
// Solicitações internas funcionando; reativação segura pela Gerência. Uso: node portal.test.js <install.out>
const fs=require('fs');
const out=fs.readFileSync(process.argv[2],'utf8');const pw=k=>out.match(new RegExp(k+'[^:]*: (\\S+)'))[1];const BASE=process.env.BASE||'http://127.0.0.1:8080';const B=BASE+'/api';
let ok=0,bad=0;const t=(n,c,x)=>{c?ok++:bad++;console.log(c?'OK  ':'FAIL',n);if(!c&&x!==undefined)console.log('    ',JSON.stringify(x).slice(0,500))};
const J={'Content-Type':'application/json','X-EVO':'1'};const cookie=r=>r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
(async()=>{
 const login=async(c,n)=>{let r=await fetch(B+'/auth/login',{method:'POST',headers:J,body:JSON.stringify({codigo:c,senha:pw(c)})});let ck=cookie(r);await fetch(B+'/auth/password',{method:'POST',headers:{...J,Cookie:ck},body:JSON.stringify({atual:pw(c),nova:n})});r=await fetch(B+'/auth/login',{method:'POST',headers:J,body:JSON.stringify({codigo:c,senha:n})});return {...J,Cookie:cookie(r)}};
 const G=await login('NAT-3301','Nat26ab'),E=await login('ANT-3302','Ant26ab');
 const call=async(m,u,b,h=G)=>{const x=await fetch(B+u,{method:m,headers:h,body:b?JSON.stringify(b):undefined});let j=null;try{j=await x.json()}catch{}return [x.status,j]};
 const pg=async p=>{const x=await fetch(BASE+p,{redirect:'manual'});return [x.status,await x.text(),x.headers]};
 let s,r,txt,h;

 // ---- padrão: desligado ----
 [,r]=await call('GET','/admin/portal');t('por padrão o Portal está desligado',r.ativo===false&&r.codigos>=1,r);
 for(const p of ['/solicitante.html','/solicitante','/portal']){[s,txt,h]=await pg(p);t(`URL direta ${p}: 503 com mensagem simples`,s===503&&/temporariamente indispon/i.test(txt)&&!/portal\.js/.test(txt)&&/noindex/.test(h.get('x-robots-tag')||''),[s,txt.slice(0,80)])}
 [s]=await pg('/portal.js');t('portal.js não é entregue (404)',s===404);
 [s]=await pg('/manifest-portal.webmanifest');t('manifesto do Portal não é entregue (404)',s===404);
 [s]=await pg('/portal.css');t('o estilo compartilhado (usado também pela aprovação por link de posts) continua disponível',s===200);
 [s,r]=await call('POST','/portal/login',{codigo:'INF-2601',senha:pw('INF-2601')},{...J});t('login de Coordenação com código válido é bloqueado (503)',s===503&&r.portalIndisponivel===true,[s,r]);
 for(const [m,u] of [['GET','/portal/requests'],['POST','/portal/requests'],['POST','/portal/upload?id=SOL-0001'],['GET','/portal/file?path=ANEXOS/SOLICITACOES/x'],['GET','/portal/comments?id=SOL-0001'],['POST','/portal/comments'],['GET','/portal/timeline?id=SOL-0001'],['GET','/portal/notices'],['POST','/portal/password']]){
  [s,r]=await call(m,u,m==='POST'?{titulo:'x',objetivo:'y'}:null,{...J,'X-Portal-Token':'qualquer'});t(`API externa ${m} ${u.split('?')[0]} bloqueada (503)`,s===503,[s,r])}
 [s]=await call('GET','/fluxo',null,{...J,'X-Portal-Token':'qualquer'});t('o token de Coordenação não abre nenhuma rota interna (401)',s===401);
 [s]=await call('PUT','/data?module=solicitacoes&id=SOL-0001',{status:'CONCLUÍDA'},{...J,'X-Portal-Token':'qualquer'});t('o token de Coordenação não altera dados (401)',s===401||s===403);

 // ---- Solicitações internas seguem normais ----
 [s,r]=await call('POST','/solicitacoes/nova',{titulo:'Pedido recebido por WhatsApp',solicitante:'Coordenação Infantil',segmento:'Infantil',prazo:'2099-01-01',responsavel:'Antônio Filho',exigeAprovacao:'1'});const S=r;
 t('pedido de WhatsApp/presencial é cadastrado internamente',s===201&&r.origem==='INTERNO'&&r.etapa==='PENDENTE',r);
 [s]=await call('POST','/solicitacoes/mover',{id:S.id,etapa:'EM_ANDAMENTO'},E);t('a equipe responsável atualiza o andamento',s===200);
 [s,r]=await call('POST','/solicitacoes/mover',{id:S.id,etapa:'EM_APROVACAO'},E);t('e envia para aprovação interna',s===200&&r.etapa==='EM_APROVACAO',r);
 [s,r]=await call('POST','/solicitacoes/pedir-info',{id:S.id,mensagem:'Qual a data?'});t('"pedir informação ao solicitante" fica indisponível sem Portal (409)',s===409,[s,r]);
 [s,r]=await call('POST','/manager/approval-link',{id:S.id});t('link externo de aprovação de DEMANDA fica bloqueado (503)',s===503,[s,r]);
 [s,r]=await call('POST','/data?module=conteudos',{titulo:'Post para a direção',status:'REVISÃO',legenda:'Legenda de teste'});const CT=r;
 [s,r]=await call('POST','/manager/approval-link',{id:CT.id});t('o link de aprovação de POST (direção) continua funcionando',s===200&&/aprovar\.html\?t=/.test(r.url),[s,r]);
 [s,r]=await call('POST','/solicitacoes/mover',{id:S.id,etapa:'CONCLUIDO'});t('a Gerente aprova e conclui internamente',s===200&&r.status==='CONCLUÍDA');

 // ---- reativação segura ----
 [s]=await call('POST','/admin/portal',{ativo:true},E);t('a equipe não liga o Portal (403)',s===403);
 [s]=await call('GET','/admin/portal',null,E);t('a equipe não consulta o interruptor (403)',s===403);
 [s]=await call('POST','/admin/portal',{ativo:true});t('ligar exige confirmação explícita (400)',s===400);
 [,r]=await call('GET','/admin/portal');t('continua desligado após tentativa sem confirmação',r.ativo===false);
 [s,r]=await call('POST','/admin/portal',{ativo:true,confirmar:'REATIVAR'});t('a Gerente reativa com confirmação',s===200&&r.ativo===true,r);
 [s,txt]=await pg('/solicitante.html');t('com o Portal ligado a página volta',s===200&&/<html/i.test(txt)&&!/temporariamente indispon/i.test(txt));
 [s]=await pg('/portal.js');t('e o portal.js também',s===200);
 [s,r]=await call('POST','/portal/login',{codigo:'INF-2601',senha:pw('INF-2601')},{...J});const PT=r&&r.token;t('os códigos guardados voltam a funcionar sem recriar nada',s===200&&!!PT,[s,r]);
 const PH={...J,'X-Portal-Token':PT};
 [s,r]=await call('POST','/portal/requests',{titulo:'Pedido pelo Portal reativado',objetivo:'Teste',segmento:'Infantil',prioridade:'MÉDIA',prazo:'2099-02-01'},PH);const PS=r;t('Coordenação abre pedido com o Portal ligado',s===201,[s,r]);
 // ---- suspender de novo ----
 [s,r]=await call('POST','/admin/portal',{ativo:false});t('a Gerente suspende de novo (sem confirmação extra)',s===200&&r.ativo===false);
 [s]=await call('GET','/portal/requests',null,PH);t('a sessão que estava aberta cai na hora (503)',s===503);
 [s,r]=await call('GET','/data?module=solicitacoes&id='+PS.id);t('o pedido feito pelo Portal continua guardado e visível internamente',s===200&&r.titulo==='Pedido pelo Portal reativado',[s,r]);
 [,r]=await call('GET','/admin/portal');t('contadores: códigos e solicitações do Portal preservados',r.codigos>=1&&r.solicitacoesDoPortal>=1,r);
 [s,r]=await call('GET','/portal/users');t('a Gerência continua vendo e gerindo os códigos das Coordenações',s===200&&r.length>=1&&r.every(x=>x.codigo));
 [s,r]=await call('POST','/portal/login',{codigo:'INF-2601',senha:pw('INF-2601')},{...J});t('de novo bloqueado (503)',s===503);
 [s,r]=await call('GET','/timeline?module=solicitacoes&id='+PS.id);t('o histórico do pedido do Portal está preservado',s===200&&r.rows.length>=1);
 [s]=await call('GET','/heartbeat',null,{...J});t('o restante do sistema segue de pé',s===200);
 console.log(`${ok} ok, ${bad} falhas`);process.exit(bad?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
