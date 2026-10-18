// Gerenciador de Anúncios: campanhas > conjuntos > anúncios da conta inteira, com métricas e edição de tudo (só Gerência).
let gmOrdem={k:'status',d:1};
let gmVisao='hierarquia',gmFoco={campanha:'',conjunto:''},gmSel=new Set(),gmFiltro={estado:'',busca:''};
let gmDados=null,gmAberto=new Set(),gmPeriodo={de:'',ate:'',p:'7'},gmArq=false,gmEdit=null;
const gmPost=(u,b)=>api(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b||{})});
const gmBrl=(v,m)=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:m||(gmDados&&gmDados.moeda)||'BRL'});
const gmN=v=>Number(v||0).toLocaleString('pt-BR',{maximumFractionDigits:0});
const GM_OBJ={OUTCOME_AWARENESS:'Reconhecimento',OUTCOME_TRAFFIC:'Tráfego',OUTCOME_ENGAGEMENT:'Engajamento',OUTCOME_LEADS:'Cadastros (leads)',OUTCOME_SALES:'Vendas',OUTCOME_APP_PROMOTION:'Promoção do app'};
const GM_ESTADO={ACTIVE:['Ativo','ok'],PAUSED:['Pausado',''],PENDING_REVIEW:['Em análise','warn'],IN_PROCESS:['Em processamento','warn'],DISAPPROVED:['Reprovado','bad'],WITH_ISSUES:['Com problema','bad'],CAMPAIGN_PAUSED:['Campanha pausada',''],ADSET_PAUSED:['Conjunto pausado',''],ARCHIVED:['Arquivado',''],PENDING_BILLING_INFO:['Pagamento pendente','bad']};

function gmIntervalo(p){const h=new Date();h.setHours(12,0,0,0);const f=d=>new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);if(p==='hoje')return [f(h),f(h)];if(p==='mes')return [f(new Date(h.getFullYear(),h.getMonth(),1,12)),f(h)];const n=Number(p)||7,i=new Date(h);i.setDate(h.getDate()-(n-1));return [f(i),f(h)]}

async function renderGerenciador(){
  if(false)return go('minhaarea');
  await adsCarregaModo();
  if(!gmPeriodo.de){[gmPeriodo.de,gmPeriodo.ate]=gmIntervalo(gmPeriodo.p)}
  $('#content').innerHTML='<div class="loading"><span></span><b>Lendo a conta na Meta…</b></div>';
  try{gmDados=await api(`/ads/arvore?de=${gmPeriodo.de}&ate=${gmPeriodo.ate}${gmArq?'&arquivados=1':''}`)}
  catch(e){if(state.page!=='gerenciador')return;$('#content').innerHTML=`<div class="dashboard-head"><div><small>GERENCIADOR DE ANÚNCIOS</small><h1>Não foi possível ler a conta</h1><p>${esc(e.message)}</p></div></div>`;return}
  if(state.page!=='gerenciador')return;
  desenharGerenciador();
}

const GM_PESO={ACTIVE:0,PENDING_REVIEW:1,IN_PROCESS:1,WITH_ISSUES:2,DISAPPROVED:2,PAUSED:3,CAMPAIGN_PAUSED:3,ADSET_PAUSED:3,ARCHIVED:5};
const gmPeso=st=>{const k=String(st||'').toUpperCase();return k in GM_PESO?GM_PESO[k]:4};
const gmInicioDe=x=>String(x.inicio||x.criado||'').slice(0,10);
const gmInicioTxt=x=>{const d=gmInicioDe(x);return /^\d{4}-\d\d-\d\d$/.test(d)?fmtDate(d):'—'};
function gmChave(x,k){return k==='status'?gmPeso(x.estado||x.status):k==='inicio'?(gmInicioDe(x)||'9999'):k==='gasto'?x.gasto:k==='conversas'?x.conversas:k==='custo'?(x.custoConversa===null||x.custoConversa===undefined?Infinity:x.custoConversa):k==='resultados'?x.resultados:k==='ctr'?x.ctr:String(x.nome||'').toLowerCase()}
function gmOrdena(l){const o=gmOrdem;return [...l].sort((a,b)=>{const x=gmChave(a,o.k),y=gmChave(b,o.k);const c=x<y?-1:x>y?1:0;return c?c*o.d:(b.gasto-a.gasto)})}
function gmThOrd(k,l){return `<th scope="col" aria-sort="${gmOrdem.k===k?(gmOrdem.d>0?'ascending':'descending'):'none'}"><button type="button" class="tf-ord" data-gord="${k}">${l}${gmOrdem.k===k?(gmOrdem.d>0?' ▲':' ▼'):''}</button></th>`}
function gmBadge(est){const [l,c]=GM_ESTADO[est]||[est||'—',''];return `<span class="badge ${c}">${esc(l)}</span>`}
function gmOrc(o){if(!o)return '—';if(o.diario)return `${esc(gmBrl(o.diario))}<small>/dia</small>`;if(o.total)return `${esc(gmBrl(o.total))}<small> total</small>`;return '<small>da campanha</small>'}
function gmLinha(x,nivel,pai=''){
  const aberto=gmAberto.has(x.id),filhos=gmOrdena(nivel==='campanha'?x.conjuntos:nivel==='conjunto'?x.anuncios:[]);
  const ligado=x.status==='ACTIVE';
  return `<tr class="gm-${nivel}" data-id="${attr(x.id)}" data-nivel="${nivel}">
   <td class="gm-nome"><span class="gm-ind gm-i${nivel==='campanha'?0:nivel==='conjunto'?1:2}">${filhos.length?`<button class="gm-seta" data-abre="${attr(x.id)}" aria-label="${aberto?'Recolher':'Expandir'}">${aberto?'▾':'▸'}</button>`:'<span class="gm-seta"></span>'}${x.foto?`<img class="gm-foto" alt="" referrerpolicy="no-referrer" src="${attr(x.foto)}">`:''}<span><b>${esc(x.nome)}</b>${nivel==='campanha'?`<small>${esc(GM_OBJ[x.objetivo]||x.objetivo||'')}</small>`:nivel==='conjunto'?`<small>${esc(x.otimizacao||'')}${x.destino?' · '+esc(x.destino):''}</small>`:''}</span></span></td>
   <td>${adsCompleto?`<label class="gm-sw" title="${ligado?'Pausar':'Ativar'}"><input type="checkbox" data-sw="${attr(x.id)}" ${ligado?'checked':''} ${x.status==='ARCHIVED'||x.status==='DELETED'?'disabled':''}><i></i></label>`:`<span class="badge ${ligado?'ok':''}">${ligado?'Ligado':'Desligado'}</span>`}</td>
   <td>${gmBadge(x.estado)}</td><td>${esc(gmInicioTxt(x))}</td><td>${nivel==='anuncio'?'—':gmOrc(x.orcamento)}</td>
   <td>${gmN(x.conversas)}</td><td>${gmN(x.resultados)}<small>${esc(x.rotuloResultado||'')}</small></td><td>${x.custoResultado===null?'—':esc(gmBrl(x.custoResultado))}</td><td>${esc(gmBrl(x.gasto))}</td><td>${gmN(x.impressoes)}</td><td>${gmN(x.alcance)}</td><td>${x.ctr.toFixed(2).replace('.',',')}%</td><td>${x.cliques?esc(gmBrl(x.cpc)):'—'}</td>
   <td class="gm-acoes">${nivel==='anuncio'?`<label class="check-row" title="Selecionar para comparar"><input type="checkbox" data-gsel="${attr(x.id)}" ${gmSel.has(x.id)?'checked':''}></label>`:''}<button class="softbtn" data-det="${attr(x.id)}">Detalhes</button>${adsCompleto?`<button class="softbtn" data-edit="${attr(x.id)}">Editar</button><button class="softbtn" data-dup="${attr(x.id)}" title="Duplicar (a cópia nasce pausada)">⧉</button>`:''}</td></tr>${aberto?filhos.map(f=>gmLinha(f,nivel==='campanha'?'conjunto':'anuncio',x.id)).join(''):''}`;
}
function gmAchar(id){for(const c of gmDados.campanhas){if(c.id===id)return [c,'campanha'];for(const s of c.conjuntos){if(s.id===id)return [s,'conjunto'];for(const a of s.anuncios)if(a.id===id)return [a,'anuncio']}}return [null,'']}

function desenharGerenciador(){
  const d=gmDados;
  $('#content').innerHTML=`<div class="dashboard-head"><div><small>GERENCIADOR DE ANÚNCIOS · META</small><h1>Campanhas da conta</h1><p>${adsCompleto?'Tudo o que está na conta de anúncios, não só o que o sistema lançou. Mudanças valem na Meta na hora. Duplicar cria a cópia <b>pausada</b>.':'Somente leitura: campanhas, conjuntos e anúncios da conta com as métricas do período. Para criar ou alterar anúncios, use o Gerenciador de Anúncios da Meta.'}</p></div><div class="st-head-btns"><button class="softbtn" id="gmComp">Comparar anúncios</button>${adsCompleto?'<button class="softbtn" id="gmHist">Histórico de alterações</button><button class="btn" id="gmNova">+ Nova campanha</button>':''}</div></div>
  <div class="st-toolbar"><div class="st-filtros"><select id="gmP"><option value="hoje">Hoje</option><option value="7">Últimos 7 dias</option><option value="30">Últimos 30 dias</option><option value="mes">Este mês</option><option value="x">Personalizado</option></select><input type="date" id="gmDe" value="${attr(d.de)}"><input type="date" id="gmAte" value="${attr(d.ate)}"><label class="check-row"><input type="checkbox" id="gmArq" ${gmArq?'checked':''}> Mostrar arquivados</label></div><button class="softbtn" id="gmAtualiza">Atualizar</button></div>
  ${gmOrcamentoHtml(d)}${gmAbasHtml()}
  ${gmVisao==='hierarquia'?'':gmFlatHtml()}
  <div class="card" ${gmVisao==='hierarquia'?'':'style="display:none"'}><div class="tablewrap gm-wrap"><table class="datatable gm-tab"><thead><tr><th>${'Nome'}</th><th>Ligado</th>${gmThOrd('status','Estado')}${gmThOrd('inicio','Início')}<th>Orçamento</th>${gmThOrd('conversas','Conversas iniciadas')}<th>Resultados</th><th>Custo/resultado</th><th>Gasto</th><th>Impressões</th><th>Alcance</th><th>CTR</th><th>CPC</th><th></th></tr></thead>
  <tbody>${gmOrdena(d.campanhas).map(c=>gmLinha(c,'campanha')).join('')||'<tr><td colspan="14" class="empty compact">Nenhuma campanha neste filtro.</td></tr>'}</tbody>
  <tfoot><tr class="tot"><td colspan="8">Total do período (${esc(fmtDate(d.de))} a ${esc(fmtDate(d.ate))})</td><td>${esc(gmBrl(d.totais.gasto))}</td><td>${gmN(d.totais.impressoes)}</td><td>${gmN(d.totais.alcance)}</td><td>${d.totais.ctr.toFixed(2).replace('.',',')}%</td><td>${d.totais.cliques?esc(gmBrl(d.totais.cpc)):'—'}</td><td></td></tr></tfoot></table></div></div>`;
  const sel=$('#gmP');sel.value=['hoje','7','30','mes'].includes(gmPeriodo.p)?gmPeriodo.p:'x';
  sel.onchange=()=>{gmPeriodo.p=sel.value;if(sel.value!=='x'){[gmPeriodo.de,gmPeriodo.ate]=gmIntervalo(sel.value);renderGerenciador()}};
  $('#gmDe').onchange=$('#gmAte').onchange=()=>{gmPeriodo={de:$('#gmDe').value,ate:$('#gmAte').value,p:'x'}};
  $('#gmAtualiza').onclick=()=>{gmPeriodo.de=$('#gmDe').value;gmPeriodo.ate=$('#gmAte').value;renderGerenciador()};
  $('#gmArq').onchange=e=>{gmArq=e.target.checked;renderGerenciador()};
  $('#gmComp').onclick=gmComparar;if($('#gmHist'))$('#gmHist').onclick=gmHistorico;if($('#gmNova'))$('#gmNova').onclick=()=>{if(typeof novaCampanha==='function')novaCampanha();else toast('A criação completa de campanha chega na próxima etapa.','warn')};
  if(gmVisao!=='hierarquia'){const h=document.querySelector('#content .card[style*="display:none"]');if(h)h.remove()} // a árvore só existe na visão Hierarquia
  gmLiga();
  $$('[data-abre]').forEach(b=>b.onclick=()=>{const id=b.dataset.abre;gmAberto.has(id)?gmAberto.delete(id):gmAberto.add(id);desenharGerenciador()});
  $$('[data-sw]').forEach(i=>i.onchange=async()=>{const [o,n]=gmAchar(i.dataset.sw);const ativar=i.checked;if(!confirm(ativar?`Ativar "${o.nome}"? Volta a gastar.`:`Pausar "${o.nome}"?`)){i.checked=!ativar;return}await gmEditar(n,o.id,{status:ativar?'ACTIVE':'PAUSED'})});
  $$('[data-edit]').forEach(b=>b.onclick=()=>{const [o,n]=gmAchar(b.dataset.edit);gmEditor(o,n)});
  $$('[data-dup]').forEach(b=>b.onclick=async()=>{const [o,n]=gmAchar(b.dataset.dup);if(!confirm(`Duplicar "${o.nome}"? A cópia nasce pausada.`))return;try{await gmPost('/ads/duplicar',{nivel:n,id:o.id});toast('Cópia criada (pausada)');renderGerenciador()}catch(e){toast(e.message,'bad')}});
}
async function gmEditar(nivel,id,campos,confirmou=false){try{await gmPost('/ads/editar',{nivel,id,campos,confirmou});toast('Alterado na Meta');await renderGerenciador();return true}catch(e){toast(e.message,'bad');await renderGerenciador();return false}}

function gmEditor(o,nivel){
  const isoLocal=s=>{if(!s)return '';const d=new Date(s);if(isNaN(d))return '';return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)};
  const p=o.publico||{},cid=(p.cidades||[])[0];
  const ov=adminOverlay(`<h3>Editar ${nivel==='campanha'?'campanha':nivel==='conjunto'?'conjunto de anúncios':'anúncio'}</h3><div class="st-form">
   <label>Nome<input id="geNome" maxlength="400" value="${attr(o.nome)}"></label>
   ${nivel!=='anuncio'?`<div class="st-row"><label>Orçamento diário (R$)<input id="geDia" type="number" step="5" min="6" value="${o.orcamento&&o.orcamento.diario||''}" ${o.orcamento&&o.orcamento.diario?'':'placeholder="(sem orçamento diário)"'}></label><label>Orçamento total (R$)<input id="geTot" type="number" step="50" min="6" value="${o.orcamento&&o.orcamento.total||''}" ${o.orcamento&&o.orcamento.total?'':'placeholder="(sem orçamento total)"'}></label></div>
   <div class="st-row"><label>Início<input id="geIni" type="datetime-local" value="${attr(isoLocal(o.inicio))}"></label><label>Término<input id="geFim" type="datetime-local" value="${attr(isoLocal(o.fim))}"></label></div>`:''}
   ${nivel==='conjunto'?`<div class="st-row"><label>Idade mínima<input id="geIdMin" type="number" min="18" max="65" value="${p.idadeMin??''}"></label><label>Idade máxima<input id="geIdMax" type="number" min="18" max="65" value="${p.idadeMax??''}"></label></div>${cid?`<label>Raio em torno de ${esc(cid.nome||'cidade')} (km)<input id="geRaio" type="number" min="1" max="80" value="${cid.raioKm||''}"></label>`:'<p class="kpi-note">Este conjunto não tem cidade; o raio não se aplica.</p>'}`:''}
   ${nivel==='conjunto'?'<div id="geAv"></div>':''}
   ${nivel==='anuncio'?`<fieldset class="cri-fs"><legend>Criativo</legend>${(o.criativo&&o.criativo.formato==='Imagem')?'':'<p class="kpi-note">Este anúncio usa uma publicação do Instagram ou um vídeo: o texto vem da própria publicação, então só o nome e o estado se alteram aqui.</p>'}<label>Texto<textarea id="geTexto" rows="3" maxlength="2000">${esc((o.criativo&&o.criativo.texto)||'')}</textarea></label><div class="st-row"><label>Título<input id="geTit" maxlength="255" value="${attr((o.criativo&&o.criativo.titulo)||'')}"></label><label>Descrição<input id="geDesc" maxlength="255" value="${attr((o.criativo&&o.criativo.descricao)||'')}"></label></div><div class="st-row"><label>Link (https)<input id="geLink" type="url" value="${attr((o.criativo&&o.criativo.url)||'')}"></label><label>Botão<select id="geCta"><option value="">(manter)</option>${['LEARN_MORE','SIGN_UP','CONTACT_US','APPLY_NOW','GET_QUOTE','SHOP_NOW','MESSAGE_PAGE','INSTAGRAM_MESSAGE','WHATSAPP_MESSAGE','NO_BUTTON'].map(x=>`<option ${((o.criativo&&o.criativo.cta)||'')===x?'selected':''}>${x}</option>`).join('')}</select></label></div><p class="kpi-note">A Meta não edita o criativo: o sistema cria um criativo novo com as mudanças e troca no anúncio.</p></fieldset>`:''}
   <p class="kpi-note">Só são enviados os campos que você mudar. Respeita os tetos do Gestor de anúncios.</p>
   <div class="st-acoes"><button class="btn soft" type="button" data-close>Cancelar</button><button class="btn" type="button" id="geSalva">Salvar na Meta</button><button class="softbtn" type="button" id="geArq">Arquivar</button><button class="softbtn ga-perigo" type="button" id="geDel">Excluir</button></div></div>`);
  const g=id=>ov.el.querySelector('#'+id);
  if(nivel==='conjunto'&&typeof tpEditorAvancado==='function')tpEditorAvancado(ov,o);
  g('geSalva').onclick=async()=>{
    const c={},v=(id)=>g(id)&&g(id).value.trim();
    if(v('geNome')!==o.nome)c.nome=v('geNome');
    if(nivel!=='anuncio'){
      if(v('geDia')&&Number(v('geDia'))!==(o.orcamento&&o.orcamento.diario))c.orcamentoDia=Number(v('geDia'));
      if(v('geTot')&&Number(v('geTot'))!==(o.orcamento&&o.orcamento.total))c.orcamentoTotal=Number(v('geTot'));
      if(v('geIni')&&v('geIni')!==isoLocal(o.inicio))c.inicio=v('geIni');
      if(v('geFim')&&v('geFim')!==isoLocal(o.fim))c.fim=v('geFim');
    }
    if(nivel==='conjunto'){
      if(v('geIdMin')&&Number(v('geIdMin'))!==p.idadeMin)c.idadeMin=Number(v('geIdMin'));
      if(v('geIdMax')&&Number(v('geIdMax'))!==p.idadeMax)c.idadeMax=Number(v('geIdMax'));
      if(g('geRaio')&&v('geRaio')&&Number(v('geRaio'))!==(cid&&cid.raioKm))c.raioKm=Number(v('geRaio'));
      if(ov.avancado)Object.assign(c,ov.avancado());
    }
    if(nivel==='anuncio'&&g('geTexto')){const cr=o.criativo||{},n={};
      if(v('geTexto')!==(cr.texto||''))n.texto=v('geTexto');if(v('geTit')!==(cr.titulo||''))n.titulo=v('geTit');if(v('geDesc')!==(cr.descricao||''))n.descricao=v('geDesc');if(v('geLink')&&v('geLink')!==(cr.url||''))n.link=v('geLink');if(v('geCta')&&v('geCta')!==(cr.cta||''))n.cta=v('geCta');
      if(Object.keys(n).length)c.criativo=n}
    if(!Object.keys(c).length)return toast('Nada mudou','warn');
    if(await gmEditar(nivel,o.id,c))ov.close();
  };
  g('geArq').onclick=async()=>{if(!confirm(`Arquivar "${o.nome}"? Sai da lista e para de gastar.`))return;if(await gmEditar(nivel,o.id,{status:'ARCHIVED'}))ov.close()};
  g('geDel').onclick=async()=>{if(!confirm(`EXCLUIR "${o.nome}"? Não dá para desfazer.`))return;if(await gmEditar(nivel,o.id,{status:'DELETED'},true))ov.close()};
}

async function gmHistorico(){
  let r;try{r=await api('/ads/acoes')}catch(e){return toast(e.message,'bad')}
  adminOverlay(`<h3>Histórico de alterações</h3><div class="tablewrap"><table class="datatable"><thead><tr><th>Quando</th><th>Quem</th><th>O quê</th><th>Antes</th><th>Depois</th><th></th></tr></thead><tbody>${r.rows.map(x=>`<tr><td>${esc(fmtDateTime(x.quando))}</td><td>${esc(x.quem)}</td><td>${esc(x.nivel)}: ${esc(x.nome)}<br><small>${esc(x.acao)}</small></td><td><small>${esc(x.antes)}</small></td><td><small>${esc(x.depois)}</small></td><td>${x.resultado==='ERRO'?`<span class="badge bad" title="${attr(x.erro)}">Erro</span>`:'<span class="badge ok">OK</span>'}</td></tr>`).join('')||'<tr><td colspan="6">Nada ainda.</td></tr>'}</tbody></table></div><div class="actions"><button class="btn soft" data-close>Fechar</button></div>`);
}

// ---------- Nova campanha (assistente com todos os objetivos da Meta) ----------
async function novaCampanha(){
  let op,cfg;try{[op,cfg]=await Promise.all([api('/ads/campanha/opcoes'),api('/ads/gestao')])}catch(e){return toast(e.message,'bad')}
  if(!cfg.config.ativa)return toast('Ligue a gestão de anúncios em Tráfego → Gestor de anúncios antes de criar campanhas.','warn');
  const chave=Array.from(crypto.getRandomValues(new Uint8Array(12)),b=>b.toString(16).padStart(2,'0')).join('');
  let rascs=[];try{rascs=(await api('/ads/extras')).rascunhos||[]}catch{}
  let rascId='';
  const pub=cfg.config.publico;
  const w={passo:1,objetivo:'',meta:'',nome:'',publico:{cidade:pub.cidade,raioKm:pub.raioKm,idadeMin:pub.idadeMin,idadeMax:pub.idadeMax,genero:'todos',interesses:[],publicosPersonalizados:[],plataformas:[]},modo:'AUTO',
    orc:{tipo:'DIARIO',valor:20},dias:7,inicio:'',fim:'',lance:{tipo:'MENOR_CUSTO',valor:''},criativo:{tipo:'',midia:'',conteudoId:'',texto:'',titulo:'',descricao:'',cta:''},destino:{mensagem:'DIRECT',whatsapp:cfg.config.whatsapp||'',siteUrl:'',formId:'',pixelId:'',evento:'',appId:'',lojaUrl:''}};
  const ov=adminOverlay('<div id="wz" class="st-form"></div>');ov.el.querySelector('.admin-box').classList.add('st-box');
  const host=ov.el.querySelector('#wz');
  const meta=()=>op.objetivos[w.objetivo]&&op.objetivos[w.objetivo].metas[w.meta];
  const spec=()=>({chave,objetivo:w.objetivo,meta:w.meta,nome:w.nome,publico:{...w.publico,plataformas:w.modo==='MANUAL'?w.publico.plataformas:[]},orcamento:{tipo:w.orc.tipo,valor:Number(w.orc.valor)},inicio:w.inicio||undefined,fim:w.fim||undefined,dias:w.fim?undefined:Number(w.dias),lance:w.lance.tipo==='LIMITE_CUSTO'?{tipo:'LIMITE_CUSTO',valor:Number(w.lance.valor)}:undefined,criativo:w.criativo,destino:w.destino});
  const setPath=(path,val)=>{const k=path.split('.');let o=w;k.slice(0,-1).forEach(x=>o=o[x]);o[k[k.length-1]]=val};
  const PASSOS=['Objetivo','Público','Orçamento e datas','Anúncio','Revisão'];
  const cab=()=>`<h3>Nova campanha</h3><ol class="wz-passos">${PASSOS.map((p,i)=>`<li class="${i+1===w.passo?'ativo':i+1<w.passo?'feito':''}">${i+1}. ${p}</li>`).join('')}</ol>`;
  const nav=(prox='Avançar')=>`<div class="st-acoes"><button class="btn soft" type="button" data-close>Cancelar</button><button class="softbtn" type="button" id="wzRasc" title="Guardar para continuar depois">Salvar rascunho</button>${w.passo>1?'<button class="softbtn" type="button" id="wzVolta">Voltar</button>':''}<button class="btn" type="button" id="wzProx">${prox}</button></div>`;
  const inp=(l,path,tipo='text',extra='')=>{const v=path.split('.').reduce((o,k)=>o[k],w);return `<label>${l}<input data-w="${path}" type="${tipo}" value="${attr(v??'')}" ${extra}></label>`};
  const passo1=()=>`${cab()}${rascs.length?`<div class="card"><b>Rascunhos salvos</b>${rascs.map(r=>`<div class="notif"><span>${esc(r.nome)} <small>${esc(fmtDateTime(r.salvoEm))}</small></span> <button class="softbtn" type="button" data-rabre="${attr(r.id)}">Continuar</button> <button class="softbtn" type="button" data-rdel="${attr(r.id)}">Excluir</button></div>`).join('')}</div>`:''}<p class="kpi-note">Escolha o objetivo, como no Gerenciador da Meta.</p><div class="wz-objs">${Object.entries(op.objetivos).map(([k,o])=>`<button type="button" class="wz-obj ${w.objetivo===k?'sel':''}" data-obj="${k}"><b>${esc(o.rotulo)}</b><small>${esc(o.ajuda)}</small></button>`).join('')}</div>
   ${w.objetivo?`<h4>Resultado que você quer</h4><div class="wz-metas">${Object.entries(op.objetivos[w.objetivo].metas).map(([k,m])=>`<label class="wz-meta"><input type="radio" name="meta" value="${k}" ${w.meta===k?'checked':''}><span><b>${esc(m.rotulo)}</b><small>${esc(m.ajuda)}</small></span></label>`).join('')}</div>`:''}
   ${inp('Nome da campanha (opcional)','nome','text','maxlength="60" placeholder="Ex.: Matrículas 2027"')}${nav()}`;
  const passo2=()=>`${cab()}<div class="st-row">${inp('Raio (km)','publico.raioKm','number','min="1" max="80"')}<label>Cidade<input value="${attr(w.publico.cidade?w.publico.cidade.nome:'')}" disabled></label></div>
   <div class="st-row">${inp('Idade mínima','publico.idadeMin','number','min="18" max="65"')}${inp('Idade máxima','publico.idadeMax','number','min="18" max="65"')}</div>
   <label>Gênero<select data-w="publico.genero">${[['todos','Todos'],['mulheres','Mulheres'],['homens','Homens']].map(([v,l])=>`<option value="${v}" ${w.publico.genero===v?'selected':''}>${l}</option>`).join('')}</select></label>
   <label>Interesses (opcional)<input id="wzInt" placeholder="Digite e escolha (ex.: educação)" autocomplete="off"></label><div id="wzIntRes" class="wz-chips"></div><div class="wz-chips">${w.publico.interesses.map((i,x)=>`<span class="st-chip"><button type="button">${esc(i.nome)}</button><button type="button" class="x" data-intx="${x}" aria-label="Remover ${attr(i.nome)}">×</button></span>`).join('')}</div>
   ${op.publicos.length?`<h4>Públicos personalizados</h4>${op.publicos.map(p=>`<label class="check-row"><input type="checkbox" data-pp="${attr(p.id)}" ${w.publico.publicosPersonalizados.includes(p.id)?'checked':''}> ${esc(p.nome)}</label>`).join('')}`:''}
   <h4>Onde mostrar</h4><label class="check-row"><input type="radio" name="modo" value="AUTO" ${w.modo==='AUTO'?'checked':''}> Automático (a Meta escolhe os melhores lugares)</label><label class="check-row"><input type="radio" name="modo" value="MANUAL" ${w.modo==='MANUAL'?'checked':''}> Manual</label>
   ${w.modo==='MANUAL'?`<div class="wz-chips">${op.plataformas.map(p=>`<label class="check-row"><input type="checkbox" data-pl="${p}" ${w.publico.plataformas.includes(p)?'checked':''}> ${p==='audience_network'?'Audience Network':p[0].toUpperCase()+p.slice(1)}</label>`).join('')}</div>`:''}${nav()}`;
  const passo3=()=>`${cab()}<div class="st-row"><label>Tipo de orçamento<select data-w="orc.tipo"><option value="DIARIO" ${w.orc.tipo==='DIARIO'?'selected':''}>Diário</option><option value="TOTAL" ${w.orc.tipo==='TOTAL'?'selected':''}>Total da campanha</option></select></label>${inp('Valor (R$)','orc.valor','number','min="6" step="5"')}</div>
   <div class="st-row">${inp('Início (vazio = agora)','inicio','datetime-local')}${inp('Término (data e hora)','fim','datetime-local')}</div>
   ${w.fim?'':inp('…ou duração em dias','dias','number','min="1"')}
   <label>Estratégia de lance<select data-w="lance.tipo"><option value="MENOR_CUSTO" ${w.lance.tipo==='MENOR_CUSTO'?'selected':''}>Menor custo (recomendado)</option><option value="LIMITE_CUSTO" ${w.lance.tipo==='LIMITE_CUSTO'?'selected':''}>Limite de custo</option></select></label>${w.lance.tipo==='LIMITE_CUSTO'?inp('Custo médio máximo por resultado (R$)','lance.valor','number','min="0.5" step="0.5"'):''}
   <p class="kpi-note">Tetos: R$ ${cfg.config.tetoDia}/dia por campanha, R$ ${cfg.config.tetoMes}/mês, até ${cfg.config.diasMax} dias. Nenhuma campanha fica aberta para sempre.</p>${nav()}`;
  const passo4=()=>{const m=meta(),ex=m.exige,msg=m.rotulo.startsWith('Conversas'),d=w.destino;const tipos=m.criativos;if(!tipos.includes(w.criativo.tipo))w.criativo.tipo=tipos[0];
   return `${cab()}<p class="kpi-note">${esc(op.objetivos[w.objetivo].rotulo)} · ${esc(m.rotulo)}</p>
   ${msg?`<label>Onde a conversa acontece<select data-w="destino.mensagem">${[['DIRECT','Instagram Direct'],['MESSENGER','Messenger'],['WHATSAPP','WhatsApp']].map(([v,l])=>`<option value="${v}" ${d.mensagem===v?'selected':''}>${l}</option>`).join('')}</select></label>${d.mensagem==='WHATSAPP'?inp('Número do WhatsApp (com DDI e DDD)','destino.whatsapp','tel'):''}`:''}
   ${ex.includes('site')?inp('Endereço do site (https)','destino.siteUrl','url','placeholder="https://"'):''}
   ${ex.includes('form')?`<label>Formulário instantâneo<select data-w="destino.formId"><option value="">Escolha…</option>${op.formularios.map(f=>`<option value="${attr(f.id)}" ${d.formId===f.id?'selected':''}>${esc(f.nome)}</option>`).join('')}</select></label>${op.formularios.length?'':inp('ID do formulário (não consegui listar)','destino.formId')}`:''}
   ${ex.includes('pixel')?`<div class="st-row"><label>Pixel<select data-w="destino.pixelId"><option value="">Escolha…</option>${op.pixels.map(p=>`<option value="${attr(p.id)}" ${d.pixelId===p.id?'selected':''}>${esc(p.nome)}</option>`).join('')}</select></label><label>Evento que conta como resultado<select data-w="destino.evento"><option value="">Escolha…</option>${op.eventos.map(e=>`<option ${d.evento===e?'selected':''}>${e}</option>`).join('')}</select></label></div>`:''}
   ${ex.includes('app')?`<div class="st-row">${inp('ID do aplicativo','destino.appId')}${inp('Link da loja (https)','destino.lojaUrl','url')}</div>`:''}
   <h4>Criativo</h4>${tipos.length>1?`<div class="wz-chips">${tipos.map(t=>`<label class="check-row"><input type="radio" name="ctipo" value="${t}" ${w.criativo.tipo===t?'checked':''}> ${t==='POST_IG'?'Publicação do Instagram':'Imagem nova (do Estúdio)'}</label>`).join('')}</div>`:`<p class="kpi-note">Para esse resultado: ${tipos[0]==='POST_IG'?'uma publicação do Instagram':'uma imagem nova'}.</p>`}
   ${w.criativo.tipo==='POST_IG'?`<div class="wz-posts">${op.posts.map(p=>`<button type="button" class="wz-post ${w.criativo.midia===p.id?'sel':''}" data-post="${attr(p.id)}">${p.miniatura?`<img alt="" referrerpolicy="no-referrer" src="${attr(p.miniatura)}">`:'<span>▦</span>'}<small>${esc((p.legenda||'(sem legenda)').slice(0,60))}</small></button>`).join('')||'<div class="empty compact">Nenhuma publicação lida. Atualize o Desempenho.</div>'}</div>`
     :`<label>Imagem JPEG de um post do Estúdio<select data-w="criativo.conteudoId"><option value="">Escolha…</option>${op.imagens.map(i=>`<option value="${attr(i.id)}" ${w.criativo.conteudoId===i.id?'selected':''}>${esc(i.titulo)}</option>`).join('')}</select></label>${op.imagens.length?'':'<p class="tg-ruim">Nenhum post do Estúdio tem imagem JPEG anexada.</p>'}
        <label>Texto do anúncio<textarea data-w="criativo.texto" rows="3" maxlength="2000">${esc(w.criativo.texto)}</textarea></label><div class="st-row">${inp('Título (opcional)','criativo.titulo','text','maxlength="255"')}${inp('Descrição (opcional)','criativo.descricao','text','maxlength="255"')}</div>
        <label>Botão<select data-w="criativo.cta"><option value="">Padrão (${esc(m.cta||'Saiba mais')})</option>${op.ctas.map(c=>`<option ${w.criativo.cta===c?'selected':''}>${c}</option>`).join('')}</select></label>`}${nav()}`;};
  const passo5=()=>`${cab()}<div id="wzPrev" class="gi-prev">Calculando…</div><label class="check-row"><input type="checkbox" id="wzOk"> <span id="wzTxt">Entendo que a campanha vai ao ar agora, ativa, e pode gastar até o total acima.</span></label>
   <div class="st-acoes"><button class="btn soft" type="button" data-close>Cancelar</button><button class="softbtn" type="button" id="wzVolta">Voltar</button><button class="btn accent" type="button" id="wzLanca" disabled>Lançar campanha</button></div>`;
  let prev=null;
  const valida=()=>{
    if(w.passo===1){if(!w.objetivo)return 'Escolha o objetivo.';if(!w.meta)return 'Escolha o resultado que você quer.'}
    if(w.passo===3){if(!(Number(w.orc.valor)>=6))return 'O orçamento mínimo é 6.';if(!w.fim&&!(Number(w.dias)>=1))return 'Defina o término ou a duração em dias.'}
    if(w.passo===4){const c=w.criativo;if(c.tipo==='POST_IG'&&!c.midia)return 'Escolha a publicação.';if(c.tipo==='IMAGEM'&&!c.conteudoId)return 'Escolha a imagem.';if(c.tipo==='IMAGEM'&&!c.texto.trim())return 'Escreva o texto do anúncio.'}
    return '';
  };
  const bind=()=>{
    host.querySelectorAll('[data-w]').forEach(el=>{const f=()=>{setPath(el.dataset.w,el.type==='number'?(el.value===''?'':Number(el.value)):el.value);if(['orc.tipo','lance.tipo','destino.mensagem'].includes(el.dataset.w)||el.dataset.w==='fim')desenha()};el.onchange=f;if(el.tagName!=='SELECT')el.oninput=()=>setPath(el.dataset.w,el.type==='number'?(el.value===''?'':Number(el.value)):el.value)});
    host.querySelectorAll('[data-obj]').forEach(b=>b.onclick=()=>{w.objetivo=b.dataset.obj;const ms=Object.keys(op.objetivos[w.objetivo].metas);w.meta=ms.length===1?ms[0]:'';w.criativo.tipo='';desenha()});
    host.querySelectorAll('input[name="meta"]').forEach(r=>r.onchange=()=>{w.meta=r.value;w.criativo.tipo=''});
    host.querySelectorAll('input[name="modo"]').forEach(r=>r.onchange=()=>{w.modo=r.value;desenha()});
    host.querySelectorAll('[data-pl]').forEach(c=>c.onchange=()=>{const a=w.publico.plataformas;c.checked?a.push(c.dataset.pl):a.splice(a.indexOf(c.dataset.pl),1)});
    host.querySelectorAll('[data-pp]').forEach(c=>c.onchange=()=>{const a=w.publico.publicosPersonalizados;c.checked?a.push(c.dataset.pp):a.splice(a.indexOf(c.dataset.pp),1)});
    host.querySelectorAll('[data-intx]').forEach(b=>b.onclick=()=>{w.publico.interesses.splice(Number(b.dataset.intx),1);desenha()});
    host.querySelectorAll('input[name="ctipo"]').forEach(r=>r.onchange=()=>{w.criativo.tipo=r.value;desenha()});
    host.querySelectorAll('[data-post]').forEach(b=>b.onclick=()=>{w.criativo.midia=b.dataset.post;desenha()});
    const it=host.querySelector('#wzInt');if(it){let tm;it.oninput=()=>{clearTimeout(tm);tm=setTimeout(async()=>{const q=it.value.trim();const box=host.querySelector('#wzIntRes');if(q.length<2){box.innerHTML='';return}try{const r=await api('/ads/campanha/interesses?q='+encodeURIComponent(q));box.innerHTML=r.rows.map(x=>`<button type="button" class="softbtn" data-addint="${attr(x.id)}" data-nome="${attr(x.nome)}">+ ${esc(x.nome)}</button>`).join('');box.querySelectorAll('[data-addint]').forEach(b=>b.onclick=()=>{if(!w.publico.interesses.some(i=>i.id===b.dataset.addint))w.publico.interesses.push({id:b.dataset.addint,nome:b.dataset.nome});desenha()})}catch{}},300)}}
    const rb=host.querySelector('#wzRasc');if(rb)rb.onclick=async()=>{const nome=prompt('Nome do rascunho',w.nome||'')||'';if(nome===null)return;try{const r=await gmPost('/ads/rascunhos',{nome:nome||w.nome||'Rascunho',dados:w,id:rascId});rascId=r.rascunho.id;rascs=r.rascunhos;toast('Rascunho salvo')}catch(e){toast(e.message,'bad')}};
    host.querySelectorAll('[data-rabre]').forEach(b=>b.onclick=()=>{const r=rascs.find(x=>x.id===b.dataset.rabre);if(!r)return;Object.assign(w,r.dados,{passo:1});rascId=r.id;desenha()});
    host.querySelectorAll('[data-rdel]').forEach(b=>b.onclick=async()=>{if(!confirm('Excluir este rascunho?'))return;try{const r=await gmPost('/ads/rascunhos',{excluir:b.dataset.rdel});rascs=r.rascunhos;desenha()}catch(e){toast(e.message,'bad')}});
    const v=host.querySelector('#wzVolta');if(v)v.onclick=()=>{w.passo--;desenha()};
    const p=host.querySelector('#wzProx');if(p)p.onclick=()=>{const e=valida();if(e)return toast(e,'warn');w.passo++;desenha()};
    if(w.passo===5)revisao();
  };
  const revisao=async()=>{
    const b=host.querySelector('#wzLanca'),ok=host.querySelector('#wzOk');
    try{prev=await gmPost('/ads/campanha/previa',spec())}catch(e){host.querySelector('#wzPrev').textContent=e.message;return}
    const r=prev.resumo,pb=r.publico;
    host.querySelector('#wzPrev').innerHTML=`<ul class="gi-lista"><li><b>Objetivo:</b> ${esc(r.objetivo)} · ${esc(r.resultado)}</li><li><b>Público:</b> ${pb.cidade?esc(pb.cidade.nome):'<span class="tg-ruim">cidade não definida</span>'}, raio de ${pb.raioKm} km, ${pb.idadeMin} a ${pb.idadeMax} anos, ${esc(pb.genero)}${pb.interesses.length?' · interesses: '+esc(pb.interesses.join(', ')):''}${pb.publicosPersonalizados?' · '+pb.publicosPersonalizados+' público(s) personalizado(s)':''}</li><li><b>Onde mostrar:</b> ${esc(r.posicionamento)}</li><li><b>Orçamento:</b> ${esc(r.orcamento)} · lance: ${esc(r.lance)}</li><li><b>Período:</b> ${prev.dias} dia(s), termina em ${prev.fim?esc(fmtDate(String(prev.fim).slice(0,10))):'—'}</li><li><b>Total comprometido:</b> até ${esc(gmBrl(prev.compromisso,prev.moeda))}</li><li><b>Mês:</b> já gasto ${esc(gmBrl(prev.gastoMes,prev.moeda))} + em andamento ${esc(gmBrl(prev.pendente,prev.moeda))} · teto mensal ${esc(gmBrl(prev.tetoMes,prev.moeda))}</li></ul>${prev.erros.map(e=>`<p class="tg-ruim">✖ ${esc(e)}</p>`).join('')}${prev.avisos.map(e=>`<p class="kpi-note">⚠ ${esc(e)}</p>`).join('')}`;
    host.querySelector('#wzTxt').textContent=`Entendo que a campanha vai ao ar agora, ativa, e pode gastar até ${gmBrl(prev.compromisso,prev.moeda)}.`;
    ok.onchange=()=>{b.disabled=!(prev.ok&&ok.checked)};
    b.onclick=async()=>{b.disabled=true;b.textContent='Lançando…';try{const x=await gmPost('/ads/campanha/lancar',{spec:spec(),confirmou:true});ov.close();toast(x.lancamento.repetido?'Esse lançamento já existia':'Campanha lançada. A Meta vai analisar e ela começa a rodar.');if(state.page==='gerenciador')renderGerenciador()}catch(e){toast(e.message,'bad');b.textContent='Lançar campanha';b.disabled=false}};
  };
  const desenha=()=>{host.innerHTML=[passo1,passo2,passo3,passo4,passo5][w.passo-1]();bind()};
  desenha();
}

// Comparar anúncios: melhor e pior custo por resultado no período; permite pausar o pior com um clique.
function gmComparar(){
  const todos=[];for(const c of gmDados.campanhas)for(const s of c.conjuntos)for(const a of s.anuncios)todos.push({...a,campanhaNome:c.nome,ativo:a.status==='ACTIVE'});
  const com=todos.filter(a=>a.gasto>0);
  const comRes=com.filter(a=>a.resultados>0).sort((a,b)=>a.custoResultado-b.custoResultado);
  const semRes=com.filter(a=>!(a.resultados>0)).sort((a,b)=>b.gasto-a.gasto);
  const med=comRes.length?comRes.reduce((s,a)=>s+a.custoResultado,0)/comRes.length:0;
  const linha=(a,i,sem)=>`<tr><td>${sem?'—':(i+1)+'º'}</td><td>${esc(a.nome)}<br><small>${esc(a.campanhaNome)}</small></td><td>${esc(gmBrl(a.gasto))}</td><td>${gmN(a.resultados)}</td><td>${sem?'<span class="tg-ruim">sem resultado</span>':esc(gmBrl(a.custoResultado))+(med&&a.custoResultado>med*1.5?' <span class="tg-ruim">acima da média</span>':'')}</td><td>${a.ativo&&adsCompleto?`<button class="softbtn" data-pz="${attr(a.id)}">Pausar</button>`:gmBadge(a.estado)}</td></tr>`;
  const ov=adminOverlay(`<h3>Comparar anúncios (${esc(fmtDate(gmDados.de))} a ${esc(fmtDate(gmDados.ate))})</h3><p class="kpi-note">Ordenado do menor para o maior custo por resultado. ${comRes.length?`Média: ${esc(gmBrl(med))}.`:'Nenhum anúncio com resultado no período.'} Pausar vale na Meta na hora.</p><div class="tablewrap"><table class="datatable"><thead><tr><th></th><th>Anúncio</th><th>Gasto</th><th>Resultados</th><th>Custo/resultado</th><th></th></tr></thead><tbody>${comRes.map((a,i)=>linha(a,i,false)).join('')}${semRes.map((a,i)=>linha(a,i,true)).join('')||''}${com.length?'':'<tr><td colspan="6">Nenhum anúncio com gasto neste período.</td></tr>'}</tbody></table></div><div class="st-acoes"><button class="btn soft" data-close type="button">Fechar</button></div>`);
  ov.el.querySelectorAll('[data-pz]').forEach(b=>b.onclick=async()=>{const a=todos.find(x=>x.id===b.dataset.pz);if(!confirm(`Pausar "${a.nome}"?`))return;ov.close();await gmEditar('anuncio',a.id,{status:'PAUSED'})});
}


// ---------- Tráfego em 3 níveis: Campanhas | Conjuntos | Anúncios, detalhes, comparação e vínculo com Conteúdo ----------
const gmPct=v=>Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%';
const gmDec=v=>Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const gmMoeda=v=>v===null||v===undefined?'—':gmBrl(v);
function gmTodos(nivel){const o=[];for(const c of gmDados.campanhas){if(nivel==='campanha'){o.push({...c,_pai:''});continue}for(const j of c.conjuntos){if(nivel==='conjunto'){o.push({...j,_pai:c.nome,_campanha:c.id});continue}for(const a of j.anuncios)o.push({...a,_pai:`${c.nome} › ${j.nome}`,_campanha:c.id,_conjunto:j.id})}}return o}
function gmOrcamentoHtml(d){const o=d.orcamentoConta||{};return `<div class="card gm-orc"><b>Orçamento (três números, sem misturar)</b><div class="gm-orc-lin"><div><small>Planejado no EVO MKT (mês)</small><strong>${o.planejadoEvo?esc(gmBrl(o.planejadoEvo)):'não definido'}</strong></div><div><small>Configurado na Meta (campanhas ativas, por dia)</small><strong>${esc(gmBrl(o.configuradoMetaDia||0))}/dia</strong></div><div><small>Gasto no mês</small><strong>${esc(gmBrl(o.gastoMes||0))}</strong></div>${o.planejadoEvo?`<div><small>Saldo do planejado</small><strong>${esc(gmBrl(Math.max(0,o.planejadoEvo-(o.gastoMes||0))))}</strong></div>`:''}</div><small>Lido da Meta em ${esc(fmtDateTime(d.lidoEm))}. O orçamento planejado é definido em Tráfego → Visão do mês.</small></div>`}
function gmAbasHtml(){const ab=[['hierarquia','Hierarquia'],['campanha','Campanhas'],['conjunto','Conjuntos'],['anuncio','Anúncios']];
  const foco=[];if(gmFoco.campanha){const c=gmDados.campanhas.find(x=>x.id===gmFoco.campanha);foco.push(c?c.nome:gmFoco.campanha)}if(gmFoco.conjunto){const j=gmTodos('conjunto').find(x=>x.id===gmFoco.conjunto);foco.push(j?j.nome:gmFoco.conjunto)}
  return `<div class="st-toolbar"><div class="st-filtros" role="tablist">${ab.map(([k,l])=>`<button type="button" class="softbtn ${gmVisao===k?'ativo':''}" data-gv="${k}" ${gmVisao===k?'aria-pressed="true"':''}>${l}</button>`).join('')}</div><div class="st-filtros"><label>Ordenar por <select id="gmOrdSel">${[['status','Status'],['inicio','Data de início'],['gasto','Gasto'],['conversas','Conversas iniciadas'],['nome','Nome']].map(([k,l])=>`<option value="${k}" ${gmOrdem.k===k?'selected':''}>${l}</option>`).join('')}</select></label><button type="button" class="softbtn" id="gmOrdDir" title="Inverter a ordem">${gmOrdem.d>0?'↑ crescente':'↓ decrescente'}</button></div>${foco.length?`<div class="gm-crumb">Filtrado em: <b>${foco.map(esc).join(' › ')}</b> <button type="button" class="softbtn" id="gmLimpaFoco">Ver tudo</button></div>`:''}</div>`}
function gmFlatHtml(){
  const nivel=gmVisao;let lista=gmTodos(nivel);
  if(gmFoco.campanha)lista=lista.filter(x=>nivel==='campanha'?x.id===gmFoco.campanha:x._campanha===gmFoco.campanha);
  if(gmFoco.conjunto)lista=lista.filter(x=>nivel==='conjunto'?x.id===gmFoco.conjunto:x._conjunto===gmFoco.conjunto);
  lista=gmOrdena(lista);
  const b=gmFiltro.busca.toLowerCase();if(gmFiltro.estado)lista=lista.filter(x=>x.status===gmFiltro.estado);if(b)lista=lista.filter(x=>(x.nome+' '+(x.codigo||'')+' '+x.id).toLowerCase().includes(b));
  const nome={campanha:'campanha',conjunto:'conjunto',anuncio:'anúncio'}[nivel];
  const col=(x,k,f)=>`<td>${f(x[k],x)}</td>`;
  const linhas=lista.map(x=>`<tr data-id="${attr(x.id)}"><td>${nivel==='anuncio'?`<input type="checkbox" data-gsel="${attr(x.id)}" ${gmSel.has(x.id)?'checked':''} aria-label="Selecionar para comparar">`:''}</td>
   <td><b>${esc(x.codigo||'')}</b><br><small>Meta: ${esc(x.id)}</small></td>
   <td>${x.foto?`<img class="gm-foto" alt="" referrerpolicy="no-referrer" src="${attr(x.foto)}"> `:''}${nivel!=='anuncio'?`<a href="#" data-gf="${nivel}:${attr(x.id)}" title="Abrir ${nivel==='campanha'?'os conjuntos':'os anúncios'}"><b>${esc(x.nome)}</b></a>`:`<b>${esc(x.nome)}</b>`}${x._pai?`<br><small>${esc(x._pai)}</small>`:''}</td>
   <td>${gmBadge(x.estado)}<br><small>Meta: ${esc(x.estado||x.status)}</small></td><td>${esc(gmInicioTxt(x))}</td><td>${nivel==='anuncio'?'—':gmOrc(x.orcamento)}</td>
   <td>${esc(gmBrl(x.gasto))}</td><td>${gmN(x.impressoes)}</td><td>${gmN(x.alcance)}</td><td>${gmDec(x.frequencia)}</td><td>${gmN(x.cliques)}</td><td>${gmPct(x.ctr)}</td><td>${x.cliques?esc(gmBrl(x.cpc)):'—'}</td><td>${x.impressoes?esc(gmBrl(x.cpm)):'—'}</td>
   <td>${gmN(x.conversas)}</td><td>${esc(gmMoeda(x.custoConversa))}</td><td>${gmN(x.leads)}</td><td>${esc(gmMoeda(x.cpl))}</td><td>${gmN(x.resultados)}<small> ${esc(x.rotuloResultado||'')}</small></td><td>${esc(gmMoeda(x.custoResultado))}</td>
   <td><button class="softbtn" data-det="${attr(x.id)}">Detalhes</button></td></tr>`).join('');
  return `<div class="card"><div class="st-toolbar"><div class="st-filtros"><input type="search" id="gmBusca" placeholder="Buscar por nome ou código" value="${attr(gmFiltro.busca)}"><select id="gmEstadoF"><option value="">Todos os status</option>${['ACTIVE','PAUSED','ARCHIVED'].map(e=>`<option value="${e}" ${gmFiltro.estado===e?'selected':''}>${e==='ACTIVE'?'Ativos':e==='PAUSED'?'Pausados':'Arquivados'}</option>`).join('')}</select></div>${nivel==='anuncio'?`<button class="btn" id="gmCompSel" ${gmSel.size<2?'disabled':''}>Comparar selecionados (${gmSel.size})</button>`:''}</div>
   <div class="tablewrap gm-wrap"><table class="datatable gm-tab"><thead><tr><th></th><th>Código EVO · ID Meta</th><th>${nome[0].toUpperCase()+nome.slice(1)}</th>${gmThOrd('status','Status na Meta')}${gmThOrd('inicio','Início')}<th>Orçamento</th>${gmThOrd('gasto','Gasto')}<th>Impressões</th><th>Alcance</th><th>Freq.</th><th>Cliques</th>${gmThOrd('ctr','CTR')}<th>CPC</th><th>CPM</th>${gmThOrd('conversas','Conversas iniciadas')}${gmThOrd('custo','Custo/conversa')}<th>Leads</th><th>CPL</th>${gmThOrd('resultados','Resultados')}<th>Custo/resultado</th><th></th></tr></thead><tbody>${linhas||'<tr><td colspan="21" class="empty compact">Nada neste filtro.</td></tr>'}</tbody></table></div>
   <p class="kpi-note">${lista.length} ${nome}(s) · período ${esc(fmtDate(gmDados.de))} a ${esc(fmtDate(gmDados.ate))}. Status e números são os devolvidos pela Meta, sem interpretação.</p></div>`}
function gmLiga(){
  $$('[data-gord]').forEach(b=>b.onclick=()=>{const k=b.dataset.gord;gmOrdem=gmOrdem.k===k?{k,d:-gmOrdem.d}:{k,d:['status','inicio','nome'].includes(k)?1:-1};desenharGerenciador()});
  const so=$('#gmOrdSel');if(so)so.onchange=()=>{gmOrdem={k:so.value,d:['status','inicio','nome'].includes(so.value)?1:-1};desenharGerenciador()};
  const sd=$('#gmOrdDir');if(sd)sd.onclick=()=>{gmOrdem={...gmOrdem,d:-gmOrdem.d};desenharGerenciador()};
  $$('[data-gv]').forEach(b=>b.onclick=()=>{gmVisao=b.dataset.gv;desenharGerenciador()});
  const lf=$('#gmLimpaFoco');if(lf)lf.onclick=()=>{gmFoco={campanha:'',conjunto:''};desenharGerenciador()};
  $$('[data-gf]').forEach(a=>a.onclick=e=>{e.preventDefault();const [n,id]=a.dataset.gf.split(':');if(n==='campanha'){gmFoco={campanha:id,conjunto:''};gmVisao='conjunto'}else{gmFoco={campanha:(gmTodos('conjunto').find(x=>x.id===id)||{})._campanha||gmFoco.campanha,conjunto:id};gmVisao='anuncio'}desenharGerenciador()});
  $$('[data-det]').forEach(b=>b.onclick=()=>gmDetalhes(b.dataset.det));
  $$('[data-gsel]').forEach(c=>c.onchange=()=>{c.checked?gmSel.add(c.dataset.gsel):gmSel.delete(c.dataset.gsel);const bt=$('#gmCompSel');if(bt){bt.disabled=gmSel.size<2;bt.textContent=`Comparar selecionados (${gmSel.size})`}});
  const bs=$('#gmBusca');if(bs)bs.oninput=()=>{gmFiltro.busca=bs.value;clearTimeout(gmLiga.t);gmLiga.t=setTimeout(()=>{desenharGerenciador();const n=$('#gmBusca');if(n){n.focus();n.setSelectionRange(n.value.length,n.value.length)}},350)};
  const ef=$('#gmEstadoF');if(ef)ef.onchange=()=>{gmFiltro.estado=ef.value;desenharGerenciador()};
  const cs=$('#gmCompSel');if(cs)cs.onclick=gmCompararSel;
}
// Detalhes: todos os campos que a Meta devolve para o nível, mais o código interno e o vínculo com Conteúdo
async function gmDetalhes(id){
  const [o,nivel]=gmAchar(id);if(!o)return;
  const p=o.publico||{},cr=o.criativo||{};
  const lin=(r,v)=>v===undefined||v===null||v===''||(Array.isArray(v)&&!v.length)?'':`<tr><th>${esc(r)}</th><td>${v}</td></tr>`;
  const loc=[...(p.cidades||[]).map(c=>`${esc(c.nome)}${c.raioKm?` (+${c.raioKm} km)`:''}`),...(p.regioes||[]).map(esc),...(p.paises||[]).map(esc)].join(', ');
  const idade=p.idadeMin||p.idadeMax?`${p.idadeMin||'—'} a ${p.idadeMax||'—'} anos`:'';
  const metr=`<tr><th>Gasto</th><td>${esc(gmBrl(o.gasto))}</td></tr>${lin('Impressões',gmN(o.impressoes))}${lin('Alcance',gmN(o.alcance))}${lin('Frequência',gmDec(o.frequencia))}${lin('Cliques',gmN(o.cliques))}${lin('CTR',gmPct(o.ctr))}${lin('CPC',o.cliques?esc(gmBrl(o.cpc)):'—')}${lin('CPM',o.impressoes?esc(gmBrl(o.cpm)):'—')}${lin('Conversas',gmN(o.conversas))}${lin('Custo por conversa',esc(gmMoeda(o.custoConversa)))}${lin('Leads',gmN(o.leads))}${lin('CPL',esc(gmMoeda(o.cpl)))}${lin('Resultados ('+esc(o.rotuloResultado||'')+')',gmN(o.resultados))}${lin('Custo por resultado',esc(gmMoeda(o.custoResultado)))}`;
  let conteudos=[];if(nivel==='anuncio'&&true){try{conteudos=(await getRows('conteudos')).rows||[]}catch{}}
  const vinc=nivel==='anuncio'?`<h4>Vínculo com Conteúdo</h4><p class="kpi-note">Liga o anúncio a um Conteúdo do EVO MKT (produção orgânica → mídia paga). Não altera nada na Meta.</p><div class="st-row"><label>Conteúdo<select id="gdConteudo"><option value="">(nenhum)</option>${conteudos.map(c=>`<option value="${attr(c.id)}" ${o.conteudo&&o.conteudo.id===c.id?'selected':''}>${esc((c.titulo||c.id).slice(0,70))}</option>`).join('')}${o.conteudo&&!conteudos.some(c=>c.id===o.conteudo.id)?`<option value="${attr(o.conteudo.id)}" selected>${esc(o.conteudo.titulo||o.conteudo.id)}</option>`:''}</select></label><button class="softbtn" id="gdVinc" type="button">Salvar vínculo</button></div>`:'';
  const ov=adminOverlay(`<h3>${esc(o.nome)}</h3><p class="kpi-note">${nivel==='campanha'?'Campanha':nivel==='conjunto'?'Conjunto de anúncios':'Anúncio'} · código EVO <b>${esc(o.codigo||'')}</b> · ID na Meta <b>${esc(o.id)}</b></p>
   ${o.foto?`<img class="gm-foto" alt="" referrerpolicy="no-referrer" src="${attr(o.foto)}" style="width:96px;height:auto;border-radius:10px">`:''}
   <table class="datatable gm-det"><tbody>${lin('Status na Meta',esc(o.estado||o.status))}${lin('Objetivo',esc(GM_OBJ[o.objetivo]||o.objetivo||''))}${lin('Orçamento na Meta',nivel==='anuncio'?'':gmOrc(o.orcamento))}${lin('Criado em',o.criado?esc(fmtDateTime(o.criado)):'')}${lin('Início',o.inicio?esc(fmtDateTime(o.inicio)):'')}${lin('Término',o.fim?esc(fmtDateTime(o.fim)):'')}
   ${nivel==='conjunto'?lin('Localização',loc)+lin('Faixa etária',idade)+lin('Gênero',(p.generos||[]).map(esc).join(', ')||'Todos')+lin('Plataformas',(p.plataformas||[]).map(esc).join(', '))+lin('Posicionamentos',(p.posicionamentos||[]).map(esc).join(', ')||'Automáticos')+lin('Otimização',esc(o.otimizacao))+lin('Evento de conversão',esc(o.evento))+lin('Destino',esc(o.destino))+lin('Estratégia de lance',esc(o.estrategiaLance)):''}
   ${nivel==='anuncio'?lin('Formato',esc(cr.formato||''))+lin('Título',esc(cr.titulo))+lin('Texto principal',esc(cr.texto))+lin('Descrição',esc(cr.descricao))+lin('Botão (CTA)',esc(cr.cta))+lin('Endereço (URL)',cr.url?`<a href="${attr(cr.url)}" target="_blank" rel="noopener">${esc(cr.url)}</a>`:'')+lin('Publicação no Instagram',cr.instagram?`<a href="${attr(cr.instagram)}" target="_blank" rel="noopener">abrir</a>`:'')+lin('Página do Facebook (ID)',esc(cr.paginaId))+lin('Instagram usado (ID)',esc(cr.instagramId)):''}
   </tbody></table><h4>Métricas do período (${esc(fmtDate(gmDados.de))} a ${esc(fmtDate(gmDados.ate))})</h4><table class="datatable gm-det"><tbody>${metr}</tbody></table>${vinc}
   <div class="st-acoes"><button class="btn soft" data-close type="button">Fechar</button></div>`);
  const vb=ov.el.querySelector('#gdVinc');if(vb)vb.onclick=async()=>{try{await gmPost('/ads/vinculo',{ad:o.id,conteudo:ov.el.querySelector('#gdConteudo').value});toast('Vínculo salvo');ov.close();renderGerenciador()}catch(e){toast(e.message,'bad')}};
}
// Comparar anúncios escolhidos: destaca o melhor e o pior de cada métrica de taxa/custo, sem recomendar nada
function gmCompararSel(){
  const itens=gmTodos('anuncio').filter(a=>gmSel.has(a.id));if(itens.length<2)return toast('Selecione pelo menos 2 anúncios','warn');
  const M=[['gasto','Investimento',v=>esc(gmBrl(v)),0],['impressoes','Impressões',gmN,0],['alcance','Alcance',gmN,0],['ctr','CTR',gmPct,1],['cpc','CPC',v=>esc(gmMoeda(v)),-1],['cpm','CPM',v=>esc(gmMoeda(v)),-1],['conversas','Conversas',gmN,1],['custoConversa','Custo por conversa',v=>esc(gmMoeda(v)),-1],['leads','Leads',gmN,1],['cpl','CPL',v=>esc(gmMoeda(v)),-1]];
  const linhas=M.map(([k,r,f,dir])=>{const vals=itens.map(a=>a[k]);const val=vals.filter(v=>v!==null&&v!==undefined&&!(dir===-1&&!v));let best=null,worst=null;if(dir&&val.length>1){best=dir===1?Math.max(...val):Math.min(...val);worst=dir===1?Math.min(...val):Math.max(...val);if(best===worst)best=worst=null}
    return `<tr><th>${r}</th>${itens.map(a=>{const v=a[k];const cl=v===best?'gm-best':v===worst?'gm-worst':'';return `<td class="${cl}">${v===null||v===undefined||(dir===-1&&!v)?'—':f(v)}${cl==='gm-best'?' <small>melhor</small>':cl==='gm-worst'?' <small>pior</small>':''}</td>`}).join('')}</tr>`}).join('');
  adminOverlay(`<h3>Comparar anúncios (${esc(fmtDate(gmDados.de))} a ${esc(fmtDate(gmDados.ate))})</h3><p class="kpi-note">Em CTR, conversas e leads, maior é melhor; em CPC, CPM e custos, menor é melhor. Os destaques são só comparação numérica entre os selecionados.</p><div class="tablewrap"><table class="datatable"><thead><tr><th></th>${itens.map(a=>`<th>${esc(a.codigo||'')}<br><small>${esc(a.nome)}</small></th>`).join('')}</tr></thead><tbody>${linhas}</tbody></table></div><div class="st-acoes"><button class="btn soft" data-close type="button">Fechar</button></div>`);
}
