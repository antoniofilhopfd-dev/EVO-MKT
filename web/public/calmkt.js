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
 const hojeIso=()=>hojeBR();
 const dataDe=iso=>{const [y,m,d]=iso.split('-').map(Number);return new Date(y,m-1,d)};
 const fmtCurto=iso=>iso.split('-').reverse().slice(0,2).join('/');
 const norm=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
 const MESES=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
 /* itens de vários dias (campo `fim`) aparecem em cada dia do período */
 const doDia=(itens,k)=>itens.filter(x=>x.data<=k&&(x.fim||x.data)>=k);

 /* cfg: chave, tituloPagina, eyebrow, descricao, tipos[{k,rotulo,glifo,classe?}], carregar(ano)→{itens,opcoes,eu,podeEditar,tipos?}, novo(data), abrir(item), mover(item,data),
    opcionais: modos [[k,rótulo]] (day|week|month|year|list), modoPadrao, busca, filtroResponsavel (padrão true), filtroExtra{vazio,opcoes(),testa}, filtrosExtras[{chave,vazio,opcoes(),testa(item,valor)}],
    alternancias[{chave,rotulo,testa(item)}], porAno (recarrega ao mudar de ano), listaEscopo ('futuro'|'ano'), classeDia(itensDoDia), detalhe(item), rotuloNovo */
 function criar(cfg){
  const modos=cfg.modos||MODOS_PADRAO;
  const modoSalvo=guarda(cfg.chave+'.modo',cfg.modoPadrao||'month');
  const extrasDef=cfg.filtrosExtras||(cfg.filtroExtra?[{chave:'extra',vazio:cfg.filtroExtra.vazio,opcoes:cfg.filtroExtra.opcoes,testa:(i,v)=>!v||cfg.filtroExtra.testa(i,v)}]:[]);
  const alternDef=cfg.alternancias||[];
  const est={modo:modos.some(m=>m[0]===modoSalvo)?modoSalvo:(cfg.modoPadrao||modos[0][0]),data:dataDe(hojeBR()),ocultos:new Set(cfg.semTipos?[]:guarda(cfg.chave+'.ocultos',[])),resp:guarda(cfg.chave+'.resp',''),extras:guarda(cfg.chave+'.extras',{}),tog:guarda(cfg.chave+'.tog',{}),mes:'',busca:'',itens:[],tipos:cfg.tipos,opcoes:{responsaveis:[]},eu:{nome:'',role:''},podeEditar:true};
  let anoCarregado=null;
  const tipo=k=>est.tipos.find(t=>t.k===k)||est.tipos[0]||{k,rotulo:k,glifo:'▪'};
  const cls=k=>tipo(k).classe||('t-'+k);
  const semanaIni=d=>{const x=new Date(d);x.setDate(x.getDate()-x.getDay());return isoDate(x)};
  const listaAno=()=>cfg.listaEscopo==='ano';
  const listaTudo=()=>cfg.listaEscopo==='tudo';
  const rotuloPeriodo=()=>{
   const f=o=>new Intl.DateTimeFormat('pt-BR',o).format;
   if(est.modo==='year'||(est.modo==='list'&&listaAno()))return String(est.data.getFullYear());
   if(est.modo==='list')return listaTudo()?'Todas as ações':'Próximos eventos';
   if(est.modo==='month')return f({month:'long',year:'numeric'})(est.data);
   if(est.modo==='day')return f({weekday:'long',day:'2-digit',month:'long',year:'numeric'})(est.data);
   const ini=dataDe(semanaIni(est.data));const fim=new Date(ini);fim.setDate(ini.getDate()+6);
   return `${f({day:'2-digit',month:'short'})(ini)} – ${f({day:'2-digit',month:'short',year:'numeric'})(fim)}`;
  };
  const visiveis=()=>est.itens.filter(i=>!est.ocultos.has(i.tipo)
   &&(cfg.filtroResponsavel===false||!est.resp||(est.resp==='__eu'?String(i.responsavel||'').trim().toLowerCase()===String(est.eu.nome).trim().toLowerCase():String(i.responsavel||'').trim()===est.resp))
   &&extrasDef.every(f=>f.testa(i,est.extras[f.chave]||''))
   &&alternDef.every(t=>!est.tog[t.chave]||t.testa(i))
   &&(!est.busca||norm(i.titulo).includes(norm(est.busca))));
  const ordena=a=>[...a].sort((x,y)=>(x.data).localeCompare(y.data)||(x.hora||'').localeCompare(y.hora||'')||String(x.titulo).localeCompare(String(y.titulo),'pt-BR'));
  const item=(i,k)=>{const t=tipo(i.tipo),cont=!!(i.fim&&k&&k!==i.data);return `<button type="button" class="cm-item ${cls(i.tipo)}${i.feito?' feito':''}${i.atrasada?' atrasada':''}${cont?' cont':''}" ${i.editavel?'draggable="true"':''} data-uid="${attr(i.uid)}" title="${attr(`${t.rotulo}${i.hora?' · '+i.hora:''}${i.responsavel?' · '+i.responsavel:''}${i.atrasada?' · atrasada':''}${i.fim?' · '+fmtCurto(i.data)+' a '+fmtCurto(i.fim):''}\n${i.titulo}`)}"><i class="cm-g" aria-hidden="true">${t.glifo}</i>${i.hora&&!cont?`<span class="cm-h">${esc(i.hora)}</span>`:''}<span class="cm-t">${esc(i.titulo||'(sem título)')}</span></button>`};
  const num=(k,d)=>est.podeEditar?`<button type="button" class="cm-num" data-novo="${k}" aria-label="Novo evento em ${fmtCurto(k)}">${d}</button>`:`<span class="cm-num">${d}</span>`;
  const classeDia=lista=>(cfg.classeDia?cfg.classeDia(lista):'');

  function mes(itens){
   const y=est.data.getFullYear(),mo=est.data.getMonth(),primeiro=new Date(y,mo,1),ini=new Date(y,mo,1-primeiro.getDay());
   let h=`<div class="cm-mes" role="grid">${NOMES_DIA.map(x=>`<div class="cm-cab">${x}</div>`).join('')}`;
   for(let i=0;i<42;i++){
    const d=new Date(ini);d.setDate(ini.getDate()+i);const k=isoDate(d),dia=ordena(doDia(itens,k));
    h+=`<div class="cm-dia${d.getMonth()!==mo?' fora':''}${k===hojeIso()?' hoje':''}${est.podeEditar?'':' leitura'} ${classeDia(dia)}" data-date="${k}" data-n="${dia.length}">${num(k,d.getDate())}<div class="cm-lista">${dia.slice(0,3).map(x=>item(x,k)).join('')}</div>${dia.length>3?`<button type="button" class="cm-mais" data-dia="${k}">+${dia.length-3} mais</button>`:''}${dia.length?`<span class="cm-pontos" aria-hidden="true">${dia.slice(0,4).map(x=>`<i class="${cls(x.tipo)}"></i>`).join('')}</span>`:''}</div>`;
   }
   return h+'</div>';
  }
  function semana(itens){
   const ini=dataDe(semanaIni(est.data));
   return `<div class="cm-semana">${Array.from({length:7},(_,i)=>{const d=new Date(ini);d.setDate(ini.getDate()+i);const k=isoDate(d),dia=ordena(doDia(itens,k));
    return `<div class="cm-col${k===hojeIso()?' hoje':''}${est.podeEditar?'':' leitura'} ${classeDia(dia)}" data-date="${k}"><div class="cm-colcab"><b>${NOMES_DIA[i]}</b>${num(k,d.getDate())}</div>${dia.map(x=>item(x,k)).join('')||'<span class="cm-vazio">Livre</span>'}</div>`}).join('')}</div>`;
  }
  function dia(itens){
   const k=isoDate(est.data),dd=ordena(doDia(itens,k));
   return `<div class="cm-diaVista${est.podeEditar?'':' leitura'}" data-date="${k}">${dd.map(i=>`<div class="cm-linha"><span class="cm-hora">${esc(i.hora||'o dia todo')}</span>${item(i,k)}<small>${esc(tipo(i.tipo).rotulo)}${i.responsavel?' · '+esc(i.responsavel):''}</small></div>`).join('')||`<div class="cm-livre"><strong>Dia livre</strong><span>${est.podeEditar?'Clique no espaço ou em “+ Novo evento” para criar.':'Nada neste dia.'}</span></div>`}</div>`;
  }
  /* visão anual: 12 mini-calendários; clicar num dia ou no nome do mês abre a visão mensal */
  function ano(itens){
   const y=est.data.getFullYear();
   return `<div class="cm-ano">${Array.from({length:12},(_,mo)=>{
    const primeiro=new Date(y,mo,1),total=new Date(y,mo+1,0).getDate();
    let g=NOMES_DIA.map(x=>`<i class="cm-mh">${x[0]}</i>`).join('')+'<i></i>'.repeat(primeiro.getDay());
    for(let d=1;d<=total;d++){const k=isoDate(new Date(y,mo,d)),dia=doDia(itens,k);
     g+=dia.length?`<button type="button" class="cm-md tem ${classeDia(dia)}${k===hojeIso()?' hoje':''}" data-ir="${k}" title="${attr(dia.map(x=>x.titulo).join('\n'))}"><b>${d}</b><span>${dia.slice(0,3).map(x=>`<i class="${cls(x.tipo)}"></i>`).join('')}</span></button>`:`<span class="cm-md${k===hojeIso()?' hoje':''}">${d}</span>`}
    return `<section class="cm-mini"><button type="button" class="cm-mini-t" data-ir="${isoDate(primeiro)}">${MESES[mo]}</button><div class="cm-mini-g">${g}</div></section>`}).join('')}</div>`;
  }
  /* lista de próximos eventos: do dia de hoje em diante (padrão) ou todos os do ano escolhido, agrupada por mês */
  function lista(itens){
   const hoje=hojeIso(),y=String(est.data.getFullYear());
   let base=listaTudo()?itens:listaAno()?itens.filter(x=>x.data.slice(0,4)===y&&(!est.mes||x.data.slice(5,7)===est.mes)):itens.filter(x=>(x.fim||x.data)>=hoje);
   const prox=ordena(base).slice(0,500);
   if(!prox.length)return `<div class="cm-livre"><strong>${listaAno()?'Nada neste filtro':'Nenhum evento à frente'}</strong><span>Ajuste os filtros${est.podeEditar?' ou cadastre uma nova data':''}.</span></div>`;
   const grupos=[];prox.forEach(i=>{const m=i.data?(!listaAno()&&!listaTudo()&&i.data<hoje?hoje:i.data).slice(0,7):'sem';let g=grupos.find(x=>x.m===m);if(!g)grupos.push(g={m,l:[]});g.l.push(i)});
   const nomeMes=m=>m==='sem'?'Sem data':new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric'}).format(dataDe(m+'-01'));
   return `<div class="cm-proximos">${grupos.map(g=>`<section><h3>${esc(nomeMes(g.m))}</h3>${g.l.map(i=>`<div class="cm-prox-linha"><span class="cm-quando">${i.data?fmtCurto(i.data):'—'}${i.fim?' – '+fmtCurto(i.fim):''}${i.hora?'<br>'+esc(i.hora):''}</span>${item(i,i.data)}<small>${esc(tipo(i.tipo).rotulo)}${cfg.detalhe?' · '+esc(cfg.detalhe(i)):''}</small></div>`).join('')}</section>`).join('')}</div>`;
  }

  const filtrosAtivos=()=>Object.values(est.extras).filter(Boolean).length+(est.resp?1:0)+Object.values(est.tog).filter(Boolean).length;
  async function desenhar(){
   const alvo=$('#cmRaiz');if(!alvo)return;
   const itens=visiveis();
   const semNav=est.modo==='list'&&!listaAno();
   const anos=cfg.porAno?(()=>{const y=est.data.getFullYear();return Array.from({length:13},(_,i)=>y-6+i)})():[];
   const nav=semNav
    ?`<div class="cm-nav"><h2 class="cm-periodo" aria-live="polite">${esc(rotuloPeriodo())}</h2></div>`
    :`<div class="cm-nav"><button type="button" class="softbtn" id="cmPrev" aria-label="Período anterior">‹</button><button type="button" class="softbtn" id="cmHoje">Hoje</button><button type="button" class="softbtn" id="cmNext" aria-label="Próximo período">›</button><h2 class="cm-periodo" aria-live="polite">${esc(rotuloPeriodo())}</h2>${cfg.porAno?`<select class="control cm-ano-sel" id="cmAno" aria-label="Ano">${anos.map(a=>`<option value="${a}" ${a===est.data.getFullYear()?'selected':''}>${a}</option>`).join('')}</select>`:''}<label class="cm-ir"><span class="sr-only">Ir para a data</span><input type="date" id="cmIr" value="${isoDate(est.data)}" aria-label="Ir para a data"></label></div>`;
   alvo.innerHTML=`${cfg.faixa?cfg.faixa(est.itens.filter(i=>!est.ocultos.has(i.tipo)),itens):''}<div class="cm-barra">${nav}
     <div class="view-switch" role="group" aria-label="Visualização">${modos.map(([k,l])=>`<button type="button" data-modo="${k}" class="${est.modo===k?'active':''}" aria-pressed="${est.modo===k}">${l}</button>`).join('')}</div></div>
     <div class="cm-filtros">${cfg.semTipos?'':`<div class="cm-tipos" role="group" aria-label="Tipos">${est.tipos.map(t=>`<button type="button" class="cm-tipo ${t.classe||'t-'+t.k}${est.ocultos.has(t.k)?' off':''}" data-tipo="${t.k}" aria-pressed="${!est.ocultos.has(t.k)}"><i class="cm-g" aria-hidden="true">${t.glifo}</i>${esc(t.rotulo)}</button>`).join('')}${est.ocultos.size?'<button type="button" class="cm-tipo cm-todos" id="cmTodos">Ver tudo</button>':''}</div>`}
      ${cfg.filtrosCompactos?`<details class="cm-maisfiltros"${filtrosAtivos()?' open':''}><summary>Filtros${filtrosAtivos()?` <b>${filtrosAtivos()}</b>`:''}</summary><div class="cm-maisfiltros-corpo">`:''}
      ${extrasDef.map((f,ix)=>`<select class="control cm-resp" id="cmExtra${ix?ix+1:''}" data-extra="${f.chave}" aria-label="${attr(f.vazio)}"><option value="">${esc(f.vazio)}</option>${f.opcoes().map(([v,l])=>`<option value="${attr(v)}" ${(est.extras[f.chave]||'')===v?'selected':''}>${esc(l)}</option>`).join('')}</select>`).join('')}
      ${cfg.filtroResponsavel===false?'':`<select class="control cm-resp" id="cmResp" aria-label="Filtrar por responsável"><option value="">Todos os responsáveis</option><option value="__eu" ${est.resp==='__eu'?'selected':''}>Meus</option>${est.opcoes.responsaveis.map(n=>`<option value="${attr(n)}" ${est.resp===n?'selected':''}>${esc(n)}</option>`).join('')}</select>`}
      ${est.modo==='list'&&listaAno()?`<select class="control cm-resp" id="cmMes" aria-label="Mês"><option value="">Todos os meses</option>${MESES.map((m,i)=>`<option value="${String(i+1).padStart(2,'0')}" ${est.mes===String(i+1).padStart(2,'0')?'selected':''}>${m[0].toUpperCase()+m.slice(1)}</option>`).join('')}</select>`:''}
      ${alternDef.map(t=>`<button type="button" class="cm-toggle${est.tog[t.chave]?' on':''}" data-tog="${t.chave}" aria-pressed="${!!est.tog[t.chave]}">${esc(t.rotulo)}</button>`).join('')}
      ${cfg.filtrosCompactos?'</div></details>':''}
      ${cfg.busca?`<input type="search" class="control cm-busca" id="cmBusca" placeholder="Pesquisar pelo nome" aria-label="Pesquisar pelo nome" value="${attr(est.busca)}">`:''}</div>
     ${est.modo==='month'?mes(itens):est.modo==='week'?semana(itens):est.modo==='list'?lista(itens):est.modo==='year'?ano(itens):dia(itens)}`;
   if(!est.podeEditar)$('#cmNovo')?.remove();
   ligar(alvo,itens);
   cfg.aoDesenhar&&cfg.aoDesenhar(alvo);
  }
  function ligar(alvo,itens){
   const muda=async f=>{f();salva(cfg.chave+'.modo',est.modo);if(cfg.porAno&&est.data.getFullYear()!==anoCarregado)await recarregar();else desenhar()};
   const passo=(sinal)=>muda(()=>{const d=new Date(est.data);if(est.modo==='year'||(est.modo==='list'&&listaAno())){d.setDate(1);d.setFullYear(d.getFullYear()+sinal)}else if(est.modo==='month'){d.setDate(1);d.setMonth(d.getMonth()+sinal)}else d.setDate(d.getDate()+sinal*(est.modo==='week'?7:1));est.data=d});
   $('#cmPrev')&&($('#cmPrev').onclick=()=>passo(-1));
   $('#cmNext')&&($('#cmNext').onclick=()=>passo(1));
   $('#cmHoje')&&($('#cmHoje').onclick=()=>muda(()=>{est.data=dataDe(hojeBR())}));
   $('#cmIr')&&($('#cmIr').onchange=e=>{if(e.target.value)muda(()=>{est.data=dataDe(e.target.value)})});
   $('#cmAno')&&($('#cmAno').onchange=e=>muda(()=>{const d=new Date(est.data);d.setDate(1);d.setFullYear(Number(e.target.value));est.data=d}));
   $('#cmMes')&&($('#cmMes').onchange=e=>{est.mes=e.target.value;desenhar()});
   alvo.querySelectorAll('[data-modo]').forEach(b=>b.onclick=()=>muda(()=>{est.modo=b.dataset.modo}));
   alvo.querySelectorAll('[data-ir]').forEach(b=>b.onclick=()=>muda(()=>{est.data=dataDe(b.dataset.ir);est.modo='month'}));
   $('#cmTodos')&&($('#cmTodos').onclick=()=>{est.ocultos.clear();salva(cfg.chave+'.ocultos',[]);desenhar()});
   alvo.querySelectorAll('[data-tipo]').forEach(b=>b.onclick=()=>{const k=b.dataset.tipo;est.ocultos.has(k)?est.ocultos.delete(k):est.ocultos.add(k);salva(cfg.chave+'.ocultos',[...est.ocultos]);desenhar()});
   alvo.querySelectorAll('[data-tog]').forEach(b=>b.onclick=()=>{est.tog[b.dataset.tog]=!est.tog[b.dataset.tog];salva(cfg.chave+'.tog',est.tog);desenhar()});
   $('#cmResp')&&($('#cmResp').onchange=e=>{est.resp=e.target.value;salva(cfg.chave+'.resp',est.resp);desenhar()});
   alvo.querySelectorAll('[data-extra]').forEach(sel=>sel.onchange=e=>{est.extras[sel.dataset.extra]=e.target.value;salva(cfg.chave+'.extras',est.extras);desenhar()});
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
    if(!est.podeEditar||!cfg.mover)return;
    z.ondragover=e=>{e.preventDefault();z.classList.add('sobre')};
    z.ondragleave=()=>z.classList.remove('sobre');
    z.ondrop=async e=>{e.preventDefault();e.stopPropagation();z.classList.remove('sobre');
     const it=est.itens.find(x=>x.uid===e.dataTransfer.getData('text/plain'));if(!it||it.data===z.dataset.date)return;
     try{await cfg.mover(it,z.dataset.date);toast('Reagendado para '+fmtCurto(z.dataset.date));await recarregar()}catch(err){toast(err.message,'warn')}};
   });
  }
  async function recarregar(){
   // com o Calendário único aberto, os formulários dos três calendários antigos atualizam a tela única
   if(api_.redirecionar&&['marketing','escolar','datacom'].includes(cfg.chave))return api_.redirecionar();
   anoCarregado=est.data.getFullYear();
   const r=await cfg.carregar(anoCarregado);est.itens=r.itens;est.opcoes=r.opcoes||est.opcoes;est.eu=r.eu||est.eu;if(r.tipos)est.tipos=r.tipos;est.podeEditar=r.podeEditar!==false;desenhar();
  }
  async function render(){
   setTitle(cfg.tituloPagina,rotuloPeriodo());
   $('#content').innerHTML=`<div class="cm-cabecalho"><h1 class="sr-only">${esc(cfg.tituloPagina)}</h1><p class="cm-sub" id="cmSub">${esc(cfg.descricao)}</p><button class="btn" id="cmNovo">${esc(cfg.rotuloNovo||'+ Novo evento')}</button></div><div id="cmRaiz"><div class="loading"><span></span><b>Carregando…</b></div></div>`;
   $('#cmNovo').onclick=()=>cfg.novo(est.modo==='month'&&(est.data.getMonth()!==new Date().getMonth()||est.data.getFullYear()!==new Date().getFullYear())?isoDate(new Date(est.data.getFullYear(),est.data.getMonth(),1)):isoDate(est.modo==='day'||est.modo==='week'?est.data:new Date()));
   try{await recarregar()}catch(e){$('#cmRaiz').innerHTML=`<div class="empty-rich"><strong>Não foi possível carregar o calendário</strong><p>${esc(e.message)}</p></div>`}
  }
  const definirFiltro=(chave,valor)=>{if(chave==='modo'){est.modo=valor;salva(cfg.chave+'.modo',valor)}else{est.extras[chave]=valor;salva(cfg.chave+'.extras',est.extras)}desenhar()};
  const mostrarSo=ks=>{if(cfg.semTipos)return;est.ocultos=new Set(ks?est.tipos.map(t=>t.k).filter(k=>!ks.includes(k)):[]);salva(cfg.chave+'.ocultos',[...est.ocultos])};
  return {render,recarregar,definirFiltro,mostrarSo,estado:est};
 }
 const api_={criar,fmtCurto,dataDe,redirecionar:null};
 return api_;
})();

