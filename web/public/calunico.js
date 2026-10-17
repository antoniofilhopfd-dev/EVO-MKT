/* Calendário único: compromissos, reuniões, coberturas, publicações, prazos, ações planejadas, eventos escolares e datas comemorativas.
   Não guarda nada próprio: lê as mesmas fontes de antes (calendário/agenda, conteúdos, solicitações, planejamento, calendário escolar e datas comemorativas)
   e abre cada item no formulário da sua origem. Nenhum registro é copiado; reagendar atualiza o registro original. */
const CAL_TIPOS=[
 {k:'COMPROMISSO',rotulo:'Compromissos',glifo:'▪'},
 {k:'COBERTURA',rotulo:'Coberturas',glifo:'◉'},
 {k:'PUBLICACAO',rotulo:'Publicações',glifo:'✎'},
 {k:'PLANO',rotulo:'Ações',glifo:'◆'},
 {k:'PRAZO',rotulo:'Prazos',glifo:'⚑'},
 {k:'ESCOLAR',rotulo:'Escolar',glifo:'★',classe:'t-ESCOLAR'},
 {k:'DATA',rotulo:'Datas',glifo:'✿',classe:'t-DATA'},
 {k:'FERIADO',rotulo:'Feriados',glifo:'⚐',classe:'t-FERIADO'},
];
const CAL_ROTULO_ORIGEM={mkt:'Marketing',esc:'Calendário escolar',dc:'Data comemorativa'};
let CAL_EU={nome:'',role:''};

/** Reúne as fontes em uma lista só; uma fonte que falhar não derruba as demais. */
async function calCarregar(ano){
 const [mkt,esc_,dc]=await Promise.allSettled([calMktCarregar(),escCarregar(),dcCarregar(ano)]);
 const itens=[];let opcoes={responsaveis:[]},eu=CAL_EU;
 if(mkt.status==='fulfilled'){
  opcoes=mkt.value.opcoes||opcoes;eu=mkt.value.eu||eu;
  mkt.value.itens.forEach(i=>itens.push({...i,origem:'mkt',tipoOrigem:i.tipo,tipo:['REUNIAO','INTERNA','COMPROMISSO'].includes(i.tipo)?'COMPROMISSO':i.tipo}));
 }
 if(esc_.status==='fulfilled')esc_.value.itens.forEach(i=>itens.push({...i,origem:'esc',tipoOrigem:i.tipo,tipo:'ESCOLAR'}));
 if(dc.status==='fulfilled')dc.value.itens.forEach(i=>{
  const r=i.raw;if(r.status!=='confirmada')return; // pendentes de validação ficam só no cadastro de datas
  const feriado=DC.grupoFeriados.includes(r.categoria);
  if(!feriado&&r.relevante!=='SIM')return; // o calendário mostra o que a equipe marcou como relevante
  itens.push({...i,origem:'dc',tipoOrigem:i.tipo,tipo:feriado?'FERIADO':'DATA',editavel:false});
 });
 CAL_EU=eu;
 return {itens,opcoes,eu,podeEditar:true,falhas:[mkt,esc_,dc].filter(x=>x.status==='rejected').length};
}
function calAbrir(it){
 if(it.origem==='esc')return escAbrir(it);
 if(it.origem==='dc')return dcAbrir(it);
 return calMktAbrir(it);
}
async function calMover(it,data){
 if(it.origem==='esc')return escPost('/escolar/mover',{id:it.id,data});
 if(it.origem==='dc')throw new Error('Datas comemorativas são calculadas pelo sistema e não são reagendadas.');
 return calMktMover(it,data);
}
/** "+ Novo": escolhe o tipo de item; cada opção abre o formulário que já existia. */
function calNovo(data){
 const gerente=CAL_EU.role==='manager';
 const o=adminOverlay(`<h3>O que você quer criar?</h3><p class="kpi-note">${data?`Dia ${esc(String(data).split('-').reverse().join('/'))}. `:''}Cada opção abre o formulário do tipo escolhido.</p>
  <div class="cal-escolha">
   <button type="button" class="softbtn" data-n="mkt">Compromisso, reunião ou cobertura</button>
   <button type="button" class="softbtn" data-n="plano">Ação de planejamento</button>
   ${gerente?'<button type="button" class="softbtn" data-n="esc">Evento do calendário escolar</button>':''}
   <button type="button" class="softbtn" data-n="dc">Data comemorativa própria</button>
  </div><div class="actions"><span class="cm-esp"></span><button type="button" class="btn soft" data-close>Cancelar</button></div>`);
 o.el.querySelectorAll('[data-n]').forEach(b=>b.onclick=async()=>{
  const k=b.dataset.n;o.close();
  try{
   if(k==='mkt')return calMktForm(null,data);
   if(k==='plano'){await plCarregar();return plModal(null,data,()=>CAL_UNICO.recarregar())}
   if(k==='esc'){await escCarregar();return escForm(null,data)}
   if(k==='dc'){await dcCarregar(Number(String(data||'').slice(0,4))||new Date().getFullYear());return dcForm(null,data)}
  }catch(e){toast(e.message,'warn')}
 });
}
const CAL_UNICO=CalMotor.criar({
 chave:'calendario',tituloPagina:'Calendário',eyebrow:'CALENDÁRIO',rotuloNovo:'+ Novo',
 descricao:'Tudo o que tem data no marketing e no colégio, em um só lugar. Clique em um dia para criar; arraste para reagendar.',
 tipos:CAL_TIPOS,carregar:calCarregar,novo:calNovo,abrir:calAbrir,mover:calMover,porAno:true,
 modos:[['week','Semana'],['month','Mês'],['day','Dia'],['list','Lista']],modoPadrao:'week',busca:true,filtrosCompactos:true,
 detalhe:i=>i.origem==='esc'?escSegTxt(i.raw):i.origem==='dc'?i.raw.regra:CAL_ROTULO_ORIGEM[i.origem]||'',
 classeDia:lista=>lista.some(i=>i.tipo==='FERIADO')?'feriado':'',
});
/** Abre o Calendário único já filtrado (links antigos para Escolar e Datas Comemorativas). */
function calUnicoFoco(tipos){CAL_UNICO.mostrarSo(tipos)}
async function renderCalendarUnico(){
 CalMotor.redirecionar=()=>CAL_UNICO.recarregar();
 return CAL_UNICO.render();
}
