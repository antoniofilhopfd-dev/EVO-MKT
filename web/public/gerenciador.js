// Gerenciador de Anúncios: campanhas > conjuntos > anúncios da conta inteira, com métricas e edição de tudo (só Gerência).
let gmDados=null,gmAberto=new Set(),gmPeriodo={de:'',ate:'',p:'7'},gmArq=false,gmEdit=null;
const gmPost=(u,b)=>api(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b||{})});
const gmBrl=(v,m)=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:m||(gmDados&&gmDados.moeda)||'BRL'});
const gmN=v=>Number(v||0).toLocaleString('pt-BR',{maximumFractionDigits:0});
const GM_OBJ={OUTCOME_AWARENESS:'Reconhecimento',OUTCOME_TRAFFIC:'Tráfego',OUTCOME_ENGAGEMENT:'Engajamento',OUTCOME_LEADS:'Cadastros (leads)',OUTCOME_SALES:'Vendas',OUTCOME_APP_PROMOTION:'Promoção do app'};
const GM_ESTADO={ACTIVE:['Ativo','ok'],PAUSED:['Pausado',''],PENDING_REVIEW:['Em análise','warn'],IN_PROCESS:['Em processamento','warn'],DISAPPROVED:['Reprovado','bad'],WITH_ISSUES:['Com problema','bad'],CAMPAIGN_PAUSED:['Campanha pausada',''],ADSET_PAUSED:['Conjunto pausado',''],ARCHIVED:['Arquivado',''],PENDING_BILLING_INFO:['Pagamento pendente','bad']};

function gmIntervalo(p){const h=new Date();h.setHours(12,0,0,0);const f=d=>new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);if(p==='hoje')return [f(h),f(h)];if(p==='mes')return [f(new Date(h.getFullYear(),h.getMonth(),1,12)),f(h)];const n=Number(p)||7,i=new Date(h);i.setDate(h.getDate()-(n-1));return [f(i),f(h)]}

async function renderGerenciador(){
  if(internalSession?.role!=='manager')return go('minhaarea');
  if(!gmPeriodo.de){[gmPeriodo.de,gmPeriodo.ate]=gmIntervalo(gmPeriodo.p)}
  $('#content').innerHTML='<div class="loading"><span></span><b>Lendo a conta na Meta…</b></div>';
  try{gmDados=await api(`/ads/arvore?de=${gmPeriodo.de}&ate=${gmPeriodo.ate}${gmArq?'&arquivados=1':''}`)}
  catch(e){if(state.page!=='gerenciador')return;$('#content').innerHTML=`<div class="dashboard-head"><div><small>GERENCIADOR DE ANÚNCIOS</small><h1>Não foi possível ler a conta</h1><p>${esc(e.message)}</p></div></div>`;return}
  if(state.page!=='gerenciador')return;
  desenharGerenciador();
}
function gmBadge(est){const [l,c]=GM_ESTADO[est]||[est||'—',''];return `<span class="badge ${c}">${esc(l)}</span>`}
function gmOrc(o){if(!o)return '—';if(o.diario)return `${esc(gmBrl(o.diario))}<small>/dia</small>`;if(o.total)return `${esc(gmBrl(o.total))}<small> total</small>`;return '<small>da campanha</small>'}
function gmLinha(x,nivel,pai=''){
  const aberto=gmAberto.has(x.id),filhos=nivel==='campanha'?x.conjuntos:nivel==='conjunto'?x.anuncios:[];
  const ligado=x.status==='ACTIVE';
  return `<tr class="gm-${nivel}" data-id="${attr(x.id)}" data-nivel="${nivel}">
   <td class="gm-nome"><span class="gm-ind gm-i${nivel==='campanha'?0:nivel==='conjunto'?1:2}">${filhos.length?`<button class="gm-seta" data-abre="${attr(x.id)}" aria-label="${aberto?'Recolher':'Expandir'}">${aberto?'▾':'▸'}</button>`:'<span class="gm-seta"></span>'}${x.foto?`<img class="gm-foto" alt="" referrerpolicy="no-referrer" src="${attr(x.foto)}">`:''}<span><b>${esc(x.nome)}</b>${nivel==='campanha'?`<small>${esc(GM_OBJ[x.objetivo]||x.objetivo||'')}</small>`:nivel==='conjunto'?`<small>${esc(x.otimizacao||'')}${x.destino?' · '+esc(x.destino):''}</small>`:''}</span></span></td>
   <td><label class="gm-sw" title="${ligado?'Pausar':'Ativar'}"><input type="checkbox" data-sw="${attr(x.id)}" ${ligado?'checked':''} ${x.status==='ARCHIVED'||x.status==='DELETED'?'disabled':''}><i></i></label></td>
   <td>${gmBadge(x.estado)}</td><td>${nivel==='anuncio'?'—':gmOrc(x.orcamento)}</td>
   <td>${gmN(x.resultados)}<small>${esc(x.rotuloResultado||'')}</small></td><td>${x.custoResultado===null?'—':esc(gmBrl(x.custoResultado))}</td><td>${esc(gmBrl(x.gasto))}</td><td>${gmN(x.impressoes)}</td><td>${gmN(x.alcance)}</td><td>${x.ctr.toFixed(2).replace('.',',')}%</td><td>${x.cliques?esc(gmBrl(x.cpc)):'—'}</td>
   <td class="gm-acoes"><button class="softbtn" data-edit="${attr(x.id)}">Editar</button><button class="softbtn" data-dup="${attr(x.id)}" title="Duplicar (a cópia nasce pausada)">⧉</button></td></tr>${aberto?filhos.map(f=>gmLinha(f,nivel==='campanha'?'conjunto':'anuncio',x.id)).join(''):''}`;
}
function gmAchar(id){for(const c of gmDados.campanhas){if(c.id===id)return [c,'campanha'];for(const s of c.conjuntos){if(s.id===id)return [s,'conjunto'];for(const a of s.anuncios)if(a.id===id)return [a,'anuncio']}}return [null,'']}

function desenharGerenciador(){
  const d=gmDados;
  $('#content').innerHTML=`<div class="dashboard-head"><div><small>GERENCIADOR DE ANÚNCIOS · META</small><h1>Campanhas da conta</h1><p>Tudo o que está na conta de anúncios, não só o que o sistema lançou. Mudanças valem na Meta na hora. Duplicar cria a cópia <b>pausada</b>.</p></div><div class="st-head-btns"><button class="softbtn" id="gmHist">Histórico de alterações</button><button class="btn" id="gmNova">+ Nova campanha</button></div></div>
  <div class="st-toolbar"><div class="st-filtros"><select id="gmP"><option value="hoje">Hoje</option><option value="7">Últimos 7 dias</option><option value="30">Últimos 30 dias</option><option value="mes">Este mês</option><option value="x">Personalizado</option></select><input type="date" id="gmDe" value="${attr(d.de)}"><input type="date" id="gmAte" value="${attr(d.ate)}"><label class="check-row"><input type="checkbox" id="gmArq" ${gmArq?'checked':''}> Mostrar arquivados</label></div><button class="softbtn" id="gmAtualiza">Atualizar</button></div>
  <div class="card"><div class="tablewrap gm-wrap"><table class="datatable gm-tab"><thead><tr><th>Nome</th><th>Ligado</th><th>Estado</th><th>Orçamento</th><th>Resultados</th><th>Custo/resultado</th><th>Gasto</th><th>Impressões</th><th>Alcance</th><th>CTR</th><th>CPC</th><th></th></tr></thead>
  <tbody>${d.campanhas.map(c=>gmLinha(c,'campanha')).join('')||'<tr><td colspan="12" class="empty compact">Nenhuma campanha neste filtro.</td></tr>'}</tbody>
  <tfoot><tr class="tot"><td colspan="6">Total do período (${esc(fmtDate(d.de))} a ${esc(fmtDate(d.ate))})</td><td>${esc(gmBrl(d.totais.gasto))}</td><td>${gmN(d.totais.impressoes)}</td><td>${gmN(d.totais.alcance)}</td><td>${d.totais.ctr.toFixed(2).replace('.',',')}%</td><td>${d.totais.cliques?esc(gmBrl(d.totais.cpc)):'—'}</td><td></td></tr></tfoot></table></div></div>`;
  const sel=$('#gmP');sel.value=['hoje','7','30','mes'].includes(gmPeriodo.p)?gmPeriodo.p:'x';
  sel.onchange=()=>{gmPeriodo.p=sel.value;if(sel.value!=='x'){[gmPeriodo.de,gmPeriodo.ate]=gmIntervalo(sel.value);renderGerenciador()}};
  $('#gmDe').onchange=$('#gmAte').onchange=()=>{gmPeriodo={de:$('#gmDe').value,ate:$('#gmAte').value,p:'x'}};
  $('#gmAtualiza').onclick=()=>{gmPeriodo.de=$('#gmDe').value;gmPeriodo.ate=$('#gmAte').value;renderGerenciador()};
  $('#gmArq').onchange=e=>{gmArq=e.target.checked;renderGerenciador()};
  $('#gmHist').onclick=gmHistorico;$('#gmNova').onclick=()=>{if(typeof novaCampanha==='function')novaCampanha();else toast('A criação completa de campanha chega na próxima etapa.','warn')};
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
   <p class="kpi-note">Só são enviados os campos que você mudar. Respeita os tetos do Gestor de anúncios.</p>
   <div class="st-acoes"><button class="btn soft" type="button" data-close>Cancelar</button><button class="btn" type="button" id="geSalva">Salvar na Meta</button><button class="softbtn" type="button" id="geArq">Arquivar</button><button class="softbtn ga-perigo" type="button" id="geDel">Excluir</button></div></div>`);
  const g=id=>ov.el.querySelector('#'+id);
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
    }
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
