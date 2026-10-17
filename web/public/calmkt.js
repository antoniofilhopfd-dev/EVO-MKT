/* Calendário de Marketing.
   Dividido em duas partes para comportar, no futuro, três calendários independentes (Marketing, Escolar, Datas Comemorativas):
   1) CalMotor: motor genérico (navegação, Mês/Semana/Dia, filtros, criar clicando, arrastar). Não sabe de onde vêm os itens.
   2) CAL_MARKETING: configuração do Calendário de Marketing (fontes, tipos, formulário, regras de abrir e reagendar). */

/* ---------- 1) Motor ---------- */
const CalMotor=(()=>{
 const NOMES_DIA=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
 const guarda=(k,d)=>{try{return JSON.parse(localStorage.getItem('evo.cal.'+k)||'null')??d}catch{return d}};
 const salva=(k,v)=>{try{localStorage.setItem('evo.cal.'+k,JSON.stringify(v))}catch{}};
 const hojeIso=()=>isoDate(new Date());
 const dataDe=iso=>{const [y,m,d]=iso.split('-').map(Number);return new Date(y,m-1,d)};
 const fmtCurto=iso=>iso.split('-').reverse().slice(0,2).join('/');

 function criar(cfg){
  const est={modo:guarda(cfg.chave+'.modo','month'),data:new Date(),ocultos:new Set(guarda(cfg.chave+'.ocultos',[])),resp:guarda(cfg.chave+'.resp',''),itens:[],opcoes:{responsaveis:[]},eu:{nome:'',role:''}};
  const tipo=k=>cfg.tipos.find(t=>t.k===k)||cfg.tipos[0];
  const rotuloPeriodo=()=>{
   const f=o=>new Intl.DateTimeFormat('pt-BR',o).format;
   if(est.modo==='month')return f({month:'long',year:'numeric'})(est.data);
   if(est.modo==='day')return f({weekday:'long',day:'2-digit',month:'long',year:'numeric'})(est.data);
   const ini=dataDe(semanaIni(est.data));const fim=new Date(ini);fim.setDate(ini.getDate()+6);
   return `${f({day:'2-digit',month:'short'})(ini)} – ${f({day:'2-digit',month:'short',year:'numeric'})(fim)}`;
  };
  const semanaIni=d=>{const x=new Date(d);x.setDate(x.getDate()-x.getDay());return isoDate(x)};
  const visiveis=()=>est.itens.filter(i=>!est.ocultos.has(i.tipo)&&(!est.resp||(est.resp==='__eu'?String(i.responsavel||'').trim().toLowerCase()===String(est.eu.nome).trim().toLowerCase():String(i.responsavel||'').trim()===est.resp)));
  const ordena=a=>[...a].sort((x,y)=>(x.hora||'').localeCompare(y.hora||'')||String(x.titulo).localeCompare(String(y.titulo),'pt-BR'));
  const item=i=>{const t=tipo(i.tipo);return `<button type="button" class="cm-item t-${i.tipo}${i.feito?' feito':''}${i.atrasada?' atrasada':''}" ${i.editavel?'draggable="true"':''} data-uid="${attr(i.uid)}" title="${attr(`${t.rotulo}${i.hora?' · '+i.hora:''}${i.responsavel?' · '+i.responsavel:''}${i.atrasada?' · atrasada':''}\n${i.titulo}`)}"><i class="cm-g" aria-hidden="true">${t.glifo}</i>${i.hora?`<span class="cm-h">${esc(i.hora)}</span>`:''}<span class="cm-t">${esc(i.titulo||'(sem título)')}</span></button>`};

  function mes(itens){
   const y=est.data.getFullYear(),mo=est.data.getMonth(),primeiro=new Date(y,mo,1),ini=new Date(y,mo,1-primeiro.getDay());
   let h=`<div class="cm-mes" role="grid">${NOMES_DIA.map(x=>`<div class="cm-cab">${x}</div>`).join('')}`;
   for(let i=0;i<42;i++){
    const d=new Date(ini);d.setDate(ini.getDate()+i);const k=isoDate(d),dia=ordena(itens.filter(x=>x.data===k));
    h+=`<div class="cm-dia${d.getMonth()!==mo?' fora':''}${k===hojeIso()?' hoje':''}" data-date="${k}" data-n="${dia.length}"><button type="button" class="cm-num" data-novo="${k}" aria-label="Novo evento em ${fmtCurto(k)}">${d.getDate()}</button><div class="cm-lista">${dia.slice(0,3).map(item).join('')}</div>${dia.length>3?`<button type="button" class="cm-mais" data-dia="${k}">+${dia.length-3} mais</button>`:''}${dia.length?`<span class="cm-pontos" aria-hidden="true">${dia.slice(0,4).map(x=>`<i class="t-${x.tipo}"></i>`).join('')}</span>`:''}</div>`;
   }
   return h+'</div>';
  }
  function semana(itens){
   const ini=dataDe(semanaIni(est.data));
   return `<div class="cm-semana">${Array.from({length:7},(_,i)=>{const d=new Date(ini);d.setDate(ini.getDate()+i);const k=isoDate(d),dia=ordena(itens.filter(x=>x.data===k));
    return `<div class="cm-col${k===hojeIso()?' hoje':''}" data-date="${k}"><div class="cm-colcab"><b>${NOMES_DIA[i]}</b><button type="button" class="cm-num" data-novo="${k}" aria-label="Novo evento em ${fmtCurto(k)}">${d.getDate()}</button></div>${dia.map(item).join('')||'<span class="cm-vazio">Livre</span>'}</div>`}).join('')}</div>`;
  }
  function dia(itens){
   const k=isoDate(est.data),dd=ordena(itens.filter(x=>x.data===k));
   return `<div class="cm-diaVista" data-date="${k}">${dd.map(i=>`<div class="cm-linha"><span class="cm-hora">${esc(i.hora||'o dia todo')}</span>${item(i)}<small>${esc(tipo(i.tipo).rotulo)}${i.responsavel?' · '+esc(i.responsavel):''}</small></div>`).join('')||'<div class="cm-livre"><strong>Dia livre</strong><span>Clique no espaço ou em “+ Novo evento” para criar.</span></div>'}</div>`;
  }

  async function desenhar(){
   const alvo=$('#cmRaiz');if(!alvo)return;
   const itens=visiveis();
   alvo.innerHTML=`<div class="cm-barra"><div class="cm-nav"><button type="button" class="softbtn" id="cmPrev" aria-label="Período anterior">‹</button><button type="button" class="softbtn" id="cmHoje">Hoje</button><button type="button" class="softbtn" id="cmNext" aria-label="Próximo período">›</button><h2 class="cm-periodo" aria-live="polite">${esc(rotuloPeriodo())}</h2><label class="cm-ir"><span class="sr-only">Ir para a data</span><input type="date" id="cmIr" value="${isoDate(est.data)}" aria-label="Ir para a data"></label></div>
     <div class="view-switch" role="group" aria-label="Visualização">${[['day','Dia'],['week','Semana'],['month','Mês']].map(([k,l])=>`<button type="button" data-modo="${k}" class="${est.modo===k?'active':''}" aria-pressed="${est.modo===k}">${l}</button>`).join('')}</div></div>
     <div class="cm-filtros"><div class="cm-tipos" role="group" aria-label="Tipos de atividade">${cfg.tipos.map(t=>`<button type="button" class="cm-tipo t-${t.k}${est.ocultos.has(t.k)?' off':''}" data-tipo="${t.k}" aria-pressed="${!est.ocultos.has(t.k)}"><i class="cm-g" aria-hidden="true">${t.glifo}</i>${esc(t.rotulo)}</button>`).join('')}</div>
      <select class="control cm-resp" id="cmResp" aria-label="Filtrar por responsável"><option value="">Todos os responsáveis</option><option value="__eu" ${est.resp==='__eu'?'selected':''}>Meus</option>${est.opcoes.responsaveis.map(n=>`<option value="${attr(n)}" ${est.resp===n?'selected':''}>${esc(n)}</option>`).join('')}</select></div>
     ${est.modo==='month'?mes(itens):est.modo==='week'?semana(itens):dia(itens)}`;
   ligar(alvo,itens);
  }
  function ligar(alvo,itens){
   const muda=f=>{f();salva(cfg.chave+'.modo',est.modo);desenhar()};
   $('#cmPrev').onclick=()=>muda(()=>{const d=new Date(est.data);if(est.modo==='month'){d.setDate(1);d.setMonth(d.getMonth()-1)}else d.setDate(d.getDate()-(est.modo==='week'?7:1));est.data=d});
   $('#cmNext').onclick=()=>muda(()=>{const d=new Date(est.data);if(est.modo==='month'){d.setDate(1);d.setMonth(d.getMonth()+1)}else d.setDate(d.getDate()+(est.modo==='week'?7:1));est.data=d});
   $('#cmHoje').onclick=()=>muda(()=>{est.data=new Date()});
   $('#cmIr').onchange=e=>{if(e.target.value)muda(()=>{est.data=dataDe(e.target.value)})};
   alvo.querySelectorAll('[data-modo]').forEach(b=>b.onclick=()=>muda(()=>{est.modo=b.dataset.modo}));
   alvo.querySelectorAll('[data-tipo]').forEach(b=>b.onclick=()=>{const k=b.dataset.tipo;est.ocultos.has(k)?est.ocultos.delete(k):est.ocultos.add(k);salva(cfg.chave+'.ocultos',[...est.ocultos]);desenhar()});
   $('#cmResp').onchange=e=>{est.resp=e.target.value;salva(cfg.chave+'.resp',est.resp);desenhar()};
   alvo.querySelectorAll('[data-novo]').forEach(b=>b.onclick=e=>{e.stopPropagation();cfg.novo(b.dataset.novo)});
   alvo.querySelectorAll('[data-dia]').forEach(b=>b.onclick=e=>{e.stopPropagation();est.modo='day';est.data=dataDe(b.dataset.dia);salva(cfg.chave+'.modo','day');desenhar()});
   alvo.querySelectorAll('.cm-item').forEach(b=>{
    const it=est.itens.find(x=>x.uid===b.dataset.uid);
    b.onclick=e=>{e.stopPropagation();if(it)cfg.abrir(it)};
    b.ondragstart=e=>{e.dataTransfer.setData('text/plain',b.dataset.uid);e.dataTransfer.effectAllowed='move';b.classList.add('arrastando')};
    b.ondragend=()=>b.classList.remove('arrastando');
   });
   alvo.querySelectorAll('[data-date]').forEach(z=>{
    // espaço livre = criar; no celular, um dia com itens abre a lista do dia
    z.onclick=e=>{if(e.target.closest('button,a,input,select'))return;
     if(est.modo==='month'&&window.innerWidth<720&&Number(z.dataset.n||0)>0){est.modo='day';est.data=dataDe(z.dataset.date);salva(cfg.chave+'.modo','day');return desenhar()}
     cfg.novo(z.dataset.date)};
    z.ondragover=e=>{e.preventDefault();z.classList.add('sobre')};
    z.ondragleave=()=>z.classList.remove('sobre');
    z.ondrop=async e=>{e.preventDefault();e.stopPropagation();z.classList.remove('sobre');
     const it=est.itens.find(x=>x.uid===e.dataTransfer.getData('text/plain'));if(!it||it.data===z.dataset.date)return;
     try{await cfg.mover(it,z.dataset.date);toast('Reagendado para '+fmtCurto(z.dataset.date));await recarregar()}catch(err){toast(err.message,'warn')}};
   });
  }
  async function recarregar(){
   const r=await cfg.carregar();est.itens=r.itens;est.opcoes=r.opcoes||est.opcoes;est.eu=r.eu||est.eu;desenhar();
  }
  async function render(){
   setTitle(cfg.tituloPagina,rotuloPeriodo());
   $('#content').innerHTML=`<div class="cm-cabecalho"><div><small>${esc(cfg.eyebrow)}</small><h1>${esc(cfg.tituloPagina)}</h1><p>${esc(cfg.descricao)}</p></div><button class="btn" id="cmNovo">+ Novo evento</button></div><div id="cmRaiz"><div class="loading"><span></span><b>Carregando…</b></div></div>`;
   $('#cmNovo').onclick=()=>cfg.novo(est.modo==='month'&&(est.data.getMonth()!==new Date().getMonth()||est.data.getFullYear()!==new Date().getFullYear())?isoDate(new Date(est.data.getFullYear(),est.data.getMonth(),1)):isoDate(est.modo==='day'||est.modo==='week'?est.data:new Date()));
   try{await recarregar()}catch(e){$('#cmRaiz').innerHTML=`<div class="empty-rich"><strong>Não foi possível carregar o calendário</strong><p>${esc(e.message)}</p></div>`}
  }
  return {render,recarregar};
 }
 return {criar,fmtCurto,dataDe};
})();

/* ---------- 2) Configuração do Calendário de Marketing ---------- */
const CAL_MKT_TIPOS=[
 {k:'REUNIAO',rotulo:'Reunião',glifo:'◷'},
 {k:'COBERTURA',rotulo:'Cobertura foto/vídeo',glifo:'◉'},
 {k:'COMPROMISSO',rotulo:'Compromisso',glifo:'▪'},
 {k:'INTERNA',rotulo:'Atividade interna',glifo:'⚙'},
 {k:'PUBLICACAO',rotulo:'Publicação',glifo:'✎'},
 {k:'PRAZO',rotulo:'Prazo de solicitação',glifo:'⚑'},
];
/** Tipos que a equipe escolhe ao cadastrar (publicações e prazos vêm dos próprios registros). */
const CAL_MKT_TIPOS_FORM=[['REUNIAO','Reunião'],['COBERTURA','Cobertura foto/vídeo'],['COMPROMISSO','Compromisso'],['INTERNA','Atividade interna']];
const calMktRotuloTipo=k=>(CAL_MKT_TIPOS_FORM.find(x=>x[0]===k)||[,'Compromisso'])[1];
function calMktTipoDe(r){
 const t=String(r.tipoItem||'').toLowerCase();
 if(/reuni/.test(t))return 'REUNIAO';
 if(/cobert|foto|v[ií]deo|grava/.test(t))return 'COBERTURA';
 if(/intern|atividade/.test(t))return 'INTERNA';
 if(!t){const ti=String(r.titulo||'').toLowerCase();if(/reuni/.test(ti))return 'REUNIAO';if(/cobertura|grava[cç]/.test(ti))return 'COBERTURA'}
 return 'COMPROMISSO';
}
function calMktDataHora(r){
 const bruto=String(r.inicioEm||r.dataInicio||'');
 const data=bruto.slice(0,10);let hora=bruto.length>10?bruto.slice(11,16):'';
 if(hora==='00:00'||String(r.diaInteiro||'').toLowerCase().startsWith('s'))hora='';
 return [data,hora];
}
async function calMktCarregar(){
 const [cal,age,con,pn]=await Promise.all([getRows('calendario',true),getRows('agenda',true),getRows('conteudos',true),api('/solicitacoes/painel')]);
 const eu=pn.eu||{nome:'',role:''},gerente=eu.role==='manager';
 const dono=r=>String(r.responsavel||'').trim()!==''&&String(r.responsavel).trim().toLowerCase()===String(eu.nome).trim().toLowerCase();
 const itens=[];
 [['calendario',cal.rows],['agenda',age.rows]].forEach(([modulo,rows])=>(rows||[]).forEach(r=>{
  const [data,hora]=calMktDataHora(r);if(!data||/CANCEL/i.test(String(r.status||'')))return;
  itens.push({uid:modulo+':'+r.id,id:r.id,modulo,titulo:r.titulo,data,hora,tipo:calMktTipoDe(r),responsavel:r.responsavel||'',editavel:true,feito:/REALIZ|CONCLU/i.test(String(r.status||'')),raw:r});
 }));
 (con.rows||[]).forEach(r=>{
  const v=String(r.publicacaoEm||'');if(!v||/ARQUIV/i.test(String(r.status||'')))return;
  itens.push({uid:'conteudos:'+r.id,id:r.id,modulo:'conteudos',titulo:r.titulo,data:v.slice(0,10),hora:v.length>10?v.slice(11,16):'',tipo:'PUBLICACAO',responsavel:r.responsavel||'',editavel:true,feito:/PUBLICADO/i.test(String(r.status||'')),raw:r});
 });
 (pn.rows||[]).forEach(r=>{
  if(r.etapa==='CONCLUIDO'||!r.prazoEfetivo)return;
  itens.push({uid:'solicitacoes:'+r.id,id:r.id,modulo:'solicitacoes',titulo:r.titulo,data:r.prazoEfetivo,hora:'',tipo:'PRAZO',responsavel:r.responsavel||'',editavel:gerente||dono(r),atrasada:!!r.atrasada,raw:r});
 });
 return {itens,opcoes:pn.opcoes,eu};
}
/** Reagendar mantém o horário; para eventos de mais de um dia, mantém também a duração. */
function calMktNovaData(it,nova){
 const r=it.raw,suf=s=>String(s||'').length>10?String(s).slice(10):'';
 if(it.modulo==='conteudos')return {publicacaoEm:nova+suf(r.publicacaoEm)};
 const ini=String(r.inicioEm||r.dataInicio||'').slice(0,10),fim=String(r.fimEm||'').slice(0,10);
 const patch={dataInicio:nova,inicioEm:nova+suf(r.inicioEm)};
 if(fim){const dias=Math.round((CalMotor.dataDe(fim)-CalMotor.dataDe(ini))/86400000);const f=CalMotor.dataDe(nova);f.setDate(f.getDate()+Math.max(0,dias));patch.fimEm=isoDate(f)+suf(r.fimEm)}
 return patch;
}
async function calMktMover(it,nova){
 if(it.modulo==='solicitacoes'){await api('/solicitacoes/editar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:it.id,prazo:nova})});invalidate('solicitacoes');return}
 await api(`/data?module=${it.modulo}&id=${encodeURIComponent(it.id)}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(calMktNovaData(it,nova))});
 invalidate(it.modulo);
}
function calMktAbrir(it){
 if(it.modulo==='solicitacoes')return slAbrirExterno(it.id,()=>CAL_MKT.recarregar());
 if(it.modulo==='conteudos'){state.module='conteudos';return openModal(it.raw)}
 calMktForm(it);
}
/** Formulário simples: título, data, horário (opcional), tipo, responsável (opcional), observações (opcional). */
async function calMktForm(it,dataInicial=''){
 if(pref('safeMode',false))return toast('Modo Seguro ativo: edição bloqueada.','warn');
 const edit=!!it,r=edit?it.raw:{};
 let resp=[];try{resp=((await api('/solicitacoes/painel')).opcoes||{}).responsaveis||[]}catch{}
 if(edit&&it.responsavel&&!resp.includes(it.responsavel))resp=[it.responsavel,...resp];
 const tipoAtual=edit?it.tipo:'REUNIAO',tipos=CAL_MKT_TIPOS_FORM;
 const o=adminOverlay(`<h3>${edit?'Editar evento':'Novo evento'}</h3>
  <form id="cmForm" class="cm-form" novalidate>
   <label class="wide">Título *<input class="control" id="fTitulo" maxlength="140" required autocomplete="off" value="${attr(edit?it.titulo:'')}"></label>
   <label>Data *<input class="control" type="date" id="fData" required value="${attr(edit?it.data:dataInicial)}"></label>
   <label>Horário (opcional)<input class="control" type="time" id="fHora" value="${attr(edit?it.hora:'')}"></label>
   <label>Tipo de atividade<select class="control" id="fTipo">${tipos.map(([k,l])=>`<option value="${k}" ${k===tipoAtual?'selected':''}>${l}</option>`).join('')}</select></label>
   <label>Responsável (opcional)<select class="control" id="fResp"><option value="">Sem responsável</option>${resp.map(n=>`<option value="${attr(n)}" ${n===(edit?it.responsavel:'')?'selected':''}>${esc(n)}</option>`).join('')}</select></label>
   <label class="wide">Observações (opcional)<textarea class="control" id="fObs" rows="3" maxlength="1000">${esc(edit?(r.descricao||''):'')}</textarea></label>
   <div class="cm-erro wide" id="fErro" role="alert"></div>
   <div class="actions wide">${edit?'<button type="button" class="btn danger-soft" id="fExcluir">Excluir</button>':''}<span class="cm-esp"></span><button type="button" class="btn soft" data-close>Cancelar</button><button type="submit" class="btn" id="fSalvar">Salvar</button></div>
  </form>`);
 $('#fTitulo',o.el).focus();
 $('#cmForm',o.el).onsubmit=async ev=>{
  ev.preventDefault();const err=$('#fErro',o.el);err.textContent='';
  const titulo=$('#fTitulo',o.el).value.trim(),data=$('#fData',o.el).value,hora=$('#fHora',o.el).value;
  if(titulo.length<2){err.textContent='Informe o título.';return}
  if(!data){err.textContent='Escolha a data.';return}
  const body={titulo,tipoItem:calMktRotuloTipo($('#fTipo',o.el).value),dataInicio:data,inicioEm:`${data}T${hora||'00:00'}`,fimEm:`${data}T${hora||'00:00'}`,diaInteiro:hora?'Não':'Sim',responsavel:$('#fResp',o.el).value,descricao:$('#fObs',o.el).value.trim()};
  if(edit&&r.fimEm&&String(r.fimEm).slice(0,10)!==String(r.inicioEm||r.dataInicio||'').slice(0,10)){ // evento de vários dias: preserva a duração
   const dias=Math.round((CalMotor.dataDe(String(r.fimEm).slice(0,10))-CalMotor.dataDe(String(r.inicioEm||r.dataInicio).slice(0,10)))/86400000);const f=CalMotor.dataDe(data);f.setDate(f.getDate()+Math.max(0,dias));body.fimEm=`${isoDate(f)}T${hora||'00:00'}`}
  else if(edit&&hora&&r.fimEm&&String(r.fimEm).length>10&&String(r.fimEm).slice(11,16)>hora)body.fimEm=`${data}T${String(r.fimEm).slice(11,16)}`;
  const btn=$('#fSalvar',o.el);btn.disabled=true;
  try{
   if(edit)await api(`/data?module=${it.modulo}&id=${encodeURIComponent(it.id)}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
   else await api('/data?module=calendario',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,status:'PLANEJADO'})});
   invalidate(edit?it.modulo:'calendario');o.close();toast(edit?'Evento atualizado':'Evento criado');await CAL_MKT.recarregar();
  }catch(e){err.textContent=e.message;btn.disabled=false}
 };
 $('#fExcluir',o.el)&&($('#fExcluir',o.el).onclick=async()=>{
  if(!confirm(`Excluir "${it.titulo}"? Ele vai para a Lixeira e pode ser restaurado.`))return;
  try{await api(`/data?module=${it.modulo}&id=${encodeURIComponent(it.id)}`,{method:'DELETE'});invalidate(it.modulo);invalidate('lixeira');o.close();toast('Evento movido para a Lixeira');await CAL_MKT.recarregar()}catch(e){$('#fErro',o.el).textContent=e.message}
 });
}
const CAL_MKT=CalMotor.criar({
 chave:'marketing',tituloPagina:'Calendário de Marketing',eyebrow:'PLANEJAMENTO',
 descricao:'Compromissos, reuniões, coberturas, publicações e prazos das solicitações. Clique em um dia para criar; arraste para reagendar.',
 tipos:CAL_MKT_TIPOS,carregar:calMktCarregar,novo:d=>calMktForm(null,d),abrir:calMktAbrir,mover:calMktMover,
});
async function renderCalendar(){return CAL_MKT.render()}
