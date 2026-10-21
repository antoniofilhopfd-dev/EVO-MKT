/* Calendário único: compromissos, reuniões, coberturas, publicações, prazos, ações planejadas, eventos escolares e datas comemorativas.
   Não guarda nada próprio: lê as mesmas fontes de antes (calendário/agenda, conteúdos, solicitações, planejamento, calendário escolar e datas comemorativas)
   e abre cada item no formulário da sua origem. Nenhum registro é copiado; reagendar atualiza o registro original. */
const CAL_TIPOS=[
 {k:'COMPROMISSO',rotulo:'Reuniões e compromissos',glifo:'▪'},
 {k:'COBERTURA',rotulo:'Coberturas',glifo:'◉'},
 {k:'ACAO',rotulo:'Ações institucionais',glifo:'◆',classe:'t-PLANO'},
 {k:'ESCOLAR',rotulo:'Eventos escolares',glifo:'★',classe:'t-ESCOLAR'},
 {k:'DATA',rotulo:'Datas comemorativas',glifo:'✿',classe:'t-DATA'},
 {k:'FERIADO',rotulo:'Feriados',glifo:'⚐',classe:'t-FERIADO'},
];
const CAL_ROTULO_ORIGEM={mkt:'Marketing',esc:'Calendário escolar',dc:'Data comemorativa'};
let CAL_EU={nome:'',role:''};

/** Compromissos, reuniões, coberturas e ações institucionais: registros do Calendário (e da Agenda antiga, que continua aparecendo). */
async function calMktSomente(){
 const [cal,age]=await Promise.all([getRows('calendario',true),getRows('agenda',true)]);
 const itens=[];
 [['calendario',cal.rows],['agenda',age.rows]].forEach(([modulo,rows])=>(rows||[]).forEach(r=>{
  const [data,hora]=calMktDataHora(r);if(!data||/CANCEL/i.test(String(r.status||'')))return;
  const t=calMktTipoDe(r);
  const fimR=String(r.dataFim||r.fimEm||'').slice(0,10);
  itens.push({uid:modulo+':'+r.id,id:r.id,modulo,titulo:r.titulo,data,fim:fimR>data?fimR:'',hora,tipo:t==='COBERTURA'?'COBERTURA':t==='ACAO'?'ACAO':'COMPROMISSO',tipoOrigem:t,responsavel:r.responsavel||'',editavel:true,feito:/REALIZ|CONCLU/i.test(String(r.status||'')),raw:r,origem:'mkt'});
 }));
 return itens;
}
/** Reúne as fontes em uma lista só; uma fonte que falhar não derruba as demais. */
async function calCarregar(ano){
 const [mkt,esc_,dc]=await Promise.allSettled([calMktSomente(),escCarregar(),dcCarregar(ano)]);
 const itens=[];let eu=CAL_EU;
 if(mkt.status==='fulfilled')itens.push(...mkt.value);
 if(esc_.status==='fulfilled'){eu=esc_.value.eu||eu;esc_.value.itens.forEach(i=>itens.push({...i,origem:'esc',tipoOrigem:i.tipo,tipo:'ESCOLAR'}))}
 if(dc.status==='fulfilled')dc.value.itens.forEach(i=>{
  const r=i.raw,feriado=DC.grupoFeriados.includes(r.categoria);
  // todas as datas do ano entram; o filtro "Datas comemorativas" decide o que aparece (padrão: confirmadas que são feriado ou foram marcadas como relevantes)
  itens.push({...i,titulo:r.status==='pendente'?`${i.titulo} (pendente)`:i.titulo,origem:'dc',tipoOrigem:i.tipo,tipo:feriado?'FERIADO':'DATA',editavel:false});
 });
 let responsaveis=[];try{responsaveis=[...new Set((await getRows('equipe')).rows.map(x=>x.titulo).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'))}catch{}
 CAL_EU=eu;
 return {itens:itens.map(calEncurta),opcoes:{responsaveis},eu,podeEditar:true,falhas:[mkt,esc_,dc].filter(x=>x.status==='rejected').length};
}
function calAbrir(it){
 if(it.origem==='esc')return escAbrir(it);
 if(it.origem==='dc')return dcAbrir(it);
 return calMktForm({...it,tipo:it.tipoOrigem});
}
async function calMover(it,data){
 if(it.origem==='esc')return escPost('/escolar/mover',{id:it.id,data});
 if(it.origem==='dc')throw new Error('Datas comemorativas são calculadas pelo sistema e não são reagendadas.');
 return calMktMover(it,data);
}
/** "+ Novo": escolhe o tipo de item; cada opção abre o formulário que já existia. */
function calNovo(data){
 const o=adminOverlay(`<h3>O que você quer criar?</h3><p class="kpi-note">${data?`Dia ${esc(String(data).split('-').reverse().join('/'))}. `:''}Cada opção abre o formulário do tipo escolhido.</p>
  <div class="cal-escolha">
   <button type="button" class="softbtn" data-n="mkt">Reunião, compromisso, cobertura ou ação institucional</button>
   <button type="button" class="softbtn" data-n="esc">Evento do calendário escolar</button>
   <button type="button" class="softbtn" data-n="dc">Data comemorativa própria</button>
  </div><div class="actions"><span class="cm-esp"></span><button type="button" class="btn soft" data-close>Cancelar</button></div>`);
 o.el.querySelectorAll('[data-n]').forEach(b=>b.onclick=async()=>{
  const k=b.dataset.n;o.close();
  try{
   if(k==='mkt')return calMktForm(null,data);
   if(k==='esc'){await escCarregar();return escForm(null,data)}
   if(k==='dc'){await dcCarregar(Number(String(data||'').slice(0,4))||new Date().getFullYear());return dcForm(null,data)}
  }catch(e){toast(e.message,'warn')}
 });
}
/** Ação ou evento muito longo aparece só no primeiro dia (e na lista); repetir em todos os dias poluiria o calendário. */
const calEncurta=i=>{if(i.fim&&(CalMotor.dataDe(i.fim)-CalMotor.dataDe(i.data))/86400000>6)return {...i,fim:'',periodo:i.data+'→'+i.fim};return i};
const CAL_UNICO=CalMotor.criar({
 chave:'calendario',semTipos:true,tituloPagina:'Calendário',eyebrow:'CALENDÁRIO',rotuloNovo:'+ Novo',
 descricao:'Tudo o que tem data no marketing e no colégio, em um só lugar. Clique em um dia para criar; arraste para reagendar.',
 tipos:CAL_TIPOS,carregar:calCarregar,novo:calNovo,abrir:calAbrir,mover:calMover,porAno:true,
 modos:[['week','Semana'],['month','Mês'],['day','Dia'],['list','Lista'],['year','Ano']],modoPadrao:'week',listaEscopo:'ano',busca:true,filtrosCompactos:true,
 filtrosExtras:[
  {chave:'grupo',vazio:'Todas as datas comemorativas',opcoes:()=>[['feriados','Só feriados'],['educacionais','Só datas educacionais']],testa:(i,v)=>!v||i.origem!=='dc'||(v==='feriados'?DC.grupoFeriados.includes(i.raw.categoria):i.raw.categoria==='EDUCACIONAL')},
  {chave:'validacao',vazio:'Datas confirmadas',opcoes:()=>[['pendentes','Pendentes de validação'],['todas','Todas (inclui pendentes e não relevantes)']],
   testa:(i,v)=>i.origem!=='dc'||(v==='todas'?true:v==='pendentes'?i.raw.status==='pendente':i.raw.status==='confirmada'&&(DC.grupoFeriados.includes(i.raw.categoria)||i.raw.relevante==='SIM'))},
  {chave:'segmento',vazio:'Todos os segmentos (escolar)',opcoes:()=>(ESC_OPC.segmentos||[]).map(([k,l])=>[k,l]),testa:(i,v)=>!v||i.origem!=='esc'||i.segmentos.includes(v)||i.segmentos.includes('TODOS')},
 ],
 alternancias:[{chave:'relevantes',rotulo:'Só datas relevantes',testa:i=>i.origem!=='dc'||i.raw.relevante==='SIM'}],
 detalhe:i=>i.origem==='esc'?escSegTxt(i.raw):i.origem==='dc'?i.raw.regra:[i.raw&&i.raw.tipoItem,i.raw&&i.raw.segmento&&i.raw.segmento!=='Geral'?i.raw.segmento:''].filter(Boolean).join(' · '),
 classeDia:lista=>lista.some(i=>i.tipo==='FERIADO')?'feriado':'',
});
/** Abre o Calendário único já filtrado (links antigos para Escolar e Datas Comemorativas). */
function calUnicoFoco(tipos){CAL_UNICO.mostrarSo(tipos)}
let calSincTimer=null;
/** Traz as mudanças feitas direto no Google Agenda: ao abrir o Calendário e a cada 2 minutos enquanto ele estiver aberto. */
async function calSincGoogle(){
 try{const r=await api('/integrations/google/calendar/sync?leve=1',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
  if(r&&!r.pulou&&((r.do_google||0)+(r.criados||0)+(r.removidos||0))>0&&state.page==='calendario'){invalidate('calendario');invalidate('agenda');CAL_UNICO.recarregar()}}catch{}
}
async function renderCalendarUnico(){
 CalMotor.redirecionar=()=>CAL_UNICO.recarregar();
 clearInterval(calSincTimer);calSincTimer=setInterval(()=>{if(state.page!=='calendario'){clearInterval(calSincTimer);return}calSincGoogle()},120000);
 setTimeout(calSincGoogle,1500);
 return CAL_UNICO.render();
}
