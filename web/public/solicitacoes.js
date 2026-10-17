/* Solicitações: uma área só. Cadastro rápido, Kanban/lista, 4 etapas (Pendente, Em andamento, Em aprovação, Concluído).
   Os dados seguem com os 9 status originais (o Portal depende deles); aqui só aparecem as 4 etapas. */
const SL_ETAPAS=[['PENDENTE','Pendente'],['EM_ANDAMENTO','Em andamento'],['EM_APROVACAO','Em aprovação'],['CONCLUIDO','Concluído']];
const SL_ROT=Object.fromEntries(SL_ETAPAS);
const SL_PRIO_ORD={URGENTE:0,ALTA:1,'MÉDIA':2,BAIXA:3};
const SL_EQUIPE=[['PENDENTE','EM_ANDAMENTO'],['EM_ANDAMENTO','EM_APROVACAO'],['EM_ANDAMENTO','CONCLUIDO']];
let sl={rows:[],opc:{segmentos:[],responsaveis:[],solicitantes:[],prioridades:[]},eu:{nome:'',role:'',codigo:''},hoje:'',vista:'kanban',f:{q:'',resp:'',seg:'',etapa:'',prazo:''},ord:'prazo',dir:1,verConcluidas:false};
const slGerente=()=>sl.eu.role==='manager';
const slDono=r=>String(r.responsavel||'').trim()!==''&&String(r.responsavel).trim().toLowerCase()===String(sl.eu.nome).trim().toLowerCase();
const slJson=(b)=>({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});
/** Para quais etapas o usuário pode mover esta solicitação (a mesma regra que o servidor aplica). */
function slDestinos(r){
 if(slGerente())return SL_ETAPAS.map(x=>x[0]).filter(e=>e!==r.etapa);
 if(!slDono(r))return[];
 return SL_EQUIPE.filter(([a,z])=>a===r.etapa&&(z!=='EM_APROVACAO'||r.exigeAprovacao==='1')&&(z!=='CONCLUIDO'||r.exigeAprovacao!=='1')).map(x=>x[1]);
}
function slProxima(r){
 const d=slDestinos(r);
 if(r.etapa==='PENDENTE'){if(!String(r.responsavel||'').trim())return slGerente()?{acao:'abrir',rot:'Distribuir'}:null;return d.includes('EM_ANDAMENTO')?{acao:'mover',para:'EM_ANDAMENTO',rot:'Iniciar'}:null}
 if(r.etapa==='EM_ANDAMENTO'){if(r.exigeAprovacao==='1')return d.includes('EM_APROVACAO')?{acao:'mover',para:'EM_APROVACAO',rot:'Enviar p/ aprovação'}:null;return d.includes('CONCLUIDO')?{acao:'mover',para:'CONCLUIDO',rot:'Concluir'}:null}
 if(r.etapa==='EM_APROVACAO')return slGerente()?{acao:'mover',para:'CONCLUIDO',rot:'Aprovar e concluir'}:null;
 return null;
}
function slFiltradas(){
 const f=sl.f,q=f.q.trim().toLowerCase(),h=sl.hoje,sem=new Date(Date.now()+7*86400000).toISOString().slice(0,10),eu=String(sl.eu.nome).trim().toLowerCase();
 return sl.rows.filter(r=>{
  if(r.cancelada&&!sl.verConcluidas&&f.etapa!=='CONCLUIDO')return false;
  if(f.etapa&&r.etapa!==f.etapa)return false;
  if(f.seg&&(r.segmento||'')!==f.seg)return false;
  if(f.resp==='__eu'&&String(r.responsavel||'').trim().toLowerCase()!==eu)return false;
  if(f.resp==='__nenhum'&&String(r.responsavel||'').trim()!=='')return false;
  if(f.resp&&!f.resp.startsWith('__')&&String(r.responsavel||'').trim()!==f.resp)return false;
  const p=r.prazoEfetivo||'';
  if(f.prazo==='atrasadas'&&!r.atrasada)return false;
  if(f.prazo==='hoje'&&p!==h)return false;
  if(f.prazo==='semana'&&!(p&&p>=h&&p<=sem))return false;
  if(f.prazo==='sem'&&p!=='')return false;
  if(q&&!`${r.id} ${r.titulo} ${r.descricao||''} ${r.solicitante||''} ${r.responsavel||''} ${r.segmento||''}`.toLowerCase().includes(q))return false;
  return true;
 });
}
const slPrazoTxt=r=>r.prazoEfetivo?fmtDate(r.prazoEfetivo):'Sem prazo';
function slOrdenar(rows){
 const k=sl.ord,d=sl.dir;
 const val=r=>k==='prazo'?(r.prazoEfetivo||'9999'):k==='etapa'?SL_ETAPAS.findIndex(e=>e[0]===r.etapa):k==='prioridade'?(SL_PRIO_ORD[r.prioridade]??9):String(r[k]||'').toLowerCase();
 return [...rows].sort((a,b)=>{const x=val(a),y=val(b);return (x<y?-1:x>y?1:0)*d||String(a.id).localeCompare(String(b.id))});
}
const slChips=r=>[
 r.atrasada?'<span class="sl-chip bad">Atrasada</span>':'',
 r.cancelada?'<span class="sl-chip">Cancelada</span>':'',
 r.aguardandoSolicitante?'<span class="sl-chip warn">Aguardando solicitante</span>':'',
 r.exigeAprovacao==='1'&&r.etapa!=='CONCLUIDO'?'<span class="sl-chip">Exige aprovação</span>':'',
 r.prioridade==='URGENTE'||r.prioridade==='ALTA'?`<span class="sl-chip ${r.prioridade==='URGENTE'?'bad':'warn'}">${esc(r.prioridade==='URGENTE'?'Urgente':'Alta')}</span>`:''
].join('');
function slCard(r){
 const prox=slProxima(r),dest=slDestinos(r),pode=dest.length>0;
 const nAnexos=String(r.anexos||'').split('|').filter(x=>x.trim()).length;
 return `<article class="sl-card${r.atrasada?' atrasada':''}${r.cancelada?' cancelada':''}" ${pode?'draggable="true"':''} data-id="${attr(r.id)}" tabindex="0" aria-label="${attr(r.titulo)}">
  <div class="sl-card-top"><small>${esc(r.id)}</small>${r.segmento?`<span class="sl-seg">${esc(r.segmento)}</span>`:''}</div>
  <b class="sl-titulo">${esc(r.titulo||'Sem título')}</b>
  <div class="sl-meta"><span title="Responsável">${r.responsavel?`<i class="sl-av" aria-hidden="true">${esc(String(r.responsavel).trim().slice(0,1).toUpperCase())}</i> ${esc(r.responsavel)}`:'<em>Sem responsável</em>'}</span><span class="${r.atrasada?'sl-atraso':''}" title="Prazo">${esc(slPrazoTxt(r))}</span></div>
  <div class="sl-chips">${slChips(r)}${nAnexos?`<span class="sl-chip">📎 ${nAnexos}</span>`:''}</div>
  <div class="sl-card-acoes">${prox?`<button type="button" class="softbtn" data-sl-${prox.acao}="${attr(r.id)}" ${prox.para?`data-para="${prox.para}"`:''}>${esc(prox.rot)}</button>`:''}
   ${pode?`<select class="sl-mover" data-id="${attr(r.id)}" aria-label="Mover ${attr(r.titulo)} para"><option value="">Mover para…</option>${dest.map(e=>`<option value="${e}">${esc(SL_ROT[e])}</option>`).join('')}</select>`:''}
   <button type="button" class="softbtn" data-sl-abrir="${attr(r.id)}">Abrir</button></div>
 </article>`;
}
function slKanban(rows){
 return `<div class="sl-board">${SL_ETAPAS.map(([k,l])=>{
  let lista=rows.filter(r=>r.etapa===k);
  lista=k==='CONCLUIDO'?lista.sort((a,b)=>String(b.atualizadoEm||'').localeCompare(String(a.atualizadoEm||''))):slOrdenar(lista);
  const extra=k==='CONCLUIDO'&&lista.length>15?lista.length-15:0;if(extra)lista=lista.slice(0,15);
  return `<section class="sl-col" data-etapa="${k}" aria-label="${l}"><header><h3>${l}</h3><span class="sl-count">${rows.filter(r=>r.etapa===k).length}</span></header><div class="sl-drop">${lista.map(slCard).join('')||'<div class="sl-vazio">Nada aqui.</div>'}${extra?`<div class="sl-vazio">+${extra} na visão em lista</div>`:''}</div></section>`}).join('')}</div>`;
}
function slLista(rows){
 const th=(k,l)=>`<th><button type="button" class="sl-th" data-ord="${k}" aria-label="Ordenar por ${l}">${l}${sl.ord===k?(sl.dir>0?' ▲':' ▼'):''}</button></th>`;
 const lista=slOrdenar(rows);
 return `<div class="tablewrap"><table class="datatable sl-tabela"><thead><tr><th>ID</th>${th('titulo','Título')}${th('segmento','Segmento')}<th>Solicitante</th>${th('responsavel','Responsável')}${th('prazo','Prazo')}${th('prioridade','Prioridade')}${th('etapa','Status')}<th></th></tr></thead><tbody>${lista.map(r=>`<tr class="${r.atrasada?'atrasada':''}"><td>${esc(r.id)}</td><td><b>${esc(r.titulo||'')}</b>${slChips(r)?`<div class="sl-chips">${slChips(r)}</div>`:''}</td><td>${esc(r.segmento||'—')}</td><td>${esc(r.solicitante||'—')}</td><td>${esc(r.responsavel||'—')}</td><td class="${r.atrasada?'sl-atraso':''}">${esc(slPrazoTxt(r))}</td><td>${esc(r.prioridade||'—')}</td><td><span class="sl-etapa e-${r.etapa}">${esc(SL_ROT[r.etapa])}</span></td><td><button type="button" class="softbtn" data-sl-abrir="${attr(r.id)}">Abrir</button></td></tr>`).join('')||'<tr><td colspan="9"><div class="empty compact">Nenhuma solicitação com esses filtros.</div></td></tr>'}</tbody></table></div>`;
}
function slOpts(lista,sel,vazio,extras=[]){return `<option value="">${vazio}</option>${extras.map(([v,l])=>`<option value="${v}" ${sel===v?'selected':''}>${l}</option>`).join('')}${lista.map(x=>`<option value="${attr(x)}" ${sel===x?'selected':''}>${esc(x)}</option>`).join('')}`}
async function slCarrega(){
 const d=await api('/solicitacoes/painel');
 sl.rows=d.rows||[];sl.opc=d.opcoes||sl.opc;sl.eu=d.eu||sl.eu;sl.hoje=d.hoje||today();
}
function slDesenha(){
 const box=$('#slRaiz');if(!box)return;
 const ativas=sl.rows.filter(r=>!r.cancelada),rows=slFiltradas();
 const cont=e=>ativas.filter(r=>r.etapa===e).length,atras=ativas.filter(r=>r.atrasada).length;
 const kpi=(l,v,acao,cls='')=>`<button type="button" class="sl-kpi ${cls}" data-sl-kpi="${acao}" aria-pressed="${(acao.startsWith('etapa:')&&sl.f.etapa===acao.slice(6))||(acao==='atrasadas'&&sl.f.prazo==='atrasadas')}"><small>${l}</small><strong>${v}</strong></button>`;
 const filtros=Object.values(sl.f).some(Boolean);
 box.innerHTML=`<div class="sl-kpis">${SL_ETAPAS.map(([k,l])=>kpi(l,cont(k),'etapa:'+k)).join('')}${kpi('Atrasadas',atras,'atrasadas',atras?'bad':'')}</div>
 <div class="sl-barra" role="search">
  <input class="control" type="search" id="slQ" placeholder="Buscar por título, pessoa ou ID" value="${attr(sl.f.q)}" aria-label="Buscar">
  <select class="control" id="slResp" aria-label="Responsável">${slOpts(sl.opc.responsaveis,sl.f.resp,'Todos os responsáveis',[['__eu','Minhas'],['__nenhum','Sem responsável']])}</select>
  <select class="control" id="slSeg" aria-label="Segmento">${slOpts(sl.opc.segmentos,sl.f.seg,'Todos os segmentos')}</select>
  <select class="control" id="slEtapa" aria-label="Status"><option value="">Todos os status</option>${SL_ETAPAS.map(([k,l])=>`<option value="${k}" ${sl.f.etapa===k?'selected':''}>${l}</option>`).join('')}</select>
  <select class="control" id="slPrazo" aria-label="Prazo">${[['','Qualquer prazo'],['atrasadas','Atrasadas'],['hoje','Vence hoje'],['semana','Próximos 7 dias'],['sem','Sem prazo']].map(([v,l])=>`<option value="${v}" ${sl.f.prazo===v?'selected':''}>${l}</option>`).join('')}</select>
  ${filtros?'<button type="button" class="softbtn" id="slLimpa">Limpar filtros</button>':''}
  <label class="check-row sl-canc"><input type="checkbox" id="slCanc" ${sl.verConcluidas?'checked':''}> Mostrar canceladas</label>
 </div>
 <p class="kpi-note" aria-live="polite">${rows.length} solicitação(ões)${filtros?' com os filtros atuais':''}${slGerente()?'':' · você só avança as que estão com você'}.</p>
 ${sl.vista==='kanban'?slKanban(rows):slLista(rows)}`;
 slLiga(box);
}
async function slMover(id,etapa,motivo=''){
 let mensagem='';const r0=sl.rows.find(x=>x.id===id);
 if(etapa==='EM_APROVACAO'&&r0&&r0.origem==='PORTAL_SOLICITANTE'){const m=prompt('Mensagem de entrega para o solicitante (opcional):','Material concluído. Confira e aprove a entrega.');if(m===null)return false;mensagem=m}
 try{await api('/solicitacoes/mover',slJson({id,etapa,motivo,mensagem}))}
 catch(e){
  if(/^Informe o motivo/.test(e.message)&&!motivo){const m=prompt(e.message+'\n\nDigite o motivo (ficará no histórico):');if(m&&m.trim().length>=3)return slMover(id,etapa,m.trim())}
  else toast(e.message,'warn');
  return false;
 }
 invalidate('solicitacoes');await slCarrega();slDesenha();toast(etapa==='CANCELADA'?'Solicitação cancelada':`Movida para ${SL_ROT[etapa]}`);return true;
}
function slLiga(box){
 const refaz=()=>slDesenha();
 box.querySelectorAll('[data-sl-kpi]').forEach(b=>b.onclick=()=>{const a=b.dataset.slKpi;if(a==='atrasadas')sl.f.prazo=sl.f.prazo==='atrasadas'?'':'atrasadas';else{const e=a.slice(6);sl.f.etapa=sl.f.etapa===e?'':e}refaz()});
 let t;$('#slQ',box).oninput=e=>{sl.f.q=e.target.value;clearTimeout(t);t=setTimeout(()=>{refaz();const i=$('#slQ');if(i){i.focus();i.setSelectionRange(i.value.length,i.value.length)}},180)};
 [['slResp','resp'],['slSeg','seg'],['slEtapa','etapa'],['slPrazo','prazo']].forEach(([id,k])=>$('#'+id,box).onchange=e=>{sl.f[k]=e.target.value;refaz()});
 $('#slCanc',box).onchange=e=>{sl.verConcluidas=e.target.checked;refaz()};
 $('#slLimpa',box)&&($('#slLimpa',box).onclick=()=>{sl.f={q:'',resp:'',seg:'',etapa:'',prazo:''};refaz()});
 box.querySelectorAll('[data-sl-abrir]').forEach(b=>b.onclick=ev=>{ev.stopPropagation();slAbrir(b.dataset.slAbrir)});
 box.querySelectorAll('[data-sl-mover]').forEach(b=>b.onclick=ev=>{ev.stopPropagation();slMover(b.dataset.slMover,b.dataset.para)});
 box.querySelectorAll('.sl-mover').forEach(s=>{s.onclick=ev=>ev.stopPropagation();s.onchange=()=>{if(s.value)slMover(s.dataset.id,s.value)}});
 box.querySelectorAll('[data-ord]').forEach(b=>b.onclick=()=>{if(sl.ord===b.dataset.ord)sl.dir*=-1;else{sl.ord=b.dataset.ord;sl.dir=1}refaz()});
 box.querySelectorAll('.sl-card').forEach(c=>{
  c.ondblclick=()=>slAbrir(c.dataset.id);
  c.onkeydown=e=>{if(e.key==='Enter'&&e.target===c)slAbrir(c.dataset.id)};
  c.ondragstart=e=>{e.dataTransfer.setData('text/plain',c.dataset.id);e.dataTransfer.effectAllowed='move';c.classList.add('arrastando')};
  c.ondragend=()=>c.classList.remove('arrastando');
 });
 box.querySelectorAll('.sl-col').forEach(col=>{
  col.ondragover=e=>{e.preventDefault();col.classList.add('alvo')};
  col.ondragleave=()=>col.classList.remove('alvo');
  col.ondrop=e=>{e.preventDefault();col.classList.remove('alvo');const id=e.dataTransfer.getData('text/plain'),r=sl.rows.find(x=>x.id===id);if(!r||r.etapa===col.dataset.etapa)return;
   if(!slDestinos(r).includes(col.dataset.etapa))return toast(slGerente()?'Movimento não permitido.':'Você só avança as solicitações que estão com você, para a etapa seguinte.','warn');
   slMover(id,col.dataset.etapa)};
 });
}
async function renderRequests(){
 state.module='solicitacoes';
 sl.vista=pref('slVista','kanban');
 $('#content').innerHTML=`<div class="sl-head"><div><small>SOLICITAÇÕES</small><h1>Solicitações</h1><p>Pedidos de todos os segmentos em um só lugar: cadastre, distribua, acompanhe o andamento e aprove só quando precisar.</p></div>
  <div class="sl-head-acoes"><div class="sl-vista" role="group" aria-label="Visualização"><button type="button" data-vista="kanban" aria-pressed="${sl.vista==='kanban'}">Kanban</button><button type="button" data-vista="lista" aria-pressed="${sl.vista==='lista'}">Lista</button></div><button class="btn" id="slNova">+ Nova solicitação</button></div></div>
  <div class="sl-mais"><button type="button" class="softbtn" id="slCsv">Exportar CSV do mês</button><button type="button" class="softbtn" id="slPdf">Relatório do mês (PDF)</button><button type="button" class="softbtn" id="slPortal">Abrir Portal do solicitante</button></div><div id="slRaiz"><div class="loading"><span></span><b>Carregando…</b></div></div>`;
 $('#slNova').onclick=()=>slNova();
 const mesEscolhido=()=>{const m=prompt('Mês do relatório (AAAA-MM):',pref('requestReportMonth',today().slice(0,7)));if(!m)return null;if(!/^\d{4}-\d{2}$/.test(m.trim())){toast('Use o formato AAAA-MM','warn');return null}setPref('requestReportMonth',m.trim());return m.trim()};
 $('#slCsv').onclick=()=>{const m=mesEscolhido();if(m)exportRequestMonthlyCSV(sl.rows,m)};
 $('#slPdf').onclick=()=>{const m=mesEscolhido();if(m)printRequestMonthlyReport(sl.rows,m)};
 $('#slPortal').onclick=()=>window.open('/solicitante.html','_blank','noopener');
 document.querySelectorAll('[data-vista]').forEach(b=>b.onclick=()=>{sl.vista=b.dataset.vista;setPref('slVista',sl.vista);document.querySelectorAll('[data-vista]').forEach(x=>x.setAttribute('aria-pressed',x===b));slDesenha()});
 try{await slCarrega()}catch(e){$('#slRaiz').innerHTML=`<div class="empty-rich"><strong>Não foi possível carregar</strong><p>${esc(e.message)}</p></div>`;return}
 slDesenha();
}

/* ---------- Cadastro rápido ---------- */
function slNova(){
 const o=adminOverlay(`<h3>Nova solicitação</h3>
  <form id="slForm" class="sl-form" novalidate>
   <label class="wide">Título *<input class="control" id="nTitulo" maxlength="140" required autocomplete="off"></label>
   <label class="wide">Descrição<textarea class="control" id="nDesc" rows="3" maxlength="2000"></textarea></label>
   <label>Solicitante<input class="control" id="nSolic" list="slSolicList" value="${attr(sl.eu.nome)}" autocomplete="off"><datalist id="slSolicList">${sl.opc.solicitantes.map(x=>`<option value="${attr(x)}"></option>`).join('')}</datalist></label>
   <label>Segmento<select class="control" id="nSeg">${slOpts(sl.opc.segmentos,'','Sem segmento')}</select></label>
   <label>Responsável<select class="control" id="nResp" ${slGerente()?'':'disabled'}>${slGerente()?slOpts(sl.opc.responsaveis,'','A distribuir'):`<option value="">A distribuir pela Gerente</option><option value="${attr(sl.eu.nome)}">${esc(sl.eu.nome)} (eu)</option>`}</select></label>
   <label>Prazo<input class="control" type="date" id="nPrazo"></label>
   <label>Prioridade<select class="control" id="nPrio">${(sl.opc.prioridades||[]).map(p=>`<option ${p==='MÉDIA'?'selected':''}>${p}</option>`).join('')}</select></label>
   <label class="wide">Anexos (opcional)<input class="control" type="file" id="nArq" multiple></label>
   <label class="check-row wide"><input type="checkbox" id="nAprov"> Precisa de aprovação antes de concluir</label>
   <div class="sl-erro" id="nErro" role="alert"></div>
   <div class="actions wide"><button type="button" class="btn soft" data-close>Cancelar</button><button type="submit" class="btn" id="nSalvar">Cadastrar</button></div>
  </form>`);
 if(!slGerente())$('#nResp',o.el).value='';
 $('#nTitulo',o.el).focus();
 $('#slForm',o.el).onsubmit=async ev=>{
  ev.preventDefault();const err=$('#nErro',o.el);err.textContent='';
  const titulo=$('#nTitulo',o.el).value.trim();if(titulo.length<3){err.textContent='Informe o título (mínimo 3 letras).';return}
  const btn=$('#nSalvar',o.el);btn.disabled=true;
  try{
   const r=await api('/solicitacoes/nova',slJson({titulo,descricao:$('#nDesc',o.el).value,solicitante:$('#nSolic',o.el).value,segmento:$('#nSeg',o.el).value,responsavel:$('#nResp',o.el).value,prazo:$('#nPrazo',o.el).value,prioridade:$('#nPrio',o.el).value,exigeAprovacao:$('#nAprov',o.el).checked?'1':'0'}));
   const arq=$('#nArq',o.el).files;let aviso='';
   if(arq.length){const fd=new FormData();[...arq].forEach(f=>fd.append('files',f));try{await api('/solicitacoes/anexo?id='+encodeURIComponent(r.id),{method:'POST',body:fd})}catch(e){aviso=' (anexos não enviados: '+e.message+')'}}
   o.close();invalidate('solicitacoes');await slCarrega();slDesenha();toast('Solicitação '+r.id+' cadastrada'+aviso,aviso?'warn':'ok');
  }catch(e){err.textContent=e.message;btn.disabled=false}
 };
}

/* ---------- Detalhe: dados, comentários, anexos e histórico dentro da solicitação ---------- */
async function slAbrir(id){
 const r=sl.rows.find(x=>x.id===id);if(!r)return;
 const pode=(slGerente()||slDono(r))&&r.etapa!=='CONCLUIDO';
 let com=[],hist=[];
 try{[com,hist]=await Promise.all([api(`/comments?module=solicitacoes&id=${encodeURIComponent(id)}`).then(x=>x.rows||[]),api(`/timeline?module=solicitacoes&id=${encodeURIComponent(id)}`).then(x=>x.rows||[])])}catch(e){toast(e.message,'warn')}
 const arqs=[...String(r.anexos||'').split('|').map(s=>({p:s.trim(),t:'Anexo'})),...String(r.arquivosEntrega||'').split('|').map(s=>({p:s.trim(),t:'Entrega'}))].filter(x=>x.p);
 const link=p=>`${API}/file?path=${encodeURIComponent(p)}`;
 const dest=slDestinos(r);
 const campo=(id2,label,html,wide)=>`<label class="${wide?'wide':''}">${label}${html}</label>`;
 const o=adminOverlay(`<div class="sl-det">
  <h3>${esc(r.titulo)} <small>${esc(r.id)}</small></h3>
  <div class="sl-chips"><span class="sl-etapa e-${r.etapa}">${esc(SL_ROT[r.etapa])}</span>${slChips(r)}${r.origem==='PORTAL_SOLICITANTE'?'<span class="sl-chip">Veio do Portal</span>':''}</div>
  <div class="sl-acoes-det">
   ${dest.length?`<label>Mover para <select class="control" id="dMover"><option value="">Escolher…</option>${dest.map(e=>`<option value="${e}">${esc(SL_ROT[e])}</option>`).join('')}</select></label>`:''}
   ${(slGerente()||slDono(r))&&r.origem==='PORTAL_SOLICITANTE'&&['PENDENTE','EM_ANDAMENTO'].includes(r.etapa)&&!r.aguardandoSolicitante?'<button type="button" class="softbtn" id="dPedirInfo">Pedir informação ao solicitante</button>':''}
   ${(slGerente()||slDono(r))&&r.etapa!=='CONCLUIDO'?'<button type="button" class="softbtn" id="dEntrega">Anexar entrega final</button>':''}
   ${slGerente()&&r.etapa!=='CONCLUIDO'?'<button type="button" class="softbtn" id="dCancelar">Cancelar solicitação</button>':''}
  </div>
  <form id="dForm" class="sl-form" novalidate>
   ${campo('','Título',`<input class="control" id="dTitulo" value="${attr(r.titulo)}" maxlength="140" ${pode?'':'disabled'}>`,true)}
   ${campo('','Descrição',`<textarea class="control" id="dDesc" rows="3" maxlength="2000" ${pode?'':'disabled'}>${esc(r.descricao||'')}</textarea>`,true)}
   ${campo('','Solicitante',`<input class="control" id="dSolic" value="${attr(r.solicitante||'')}" ${pode?'':'disabled'}>`)}
   ${campo('','Segmento',`<select class="control" id="dSeg" ${pode?'':'disabled'}>${slOpts(sl.opc.segmentos.includes(r.segmento)||!r.segmento?sl.opc.segmentos:[...sl.opc.segmentos,r.segmento],r.segmento||'','Sem segmento')}</select>`)}
   ${campo('','Responsável',`<select class="control" id="dResp" ${slGerente()&&r.etapa!=='CONCLUIDO'?'':'disabled'}>${slOpts(sl.opc.responsaveis,r.responsavel||'','A distribuir')}</select>`)}
   ${campo('','Prazo',`<input class="control" type="date" id="dPrazo" value="${attr(r.prazoEfetivo||'')}" ${pode?'':'disabled'}>`)}
   ${campo('','Prioridade',`<select class="control" id="dPrio" ${pode?'':'disabled'}>${(sl.opc.prioridades||[]).map(p=>`<option ${p===r.prioridade?'selected':''}>${p}</option>`).join('')}</select>`)}
   ${slGerente()?`<label class="check-row"><input type="checkbox" id="dAprov" ${r.exigeAprovacao==='1'?'checked':''} ${r.etapa==='CONCLUIDO'?'disabled':''}> Precisa de aprovação</label>`:''}
   <div class="sl-erro" id="dErro" role="alert"></div>
   ${pode?'<div class="actions wide"><button type="submit" class="btn" id="dSalvar">Salvar alterações</button></div>':'<p class="kpi-note wide">Somente a Gerente ou o responsável altera os dados; solicitações concluídas ficam como estão até serem reabertas.</p>'}
  </form>
  <section><h4>Comentários</h4><div id="dCom">${com.map(c=>`<div class="tb-comment"><small><b>${esc(c.autor)}</b>${c.autor_tipo==='portal'?' (solicitante)':''} · ${esc(String(c.quando||'').replace('T',' ').slice(0,16))}${c.interno?' · só equipe':' · visível ao solicitante'}</small>${esc(c.texto)}</div>`).join('')||'<small>Sem comentários.</small>'}</div>
   <div class="tb-add"><textarea class="control" id="dComNovo" rows="2" maxlength="2000" placeholder="Escreva um comentário" aria-label="Novo comentário"></textarea>
   ${r.origem==='PORTAL_SOLICITANTE'?'<label class="check-row"><input type="checkbox" id="dComPub"> Visível ao solicitante</label>':''}<button type="button" class="softbtn" id="dComAdd">Comentar</button></div></section>
  <section><h4>Anexos</h4><div id="dArqs">${arqs.map(a=>`<div class="tb-item"><a href="${attr(link(a.p))}" target="_blank" rel="noopener">${esc(a.p.split('/').pop())}</a> <small>${a.t}</small></div>`).join('')||'<small>Nenhum anexo.</small>'}</div>
   ${slGerente()||slDono(r)||r.criadoPor===sl.eu.codigo?'<div class="tb-add"><input class="control" type="file" id="dArq" multiple aria-label="Adicionar anexos"><button type="button" class="softbtn" id="dArqAdd">Anexar</button></div>':''}</section>
  <section><h4>Histórico</h4><div class="demand-timeline">${hist.map(h=>`<div><i></i><span><small>${esc(String(h.quando||'').replace('T',' ').slice(0,16))} · ${esc(h.ator||'')}</small><b>${esc(h.texto||h.tipo||'')}</b>${h.motivo?`<em>${esc(h.motivo)}</em>`:''}</span></div>`).join('')||'<small>Sem histórico.</small>'}</div></section>
  <div class="actions"><button type="button" class="btn soft" data-close>Fechar</button></div></div>`);
 const reabre=async()=>{o.close();invalidate('solicitacoes');await slCarrega();slDesenha();slAbrir(id)};
 const err=$('#dErro',o.el);
 $('#dMover',o.el)&&($('#dMover',o.el).onchange=async e=>{if(!e.target.value)return;if(await slMover(id,e.target.value))reabre();else e.target.value=''});
 $('#dPedirInfo',o.el)&&($('#dPedirInfo',o.el).onclick=async()=>{const m=prompt('O que você precisa saber do solicitante?');if(!m||m.trim().length<3)return;try{await api('/solicitacoes/pedir-info',slJson({id,mensagem:m.trim()}));toast('Pedido enviado ao solicitante');await reabre()}catch(e){toast(e.message,'warn')}});
 $('#dEntrega',o.el)&&($('#dEntrega',o.el).onclick=()=>openFinalDeliveryUpload(id));
 $('#dCancelar',o.el)&&($('#dCancelar',o.el).onclick=async()=>{const m=prompt('Motivo do cancelamento (ficará no histórico):');if(!m||m.trim().length<3)return;if(await slMover(id,'CANCELADA',m.trim()))o.close()});
 $('#dForm',o.el).onsubmit=async ev=>{
  ev.preventDefault();err.textContent='';if(!pode)return;const btn=$('#dSalvar',o.el);btn.disabled=true;
  try{
   const campos={id,titulo:$('#dTitulo',o.el).value,descricao:$('#dDesc',o.el).value,solicitante:$('#dSolic',o.el).value,segmento:$('#dSeg',o.el).value,prazo:$('#dPrazo',o.el).value,prioridade:$('#dPrio',o.el).value};
   if(slGerente())campos.exigeAprovacao=$('#dAprov',o.el).checked?'1':'0';
   if($('#dPrazo',o.el).value===(r.prazoEfetivo||''))delete campos.prazo; // não troca o prazo negociado sem querer
   await api('/solicitacoes/editar',slJson(campos));
   const novoResp=$('#dResp',o.el).value;
   if(slGerente()&&novoResp&&novoResp!==(r.responsavel||''))await api('/solicitacoes/distribuir',slJson({id,responsavel:novoResp}));
   toast('Alterações salvas');o.close();invalidate('solicitacoes');await slCarrega();slDesenha();
  }catch(e){err.textContent=e.message;btn.disabled=false}
 };
 $('#dComAdd',o.el).onclick=async()=>{const t=$('#dComNovo',o.el).value;if(!t.trim())return toast('Escreva o comentário','warn');try{await api('/comments',slJson({module:'solicitacoes',id,texto:t,interno:!($('#dComPub',o.el)?.checked)}));await reabre()}catch(e){toast(e.message,'warn')}};
 $('#dArqAdd',o.el)&&($('#dArqAdd',o.el).onclick=async()=>{const f=$('#dArq',o.el).files;if(!f.length)return toast('Escolha ao menos um arquivo','warn');const fd=new FormData();[...f].forEach(x=>fd.append('files',x));try{await api('/solicitacoes/anexo?id='+encodeURIComponent(id),{method:'POST',body:fd});toast('Anexo enviado');await reabre()}catch(e){toast(e.message,'warn')}});
}
