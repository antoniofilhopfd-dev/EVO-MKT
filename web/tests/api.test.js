// API básica: entrada, troca de senha, registros genéricos (módulo "ideias"), CSRF, IDs que nunca se repetem, busca, backup,
// perfis (Administrador x Equipe), limite de tentativas, auditoria, e-mail de atribuição e "esqueci a senha". Uso: node api.test.js <install.out>
const fs=require('fs');const out=fs.readFileSync(process.argv[2],'utf8');
const pw=k=>out.match(new RegExp(k+'[^:]*: (\\S+)'))[1];
const B=(process.env.BASE||'http://127.0.0.1:8080')+'/api';let ok=0,bad=0;
const t=(n,c)=>{c?ok++:bad++;console.log(c?'OK  ':'FAIL',n)};
async function call(p,{m='GET',b,ck,csrf=true}={}){const h={};if(b)h['Content-Type']='application/json';if(ck)h.Cookie=ck;if(csrf)h['X-EVO']='1';const r=await fetch(B+p,{method:m,headers:h,body:b?JSON.stringify(b):undefined});let j;try{j=await r.json()}catch{}return{s:r.status,j,c:r.headers.get('set-cookie')||''}}
(async()=>{
 let r=await call('/auth/login',{m:'POST',b:{codigo:'NAT-3301',senha:'errada'}});t('login senha errada=401',r.s===401);
 r=await call('/data?module=ideias');t('sem sessão=401',r.s===401);
 r=await call('/auth/login',{m:'POST',b:{codigo:'NAT-3301',senha:pw('NAT-3301')}});t('login Administrador',r.s===200&&r.j.mustChange===true);
 const G=r.c.split(';')[0];
 r=await call('/auth/password',{m:'POST',ck:G,b:{atual:pw('NAT-3301'),nova:'fraca'}});t('senha fraca recusada',r.s===400);r=await call('/auth/password',{m:'POST',ck:G,b:{atual:pw('NAT-3301'),nova:'Senha2026longa'}});t('senha com mais de 8 caracteres recusada',r.s===400);
 r=await call('/auth/password',{m:'POST',ck:G,b:{atual:pw('NAT-3301'),nova:'Senha26x'}});t('troca senha',r.s===200);
 r=await call('/data?module=ideias',{ck:G});t('lista vazia no início',r.s===200&&r.j.rows.length===0);
 r=await call('/data?module=ideias',{m:'POST',ck:G,b:{titulo:'Ideia á ç',status:'NOVA',custom:'x'}});t('cria IDE-0001 com acentos',r.s===201&&r.j.id==='IDE-0001'&&r.j.titulo==='Ideia á ç');
 r=await call('/data?module=ideias',{m:'POST',ck:G,b:{titulo:'CSRF'},csrf:false});t('POST sem X-EVO bloqueado',r.s===403);
 r=await call('/data?module=ideias&id=IDE-0001',{m:'PUT',ck:G,b:{status:'USADA',id:'HACK'}});t('edita e ignora id',r.s===200&&r.j.id==='IDE-0001'&&r.j.status==='USADA');
 r=await call('/data?module=ideias&id=IDE-0001',{m:'DELETE',ck:G});t('exclui',r.s===200);
 r=await call('/data?module=ideias',{m:'POST',ck:G,b:{titulo:'Outra'}});t('ID excluído NÃO reutilizado (IDE-0002)',r.j.id==='IDE-0002');
 r=await call('/data?module=ideias',{ck:G});t('headers dinâmicos incluem custom',r.j.headers.includes('custom'));
 r=await call('/search?q=outra',{ck:G});t('busca global',r.s===200&&r.j.length===1&&r.j[0].module==='ideias');
 for(const m of ['solicitacoes','tarefas','projetos','eventos','agenda','equipe','aprovacoes','relatorios','arquivos','integracoes','trafego','lixeira']){r=await call('/data?module='+m,{ck:G});if(r.s!==400&&r.s!==404){t('módulo removido responde 400/404: '+m,false)}}
 t('módulos removidos não existem mais em /data',true);
 r=await call('/backup',{m:'POST',ck:G});t('backup',r.s===200&&/evo_backup/.test(r.j.file));
 r=await call('/health',{ck:G});t('health lista só os módulos que existem',r.s===200&&r.j.modules.length===9&&!r.j.modules.some(m=>/solicit|tarefa|projeto/.test(m.modulo||m.nome||'')));
 r=await call('/auth/login',{m:'POST',b:{codigo:'ANT-3302',senha:pw('ANT-3302')}});const E=r.c.split(';')[0];
 r=await call('/data?module=configuracoes',{m:'POST',ck:E,b:{titulo:'x'}});t('Equipe não grava em Configurações',r.s===403);
 r=await call('/backup',{m:'POST',ck:E});t('Equipe não faz backup',r.s===403);
 r=await call('/data?module=ideias',{m:'POST',ck:E,b:{titulo:'Da equipe'}});t('Equipe cria ideia',r.s===201);const meu=r.j.id;
 r=await call('/data?module=ideias',{m:'POST',ck:G,b:{titulo:'Da gerente',responsavel:'Monique Vilante'}});const alheio=r.j.id;
 r=await call('/data?module=ideias&id='+alheio,{m:'DELETE',ck:E});t('Equipe não exclui item de outra pessoa',r.s===403);
 r=await call('/data?module=ideias&id='+meu,{m:'DELETE',ck:E});t('Equipe exclui o que criou',r.s===200);
 let last;for(let i=0;i<6;i++)last=await call('/auth/login',{m:'POST',b:{codigo:'MON-3303',senha:'errada'+i}});t('limite de tentativas 429',last.s===429);
 r=await call('/admin/users',{ck:G});t('Administrador lista acessos (só a equipe, 5 fichas, sem hash)',r.s===200&&r.j.length===5&&!JSON.stringify(r.j).includes('hash'));
 r=await call('/admin/users',{ck:E});t('Equipe não lista acessos',r.s===403);
 r=await call('/admin/audit',{ck:G});t('auditoria registra eventos',r.s===200&&r.j.length>5&&r.j.some(x=>x.acao==='login'));
 r=await call('/admin/reset-password',{m:'POST',ck:G,b:{tipo:'portal',codigo:'INF-2601'}});t('não existe mais ficha de Portal (400)',r.s===400);
 r=await call('/admin/user-active',{m:'POST',ck:G,b:{tipo:'interno',codigo:'NAT-3301',ativo:false}});t('Administrador não se desativa',r.s===400);
 r=await call('/admin/users/email',{m:'POST',ck:G,b:{codigo:'ANT-3302',email:'antonio@teste.com'}});t('Administrador cadastra o e-mail de uma pessoa',r.s===200);
 r=await call('/admin/users/email',{m:'POST',ck:G,b:{codigo:'ANT-3302',email:'inválido'}});t('e-mail inválido recusado',r.s===400);
 r=await call('/admin/users/email',{m:'POST',ck:E,b:{codigo:'ANT-3302',email:'x@y.com'}});t('Equipe não muda e-mail',r.s===403);
 r=await call('/auth/forgot',{m:'POST',b:{codigo:'ALU-3304',tipo:'interno'},csrf:false});t('esqueci senha: resposta genérica',r.s===200&&r.j.ok);
 r=await call('/auth/forgot',{m:'POST',b:{codigo:'NAO-EXISTE',tipo:'interno'},csrf:false});t('esqueci senha: não revela se existe',r.s===200&&r.j.mensagem.includes('Se o código existir'));
 r=await call('/admin/users',{ck:G});t('Acessos marca quem pediu nova senha',r.j.find(x=>x.codigo==='ALU-3304').pediuReset===true&&!r.j.find(x=>x.codigo==='EDU-3305').pediuReset);
 await call('/admin/reset-password',{m:'POST',ck:G,b:{tipo:'interno',codigo:'ALU-3304'}});
 r=await call('/admin/users',{ck:G});t('após redefinir, a marcação some',r.j.find(x=>x.codigo==='ALU-3304').pediuReset===false);
 // atribuição de uma publicação a uma pessoa com e-mail avisa por e-mail
 r=await call('/data?module=conteudos',{m:'POST',ck:G,b:{titulo:'Atribuída ao Antônio',responsavel:'Antônio Filho',status:'RASCUNHO'}});t('cria publicação atribuída',r.s===201);
 const MAILLOG=process.env.MAILLOG;
 if(MAILLOG&&fs.existsSync(MAILLOG)){const ml=fs.readFileSync(MAILLOG,'utf8');t('e-mail de atribuição enviado ao Antônio',ml.includes('antonio@teste.com'));}
 console.log(`\n${ok} ok, ${bad} falhas`);process.exit(bad?1:0)})();
