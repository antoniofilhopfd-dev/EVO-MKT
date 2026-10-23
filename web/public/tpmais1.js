/* Tráfego Pago: Criativos, Públicos e Análises.
   Tudo aqui é leitura e comparação sobre os dados que a Meta devolve (nada é alterado). Quando um dado não existe, aparece "—" ou uma explicação, nunca zero inventado. */
const TP_PAGINAS={};
function tpCabecalho(titulo,sub,extra=''){
  return `<div class="tp-topo"><div class="tf-head" style="margin:0"><div><small>TRÁFEGO PAGO</small><h1>${esc(titulo)}</h1>${sub?`<p>${esc(sub)}</p>`:''}</div></div><div class="tp-topo-d">${tpSeletorPeriodo()}<span id="tpSaudeBox"></span>${extra}</div></div>`;
}
function tpPosCabecalho(recarrega){
  tpLigaPeriodo(recarrega);
  tpSaudeChip().then(h=>{const b=$('#tpSaudeBox');if(b){b.innerHTML=h;const bt=$('#tpSaude');if(bt)bt.onclick=tpAbrirSaude}});
}
async function tpCarregaOuErro(pagina){
  try{await adsCarregaModo();return await tpArvore()}catch(e){if(state.page===pagina)$('#tpPg').innerHTML=`<div class="empty-rich"><strong>Não foi possível ler a conta</strong><p>${esc(e.message)}</p></div>`;return null}
}
const tpMet=(x,k)=>{const c=TP_COL[k];return c?c.v(x):x[k]};
const tpFmtMet={gasto:v=>gmBrl(v),impressoes:gmN,alcance:gmN,cliques:gmN,ctr:gmPct,cpc:gmBrl,cpm:gmBrl,frequencia:gmDec,conversas:gmN,custoConversa:gmBrl,leads:gmN,cpl:gmBrl,resultados:gmN,custoResultado:gmBrl};
const TP_METS=[['gasto','Investimento'],['impressoes','Impressões'],['alcance','Alcance'],['cliques','Cliques'],['ctr','CTR'],['cpc','CPC'],['cpm','CPM'],['frequencia','Frequência'],['conversas','Conversas iniciadas'],['custoConversa','Custo por conversa'],['resultados','Resultados'],['custoResultado','Custo por resultado']];
/** Para custos, "menor é melhor" só como leitura numérica; não é recomendação. */
const TP_MENOR_MELHOR=new Set(['cpc','cpm','custoConversa','custoResultado','cpl']);

// ================= Criativos =================
const TPC={f:{texto:'',status:'',formato:'',campanha:'',ord:'gasto'},sel:new Set(),agrupar:false};
TP_PAGINAS.tfcriativos=async function(){
  state.module=null;
  $('#content').innerHTML=tpCabecalho('Criativos','Galeria de anúncios com miniaturas, formato, publicação vinculada e resultados.')+'<div id="tpPg"><div class="loading"><span></span><b>Lendo os anúncios…</b></div></div>';
  tpPosCabecalho(()=>TP_PAGINAS.tfcriativos());
  const d=await tpCarregaOuErro('tfcriativos');if(!d)return;
  const desenha=()=>{
    const todos=tpFlat('anuncio').filter(x=>tpEstadoDe(x)!=='ARCHIVED'||TPC.f.status==='arquivados');
    const f=TPC.f,q=f.texto.toLowerCase();
    let l=todos.filter(x=>(!q||`${x.nome} ${(x.criativo||{}).titulo||''} ${(x.criativo||{}).texto||''}`.toLowerCase().includes(q))&&(!f.status||TP_STATUS_GRUPOS[f.status]&&TP_STATUS_GRUPOS[f.status](tpEstadoDe(x)))&&(!f.formato||tpFormatoDe(x)===f.formato)&&(!f.campanha||x._campanha===f.campanha));
    const chave=x=>(x.criativo&&x.criativo.id)||tpPubIG(x)||x.foto||x.id;
    let itens=l;
    if(TPC.agrupar){const g=new Map();l.forEach(x=>{const k=chave(x);const e=g.get(k)||{...x,_n:0,_ids:[],_campanhas:new Set(),gasto:0,impressoes:0,alcance:0,cliques:0,conversas:0,leads:0,resultados:0};e._n++;e._ids.push(x.id);e._campanhas.add(x._campanha);for(const m of ['gasto','impressoes','alcance','cliques','conversas','leads','resultados'])e[m]+=Number(x[m])||0;g.set(k,e)});
      itens=[...g.values()].map(e=>({...e,ctr:e.impressoes?e.cliques/e.impressoes*100:0,cpc:e.cliques?e.gasto/e.cliques:0,cpm:e.impressoes?e.gasto/e.impressoes*1000:0,custoConversa:e.conversas?e.gasto/e.conversas:null,custoResultado:e.resultados?e.gasto/e.resultados:null}))}
    const col=f.ord;itens=[...itens].sort((a,b)=>{const x=tpMet(a,col),y=tpMet(b,col);const nx=x===null||x===undefined,ny=y===null||y===undefined;if(nx||ny)return nx&&ny?0:nx?1:-1;return TP_MENOR_MELHOR.has(col)?x-y:y-x});
    const formatos=[...new Set(todos.map(tpFormatoDe).filter(Boolean))];
    $('#tpPg').innerHTML=`<div class="tp-barra"><input type="search" class="control tp-busca" id="crQ" placeholder="Pesquisar criativo, título ou texto" value="${attr(f.texto)}" aria-label="Pesquisar">
     <select class="control" id="crSt" aria-label="Status"><option value="">Status: todos</option>${['ativos','pausados','analise','reprovados','problemas','arquivados'].map(k=>`<option value="${k}" ${f.status===k?'selected':''}>${TP_STATUS_ROT[k]}</option>`).join('')}</select>
     <select class="control" id="crFor" aria-label="Formato"><option value="">Formato: todos</option>${formatos.map(x=>`<option ${f.formato===x?'selected':''}>${esc(x)}</option>`).join('')}</select>
     <select class="control" id="crCa" aria-label="Campanha"><option value="">Campanha: todas</option>${d.campanhas.map(c=>`<option value="${attr(c.id)}" ${f.campanha===c.id?'selected':''}>${esc(c.nome)}</option>`).join('')}</select>
     <select class="control" id="crOrd" aria-label="Ordenar por">${TP_METS.map(([k,l])=>`<option value="${k}" ${f.ord===k?'selected':''}>Ordenar: ${l}</option>`).join('')}</select>
     <label class="check-row"><input type="checkbox" id="crAgr" ${TPC.agrupar?'checked':''}> Agrupar a mesma publicação</label><span class="cm-esp"></span>
     <button class="softbtn" id="crComp" ${TPC.sel.size>=2?'':'disabled'}>Comparar lado a lado (${TPC.sel.size})</button></div>
    ${itens.length?`<div class="cr-grade">${itens.map(x=>`<article class="cr-card ${TPC.sel.has(x.id)?'sel':''}"><div class="cr-mini">${x.foto?`<img alt="" loading="lazy" referrerpolicy="no-referrer" src="${attr(x.foto)}">`:'<span>sem miniatura</span>'}<span class="aq-tag">${esc(tpFormatoDe(x)||'Criativo')}</span>${TPC.agrupar&&x._n>1?`<span class="cr-n">${x._n} anúncios · ${x._campanhas.size} campanha(s)</span>`:''}</div>
      <div class="cr-corpo"><b title="${attr(x.nome)}">${esc(x.nome)}</b><small>${esc(x._pai||'')}</small><div>${gmBadge(x.estado)} ${tpPubIG(x)?`<a href="${attr(tpPubIG(x))}" target="_blank" rel="noopener">publicação</a>`:''}${x.conteudo?` <small>Conteúdo ${esc(x.conteudo.id)}</small>`:''}</div>
      <dl class="cr-m"><div><dt>Investimento</dt><dd>${esc(gmBrl(x.gasto))}</dd></div><div><dt>Alcance</dt><dd>${gmN(x.alcance)}</dd></div><div><dt>Impressões</dt><dd>${gmN(x.impressoes)}</dd></div><div><dt>Conversas</dt><dd>${gmN(x.conversas)}</dd></div><div><dt>Custo/resultado</dt><dd>${esc(gmMoeda(x.resultados?x.custoResultado:null))}</dd></div><div><dt>CTR</dt><dd>${x.impressoes?gmPct(x.ctr):'—'}</dd></div></dl>
      <div class="cr-ac"><label class="check-row"><input type="checkbox" data-cs="${attr(x.id)}" ${TPC.sel.has(x.id)?'checked':''}> Comparar</label><button class="softbtn" data-cp="${attr(x.id)}">Detalhes</button></div></div></article>`).join('')}</div>`:'<div class="empty-rich"><strong>Nenhum criativo com estes filtros</strong></div>'}
    <p class="kpi-note">${itens.length} criativo(s). Os identificadores da Meta são preservados: a mesma publicação usada em campanhas e públicos diferentes só é somada quando você marca "Agrupar".</p>`;
    $('#crQ').oninput=e=>{TPC.f.texto=e.target.value;clearTimeout(desenha.t);desenha.t=setTimeout(()=>{desenha();const i=$('#crQ');i.focus();i.setSelectionRange(i.value.length,i.value.length)},250)};
    $('#crSt').onchange=e=>{TPC.f.status=e.target.value;desenha()};$('#crFor').onchange=e=>{TPC.f.formato=e.target.value;desenha()};$('#crCa').onchange=e=>{TPC.f.campanha=e.target.value;desenha()};$('#crOrd').onchange=e=>{TPC.f.ord=e.target.value;desenha()};$('#crAgr').onchange=e=>{TPC.agrupar=e.target.checked;desenha()};
    $$('[data-cs]').forEach(i=>i.onchange=()=>{if(i.checked){if(TPC.sel.size>=4){i.checked=false;return toast('Compare até 4 criativos por vez','warn')}TPC.sel.add(i.dataset.cs)}else TPC.sel.delete(i.dataset.cs);desenha()});
    $$('[data-cp]').forEach(b=>b.onclick=()=>tpPainel(b.dataset.cp));
    $('#crComp').onclick=()=>{const it=[...TPC.sel].map(id=>tpFlat('anuncio').find(x=>x.id===id)).filter(Boolean);tpCompararLado(it)};
  };
  desenha();
};
/** Comparação lado a lado de anúncios/criativos: miniaturas e uma barra por métrica (só comparação numérica). */
function tpCompararLado(itens){
  if(itens.length<2)return;
  const o=adminOverlay(`<h3>Comparar criativos</h3><div class="cr-lado" style="grid-template-columns:repeat(${itens.length},minmax(0,1fr))">${itens.map(x=>`<div class="cr-l"><div class="cr-mini">${x.foto?`<img alt="" referrerpolicy="no-referrer" src="${attr(x.foto)}">`:'<span>sem miniatura</span>'}</div><b>${esc(x.nome)}</b><small>${esc(x._pai||'')}</small>${gmBadge(x.estado)}</div>`).join('')}</div>
   <div class="tp-comp">${['gasto','alcance','impressoes','cliques','ctr','conversas','custoConversa','resultados','custoResultado'].map(k=>`<section><h4>${esc(TP_COL[k].r)}${TP_MENOR_MELHOR.has(k)?' <small>(menor = mais barato)</small>':''}</h4><div data-g="${k}"></div></section>`).join('')}</div>
   <div class="actions"><span class="cm-esp"></span><button class="btn soft" data-close type="button">Fechar</button></div>`);
  o.el.querySelectorAll('[data-g]').forEach(b=>{const k=b.dataset.g;EvoCharts.barras(b,{itens:itens.map(x=>({nome:x.nome,v:tpMet(x,k)===undefined?null:tpMet(x,k),thumb:x.foto||''})),fmt:tpFmtMet[k],vazio:'Sem dado para este indicador.'})});
}

// ================= Públicos =================
TP_PAGINAS.tfpublicos=async function(){
  state.module=null;
  $('#content').innerHTML=tpCabecalho('Públicos','Públicos usados nos conjuntos de anúncios, por segmento escolar, com desempenho comparado.')+'<div id="tpPg"><div class="loading"><span></span><b>Lendo os conjuntos…</b></div></div>';
  tpPosCabecalho(()=>TP_PAGINAS.tfpublicos());
  const d=await tpCarregaOuErro('tfpublicos');if(!d)return;
  const salvos=await tpPrefGet('trafego.publicos.salvos',[]);
  const assinatura=x=>{const p=x.publico||{};return [`${p.idadeMin||'—'}-${p.idadeMax||'—'}`,(p.generos||[]).join('/')||'todos',(p.cidades||[]).map(c=>c.nome).sort().join(', ')||[...(p.regioes||[]),...(p.paises||[])].join(', ')||'sem local'].join(' | ')};
  const conj=tpFlat('conjunto').filter(x=>tpEstadoDe(x)!=='ARCHIVED');
  const mapa=new Map();
  conj.forEach(x=>{const k=assinatura(x);const e=mapa.get(k)||{k,txt:tpPublicoTxt(x.publico)||'Sem segmentação informada',seg:new Set(),conj:[],gasto:0,impressoes:0,cliques:0,conversas:0,alcance:0,resultados:0};const sg=tpSegDe(x);if(sg)e.seg.add(sg);e.conj.push(x);for(const m of ['gasto','impressoes','cliques','conversas','alcance','resultados'])e[m]+=Number(x[m])||0;mapa.set(k,e)});
  let linhas=[...mapa.values()].map(e=>({...e,ctr:e.impressoes?e.cliques/e.impressoes*100:null,custoConversa:e.conversas?e.gasto/e.conversas:null,custoResultado:e.resultados?e.gasto/e.resultados:null,segTxt:[...e.seg].join(', ')||'não identificado'}));
  const F={seg:'',q:'',ord:'gasto'};
  const desenha=()=>{
    let l=linhas.filter(e=>(!F.seg||e.segTxt.includes(F.seg))&&(!F.q||(e.txt+' '+e.conj.map(c=>c.nome).join(' ')).toLowerCase().includes(F.q.toLowerCase())));
    l=[...l].sort((a,b)=>{const x=a[F.ord],y=b[F.ord];const nx=x===null||x===undefined,ny=y===null||y===undefined;if(nx||ny)return nx&&ny?0:nx?1:-1;return F.ord==='custoConversa'||F.ord==='custoResultado'?x-y:y-x});
    $('#tpPg').innerHTML=`<div class="tp-barra"><select class="control" id="pbSeg" aria-label="Segmento escolar"><option value="">Segmento: todos</option>${TP_SEG.map(([s])=>`<option ${F.seg===s?'selected':''}>${esc(s)}</option>`).join('')}<option value="não identificado" ${F.seg==='não identificado'?'selected':''}>não identificado</option></select>
      <input type="search" class="control tp-busca" id="pbQ" placeholder="Localização, idade ou nome do conjunto" value="${attr(F.q)}" aria-label="Pesquisar">
      <select class="control" id="pbOrd" aria-label="Ordenar">${[['gasto','Investimento'],['conversas','Conversas'],['custoConversa','Custo por conversa'],['ctr','CTR'],['alcance','Alcance']].map(([k,r])=>`<option value="${k}" ${F.ord===k?'selected':''}>Ordenar: ${r}</option>`).join('')}</select><span class="cm-esp"></span><button class="softbtn" id="pbCustom">Públicos personalizados da conta</button></div>
     <div class="db-dois"><div class="db-bloco"><h3>Custo por conversa (públicos com conversas)</h3><div id="pbGr"></div></div><div class="db-bloco"><h3>Investimento por segmento escolar</h3><div id="pbSeg2"></div></div></div>
     <div class="tablewrap"><table class="datatable"><thead><tr><th>Público (idade · gênero · localização)</th><th>Segmento (pelo nome)</th><th>Conjuntos</th><th>Investimento</th><th>Alcance</th><th>CTR</th><th>Conversas</th><th>Custo/conversa</th><th></th></tr></thead><tbody>${l.map((e,i)=>`<tr><td><b>${esc(e.txt)}</b></td><td>${esc(e.segTxt)}</td><td><button class="tp-nl" data-pbd="${i}">${e.conj.length} conjunto(s)</button></td><td>${esc(gmBrl(e.gasto))}</td><td>${gmN(e.alcance)}</td><td>${e.ctr===null?'—':gmPct(e.ctr)}</td><td>${gmN(e.conversas)}</td><td>${esc(gmMoeda(e.custoConversa))}</td><td><button class="softbtn" data-pbs="${i}">Salvar como modelo</button></td></tr>`).join('')||'<tr><td colspan="9" class="empty compact">Nenhum público com estes filtros.</td></tr>'}</tbody></table></div>
     <section class="card" style="margin-top:12px"><div class="card-title"><div><small>MODELOS</small><h3>Públicos salvos</h3></div></div>${salvos.length?`<ul class="tp-lista">${salvos.map(s=>`<li><b>${esc(s.nome)}</b> <small>${esc(s.txt)}${s.seg?' · '+esc(s.seg):''}</small> <button class="softbtn" data-pdel="${attr(s.id)}">Remover</button></li>`).join('')}</ul>`:'<p class="kpi-note">Nenhum modelo salvo. Use "Salvar como modelo" em um público para reutilizar a descrição ao montar novas campanhas.</p>'}</section>
     <p class="kpi-note">Sobreposição entre públicos: a Meta só informa quando há dados suficientes e permissão; por isso não é estimada aqui. Públicos aqui são descrições de segmentação dos anúncios, nunca listas de pessoas.</p>`;
    const com=l.filter(e=>e.custoConversa!==null).slice(0,8);
    EvoCharts.barras($('#pbGr'),{itens:com.map(e=>({nome:e.txt,sub:e.segTxt,v:e.custoConversa})),fmt:v=>gmBrl(v),vazio:'Nenhum público teve conversas neste período.'});
    const porSeg=new Map();linhas.forEach(e=>{const k=e.segTxt;porSeg.set(k,(porSeg.get(k)||0)+e.gasto)});
    EvoCharts.barras($('#pbSeg2'),{itens:[...porSeg].map(([nome,v])=>({nome,v})).sort((a,b)=>b.v-a.v),fmt:v=>gmBrl(v),vazio:'Sem investimento no período.'});
    $('#pbSeg').onchange=e=>{F.seg=e.target.value;desenha()};$('#pbOrd').onchange=e=>{F.ord=e.target.value;desenha()};
    $('#pbQ').oninput=e=>{F.q=e.target.value;clearTimeout(desenha.t);desenha.t=setTimeout(()=>{desenha();const i=$('#pbQ');i.focus();i.setSelectionRange(i.value.length,i.value.length)},250)};
    $$('[data-pbd]').forEach(b=>b.onclick=()=>{const e=l[Number(b.dataset.pbd)];adminOverlay(`<h3>${esc(e.txt)}</h3><p class="kpi-note">Conjuntos que usam este público e as campanhas a que pertencem.</p><div class="tablewrap"><table class="datatable"><thead><tr><th>Conjunto</th><th>Campanha</th><th>Status</th><th>Investimento</th><th>Conversas</th></tr></thead><tbody>${e.conj.map(c=>`<tr><td>${esc(c.nome)}</td><td>${esc(c._pai)}</td><td>${gmBadge(c.estado)}</td><td>${esc(gmBrl(c.gasto))}</td><td>${gmN(c.conversas)}</td></tr>`).join('')}</tbody></table></div><div class="actions"><span class="cm-esp"></span><button class="btn soft" data-close>Fechar</button></div>`)});
    $$('[data-pbs]').forEach(b=>b.onclick=()=>{const e=l[Number(b.dataset.pbs)];const nome=prompt('Nome do modelo de público:',e.segTxt!=='não identificado'?e.segTxt:'');if(!nome)return;const nl=[...salvos,{id:'P'+Date.now().toString(36),nome:nome.slice(0,60),txt:e.txt,seg:e.segTxt==='não identificado'?'':e.segTxt}];salvos.length=0;salvos.push(...nl);tpPrefSet('trafego.publicos.salvos',nl);toast('Modelo salvo');desenha()});
    $$('[data-pdel]').forEach(b=>b.onclick=()=>{const nl=salvos.filter(s=>s.id!==b.dataset.pdel);salvos.length=0;salvos.push(...nl);tpPrefSet('trafego.publicos.salvos',nl);desenha()});
    $('#pbCustom').onclick=()=>tpPublicosMeta();
  };
  desenha();
};

// ================= Análises =================
const TPA={nivel:'campanha',ids:new Set(),met:'gasto',diaria:'gasto',comparar:false};
TP_PAGINAS.tfanalises=async function(){
  state.module=null;
  if(TP.analise){TPA.nivel=TP.analise.nivel;TPA.ids=new Set(TP.analise.ids);TP.analise=null}
  $('#content').innerHTML=tpCabecalho('Análises','Compare campanhas, conjuntos, anúncios, segmentos e períodos. Diagnósticos mostram o dado da Meta e, separadamente, a leitura do EVO MKT.')+'<div id="tpPg"><div class="loading"><span></span><b>Lendo a conta…</b></div></div>';
  tpPosCabecalho(()=>TP_PAGINAS.tfanalises());
  const d=await tpCarregaOuErro('tfanalises');if(!d)return;
  let anterior=null;
  const desenha=async()=>{
    const todos=tpFlat(TPA.nivel).filter(x=>tpEstadoDe(x)!=='ARCHIVED');
    const itens=[...TPA.ids].map(id=>todos.find(x=>x.id===id)).filter(Boolean);
    $('#tpPg').innerHTML=`<div class="tp-barra"><div class="view-switch" role="tablist">${TP_NIVEIS.map(([k,l])=>`<button type="button" data-an-n="${k}" class="${TPA.nivel===k?'active':''}">${l}</button>`).join('')}</div>
      <select class="control" id="anMet" aria-label="Métrica">${TP_METS.map(([k,l])=>`<option value="${k}" ${TPA.met===k?'selected':''}>${l}</option>`).join('')}</select>
      <label class="check-row"><input type="checkbox" id="anCmp" ${TPA.comparar?'checked':''}> Comparar com o período anterior</label><span class="cm-esp"></span>
      <details class="cm-maisfiltros"><summary>Escolher itens (${TPA.ids.size})</summary><div class="cm-maisfiltros-corpo tp-escolha">${todos.map(x=>`<label class="check-row"><input type="checkbox" data-an-i="${attr(x.id)}" ${TPA.ids.has(x.id)?'checked':''}> ${esc(x.nome)}<small> ${esc(gmBrl(x.gasto))}</small></label>`).join('')||'<small>Nenhum item.</small>'}<button class="softbtn" id="anTop">Escolher os 5 com maior investimento</button></div></details></div>
     ${itens.length>=1?`<div class="db-dois"><div class="db-bloco"><h3>Comparação: ${esc((TP_COL[TPA.met]||{}).r||TPA.met)}</h3><div id="anBar"></div></div><div class="db-bloco"><h3>Evolução por dia</h3><div class="tf-chips" id="anDm"></div><div id="anLin"><div class="loading"><span></span><b>Lendo as séries…</b></div></div></div></div>
      <div class="db-bloco" style="margin-top:12px"><h3>Quadro comparativo</h3><div class="tablewrap"><table class="datatable"><thead><tr><th>Item</th>${TP_METS.map(([k,l])=>`<th>${l}</th>`).join('')}</tr></thead><tbody>${itens.map(x=>`<tr><td><b>${esc(x.nome)}</b></td>${TP_METS.map(([k])=>{const v=tpMet(x,k);const a=TPA.comparar&&anterior?anterior.get(x.id):null;const av=a?tpMet(a,k):null;return `<td>${v===null||v===undefined?'—':esc(tpFmtMet[k](v))}${TPA.comparar&&av!==null&&av!==undefined&&av!==0&&v!==null?`<br><small class="db-var neutro">${v>=av?'▲':'▼'} ${Math.abs((v-av)/av*100).toFixed(0)}% vs. ${esc(tpFmtMet[k](av))}</small>`:TPA.comparar&&anterior?'<br><small class="db-var">sem base</small>':''}</td>`}).join('')}</tr>`).join('')}</tbody></table></div></div>
      <div class="db-dois" style="margin-top:12px"><div class="db-bloco"><h3>Distribuição do investimento</h3><div id="anDist"></div><h4 style="margin-top:12px">Por posicionamento (Meta)</h4><div id="anPos"><div class="loading"><span></span><b>Consultando…</b></div></div></div><div class="db-bloco"><h3>Diagnóstico</h3><div id="anDiag"></div></div></div>
      <div class="db-bloco" style="margin-top:12px"><h3>Antes e depois de alterações</h3><div id="anAD"><small class="kpi-note">Carregando o histórico…</small></div></div>`:'<div class="empty-rich"><strong>Escolha o que comparar</strong><p>Marque campanhas, conjuntos ou anúncios em "Escolher itens", ou selecione linhas no Gerenciador e use "Analisar".</p></div>'}`;
    $$('[data-an-n]').forEach(b=>b.onclick=async()=>{TPA.nivel=b.dataset.anN;TPA.ids.clear();anterior=null;if(TPA.comparar)await carregaAnterior();desenha()});
    $('#anMet').onchange=e=>{TPA.met=e.target.value;desenha()};
    $('#anCmp').onchange=async e=>{TPA.comparar=e.target.checked;if(TPA.comparar&&!anterior)await carregaAnterior();desenha()};
    $$('[data-an-i]').forEach(i=>i.onchange=()=>{if(i.checked){if(TPA.ids.size>=6){i.checked=false;return toast('Compare até 6 itens por vez','warn')}TPA.ids.add(i.dataset.anI)}else TPA.ids.delete(i.dataset.anI);desenha()});
    $('#anTop').onclick=e=>{e.preventDefault();TPA.ids=new Set([...todos].sort((a,b)=>b.gasto-a.gasto).slice(0,5).map(x=>x.id));desenha()};
    if(!itens.length)return;
    EvoCharts.barras($('#anBar'),{itens:itens.map(x=>({nome:x.nome,v:tpMet(x,TPA.met)===undefined?null:tpMet(x,TPA.met),thumb:x.foto||''})),fmt:tpFmtMet[TPA.met],vazio:'Sem dado deste indicador nos itens escolhidos.'});
    // distribuição por campanha / segmento
    const porSeg=new Map();itens.forEach(x=>{const k=tpSegDe(x)||'não identificado';porSeg.set(k,(porSeg.get(k)||0)+x.gasto)});
    $('#anDist').innerHTML='<div id="anD1"></div><h4>Por segmento escolar (pelo nome)</h4><div id="anD2"></div>';
    EvoCharts.barras($('#anD1'),{itens:itens.map(x=>({nome:x.nome,v:x.gasto})).sort((a,b)=>b.v-a.v),fmt:v=>gmBrl(v),vazio:'Sem investimento.'});
    EvoCharts.barras($('#anD2'),{itens:[...porSeg].map(([nome,v])=>({nome,v})).sort((a,b)=>b.v-a.v),fmt:v=>gmBrl(v),vazio:'Sem investimento.'});
    // diagnóstico: dado oficial x interpretação
    $('#anDiag').innerHTML=itens.map(x=>{const meta=[];meta.push(`Status na Meta: <b>${esc(x.estado||x.status)}</b>`);const ach=[];if(x.impressoes>=1000&&x.ctr<0.9)ach.push(`CTR de ${gmPct(x.ctr)} está baixo (referência: 0,90%).`);if(x.frequencia>3.5)ach.push(`Frequência de ${gmDec(x.frequencia)} está alta (referência: 3,5).`);if(x.gasto>0&&!x.resultados&&/LEADS|SALES|ENGAGEMENT/i.test(x.objetivo||x._objetivo||''))ach.push('Há investimento sem resultados no período.');if(/DISAPPROVED|WITH_ISSUES/i.test(tpEstadoDe(x)))ach.push('A Meta informa problema de aprovação ou entrega.');
      return `<div class="an-dg"><b>${esc(x.nome)}</b><div class="an-of"><small>DADO DA META</small><p>${meta.join(' · ')}</p></div><div class="an-in"><small>LEITURA DO EVO MKT (referências configuráveis, não são causa comprovada)</small>${ach.length?`<ul>${ach.map(a=>`<li>${esc(a)}</li>`).join('')}</ul>`:'<p>Nenhum ponto de atenção pelas referências atuais.</p>'}</div></div>`}).join('');
    // posicionamentos (Meta)
    try{const q=await api(`/ads/quebra?por=${encodeURIComponent('publisher_platform,platform_position')}&de=${gmDados.de}&ate=${gmDados.ate}`);EvoCharts.barras($('#anPos'),{itens:q.rows.slice(0,8).map(r=>({nome:r.chave,v:r.gasto,sub:r.conversas?`${gmN(r.conversas)} conversas`:''})),fmt:v=>gmBrl(v),vazio:'A Meta não devolveu posicionamentos neste período.'})}catch(e){$('#anPos').innerHTML=`<small class="kpi-note">Indisponível: ${esc(e.message)}</small>`}
    // séries diárias
    const dm=[['gasto','Investimento'],['conversas','Conversas'],['cliques','Cliques'],['impressoes','Impressões']];
    $('#anDm').innerHTML=dm.map(([k,l])=>`<button type="button" class="tf-chip ${TPA.diaria===k?'on':''}" data-dm="${k}">${l}</button>`).join('');$$('[data-dm]').forEach(b=>b.onclick=()=>{TPA.diaria=b.dataset.dm;desenha()});
    let hist=[];try{hist=(await api('/ads/acoes')).rows||[]}catch{}
    const series=[];
    for(const x of itens){try{series.push({x,rows:(await api(`/ads/serie?id=${encodeURIComponent(x.id)}&de=${gmDados.de}&ate=${gmDados.ate}`)).rows})}catch{series.push({x,rows:null})}}
    const dias=[...new Set(series.flatMap(s=>(s.rows||[]).map(r=>r.dia)))].sort();
    if(!dias.length)$('#anLin').innerHTML='<div class="ch-vazio">A Meta não devolveu dias com entrega para os itens escolhidos.</div>';
    else EvoCharts.linha($('#anLin'),{dados:dias.map(dia=>{const o={x:dia};series.forEach((s,i)=>{const r=(s.rows||[]).find(z=>z.dia===dia);o['s'+i]=r?r[TPA.diaria]:null});return o}),series:series.map((s,i)=>({k:'s'+i,nome:s.x.nome,fmt:TPA.diaria==='gasto'?v=>gmBrl(v):gmN})),altura:230,marcadores:hist.filter(h=>itens.some(x=>x.id===h.objeto_id)&&dias.includes(String(h.quando).slice(0,10))).slice(0,6).map(h=>({x:String(h.quando).slice(0,10),rotulo:'alteração'})),rotuloAcessivel:'Evolução diária dos itens escolhidos'});
    // antes e depois
    const alt=hist.filter(h=>itens.some(x=>x.id===h.objeto_id)&&h.resultado==='OK').slice(0,6);
    $('#anAD').innerHTML=alt.length?`<div class="tablewrap"><table class="datatable"><thead><tr><th>Quando</th><th>Item</th><th>Alteração</th><th>7 dias antes</th><th>7 dias depois</th></tr></thead><tbody>${alt.map(h=>{const s=series.find(z=>z.x.id===h.objeto_id);const dia=String(h.quando).slice(0,10);const soma=(a,b)=>(s&&s.rows?s.rows.filter(r=>r.dia>=a&&r.dia<=b).reduce((t,r)=>t+r[TPA.diaria==='gasto'?'gasto':TPA.diaria],0):null);const add=n=>{const t=new Date(dia+'T12:00:00');t.setDate(t.getDate()+n);return tpIso(t)};const antes=soma(add(-7),add(-1)),depois=soma(dia,add(6));const f=TPA.diaria==='gasto'?v=>gmBrl(v):gmN;return `<tr><td>${esc(fmtDateTime(h.quando))}</td><td>${esc(h.nome)}</td><td>${esc(h.acao)}</td><td>${antes===null?'—':esc(f(antes))}</td><td>${depois===null?'—':esc(f(depois))}</td></tr>`}).join('')}</tbody></table></div><p class="kpi-note">Soma de ${esc(({gasto:'investimento',conversas:'conversas',cliques:'cliques',impressoes:'impressões'})[TPA.diaria])} nos 7 dias antes e nos 7 dias depois de cada alteração feita pelo EVO MKT. Mostra o que aconteceu ao lado da alteração; não prova que ela causou a mudança (sazonalidade, orçamento e outros fatores também contam).</p>`:'<small class="kpi-note">Nenhuma alteração feita pelo EVO MKT nos itens escolhidos.</small>';
  };
  async function carregaAnterior(){
    const {de,ate}=tpPeriodo();const n=Math.round((new Date(ate+'T12:00:00')-new Date(de+'T12:00:00'))/86400000)+1;const ad=new Date(de+'T12:00:00');ad.setDate(ad.getDate()-1);const ai=new Date(ad);ai.setDate(ai.getDate()-(n-1));
    try{const t=await api(`/ads/arvore?de=${tpIso(ai)}&ate=${tpIso(ad)}&arquivados=1`);anterior=new Map(tpFlat(TPA.nivel,t).map(x=>[x.id,x]))}catch(e){toast('Não foi possível ler o período anterior: '+e.message,'warn');anterior=new Map()}
  }
  if(TPA.comparar)await carregaAnterior();
  desenha();
};

// ================= Públicos personalizados da Meta (listar, criar, renomear, excluir) =================
const TP_PUB_TIPO={CUSTOM:'Lista de contatos',WEBSITE:'Visitantes do site',ENGAGEMENT:'Interação (Instagram/Facebook)',LOOKALIKE:'Semelhante',APP:'Aplicativo',OFFLINE_CONVERSION:'Conversões offline'};
async function tpPublicosMeta(){
  const o=adminOverlay('<h3>Públicos personalizados e semelhantes</h3><div id="pcBody"><div class="loading"><span></span><b>Consultando a Meta…</b></div></div><div class="actions"><button class="btn" id="pcNovo" type="button">+ Novo público</button><span class="cm-esp"></span><button class="btn soft" data-close>Fechar</button></div>');
  o.el.querySelector('.admin-box').classList.add('st-box');
  const corpo=o.el.querySelector('#pcBody');let rows=[];
  const lista=async()=>{
    corpo.innerHTML='<div class="loading"><span></span><b>Consultando a Meta…</b></div>';
    try{rows=(await api('/ads/publicos')).rows}catch(e){corpo.innerHTML=`<p class="int-warn">A Meta não liberou a leitura de públicos para este acesso: ${esc(e.message)}</p>`;return}
    corpo.innerHTML=rows.length?`<div class="tablewrap"><table class="datatable"><thead><tr><th>Nome</th><th>Tipo</th><th>Tamanho aproximado</th><th>Status</th>${adsCompleto?'<th></th>':''}</tr></thead><tbody>${rows.map(a=>`<tr><td>${esc(a.nome)}<br><small>${esc(a.id)}</small></td><td>${esc(TP_PUB_TIPO[a.tipo]||a.tipo)}</td><td>${a.minimo!==null?`${gmN(a.minimo)}${a.maximo?' a '+gmN(a.maximo):''}`:'—'}</td><td>${esc(a.status||'—')}</td>${adsCompleto?`<td><button class="softbtn" data-pren="${attr(a.id)}">Renomear</button> <button class="softbtn" data-pexc="${attr(a.id)}">Excluir</button></td>`:''}</tr>`).join('')}</tbody></table></div><p class="kpi-note">Só nome, tipo e tamanho aproximado: nenhuma pessoa ou contato é listado.</p>`:'<p>A conta não tem públicos personalizados ou semelhantes.</p>';
    corpo.querySelectorAll('[data-pren]').forEach(b=>b.onclick=async()=>{const a=rows.find(x=>x.id===b.dataset.pren);const n=prompt('Novo nome:',a.nome);if(!n)return;try{await gmPost('/ads/publicos/editar',{id:a.id,nome:n});toast('Público renomeado na Meta');lista()}catch(e){toast(e.message,'bad')}});
    corpo.querySelectorAll('[data-pexc]').forEach(b=>b.onclick=async()=>{const a=rows.find(x=>x.id===b.dataset.pexc);if(!confirm(`Excluir o público "${a.nome}" na Meta? Conjuntos que o usam podem parar de entregar.`))return;try{await gmPost('/ads/publicos/excluir',{id:a.id,confirmou:true});toast('Público excluído');lista()}catch(e){toast(e.message,'bad')}});
  };
  const nb=o.el.querySelector('#pcNovo');
  if(!adsCompleto)nb.outerHTML='<small class="kpi-note">Para criar ou editar públicos, ligue o modo completo do Tráfego.</small>';
  else nb.onclick=()=>tpNovoPublico(rows,lista);
  lista();
}
async function tpNovoPublico(rows,depois){
  const op=await criOpcoes();
  const o=adminOverlay(`<h3>Novo público</h3><form id="npForm" class="cm-form cri-form" novalidate>
   ${criLbl('Tipo *',criSel('npTipo',[['CONTATOS','Lista de contatos (e-mails e telefones)'],['SITE','Visitantes do site (pixel)'],['INSTAGRAM','Quem interagiu com o Instagram'],['SEMELHANTE','Semelhante a um público']],'','Escolha…'))}
   ${criLbl('Nome *','<input class="control" id="npNome" maxlength="100" autocomplete="off">')}
   <div id="npExtra"></div><div id="npMsg" class="cri-rev" aria-live="polite"></div>
   <div class="tp-ff-acoes"><button class="softbtn" type="button" data-close>Cancelar</button><button class="btn" type="submit">Criar público</button></div></form>`);
  const f=o.el,g=id=>{const e=f.querySelector('#'+id);return e?e.value:''};
  f.querySelector('#npTipo').onchange=()=>{const t=g('npTipo');f.querySelector('#npExtra').innerHTML=
    t==='CONTATOS'?criLbl('Contatos *','<textarea class="control" id="npCont" rows="6" placeholder="Um e-mail ou telefone por linha"></textarea>','Os dados são embaralhados (SHA-256) aqui no servidor antes de ir à Meta e não ficam guardados no sistema.')+`<label class="check-row"><input type="checkbox" id="npAut"> Confirmo que essas pessoas autorizaram receber comunicação do Colégio (LGPD).</label>`
    :t==='SITE'?criLbl('Pixel *',criSel('npPix',(op.pixels||[]).map(x=>[x.id,x.nome]),'','Escolha…'))+criLbl('Últimos dias (1 a 180)','<input class="control" id="npDias" type="number" min="1" max="180" value="30">')+criLbl('Endereço contém (opcional)','<input class="control" id="npUrl" placeholder="/matriculas">')
    :t==='INSTAGRAM'?criLbl('Últimos dias (1 a 365)','<input class="control" id="npDias" type="number" min="1" max="365" value="90">','Pessoas que visitaram o perfil, curtiram, comentaram, salvaram ou mandaram mensagem.')
    :t==='SEMELHANTE'?criLbl('Público de origem *',criSel('npOri',rows.filter(r=>r.tipo!=='LOOKALIKE').map(r=>[r.id,r.nome]),'','Escolha…'))+criLbl('Semelhança (1% = mais parecido, 10% = mais amplo)','<input class="control" id="npPct" type="number" min="1" max="10" value="1">'):''};
  f.querySelector('#npForm').onsubmit=async e=>{e.preventDefault();const t=g('npTipo'),msg=f.querySelector('#npMsg');msg.textContent='';
    if(!t){msg.textContent='Escolha o tipo.';return}
    const b={tipo:t,nome:g('npNome'),confirmou:true};
    if(t==='CONTATOS'){b.contatos=g('npCont');b.autorizacao=!!f.querySelector('#npAut').checked}
    if(t==='SITE'){b.pixelId=g('npPix');b.dias=Number(g('npDias'));b.url=g('npUrl')}
    if(t==='INSTAGRAM'){b.dias=Number(g('npDias'))}
    if(t==='SEMELHANTE'){b.origemId=g('npOri');b.percentual=Number(g('npPct'))}
    const bt=f.querySelector('button[type=submit]');bt.disabled=true;
    try{const r=await gmPost('/ads/publicos/criar',b);o.close();toast(r.enviados?`Público criado com ${r.enviados} contato(s)${r.ignorados?` (${r.ignorados} ignorado(s) por formato inválido)`:''}`:'Público criado na Meta');depois()}catch(x){bt.disabled=false;msg.innerHTML=`<div class="cri-msg err">${esc(x.message)}</div>`}};
}

// ================= Testes A/B =================
TP_PAGINAS.tftestes=async function(){
  state.module=null;
  $('#content').innerHTML=tpCabecalho('Testes A/B','Compare públicos, posicionamentos ou criativos com divisão controlada pela Meta.','<button class="btn" id="ttNovo" type="button">+ Novo teste</button>')+'<div id="tpPg"><div class="loading"><span></span><b>Consultando a Meta…</b></div></div>';
  tpPosCabecalho(()=>TP_PAGINAS.tftestes());
  const d=await tpCarregaOuErro('tftestes');if(!d)return;
  let rows=[],erro='';
  try{rows=(await api('/ads/testes')).rows}catch(e){erro=e.message}
  const SIT={Agendado:'warn','Em andamento':'ok',Encerrado:''};
  $('#tpPg').innerHTML=erro?`<div class="empty-rich"><strong>Não foi possível ler os testes</strong><p>${esc(erro)}</p></div>`
   :rows.length?`<div class="tablewrap"><table class="datatable"><thead><tr><th>Teste</th><th>Situação</th><th>Período</th><th>Versões comparadas</th></tr></thead><tbody>${rows.map(t=>`<tr><td><b>${esc(t.nome)}</b>${t.descricao?`<br><small>${esc(t.descricao)}</small>`:''}</td><td><span class="badge ${SIT[t.situacao]||''}">${esc(t.situacao)}</span></td><td>${t.inicio?esc(fmtDate(t.inicio.slice(0,10))):'—'} a ${t.fim?esc(fmtDate(t.fim.slice(0,10))):'—'}</td><td>${t.celulas.map(c=>`<div>${esc(c.nome)} <small>(${c.percentual}%)</small></div>`).join('')}</td></tr>`).join('')}</tbody></table></div><p class="kpi-note">O resultado do teste (qual versão venceu) é calculado pela Meta e aparece no Gerenciador de Anúncios deles quando o teste termina.</p>`
   :'<div class="empty-rich"><strong>Nenhum teste A/B ainda</strong><p>Crie um para comparar dois conjuntos de anúncios (por exemplo, dois públicos) com a mesma verba.</p></div>';
  $('#ttNovo').onclick=()=>{if(!adsCompleto)return toast('Ligue o modo completo do Tráfego para criar testes.','warn');tpNovoTeste(()=>TP_PAGINAS.tftestes())};
};
function tpNovoTeste(depois){
  const conj=tpFlat('conjunto').filter(x=>tpEstadoDe(x)!=='ARCHIVED'),camp=gmDados.campanhas.filter(x=>tpEstadoDe(x)!=='ARCHIVED');
  const est={nivel:'conjunto',ids:new Set(),ini:'',fim:''};
  const o=adminOverlay(`<h3>Novo teste A/B</h3><form id="ttForm" class="cm-form cri-form" novalidate>
    ${criLbl('Nome *','<input class="control" id="ttNome" maxlength="100" autocomplete="off" placeholder="Ex.: Público amplo × interesses">')}
    ${criLbl('O que comparar',criSel('ttNivel',[['conjunto','Conjuntos de anúncios'],['campanha','Campanhas']],'conjunto'))}
    <div class="cri-c"><span>Escolha de 2 a 5 itens *</span><div id="ttLista" class="cri-plat" style="max-height:220px;overflow:auto"></div><small class="kpi-note">A Meta divide o público entre as versões sem sobreposição, para o resultado ser justo.</small></div>
    ${criLbl('Descrição (a hipótese)','<input class="control" id="ttDesc" maxlength="500" placeholder="Ex.: Interesses trazem conversas mais baratas">')}
    ${criLbl('Período *','<button type="button" class="control cm-rng" id="ttPer">📅 Escolher o primeiro e o último dia</button>','De 1 a 30 dias, começando amanhã ou depois.')}
    <div id="ttMsg" class="cri-rev" aria-live="polite"></div>
    <div class="tp-ff-acoes"><button class="softbtn" type="button" data-close>Cancelar</button><button class="btn" type="submit">Criar teste</button></div></form>`);
  const f=o.el,g=id=>f.querySelector('#'+id).value;
  const lista=()=>{const l=est.nivel==='campanha'?camp:conj;f.querySelector('#ttLista').innerHTML=l.map(x=>`<label class="check-row"><input type="checkbox" data-tt="${attr(x.id)}" ${est.ids.has(x.id)?'checked':''}><span>${esc(x.nome)}</span></label>`).join('')||'<small class="kpi-note">Nada disponível.</small>';
    f.querySelectorAll('[data-tt]').forEach(c=>c.onchange=()=>{c.checked?est.ids.add(c.dataset.tt):est.ids.delete(c.dataset.tt)})};
  lista();f.querySelector('#ttNivel').onchange=e=>{est.nivel=e.target.value;est.ids.clear();lista()};
  f.querySelector('#ttPer').onclick=()=>PeriodoPicker.abrir({de:est.ini,ate:est.fim,titulo:'Período do teste',max:'2099-12-31'},(a,b)=>{est.ini=a;est.fim=b;f.querySelector('#ttPer').textContent=`📅 ${fmtDate(a)} a ${fmtDate(b)}`});
  f.querySelector('#ttForm').onsubmit=async e=>{e.preventDefault();const msg=f.querySelector('#ttMsg');msg.textContent='';
    if(!est.ini||!est.fim){msg.textContent='Escolha o período.';return}
    const bt=f.querySelector('button[type=submit]');bt.disabled=true;
    try{await gmPost('/ads/testes/criar',{nome:g('ttNome'),nivel:est.nivel,ids:[...est.ids],descricao:g('ttDesc'),inicio:est.ini+'T00:00',fim:est.fim+'T23:59',confirmou:true});o.close();toast('Teste criado na Meta');depois()}catch(x){bt.disabled=false;msg.innerHTML=`<div class="cri-msg err">${esc(x.message)}</div>`}};
}

// ================= Pixel e catálogos (só leitura) =================
TP_PAGINAS.tfeventos=async function(){
  state.module=null;
  $('#content').innerHTML=tpCabecalho('Pixel e catálogos','O que o pixel está recebendo e os catálogos da conta. Só leitura: a configuração continua no Gerenciador de Eventos da Meta.')+'<div id="tpPg"><div class="loading"><span></span><b>Consultando a Meta…</b></div></div>';
  tpPosCabecalho(()=>TP_PAGINAS.tfeventos());
  let d;try{d=await api('/ads/eventos')}catch(e){$('#tpPg').innerHTML=`<div class="empty-rich"><strong>Não foi possível ler</strong><p>${esc(e.message)}</p></div>`;return}
  const op=await criOpcoes();
  $('#tpPg').innerHTML=`<section class="card"><div class="card-title"><div><small>PIXEL</small><h3>Eventos dos últimos 7 dias</h3></div></div>${d.pixels.length?d.pixels.map(p=>`<div class="notif"><div><b>${esc(p.nome)}</b> <small>${esc(p.id)}</small><br><small>${p.indisponivel?'<span class="badge bad">indisponível</span> ':''}Último disparo: ${p.ultimoDisparo?esc(fmtDateTime(p.ultimoDisparo)):'nunca'}</small></div><div>${p.eventos.length?p.eventos.map(e=>`<span class="tp-chip">${esc(e.nome)} <b>${gmN(e.total)}</b></span>`).join(' '):'<small class="kpi-note">Nenhum evento recebido nos últimos 7 dias.</small>'}</div></div>`).join(''):'<p class="kpi-note">A conta não tem pixel.</p>'}</section>
   <section class="card" style="margin-top:12px"><div class="card-title"><div><small>CATÁLOGOS</small><h3>Catálogos de produtos</h3></div></div>${d.catalogos.length?`<div class="tablewrap"><table class="datatable"><thead><tr><th>Catálogo</th><th>Tipo</th><th>Produtos</th></tr></thead><tbody>${d.catalogos.map(c=>`<tr><td>${esc(c.nome)}<br><small>${esc(c.id)}</small></td><td>${esc(c.tipo||'—')}</td><td>${c.produtos!==null?gmN(c.produtos):'—'}</td></tr>`).join('')}</tbody></table></div>`:`<p class="kpi-note">${esc((d.aviso||[])[0]||'Nenhum catálogo na conta.')}</p>`}</section>
   <section class="card" style="margin-top:12px"><div class="card-title"><div><small>FORMULÁRIOS</small><h3>Formulários instantâneos</h3></div></div>${(op.formularios||[]).length?`<ul class="tp-lista">${op.formularios.map(x=>`<li><b>${esc(x.nome)}</b> <small>${esc(x.id)}</small></li>`).join('')}</ul>`:'<p class="kpi-note">Nenhum formulário instantâneo encontrado.</p>'}</section>`;
};
