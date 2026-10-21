/* Tráfego Pago: base compartilhada e Visão Geral personalizável.
   Aqui ficam o período comum, a leitura da conta (campanhas > conjuntos > anúncios), as preferências por usuário e a Visão Geral em cartões
   que cada pessoa pode adicionar, remover, reordenar e redimensionar (layout salvo no servidor, por usuário).
   Os demais módulos do Tráfego (Gerenciador, Criativos, Públicos, Análises, Orçamentos, Alertas, Relatórios, Histórico) usam estes recursos. */
const TP={per:null,carregando:null,prefs:new Map()};
[['tfcriativos','Criativos','▣'],['tfanalises','Análises','◧'],['tfpublicos','Públicos','◍'],['tforcamentos','Orçamentos','◔'],['tfalertas','Alertas e automações','⚑'],['tfrelatorios','Relatórios de anúncios','▥'],['tfhistorico','Histórico','◷']].forEach(([k,l,i])=>{MODULES[k]={label:l,icon:i,group:'Tráfego',tone:'orange',desc:'Tráfego Pago'}});
const TP_PERIODOS=[['hoje','Hoje'],['ontem','Ontem'],['hoje_ontem','Hoje e ontem'],['3','Últimos 3 dias'],['7','Últimos 7 dias'],['14','Últimos 14 dias'],['28','Últimos 28 dias'],['30','Últimos 30 dias'],['90','Últimos 90 dias'],['semana','Esta semana'],['semana_ant','Semana passada'],['mes','Este mês'],['mes_ant','Mês anterior'],['trim','Este trimestre'],['ano','Este ano'],['ano_ant','Ano passado'],['x','Personalizado']];
const tpIso=d=>new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);
function tpIntervalo(p,de,ate){return PeriodoPicker.intervalo(p,de,ate)}
const tpPeriodo=()=>{if(!TP.per){const s=pref('trafego.periodo',null)||{p:'30'};TP.per={p:s.p||'30',de:s.de||'',ate:s.ate||''};const [a,b]=tpIntervalo(TP.per.p,TP.per.de,TP.per.ate);TP.per.de=a;TP.per.ate=b}return TP.per};
/** Abre o relatório semanal (PDF) já no período escolhido no Tráfego; lá o período continua editável. */
function tpLinkRelatorio(el){if(!el)return;el.addEventListener('click',()=>{const p=tpPeriodo();el.href='/relatorio-trafego.html?de='+encodeURIComponent(p.de)+'&ate='+encodeURIComponent(p.ate)})}
function tpDefinePeriodo(p,de,ate){const [a,b]=tpIntervalo(p,de,ate);TP.per={p,de:a,ate:b};setPref('trafego.periodo',TP.per)}
/** Seletor de período (rápido ou personalizado). aoMudar é chamado depois de escolher. */
function tpSeletorPeriodo(){const per=tpPeriodo();return `<div class="tp-per"><select id="tpPer" class="control" aria-label="Período das métricas">${TP_PERIODOS.map(([k,l])=>`<option value="${k}" ${per.p===k?'selected':''}>${l}</option>`).join('')}</select><button type="button" class="tp-per-t" id="tpPerBtn" title="Escolher o primeiro e o último dia" aria-label="Escolher período: ${attr(fmtDate(per.de))} a ${attr(fmtDate(per.ate))}">📅 ${esc(fmtDate(per.de))} a ${esc(fmtDate(per.ate))}</button></div>`}
/** Um único modal para escolher o primeiro e o último dia (ver periodo.js). */
function tpAbrePeriodo(aoMudar){const per=tpPeriodo();PeriodoPicker.abrir({de:per.de,ate:per.ate,titulo:'Período das métricas',max:tpIso(new Date())},(de,ate)=>{tpDefinePeriodo('x',de,ate);aoMudar()})}
function tpLigaPeriodo(aoMudar){
  const sel=$('#tpPer');if(!sel)return;
  sel.onchange=()=>{if(sel.value==='x'){sel.value=tpPeriodo().p;tpAbrePeriodo(aoMudar);return}tpDefinePeriodo(sel.value);aoMudar()};
  $('#tpPerBtn')&&($('#tpPerBtn').onclick=()=>tpAbrePeriodo(aoMudar));
}

// ---------- preferências por usuário (servidor), com cache e gravação com atraso ----------
async function tpPrefGet(chave,padrao){
  if(TP.prefs.has(chave))return TP.prefs.get(chave);
  let v=padrao;try{const r=await api('/prefs?chave='+encodeURIComponent(chave));if(r.valor!==null&&r.valor!==undefined)v=JSON.parse(r.valor)}catch{}
  TP.prefs.set(chave,v);return v;
}
function tpPrefSet(chave,valor){
  TP.prefs.set(chave,valor);clearTimeout(tpPrefSet['_'+chave]);
  tpPrefSet['_'+chave]=setTimeout(()=>api('/prefs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chave,valor})}).catch(e=>toast('Não foi possível salvar a preferência: '+e.message,'warn')),250);
}

// ---------- leitura da conta ----------
/** Lê campanhas, conjuntos e anúncios do período (guarda em gmDados, que os editores antigos também usam). */
async function tpArvore(forcar=false){
  const {de,ate}=tpPeriodo();
  if(!forcar&&gmDados&&gmDados.de===de&&gmDados.ate===ate&&Date.now()-(TP.lido||0)<90000)return gmDados;
  if(TP.carregando)return TP.carregando;
  TP.carregando=api(`/ads/arvore?de=${de}&ate=${ate}&arquivados=1${forcar?'&f=1':''}`).then(d=>{gmDados=d;TP.lido=Date.now();if(d.aviso&&typeof toast==='function')toast(d.aviso,'warn');return d}).finally(()=>{TP.carregando=null});
  return TP.carregando;
}
function tpFlat(nivel,d=gmDados){
  const o=[];if(!d)return o;
  for(const c of d.campanhas){
    if(nivel==='campanha'){o.push({...c,_nivel:'campanha',_pai:'',_campanha:c.id,_conjunto:''});continue}
    for(const j of c.conjuntos){
      if(nivel==='conjunto'){o.push({...j,_nivel:'conjunto',_pai:c.nome,_campanha:c.id,_conjunto:j.id,_objetivo:c.objetivo,_orcCamp:c.orcamento});continue}
      for(const a of j.anuncios)o.push({...a,_nivel:'anuncio',_pai:`${c.nome} › ${j.nome}`,_campanha:c.id,_conjunto:j.id,_objetivo:c.objetivo,_publico:j.publico,_orcCamp:c.orcamento});
    }
  }
  return o;
}
const TP_SEG=[['Educação Infantil',/infantil|\bei\b|creche|maternal|jardim/i],['Fundamental — Anos Iniciais',/anos iniciais|fund(amental)?\.?\s*(i|1)\b|\bef\s*1\b|1[ºo°]\s*(ao|a)\s*5/i],['Fundamental — Anos Finais',/anos finais|fund(amental)?\.?\s*(ii|2)\b|\bef\s*2\b|6[ºo°]\s*(ao|a)\s*9/i],['Ensino Médio',/ensino m[eé]dio|m[eé]dio|\bem\b/i]];
/** Segmento escolar identificado pelo nome da campanha, conjunto ou anúncio (a Meta não tem esse campo). Vazio = não identificado. */
const tpSegmento=nome=>{const t=String(nome||'');for(const [r,re] of TP_SEG)if(re.test(t))return r;return ''};
const tpSegDe=x=>tpSegmento(`${x.nome||''} ${x._pai||''}`);

const TP_STATUS_GRUPOS={ativos:e=>e==='ACTIVE',pausados:e=>/PAUSED/.test(e),analise:e=>/PENDING_REVIEW|IN_PROCESS|PENDING_PROCESSING/.test(e),reprovados:e=>e==='DISAPPROVED',problemas:e=>/WITH_ISSUES|DISAPPROVED|PENDING_BILLING_INFO/.test(e),arquivados:e=>e==='ARCHIVED'};
const tpEstadoDe=x=>String(x.estado||x.status||'').toUpperCase();

/** Linha de ações rápidas do cabeçalho do Tráfego (status da integração e atalhos). */
async function tpSaudeChip(){
  let s;try{s=await api('/ads/saude')}catch{return ''}
  const ok=s.conectado&&s.permissoes[0].ok;
  return `<button type="button" class="tp-saude ${ok?'ok':'ruim'}" id="tpSaude" title="Ver a saúde da integração com a Meta"><i></i>${ok?'Meta conectada':s.conectado?'Meta com pendências':'Meta desconectada'}</button>`;
}
async function tpAbrirSaude(){
  let s;try{s=await api('/ads/saude')}catch(e){return toast(e.message,'bad')}
  const o=adminOverlay(`<h3>Saúde da integração com a Meta</h3>
   <dl class="dc-dl"><dt>Conta de anúncios</dt><dd>${s.conta?'act_'+esc(s.conta):'não escolhida'}</dd><dt>Conexão</dt><dd>${s.conectado?'Conectada':s.token?'Acesso expirado ou revogado':'Desconectada'}</dd>${s.estadoConta?`<dt>Estado da conta</dt><dd>${esc(s.estadoConta.rotulo)}</dd>`:''}<dt>Última sincronização</dt><dd>${s.ultimaSync?esc(fmtDateTime(s.ultimaSync)):'nunca'}</dd></dl>
   <h4>Permissões</h4><ul class="tp-lista">${s.permissoes.map(p=>`<li><span class="badge ${p.ok?'ok':'bad'}">${p.ok?'concedida':'ausente'}</span> <b>${esc(p.nome)}</b> <small>${esc(p.para)}</small></li>`).join('')}</ul>
   <h4>Operações liberadas</h4><ul class="tp-lista">${s.permitidas.map(x=>`<li>✓ ${esc(x)}</li>`).join('')||'<li>Nenhuma</li>'}</ul>
   ${s.bloqueadas.length?`<h4>Operações bloqueadas</h4><ul class="tp-lista">${s.bloqueadas.map(x=>`<li>✕ ${esc(x)}</li>`).join('')}</ul>`:''}
   ${s.falhasRecentes.length?`<h4>Falhas recentes</h4><ul class="tp-lista">${s.falhasRecentes.map(f=>`<li><small>${esc(fmtDateTime(f.quando))}</small> ${esc(f.mensagem)}</li>`).join('')}</ul>`:''}
   <p class="kpi-note">As credenciais nunca aparecem aqui. Reconecte ou ajuste o modo completo em Configurações → Integrações.</p>
   <div class="actions"><button class="softbtn" id="tpSaudeCfg" type="button">Abrir Integrações</button><span class="cm-esp"></span><button class="btn soft" data-close type="button">Fechar</button></div>`);
  o.el.querySelector('#tpSaudeCfg').onclick=()=>{o.close();adminTab='integracoes';go('configuracoes')};
}

// ================= Visão Geral personalizável =================
const TP_TAM={1:'Pequeno',2:'Médio',3:'Grande',4:'Largura total'};
function tpCartoes(){
  const d=tfDados,m=d.mes,a=d.mesAnterior,dia=d.diario.slice(-14),mk=k=>dia.map(x=>Number(x[k])||0);
  const cpr=x=>x.resultados?x.gasto/x.resultados:0,ctr=x=>x.impressoes?x.cliques/x.impressoes*100:0,cpc=x=>x.cliques?x.gasto/x.cliques:0,cpm=x=>x.impressoes?x.gasto/x.impressoes*1000:0,freq=x=>x.alcance?x.impressoes/x.alcance:0;
  const rotAnt=tfMes(d.anterior).split(' de ')[0],cor='var(--blue,#063996)';
  const tile=(id,titulo,valor,delta,spark,explica)=>({id,titulo,tam:1,html:()=>`<div class="tf-tile" title="${attr(explica||'')}"><small>${esc(titulo)}</small><strong>${valor}</strong>${delta}${spark}</div>`});
  const camps=(tfSnap.rows||[]).filter(r=>r.periodo===d.periodo);
  const ativas=camps.filter(r=>/ACTIVE/i.test(r.status||'')).length;
  const anunAtivos=(d.anuncios||[]).filter(x=>x.ativo).length;
  const ranking=(id,titulo,lista,fmt,vazio)=>({id,titulo,tam:2,html:()=>`<div class="tp-rank"><h3>${esc(titulo)}</h3>${lista.length?`<ol>${lista.slice(0,5).map(x=>`<li><span class="tp-rk-n">${esc(x.nome)}<small>${esc(x.sub||'')}</small></span><b>${esc(fmt(x))}</b></li>`).join('')}</ol>`:`<p class="tf-nota">${esc(vazio)}</p>`}</div>`});
  const ads=(d.anuncios||[]).filter(x=>x.gasto>0);
  const comRes=ads.filter(x=>x.resultados>0).map(x=>({nome:x.anuncio,sub:x.campanha,v:x.gasto/x.resultados,x})).sort((p,q)=>p.v-q.v);
  const caros=ads.filter(x=>x.gasto>0).map(x=>({nome:x.anuncio,sub:x.campanha,v:x.resultados?x.gasto/x.resultados:x.gasto,sem:!x.resultados,x})).sort((p,q)=>(q.sem-p.sem)||(q.v-p.v));
  const problemas=(d.anuncios||[]).filter(x=>x.problema||/DISAPPROVED|WITH_ISSUES/i.test(x.status||'')).map(x=>({nome:x.anuncio,sub:x.campanha,v:x.problema||tfStatusRot(x.status)}));
  return [
   {id:'inv',titulo:'Investimento do mês',tam:2,html:()=>`<div class="tf-hero-n"><small>Investimento em ${esc(tfMes(d.periodo))}</small><strong>${esc(tfBrl(m.gasto))}</strong>${tfDelta(m.gasto,a.gasto,0,rotAnt)}</div>`},
   {id:'orc',titulo:'Orçamento do mês',tam:2,html:()=>tfOrcamento()},
   tile('conv','Conversas iniciadas',tfN(m.conversas),tfDelta(m.conversas,a.conversas,1,rotAnt),tfSpark(mk('conversas'),cor),'Conversas iniciadas pelos anúncios (dado da Meta)'),
   tile('cconv','Custo por conversa',m.conversas?tfBrl(m.gasto/m.conversas):'—',tfDelta(m.conversas?m.gasto/m.conversas:0,a.conversas?a.gasto/a.conversas:0,-1,rotAnt),tfSpark(dia.map(x=>x.conversas?x.gasto/x.conversas:0),cor),'Investimento dividido pelas conversas'),
   tile('res','Resultados',tfN(m.resultados),tfDelta(m.resultados,a.resultados,1,rotAnt),tfSpark(mk('resultados'),cor),'Resultados informados pela Meta (conversas e leads)'),
   tile('cres','Custo por resultado',m.resultados?tfBrl(cpr(m)):'—',tfDelta(cpr(m),cpr(a),-1,rotAnt),tfSpark(dia.map(x=>x.resultados?x.gasto/x.resultados:0),cor),'Investimento dividido pelos resultados'),
   tile('alc','Alcance',tfN(m.alcance),tfDelta(m.alcance,a.alcance,1,rotAnt),'','Pessoas alcançadas no mês'),
   tile('imp','Impressões',tfN(m.impressoes),tfDelta(m.impressoes,a.impressoes,0,rotAnt),tfSpark(mk('impressoes'),cor),'Vezes em que os anúncios apareceram'),
   tile('cli','Cliques',tfN(m.cliques),tfDelta(m.cliques,a.cliques,1,rotAnt),tfSpark(mk('cliques'),cor),'Cliques nos anúncios'),
   tile('ctr','CTR',m.impressoes?tfPct(ctr(m)):'—',tfDelta(ctr(m),ctr(a),1,rotAnt),tfSpark(dia.map(x=>x.impressoes?x.cliques/x.impressoes*100:0),cor),'Cliques ÷ impressões'),
   tile('cpc','CPC',m.cliques?tfBrl(cpc(m)):'—',tfDelta(cpc(m),cpc(a),-1,rotAnt),'','Custo por clique'),
   tile('cpm','CPM',m.impressoes?tfBrl(cpm(m)):'—',tfDelta(cpm(m),cpm(a),0,rotAnt),'','Custo por mil impressões'),
   tile('freq','Frequência',m.alcance?tfPct(freq(m)).replace('%',''):'—',tfDelta(freq(m),freq(a),0,rotAnt),'','Impressões ÷ alcance'),
   tile('camp_at','Campanhas ativas',camps.length?tfN(ativas):'—','<span class="tf-d">no mês atual</span>','','Campanhas com status ativo na última leitura'),
   tile('anun_at','Anúncios ativos',(d.anuncios||[]).length?tfN(anunAtivos):'—','<span class="tf-d">em veiculação</span>','','Anúncios em veiculação (anúncio, conjunto e campanha ativos)'),
   {id:'graf',titulo:'Evolução por dia',tam:3,html:()=>`<div class="tf-cab"><h3>Por dia</h3><div class="tf-chips" role="group" aria-label="Métrica">${Object.entries(TF_MET).map(([k,v])=>`<button type="button" class="tf-chip ${tfMetrica===k?'on':''}" data-met="${k}" aria-pressed="${tfMetrica===k}">${v[0]}</button>`).join('')}</div><div class="tf-chips" role="group" aria-label="Período">${[7,14,30,60].map(n=>`<button type="button" class="tf-chip ${tfDias===n?'on':''}" data-dias="${n}" aria-pressed="${tfDias===n}">${n} dias</button>`).join('')}</div></div>${tfGrafico()}${tfTabelaDiaria()}`},
   {id:'barras',titulo:'Investimento por campanha',tam:1,html:()=>`<div class="tf-cab"><h3>Investimento por campanha</h3></div>${tfBarras()}`},
   {id:'tab_camp',titulo:'Tabela de campanhas',tam:4,html:()=>`<div class="tf-cab"><h3>Campanhas</h3><small>Ordene por status ou data de início</small></div>${tfTabelaCampanhas()}`},
   {id:'tab_anun',titulo:'Tabela de anúncios',tam:4,html:()=>`<div class="tf-cab"><h3>Anúncios do mês</h3><small>Ordene por status ou data de início</small></div>${tfTabelaAnuncios()}`},
   {id:'alertas',titulo:'Alertas',tam:2,html:()=>`<div class="tf-cab"><h3>Alertas</h3></div><div class="tf-alertas">${tfAlertas()}</div>`},
   ranking('rk_melhores','Anúncios com melhor custo por resultado',comRes,x=>tfBrl(x.v),'Nenhum anúncio com resultado no mês.'),
   ranking('rk_caros','Anúncios com custo elevado (ou sem resultado)',caros,x=>x.sem?`${tfBrl(x.v)} sem resultado`:tfBrl(x.v),'Nenhum anúncio com gasto no mês.'),
   ranking('rk_problemas','Anúncios com problema de entrega',problemas,x=>x.v,'Nenhum problema de entrega informado pela Meta.'),
  ];
}
const TP_PADRAO=['inv','orc','conv','cconv','res','cres','alc','imp','cli','ctr','graf','barras','tab_camp','tab_anun','alertas'];
function tpLayout(cartoes,salvo){
  const ids=new Set(cartoes.map(c=>c.id));
  const ordem=(salvo&&Array.isArray(salvo.ordem)?salvo.ordem.filter(i=>ids.has(i)):TP_PADRAO.filter(i=>ids.has(i)));
  const tam={};cartoes.forEach(c=>{tam[c.id]=salvo&&salvo.tam&&[1,2,3,4].includes(salvo.tam[c.id])?salvo.tam[c.id]:c.tam});
  return {ordem,tam};
}
let tpEdicao=false;
function tpDesenhaVisao(lay){
  const cartoes=tpCartoes(),porId=new Map(cartoes.map(c=>[c.id,c]));
  const visiveis=lay.ordem.map(i=>porId.get(i)).filter(Boolean),ocultos=cartoes.filter(c=>!lay.ordem.includes(c.id));
  const d=tfDados,sa=d.saude;
  const status=sa?`<span class="tf-st ${sa.ok?'ok':'ruim'}"><b aria-hidden="true">${sa.ok?'●':'⚠'}</b> Conta: ${esc(sa.rotulo)}</span>`:'';
  return `<div class="tf tp-visao${tpEdicao?' editando':''}">
   <div class="tf-head"><div><small>TRÁFEGO PAGO · META ADS</small><h1>Visão geral</h1><p>${esc(tfMes(d.periodo))}, em andamento. ${d.ultimaSync?`Atualizado em ${esc(fmtDateTime(d.ultimaSync))}.`:'Ainda não sincronizado.'}</p></div>
    <div class="tf-acoes">${status}<span id="tpSaudeBox"></span><button class="softbtn" id="tfAtualiza" type="button">Atualizar agora</button><a class="softbtn" href="/relatorio-trafego.html" id="tpRelSemanalVg">Relatório semanal (PDF)</a><button class="softbtn ${tpEdicao?'on':''}" id="tpPers" type="button" aria-pressed="${tpEdicao}">${tpEdicao?'Concluir personalização':'Personalizar'}</button><button class="btn" id="tfGer" type="button">Gerenciador de anúncios →</button></div></div>
   ${tpEdicao?`<div class="tp-edbar card"><b>Personalizar a visão geral</b><span>Arraste os cartões, use as setas, mude o tamanho ou oculte. Suas escolhas ficam salvas só para você.</span>
     <label>Adicionar cartão <select id="tpAdd" class="control"><option value="">Escolher…</option>${ocultos.map(c=>`<option value="${attr(c.id)}">${esc(c.titulo)}</option>`).join('')}</select></label><button class="softbtn" id="tpPadrao" type="button">Restaurar padrão</button></div>`:''}
   <div class="tp-grade">${visiveis.map(c=>`<section class="tp-cartao ${c.id==='inv'||c.id==='orc'?'card tf-hero-c':'card'}" data-cartao="${attr(c.id)}" style="grid-column:span ${lay.tam[c.id]}" ${tpEdicao?'draggable="true"':''}>${tpEdicao?`<div class="tp-ctl"><span class="tp-tit">${esc(c.titulo)}</span><button type="button" data-mv="-1" aria-label="Mover para trás">◀</button><button type="button" data-mv="1" aria-label="Mover para frente">▶</button><button type="button" data-tm="1" title="Mudar o tamanho (${TP_TAM[lay.tam[c.id]]})">▣ ${TP_TAM[lay.tam[c.id]]}</button><button type="button" data-ocultar="1" aria-label="Ocultar">✕</button></div>`:''}${c.html()}</section>`).join('')||'<div class="empty-rich"><strong>Nenhum cartão na visão</strong><p>Use “Adicionar cartão” ou restaure o padrão.</p></div>'}</div>
   <p class="tf-nota tf-rodape">Números lidos da Meta. Variações mostram a diferença para o mês anterior sem dizer se é bom ou ruim: aumento de custo, por exemplo, não é melhoria.</p></div>`;
}
async function tpRenderVisao(){
  const host=$('#content');host.innerHTML='<div class="loading"><span></span><b>Lendo a conta na Meta…</b></div>';
  let d,s;
  try{[d,s]=await Promise.all([api('/traffic/painel'),api('/traffic/snapshots')])}catch(e){host.innerHTML=`<div class="empty-rich"><strong>Não foi possível ler os anúncios</strong><p>${esc(e.message)}</p></div>`;return}
  if(state.page!=='trafego')return;
  if(!s.conta){host.innerHTML=`<div class="empty-rich"><strong>Conta de anúncios ainda não escolhida</strong><p>Conecte a Meta e escolha a conta em Configurações → Integrações para ver os dados de anúncios.</p><button class="btn" id="tpIrCfg">Abrir Integrações</button></div>`;$('#tpIrCfg').onclick=()=>{adminTab='integracoes';go('configuracoes')};return}
  tfDados=d;tfSnap=s;
  const salvo=await tpPrefGet('trafego.layout',null);
  const redesenha=()=>{const lay=tpLayout(tpCartoes(),TP.layout);host.innerHTML=tpDesenhaVisao(lay);ligaVisao(lay)};
  TP.layout=salvo;
  const salva=lay=>{TP.layout={ordem:lay.ordem,tam:lay.tam};tpPrefSet('trafego.layout',TP.layout)};
  function ligaVisao(lay){
    tpSaudeChip().then(h=>{const b=$('#tpSaudeBox');if(b){b.innerHTML=h;const bt=$('#tpSaude');if(bt)bt.onclick=tpAbrirSaude}});
    $('#tpPers').onclick=()=>{tpEdicao=!tpEdicao;redesenha()};tpLinkRelatorio($('#tpRelSemanalVg'));
    $('#tfGer').onclick=()=>go('gerenciador');
    $$('[data-met]').forEach(b=>b.onclick=()=>{tfMetrica=b.dataset.met;redesenha()});
    $$('[data-dias]').forEach(b=>b.onclick=()=>{tfDias=+b.dataset.dias;redesenha()});
    const dir=k=>['nome','custo','status','inicio'].includes(k)?1:-1;
    $$('[data-ord]').forEach(b=>b.onclick=()=>{const k=b.dataset.ord;tfOrd=tfOrd.k===k?{k,d:-tfOrd.d}:{k,d:dir(k)};redesenha()});
    $$('[data-ordc]').forEach(b=>b.onclick=()=>{const k=b.dataset.ordc;tfOrdC=tfOrdC.k===k?{k,d:-tfOrdC.d}:{k,d:dir(k)};redesenha()});
    const at=$('#tfAtualiza');at.onclick=async()=>{at.disabled=true;at.textContent='Atualizando…';try{const r=await api('/integrations/ads/sync',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});toast(`${r.linhas??0} linha(s) atualizadas`);tpRenderVisao()}catch(e){toast(e.message,'warn');at.disabled=false;at.textContent='Atualizar agora'}};
    const orc=$('#tfOrc');if(orc)orc.onclick=async()=>{const v=prompt('Orçamento de anúncios do mês (R$). Deixe vazio para remover:',tfDados.orcamentoMensal||'');if(v===null)return;try{await api('/integrations/ads/orcamento',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({valor:Number(String(v).replace(',','.'))||0})});tpRenderVisao()}catch(e){toast(e.message,'warn')}};
    tfLigaGrafico();
    $$('.tf-bar').forEach(el=>{const f=ev=>tfMostra(ev,[el.dataset.g,el.dataset.n,el.dataset.r]);el.onpointermove=f;el.onpointerleave=tfEscondeDica;el.onfocus=()=>{const r=el.getBoundingClientRect();f({clientX:r.left+40,clientY:r.top})};el.onblur=tfEscondeDica});
    if(!tpEdicao)return;
    const cartoes=$$('[data-cartao]');
    const mover=(id,delta)=>{const o=[...lay.ordem],i=o.indexOf(id),j=i+delta;if(j<0||j>=o.length)return;[o[i],o[j]]=[o[j],o[i]];lay.ordem=o;salva(lay);redesenha()};
    cartoes.forEach(c=>{
      const id=c.dataset.cartao;
      c.querySelector('[data-mv="-1"]').onclick=()=>mover(id,-1);c.querySelector('[data-mv="1"]').onclick=()=>mover(id,1);
      c.querySelector('[data-tm]').onclick=()=>{lay.tam[id]=lay.tam[id]%4+1;salva(lay);redesenha()};
      c.querySelector('[data-ocultar]').onclick=()=>{lay.ordem=lay.ordem.filter(x=>x!==id);salva(lay);redesenha()};
      c.ondragstart=e=>{e.dataTransfer.setData('text/plain',id);e.dataTransfer.effectAllowed='move';c.classList.add('arrastando')};
      c.ondragend=()=>c.classList.remove('arrastando');
      c.ondragover=e=>{e.preventDefault();c.classList.add('sobre')};c.ondragleave=()=>c.classList.remove('sobre');
      c.ondrop=e=>{e.preventDefault();c.classList.remove('sobre');const de=e.dataTransfer.getData('text/plain');if(!de||de===id)return;const o=lay.ordem.filter(x=>x!==de),i=o.indexOf(id);o.splice(i,0,de);lay.ordem=o;salva(lay);redesenha()};
    });
    $('#tpAdd').onchange=e=>{if(!e.target.value)return;lay.ordem=[...lay.ordem,e.target.value];salva(lay);redesenha()};
    $('#tpPadrao').onclick=()=>{if(!confirm('Voltar ao layout padrão da visão geral?'))return;TP.layout=null;tpPrefSet('trafego.layout',null);redesenha()};
  }
  redesenha();
}
// A Visão Geral substitui a tela antiga do Tráfego (que somava vários painéis injetados).
renderTrafficWorkspace=async function(){state.module=null;return tpRenderVisao()};
