/* Gerenciador de Anúncios (Tráfego Pago): tabela profissional com Campanhas → Conjuntos → Anúncios.
   Filtros combináveis (com favoritos), colunas personalizáveis (mostrar, ocultar, reordenar, fixar, redimensionar, modelos e visões salvas por usuário e nível),
   seleção múltipla com revisão em lote, painel lateral de detalhes, exportação CSV/Excel/PDF das colunas escolhidas.
   Reaproveita os editores, a criação de campanha e as rotas que já existiam (gerenciador.js); nada é alterado na Meta sem confirmação. */
const GM2={nivel:null,filtro:{},cfg:null,ordem:{k:'gasto',d:-1},sel:new Set(),favoritos:null,foco:{campanha:'',conjunto:''},lista:[]};
const TP_NIVEIS=[['campanha','Campanhas'],['conjunto','Conjuntos de anúncios'],['anuncio','Anúncios']];
const tpOrcVal=x=>x.orcamento?(x.orcamento.diario??x.orcamento.total??null):null;
const tpPublicoTxt=p=>{if(!p)return '';const o=[];if(p.idadeMin||p.idadeMax)o.push(`${p.idadeMin||'—'}–${p.idadeMax||'—'} anos`);if((p.generos||[]).length)o.push(p.generos.join('/'));const loc=[...(p.cidades||[]).map(c=>c.nome+(c.raioKm?` +${c.raioKm}km`:'')),...(p.regioes||[]),...(p.paises||[])];if(loc.length)o.push(loc.join(', '));return o.join(' · ')};
const tpPubDe=x=>x._nivel==='conjunto'?x.publico:x._nivel==='anuncio'?x._publico:null;
const tpFormatoDe=x=>(x.criativo&&x.criativo.formato)||'';
const tpPubIG=x=>(x.criativo&&x.criativo.instagram)||'';
const TP_DT=v=>{const d=String(v||'').slice(0,10);return /^\d{4}-\d\d-\d\d$/.test(d)?fmtDate(d):'—'};
/* Catálogo de colunas: v = valor (ordenar, filtrar, exportar); h = HTML da célula; niveis = onde faz sentido. */
const TP_TODOS=['campanha','conjunto','anuncio'];
const TP_COLS=[
 {k:'nome',r:'Nome',g:'Identificação',w:300,niveis:TP_TODOS,v:x=>x.nome,h:(x,n)=>`<span class="tp-nm">${x.foto?`<img class="gm-foto" alt="" loading="lazy" referrerpolicy="no-referrer" src="${attr(x.foto)}">`:''}<span><button type="button" class="tp-nl" data-painel="${attr(x.id)}" title="Abrir detalhes"><b>${esc(x.nome)}</b></button>${n!=='anuncio'?` <a href="#" class="tp-dr" data-gf="${n}:${attr(x.id)}" title="Ver ${n==='campanha'?'os conjuntos':'os anúncios'} desta ${n==='campanha'?'campanha':'conjunto'}">${n==='campanha'?'conjuntos ›':'anúncios ›'}</a>`:''}<small>${esc(x.codigo||'')} · ${esc(x.id)}</small></span></span>`},
 {k:'ligado',r:'Ligado',g:'Entrega',w:80,niveis:TP_TODOS,v:x=>x.status==='ACTIVE'?1:0,h:x=>adsCompleto?`<label class="gm-sw" title="${x.status==='ACTIVE'?'Pausar':'Ativar'}"><input type="checkbox" data-sw="${attr(x.id)}" ${x.status==='ACTIVE'?'checked':''} ${x.status==='ARCHIVED'||x.status==='DELETED'?'disabled':''}><i></i></label>`:`<span class="badge ${x.status==='ACTIVE'?'ok':''}">${x.status==='ACTIVE'?'Ligado':'Desligado'}</span>`},
 {k:'estado',r:'Status',g:'Entrega',w:130,niveis:TP_TODOS,v:x=>gmPeso(x.estado||x.status),h:x=>gmBadge(x.estado)},
 {k:'origem',r:'Origem',g:'Entrega',w:90,niveis:TP_TODOS,v:x=>x.origem||'',h:x=>esc(x.origem||'—')},
 {k:'objetivo',r:'Objetivo',g:'Identificação',w:150,niveis:TP_TODOS,v:x=>GM_OBJ[x.objetivo||x._objetivo]||x.objetivo||x._objetivo||'',h:x=>esc(GM_OBJ[x.objetivo||x._objetivo]||x.objetivo||x._objetivo||'—')},
 {k:'pai',r:'Campanha › Conjunto',g:'Identificação',w:220,niveis:['conjunto','anuncio'],v:x=>x._pai,h:x=>`<small>${esc(x._pai)}</small>`},
 {k:'id',r:'ID na Meta',g:'Identificação',w:150,niveis:TP_TODOS,v:x=>x.id,h:x=>`<code>${esc(x.id)}</code>`},
 {k:'codigo',r:'Código EVO',g:'Identificação',w:100,niveis:TP_TODOS,v:x=>x.codigo||'',h:x=>esc(x.codigo||'—')},
 {k:'segmento',r:'Segmento escolar',g:'Identificação',w:170,niveis:TP_TODOS,v:x=>tpSegDe(x),h:x=>{const s=tpSegDe(x);return s?`<span title="Identificado pelo nome">${esc(s)}</span>`:'<small>não identificado</small>'}},
 {k:'criado',r:'Criação',g:'Datas',w:110,niveis:TP_TODOS,v:x=>String(x.criado||''),h:x=>esc(TP_DT(x.criado))},
 {k:'inicio',r:'Início',g:'Datas',w:110,niveis:TP_TODOS,v:x=>gmInicioDe(x)||'9999',h:x=>esc(gmInicioTxt(x))},
 {k:'fim',r:'Término',g:'Datas',w:110,niveis:['campanha','conjunto'],v:x=>String(x.fim||''),h:x=>esc(TP_DT(x.fim))},
 {k:'atualizado',r:'Última alteração',g:'Datas',w:120,niveis:TP_TODOS,v:x=>String(x.atualizado||''),h:x=>esc(TP_DT(x.atualizado))},
 {k:'orcamento',r:'Orçamento',g:'Orçamento',w:130,niveis:['campanha','conjunto'],v:x=>tpOrcVal(x),h:x=>gmOrc(x.orcamento),exp:x=>x.orcamento?(x.orcamento.diario?`${x.orcamento.diario}/dia`:x.orcamento.total?`${x.orcamento.total} total`:'da campanha'):''},
 {k:'gasto',r:'Investimento',g:'Desempenho',w:120,niveis:TP_TODOS,num:1,soma:1,v:x=>x.gasto,h:x=>esc(gmBrl(x.gasto))},
 {k:'impressoes',r:'Impressões',g:'Desempenho',w:110,niveis:TP_TODOS,num:1,soma:1,v:x=>x.impressoes,h:x=>gmN(x.impressoes)},
 {k:'alcance',r:'Alcance',g:'Desempenho',w:100,niveis:TP_TODOS,num:1,v:x=>x.alcance,h:x=>gmN(x.alcance)},
 {k:'frequencia',r:'Frequência',g:'Desempenho',w:100,niveis:TP_TODOS,num:1,v:x=>x.frequencia,h:x=>gmDec(x.frequencia)},
 {k:'cliques',r:'Cliques',g:'Desempenho',w:90,niveis:TP_TODOS,num:1,soma:1,v:x=>x.cliques,h:x=>gmN(x.cliques)},
 {k:'ctr',r:'CTR',g:'Desempenho',w:80,niveis:TP_TODOS,num:1,v:x=>x.ctr,h:x=>x.impressoes?gmPct(x.ctr):'—'},
 {k:'cpc',r:'CPC',g:'Desempenho',w:90,niveis:TP_TODOS,num:1,v:x=>x.cliques?x.cpc:null,h:x=>x.cliques?esc(gmBrl(x.cpc)):'—'},
 {k:'cpm',r:'CPM',g:'Desempenho',w:90,niveis:TP_TODOS,num:1,v:x=>x.impressoes?x.cpm:null,h:x=>x.impressoes?esc(gmBrl(x.cpm)):'—'},
 {k:'conversas',r:'Conversas iniciadas',g:'Conversas',w:120,niveis:TP_TODOS,num:1,soma:1,v:x=>x.conversas,h:x=>gmN(x.conversas)},
 {k:'custoConversa',r:'Custo por conversa',g:'Conversas',w:130,niveis:TP_TODOS,num:1,v:x=>x.conversas?x.custoConversa:null,h:x=>esc(gmMoeda(x.conversas?x.custoConversa:null))},
 {k:'leads',r:'Leads (Meta)',g:'Conversas',w:100,niveis:TP_TODOS,num:1,soma:1,v:x=>x.leads,h:x=>gmN(x.leads)},
 {k:'cpl',r:'Custo por lead',g:'Conversas',w:110,niveis:TP_TODOS,num:1,v:x=>x.leads?x.cpl:null,h:x=>esc(gmMoeda(x.leads?x.cpl:null))},
 {k:'resultados',r:'Resultados',g:'Resultados',w:130,niveis:TP_TODOS,num:1,soma:1,v:x=>x.resultados,h:x=>`${gmN(x.resultados)}<small> ${esc(x.rotuloResultado||'')}</small>`,exp:x=>`${x.resultados}${x.rotuloResultado?' '+x.rotuloResultado:''}`},
 {k:'custoResultado',r:'Custo por resultado',g:'Resultados',w:130,niveis:TP_TODOS,num:1,v:x=>x.resultados?x.custoResultado:null,h:x=>esc(gmMoeda(x.resultados?x.custoResultado:null))},
 {k:'criativo',r:'Criativo',g:'Criativo',w:110,niveis:['anuncio'],v:x=>x.foto?1:0,h:x=>x.foto?`<img class="gm-foto tp-mini" alt="" loading="lazy" referrerpolicy="no-referrer" src="${attr(x.foto)}">`:'<small>sem miniatura</small>',exp:x=>x.foto||''},
 {k:'formato',r:'Formato do criativo',g:'Criativo',w:110,niveis:['anuncio'],v:x=>tpFormatoDe(x),h:x=>esc(tpFormatoDe(x)||'—')},
 {k:'publicacao',r:'Publicação do Instagram',g:'Criativo',w:150,niveis:['anuncio'],v:x=>tpPubIG(x),h:x=>tpPubIG(x)?`<a href="${attr(tpPubIG(x))}" target="_blank" rel="noopener">abrir</a>`:'—'},
 {k:'publico',r:'Público',g:'Público',w:250,niveis:['conjunto','anuncio'],v:x=>tpPublicoTxt(tpPubDe(x)),h:x=>`<small>${esc(tpPublicoTxt(tpPubDe(x))||'—')}</small>`},
 {k:'posicionamentos',r:'Posicionamentos',g:'Público',w:200,niveis:['conjunto','anuncio'],v:x=>{const p=tpPubDe(x)||{};return [...(p.plataformas||[]),...(p.posicionamentos||[])].join(', ')},h:x=>{const p=tpPubDe(x)||{},t=[...(p.plataformas||[]),...(p.posicionamentos||[])].join(', ');return `<small>${esc(t||'Automáticos')}</small>`}},
];
const TP_COL=Object.fromEntries(TP_COLS.map(c=>[c.k,c]));
const TP_MODELOS={padrao:['nome','ligado','estado','orcamento','gasto','conversas','custoConversa','resultados','custoResultado','ctr','cpc'],desempenho:['nome','estado','gasto','impressoes','alcance','frequencia','cliques','ctr','cpc','cpm'],conversas:['nome','estado','gasto','conversas','custoConversa','leads','cpl','resultados','custoResultado'],investimento:['nome','estado','orcamento','gasto','criado','inicio','fim','origem'],entrega:['nome','ligado','estado','objetivo','inicio','fim','atualizado','impressoes','alcance','frequencia'],criativos:['nome','estado','criativo','formato','publicacao','gasto','cliques','ctr','conversas']};
const TP_MODELO_ROT={padrao:'Padrão',desempenho:'Desempenho',conversas:'Conversas',investimento:'Investimento',entrega:'Entrega',criativos:'Criativos',personalizado:'Personalizado'};
const colsDoNivel=n=>TP_COLS.filter(c=>c.niveis.includes(n));
function tpCfgPadrao(){const c={};for(const [n] of TP_NIVEIS)c[n]={modelo:'padrao',cols:TP_MODELOS.padrao.filter(k=>TP_COL[k].niveis.includes(n)),larg:{},fixas:['nome']};return {nivel:c,visoes:{campanha:[],conjunto:[],anuncio:[]},padrao:{}}}
async function tpCfgCarrega(){if(!GM2.cfg){const s=await tpPrefGet('trafego.gm',null);const p=tpCfgPadrao();GM2.cfg=s?{nivel:{...p.nivel,...(s.nivel||{})},visoes:{...p.visoes,...(s.visoes||{})},padrao:s.padrao||{}}:p}if(!GM2.favoritos)GM2.favoritos=await tpPrefGet('trafego.gm.filtros',[]);const f=await tpPrefGet('trafego.gm.filtro',null);if(f&&!GM2._f){GM2.filtro=f;GM2._f=1}if(!GM2.nivel)GM2.nivel=await tpPrefGet('trafego.gm.nivel','campanha')}
const tpCfgSalva=()=>tpPrefSet('trafego.gm',GM2.cfg);
const tpCfgN=()=>GM2.cfg.nivel[GM2.nivel];
const tpColsVisiveis=()=>{const c=tpCfgN();const lista=c.cols.filter(k=>TP_COL[k]&&TP_COL[k].niveis.includes(GM2.nivel));const fix=lista.filter(k=>(c.fixas||[]).includes(k)),resto=lista.filter(k=>!fix.includes(k));return [...fix,...resto].map(k=>TP_COL[k])};
const tpLarg=c=>(tpCfgN().larg||{})[c.k]||c.w;

// ---------- filtros ----------
function tpFiltra(lista,f){
  const b=String(f.busca||'').toLowerCase(),idq=String(f.id||'').trim();
  const txt=(v,q)=>!q||String(v||'').toLowerCase().includes(String(q).toLowerCase());
  const dentro=(v,de,ate)=>{if(!de&&!ate)return true;const d=String(v||'').slice(0,10);if(!d)return false;return (!de||d>=de)&&(!ate||d<=ate)};
  const num=(v,mn,mx)=>{if((mn===''||mn===undefined)&&(mx===''||mx===undefined))return true;if(v===null||v===undefined)return false;return (mn===''||mn===undefined||v>=Number(mn))&&(mx===''||mx===undefined||v<=Number(mx))};
  return lista.filter(x=>{
    const e=tpEstadoDe(x);
    if(b&&!(x.nome+' '+(x.codigo||'')).toLowerCase().includes(b))return false;
    if(idq&&!x.id.includes(idq))return false;
    if(f.status){if(f.status==='semEntrega'){if(!(e==='ACTIVE'&&!x.gasto&&!x.impressoes))return false}else if(f.status==='todos'){}else if(TP_STATUS_GRUPOS[f.status]&&!TP_STATUS_GRUPOS[f.status](e))return false}
    if(f.statusMeta&&e!==f.statusMeta)return false;
    if(f.objetivo&&(x.objetivo||x._objetivo)!==f.objetivo)return false;
    if(f.segmento&&tpSegDe(x)!==f.segmento)return false;
    if(f.origem&&(x.origem||'')!==f.origem)return false;
    if(!dentro(x.criado,f.criadoDe,f.criadoAte)||!dentro(gmInicioDe(x),f.inicioDe,f.inicioAte)||!dentro(x.fim,f.fimDe,f.fimAte)||!dentro(x.atualizado,f.atualizadoDe,f.atualizadoAte))return false;
    const p=tpPubDe(x)||{};
    if(f.publico&&!txt(`${x.nome} ${x._pai||''} ${tpPublicoTxt(p)}`,f.publico))return false;
    if(f.local&&!txt(tpPublicoTxt(p),f.local))return false;
    if((f.idadeMin||f.idadeMax)){const a=p.idadeMin||13,z=p.idadeMax||65;if(f.idadeMin&&z<Number(f.idadeMin))return false;if(f.idadeMax&&a>Number(f.idadeMax))return false}
    if(f.genero&&!((p.generos||[]).length?p.generos.map(g=>g.toLowerCase()).includes(f.genero.toLowerCase()):f.genero==='Todos'))return false;
    if(f.plataforma&&!(p.plataformas||[]).map(g=>g.toLowerCase()).includes(f.plataforma.toLowerCase()))return false;
    if(f.posicionamento&&!txt((p.posicionamentos||[]).join(' '),f.posicionamento))return false;
    if(f.formato&&tpFormatoDe(x)!==f.formato)return false;
    if(f.publicacaoUsada==='com'&&!tpPubIG(x))return false;if(f.publicacaoUsada==='sem'&&tpPubIG(x))return false;
    if(f.criativo&&!txt(`${x.nome} ${(x.criativo&&x.criativo.titulo)||''} ${(x.criativo&&x.criativo.texto)||''}`,f.criativo))return false;
    const orc=tpOrcVal(x);if(!num(orc,f.orcMin,f.orcMax))return false;
    for(const k of ['gasto','alcance','impressoes','cliques','ctr','cpc','cpm','frequencia','conversas','custoResultado']){const r=(f.nums||{})[k];if(r&&!num(TP_COL[k].v(x),r.min,r.max))return false}
    return true;
  });
}
const tpFiltroAtivo=f=>{const n=[];for(const [k,v] of Object.entries(f||{})){if(k==='nums'){for(const [m,r] of Object.entries(v||{}))if(r&&(r.min!==''&&r.min!==undefined||r.max!==''&&r.max!==undefined))n.push(['nums.'+m,`${(TP_COL[m]||{}).r||m}: ${r.min||'…'} a ${r.max||'…'}`])}else if(v!==''&&v!==undefined&&v!==null&&!(k==='status'&&v==='todos'))n.push([k,TP_FILTRO_ROT[k]?TP_FILTRO_ROT[k](v):`${k}: ${v}`])}return n};
const TP_STATUS_ROT={todos:'Todos',ativos:'Ativos',pausados:'Pausados',analise:'Em análise',reprovados:'Reprovados',semEntrega:'Sem entrega',problemas:'Com problemas',arquivados:'Arquivados'};
const TP_FILTRO_ROT={busca:v=>`Nome: ${v}`,id:v=>`ID: ${v}`,status:v=>`Status: ${TP_STATUS_ROT[v]||v}`,statusMeta:v=>`Status Meta: ${v}`,objetivo:v=>`Objetivo: ${GM_OBJ[v]||v}`,segmento:v=>`Segmento: ${v}`,origem:v=>`Origem: ${v}`,publico:v=>`Público: ${v}`,local:v=>`Local: ${v}`,genero:v=>`Gênero: ${v}`,plataforma:v=>`Plataforma: ${v}`,posicionamento:v=>`Posicionamento: ${v}`,formato:v=>`Formato: ${v}`,publicacaoUsada:v=>`Publicação: ${v==='com'?'com':'sem'} vínculo`,criativo:v=>`Criativo: ${v}`,idadeMin:v=>`Idade ≥ ${v}`,idadeMax:v=>`Idade ≤ ${v}`,orcMin:v=>`Orçamento ≥ ${v}`,orcMax:v=>`Orçamento ≤ ${v}`,criadoDe:v=>`Criado desde ${fmtDate(v)}`,criadoAte:v=>`Criado até ${fmtDate(v)}`,inicioDe:v=>`Início desde ${fmtDate(v)}`,inicioAte:v=>`Início até ${fmtDate(v)}`,fimDe:v=>`Término desde ${fmtDate(v)}`,fimAte:v=>`Término até ${fmtDate(v)}`,atualizadoDe:v=>`Alterado desde ${fmtDate(v)}`,atualizadoAte:v=>`Alterado até ${fmtDate(v)}`};
const tpSalvaFiltro=()=>tpPrefSet('trafego.gm.filtro',GM2.filtro);

// ---------- dados da tabela ----------
function tpLista(){
  let l=tpFlat(GM2.nivel);
  if(GM2.foco.campanha)l=l.filter(x=>GM2.nivel==='campanha'?x.id===GM2.foco.campanha:x._campanha===GM2.foco.campanha);
  if(GM2.foco.conjunto)l=l.filter(x=>GM2.nivel==='conjunto'?x.id===GM2.foco.conjunto:x._conjunto===GM2.foco.conjunto);
  const f=GM2.filtro||{};
  // sem escolher status, arquivados ficam de fora (como no Gerenciador da Meta); "Arquivados" ou "Todos" os mostram
  if(!f.status&&!f.statusMeta)l=l.filter(x=>tpEstadoDe(x)!=='ARCHIVED');
  l=tpFiltra(l,f);
  const col=TP_COL[GM2.ordem.k]||TP_COL.gasto,o=GM2.ordem.d;
  return [...l].sort((a,b)=>{let x=col.v(a),y=col.v(b);if(x===null||x===undefined)x=o>0?Infinity:-Infinity;if(y===null||y===undefined)y=o>0?Infinity:-Infinity;if(typeof x==='string')x=x.toLowerCase();if(typeof y==='string')y=y.toLowerCase();const c=x<y?-1:x>y?1:0;return c?c*o:(b.gasto-a.gasto)});
}
function tpRodape(lista,cols){
  const s={gasto:0,impressoes:0,cliques:0,conversas:0,leads:0,resultados:0};lista.forEach(x=>{for(const k in s)s[k]+=Number(x[k])||0});
  const v={gasto:s.gasto,impressoes:s.impressoes,cliques:s.cliques,conversas:s.conversas,leads:s.leads,resultados:s.resultados,ctr:s.impressoes?s.cliques/s.impressoes*100:null,cpc:s.cliques?s.gasto/s.cliques:null,cpm:s.impressoes?s.gasto/s.impressoes*1000:null,custoConversa:s.conversas?s.gasto/s.conversas:null,cpl:s.leads?s.gasto/s.leads:null};
  const fmt={gasto:x=>gmBrl(x),impressoes:gmN,cliques:gmN,conversas:gmN,leads:gmN,resultados:gmN,ctr:gmPct,cpc:gmBrl,cpm:gmBrl,custoConversa:gmBrl,cpl:gmBrl};
  return `<tr class="tot">${cols.map((c,i)=>`<td ${tpFixaStyle(c,cols)}>${i===0?`Total de ${lista.length} ${GM2.nivel==='campanha'?'campanha(s)':GM2.nivel==='conjunto'?'conjunto(s)':'anúncio(s)'}`:(c.k in fmt&&v[c.k]!==null&&v[c.k]!==undefined?esc(fmt[c.k](v[c.k])):'')}</td>`).join('')}<td></td></tr>`;
}
function tpFixaStyle(c,cols){
  const fix=tpCfgN().fixas||[];if(!fix.includes(c.k))return `style="min-width:${tpLarg(c)}px;width:${tpLarg(c)}px"`;
  let left=40;for(const o of cols){if(o.k===c.k)break;if(fix.includes(o.k))left+=tpLarg(o)}
  return `class="tp-fixa" style="min-width:${tpLarg(c)}px;width:${tpLarg(c)}px;left:${left}px"`;
}
function tpTabelaHtml(){
  const lista=tpLista(),cols=tpColsVisiveis();GM2.lista=lista;
  const th=c=>`<th scope="col" ${tpFixaStyle(c,cols)} aria-sort="${GM2.ordem.k===c.k?(GM2.ordem.d>0?'ascending':'descending'):'none'}"><button type="button" class="tf-ord" data-ord2="${c.k}">${esc(c.r)}${GM2.ordem.k===c.k?(GM2.ordem.d>0?' ▲':' ▼'):''}</button><i class="tp-rz" data-rz="${c.k}" aria-hidden="true"></i></th>`;
  const todos=lista.length&&lista.every(x=>GM2.sel.has(x.id));
  return `<div class="tablewrap tp-wrap" id="tpWrap"><table class="datatable gm-tab tp-tab"><thead><tr><th class="tp-ck"><input type="checkbox" id="tpTodos" aria-label="Selecionar todos" ${todos?'checked':''}></th>${cols.map(th).join('')}<th class="tp-ac">Ações</th></tr></thead>
   <tbody>${lista.map(x=>`<tr data-id="${attr(x.id)}" class="${GM2.sel.has(x.id)?'sel':''}"><td class="tp-ck"><input type="checkbox" data-sel2="${attr(x.id)}" aria-label="Selecionar ${attr(x.nome)}" ${GM2.sel.has(x.id)?'checked':''}></td>${cols.map(c=>`<td ${tpFixaStyle(c,cols)}>${c.h(x,GM2.nivel)}</td>`).join('')}<td class="tp-ac"><button type="button" class="softbtn" data-painel="${attr(x.id)}">Detalhes</button></td></tr>`).join('')||`<tr><td colspan="${cols.length+2}" class="empty compact">Nada encontrado com estes filtros.</td></tr>`}</tbody>
   <tfoot>${tpRodape(lista,cols)}</tfoot></table></div>`;
}
function tpBarraSel(){
  const n=GM2.sel.size,ok=adsCompleto;
  return `<div class="tp-lote ${n?'on':''}" id="tpLote" role="region" aria-label="Ações para os selecionados">${n?`<b>${n} selecionado(s)</b>
   ${ok?`<button class="softbtn" data-lote="ativar">Ativar</button><button class="softbtn" data-lote="pausar">Pausar</button><button class="softbtn" data-lote="arquivar">Arquivar</button><button class="softbtn" data-lote="duplicar">Duplicar</button><button class="softbtn" data-lote="editar">Editar em massa…</button>`:'<small>Edição liberada só com o modo completo (Configurações → Integrações).</small>'}
   ${GM2.nivel==='anuncio'?`<button class="softbtn" data-lote="comparar">Comparar</button>`:''}<button class="softbtn" data-lote="analisar">Analisar</button><button class="softbtn" data-lote="limpar">Limpar seleção</button>`:''}</div>`;
}
function tpDesenhaGm(){
  const raiz=$('#tpGm');if(!raiz)return;
  const ativos=tpFiltroAtivo(GM2.filtro),c=tpCfgN();
  const foco=[];if(GM2.foco.campanha){const x=gmDados.campanhas.find(k=>k.id===GM2.foco.campanha);foco.push(x?x.nome:GM2.foco.campanha)}if(GM2.foco.conjunto){const x=tpFlat('conjunto').find(k=>k.id===GM2.foco.conjunto);foco.push(x?x.nome:GM2.foco.conjunto)}
  raiz.innerHTML=`<div class="tp-barra"><div class="view-switch" role="tablist" aria-label="Nível">${TP_NIVEIS.map(([k,l])=>`<button type="button" role="tab" data-niv="${k}" class="${GM2.nivel===k?'active':''}" aria-selected="${GM2.nivel===k}">${l}</button>`).join('')}</div>
    <input type="search" class="control tp-busca" id="tpBusca" placeholder="Pesquisar por nome ou código" aria-label="Pesquisar" value="${attr(GM2.filtro.busca||'')}">
    <select class="control" id="tpStatus" aria-label="Status">${Object.entries(TP_STATUS_ROT).map(([k,l])=>`<option value="${k}" ${(GM2.filtro.status||'')===k||(!GM2.filtro.status&&k==='todos'&&false)?'selected':''}>${k==='todos'?'Status: todos':l}</option>`).join('').replace('<option value="todos"','<option value=""')}</select>
    <button type="button" class="softbtn" id="tpFiltros">Filtros${ativos.length?` <b class="tp-n">${ativos.length}</b>`:''}</button>
    <select class="control" id="tpFav" aria-label="Filtros favoritos"><option value="">Favoritos</option>${(GM2.favoritos||[]).map(f=>`<option value="${attr(f.id)}">${esc(f.nome)}</option>`).join('')}<option value="__salvar">＋ Salvar filtro atual…</option>${(GM2.favoritos||[]).length?'<option value="__excluir">✕ Excluir favorito…</option>':''}</select>
    <span class="cm-esp"></span>
    <select class="control" id="tpVisao" aria-label="Visualização de colunas">${Object.entries(TP_MODELO_ROT).map(([k,l])=>`<option value="m:${k}" ${c.modelo===k?'selected':''}>${l}</option>`).join('')}${(GM2.cfg.visoes[GM2.nivel]||[]).map(v=>`<option value="v:${attr(v.id)}" ${c.modelo==='v:'+v.id?'selected':''}>★ ${esc(v.nome)}</option>`).join('')}</select>
    <button type="button" class="softbtn" id="tpColunas">Colunas</button>
    <div class="tp-exp"><button type="button" class="softbtn" id="tpExp" aria-haspopup="true">Exportar ▾</button><div class="submenu" id="tpExpMenu" hidden><button data-exp="csv">CSV</button><button data-exp="xlsx">Excel (.xlsx)</button><button data-exp="pdf">PDF (imprimir)</button></div></div></div>
   ${ativos.length||foco.length?`<div class="tp-chips">${foco.length?`<span class="tp-chip">Dentro de: ${esc(foco.join(' › '))} <button data-foco-x aria-label="Remover">×</button></span>`:''}${ativos.map(([k,t])=>`<span class="tp-chip">${esc(t)} <button data-fx="${attr(k)}" aria-label="Remover filtro">×</button></span>`).join('')}<button class="db-link" id="tpLimpa">Limpar tudo</button></div>`:''}
   <div id="tpLoteBox">${tpBarraSel()}</div><div id="tpTabBox">${tpTabelaHtml()}</div>
   <p class="kpi-note">${GM2.lista.length} item(ns) · métricas de ${esc(fmtDate(gmDados.de))} a ${esc(fmtDate(gmDados.ate))} (independentes da data de criação). Status e números são os devolvidos pela Meta; o segmento escolar é identificado pelo nome.</p>`;
  tpLigaGm();
}
function tpRedesenhaTabela(){
  const w=$('#tpWrap'),sl=w?w.scrollLeft:0,st=w?w.scrollTop:0;
  $('#tpTabBox').innerHTML=tpTabelaHtml();$('#tpLoteBox').innerHTML=tpBarraSel();tpLigaTabela();
  const n=$('#tpWrap');if(n){n.scrollLeft=sl;n.scrollTop=st}
}
function tpLigaTabela(){
  $$('[data-ord2]').forEach(b=>b.onclick=()=>{const k=b.dataset.ord2;GM2.ordem=GM2.ordem.k===k?{k,d:-GM2.ordem.d}:{k,d:['nome','estado','inicio','criado','fim'].includes(k)?1:-1};tpRedesenhaTabela()});
  $$('[data-sel2]').forEach(i=>i.onchange=()=>{i.checked?GM2.sel.add(i.dataset.sel2):GM2.sel.delete(i.dataset.sel2);i.closest('tr').classList.toggle('sel',i.checked);$('#tpLoteBox').innerHTML=tpBarraSel();tpLigaLote();const t=$('#tpTodos');if(t)t.checked=GM2.lista.length&&GM2.lista.every(x=>GM2.sel.has(x.id))});
  const t=$('#tpTodos');if(t)t.onchange=()=>{GM2.lista.forEach(x=>t.checked?GM2.sel.add(x.id):GM2.sel.delete(x.id));tpRedesenhaTabela()};
  $$('[data-painel]').forEach(b=>b.onclick=()=>tpPainel(b.dataset.painel));
  $$('[data-gf]').forEach(a=>a.onclick=e=>{e.preventDefault();const [n,id]=a.dataset.gf.split(':');if(n==='campanha'){GM2.foco={campanha:id,conjunto:''};GM2.nivel='conjunto'}else{GM2.foco={campanha:(tpFlat('conjunto').find(x=>x.id===id)||{})._campanha||GM2.foco.campanha,conjunto:id};GM2.nivel='anuncio'}GM2.sel.clear();tpDesenhaGm()});
  $$('[data-sw]').forEach(i=>i.onchange=async()=>{const [o,n]=gmAchar(i.dataset.sw);const ativar=i.checked;if(!confirm(ativar?`Ativar "${o.nome}"? Volta a gastar.`:`Pausar "${o.nome}"?`)){i.checked=!ativar;return}try{await gmPost('/ads/editar',{nivel:n,id:o.id,campos:{status:ativar?'ACTIVE':'PAUSED'}});o.status=ativar?'ACTIVE':'PAUSED';o.estado=o.status;toast('Alterado na Meta');tpRedesenhaTabela()}catch(e){i.checked=!ativar;toast(e.message,'bad')}});
  // redimensionar colunas
  $$('[data-rz]').forEach(h=>h.onpointerdown=ev=>{ev.preventDefault();const k=h.dataset.rz,c=TP_COL[k],ini=ev.clientX,w0=tpLarg(c),th=h.parentElement;h.setPointerCapture(ev.pointerId);
    h.onpointermove=e=>{const w=Math.max(60,Math.min(700,w0+e.clientX-ini));th.style.width=th.style.minWidth=w+'px'};
    h.onpointerup=e=>{h.onpointermove=h.onpointerup=null;const w=Math.max(60,Math.min(700,w0+e.clientX-ini));tpCfgN().larg={...(tpCfgN().larg||{}),[k]:w};tpCfgSalva();tpRedesenhaTabela()}});
}
function tpLigaLote(){$$('[data-lote]').forEach(b=>b.onclick=()=>tpLote(b.dataset.lote))}
function tpLigaGm(){
  $$('[data-niv]').forEach(b=>b.onclick=()=>{GM2.nivel=b.dataset.niv;GM2.sel.clear();if(GM2.nivel==='campanha')GM2.foco={campanha:'',conjunto:''};else if(GM2.nivel==='conjunto')GM2.foco.conjunto='';tpPrefSet('trafego.gm.nivel',GM2.nivel);tpDesenhaGm()});
  const b=$('#tpBusca');b.oninput=()=>{GM2.filtro={...GM2.filtro,busca:b.value};tpSalvaFiltro();clearTimeout(tpLigaGm.t);tpLigaGm.t=setTimeout(()=>{tpRedesenhaTabela();tpAtualizaChips()},250)};
  $('#tpStatus').onchange=e=>{GM2.filtro={...GM2.filtro,status:e.target.value};tpSalvaFiltro();tpDesenhaGm()};
  $('#tpFiltros').onclick=tpPainelFiltros;
  $('#tpFav').onchange=e=>tpFavorito(e.target.value);
  $('#tpVisao').onchange=e=>{const [t,id]=[e.target.value.slice(0,1),e.target.value.slice(2)];const c=tpCfgN();if(t==='m'){c.modelo=id;if(id!=='personalizado')c.cols=TP_MODELOS[id].filter(k=>TP_COL[k].niveis.includes(GM2.nivel))}else{const v=(GM2.cfg.visoes[GM2.nivel]||[]).find(x=>x.id===id);if(v){c.modelo='v:'+id;c.cols=[...v.cols];c.larg={...(v.larg||{})};c.fixas=[...(v.fixas||[])]}}tpCfgSalva();tpDesenhaGm()};
  $('#tpColunas').onclick=tpPainelColunas;
  const ex=$('#tpExp'),mn=$('#tpExpMenu');ex.onclick=e=>{e.stopPropagation();mn.hidden=!mn.hidden};document.addEventListener('click',()=>{if(mn)mn.hidden=true},{once:true});
  $$('[data-exp]').forEach(x=>x.onclick=()=>{mn.hidden=true;tpExportar(x.dataset.exp)});
  $$('[data-fx]').forEach(x=>x.onclick=()=>{const k=x.dataset.fx;const f={...GM2.filtro};if(k.startsWith('nums.')){const m=k.slice(5);f.nums={...(f.nums||{})};delete f.nums[m]}else delete f[k];GM2.filtro=f;tpSalvaFiltro();tpDesenhaGm()});
  $$('[data-foco-x]').forEach(x=>x.onclick=()=>{GM2.foco={campanha:'',conjunto:''};tpDesenhaGm()});
  $('#tpLimpa')&&($('#tpLimpa').onclick=()=>{GM2.filtro={};GM2.foco={campanha:'',conjunto:''};tpSalvaFiltro();tpDesenhaGm()});
  tpLigaTabela();tpLigaLote();
}
function tpAtualizaChips(){const ativos=tpFiltroAtivo(GM2.filtro);const bt=$('#tpFiltros');if(bt)bt.innerHTML=`Filtros${ativos.length?` <b class="tp-n">${ativos.length}</b>`:''}`}

// ---------- favoritos de filtro ----------
async function tpFavorito(v){
  const sel=$('#tpFav');if(!v)return;
  if(v==='__salvar'){const nome=prompt('Nome do filtro favorito:');sel.value='';if(!nome)return;const l=[...(GM2.favoritos||[]),{id:'F'+Date.now().toString(36),nome:nome.slice(0,60),filtro:JSON.parse(JSON.stringify(GM2.filtro)),nivel:GM2.nivel}];GM2.favoritos=l;tpPrefSet('trafego.gm.filtros',l);toast('Filtro salvo nos favoritos');return tpDesenhaGm()}
  if(v==='__excluir'){const nome=prompt('Digite o nome do favorito a excluir:\n'+(GM2.favoritos||[]).map(f=>f.nome).join(', '));sel.value='';if(!nome)return;const l=(GM2.favoritos||[]).filter(f=>f.nome!==nome);if(l.length===(GM2.favoritos||[]).length)return toast('Favorito não encontrado','warn');GM2.favoritos=l;tpPrefSet('trafego.gm.filtros',l);return tpDesenhaGm()}
  const f=(GM2.favoritos||[]).find(x=>x.id===v);if(f){GM2.filtro=JSON.parse(JSON.stringify(f.filtro));if(f.nivel)GM2.nivel=f.nivel;tpSalvaFiltro();GM2.sel.clear();tpDesenhaGm()}
}
// ---------- painel de filtros ----------
function tpPainelFiltros(){
  const f=GM2.filtro,n=f.nums||{};
  const objs=[...new Set(gmDados.campanhas.map(c=>c.objetivo).filter(Boolean))],estados=[...new Set(tpFlat(GM2.nivel).map(tpEstadoDe).filter(Boolean))],formatos=[...new Set(tpFlat('anuncio').map(tpFormatoDe).filter(Boolean))];
  const campo=(id,rot,val,tipo='text',ph='')=>`<label>${rot}<input class="control" id="${id}" type="${tipo}" value="${attr(val||'')}" placeholder="${attr(ph)}"></label>`;
  const par=(k,rot)=>`<div class="tp-par"><span>${rot}</span><input class="control" type="number" step="any" data-nmin="${k}" value="${attr((n[k]||{}).min||'')}" placeholder="mín."><input class="control" type="number" step="any" data-nmax="${k}" value="${attr((n[k]||{}).max||'')}" placeholder="máx."></div>`;
  const p=tpPainelLateral('Filtros',`<form id="tpFF" class="tp-ff">
   <fieldset><legend>Identificação</legend>${campo('ffBusca','Nome',f.busca)}${campo('ffId','ID (Meta)',f.id)}
    <label>Objetivo<select class="control" id="ffObj"><option value="">Todos</option>${objs.map(o=>`<option value="${attr(o)}" ${f.objetivo===o?'selected':''}>${esc(GM_OBJ[o]||o)}</option>`).join('')}</select></label>
    <label>Segmento escolar (pelo nome)<select class="control" id="ffSeg"><option value="">Todos</option>${TP_SEG.map(([s])=>`<option ${f.segmento===s?'selected':''}>${esc(s)}</option>`).join('')}</select></label>
    <label>Origem<select class="control" id="ffOrig"><option value="">Todas</option><option ${f.origem==='EVO MKT'?'selected':''}>EVO MKT</option><option ${f.origem==='Meta'?'selected':''} value="Meta">Criado na Meta</option></select></label></fieldset>
   <fieldset><legend>Status</legend><label>Grupo<select class="control" id="ffSt"><option value="">Padrão (sem arquivados)</option>${Object.entries(TP_STATUS_ROT).map(([k,l])=>`<option value="${k}" ${f.status===k?'selected':''}>${l}</option>`).join('')}</select></label>
    <label>Status exato na Meta<select class="control" id="ffSm"><option value="">Qualquer</option>${estados.map(e=>`<option ${f.statusMeta===e?'selected':''}>${esc(e)}</option>`).join('')}</select></label></fieldset>
   <fieldset><legend>Datas (a data de criação não muda o período das métricas)</legend><div class="tp-par"><span>Criação</span><input class="control" type="date" id="ffCd" value="${attr(f.criadoDe||'')}"><input class="control" type="date" id="ffCa" value="${attr(f.criadoAte||'')}"></div>
    <div class="tp-par"><span>Início</span><input class="control" type="date" id="ffId1" value="${attr(f.inicioDe||'')}"><input class="control" type="date" id="ffIa" value="${attr(f.inicioAte||'')}"></div>
    <div class="tp-par"><span>Término</span><input class="control" type="date" id="ffFd" value="${attr(f.fimDe||'')}"><input class="control" type="date" id="ffFa" value="${attr(f.fimAte||'')}"></div>
    <div class="tp-par"><span>Última alteração</span><input class="control" type="date" id="ffAd" value="${attr(f.atualizadoDe||'')}"><input class="control" type="date" id="ffAa" value="${attr(f.atualizadoAte||'')}"></div></fieldset>
   <fieldset><legend>Público e posicionamento (conjuntos e anúncios)</legend>${campo('ffPub','Público (nome ou descrição)',f.publico)}${campo('ffLoc','Localização',f.local)}
    <div class="tp-par"><span>Idade</span><input class="control" type="number" id="ffIdMin" min="13" max="65" value="${attr(f.idadeMin||'')}" placeholder="de"><input class="control" type="number" id="ffIdMax" min="13" max="65" value="${attr(f.idadeMax||'')}" placeholder="até"></div>
    <label>Gênero<select class="control" id="ffGen"><option value="">Todos</option>${['Feminino','Masculino','Todos'].map(g=>`<option ${f.genero===g?'selected':''}>${g}</option>`).join('')}</select></label>
    <label>Plataforma<select class="control" id="ffPlat"><option value="">Todas</option>${['facebook','instagram','audience_network','messenger'].map(g=>`<option ${f.plataforma===g?'selected':''}>${g}</option>`).join('')}</select></label>${campo('ffPos','Posicionamento (contém)',f.posicionamento)}</fieldset>
   <fieldset><legend>Criativo (anúncios)</legend><label>Formato<select class="control" id="ffFor"><option value="">Todos</option>${formatos.map(g=>`<option ${f.formato===g?'selected':''}>${esc(g)}</option>`).join('')}</select></label>${campo('ffCri','Texto do criativo (contém)',f.criativo)}
    <label>Publicação do Instagram<select class="control" id="ffPubU"><option value="">Qualquer</option><option value="com" ${f.publicacaoUsada==='com'?'selected':''}>Usa publicação existente</option><option value="sem" ${f.publicacaoUsada==='sem'?'selected':''}>Sem publicação vinculada</option></select></label></fieldset>
   <fieldset><legend>Valores</legend><div class="tp-par"><span>Orçamento</span><input class="control" type="number" step="any" id="ffOmin" value="${attr(f.orcMin||'')}" placeholder="mín."><input class="control" type="number" step="any" id="ffOmax" value="${attr(f.orcMax||'')}" placeholder="máx."></div>
    ${['gasto','alcance','impressoes','cliques','ctr','cpc','cpm','frequencia','conversas','custoResultado'].map(k=>par(k,TP_COL[k].r)).join('')}</fieldset>
   <div class="tp-ff-acoes"><button class="btn" type="submit">Aplicar filtros</button><button class="softbtn" type="button" id="ffLimpa">Limpar</button></div></form>`);
  const g=id=>p.querySelector('#'+id).value;
  p.querySelector('#tpFF').onsubmit=e=>{e.preventDefault();const nums={};p.querySelectorAll('[data-nmin]').forEach(i=>{const k=i.dataset.nmin,mx=p.querySelector(`[data-nmax="${k}"]`).value;if(i.value!==''||mx!=='')nums[k]={min:i.value,max:mx}});
    GM2.filtro={busca:g('ffBusca'),id:g('ffId'),objetivo:g('ffObj'),segmento:g('ffSeg'),origem:g('ffOrig'),status:g('ffSt'),statusMeta:g('ffSm'),criadoDe:g('ffCd'),criadoAte:g('ffCa'),inicioDe:g('ffId1'),inicioAte:g('ffIa'),fimDe:g('ffFd'),fimAte:g('ffFa'),atualizadoDe:g('ffAd'),atualizadoAte:g('ffAa'),publico:g('ffPub'),local:g('ffLoc'),idadeMin:g('ffIdMin'),idadeMax:g('ffIdMax'),genero:g('ffGen'),plataforma:g('ffPlat'),posicionamento:g('ffPos'),formato:g('ffFor'),criativo:g('ffCri'),publicacaoUsada:g('ffPubU'),orcMin:g('ffOmin'),orcMax:g('ffOmax'),nums};
    for(const k of Object.keys(GM2.filtro))if(GM2.filtro[k]===''||GM2.filtro[k]===undefined)delete GM2.filtro[k];
    tpSalvaFiltro();p.remove();tpDesenhaGm()};
  p.querySelector('#ffLimpa').onclick=()=>{GM2.filtro={};tpSalvaFiltro();p.remove();tpDesenhaGm()};
}
/** Painel lateral genérico (direita). Fecha com Esc ou no botão; não mexe na tabela por trás. */
function tpPainelLateral(titulo,html,larg=460){
  document.querySelectorAll('.tp-lateral').forEach(x=>x.remove());
  const p=document.createElement('aside');p.className='tp-lateral';p.setAttribute('role','dialog');p.setAttribute('aria-label',titulo);p.style.width=`min(${larg}px,100vw)`;
  p.innerHTML=`<header><h3>${esc(titulo)}</h3><button type="button" class="iconbtn" aria-label="Fechar" data-fechar>×</button></header><div class="tp-lat-corpo">${html}</div>`;
  document.body.appendChild(p);
  const fecha=()=>{p.remove();document.removeEventListener('keydown',esc_)};const esc_=e=>{if(e.key==='Escape')fecha()};document.addEventListener('keydown',esc_);
  p.querySelector('[data-fechar]').onclick=fecha;p.fechar=fecha;return p;
}
// ---------- painel de colunas ----------
function tpPainelColunas(){
  const c=tpCfgN(),disp=colsDoNivel(GM2.nivel);
  const desenha=()=>{
    const gs=[...new Set(disp.map(x=>x.g))],q=(p.querySelector('#colBusca')||{}).value||'';
    p.querySelector('.tp-lat-corpo').innerHTML=`<input type="search" class="control" id="colBusca" placeholder="Pesquisar métricas" value="${attr(q)}" aria-label="Pesquisar métricas">
     <div class="tp-cols2"><div><h4>Disponíveis</h4>${gs.map(g=>{const l=disp.filter(x=>x.g===g&&(!q||x.r.toLowerCase().includes(q.toLowerCase())));return l.length?`<details open><summary>${esc(g)}</summary>${l.map(x=>`<label class="check-row"><input type="checkbox" data-col="${x.k}" ${c.cols.includes(x.k)?'checked':''}> ${esc(x.r)}</label>`).join('')}</details>`:''}).join('')}</div>
      <div><h4>Na tabela (ordem)</h4><ol class="tp-ord">${c.cols.filter(k=>TP_COL[k]&&TP_COL[k].niveis.includes(GM2.nivel)).map((k,i,a)=>`<li draggable="true" data-ok="${k}"><span>${esc(TP_COL[k].r)}</span><button type="button" data-fx2="${k}" class="${(c.fixas||[]).includes(k)?'on':''}" title="Fixar à esquerda" aria-pressed="${(c.fixas||[]).includes(k)}">📌</button><button type="button" data-up="${k}" ${i?'':'disabled'} aria-label="Subir">▲</button><button type="button" data-dn="${k}" ${i<a.length-1?'':'disabled'} aria-label="Descer">▼</button></li>`).join('')}</ol></div></div>
     <div class="tp-vis"><h4>Visualizações</h4><div class="tp-vis-l"><input class="control" id="visNome" placeholder="Nome da visualização" maxlength="40"><button class="softbtn" id="visSalva" type="button">Salvar como visualização</button></div>
      ${(GM2.cfg.visoes[GM2.nivel]||[]).map(v=>`<div class="tp-vis-i"><b>${esc(v.nome)}</b>${GM2.cfg.padrao[GM2.nivel]===v.id?' <span class="badge ok">padrão</span>':''}<button class="softbtn" data-vpad="${attr(v.id)}">Definir padrão</button><button class="softbtn" data-vren="${attr(v.id)}">Renomear</button><button class="softbtn" data-vdel="${attr(v.id)}">Excluir</button></div>`).join('')||'<small class="kpi-note">Nenhuma visualização salva para este nível.</small>'}</div>
     <div class="tp-ff-acoes"><button class="softbtn" id="colPadrao" type="button">Restaurar padrão</button><button class="btn" id="colOk" type="button">Concluir</button></div>`;
    liga();
  };
  const aplica=()=>{c.modelo='personalizado';tpCfgSalva();tpRedesenhaTabela();const s=$('#tpVisao');if(s)s.value='m:personalizado';desenha()};
  const liga=()=>{
    p.querySelector('#colBusca').oninput=e=>{desenha();const i=p.querySelector('#colBusca');i.focus();i.setSelectionRange(i.value.length,i.value.length)};
    p.querySelectorAll('[data-col]').forEach(i=>i.onchange=()=>{if(i.checked){if(!c.cols.includes(i.dataset.col))c.cols.push(i.dataset.col)}else{if(c.cols.length<=1){i.checked=true;return toast('Mantenha ao menos uma coluna','warn')}c.cols=c.cols.filter(k=>k!==i.dataset.col)}aplica()});
    const mv=(k,d)=>{const i=c.cols.indexOf(k),j=i+d;if(j<0||j>=c.cols.length)return;[c.cols[i],c.cols[j]]=[c.cols[j],c.cols[i]];aplica()};
    p.querySelectorAll('[data-up]').forEach(b=>b.onclick=()=>mv(b.dataset.up,-1));p.querySelectorAll('[data-dn]').forEach(b=>b.onclick=()=>mv(b.dataset.dn,1));
    p.querySelectorAll('[data-fx2]').forEach(b=>b.onclick=()=>{const k=b.dataset.fx2;c.fixas=(c.fixas||[]).includes(k)?c.fixas.filter(x=>x!==k):[...(c.fixas||[]),k];aplica()});
    p.querySelectorAll('[data-ok]').forEach(li=>{li.ondragstart=e=>{e.dataTransfer.setData('text/plain',li.dataset.ok)};li.ondragover=e=>e.preventDefault();li.ondrop=e=>{e.preventDefault();const de=e.dataTransfer.getData('text/plain'),para=li.dataset.ok;if(!de||de===para)return;const o=c.cols.filter(k=>k!==de);o.splice(o.indexOf(para),0,de);c.cols=o;aplica()}});
    p.querySelector('#visSalva').onclick=()=>{const nome=p.querySelector('#visNome').value.trim();if(!nome)return toast('Dê um nome à visualização','warn');const l=GM2.cfg.visoes[GM2.nivel]=GM2.cfg.visoes[GM2.nivel]||[];const v={id:'V'+Date.now().toString(36),nome,cols:[...c.cols],larg:{...(c.larg||{})},fixas:[...(c.fixas||[])]};l.push(v);c.modelo='v:'+v.id;tpCfgSalva();toast('Visualização salva');tpDesenhaGm();desenha()};
    p.querySelectorAll('[data-vpad]').forEach(b=>b.onclick=()=>{GM2.cfg.padrao[GM2.nivel]=b.dataset.vpad;tpCfgSalva();desenha()});
    p.querySelectorAll('[data-vren]').forEach(b=>b.onclick=()=>{const v=GM2.cfg.visoes[GM2.nivel].find(x=>x.id===b.dataset.vren);const n=prompt('Novo nome:',v.nome);if(!n)return;v.nome=n.slice(0,40);tpCfgSalva();tpDesenhaGm();desenha()});
    p.querySelectorAll('[data-vdel]').forEach(b=>b.onclick=()=>{if(!confirm('Excluir esta visualização?'))return;GM2.cfg.visoes[GM2.nivel]=GM2.cfg.visoes[GM2.nivel].filter(x=>x.id!==b.dataset.vdel);if(GM2.cfg.padrao[GM2.nivel]===b.dataset.vdel)delete GM2.cfg.padrao[GM2.nivel];if(c.modelo==='v:'+b.dataset.vdel)c.modelo='personalizado';tpCfgSalva();tpDesenhaGm();desenha()});
    p.querySelector('#colPadrao').onclick=()=>{const d=tpCfgPadrao().nivel[GM2.nivel];GM2.cfg.nivel[GM2.nivel]=d;tpCfgSalva();p.fechar();tpDesenhaGm()};
    p.querySelector('#colOk').onclick=()=>p.fechar();
  };
  const p=tpPainelLateral('Personalizar colunas','',520);desenha();
}
// ---------- exportação (respeita filtros e colunas) ----------
function tpMatriz(){
  const cols=tpColsVisiveis().filter(c=>c.k!=='ligado');
  const cab=cols.map(c=>c.r),txt=(c,x)=>{if(c.exp)return c.exp(x);let v=c.v(x);if(c.k==='estado')v=x.estado||x.status;else if(c.k==='inicio')v=gmInicioDe(x);if(v===null||v===undefined||v==='9999')return '';return v};
  return [cab,...GM2.lista.map(x=>cols.map(c=>txt(c,x)))];
}
async function tpExportar(tipo){
  const m=tpMatriz(),nome=`anuncios-${GM2.nivel}-${gmDados.de}_a_${gmDados.ate}`;
  if(tipo==='csv'){const csv='﻿'+m.map(l=>l.map(v=>{const s=String(v??'');return /[";\n\r]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s}).join(';')).join('\r\n');return tpBaixa(new Blob([csv],{type:'text/csv;charset=utf-8'}),nome+'.csv')}
  if(tipo==='xlsx'){try{const r=await fetch(API+'/reports/xlsx',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-EVO':'1'},body:JSON.stringify({titulo:'Anúncios',abas:[{nome:GM2.nivel,linhas:m}]})});if(!r.ok)throw new Error((await r.json().catch(()=>({}))).error||'Falha ao gerar o Excel');return tpBaixa(await r.blob(),nome+'.xlsx')}catch(e){return toast(e.message,'bad')}}
  if(tipo==='pdf')return tpImprimir(`Anúncios (${GM2.nivel==='campanha'?'campanhas':GM2.nivel==='conjunto'?'conjuntos':'anúncios'}) · ${fmtDate(gmDados.de)} a ${fmtDate(gmDados.ate)}`,m);
}
function tpBaixa(blob,nome){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=nome;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),4000);toast('Arquivo gerado')}
/** "PDF": abre uma página própria para impressão (o navegador salva em PDF); nada é enviado a terceiros. */
function tpImprimir(titulo,matriz,extra=''){
  const w=window.open('','_blank');if(!w)return toast('O navegador bloqueou a janela. Libere pop-ups para exportar o PDF.','warn');
  const tab=`<table><thead><tr>${matriz[0].map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${matriz.slice(1).map(l=>`<tr>${l.map(v=>`<td>${esc(String(v??''))}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(titulo)}</title><style>body{font:12px/1.4 system-ui,sans-serif;margin:24px;color:#1d2433}h1{font-size:18px;color:#063996;margin:0 0 4px}p{color:#5e6678;margin:0 0 14px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #dde1ea;padding:5px 7px;text-align:left}th{background:#eaf0fb}tr:nth-child(even) td{background:#fafbfe}@media print{body{margin:8mm}}</style></head><body><h1>${esc(titulo)}</h1><p>Colégio Evolução · EVO MKT · gerado em ${esc(new Date().toLocaleString('pt-BR'))}</p>${extra}${tab}<script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>`);w.document.close();
}
// ---------- ações em lote ----------
async function tpLote(acao){
  if(acao==='limpar'){GM2.sel.clear();return tpRedesenhaTabela()}
  const itens=[...GM2.sel].map(id=>gmAchar(id)).filter(x=>x[0]).map(([o,n])=>({o,n}));if(!itens.length)return;
  if(acao==='comparar'){gmSel=new Set(itens.map(x=>x.o.id));return gmCompararSel()}
  if(acao==='analisar'){TP.analise={nivel:GM2.nivel,ids:itens.map(x=>x.o.id)};return go('tfanalises')}
  const rot={ativar:'Ativar',pausar:'Pausar',arquivar:'Arquivar',duplicar:'Duplicar',editar:'Editar em massa'}[acao];
  let passos=[];
  if(acao==='editar')return tpEdicaoMassa(itens);
  passos=itens.map(({o,n})=>({o,n,campos:acao==='ativar'?{status:'ACTIVE'}:acao==='pausar'?{status:'PAUSED'}:acao==='arquivar'?{status:'ARCHIVED'}:null,rotulo:acao==='ativar'?`${o.status} → ACTIVE`:acao==='pausar'?`${o.status} → PAUSED`:acao==='arquivar'?`${o.status} → ARCHIVED`:'cópia pausada'}));
  tpRevisaoLote(rot,passos,acao);
}
function tpEdicaoMassa(itens){
  const campanhasEConj=itens.filter(x=>x.n!=='anuncio').length;
  const o=adminOverlay(`<h3>Editar em massa (${itens.length})</h3><p class="kpi-note">Escolha o que mudar. Antes de enviar à Meta você revisa os valores anteriores e novos de cada item.</p>
   <form id="emF" class="cm-form" novalidate><label>Status<select class="control" id="emSt"><option value="">Não alterar</option><option value="ACTIVE">Ativar</option><option value="PAUSED">Pausar</option><option value="ARCHIVED">Arquivar</option></select></label>
   <label>Orçamento diário<select class="control" id="emOrcT" ${campanhasEConj?'':'disabled'}><option value="">Não alterar</option><option value="valor">Definir valor (R$)</option><option value="pct">Ajustar em %</option></select></label>
   <label>Valor ou percentual<input class="control" id="emOrcV" type="number" step="any" placeholder="ex.: 20 ou -10" ${campanhasEConj?'':'disabled'}></label>
   <label class="wide">Nome: acrescentar no fim (opcional)<input class="control" id="emNome" maxlength="60" placeholder="ex.: · Matrículas 2027"></label>
   ${campanhasEConj<itens.length?'<p class="kpi-note wide">Orçamento só vale para campanhas e conjuntos; anúncios recebem só status e nome.</p>':''}
   <div class="cm-erro wide" id="emE" role="alert"></div><div class="actions wide"><button type="button" class="btn soft" data-close>Cancelar</button><button type="submit" class="btn">Revisar alterações</button></div></form>`);
  o.el.querySelector('#emF').onsubmit=e=>{e.preventDefault();const g=i=>o.el.querySelector('#'+i).value,err=o.el.querySelector('#emE');err.textContent='';
   const st=g('emSt'),ot=g('emOrcT'),ov=Number(g('emOrcV')),nm=g('emNome').trim();
   if(!st&&!ot&&!nm)return err.textContent='Escolha ao menos uma alteração.';
   if(ot&&!Number.isFinite(ov))return err.textContent='Informe o valor ou o percentual do orçamento.';
   const passos=itens.map(({o:x,n})=>{const campos={},linhas=[];
    if(st){campos.status=st;linhas.push(`status ${x.status} → ${st}`)}
    if(ot&&n!=='anuncio'){const atual=x.orcamento&&x.orcamento.diario;if(!atual)linhas.push('orçamento diário: este item não tem orçamento diário próprio (ignorado)');else{const novo=ot==='valor'?ov:Math.round(atual*(1+ov/100)*100)/100;campos.orcamentoDia=novo;linhas.push(`orçamento diário ${gmBrl(atual)} → ${gmBrl(novo)}${novo<6?' ⚠ abaixo do mínimo de 6':''}`)}}
    if(nm){campos.nome=(x.nome+' '+nm).slice(0,400);linhas.push(`nome → "${campos.nome}"`)}
    return {o:x,n,campos:Object.keys(campos).length?campos:null,rotulo:linhas.join('; ')||'sem alteração'}});
   o.close();tpRevisaoLote('Editar em massa',passos,'editar')};
}
/** Revisão: mostra item a item o que vai mudar; só envia depois da confirmação; registra o resultado de cada item (falha parcial não derruba o resto). */
function tpRevisaoLote(rot,passos,acao){
  const validos=passos.filter(p=>acao==='duplicar'||p.campos);
  const o=adminOverlay(`<h3>${esc(rot)}: revisar antes de enviar</h3><p class="kpi-note">${acao==='duplicar'?'A cópia nasce pausada, como no Gerenciador da Meta. ':''}Nada foi enviado ainda. Confira e confirme.</p>
   <div class="tablewrap"><table class="datatable"><thead><tr><th>Item</th><th>Nível</th><th>O que muda</th></tr></thead><tbody>${passos.map(p=>`<tr><td>${esc(p.o.nome)}<br><small>${esc(p.o.id)}</small></td><td>${esc(p.n)}</td><td>${esc(p.rotulo)}</td></tr>`).join('')}</tbody></table></div>
   <div class="actions"><button class="btn soft" data-close type="button">Cancelar</button><span class="cm-esp"></span><button class="btn ${acao==='arquivar'?'danger':''}" id="lvOk" type="button" ${validos.length?'':'disabled'}>Confirmar e enviar (${validos.length})</button></div>`);
  o.el.querySelector('#lvOk').onclick=async()=>{
    const b=o.el.querySelector('#lvOk');b.disabled=true;
    const box=o.el.querySelector('.admin-box'),res=[];
    box.insertAdjacentHTML('beforeend','<div id="lvR" class="tp-res"></div>');const R=box.querySelector('#lvR');
    for(const p of validos){
      R.insertAdjacentHTML('beforeend',`<div class="tp-res-l" data-r="${attr(p.o.id)}">⏳ ${esc(p.o.nome)}…</div>`);
      try{
        let r;
        if(acao==='duplicar')r=await gmPost('/ads/duplicar',{nivel:p.n,id:p.o.id});else r=await gmPost('/ads/editar',{nivel:p.n,id:p.o.id,campos:p.campos,confirmou:true});
        res.push({p,ok:true,antes:r.antes});R.querySelector(`[data-r="${p.o.id}"]`).innerHTML=`✓ ${esc(p.o.nome)}: concluído`;
        if(p.campos&&p.campos.status){p.o.status=p.campos.status;p.o.estado=p.campos.status}
      }catch(e){res.push({p,ok:false,erro:e.message});R.querySelector(`[data-r="${p.o.id}"]`).innerHTML=`✕ ${esc(p.o.nome)}: ${esc(e.message)}`}
    }
    const ok=res.filter(x=>x.ok),mal=res.filter(x=>!x.ok);
    R.insertAdjacentHTML('beforeend',`<p><b>${ok.length} concluído(s), ${mal.length} com falha.</b> Os itens que falharam não foram alterados.</p>`);
    const desf=acao!=='duplicar'?ok.filter(x=>x.antes&&(x.antes.status||x.antes.orcamentoDia||x.antes.nome)):[];
    if(desf.length)R.insertAdjacentHTML('beforeend','<button class="softbtn" id="lvDesfaz" type="button">Desfazer o que deu certo</button>');
    R.insertAdjacentHTML('beforeend','<button class="btn" id="lvFim" type="button">Fechar</button>');
    GM2.sel.clear();
    R.querySelector('#lvFim').onclick=()=>{o.close();tpRedesenhaTabela()};
    const d=R.querySelector('#lvDesfaz');if(d)d.onclick=async()=>{d.disabled=true;let n=0;for(const x of desf){const c={};if(x.antes.status)c.status=x.antes.status;if(x.antes.orcamentoDia)c.orcamentoDia=x.antes.orcamentoDia;if(x.antes.nome)c.nome=x.antes.nome;try{await gmPost('/ads/editar',{nivel:x.p.n,id:x.p.o.id,campos:c,confirmou:true});if(c.status){x.p.o.status=c.status;x.p.o.estado=c.status}n++}catch(e){toast(`Não foi possível desfazer "${x.p.o.nome}": ${e.message}`,'warn')}}toast(`${n} item(ns) revertido(s)`);d.remove();tpRedesenhaTabela()};
  };
}
// ---------- painel lateral de detalhes ----------
async function tpPainel(id){
  const [o,nivel]=gmAchar(id);if(!o)return;
  const orc=nivel==='anuncio'?null:o.orcamento,p=nivel==='conjunto'?o.publico:nivel==='anuncio'?(tpFlat('anuncio').find(x=>x.id===id)||{})._publico:null,cr=o.criativo||{};
  const lin=(r,v)=>v===undefined||v===null||v===''?'':`<dt>${esc(r)}</dt><dd>${v}</dd>`;
  const seg=tpSegDe({nome:o.nome,_pai:(tpFlat(nivel).find(x=>x.id===id)||{})._pai});
  const pn=tpPainelLateral(o.nome,`<div class="tp-det">
    <div class="tp-det-topo">${o.foto?`<img class="tp-det-foto" alt="" referrerpolicy="no-referrer" src="${attr(o.foto)}">`:''}<div>${gmBadge(o.estado)} <small>${nivel==='campanha'?'Campanha':nivel==='conjunto'?'Conjunto':'Anúncio'} · ${esc(o.codigo||'')} · ${esc(o.id)}</small><div class="tp-det-ac">${adsCompleto?`<button class="softbtn" data-pa="edit">Editar</button><button class="softbtn" data-pa="tog">${o.status==='ACTIVE'?'Pausar':'Ativar'}</button><button class="softbtn" data-pa="dup">Duplicar</button>`:''}<button class="softbtn" data-pa="mais">Todos os campos</button></div></div></div>
    <div class="tp-det-k"><div><small>Investimento</small><b>${esc(gmBrl(o.gasto))}</b></div><div><small>Resultados</small><b>${gmN(o.resultados)}</b><small>${esc(o.rotuloResultado||'')}</small></div><div><small>Custo/resultado</small><b>${esc(gmMoeda(o.resultados?o.custoResultado:null))}</b></div><div><small>CTR</small><b>${o.impressoes?gmPct(o.ctr):'—'}</b></div></div>
    <h4>Evolução</h4><div class="tf-chips" id="pnMet" role="group"></div><div id="pnGr"><div class="loading"><span></span><b>Lendo a série…</b></div></div>
    <h4>Configuração</h4><dl class="dc-dl">${lin('Objetivo',esc(GM_OBJ[o.objetivo]||o.objetivo||''))}${lin('Orçamento',orc?gmOrc(orc):'')}${lin('Início',o.inicio?esc(fmtDateTime(o.inicio)):'')}${lin('Término',o.fim?esc(fmtDateTime(o.fim)):'')}${lin('Criado em',o.criado?esc(fmtDateTime(o.criado)):'')}${lin('Última alteração',o.atualizado?esc(fmtDateTime(o.atualizado)):'')}${lin('Segmento escolar',seg?esc(seg)+' <small>(pelo nome)</small>':'')}${lin('Origem',esc(o.origem||''))}${lin('Público',p?esc(tpPublicoTxt(p)):'')}${lin('Posicionamentos',p?esc([...(p.plataformas||[]),...(p.posicionamentos||[])].join(', ')||'Automáticos'):'')}${lin('Otimização',esc(o.otimizacao||''))}</dl>
    ${nivel==='anuncio'?`<h4>Criativo</h4><dl class="dc-dl">${lin('Formato',esc(cr.formato))}${lin('Título',esc(cr.titulo))}${lin('Texto',esc(cr.texto))}${lin('Botão',esc(cr.cta))}${lin('Publicação',cr.instagram?`<a href="${attr(cr.instagram)}" target="_blank" rel="noopener">abrir no Instagram</a>`:'')}${lin('Conteúdo vinculado',o.conteudo?esc(o.conteudo.id+' · '+(o.conteudo.titulo||'')):'')}</dl>`:''}
    <h4>Histórico de alterações pelo EVO MKT</h4><div id="pnHist"><small class="kpi-note">Carregando…</small></div>
    <p class="kpi-note">Histórico local do EVO MKT; não é o histórico completo da Meta.</p></div>`,520);
  pn.querySelector('[data-pa="mais"]').onclick=()=>gmDetalhes(id);
  const ed=pn.querySelector('[data-pa="edit"]');if(ed)ed.onclick=()=>{pn.fechar();gmEditor(o,nivel)};
  const tg=pn.querySelector('[data-pa="tog"]');if(tg)tg.onclick=async()=>{const ativar=o.status!=='ACTIVE';if(!confirm(ativar?`Ativar "${o.nome}"? Volta a gastar.`:`Pausar "${o.nome}"?`))return;try{await gmPost('/ads/editar',{nivel,id,campos:{status:ativar?'ACTIVE':'PAUSED'}});o.status=ativar?'ACTIVE':'PAUSED';o.estado=o.status;toast('Alterado na Meta');pn.fechar();tpRedesenhaTabela()}catch(e){toast(e.message,'bad')}};
  const dp=pn.querySelector('[data-pa="dup"]');if(dp)dp.onclick=async()=>{if(!confirm(`Duplicar "${o.nome}"? A cópia nasce pausada.`))return;try{await gmPost('/ads/duplicar',{nivel,id});toast('Cópia criada (pausada)');pn.fechar();tpRecarrega()}catch(e){toast(e.message,'bad')}};
  // histórico local
  let hist=[];try{hist=((await api('/ads/acoes')).rows||[]).filter(x=>x.objeto_id===id)}catch{}
  pn.querySelector('#pnHist').innerHTML=hist.length?`<ul class="tp-lista">${hist.slice(0,8).map(h=>`<li><small>${esc(fmtDateTime(h.quando))} · ${esc(h.quem)}</small> ${esc(h.acao)} <span class="badge ${h.resultado==='OK'?'ok':'bad'}">${esc(h.resultado)}</span>${h.erro?`<br><small>${esc(h.erro)}</small>`:''}</li>`).join('')}</ul>`:'<small class="kpi-note">Nenhuma alteração feita pelo EVO MKT neste item.</small>';
  // série
  let met='gasto';const M={gasto:['Investimento',v=>gmBrl(v)],conversas:['Conversas',gmN],cliques:['Cliques',gmN],impressoes:['Impressões',gmN]};
  let serie=null;
  const grafico=()=>{const box=pn.querySelector('#pnGr');if(!serie)return;const marc=hist.map(h=>({x:String(h.quando).slice(0,10),rotulo:'alteração'})).filter(m=>serie.some(s=>s.dia===m.x));EvoCharts.linha(box,{dados:serie.map(s=>({x:s.dia,v:s[met]})),series:[{k:'v',nome:M[met][0],fmt:M[met][1]}],altura:190,marcadores:marc.map(m=>({x:m.x,rotulo:m.rotulo})),rotuloAcessivel:`${M[met][0]} por dia`});pn.querySelector('#pnMet').innerHTML=Object.entries(M).map(([k,v])=>`<button type="button" class="tf-chip ${met===k?'on':''}" data-m="${k}">${v[0]}</button>`).join('');pn.querySelectorAll('[data-m]').forEach(b=>b.onclick=()=>{met=b.dataset.m;grafico()})};
  try{serie=(await api(`/ads/serie?id=${encodeURIComponent(id)}&de=${gmDados.de}&ate=${gmDados.ate}`)).rows;if(!serie.length)pn.querySelector('#pnGr').innerHTML='<div class="ch-vazio">A Meta não devolveu dias com entrega neste período.</div>';else grafico()}catch(e){pn.querySelector('#pnGr').innerHTML=`<div class="ch-vazio">Série indisponível: ${esc(e.message)}</div>`}
}
// ---------- tela ----------
async function tpRecarrega(){await tpArvore(true);tpDesenhaGm()}
async function renderGerenciador(){
  state.module=null;
  await adsCarregaModo();await tpCfgCarrega();
  $('#content').innerHTML=`<div class="tp-topo"><div class="tf-head" style="margin:0"><div><small>TRÁFEGO PAGO · GERENCIADOR DE ANÚNCIOS</small><h1>Campanhas, conjuntos e anúncios</h1></div></div><div class="tp-topo-d">${tpSeletorPeriodo()}<span id="tpSaudeBox"></span><button class="softbtn" id="tpAtualiza">Atualizar</button>${adsCompleto?'<button class="btn" id="tpNova">+ Nova campanha</button>':''}</div></div><div id="tpGm"><div class="loading"><span></span><b>Lendo a conta na Meta…</b></div></div>`;
  tpLigaPeriodo(()=>renderGerenciador());
  $('#tpAtualiza').onclick=tpRecarrega;
  if($('#tpNova'))$('#tpNova').onclick=()=>novaCampanha();
  tpSaudeChip().then(h=>{const b=$('#tpSaudeBox');if(b){b.innerHTML=h;const bt=$('#tpSaude');if(bt)bt.onclick=tpAbrirSaude}});
  try{await tpArvore()}catch(e){if(state.page!=='gerenciador')return;$('#tpGm').innerHTML=`<div class="empty-rich"><strong>Não foi possível ler a conta</strong><p>${esc(e.message)}</p></div>`;return}
  if(state.page!=='gerenciador')return;
  // visualização padrão do nível
  for(const [n] of TP_NIVEIS){const pd=GM2.cfg.padrao[n];if(pd&&!GM2.cfg._aplicou){const v=(GM2.cfg.visoes[n]||[]).find(x=>x.id===pd);if(v){const c=GM2.cfg.nivel[n];c.modelo='v:'+v.id;c.cols=[...v.cols];c.larg={...(v.larg||{})};c.fixas=[...(v.fixas||[])]}}}
  GM2.cfg._aplicou=true;
  tpDesenhaGm();
}
