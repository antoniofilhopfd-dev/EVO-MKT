/* Calendário de Marketing.
   Dividido em duas partes para comportar, no futuro, três calendários independentes (Marketing, Escolar, Datas Comemorativas):
   1) CalMotor: motor genérico (navegação, Mês/Semana/Dia, filtros, criar clicando, arrastar). Não sabe de onde vêm os itens.
   2) CAL_MARKETING: configuração do Calendário de Marketing (fontes, tipos, formulário, regras de abrir e reagendar). */

/* ---------- 1) Motor ---------- */
const CalMotor=(()=>{
 const NOMES_DIA=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
 const MODOS_PADRAO=[['day','Dia'],['week','Semana'],['month','Mês']];
 const guarda=(k,d)=>{try{return JSON.parse(localStorage.getItem('evo.cal.'+k)||'null')??d}catch{return d}};
 const salva=(k,v)=>{try{localStorage.setItem('evo.cal.'+k,JSON.stringify(v))}catch{}};
 const hojeIso=()=>isoDate(new Date());
 const dataDe=iso=>{const [y,m,d]=iso.split('-').map(Number);return new Date(y,m-1,d)};
 const fmtCurto=iso=>iso.split('-').reverse().slice(0,2).join('/');
 const norm=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
 /* itens de vários dias (campo `fim`) aparecem em cada dia do período */
 const doDia=(itens,k)=>itens.filter(x=>x.data<=k&&(x.fim||x.data)>=k);

 /* cfg: chave, tituloPagina, eyebrow, descricao, tipos[{k,rotulo,glifo}], carregar()→{itens,opcoes,eu,podeEditar}, novo(data), abrir(item), mover(item,data),
    opcionais: modos [[k,rótulo]], modoPadrao, busca, filtroResponsavel (padrão true), filtroExtra{vazio,opcoes(),testa(item,valor)}, detalhe(item), rotuloNovo */
 function criar(cfg){
  const modos=cfg.modos||MODOS_PADRAO;
  const modoSalvo=guarda(cfg.chave+'.modo',cfg.modoPadrao||'month');
  const est={modo:modos.some(m=>m[0]===modoSalvo)?modoSalvo:(cfg.modoPadrao||modos[0][0]),data:new Date(),ocultos:new Set(guarda(cfg.chave+'.ocultos',[])),resp:guarda(cfg.chave+'.resp',''),extra:guarda(cfg.chave+'.extra',''),busca:'',itens:[],opcoes:{responsaveis:[]},eu:{nome:'',role:''},podeEditar:true};
  const tipo=k=>cfg.tipos.find(t=>t.k===k)||cfg.tipos[0];
  const semanaIni=d=>{const x=new Date(d);x.setDate(x.getDate()-x.getDay());return isoDate(x)};
  const rotuloPeriodo=()=>{
   const f=o=>new Intl.DateTimeFormat('pt-BR',o).format;
   if(est.modo==='list')return 'Próximos eventos';
   if(est.modo==='month')return f({month:'long',year:'numeric'})(est.data);
   if(est.modo==='day')return f({weekday:'long',day:'2-digit',month:'long',year:'numeric'})(est.data);
   const ini=dataDe(semanaIni(est.data));const fim=new Date(ini);fim.setDate(ini.getDate()+6);
   return `${f({day:'2-digit',month:'short'})(ini)} – ${f({day:'2-digit',month:'short',year:'numeric'})(fim)}`;
  };
  const visiveis=()=>est.itens.filter(i=>!est.ocultos.has(i.tipo)
   &&(cfg.filtroResponsavel===false||!est.resp||(est.resp==='__eu'?String(i.responsavel||'').trim().toLowerCase()===String(est.eu.nome).trim().toLowerCase():String(i.responsavel||'').trim()===est.resp))
   &&(!cfg.filtroExtra||!est.extra||cfg.filtroExtra.testa(i,est.extra))
   &&(!est.busca||norm(i.titulo).includes(norm(est.busca))));
  const ordena=a=>[...a].sort((x,y)=>(x.data).localeCompare(y.data)||(x.hora||'').localeCompare(y.hora||'')||String(x.titulo).localeCompare(String(y.titulo),'pt-BR'));
  const item=(i,k)=>{const t=tipo(i.tipo),cont=!!(i.fim&&k&&k!==i.data);return `<button type="button" class="cm-item t-${i.tipo}${i.feito?' feito':''}${i.atrasada?' atrasada':''}${cont?' cont':''}" ${i.editavel?'draggable="true"':''} data-uid="${attr(i.uid)}" title="${attr(`${t.rotulo}${i.hora?' · '+i.hora:''}${i.responsavel?' · '+i.responsavel:''}${i.atrasada?' · atrasada':''}${i.fim?' · '+fmtCurto(i.data)+' a '+fmtCurto(i.fim):''}\n${i.titulo}`)}"><i class="cm-g" aria-hidden="true">${t.glifo}</i>${i.hora&&!cont?`<span class="cm-h">${esc(i.hora)}</span>`:''}<span class="cm-t">${esc(i.titulo||'(sem título)')}</span></button>`};
  const num=(k,d)=>est.podeEditar?`<button type="button" class="cm-num" data-novo="${k}" aria-label="Novo evento em ${fmtCurto(k)}">${d}</button>`:`<span class="cm-num">${d}</span>`;

  function mes(itens){
   const y=est.data.getFullYear(),mo=est.data.getMonth(),primeiro=new Date(y,mo,1),ini=new Date(y,mo,1-primeiro.getDay());
   let h=`<div class="cm-mes" role="grid">${NOMES_DIA.map(x=>`<div class="cm-cab">${x}</div>`).join('')}`;
   for(let i=0;i<42;i++){
    const d=new Date(ini);d.setDate(ini.getDate()+i);const k=isoDate(d),dia=ordena(doDia(itens,k));
    h+=`<div class="cm-dia${d.getMonth()!==mo?' fora':''}${k===hojeIso()?' hoje':''}${est.podeEditar?'':' leitura'}" data-date="${k}" data-n="${dia.length}">${num(k,d.getDate())}<div class="cm-lista">${dia.slice(0,3).map(x=>item(x,k)).join('')}</div>${dia.length>3?`<button type="button" class="cm-mais" data-dia="${k}">+${dia.length-3} mais</button>`:''}${dia.length?`<span class="cm-pontos" aria-hidden="true">${dia.slice(0,4).map(x=>`<i class="t-${x.tipo}"></i>`).join('')}</span>`:''}</div>`;
   }
   return h+'</div>';
  }
  function semana(itens){
   const ini=dataDe(semanaIni(est.data));
   return `<div class="cm-semana">${Array.from({length:7},(_,i)=>{const d=new Date(ini);d.setDate(ini.getDate()+i);const k=isoDate(d),dia=ordena(doDia(itens,k));
    return `<div class="cm-col${k===hojeIso()?' hoje':''}${est.podeEditar?'':' leitura'}" data-date="${k}"><div class="cm-colcab"><b>${NOMES_DIA[i]}</b>${num(k,d.getDate())}</div>${dia.map(x=>item(x,k)).join('')||'<span class="cm-vazio">Livre</span>'}</div>`}).join('')}</div>`;
  }
  function dia(itens){
   const k=isoDate(est.data),dd=ordena(doDia(itens,k));
   return `<div class="cm-diaVista${est.podeEditar?'':' leitura'}" data-date="${k}">${dd.map(i=>`<div class="cm-linha"><span class="cm-hora">${esc(i.hora||'o dia todo')}</span>${item(i,k)}<small>${esc(tipo(i.tipo).rotulo)}${i.responsavel?' · '+esc(i.responsavel):''}</small></div>`).join('')||`<div class="cm-livre"><strong>Dia livre</strong><span>${est.podeEditar?'Clique no espaço ou em “+ Novo evento” para criar.':'Nada neste dia.'}</span></div>`}</div>`;
  }
  /* lista de próximos eventos: do dia de hoje em diante, agrupada por mês */
  function lista(itens){
   const hoje=hojeIso(),prox=ordena(itens.filter(x=>(x.fim||x.data)>=hoje)).slice(0,200);
   if(!prox.length)return '<div class="cm-livre"><strong>Nenhum evento à frente</strong><span>Ajuste os filtros ou cadastre um novo evento.</span></div>';
   const grupos=[];prox.forEach(i=>{const m=(i.data<hoje?hoje:i.data).slice(0,7);let g=grupos.find(x=>x.m===m);if(!g)grupos.push(g={m,l:[]});g.l.push(i)});
   const nomeMes=m=>new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric'}).format(dataDe(m+'-01'));
   return `<div class="cm-proximos">${grupos.map(g=>`<section><h3>${esc(nomeMes(g.m))}</h3>${g.l.map(i=>`<div class="cm-prox-linha"><span class="cm-quando">${fmtCurto(i.data)}${i.fim?' – '+fmtCurto(i.fim):''}${i.hora?'<br>'+esc(i.hora):''}</span>${item(i,i.data)}<small>${esc(tipo(i.tipo).rotulo)}${cfg.detalhe?' · '+esc(cfg.detalhe(i)):''}</small></div>`).join('')}</section>`).join('')}</div>`;
  }

  async function desenhar(){
   const alvo=$('#cmRaiz');if(!alvo)return;
   const itens=visiveis(),extra=cfg.filtroExtra;
   const nav=est.modo==='list'
    ?`<div class="cm-nav"><h2 class="cm-periodo" aria-live="polite">${esc(rotuloPeriodo())}</h2></div>`
    :`<div class="cm-nav"><button type="button" class="softbtn" id="cmPrev" aria-label="Período anterior">‹</button><button type="button" class="softbtn" id="cmHoje">Hoje</button><button type="button" class="softbtn" id="cmNext" aria-label="Próximo período">›</button><h2 class="cm-periodo" aria-live="polite">${esc(rotuloPeriodo())}</h2><label class="cm-ir"><span class="sr-only">Ir para a data</span><input type="date" id="cmIr" value="${isoDate(est.data)}" aria-label="Ir para a data"></label></div>`;
   alvo.innerHTML=`<div class="cm-barra">${nav}
     <div class="view-switch" role="group" aria-label="Visualização">${modos.map(([k,l])=>`<button type="button" data-modo="${k}" class="${est.modo===k?'active':''}" aria-pressed="${est.modo===k}">${l}</button>`).join('')}</div></div>
     <div class="cm-filtros"><div class="cm-tipos" role="group" aria-label="Tipos">${cfg.tipos.map(t=>`<button type="button" class="cm-tipo t-${t.k}${est.ocultos.has(t.k)?' off':''}" data-tipo="${t.k}" aria-pressed="${!est.ocultos.has(t.k)}"><i class="cm-g" aria-hidden="true">${t.glifo}</i>${esc(t.rotulo)}</button>`).join('')}</div>
      ${extra?`<select class="control cm-resp" id="cmExtra" aria-label="${attr(extra.vazio)}"><option value="">${esc(extra.vazio)}</option>${extra.opcoes().map(([v,l])=>`<option value="${attr(v)}" ${est.extra===v?'selected':''}>${esc(l)}</option>`).join('')}</select>`:''}
      ${cfg.filtroResponsavel===false?'':`<select class="control cm-resp" id="cmResp" aria-label="Filtrar por responsável"><option value="">Todos os responsáveis</option><option value="__eu" ${est.resp==='__eu'?'selected':''}>Meus</option>${est.opcoes.responsaveis.map(n=>`<option value="${attr(n)}" ${est.resp===n?'selected':''}>${esc(n)}</option>`).join('')}</select>`}
      ${cfg.busca?`<input type="search" class="control cm-busca" id="cmBusca" placeholder="Pesquisar pelo título" aria-label="Pesquisar pelo título" value="${attr(est.busca)}">`:''}</div>
     ${est.modo==='month'?mes(itens):est.modo==='week'?semana(itens):est.modo==='list'?lista(itens):dia(itens)}`;
   if(!est.podeEditar)$('#cmNovo')?.remove();
   ligar(alvo,itens);
  }
  function ligar(alvo,itens){
   const muda=f=>{f();salva(cfg.chave+'.modo',est.modo);desenhar()};
   const passo=(sinal)=>muda(()=>{const d=new Date(est.data);if(est.modo==='month'){d.setDate(1);d.setMonth(d.getMonth()+sinal)}else d.setDate(d.getDate()+sinal*(est.modo==='week'?7:1));est.data=d});
   $('#cmPrev')&&($('#cmPrev').onclick=()=>passo(-1));
   $('#cmNext')&&($('#cmNext').onclick=()=>passo(1));
   $('#cmHoje')&&($('#cmHoje').onclick=()=>muda(()=>{est.data=new Date()}));
   $('#cmIr')&&($('#cmIr').onchange=e=>{if(e.target.value)muda(()=>{est.data=dataDe(e.target.value)})});
   alvo.querySelectorAll('[data-modo]').forEach(b=>b.onclick=()=>muda(()=>{est.modo=b.dataset.modo}));
   alvo.querySelectorAll('[data-tipo]').forEach(b=>b.onclick=()=>{const k=b.dataset.tipo;est.ocultos.has(k)?est.ocultos.delete(k):est.ocultos.add(k);salva(cfg.chave+'.ocultos',[...est.ocultos]);desenhar()});
   $('#cmResp')&&($('#cmResp').onchange=e=>{est.resp=e.target.value;salva(cfg.chave+'.resp',est.resp);desenhar()});
   $('#cmExtra')&&($('#cmExtra').onchange=e=>{est.extra=e.target.value;salva(cfg.chave+'.extra',est.extra);desenhar()});
   if($('#cmBusca')){let t;$('#cmBusca').oninput=e=>{est.busca=e.target.value;clearTimeout(t);t=setTimeout(()=>{desenhar();const i=$('#cmBusca');if(i){i.focus();i.setSelectionRange(i.value.length,i.value.length)}},180)}}
   alvo.querySelectorAll('[data-novo]').forEach(b=>b.onclick=e=>{e.stopPropagation();cfg.novo(b.dataset.novo)});
   alvo.querySelectorAll('[data-dia]').forEach(b=>b.onclick=e=>{e.stopPropagation();const k=modos.some(m=>m[0]==='day')?'day':'week';est.modo=k;est.data=dataDe(b.dataset.dia);salva(cfg.chave+'.modo',k);desenhar()});
   alvo.querySelectorAll('.cm-item').forEach(b=>{
    const it=est.itens.find(x=>x.uid===b.dataset.uid);
    b.onclick=e=>{e.stopPropagation();if(it)cfg.abrir(it)};
    b.ondragstart=e=>{e.dataTransfer.setData('text/plain',b.dataset.uid);e.dataTransfer.effectAllowed='move';b.classList.add('arrastando')};
    b.ondragend=()=>b.classList.remove('arrastando');
   });
   alvo.querySelectorAll('[data-date]').forEach(z=>{
    // espaço livre = criar (se puder); no celular, um dia com itens abre a lista do dia
    z.onclick=e=>{if(e.target.closest('button,a,input,select'))return;
     if(est.modo==='month'&&window.innerWidth<720&&Number(z.dataset.n||0)>0&&modos.some(m=>m[0]==='day')){est.modo='day';est.data=dataDe(z.dataset.date);salva(cfg.chave+'.modo','day');return desenhar()}
     if(est.podeEditar)cfg.novo(z.dataset.date)};
    if(!est.podeEditar)return;
    z.ondragover=e=>{e.preventDefault();z.classList.add('sobre')};
    z.ondragleave=()=>z.classList.remove('sobre');
    z.ondrop=async e=>{e.preventDefault();e.stopPropagation();z.classList.remove('sobre');
     const it=est.itens.find(x=>x.uid===e.dataTransfer.getData('text/plain'));if(!it||it.data===z.dataset.date)return;
     try{await cfg.mover(it,z.dataset.date);toast('Reagendado para '+fmtCurto(z.dataset.date));await recarregar()}catch(err){toast(err.message,'warn')}};
   });
  }
  async function recarregar(){
   const r=await cfg.carregar();est.itens=r.itens;est.opcoes=r.opcoes||est.opcoes;est.eu=r.eu||est.eu;est.podeEditar=r.podeEditar!==false;desenhar();
  }
  async function render(){
   setTitle(cfg.tituloPagina,rotuloPeriodo());
   $('#content').innerHTML=`<div class="cm-cabecalho"><div><small>${esc(cfg.eyebrow)}</small><h1>${esc(cfg.tituloPagina)}</h1><p>${esc(cfg.descricao)}</p></div><button class="btn" id="cmNovo">${esc(cfg.rotuloNovo||'+ Novo evento')}</button></div><div id="cmRaiz"><div class="loading"><span></span><b>Carregando…</b></div></div>`;
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
