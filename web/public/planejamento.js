/* Planejamento: o que o marketing pretende realizar (ações). Usa o motor de calendário (Mês, Semana e Lista) e os registros do módulo `projetos`.
   As solicitações continuam sendo gerenciadas só em Solicitações; aqui a ação apenas acompanha as que estão vinculadas.
   O vínculo com Conteúdos, Calendário Escolar, Datas Comemorativas e Calendário de Marketing é opcional e nunca copia o registro. */
const PL_CATS=[
 {k:'CAMPANHAS',rotulo:'Campanhas',glifo:'◆',classe:'t-PL_CAMPANHAS'},{k:'CONTEUDOS',rotulo:'Conteúdos',glifo:'✎',classe:'t-PL_CONTEUDOS'},
 {k:'EVENTOS',rotulo:'Eventos',glifo:'★',classe:'t-PL_EVENTOS'},{k:'PROJETOS',rotulo:'Projetos',glifo:'▣',classe:'t-PL_PROJETOS'},{k:'INSTITUCIONAL',rotulo:'Ações institucionais',glifo:'⚑',classe:'t-PL_INSTITUCIONAL'},
];
const PL_SIT=[['PLANEJADO','Planejado'],['EXECUCAO','Em execução'],['FINALIZADO','Finalizado']];
const PL_SUGESTOES=['Criar arte da campanha','Produzir vídeo institucional','Preparar conteúdo para Instagram','Realizar cobertura fotográfica'];
const PL_ETAPA={PENDENTE:'Pendente',EM_ANDAMENTO:'Em andamento',EM_APROVACAO:'Em aprovação',CONCLUIDO:'Concluído'};
let PL={acoes:[],opc:{categorias:[],segmentos:[],responsaveis:[],eventosEscolares:[]},eu:{nome:'',role:'',codigo:''},hoje:''};
const plPost=(u,b)=>api(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});
const plBr=iso=>String(iso||'').split('-').reverse().join('/');
const plSomaDias=(iso,n)=>{const d=new Date(iso+'T12:00:00');d.setDate(d.getDate()+n);return isoDate(d)};
const plCat=k=>PL_CATS.find(c=>c.k===k)||PL_CATS[3];
const plSitRot=k=>(PL_SIT.find(s=>s[0]===k)||[,k])[1];

async function plCarregar(){
 const d=await api('/planejamento/painel');
 PL=d;
 const itens=d.acoes.map(a=>({uid:'pl:'+a.id,id:a.id,modulo:'planejamento',titulo:a.titulo,data:a.dataInicio||a.dataFim||'',fim:a.dataFim&&a.dataFim>a.dataInicio?a.dataFim:'',hora:'',tipo:a.categoria,responsavel:a.responsavel,editavel:a.editavel&&!!a.dataInicio,feito:a.situacao==='FINALIZADO',atrasada:a.atrasada,raw:a}));
 return {itens,opcoes:{responsaveis:d.opcoes.responsaveis},eu:d.eu,podeEditar:true};
}
async function plAbrirPorId(id,aoFechar){
 try{await plCarregar()}catch(e){return toast(e.message,'warn')}
 const a=PL.acoes.find(x=>x.id===id);if(!a)return toast('Ação não encontrada','warn');
 plModal(a,'',aoFechar);
}

/* ---------- janela da ação: dados, situação, acompanhamento e vínculos ---------- */
function plModal(a,dataIni='',aoFechar,evento=''){
 const novo=!a,ed=novo||a.editavel,gerente=PL.eu.role==='manager';
 const respOpc=gerente?PL.opc.responsaveis:[PL.eu.nome];
 const extra=novo?'':`
  <section><h4>Situação</h4><div class="dc-seg" role="group" aria-label="Situação">${PL_SIT.map(([k,l])=>`<button type="button" data-sit="${k}" class="${a.situacao===k?'on':''}" aria-pressed="${a.situacao===k}" ${ed?'':'disabled'}>${l}</button>`).join('')}</div>
   ${a.arquivada?'<p class="kpi-note">Ação arquivada: fica fora das listas, sem perder nada.</p>':''}</section>
  <section><h4>Acompanhamento</h4>${a.andamento.total?`<p class="pl-prog"><b>${a.andamento.concluidas} de ${a.andamento.total}</b> solicitações concluídas · ${a.andamento.emAndamento} em andamento · ${a.andamento.pendentes} pendentes${a.andamento.atrasadas?` · <span class="pl-atraso">${a.andamento.atrasadas} atrasada(s)</span>`:''}</p>`:'<p class="kpi-note">Sem solicitações vinculadas. O andamento vem delas: nenhuma porcentagem é estimada.</p>'}</section>
  <section><h4>Solicitações vinculadas</h4><div class="pl-vinc">${a.solicitacoes.map(s=>`<div class="pl-linha"><button type="button" class="softbtn" data-sol="${attr(s.id)}">${esc(s.id)} · ${esc(s.titulo)}</button><span class="sl-etapa e-${s.etapa}">${PL_ETAPA[s.etapa]||s.etapa}</span><small>${esc(s.responsavel||'sem responsável')} · ${s.prazo?esc(plBr(s.prazo)):'sem prazo'}${s.atrasada?' · <b class="pl-atraso">atrasada</b>':''}</small>${ed?`<button type="button" class="softbtn" data-solta-sol="${attr(s.id)}" aria-label="Desvincular ${attr(s.id)}">Desvincular</button>`:''}</div>`).join('')||'<small>Nenhuma.</small>'}</div>
   <div class="dc-acoes"><button type="button" class="softbtn" id="plNovasSol">Criar solicitações</button><button type="button" class="softbtn" id="plVincSol">Vincular existente</button></div></section>
  <section><h4>Conteúdos vinculados</h4><p class="kpi-note">A produção (legendas, formatos, publicação) fica no módulo Conteúdos.</p><div class="pl-vinc">${a.conteudos.map(c=>`<div class="pl-linha"><button type="button" class="softbtn" data-con="${attr(c.id)}">${esc(c.id)} · ${esc(c.titulo)}</button><small>${esc(c.status||'')}${c.publicacaoEm?' · '+esc(plBr(String(c.publicacaoEm).slice(0,10))):''}</small>${ed?`<button type="button" class="softbtn" data-solta-con="${attr(c.id)}">Desvincular</button>`:''}</div>`).join('')||'<small>Nenhum.</small>'}</div>
   <div class="dc-acoes"><button type="button" class="softbtn" id="plVincCon">Vincular conteúdo existente</button><button type="button" class="softbtn" id="plNovoCon">Criar conteúdo</button></div></section>
  ${a.dataComemorativa?`<p class="kpi-note">Criada a partir da data comemorativa <b>${esc(a.dataComemorativa.nome)}</b>${a.dataComemorativa.data?' · '+esc(plBr(a.dataComemorativa.data)):''}. A data continua no calendário de Datas Comemorativas.</p>`:''}`;
 const o=adminOverlay(`<div class="dc-det"><h3>${novo?'Nova ação':esc(a.titulo)}</h3>
  ${novo?'':`<div class="dc-chips"><span class="dc-chip ${plCat(a.categoria).classe}">${esc(plCat(a.categoria).rotulo)}</span><span class="dc-chip">${esc(plSitRot(a.situacao))}</span><span class="dc-chip">${esc(a.segmento)}</span>${a.atrasada?'<span class="dc-chip pend">Atrasada</span>':a.proximaDoPrazo?'<span class="dc-chip pend">Próxima do prazo</span>':''}${a.calendarioMkt?'<span class="dc-chip">No Calendário de Marketing</span>':''}</div>`}
  <form id="plForm" class="cm-form" novalidate>
   <label class="wide">Título *<input class="control" id="pTitulo" maxlength="140" required autocomplete="off" value="${attr(novo?'':a.titulo)}" ${ed?'':'disabled'}></label>
   <label class="wide">Objetivo<textarea class="control" id="pObj" rows="2" maxlength="1000" ${ed?'':'disabled'}>${esc(novo?'':a.objetivo)}</textarea></label>
   <label>Categoria<select class="control" id="pCat" ${ed?'':'disabled'}>${PL_CATS.map(c=>`<option value="${c.k}" ${c.k===(novo?'CAMPANHAS':a.categoria)?'selected':''}>${esc(c.rotulo)}</option>`).join('')}</select></label>
   <label>Segmento escolar<select class="control" id="pSeg" ${ed?'':'disabled'}>${PL.opc.segmentos.map(s=>`<option value="${attr(s)}" ${s===(novo?'Geral':a.segmento)?'selected':''}>${s==='Geral'?'Toda a escola':esc(s)}</option>`).join('')}</select></label>
   <label>Data inicial *<input class="control" type="date" id="pIni" value="${attr(novo?dataIni:a.dataInicio)}" ${ed?'':'disabled'}></label>
   <label>Data final<input class="control" type="date" id="pFim" value="${attr(novo?'':(a.dataFim!==a.dataInicio?a.dataFim:''))}" ${ed?'':'disabled'}></label>
   <label>Responsável<select class="control" id="pResp" ${ed&&(gerente||novo)?'':'disabled'}><option value="">A definir</option>${respOpc.map(n=>`<option ${n===(novo?'':a.responsavel)?'selected':''}>${esc(n)}</option>`).join('')}${!novo&&a.responsavel&&!respOpc.includes(a.responsavel)?`<option selected>${esc(a.responsavel)}</option>`:''}</select></label>
   <label>Evento escolar (opcional)<select class="control" id="pEv" ${ed?'':'disabled'}><option value="">Nenhum</option>${PL.opc.eventosEscolares.map(e=>`<option value="${attr(e.id)}" ${e.id===(novo?evento:(a.eventoEscolar&&!a.eventoEscolar.removido?a.eventoEscolar.id:''))?'selected':''}>${esc(e.titulo)} · ${esc(plBr(e.data))}</option>`).join('')}</select></label>
   ${!novo&&a.eventoEscolar&&a.eventoEscolar.removido?`<p class="kpi-note wide">O evento escolar “${esc(a.eventoEscolar.titulo)}” foi removido do Calendário Escolar; o vínculo foi desfeito.</p>`:''}
   <label class="wide">Observações (opcional)<textarea class="control" id="pObs" rows="2" maxlength="1000" ${ed?'':'disabled'}>${esc(novo?'':a.observacoes)}</textarea></label>
   <label class="check-row wide"><input type="checkbox" id="pCal" ${!novo&&a.calendarioMkt?'checked':''} ${ed?'':'disabled'}> Mostrar no Calendário de Marketing</label>
   <div class="cm-erro wide" id="pErro" role="alert"></div>
   ${ed?`<div class="actions wide"><button type="button" class="btn soft" data-close>${novo?'Cancelar':'Fechar'}</button><button type="submit" class="btn" id="pSalvar">${novo?'Criar ação':'Salvar alterações'}</button></div>`:'<div class="actions wide"><button type="button" class="btn soft" data-close>Fechar</button></div>'}
  </form>${extra}
  ${!novo&&ed?`<div class="actions"><button type="button" class="btn soft" id="plDup">Duplicar</button><button type="button" class="btn soft" id="plArq">${a.arquivada?'Desarquivar':'Arquivar'}</button><button type="button" class="btn danger-soft" id="plExc">Excluir</button></div>`:''}</div>`,aoFechar);
 const f=o.el,fim=async()=>{await PL_CAL.recarregar()};
 $('#plForm',f).onsubmit=async ev=>{
  ev.preventDefault();const err=$('#pErro',f);err.textContent='';const btn=$('#pSalvar',f);if(!btn)return;btn.disabled=true;
  try{
   await plPost('/planejamento/salvar',{id:novo?'':a.id,titulo:$('#pTitulo',f).value,objetivo:$('#pObj',f).value,categoria:$('#pCat',f).value,segmento:$('#pSeg',f).value,dataInicio:$('#pIni',f).value,dataFim:$('#pFim',f).value,responsavel:$('#pResp',f).value,eventoEscolarId:$('#pEv',f).value,observacoes:$('#pObs',f).value,calendarioMkt:$('#pCal',f).checked?'SIM':'NAO'});
   invalidate('projetos');o.close();toast(novo?'Ação criada':'Ação atualizada');await fim();
  }catch(e){err.textContent=e.message;btn.disabled=false}
 };
 if(novo){$('#pTitulo',f).focus();return}
 const refaz=async()=>{o.close();await fim();const n=PL.acoes.find(x=>x.id===a.id);if(n)plModal(n,'',aoFechar)};
 const acao=async(fn,msg)=>{try{await fn();if(msg)toast(msg);await refaz()}catch(e){toast(e.message,'warn')}};
 f.querySelectorAll('[data-sit]').forEach(b=>b.onclick=()=>acao(()=>plPost('/planejamento/situacao',{id:a.id,situacao:b.dataset.sit}),'Situação atualizada'));
 f.querySelectorAll('[data-sol]').forEach(b=>b.onclick=()=>{o.close();slAbrirExterno(b.dataset.sol,()=>PL_CAL.recarregar())});
 f.querySelectorAll('[data-con]').forEach(b=>b.onclick=async()=>{try{const c=await api('/data?module=conteudos&id='+encodeURIComponent(b.dataset.con));o.close();state.module='conteudos';openModal(c)}catch(e){toast(e.message,'warn')}});
 f.querySelectorAll('[data-solta-sol]').forEach(b=>b.onclick=()=>acao(()=>plPost('/planejamento/vincular',{id:a.id,tipo:'solicitacao',alvoId:b.dataset.soltaSol,desvincular:true}),'Solicitação desvinculada (continua em Solicitações)'));
 f.querySelectorAll('[data-solta-con]').forEach(b=>b.onclick=()=>acao(()=>plPost('/planejamento/vincular',{id:a.id,tipo:'conteudo',alvoId:b.dataset.soltaCon,desvincular:true}),'Conteúdo desvinculado'));
 $('#plNovasSol',f).onclick=()=>plSolicitar(a,refaz);
 $('#plVincSol',f).onclick=()=>plVincular(a,'solicitacao',refaz);
 $('#plVincCon',f).onclick=()=>plVincular(a,'conteudo',refaz);
 $('#plNovoCon',f).onclick=()=>acao(()=>plPost('/planejamento/conteudo',{id:a.id}),'Rascunho criado em Conteúdos e vinculado');
 $('#plDup',f)&&($('#plDup',f).onclick=()=>plDuplicar(a,o));
 $('#plArq',f)&&($('#plArq',f).onclick=()=>acao(()=>plPost('/planejamento/arquivar',{id:a.id,arquivar:!a.arquivada}),a.arquivada?'Ação desarquivada':'Ação arquivada'));
 $('#plExc',f)&&($('#plExc',f).onclick=async()=>{
  if(!confirm(`Excluir a ação "${a.titulo}"? Ela vai para a Lixeira. As ${a.solicitacoes.length} solicitação(ões) e ${a.conteudos.length} conteúdo(s) ligados continuam, apenas sem o vínculo.`))return;
  try{const r=await plPost('/planejamento/excluir',{id:a.id});o.close();toast('Ação movida para a Lixeira'+(r.vinculosDesfeitos?` (${r.vinculosDesfeitos} vínculo(s) desfeito(s))`:''));await fim()}catch(e){toast(e.message,'warn')}
 });
}
/* várias solicitações de uma vez, cada uma com responsável, prazo e status próprios (gerenciadas só em Solicitações) */
function plSolicitar(a,depois){
 const gerente=PL.eu.role==='manager',resp=gerente?PL.opc.responsaveis:[PL.eu.nome];
 const linha=(t='')=>`<div class="pl-ln"><input class="control" data-t placeholder="O que solicitar" maxlength="120" value="${attr(t)}" aria-label="O que solicitar"><select class="control" data-r aria-label="Responsável"><option value="">A distribuir</option>${resp.map(n=>`<option>${esc(n)}</option>`).join('')}</select><input class="control" type="date" data-p value="${attr(a.dataFim)}" aria-label="Prazo"><button type="button" class="softbtn" data-x aria-label="Remover">×</button></div>`;
 const o=adminOverlay(`<h3>Criar solicitações</h3><p class="kpi-note">Ação: <b>${esc(a.titulo)}</b>. Cada solicitação tem responsável, prazo e status próprios e é acompanhada em Solicitações.</p>
  <div class="dc-acoes" id="plSug">${PL_SUGESTOES.map(s=>`<button type="button" class="softbtn" data-sug="${attr(s)}">+ ${esc(s)}</button>`).join('')}</div>
  <form id="plSol" class="pl-sols" novalidate><div id="plLinhas">${linha()}</div><button type="button" class="softbtn" id="plMais">+ outra linha</button><div class="cm-erro" id="sErro" role="alert"></div>
  <div class="actions"><button type="button" class="btn soft" data-close>Voltar</button><button type="submit" class="btn" id="sOk">Criar</button></div></form>`);
 const f=o.el,liga=()=>f.querySelectorAll('[data-x]').forEach(b=>b.onclick=()=>{if(f.querySelectorAll('.pl-ln').length>1)b.closest('.pl-ln').remove()});
 const add=t=>{const vazia=[...f.querySelectorAll('.pl-ln [data-t]')].find(i=>!i.value.trim());if(vazia&&!t){vazia.focus();return}if(vazia&&t){vazia.value=t;return}$('#plLinhas',f).insertAdjacentHTML('beforeend',linha(t));liga()};
 liga();$('#plMais',f).onclick=()=>add('');f.querySelectorAll('[data-sug]').forEach(b=>b.onclick=()=>add(b.dataset.sug));
 $('#plSol',f).onsubmit=async ev=>{
  ev.preventDefault();$('#sErro',f).textContent='';
  const itens=[...f.querySelectorAll('.pl-ln')].map(l=>({texto:$('[data-t]',l).value,responsavel:$('[data-r]',l).value,prazo:$('[data-p]',l).value})).filter(i=>i.texto.trim());
  if(!itens.length){$('#sErro',f).textContent='Escreva ao menos uma solicitação.';return}
  $('#sOk',f).disabled=true;
  try{const r=await plPost('/planejamento/solicitar',{id:a.id,itens});invalidate('solicitacoes');o.close();toast(`${r.criadas.length} solicitação(ões) criada(s)`);await depois()}catch(e){$('#sErro',f).textContent=e.message;$('#sOk',f).disabled=false}
 };
}
async function plVincular(a,tipo,depois){
 let lista=[];
 try{
  if(tipo==='solicitacao')lista=((await api('/solicitacoes/painel')).rows||[]).filter(r=>!r.planejamentoId&&r.etapa!=='CONCLUIDO').map(r=>[r.id,`${r.id} · ${r.titulo}`]);
  else lista=((await api('/data?module=conteudos')).rows||[]).filter(r=>!r.planejamentoId&&!/ARQUIV|PUBLICADO/i.test(r.status||'')).map(r=>[r.id,`${r.id} · ${r.titulo}`]);
 }catch(e){return toast(e.message,'warn')}
 const o=adminOverlay(`<h3>Vincular ${tipo==='solicitacao'?'solicitação':'conteúdo'} existente</h3><p class="kpi-note">Só o vínculo é criado; o registro continua sendo editado no próprio módulo.</p>
  <form id="plV" class="cm-form" novalidate><label class="wide">Escolha<select class="control" id="vAlvo"><option value="">—</option>${lista.map(([v,l])=>`<option value="${attr(v)}">${esc(l)}</option>`).join('')}</select></label>
  <div class="cm-erro wide" id="vErro" role="alert"></div><div class="actions wide"><button type="button" class="btn soft" data-close>Voltar</button><button type="submit" class="btn">Vincular</button></div></form>`);
 $('#plV',o.el).onsubmit=async ev=>{
  ev.preventDefault();if(!$('#vAlvo',o.el).value){$('#vErro',o.el).textContent='Escolha um registro.';return}
  try{await plPost('/planejamento/vincular',{id:a.id,tipo,alvoId:$('#vAlvo',o.el).value});o.close();toast('Vinculado');await depois()}catch(e){$('#vErro',o.el).textContent=e.message}
 };
}
function plDuplicar(a,pai){
 const prox=a.dataInicio?plSomaDias(a.dataInicio,365):PL.hoje;
 const o=adminOverlay(`<h3>Duplicar ação</h3><p class="kpi-note">Cria uma cópia “Planejado”, sem solicitações, conteúdos nem eventos vinculados.</p>
  <form id="plD" class="cm-form" novalidate><label class="wide">Nova data inicial<input class="control" type="date" id="dData" value="${attr(prox)}"></label><div class="cm-erro wide" id="dErro" role="alert"></div>
  <div class="actions wide"><button type="button" class="btn soft" data-close>Voltar</button><button type="submit" class="btn">Duplicar</button></div></form>`);
 $('#plD',o.el).onsubmit=async ev=>{ev.preventDefault();try{await plPost('/planejamento/duplicar',{id:a.id,dataInicio:$('#dData',o.el).value});o.close();pai&&pai.close();toast('Ação duplicada');await PL_CAL.recarregar()}catch(e){$('#dErro',o.el).textContent=e.message}};
}

/* ---------- visão geral, filtros e calendário ---------- */
const plSobrepoe=(i,a,b)=>!!i.data&&(i.fim||i.data)>=a&&i.data<=b;
function plPeriodo(i,v){
 const h=PL.hoje||isoDate(new Date()),d=new Date(h+'T12:00:00');
 if(v==='atrasadas')return i.raw.atrasada;
 if(v==='proximas')return i.raw.proximaDoPrazo;
 if(v==='semana'){const ini=plSomaDias(h,-d.getDay());return plSobrepoe(i,ini,plSomaDias(ini,6))}
 if(v==='mes')return plSobrepoe(i,h.slice(0,7)+'-01',h.slice(0,7)+'-31');
 if(v==='30')return plSobrepoe(i,h,plSomaDias(h,30));
 if(v==='ano')return plSobrepoe(i,h.slice(0,4)+'-01-01',h.slice(0,4)+'-12-31');
 return true;
}
const PL_CAL=CalMotor.criar({
 chave:'planejamento',tituloPagina:'Planejamento',eyebrow:'ORGANIZAÇÃO',rotuloNovo:'+ Nova ação',
 descricao:'O que o marketing pretende realizar. Os pedidos a executar ficam em Solicitações; aqui você vê o andamento deles por ação.',
 tipos:PL_CATS,carregar:plCarregar,novo:d=>plModal(null,d),abrir:it=>plModal(it.raw),mover:(it,d)=>plPost('/planejamento/mover',{id:it.id,data:d}),
 modos:[['month','Mês'],['week','Semana'],['list','Lista']],modoPadrao:'list',listaEscopo:'tudo',busca:true,
 filtrosExtras:[
  {chave:'situacao',vazio:'Todas as situações',opcoes:()=>PL_SIT,testa:(i,v)=>!v||i.raw.situacao===v},
  {chave:'segmento',vazio:'Todos os segmentos',opcoes:()=>PL.opc.segmentos.map(s=>[s,s==='Geral'?'Toda a escola':s]),testa:(i,v)=>!v||i.raw.segmento===v||i.raw.segmento==='Geral'},
  {chave:'periodo',vazio:'Qualquer período',opcoes:()=>[['semana','Esta semana'],['mes','Este mês'],['30','Próximos 30 dias'],['ano','Este ano'],['proximas','Próximas do prazo (7 dias)'],['atrasadas','Atrasadas']],testa:(i,v)=>!v||plPeriodo(i,v)},
  {chave:'arq',vazio:'Sem arquivadas',opcoes:()=>[['arquivadas','Somente arquivadas'],['todas','Incluir arquivadas']],testa:(i,v)=>v==='todas'||(v==='arquivadas'?i.raw.arquivada:!i.raw.arquivada)},
 ],
 faixa:todos=>{const v=todos.filter(i=>!i.raw.arquivada),c=s=>v.filter(i=>i.raw.situacao===s).length;
  return `<div class="pl-faixa" role="group" aria-label="Resumo"><button type="button" data-plf="situacao:PLANEJADO"><b>${c('PLANEJADO')}</b><span>Previstas</span></button><button type="button" data-plf="situacao:EXECUCAO"><b>${c('EXECUCAO')}</b><span>Em execução</span></button><button type="button" data-plf="situacao:FINALIZADO"><b>${c('FINALIZADO')}</b><span>Finalizadas</span></button><button type="button" data-plf="periodo:proximas"><b>${v.filter(i=>i.raw.proximaDoPrazo).length}</b><span>Próximas do prazo</span></button><button type="button" class="${v.some(i=>i.raw.atrasada)?'alerta':''}" data-plf="periodo:atrasadas"><b>${v.filter(i=>i.raw.atrasada).length}</b><span>Atrasadas</span></button></div>`},
 aoDesenhar:alvo=>alvo.querySelectorAll('[data-plf]').forEach(b=>b.onclick=()=>{const [k,v]=b.dataset.plf.split(':');PL_CAL.definirFiltro(k,v)}),
 detalhe:i=>`${i.raw.segmento==='Geral'?'Toda a escola':i.raw.segmento} · ${plSitRot(i.raw.situacao)}${i.raw.andamento.total?` · ${i.raw.andamento.concluidas}/${i.raw.andamento.total} solicitações`:''}`,
});
async function renderPlanejamento(){return PL_CAL.render()}
