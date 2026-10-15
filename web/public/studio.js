// Estúdio de publicações: semana editorial com arrastar-e-soltar, compositor com prévia do Instagram,
// grupos de hashtags e melhor horário calculado dos posts reais. Usa o módulo "conteudos" (nada novo no banco).
const ST_ETAPAS={RASCUNHO:'PRODUÇÃO',APROVACAO:'REVISÃO',AGENDADO:'PROGRAMADO'};
const ST_CLASSE={IDEIA:'draft',BRIEFING:'draft','PRODUÇÃO':'draft','REVISÃO':'review',APROVADO:'ok',PROGRAMADO:'sched',PUBLICADO:'done',ARQUIVADO:'off'};
const ST_ROTULO={IDEIA:'Ideia',BRIEFING:'Briefing','PRODUÇÃO':'Rascunho','REVISÃO':'Em aprovação',APROVADO:'Aprovado',PROGRAMADO:'Agendado',PUBLICADO:'Publicado',ARQUIVADO:'Arquivado'};
const ST_ICONE={Feed:'▦',Stories:'◔',Reels:'▶',Carrossel:'❏','Vídeo':'▶',Foto:'▣',Outro:'◇'};
const ST_DIAS=['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
// ---------- várias contas de Instagram ----------
let adsCompleto=false;
async function adsCarregaModo(){try{adsCompleto=internalSession?.role==='manager'?!!(await api('/ads/modo')).gestao:false}catch{adsCompleto=false}}
let igConta=(()=>{try{return localStorage.getItem('evo.igConta')||''}catch{return ''}})(),igContas=[],igPrincipal='';
const igQ=(pre='?')=>igConta?`${pre}conta=${encodeURIComponent(igConta)}`:'';
async function igCarregaContas(){try{const d=await api('/instagram/contas');igContas=d.contas||[];igPrincipal=d.principal||'';if(!igConta||!igContas.some(c=>c.ig===igConta))igConta=igPrincipal||(igContas[0]&&igContas[0].ig)||''}catch{igContas=[]}igTopo()}
const igSeletor=()=>'';
const igSeletorTopo=()=>igContas.length>=1?`<select data-igconta aria-label="Trocar a conta do Instagram" class="ig-conta-sel">${igContas.map(c=>`<option value="${attr(c.ig)}" ${c.ig===igConta?'selected':''}>@${esc(c.usuario)}</option>`).join('')}<option value="__admin">＋ Adicionar / gerenciar contas…</option></select>`:'';
const IG_PAGINAS={studio:()=>renderStudio(),igposts:()=>renderIgPosts(),igranking:()=>renderIgRanking()};
function igTopo(){const el=document.getElementById('igTop');if(!el)return;const ativo=IG_PAGINAS[state.page]&&igContas.length>=1;el.innerHTML=ativo?igSeletorTopo():'';el.querySelectorAll('[data-igconta]').forEach(sel=>sel.onchange=()=>{if(sel.value==='__admin'){sel.value=igConta;return go('administracao')}igConta=sel.value;try{localStorage.setItem('evo.igConta',igConta)}catch{};IG_PAGINAS[state.page]()})}
function igLigaSeletor(){igTopo()}
const igContaDoPost=r=>String(r.contaInstagram||igPrincipal||'');
let studioSemana=null,studioFiltro={perfil:'',status:'',formato:''},studioCache={rows:[],estados:new Map(),datas:[],horarios:null};

function stSegunda(d){const x=new Date(d);x.setHours(12,0,0,0);const w=(x.getDay()+6)%7;x.setDate(x.getDate()-w);return x}
function stIso(d){return isoDate(d)}
function stAddDias(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x}
function stQuando(r){return String(r.publicacaoEm||r.publicadoEm||'')}
function stHora(r){return stQuando(r).slice(11,16)}
function stDia(r){return stQuando(r).slice(0,10)}
function stAgoraLocal(){const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)}
function stAtivo(r){return !/PUBLICADO|ARQUIVADO/i.test(String(r.status||''))}
function stFiltrar(rows){return rows.filter(r=>(!studioFiltro.perfil||r.perfil===studioFiltro.perfil)&&(!studioFiltro.status||String(r.status||'').toUpperCase()===studioFiltro.status)&&(!studioFiltro.formato||r.formato===studioFiltro.formato))}
function stContaTags(txt){return (String(txt||'').match(/#[\p{L}\p{N}_]+/gu)||[]).length}

function stCard(r){
  const st=String(r.status||'').toUpperCase(),est=studioCache.estados.get(r.id)||'';
  const falha=/FALHA/.test(est),mov=stAtivo(r);
  return `<button class="st-card st-${ST_CLASSE[st]||'draft'}${falha?' st-falha':''}" ${mov?'draggable="true"':''} data-id="${attr(r.id)}" title="${attr(r.titulo||'')}">
    <span class="st-top"><b>${ST_ICONE[r.formato]||'◇'} ${esc(stHora(r)||'sem hora')}</b><em>${esc(ST_ROTULO[st]||st||'—')}</em></span>
    <strong>${esc(r.titulo||'(sem título)')}</strong>
    <small>${esc(r.perfil||'')}${r.formato?' · '+esc(r.formato):''}${falha?' · falha ao publicar':''}</small>
  </button>`;
}

async function renderStudio(){
  await igCarregaContas();
  const [d,est,datas,ins]=await Promise.all([getRows('conteudos',true),api('/content/states').catch(()=>({rows:[]})),api('/datas?dias=60').catch(()=>({rows:[]})),api('/insights'+igQ()).catch(()=>null)]);
  if(state.page!=='studio')return; // o usuário já foi para outra aba: descarta este carregamento atrasado
  studioCache={rows:(d.rows||[]).filter(r=>igContas.length<2||igContaDoPost(r)===igConta),estados:new Map((est.rows||[]).map(x=>[x.id,x.estado])),datas:datas.rows||[],horarios:ins?.horarios||null};
  desenharStudio();
}

function desenharStudio(){
  if(!studioSemana)studioSemana=stSegunda(new Date());
  const rows=studioCache.rows,vis=stFiltrar(rows),hoje=today(),ini=studioSemana,fim=stAddDias(ini,6);
  const cont=s=>rows.filter(r=>String(r.status||'').toUpperCase()===s).length;
  const prox14=rows.filter(r=>stAtivo(r)&&stDia(r)>=hoje&&stDia(r)<=stIso(stAddDias(new Date(),14))&&/PROGRAMADO|APROVADO/i.test(r.status||'')).length;
  const mes=hoje.slice(0,7),pubMes=rows.filter(r=>/PUBLICADO/i.test(r.status||'')&&stDia(r).slice(0,7)===mes).length;
  const dias=[...Array(7)].map((_,i)=>stAddDias(ini,i));
  const datasPor=new Map();studioCache.datas.forEach(x=>{(datasPor.get(x.data)||datasPor.set(x.data,[]).get(x.data)).push(x)});
  const semData=vis.filter(r=>stAtivo(r)&&!stDia(r));
  const sel=(k,lista,cur)=>`<select data-stf="${k}"><option value="">${k==='perfil'?'Todos os perfis':k==='status'?'Todas as etapas':'Todos os formatos'}</option>${lista.map(v=>`<option value="${attr(v)}" ${cur===v?'selected':''}>${esc(ST_ROTULO[v]||v)}</option>`).join('')}</select>`;
  const h=studioCache.horarios;
  const dica=h?.melhor?`<b>${esc(h.melhor.dia)}</b> às <b>${h.melhor.hora}h</b> tem a melhor média de interações (confiança ${esc(h.melhor.confianca)}, ${h.amostra} posts analisados).${h.porFormato&&Object.keys(h.porFormato).length?`<br><small>Por formato: ${Object.entries(h.porFormato).map(([k,v])=>`${esc(IG_TIPO[k]||k)}: ${esc(v.dia)} ${v.hora}h`).join(' · ')}</small>`:''}`:(h?`Ainda há poucos posts sincronizados para sugerir horário (${h.amostra} de ${h.minimo}).`:'Conecte o Instagram para ver o melhor horário.');
  const fmtSem=`${fmtDate(stIso(ini))} a ${fmtDate(stIso(fim))}`;
  $('#content').innerHTML=`<div class="dashboard-head"><div><small>ESTÚDIO DE PUBLICAÇÕES</small><h1>Quem publica o quê, e quando</h1><p>Arraste os posts entre os dias para reagendar. Nada é publicado sozinho sem você marcar e aprovar.</p></div><div class="st-head-btns">${igSeletor()}${internalSession?.role==='manager'?'<button class="softbtn" id="stCompartilha">Compartilhar calendário</button>':''}<button class="btn" id="stNovo">+ Novo post</button></div></div>
  <div class="kpis st-kpis"><div class="kpi"><small>Rascunhos</small><strong>${cont('PRODUÇÃO')+cont('BRIEFING')+cont('IDEIA')}</strong></div><div class="kpi orange"><small>Em aprovação</small><strong>${cont('REVISÃO')}</strong></div><div class="kpi"><small>Aprovados</small><strong>${cont('APROVADO')}</strong></div><div class="kpi green"><small>Agendados (14 dias)</small><strong>${prox14}</strong></div><div class="kpi"><small>Publicados no mês</small><strong>${pubMes}</strong></div></div>
  <div class="card st-tip"><span>◷</span><div>${dica}</div></div>
  <div class="st-toolbar"><div class="st-nav"><button class="softbtn" id="stPrev" aria-label="Semana anterior">‹</button><b>${fmtSem}</b><button class="softbtn" id="stNext" aria-label="Próxima semana">›</button><button class="softbtn" id="stHoje">Hoje</button></div><div class="st-filtros">${sel('perfil',[...new Set([...(SELECTS.perfil||[]),...rows.map(r=>r.perfil).filter(Boolean)])],studioFiltro.perfil)}${sel('status',Object.keys(ST_ROTULO),studioFiltro.status)}${sel('formato',SELECTS.formato||[],studioFiltro.formato)}</div></div>
  <div class="st-layout"><aside class="st-backlog" data-date=""><h3>Sem data <span>${semData.length}</span></h3><p class="kpi-note">Arraste para um dia da semana para agendar.</p><div class="st-lista">${semData.map(stCard).join('')||'<div class="empty compact">Tudo com data.</div>'}</div></aside>
  <div class="st-week">${dias.map(dt=>{const iso=stIso(dt),ps=vis.filter(r=>stDia(r)===iso).sort((a,b)=>stHora(a).localeCompare(stHora(b)));const ds=datasPor.get(iso)||[];return `<section class="st-day ${iso===hoje?'today':''} ${iso<hoje?'past':''}" data-date="${iso}"><header><b>${ST_DIAS[dt.getDay()].slice(0,3)}</b><span>${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}</span><button class="st-add" data-add="${iso}" aria-label="Novo post em ${iso}">+</button></header>${ds.map(x=>`<div class="st-data" title="${attr(x.tema)}">★ ${esc(x.titulo)}</div>`).join('')}${ps.map(stCard).join('')}</section>`}).join('')}</div></div>`;
  $('#stNovo').onclick=()=>studioCompositor(null);
  if($('#stCompartilha'))$('#stCompartilha').onclick=studioCompartilhar;
  $('#stPrev').onclick=()=>{studioSemana=stAddDias(studioSemana,-7);desenharStudio()};
  $('#stNext').onclick=()=>{studioSemana=stAddDias(studioSemana,7);desenharStudio()};
  $('#stHoje').onclick=()=>{studioSemana=stSegunda(new Date());desenharStudio()};
  igLigaSeletor(renderStudio);
  $$('[data-stf]').forEach(s=>s.onchange=()=>{studioFiltro[s.dataset.stf]=s.value;desenharStudio()});
  $$('.st-add').forEach(b=>b.onclick=()=>studioCompositor(null,b.dataset.add));
  $$('.st-card').forEach(c=>c.onclick=()=>studioCompositor(studioCache.rows.find(r=>r.id===c.dataset.id)));
  let arrastando='';
  $$('.st-card[draggable]').forEach(c=>{c.ondragstart=e=>{arrastando=c.dataset.id;c.classList.add('dragging');e.dataTransfer?.setData('text/plain',arrastando)};c.ondragend=()=>c.classList.remove('dragging')});
  $$('.st-day,.st-backlog').forEach(z=>{z.ondragover=e=>{e.preventDefault();z.classList.add('over')};z.ondragleave=()=>z.classList.remove('over');z.ondrop=async e=>{e.preventDefault();z.classList.remove('over');const id=arrastando||e.dataTransfer?.getData('text/plain');arrastando='';if(!id)return;await studioMover(id,z.dataset.date)}});
}

async function studioMover(id,data){
  const r=studioCache.rows.find(x=>x.id===id);if(!r)return;
  if(data&&data<today()&&!confirm('Esse dia já passou. Agendar mesmo assim?'))return;
  const hora=stHora(r)||'09:00',novo=data?`${data}T${hora}`:'';
  if(stDia(r)===data)return;
  try{await api(`/data?module=conteudos&id=${encodeURIComponent(id)}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({publicacaoEm:novo})});invalidate('conteudos');toast(data?`Reagendado para ${fmtDate(data)} às ${hora}`:'Post voltou para "Sem data"');await renderStudio()}catch(e){toast(e.message,'bad')}
}

// ---------- compositor ----------
function stProximaData(diaNome,hora){
  const alvo=ST_DIAS.indexOf(diaNome);if(alvo<0)return '';
  const d=new Date();d.setHours(12,0,0,0);for(let i=1;i<=7;i++){const x=stAddDias(d,i);if(x.getDay()===alvo)return `${stIso(x)}T${String(hora).padStart(2,'0')}:00`}return '';
}
async function studioCompositor(row,dataIni=''){
  const edit=!!row,r=row||{},jaPublicado=!!r.instagramMediaId||/PUBLICADO/i.test(r.status||'');
  const perfis=[...new Set([...(SELECTS.perfil||[]),r.perfil].filter(Boolean))],formatos=SELECTS.formato||[];
  let falha='';if(edit&&!jaPublicado){try{const fila=await api('/integrations/instagram/queue');const x=fila.find(y=>y.id===r.id);if(x&&x.estado==='ERRO')falha=x.erro||'Falha desconhecida'}catch{}}
  let grupos=[];try{grupos=(await api('/studio/hashtags')).grupos||[]}catch{}
  const h=studioCache.horarios?.melhor,sug=h?stProximaData(h.dia,h.hora):'';
  const o=adminOverlay(`<div class="st-comp"><form id="stForm" class="st-form"><h3>${edit?'Editar post':'Novo post'}</h3>
   ${falha?`<div class="st-sug" id="sfFalha"><span class="tg-ruim">A publicação automática falhou: ${esc(falha)}</span><button type="button" class="softbtn" id="sfRetry">Tentar de novo</button></div>`:''}
   <label>Título interno<input id="sfTitulo" maxlength="140" value="${attr(r.titulo||'')}" placeholder="Ex.: Aula aberta — Ensino Médio"></label>
   ${igContas.length>1?`<label>Conta do Instagram<select id="sfConta">${igContas.map(c=>`<option value="${attr(c.ig)}" ${(r.contaInstagram||igConta)===c.ig?'selected':''}>@${esc(c.usuario)}</option>`).join('')}</select></label>`:''}
   <div class="st-row"><label>Perfil<select id="sfPerfil">${perfis.map(p=>`<option ${r.perfil===p?'selected':''}>${esc(p)}</option>`).join('')}</select></label><label>Formato<select id="sfFormato">${formatos.map(f=>`<option ${(r.formato||'Feed')===f?'selected':''}>${esc(f)}</option>`).join('')}</select></label></div>
   <label>Legenda <span class="st-cont" id="sfCLeg"></span><textarea id="sfLegenda" rows="6" placeholder="Escreva a legenda…">${esc(r.legenda||'')}</textarea></label>
   <div class="st-ia"><button type="button" class="softbtn" id="sfIA">✦ Sugerir legendas com IA</button> <button type="button" class="softbtn" id="sfMod">❏ Modelos de legenda</button><small class="kpi-note">As 125 primeiras letras aparecem antes do "mais".</small></div>
   <label>Hashtags <span class="st-cont" id="sfCTag"></span><textarea id="sfTags" rows="2" placeholder="#evolução #colégio">${esc(r.hashtags||'')}</textarea></label>
   <div class="st-grupos" id="sfGrupos"></div>
   <label>Chamada para ação (CTA)<input id="sfCta" maxlength="160" value="${attr(r.cta||'')}" placeholder="Ex.: Link na bio para se inscrever"></label>
   <div class="st-row"><label>Data e hora<input id="sfQuando" type="datetime-local" value="${attr(r.publicacaoEm||(dataIni?dataIni+'T09:00':''))}"></label><label>Revisor<input id="sfRevisor" value="${attr(r.revisor||'')}" placeholder="Quem aprova"></label></div>
   ${sug?`<div class="st-sug"><span>Melhor momento nos seus dados: <b>${esc(h.dia)} às ${h.hora}h</b></span><button type="button" class="softbtn" id="sfSug">Usar</button></div>`:''}
   <label>Mídia (JPEG ou vídeo MP4/MOV; para Carrossel selecione de 2 a 20 arquivos de uma vez)${(()=>{let n=0;try{n=JSON.parse(r.midiasInstagram||'[]').length}catch{}return n>1?` <small>— ${n} itens já anexados; enviar novos substitui todos</small>`:''})()} <input id="sfArq" type="file" multiple accept=".jpg,.jpeg,.mp4,.mov,image/jpeg,video/mp4,video/quicktime"></label>
   <label class="check-row"><input type="checkbox" id="sfIG" ${(edit?/SIM/i.test(r.publicarInstagram||''):true)?'checked':''}> Publicar no Instagram automaticamente na data e hora marcadas (só se estiver Aprovado ou Agendado, com mídia anexada)</label>
   <label>Colab com (@usuário; até 3, separados por vírgula)<input id="sfColab" maxlength="120" value="${attr(r.colaboradores||'')}" placeholder="${esc(igContas.filter(c=>c.ig!==(r.contaInstagram||igConta)).map(c=>'@'+c.usuario).join(', ')||'@perfil')}"></label>
   <p class="kpi-note">Publica como colaboração: o post aparece nos dois perfis depois que o convidado aceitar o convite no Instagram. Vale para Feed e Reels.</p>
   <label class="check-row"><input type="checkbox" id="sfTagCom" ${/SIM/i.test(r.hashtagsComentario||'')?'checked':''}> Colocar as hashtags no primeiro comentário (legenda mais limpa)</label>
   <div class="st-acoes"><button class="btn soft" type="button" data-close>Cancelar</button><button class="softbtn" type="button" data-s="RASCUNHO">Salvar rascunho</button><button class="softbtn" type="button" data-s="APROVACAO">Enviar para aprovação</button><button class="btn" type="button" data-s="AGENDADO">Agendar</button>${edit?'<button class="softbtn" type="button" data-s="MANTER">Salvar sem mudar a etapa</button>':''}${jaPublicado?'':'<button class="btn accent" type="button" data-s="PUBLICAR">Publicar agora no Instagram</button>'}</div>
   ${edit&&/REVIS/i.test(r.status||'')?'<div class="st-linkbox"><button class="softbtn" type="button" id="sfLink">Gerar link para a direção aprovar</button><small class="kpi-note">Salve as alterações antes. A pessoa abre o link sem login, vê o post e aprova ou pede ajustes.</small><div id="sfLinkBox"></div></div>':''}
   ${jaPublicado?`<p class="kpi-note">Já publicado${urlSegura(r.instagramLink)?` — <a href="${attr(urlSegura(r.instagramLink))}" target="_blank" rel="noopener">ver no Instagram</a>`:''}.</p>`:''}
   ${edit?`<p class="kpi-note">Etapa atual: <b>${esc(ST_ROTULO[String(r.status||'').toUpperCase()]||r.status||'—')}</b></p>`:''}</form>
   <div class="st-prev"><div class="st-fone" id="sfFone"><div class="st-fh"><i></i><b id="pvPerfil"></b></div><div class="st-midia" id="pvMidia"></div><div class="st-fa">♡ ◌ ➤</div><div class="st-fc" id="pvLegenda"></div><small id="pvQuando"></small></div><p class="kpi-note">Prévia aproximada. O Instagram pode cortar a imagem e a legenda de outro jeito.</p></div></div>`);
  o.el.querySelector('.admin-box').classList.add('st-box');
  const g=id=>o.el.querySelector('#'+id);let arquivoUrl=r.midiaPrevia||'';
  const pv=()=>{
    const leg=g('sfLegenda').value,tags=g('sfTags').value,cta=g('sfCta').value,perfil=g('sfPerfil').value,fm=g('sfFormato').value;
    g('sfCLeg').textContent=`${leg.length}/2200`;g('sfCLeg').classList.toggle('bad',leg.length>2200);
    const nt=stContaTags(tags)+stContaTags(leg);g('sfCTag').textContent=`${nt}/30`;g('sfCTag').classList.toggle('bad',nt>30);
    g('pvPerfil').textContent=perfil||'perfil';
    const m=g('pvMidia');m.className='st-midia fm-'+(['Reels','Stories','Vídeo'].includes(fm)?'vert':'feed');
    m.innerHTML=arquivoUrl?(/video/.test(g('sfArq').files?.[0]?.type||'')?`<video src="${attr(arquivoUrl)}" muted></video>`:`<img alt="" src="${attr(arquivoUrl)}">`):`<span>${ST_ICONE[fm]||'◇'}<br>${esc(fm)}</span>`;
    const txt=leg+(cta?'\n'+cta:''),corte=txt.length>125?txt.slice(0,125)+'… mais':txt;
    g('pvLegenda').innerHTML=`<b>${esc(perfil)}</b> ${esc(corte).replace(/\n/g,'<br>')}${tags?`<div class="st-tags">${esc(tags)}</div>`:''}`;
    const q=g('sfQuando').value;g('pvQuando').textContent=q?`${fmtDate(q.slice(0,10))} às ${q.slice(11,16)}`:'Sem data';
  };
  const rt=g('sfRetry');if(rt)rt.onclick=async()=>{try{await api('/integrations/instagram/retry',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:r.id})});g('sfFalha').remove();toast('Pronto: o sistema tenta publicar de novo no próximo ciclo (até 10 min) ou use "Publicar agora"')}catch(e){toast(e.message,'bad')}};
  const desenhaGrupos=()=>{g('sfGrupos').innerHTML=`<small>Grupos de hashtags:</small> ${grupos.map((x,i)=>`<span class="st-chip"><button type="button" data-gu="${i}" title="Adicionar ${attr(x.tags.join(' '))}">${esc(x.nome)} (${x.tags.length})</button><button type="button" class="x" data-gx="${i}" aria-label="Apagar grupo ${attr(x.nome)}">×</button></span>`).join('')||'<small>nenhum ainda</small>'} <button type="button" class="softbtn" id="sfGSalvar">Salvar estas como grupo</button>`;
    g('sfGrupos').querySelectorAll('[data-gu]').forEach(b=>b.onclick=()=>{const cur=g('sfTags').value.split(/\s+/).filter(Boolean),novo=grupos[+b.dataset.gu].tags.filter(t=>!cur.includes(t));g('sfTags').value=[...cur,...novo].join(' ');pv()});
    g('sfGrupos').querySelectorAll('[data-gx]').forEach(b=>b.onclick=async()=>{const x=grupos[+b.dataset.gx];if(!confirm(`Apagar o grupo "${x.nome}"?`))return;grupos=grupos.filter((_,i)=>i!==+b.dataset.gx);await stSalvaGrupos(grupos);desenhaGrupos()});
    g('sfGSalvar').onclick=async()=>{const tags=(g('sfTags').value.match(/#[\p{L}\p{N}_]+/gu)||[]);if(!tags.length)return toast('Escreva as hashtags primeiro','warn');const nome=(prompt('Nome do grupo (ex.: Matrículas)')||'').trim();if(!nome)return;grupos=[...grupos.filter(x=>x.nome.toLowerCase()!==nome.toLowerCase()),{nome,tags}];await stSalvaGrupos(grupos);desenhaGrupos();toast('Grupo salvo')};
  };
  ['sfLegenda','sfTags','sfCta','sfPerfil','sfFormato','sfQuando'].forEach(i=>{g(i).oninput=pv;g(i).onchange=pv});
  g('sfArq').onchange=()=>{const f=g('sfArq').files[0];arquivoUrl=f?URL.createObjectURL(f):'';pv()};
  if(g('sfSug'))g('sfSug').onclick=()=>{g('sfQuando').value=sug;pv()};
  g('sfMod').onclick=async()=>{
    let lista=[];try{lista=(await api('/studio/modelos')).modelos||[]}catch(e){return toast(e.message,'bad')}
    const salva=async l=>{await api('/studio/modelos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({modelos:l})})};
    const ov=adminOverlay('<div id="mdBox"></div>');
    const desenha=()=>{ov.el.querySelector('#mdBox').innerHTML=`<h3>Modelos de legenda</h3><p class="kpi-note">Use <b>{curso}</b>, <b>{data}</b>, <b>{link}</b> e escreva por cima depois de inserir.</p><div class="origem-list">${lista.map((m,i)=>`<div class="notif"><b>${esc(m.nome)}</b><div style="white-space:pre-wrap">${esc(m.legenda.slice(0,240))}</div><div><button class="softbtn" type="button" data-mu="${i}">Usar</button> <button class="softbtn" type="button" data-md="${i}">Excluir</button></div></div>`).join('')||'<div class="empty compact">Nenhum modelo ainda.</div>'}</div><div class="st-acoes"><button class="btn soft" type="button" data-close>Fechar</button><button class="btn" type="button" id="mdNovo">Salvar a legenda atual como modelo</button></div>`;
      ov.el.querySelectorAll('[data-mu]').forEach(b=>b.onclick=()=>{const m=lista[+b.dataset.mu];g('sfLegenda').value=m.legenda;if(m.cta)g('sfCta').value=m.cta;if(m.hashtags)g('sfTags').value=m.hashtags;pv();ov.close()});
      ov.el.querySelectorAll('[data-md]').forEach(b=>b.onclick=async()=>{if(!confirm('Excluir este modelo?'))return;lista.splice(+b.dataset.md,1);try{await salva(lista);desenha()}catch(e){toast(e.message,'bad')}});
      ov.el.querySelector('#mdNovo').onclick=async()=>{const leg=g('sfLegenda').value.trim();if(!leg)return toast('Escreva a legenda primeiro','warn');const nome=(prompt('Nome do modelo (ex.: Matrículas abertas)')||'').trim();if(!nome)return;lista.push({nome,legenda:leg,cta:g('sfCta').value,hashtags:g('sfTags').value});try{await salva(lista);desenha();toast('Modelo salvo')}catch(e){toast(e.message,'bad')}};
    };desenha();
  };
  g('sfIA').onclick=async()=>{
    if(!edit)return toast('Salve o rascunho primeiro; a IA usa os dados do post salvo.','warn');
    try{const d=await api('/ia/legenda',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({modulo:'conteudos',id:r.id})});
      const ov=adminOverlay(`<h3>Rascunhos de legenda</h3><p class="kpi-note">Revise antes de usar.</p><div class="origem-list">${d.opcoes.map((x,i)=>`<div class="notif"><div style="white-space:pre-wrap">${esc(x.legenda)}</div><small>${esc(x.hashtags.join(' '))}</small><div><button class="softbtn" data-usar="${i}">Usar esta</button></div></div>`).join('')}</div><div class="actions"><button class="btn soft" data-close>Fechar</button></div>`);
      ov.el.querySelectorAll('[data-usar]').forEach(b=>b.onclick=()=>{const x=d.opcoes[+b.dataset.usar];g('sfLegenda').value=x.legenda;if(x.hashtags.length)g('sfTags').value=x.hashtags.join(' ');pv();ov.close()})}catch(e){toast(e.message,'warn')}
  };
  if(g('sfLink'))g('sfLink').onclick=async()=>{
    try{const d=await api('/manager/approval-link',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:r.id,dias:7})});
      g('sfLinkBox').innerHTML=`<input readonly id="sfLinkUrl" value="${attr(d.url)}"><button type="button" class="softbtn" id="sfLinkCopia">Copiar</button><small class="kpi-note">Vale ${d.dias} dias e só pode ser usado uma vez.</small>`;
      g('sfLinkCopia').onclick=()=>{navigator.clipboard?.writeText(d.url);toast('Link copiado')};g('sfLinkUrl').onfocus=e=>e.target.select()}catch(e){toast(e.message,'warn')}
  };
  const salvar=async tipo=>{
    const titulo=g('sfTitulo').value.trim(),leg=g('sfLegenda').value,quando=g('sfQuando').value;
    if(!titulo)return toast('Dê um título interno ao post','warn');
    if(leg.length>2200)return toast('A legenda passou de 2.200 caracteres','warn');
    if(stContaTags(g('sfTags').value)+stContaTags(leg)>30)return toast('O Instagram aceita no máximo 30 hashtags','warn');
    if(tipo==='AGENDADO'&&!quando)return toast('Escolha a data e a hora para agendar','warn');
    const gerente=internalSession?.role==='manager',liberado=/^(APROVADO|PROGRAMADO)$/i.test(r.status||'');
    if(tipo==='AGENDADO'&&!gerente&&!liberado)return toast('Só agenda depois de aprovado. Use "Enviar para aprovação".','warn');
    if(g('sfFormato').value==='Carrossel'&&g('sfArq').files.length===1)return toast('O carrossel precisa de 2 a 20 mídias: selecione todas de uma vez.','warn');
    if(tipo==='PUBLICAR'){
      if(!g('sfArq').files[0]&&!r.midiaInstagram)return toast('Anexe a mídia (JPEG ou vídeo) antes de publicar','warn');
      if(!gerente&&!liberado)return toast('Só publica depois de aprovado. Use "Enviar para aprovação".','warn');
      if(!confirm(gerente&&!liberado?'Isto APROVA e PUBLICA agora no Instagram do colégio. Não dá para desfazer pelo sistema. Continuar?':'Publicar agora no Instagram do colégio? Não dá para desfazer pelo sistema.'))return;
    }
    const body={titulo,perfil:g('sfPerfil').value,formato:g('sfFormato').value,canal:'Instagram',legenda:leg,hashtags:g('sfTags').value,cta:g('sfCta').value,publicacaoEm:quando,revisor:g('sfRevisor').value,publicarInstagram:g('sfIG').checked?'SIM':'NÃO',hashtagsComentario:g('sfTagCom').checked?'SIM':'NÃO'};
    if(g('sfConta'))body.contaInstagram=g('sfConta').value;
    body.colaboradores=g('sfColab').value.split(/[\s,;]+/).map(x=>x.replace(/^@/,'').trim()).filter(Boolean).slice(0,3).map(x=>'@'+x).join(', ');
    if(tipo==='PUBLICAR'){if(!liberado)body.status='APROVADO';if(!body.publicacaoEm)body.publicacaoEm=stAgoraLocal()}else if(tipo!=='MANTER')body.status=ST_ETAPAS[tipo];else if(!edit)body.status='PRODUÇÃO';
    try{
      const salvo=await api(edit?`/data?module=conteudos&id=${encodeURIComponent(r.id)}`:'/data?module=conteudos',{method:edit?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      const id=salvo?.id||r.id,f=g('sfArq').files[0];
      if(f&&id){const fd=new FormData();for(const ff of g('sfArq').files)fd.append('files',ff);const rs=await fetch(API+'/integrations/instagram/media?id='+encodeURIComponent(id),{method:'POST',credentials:'same-origin',headers:{'X-EVO':'1'},body:fd});if(!rs.ok){const j=await rs.json().catch(()=>({}));toast('Post salvo, mas a mídia não subiu: '+(j.error||rs.status),'warn')}}
      if(tipo==='PUBLICAR'){
        o.el.querySelectorAll('button').forEach(b=>b.disabled=true);toast('Publicando… pode levar até 1 minuto');
        try{const pr=await api('/integrations/instagram/publish',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})});invalidate('conteudos');o.close();toast(pr.status==='PUBLICADO'?'Publicado no Instagram!':'O Instagram está processando o vídeo; o sistema conclui sozinho');await renderStudio();return}
        catch(e){invalidate('conteudos');o.close();toast('Salvo, mas não publicou: '+e.message,'bad');await renderStudio();return}
      }
      invalidate('conteudos');o.close();toast(tipo==='APROVACAO'?'Enviado para aprovação':tipo==='AGENDADO'?(g('sfIG').checked&&!f&&!r.midiaInstagram?'Agendado, mas SEM mídia anexada: o post não sai sozinho até você anexar':g('sfIG').checked?'Agendado: publica sozinho em '+quando.slice(8,10)+'/'+quando.slice(5,7)+' às '+quando.slice(11,16):'Post agendado (sem publicação automática)'):'Post salvo');await renderStudio();
    }catch(e){toast(e.message,'bad')}
  };
  o.el.querySelectorAll('[data-s]').forEach(b=>b.onclick=()=>salvar(b.dataset.s));
  desenhaGrupos();pv();
}
async function stSalvaGrupos(grupos){try{await api('/studio/hashtags',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({grupos})})}catch(e){toast(e.message,'bad')}}

// ---------- Desempenho por publicação (Instagram) ----------
let igFiltro={periodo:'90',tipo:'',ordem:'recentes'},igDados=null;
const IG_TIPO={FEED:'Feed',REELS:'Reels',STORY:'Stories',CAROUSEL_ALBUM:'Carrossel',IMAGE:'Feed',VIDEO:'Vídeo'};
const IG_ORDEM={recentes:['Mais recentes',(a,b)=>String(b.quando).localeCompare(String(a.quando))],interacoes:['Mais interações',(a,b)=>b.interacoes-a.interacoes],alcance:['Maior alcance',(a,b)=>(b.alcance??-1)-(a.alcance??-1)],engajamento:['Maior engajamento',(a,b)=>(b.engajamento??-1)-(a.engajamento??-1)]};
const igNum=n=>Number(n||0).toLocaleString('pt-BR');
async function renderIgPosts(){
  await igCarregaContas();await adsCarregaModo();
  const d=await api('/instagram/posts'+igQ());
  if(state.page!=='igposts')return;
  igDados=d;
  desenharIgPosts();
}
function desenharIgPosts(){
  const todos=igDados.rows||[],corte=igFiltro.periodo==='tudo'?null:new Date(Date.now()-Number(igFiltro.periodo)*86400000);
  const tipoDe=r=>IG_TIPO[r.tipo]||r.tipo||'Outro';
  let rows=todos.filter(r=>(!corte||new Date(String(r.quando).replace(/([+-]\d\d)(\d\d)$/,'$1:$2'))>=corte)&&(!igFiltro.tipo||tipoDe(r)===igFiltro.tipo));
  rows=[...rows].sort(IG_ORDEM[igFiltro.ordem][1]);
  const tipos=[...new Set(todos.map(tipoDe))];
  const porTipo=tipos.map(t=>{const rs=rows.filter(r=>tipoDe(r)===t);if(!rs.length)return null;const com=rs.filter(r=>r.alcance!==null),m=(a,k)=>a.length?Math.round(a.reduce((s,r)=>s+(r[k]||0),0)/a.length):null;return {t,n:rs.length,inter:m(rs,'interacoes'),alc:m(com,'alcance'),eng:com.length?Math.round(com.reduce((s,r)=>s+(r.engajamento||0),0)/com.length*10)/10:null}}).filter(Boolean);
  const melhor=[...rows].sort(IG_ORDEM.interacoes[1])[0];
  const sel=(k,opts,cur)=>`<select data-igf="${k}">${opts.map(([v,l])=>`<option value="${attr(v)}" ${String(cur)===String(v)?'selected':''}>${esc(l)}</option>`).join('')}</select>`;
  const mini=r=>{const u=urlSegura(r.miniatura);return u?`<img alt="" loading="lazy" referrerpolicy="no-referrer" src="${attr(u)}">`:`<span>${ST_ICONE[tipoDe(r)]||'◇'}<br>${esc(tipoDe(r))}</span>`};
  const card=r=>{const l=urlSegura(r.link),dt=String(r.quando).slice(0,10);return `<article class="ig-card"><${l?`a href="${attr(l)}" target="_blank" rel="noopener"`:'div'} class="ig-thumb" title="Abrir no Instagram">${mini(r)}</${l?'a':'div'}><div class="ig-body"><div class="ig-meta"><b>${esc(tipoDe(r))}</b><span>${dt?fmtDate(dt):''}</span></div>${internalSession?.role==='manager'&&adsCompleto?`<button class="softbtn ig-imp" data-imp="${attr(r.id)}">Impulsionar</button>`:''}<p>${esc(r.legenda||'(sem legenda)')}</p><dl><div><dt>Curtidas</dt><dd>${igNum(r.curtidas)}</dd></div><div><dt>Comentários</dt><dd>${igNum(r.comentarios)}</dd></div><div><dt>Salvos</dt><dd>${igNum(r.salvos)}</dd></div><div><dt>Compart.</dt><dd>${igNum(r.compartilhamentos)}</dd></div><div><dt>Alcance</dt><dd>${r.alcance===null?'—':igNum(r.alcance)}</dd></div><div><dt>Engajamento</dt><dd>${r.engajamento===null?'—':String(r.engajamento).replace('.',',')+'%'}</dd></div></dl></div></article>`};
  const vazio=!todos.length;
  $('#content').innerHTML=`<div class="dashboard-head"><div><small>INSTAGRAM · DESEMPENHO</small><h1>O que funcionou em cada publicação</h1><p>${igDados.ultimaSync?`Última leitura da Meta: ${fmtDateTime(igDados.ultimaSync)}.`:'Ainda não houve leitura da Meta.'} Alcance, salvamentos e compartilhamentos vêm das 30 publicações mais recentes.</p></div>${internalSession?.role==='manager'?'<button class="btn" id="igAtualiza">Atualizar agora</button>':''}</div>
  ${vazio?`<div class="card empty"><strong>Nenhuma publicação lida ainda</strong><span>Conecte o Instagram em Administração → Integrações e clique em “Atualizar agora”.</span></div>`:`
  <div class="st-toolbar"><div class="st-filtros">${igSeletor()}${sel('periodo',[['30','Últimos 30 dias'],['90','Últimos 90 dias'],['365','Último ano'],['tudo','Tudo']],igFiltro.periodo)}${sel('tipo',[['','Todos os formatos'],...tipos.map(t=>[t,t])],igFiltro.tipo)}${sel('ordem',Object.entries(IG_ORDEM).map(([k,v])=>[k,v[0]]),igFiltro.ordem)}</div><span class="kpi-note">${rows.length} publicação(ões)</span></div>
  <div class="ig-resumo">${porTipo.map(x=>`<div class="card ig-tipo"><small>${esc(x.t.toUpperCase())} · ${x.n} POST(S)</small><div class="ig-nums"><div><strong>${x.inter===null?'—':igNum(x.inter)}</strong><span>interações em média</span></div><div><strong>${x.alc===null?'—':igNum(x.alc)}</strong><span>alcance médio</span></div><div><strong>${x.eng===null?'—':String(x.eng).replace('.',',')+'%'}</strong><span>engajamento médio</span></div></div></div>`).join('')||''}</div>
  ${melhor?`<div class="card st-tip"><span>★</span><div>Melhor publicação do período: <b>${esc((melhor.legenda||'sem legenda').slice(0,90))}</b> — ${igNum(melhor.interacoes)} interações.</div></div>`:''}
  <div class="ig-grid">${rows.map(card).join('')||'<div class="empty compact">Nada neste filtro.</div>'}</div>`}`;
  igLigaSeletor(renderIgPosts);
  $$('[data-igf]').forEach(s=>s.onchange=()=>{igFiltro[s.dataset.igf]=s.value;desenharIgPosts()});
  $$('[data-imp]').forEach(b=>b.onclick=()=>gestorImpulsionar(rows.find(x=>x.id===b.dataset.imp)));
  const b=$('#igAtualiza');if(b)b.onclick=async()=>{b.disabled=true;b.textContent='Atualizando…';try{await api('/integrations/instagram/sync',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});toast('Publicações atualizadas');await renderIgPosts()}catch(e){toast(e.message,'bad');b.disabled=false;b.textContent='Atualizar agora'}};
}

// ---------- Fechamento mensal: blocos para a direção (Instagram, atendimento, tráfego), saem no mesmo PDF ----------
const _renderFechamentoBase=renderMonthlyClosing;
renderMonthlyClosing=async function(){
  await _renderFechamentoBase();
  const grid=document.querySelector('.closing-grid'),month=document.getElementById('closingMonth')?.value;
  if(!grid||!month)return;
  const dtMes=new Date(month+'-01T12:00:00'),ate=stIso(new Date(dtMes.getFullYear(),dtMes.getMonth()+1,0,12));
  const mesAnt=stIso(new Date(dtMes.getFullYear(),dtMes.getMonth()-1,1,12)).slice(0,7);
  const brl=n=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const [ig,tr,posts,ind]=await Promise.all([getRows('instagram').catch(()=>({rows:[]})),getRows('trafego').catch(()=>({rows:[]})),api('/instagram/posts').catch(()=>({rows:[]})),api(`/indicadores?de=${month}-01&ate=${ate}`).catch(()=>null)]);
  if(document.getElementById('closingMonth')?.value!==month)return; // trocou de mês enquanto carregava
  const linha=(rows,p)=>(rows.rows||[]).find(r=>String(r.periodo||'').slice(0,7)===p&&r.origem==='INSTAGRAM_API');
  const a=linha(ig,month),b=linha(ig,mesAnt),num2=k=>Number(a?.[k]||0),numB=k=>Number(b?.[k]||0);
  const eng=r=>r&&Number(r.alcance)?Math.round(Number(r.interacoes||0)/Number(r.alcance)*1000)/10:null;
  const dosMes=(posts.rows||[]).filter(r=>String(r.quando).slice(0,7)===month).sort((x,y)=>y.interacoes-x.interacoes);
  const fmtT={FEED:'Feed',REELS:'Reels',STORY:'Stories',CAROUSEL_ALBUM:'Carrossel',IMAGE:'Feed',VIDEO:'Vídeo'};
  const cont=t=>dosMes.filter(r=>(fmtT[r.tipo]||r.tipo)===t).length;
  const kp=(l,v,ant)=>`<div class="closing-stat"><span>${esc(l)}</span><b>${igNum(v)} ${typeof trendBadge==='function'&&b?trendBadge(v,ant):''}</b></div>`;
  const cardIg=`<section class="card span2 fech-extra"><div class="card-title"><div><small>INSTAGRAM</small><h3>Resultado no mês</h3></div></div>${a?`<div class="closing-stat"><span>Seguidores (fim do mês)</span><b>${igNum(num2('seguidores'))} ${b?trendBadge(num2('seguidores'),numB('seguidores')):''}</b></div>${kp('Novos seguidores',num2('novosSeguidores'),numB('novosSeguidores'))}${kp('Alcance',num2('alcance'),numB('alcance'))}${kp('Interações',num2('interacoes'),numB('interacoes'))}${kp('Visitas ao perfil',num2('visitasPerfil'),numB('visitasPerfil'))}<div class="closing-stat"><span>Engajamento (interações ÷ alcance)</span><b>${eng(a)===null?'—':String(eng(a)).replace('.',',')+'%'}</b></div>`:'<div class="empty compact">Sem dados do Instagram neste mês. Conecte e sincronize em Administração → Integrações.</div>'}
    <div class="closing-stat"><span>Publicações no mês</span><b>${dosMes.length} (${cont('Feed')} feed · ${cont('Reels')} reels · ${cont('Carrossel')} carrossel)</b></div>
    ${dosMes.length?`<h4 class="fech-sub">Publicações com mais interações</h4>${dosMes.slice(0,3).map(r=>`<div class="goal-line"><span>${esc(String(r.legenda||'(sem legenda)').slice(0,80))}</span><b>${igNum(r.interacoes)} int.${r.alcance===null?'':' · '+igNum(r.alcance)+' alc.'}</b></div>`).join('')}`:''}</section>`;
  const lista=(ind?.indicadores||[]).filter(i=>/recebidas|Concluídas no período|SLA vencido|Cumprimento|Tempo médio|Avaliação|NPS/i.test(i.titulo)); // só o que a direção precisa; o painel completo fica na Central
  const cardAt=`<section class="card fech-extra"><div class="card-title"><div><small>ATENDIMENTO</small><h3>Solicitações no mês</h3></div></div>${lista.map(i=>`<div class="closing-stat"><span>${esc(i.titulo)}</span><b>${i.valor===null?'—':esc(String(i.valor))+(i.unidade?(i.unidade==='%'?'%':' '+esc(i.unidade)):'')}</b></div>`).join('')||'<div class="empty compact">Sem indicadores no período.</div>'}</section>`;
  const trm=(tr.rows||[]).filter(r=>String(r.periodo||'').slice(0,7)===month),soma=k=>trm.reduce((s,r)=>s+Number(r[k]||0),0);
  const inv=soma('investimento'),leads=soma('leads'),conv=soma('conversas');
  const cardTr=`<section class="card fech-extra"><div class="card-title"><div><small>TRÁFEGO PAGO</small><h3>Investimento e retorno</h3></div></div>${trm.length?`<div class="closing-stat"><span>Investimento</span><b>${brl(inv)}</b></div><div class="closing-stat"><span>Impressões</span><b>${igNum(soma('impressoes'))}</b></div><div class="closing-stat"><span>Cliques</span><b>${igNum(soma('cliques'))}</b></div><div class="closing-stat"><span>Conversas iniciadas</span><b>${igNum(conv)}${conv?' · '+brl(inv/conv)+' cada':''}</b></div><div class="closing-stat"><span>Leads</span><b>${igNum(leads)}${leads?' · '+brl(inv/leads)+' cada':''}</b></div>`:'<div class="empty compact">Sem dados de tráfego neste mês.</div>'}</section>`;
  grid.insertAdjacentHTML('beforeend',`<div id="closingExtras" class="span2" style="display:contents">${cardIg}${cardAt}${cardTr}</div>`);
};

// ---------- calendário compartilhável (somente leitura, por link) ----------
async function studioCompartilhar(){
  let st;try{st=await api('/manager/calendario-link')}catch(e){return toast(e.message,'bad')}
  const o=adminOverlay(`<h3>Compartilhar o calendário</h3><p class="kpi-note">Quem tiver o link abre sem login e vê só os próximos posts (em aprovação, aprovados, agendados e publicados). Rascunhos e ideias nunca aparecem, e não dá para editar nada por esse link.</p><div id="cmpBox">${st.ativo?`<p>Há um link ativo até <b>${esc(fmtDateTime(st.expiraEm))}</b>. Por segurança, o endereço só aparece na hora em que é criado.</p>`:'<p>Nenhum link ativo.</p>'}</div><div class="actions"><button class="btn" id="cmpCriar">${st.ativo?'Gerar novo link (o anterior deixa de funcionar)':'Criar link (30 dias)'}</button>${st.ativo?'<button class="softbtn" id="cmpOff">Desativar o link</button>':''}<button class="btn soft" data-close>Fechar</button></div>`);
  const post=acao=>api('/manager/calendario-link',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({acao,dias:30})});
  o.el.querySelector('#cmpCriar').onclick=async()=>{try{const d=await post('criar');o.el.querySelector('#cmpBox').innerHTML=`<p>Link criado, válido por ${d.dias} dias:</p><div class="st-linkbox"><div id="sfLinkBox"><input readonly id="cmpUrl" value="${attr(d.url)}"><button type="button" class="softbtn" id="cmpCopia">Copiar</button></div></div>`;o.el.querySelector('#cmpCopia').onclick=()=>{navigator.clipboard?.writeText(d.url);toast('Link copiado')};o.el.querySelector('#cmpUrl').onfocus=e=>e.target.select()}catch(e){toast(e.message,'bad')}};
  const off=o.el.querySelector('#cmpOff');if(off)off.onclick=async()=>{if(!confirm('Desativar o link? Quem o tem deixa de ver o calendário.'))return;try{await post('desativar');toast('Link desativado');o.close()}catch(e){toast(e.message,'bad')}};
}

// ---------- Tráfego: saúde da conta, mês × mês anterior, orçamento, gasto por dia e ranking de anúncios (somente leitura) ----------
async function painelTrafegoExtra(){
  const host=$('#content');if(!host)return;
  let d;try{d=await api('/traffic/painel')}catch{return}
  if(state.page!=='trafego')return;
  const brl=(v,m)=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:m||d.mes.moeda||'BRL'});
  const n0=v=>Number(v||0).toLocaleString('pt-BR');
  const delta=(a,b,inverso=false)=>{if(!b)return '';const p=Math.round((a-b)/b*100);if(!p)return '<small class="delta">= mês anterior</small>';const bom=inverso?p<0:p>0;return `<small class="delta ${bom?'up':'down'}">${p>0?'+':''}${p}% vs mês anterior</small>`};
  const m=d.mes,a=d.mesAnterior,gerente=internalSession?.role==='manager';
  const cpr=x=>x.resultados?x.gasto/x.resultados:null,ctr=x=>x.impressoes?x.cliques/x.impressoes*100:null;
  const kp=(l,v,dl)=>`<div class="kpi"><small>${esc(l)}</small><strong>${v}</strong>${dl}</div>`;
  const sa=d.saude;
  const saude=sa?`<span class="badge ${sa.ok?'ok':'bad'}">${esc(sa.rotulo)}</span>${sa.forma?` <small>${esc(sa.forma)}</small>`:''}`:'<small>Atualize para ler o estado da conta.</small>';
  const pc=d.pacing;
  const pacing=pc?`<div class="tg-pacing"><div class="tg-barra" role="img" aria-label="Gasto ${Math.round(pc.gasto/pc.orcamento*100)}% do orçamento"><i style="width:${Math.min(100,pc.gasto/pc.orcamento*100)}%"></i><b style="left:${Math.min(100,pc.projecao/pc.orcamento*100)}%" title="Projeção até o fim do mês"></b></div><p>Gasto até hoje <b>${brl(pc.gasto)}</b> de <b>${brl(pc.orcamento)}</b>. No ritmo atual o mês fecha em <b class="${pc.projecao>pc.orcamento*1.05?'tg-ruim':''}">${brl(pc.projecao)}</b> (${Math.round(pc.projecao/pc.orcamento*100)}% do orçamento).</p></div>`:'<p class="kpi-note">Defina o orçamento do mês para acompanhar o ritmo de gasto e receber aviso antes de estourar.</p>';
  const dias=d.diario,max=Math.max(1,...dias.map(x=>x.gasto));
  const soma=(arr,k)=>arr.reduce((s,x)=>s+x[k],0),u7=dias.slice(-7),a7=dias.slice(-14,-7);
  const grafico=dias.length?`<div class="tg-dias" role="img" aria-label="Gasto por dia nos últimos 30 dias">${dias.map(x=>`<span title="${attr(fmtDate(x.dia)+': '+brl(x.gasto)+' · '+x.resultados+' resultado(s)')}" class="${x.gasto===0?'zero':''}"><i style="height:${Math.max(2,Math.round(x.gasto/max*100))}%"></i></span>`).join('')}</div><p class="kpi-note">Últimos 7 dias: <b>${brl(soma(u7,'gasto'))}</b> e ${n0(soma(u7,'resultados'))} resultado(s)${a7.length?` · 7 dias antes: ${brl(soma(a7,'gasto'))} e ${n0(soma(a7,'resultados'))}`:''}. Barra baixa e vermelha = dia sem gasto.</p>`:'<div class="empty compact">Sem leitura diária ainda. A Gerência clica em “Atualizar agora”.</div>';
  const ads=d.anuncios,cr=x=>x.resultados?x.gasto/x.resultados:null,ctrA=x=>x.impressoes?x.cliques/x.impressoes*100:null;
  const linha=x=>`<tr><td>${esc(x.anuncio)}<br><small>${esc(x.campanha||'')}</small></td><td>${esc(brl(x.gasto,x.moeda))}</td><td>${n0(x.resultados)}</td><td>${cr(x)===null?'—':esc(brl(cr(x),x.moeda))}</td><td>${ctrA(x)===null?'—':ctrA(x).toFixed(2).replace('.',',')+'%'}</td></tr>`;
  const tabela=(t,l)=>`<div><h4>${t}</h4>${l.length?`<div class="tablewrap"><table class="datatable"><thead><tr><th>Anúncio</th><th>Gasto</th><th>Resultados</th><th>Custo/resultado</th><th>CTR</th></tr></thead><tbody>${l.map(linha).join('')}</tbody></table></div>`:'<div class="empty compact">Nenhum.</div>'}</div>`;
  const melhores=ads.filter(x=>x.resultados>0&&x.gasto>0).sort((x,y)=>cr(x)-cr(y)).slice(0,5);
  const semRes=ads.filter(x=>x.resultados===0&&x.gasto>0).sort((x,y)=>y.gasto-x.gasto).slice(0,5);
  const probl=ads.filter(x=>/DISAPPROVED|WITH_ISSUES/i.test(x.status||''));
  const box=document.createElement('section');box.className='card';box.id='trafegoExtra';
  box.innerHTML=`<div class="card-title"><div><small>META ADS · SOMENTE LEITURA</small><h3>Visão do mês</h3></div><div>${saude}${gerente?' <a class="btn" id="tgRelatorio" href="/relatorio-trafego.html" target="_blank" rel="noopener">Relatório semanal (PDF)</a>':''}</div></div>
  <div class="kpis tg-kpis">${kp('Gasto no mês',esc(brl(m.gasto)),delta(m.gasto,a.gasto,true))}${kp('Resultados (leads + conversas)',n0(m.resultados),delta(m.resultados,a.resultados))}${kp('Custo por resultado',cpr(m)===null?'—':esc(brl(cpr(m))),delta(cpr(m)||0,cpr(a)||0,true))}${kp('CTR',ctr(m)===null?'—':ctr(m).toFixed(2).replace('.',',')+'%',delta(ctr(m)||0,ctr(a)||0))}${kp('Alcance',n0(m.alcance),delta(m.alcance,a.alcance))}</div>
  <p class="kpi-note">O mês atual está em andamento; o anterior está completo. Resultado = leads e conversas iniciadas informados pela Meta.</p>
  <div class="tg-secao"><h4>Orçamento do mês</h4>${pacing}${gerente?`<div class="st-linkbox"><div id="sfLinkBox"><input id="tgOrc" type="number" min="0" step="50" placeholder="Orçamento do mês (R$)" value="${d.orcamentoMensal||''}"><button class="softbtn" id="tgOrcSalva">Salvar orçamento</button></div><small class="kpi-note">É só um número de acompanhamento: o sistema não altera nada na Meta. Zero remove.</small></div>`:''}</div>
  <div class="tg-secao"><h4>Gasto por dia (30 dias)</h4>${grafico}</div>
  <div class="tg-secao"><h4>Anúncios do mês</h4>${ads.length?`<div class="tg-listas">${tabela('Melhor custo por resultado',melhores)}${tabela('Gasto sem resultado',semRes)}</div>${probl.length?`<h4>Com problema de aprovação</h4>${probl.map(x=>`<div class="tb-item"><span class="badge bad">${esc(x.status)}</span> <span><b>${esc(x.anuncio)}</b>${x.campanha?' · '+esc(x.campanha):''}<br><small>${esc(x.problema||'Veja o motivo no Gerenciador de Anúncios.')}</small></span></div>`).join('')}`:''}<p class="kpi-note">Ranking por custo por resultado (sem ROAS: o Colégio não vende online). Só entram anúncios com gasto no mês.</p>`:'<div class="empty compact">Sem leitura de anúncios ainda.</div>'}</div>`;
  const ref=$('#metaAdsBox');if(ref)ref.before(box);else host.appendChild(box);
  const bt=$('#tgOrcSalva');if(bt)bt.onclick=async()=>{try{await api('/integrations/ads/orcamento',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({valor:Number($('#tgOrc').value||0)})});toast('Orçamento salvo');go('trafego')}catch(e){toast(e.message,'warn')}};
}
{const o2=renderTrafficWorkspace;renderTrafficWorkspace=async function(){await o2.apply(this,arguments);await adsCarregaModo();await painelTrafegoExtra();await painelGestaoAnuncios();await painelExtrasAnuncios()}}


// ---------- Gestor de anúncios (Fase 1): impulsionar publicação, tetos, pausar/retomar ----------
const GA_EST={ATIVO:['Ativo','ok'],PAUSADO:['Pausado',''],ERRO:['Erro','bad'],CRIANDO:['Criando','warn']};
const gaPost=(u,b)=>api(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b||{})});
const gaBrl=(v,m)=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:m||'BRL'});
async function painelGestaoAnuncios(){
  if(internalSession?.role!=='manager'||!adsCompleto)return;
  const host=$('#content');if(!host||state.page!=='trafego')return;
  let d;try{d=await api('/ads/gestao')}catch{return}
  if(state.page!=='trafego')return;
  const c=d.config,pb=c.publico,cid=pb.cidade;
  const box=document.createElement('section');box.className='card';box.id='gestorAds';
  box.innerHTML=`<div class="card-title"><div><small>GESTOR DE ANÚNCIOS</small><h3>Campanhas lançadas pelo sistema</h3></div><div><span class="badge ${c.ativa?'ok':''}">${c.ativa?'Ligado':'Desligado'}</span>${c.ativa&&!d.permissao?' <span class="badge bad">Falta a permissão ads_management</span>':''}</div></div>
  <p class="kpi-note">Aqui o sistema <b>cria e gere anúncios de verdade</b>: eles vão ao ar <b>ativos</b> assim que a Meta aprovar. Só a Gerência lança. Cada lançamento mostra o total que você está comprometendo e respeita os tetos abaixo. Para impulsionar uma publicação, use o botão <b>Impulsionar</b> em Instagram → Desempenho.</p>
  <details ${c.ativa?'':'open'}><summary><b>Configuração e tetos</b></summary><div class="ga-form">
   <label class="check-row"><input type="checkbox" id="gaAtiva" ${c.ativa?'checked':''}> Habilitar a gestão de anúncios (depois de salvar, reconecte a Meta para aceitar a permissão nova)</label>
   <div class="st-row"><label>Teto por campanha (R$/dia)<input id="gaTetoDia" type="number" min="${d.minimoDia}" step="5" value="${c.tetoDia}"></label><label>Teto mensal (R$)<input id="gaTetoMes" type="number" min="${d.minimoDia}" step="100" value="${c.tetoMes}"></label></div>
   <div class="st-row"><label>Duração máxima (dias)<input id="gaDiasMax" type="number" min="1" max="60" value="${c.diasMax}"></label><label>Cidade do público<input id="gaCidade" placeholder="${cid?esc(cid.nome+', '+cid.regiao):'Ex.: João Pessoa'}"></label></div>
   <div class="st-row"><label>WhatsApp do Colégio (DDI+DDD)<input id="gaWhats" type="tel" value="${esc(d.config.whatsapp||'')}" placeholder="+5583999999999"></label></div>
   <div class="st-row"><label>Raio (km)<input id="gaRaio" type="number" min="1" max="80" value="${pb.raioKm}"></label><div class="st-row"><label>Idade mín.<input id="gaIdMin" type="number" min="18" max="65" value="${pb.idadeMin}"></label><label>Idade máx.<input id="gaIdMax" type="number" min="18" max="65" value="${pb.idadeMax}"></label></div></div>
   <p class="kpi-note">Público padrão: ${cid?esc(cid.nome+' ('+cid.regiao+')'):'<b>cidade ainda não definida</b>'}, raio de ${pb.raioKm} km, ${pb.idadeMin} a ${pb.idadeMax} anos, só no Instagram. Mínimo por campanha: ${gaBrl(d.minimoDia)}/dia.</p>
   <div class="st-acoes"><button class="btn" id="gaSalva">Salvar configuração</button>${c.ativa&&!d.permissao?'<a class="softbtn" href="/api/integrations/meta/connect">Reconectar a Meta</a>':''}</div></div></details>
  <div class="tg-secao"><div class="card-title"><h4>Lançamentos</h4>${d.lancamentos.some(l=>l.estado==='ATIVO')?'<button class="softbtn ga-perigo" id="gaPausaTudo">Pausar tudo</button>':''}</div>
  ${d.lancamentos.length?`<div class="tablewrap"><table class="datatable"><thead><tr><th>Quando</th><th>Anúncio</th><th>Objetivo</th><th>R$/dia × dias</th><th>Término</th><th>Estado</th><th></th></tr></thead><tbody>${d.lancamentos.map(l=>{const [r,cl]=GA_EST[l.estado]||[l.estado,''];return `<tr><td>${esc(fmtDateTime(l.quando))}<br><small>${esc(l.quem)}</small></td><td>${esc(l.titulo)}${l.erro?`<br><small class="tg-ruim">${esc(l.erro)}</small>`:''}</td><td>${l.objetivo==='ALCANCE'?'Alcance':l.objetivo==='WHATSAPP'?'WhatsApp':'Conversas'}</td><td>${esc(gaBrl(l.orcamento_dia,l.moeda))} × ${l.dias}<br><small>até ${esc(gaBrl(l.compromisso,l.moeda))}</small></td><td>${esc(fmtDate(String(l.fim).slice(0,10)))}</td><td><span class="badge ${cl}">${esc(r)}</span></td><td>${l.estado==='ATIVO'?`<button class="softbtn" data-ga="pausar" data-id="${l.id}">Pausar</button>`:l.estado==='PAUSADO'?`<button class="softbtn" data-ga="retomar" data-id="${l.id}">Retomar</button>`:''}</td></tr>`}).join('')}</tbody></table></div>`:'<div class="empty compact">Nenhum lançamento ainda.</div>'}</div>`;
  const ref=$('#metaAdsBox');if(ref)ref.before(box);else host.appendChild(box);
  $('#gaSalva',box).onclick=async()=>{const b={ativa:$('#gaAtiva',box).checked,whatsapp:$('#gaWhats',box).value.trim()};[['tetoDia','gaTetoDia'],['tetoMes','gaTetoMes'],['diasMax','gaDiasMax'],['raioKm','gaRaio'],['idadeMin','gaIdMin'],['idadeMax','gaIdMax']].forEach(([k,id])=>{const v=$('#'+id,box).value.trim();if(v!=='')b[k]=Number(v)}); // campo vazio = mantém o valor atual
  const cidade=$('#gaCidade',box).value.trim();if(cidade)b.cidade=cidade;try{await gaPost('/ads/gestao/config',b);toast('Configuração salva');go('trafego')}catch(e){toast(e.message,'warn')}};
  box.querySelectorAll('[data-ga]').forEach(bt=>bt.onclick=async()=>{const acao=bt.dataset.ga;if(!confirm(acao==='pausar'?'Pausar este anúncio na Meta?':'Retomar este anúncio na Meta? Ele volta a gastar.'))return;try{await gaPost('/ads/'+acao,{id:Number(bt.dataset.id)});toast(acao==='pausar'?'Anúncio pausado':'Anúncio retomado');go('trafego')}catch(e){toast(e.message,'warn')}});
  const pt=$('#gaPausaTudo',box);if(pt)pt.onclick=async()=>{if(!confirm('Pausar TODOS os anúncios que o sistema lançou? Eles param de gastar na hora.'))return;try{const r=await gaPost('/ads/pausar-tudo');toast(`${r.pausados} anúncio(s) pausado(s)${r.falhas.length?' · falhas: '+r.falhas.join('; '):''}`);go('trafego')}catch(e){toast(e.message,'bad')}};
}

function gestorImpulsionar(post){
  if(!post)return;
  const chave=Array.from(crypto.getRandomValues(new Uint8Array(12)),b=>b.toString(16).padStart(2,'0')).join('');
  const o=adminOverlay(`<h3>Impulsionar publicação</h3><p class="kpi-note">${esc(String(post.legenda||'(sem legenda)').slice(0,140))}</p>
   <div class="st-form"><div class="st-row"><label>Orçamento por dia (R$)<input id="giOrc" type="number" step="5" value="20"></label><label>Duração (dias)<input id="giDias" type="number" min="1" step="1" value="7"></label></div>
   <label>Objetivo<select id="giObj"><option value="CONVERSAS">Conversas no Instagram Direct</option><option value="WHATSAPP">Conversas no WhatsApp</option><option value="ALCANCE">Alcance (mostrar para mais pessoas)</option></select></label>
   <div id="giPrev" class="gi-prev">Calculando…</div>
   <label class="check-row"><input type="checkbox" id="giOk"> <span id="giTxt">Entendo que o anúncio vai ao ar agora, ativo, e pode gastar até o total acima.</span></label>
   <div class="st-acoes"><button class="btn soft" type="button" data-close>Cancelar</button><button class="btn accent" type="button" id="giLanca" disabled>Lançar agora</button></div></div>`);
  const g=id=>o.el.querySelector('#'+id);let prev=null,tm=null;
  const pedido=()=>({chave,midia:post.id,orcamentoDia:Number(g('giOrc').value),dias:Number(g('giDias').value),objetivo:g('giObj').value});
  const atualiza=async()=>{
    try{prev=await gaPost('/ads/previa',pedido())}catch(e){g('giPrev').textContent=e.message;return}
    const pb=prev.resumo.publico,cid=pb.cidade;
    g('giPrev').innerHTML=`<ul class="gi-lista"><li><b>Objetivo:</b> ${esc(prev.resumo.objetivo)}</li><li><b>Público:</b> ${cid?esc(cid.nome):'<span class="tg-ruim">cidade não definida</span>'}, raio de ${pb.raioKm} km, ${pb.idadeMin} a ${pb.idadeMax} anos · só Instagram</li><li><b>Total comprometido:</b> até ${esc(gaBrl(prev.compromisso,prev.moeda))} (${esc(gaBrl(prev.resumo.orcamentoDia,prev.moeda))}/dia × ${prev.resumo.dias} dia(s)), termina em ${esc(fmtDate(String(prev.fim).slice(0,10)))}</li><li><b>Mês:</b> já gasto ${esc(gaBrl(prev.gastoMes,prev.moeda))} + em andamento ${esc(gaBrl(prev.pendente,prev.moeda))} · teto mensal ${esc(gaBrl(prev.tetoMes,prev.moeda))}</li></ul>${prev.erros.map(e=>`<p class="tg-ruim">✖ ${esc(e)}</p>`).join('')}${prev.avisos.map(e=>`<p class="kpi-note">⚠ ${esc(e)}</p>`).join('')}`;
    g('giTxt').textContent=`Entendo que o anúncio vai ao ar agora, ativo, e pode gastar até ${gaBrl(prev.compromisso,prev.moeda)}.`;
    g('giLanca').disabled=!(prev.ok&&g('giOk').checked);
  };
  ['giOrc','giDias','giObj'].forEach(i=>{g(i).oninput=g(i).onchange=()=>{g('giOk').checked=false;g('giLanca').disabled=true;clearTimeout(tm);tm=setTimeout(atualiza,300)}});
  g('giOk').onchange=()=>{g('giLanca').disabled=!(prev&&prev.ok&&g('giOk').checked)};
  g('giLanca').onclick=async()=>{g('giLanca').disabled=true;g('giLanca').textContent='Lançando…';try{const r=await gaPost('/ads/impulsionar',{...pedido(),confirmou:true});o.close();toast(r.lancamento.repetido?'Esse lançamento já existia':'Anúncio lançado. A Meta vai analisar e ele começa a rodar.');}catch(e){toast(e.message,'bad');g('giLanca').textContent='Lançar agora';g('giLanca').disabled=false}};
  atualiza();
}

// ---------- Ranking: métricas completas por mês e por ano, seguidores e posts ----------
let rkFiltro={visao:'mes',periodo:'',ordem:'interacoes',postsPer:''};
const RK_MESES=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const rkEmAndamento=p=>{const h=new Date(),a=String(h.getFullYear()),m=a+'-'+String(h.getMonth()+1).padStart(2,'0');return String(p)===m||String(p)===a};
const rkRotulo=p=>String(p).length===4?String(p):RK_MESES[+String(p).slice(5,7)-1]+' de '+String(p).slice(0,4);
const RK_COLS=[['seguidores','Seguidores'],['variacao','Variação'],['alcance','Alcance'],['impressoes','Visualizações'],['visitasPerfil','Visitas ao perfil'],['interacoes','Interações'],['curtidas','Curtidas'],['comentarios','Comentários'],['compartilhamentos','Compartilh.'],['salvamentos','Salvamentos'],['posts','Posts'],['reels','Reels']];
const RK_ORDEM={interacoes:['Interações','interacoes'],alcance:['Alcance','alcance'],curtidas:['Curtidas','curtidas'],comentarios:['Comentários','comentarios'],salvos:['Salvamentos','salvos'],compartilhamentos:['Compartilhamentos','compartilhamentos'],engajamento:['Engajamento','engajamento']};
const rkCorta=(t,max=110)=>{const x=String(t||'').replace(/\s+/g,' ').trim();if(!x)return 'Sem legenda';if(x.length<=max)return x;const c=x.slice(0,max),i=c.lastIndexOf(' ');return (i>max*0.6?c.slice(0,i):c).replace(/[\s,;:.!?-]+$/,'')+'…'};
async function renderIgRanking(){
  await igCarregaContas();
  const [d,sg,met0]=await Promise.all([api('/instagram/posts'+igQ()),api('/instagram/seguidores'+igQ()),api('/data?module=instagram')]);
  const met={rows:(met0.rows||met0||[]).filter(r=>igContas.length<2||String(r.idExterno||igPrincipal)===igConta)};
  if(state.page!=='igranking')return;
  const posts=d.rows||[],n=x=>Number(x||0);
  const segMes=Object.fromEntries((sg.mensal||[]).map(x=>[x.periodo,x]));
  // métricas mensais (linhas do módulo Instagram vindas da API da Meta)
  const mensal={};
  for(const r of (met.rows||met||[]).filter(r=>r.origem==='INSTAGRAM_API'&&/^\d{4}-\d{2}$/.test(r.periodo||''))){
    const m=r.periodo;mensal[m]={periodo:m,seguidores:segMes[m]?segMes[m].seguidores:(r.seguidores===''?null:n(r.seguidores)),variacao:segMes[m]?segMes[m].variacao:null,alcance:n(r.alcance),impressoes:n(r.impressoes),visitasPerfil:n(r.visitasPerfil),interacoes:n(r.interacoes),curtidas:n(r.curtidas),comentarios:n(r.comentarios),compartilhamentos:n(r.compartilhamentos),salvamentos:n(r.salvamentos)}}
  // posts e reels contados a partir das publicações lidas (mais completo que o mês sincronizado)
  const contaPosts=(rs)=>({posts:rs.filter(x=>x.tipo!=='REELS').length,reels:rs.filter(x=>x.tipo==='REELS').length});
  for(const m of new Set(posts.map(x=>String(x.quando).slice(0,7)))){mensal[m]=mensal[m]||{periodo:m,seguidores:segMes[m]?segMes[m].seguidores:null,variacao:segMes[m]?segMes[m].variacao:null};Object.assign(mensal[m],contaPosts(posts.filter(x=>String(x.quando).slice(0,7)===m)))}
  const meses=Object.keys(mensal).sort();
  const anual={};
  for(const m of meses){const a=m.slice(0,4),x=mensal[m];const y=anual[a]=anual[a]||{periodo:a,seguidores:null,alcance:0,impressoes:0,visitasPerfil:0,interacoes:0,curtidas:0,comentarios:0,compartilhamentos:0,salvamentos:0,posts:0,reels:0,meses:0};
    for(const k of ['alcance','impressoes','visitasPerfil','interacoes','curtidas','comentarios','compartilhamentos','salvamentos','posts','reels'])y[k]+=n(x[k]);y.meses++;if(x.seguidores!==null&&x.seguidores!==undefined)y.seguidores=x.seguidores}
  const anos=Object.keys(anual).sort();anos.forEach((a,i)=>{const prev=anual[anos[i-1]];const sa=(sg.anual||[]).find(z=>z.periodo===a);if(sa){anual[a].seguidores=sa.seguidores;anual[a].variacao=sa.variacao}else anual[a].variacao=prev&&prev.seguidores!==null&&anual[a].seguidores!==null?anual[a].seguidores-prev.seguidores:null});
  const serie=rkFiltro.visao==='ano'?anos.map(a=>anual[a]):meses.map(m=>mensal[m]);
  const chaves=serie.map(x=>x.periodo).reverse();
  if(!chaves.includes(rkFiltro.periodo))rkFiltro.periodo=chaves[0]||'';
  const anosP=[...new Set(posts.map(x=>String(x.quando).slice(0,4)))].sort().reverse(),mesesP=[...new Set(posts.map(x=>String(x.quando).slice(0,7)))].sort().reverse();
  const opcoesP=[...anosP.map(a=>[a,'Ano '+a]),...mesesP.map(m=>[m,rkRotulo(m)])];
  if(!opcoesP.some(o=>o[0]===rkFiltro.postsPer))rkFiltro.postsPer=mesesP[0]||'';
  const cel=(x,k,i)=>{const v=x[k];if(v===null||v===undefined)return '—';if(k==='variacao')return `<span class="${v>=0?'tg-bom':'tg-ruim'}">${v>0?'+':''}${igNum(v)}</span>`;const pv=i>0?serie[i-1][k]:null;const dl=pv&&k!=='posts'&&k!=='reels'&&!rkEmAndamento(x.periodo)?Math.round((v-pv)/pv*1000)/10:null;return igNum(v)+(dl===null?'':`<br><small class="${dl>=0?'tg-bom':'tg-ruim'}">${dl>=0?'▲':'▼'} ${Math.abs(dl).toLocaleString('pt-BR')}%</small>`)};
  const tab=`<div class="tablewrap"><table class="datatable"><thead><tr><th>${rkFiltro.visao==='ano'?'Ano':'Mês'}</th>${RK_COLS.map(c=>`<th>${c[1]}</th>`).join('')}</tr></thead><tbody>${serie.map((x,i)=>`<tr><td><b>${esc(rkRotulo(x.periodo))}</b>${rkEmAndamento(x.periodo)?'<br><small>em andamento (parcial)</small>':''}</td>${RK_COLS.map(c=>`<td>${cel(x,c[0],i)}</td>`).join('')}</tr>`).reverse().join('')||'<tr><td colspan="13">Ainda sem dados. Use "Carregar histórico".</td></tr>'}</tbody></table></div>`;
  const [,chave]=RK_ORDEM[rkFiltro.ordem];
  const doPeriodo=posts.filter(r=>String(r.quando).startsWith(rkFiltro.postsPer)).sort((a,b)=>(b[chave]??-1)-(a[chave]??-1));
  const mini=r=>{const u=urlSegura(r.miniatura);return u?`<img alt="" loading="lazy" referrerpolicy="no-referrer" src="${attr(u)}">`:`<span>${esc(IG_TIPO[r.tipo]||r.tipo||'')}</span>`};
  const nv=v=>v===null||v===undefined?'—':igNum(v);
  const linha=(r,i)=>{const l=urlSegura(r.link);const tx=esc(rkCorta(r.legenda));return `<tr><td><b>${i+1}º</b></td><td class="rk-thumb">${mini(r)}</td><td>${l?`<a class="rk-link" href="${attr(l)}" target="_blank" rel="noopener">${tx}</a>`:tx}<br><small>${esc(IG_TIPO[r.tipo]||r.tipo||'')} · ${esc(fmtDate(String(r.quando).slice(0,10)))}</small></td><td>${nv(r.alcance)}</td><td>${nv(r.curtidas)}</td><td>${nv(r.comentarios)}</td><td>${nv(r.salvos)}</td><td>${nv(r.compartilhamentos)}</td><td><b>${nv(r.interacoes)}</b></td><td>${r.engajamento===null?'—':r.engajamento+'%'}</td></tr>`};
  $('#content').innerHTML=`<div class="dashboard-head"><div><small>INSTAGRAM · RANKING</small><h1>Métricas por mês e por ano${igContas.length>1?` <small>· @${esc((igContas.find(c=>c.ig===igConta)||{}).usuario||'')}</small>`:''}</h1><p>Alcance, interações, seguidores e posts de cada período, com o ranking das publicações. ${sg.atual!==null?`Seguidores hoje: <b>${igNum(sg.atual)}</b>.`:''}</p></div><div class="head-actions"><button class="softbtn" id="rkHist">Carregar histórico (12 meses)</button>${internalSession?.role==='manager'?` <a class="btn" href="/relatorio-instagram.html${rkFiltro.visao==='mes'&&/^\d{4}-\d{2}$/.test(rkFiltro.periodo)?'?mes='+rkFiltro.periodo:''}" target="_blank" rel="noopener">Relatório mensal (PDF)</a> <button class="softbtn" id="rkSegManual">Informar seguidores de um mês</button>`:''}</div></div>
  <div class="card"><div class="st-toolbar"><div class="st-filtros"><select data-rk="visao"><option value="mes" ${rkFiltro.visao==='mes'?'selected':''}>Por mês</option><option value="ano" ${rkFiltro.visao==='ano'?'selected':''}>Por ano</option></select></div></div>
  ${tab}
  <p class="kpi-note">Alcance, visualizações e visitas somam os meses carregados (no ano, pessoas alcançadas em meses diferentes podem se repetir). Seguidores: a Meta não informa o passado; o sistema guarda uma foto por sincronização${sg.primeiroRegistro?` desde ${esc(fmtDate(String(sg.primeiroRegistro).slice(0,10)))}`:''}, então meses anteriores ficam "—" até a primeira foto. "Carregar histórico" busca até 12 meses de métricas.</p></div>
  ${!posts.length?'<div class="card empty"><strong>Nenhuma publicação lida ainda</strong><span>Conecte o Instagram e atualize.</span></div>':`<div class="card"><h3>Posts por mês e por ano</h3><div class="st-toolbar"><div class="st-filtros"><select data-rk="postsPer">${opcoesP.map(([k,l])=>`<option value="${k}" ${k===rkFiltro.postsPer?'selected':''}>${esc(l)}</option>`).join('')}</select><select data-rk="ordem">${Object.entries(RK_ORDEM).map(([k,v])=>`<option value="${k}" ${k===rkFiltro.ordem?'selected':''}>Ordenar por ${esc(v[0])}</option>`).join('')}</select></div></div>
  <div class="tablewrap"><table class="datatable"><thead><tr><th></th><th></th><th>Publicação (${doPeriodo.length}${doPeriodo.length>100?', top 100':''})</th><th>Alcance</th><th>Curtidas</th><th>Comentários</th><th>Salvamentos</th><th>Compartilh.</th><th>Interações</th><th>Engajamento</th></tr></thead><tbody>${doPeriodo.slice(0,100).map(linha).join('')||'<tr><td colspan="10">Sem publicações neste período.</td></tr>'}</tbody></table></div></div>`}`;
  igLigaSeletor(renderIgRanking);
  $$('[data-rk]').forEach(s=>s.onchange=()=>{rkFiltro[s.dataset.rk]=s.value;if(s.dataset.rk==='visao')rkFiltro.periodo='';renderIgRanking()});
  const sm=$('#rkSegManual');if(sm)sm.onclick=()=>{const ov=adminOverlay(`<h3>Seguidores de um mês passado</h3><p class="kpi-note">Use o número que aparece no seu Instagram no fim daquele mês (ou o que você anotou). Só vale para meses que o sistema ainda não registrou sozinho.</p><div class="st-form"><div class="st-row"><label>Mês<input id="rkSm" type="month"></label><label>Seguidores<input id="rkSn" type="number" min="0"></label></div><div class="st-acoes"><button class="btn soft" data-close type="button">Cancelar</button><button class="btn" id="rkSs" type="button">Salvar</button></div></div>`);ov.el.querySelector('#rkSs').onclick=async()=>{try{await api('/instagram/seguidores/manual',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({conta:igConta,mes:ov.el.querySelector('#rkSm').value,seguidores:Number(ov.el.querySelector('#rkSn').value)})});ov.close();toast('Salvo');await renderIgRanking()}catch(e){toast(e.message,'bad')}}};
  const hb=$('#rkHist');if(hb)hb.onclick=async()=>{hb.disabled=true;hb.textContent='Carregando… pode levar 1 minuto';try{await api('/integrations/instagram/sync',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({meses:12})});toast('Histórico carregado');await renderIgRanking()}catch(e){toast(e.message,'bad');hb.disabled=false;hb.textContent='Carregar histórico (12 meses)'}};
}


// ---------- Tráfego: regras automáticas, relatório semanal por e-mail, custo por matrícula ----------
async function painelExtrasAnuncios(){
  if(internalSession?.role!=='manager')return;
  const host=$('#content');if(!host||state.page!=='trafego')return;
  let d;try{d=await api('/ads/extras')}catch{return}
  if(state.page!=='trafego'||$('#extrasAds'))return;
  const r=d.regras,mt=d.matriculas||[];
  const box=document.createElement('section');box.className='card';box.id='extrasAds';
  box.innerHTML=`<div class="card-title"><div><small>RECURSOS OPCIONAIS</small><h3>${d.gestao?'Regras, relatório automático e custo por matrícula':'Relatório automático e custo por matrícula'}</h3></div></div>
  ${d.gestao?`<details open><summary><b>Regras automáticas</b> <span class="badge ${r.ativa?'ok':''}">${r.ativa?'Ligadas':'Desligadas'}</span></summary>
   <p class="kpi-note">O sistema olha os anúncios ativos a cada hora e avisa (notificação e e-mail) ou pausa o que cumprir a regra. Só mexe em anúncios ativos e registra tudo no histórico.</p>
   <label class="check-row"><input type="checkbox" id="rgAtiva" ${r.ativa?'checked':''}> Ligar as regras automáticas</label>
   <div class="st-row"><label>Quando um anúncio gastar (R$) ou mais…<input id="rgGasto" type="number" min="0" step="5" value="${r.gastoSemResultado}"></label><label>…em quantos dias<input id="rgDias" type="number" min="1" max="30" value="${r.dias}"></label></div>
   <p class="kpi-note">…sem nenhum resultado (conversa/lead). Use 0 para desligar esta regra.</p>
   <label>Avisar também quando o custo por resultado passar de (R$; 0 = desligado)<input id="rgCusto" type="number" min="0" step="1" value="${r.custoMax}"></label>
   <label>O que fazer<select id="rgAcao"><option value="AVISAR" ${r.acao==='AVISAR'?'selected':''}>Só avisar (recomendado)</option><option value="PAUSAR" ${r.acao==='PAUSAR'?'selected':''}>Pausar o anúncio e avisar</option></select></label>
   <div class="st-acoes"><button class="softbtn" id="rgSim" type="button">Ver o que a regra pegaria agora</button><button class="btn" id="rgSalva" type="button">Salvar regras</button></div><div id="rgOut"></div>
  </details>`:''}
  <details><summary><b>Relatório semanal por e-mail</b> <span class="badge ${d.relatorioSemanal?'ok':''}">${d.relatorioSemanal?'Ligado':'Desligado'}</span></summary>
   <p class="kpi-note">Toda segunda-feira o sistema envia ao e-mail de avisos um resumo da semana anterior (investimento, alcance, conversas e custo por campanha) com o link do relatório em PDF. Precisa do e-mail de avisos configurado e do cron de sincronização.</p>
   <div class="st-acoes"><label class="check-row"><input type="checkbox" id="rsAtivo" ${d.relatorioSemanal?'checked':''}> Enviar toda segunda-feira</label><button class="softbtn" id="rsAgora" type="button">Enviar um agora (teste)</button></div>
  </details>
  <details><summary><b>Custo por matrícula</b></summary>
   <p class="kpi-note">Informe quantas matrículas vieram em cada mês; o sistema divide pelo investimento em anúncios.</p>
   <div class="tablewrap"><table class="datatable"><thead><tr><th>Mês</th><th>Investimento</th><th>Matrículas</th><th>Custo por matrícula</th></tr></thead><tbody>${[...mt].reverse().map(m=>`<tr><td>${esc(m.mes.slice(5)+'/'+m.mes.slice(0,4))}</td><td>${esc(gaBrl(m.gasto))}</td><td><input type="number" min="0" class="mt-in" data-mes="${attr(m.mes)}" value="${m.matriculas===null?'':m.matriculas}" style="width:90px"></td><td>${m.custo===null?'—':esc(gaBrl(m.custo))}</td></tr>`).join('')||'<tr><td colspan="4">Sem dados de investimento ainda.</td></tr>'}</tbody></table></div>
  </details>`;
  const ref=$('#metaAdsBox');if(ref)ref.before(box);else host.appendChild(box);
  const regra=()=>({ativa:$('#rgAtiva',box).checked,gastoSemResultado:Number($('#rgGasto',box).value),dias:Number($('#rgDias',box).value),custoMax:Number($('#rgCusto',box).value),acao:$('#rgAcao',box).value});
  if($('#rgSalva',box)){$('#rgSalva',box).onclick=async()=>{const b=regra();if(b.ativa&&b.acao==='PAUSAR'&&!confirm('Com "Pausar", o sistema pausa sozinho os anúncios que cumprirem a regra. Continuar?'))return;try{await gaPost('/ads/regras',b);toast('Regras salvas');go('trafego')}catch(e){toast(e.message,'warn')}};
  $('#rgSim',box).onclick=async()=>{const o=$('#rgOut',box);o.textContent='Lendo a conta…';try{await gaPost('/ads/regras',regra());const x=await gaPost('/ads/regras/simular');o.innerHTML=x.achados.length?`<ul class="gi-lista">${x.achados.map(a=>`<li><b>${esc(a.anuncio)}</b> (${esc(a.campanha)}): ${esc(a.motivo)}</li>`).join('')}</ul>`:'<p class="kpi-note">Nenhum anúncio ativo cumpre a regra agora.</p>'}catch(e){o.textContent='';toast(e.message,'warn')}}}
  $('#rsAtivo',box).onchange=async e=>{try{await gaPost('/ads/relatorio-semanal',{ativo:e.target.checked});toast(e.target.checked?'Relatório semanal ligado':'Relatório semanal desligado')}catch(x){toast(x.message,'warn')}};
  $('#rsAgora',box).onclick=async()=>{try{await gaPost('/ads/relatorio-semanal',{enviarAgora:true});toast('E-mail enviado (se o e-mail de avisos estiver configurado)')}catch(e){toast(e.message,'warn')}};
  box.querySelectorAll('.mt-in').forEach(i=>i.onchange=async()=>{if(i.value==='')return;try{await gaPost('/ads/matriculas',{mes:i.dataset.mes,matriculas:Number(i.value)});toast('Salvo');go('trafego')}catch(e){toast(e.message,'warn')}});
}


// ---------- Tráfego simples: sem registros manuais, mostra só as métricas lidas da Meta ----------
function trafegoSimples(){
  if(state.page!=='trafego')return;
  const ck=document.querySelector('.traffic-cockpit');if(!ck||(state.rows||[]).length)return; // se houver registros manuais antigos, mantém a visão deles
  ck.querySelectorAll('.traffic-hero,.empty-rich,.traffic-group,.kpi-note').forEach(e=>e.style.display='none'); // sem registros manuais: esconde o bloco zerado
  if(!document.getElementById('trHead'))ck.insertAdjacentHTML('beforebegin','<div id="trHead" class="dashboard-head"><div><small>TRÁFEGO PAGO · META ADS</small><h1>Métricas dos anúncios</h1><p>Somente leitura: investimento, alcance, conversas e custos lidos da Meta. Nada é criado nem alterado nas campanhas.</p></div></div>');
}
{const o3=renderTrafficWorkspace;renderTrafficWorkspace=async function(){await o3.apply(this,arguments);if(typeof trafegoNovo==='function'&&await trafegoNovo())return;trafegoSimples()}}
