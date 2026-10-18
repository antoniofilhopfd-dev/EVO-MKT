/* Calendário Escolar: eventos e atividades OFICIAIS do Colégio, separados do Calendário de Marketing.
   Usa o mesmo motor (CalMotor, em calmkt.js); aqui ficam só a configuração, o formulário e o pedido opcional ao Marketing.
   Consulta: toda a equipe. Cadastro, edição, reagendamento e exclusão: Gerência/Administração. Nada é criado automaticamente. */
const ESC_TIPOS=[
 {k:'EVENTO',rotulo:'Evento escolar',glifo:'★'},{k:'PROVA',rotulo:'Prova / avaliação',glifo:'✎'},{k:'PROJETO',rotulo:'Projeto pedagógico',glifo:'◆'},
 {k:'PASSEIO',rotulo:'Passeio / excursão',glifo:'➤'},{k:'REUNIAO_PAIS',rotulo:'Reunião de pais',glifo:'◷'},{k:'ESPORTIVA',rotulo:'Atividade esportiva',glifo:'●'},
 {k:'CULTURAL',rotulo:'Apresentação cultural',glifo:'♪'},{k:'SOLENIDADE',rotulo:'Formatura / solenidade',glifo:'✦'},{k:'INSTITUCIONAL',rotulo:'Atividade institucional',glifo:'▣'},
 {k:'OUTRO',rotulo:'Outra atividade oficial',glifo:'▪'},
];
const ESC_SEG_CURTO={TODOS:'Toda a escola',INFANTIL:'Infantil',FUND1:'Anos Iniciais',FUND2:'Anos Finais',MEDIO:'Ensino Médio',ADMIN:'Administrativo',DIRECAO:'Direção'};
let ESC_OPC={segmentos:[],tipos:[],acoes:[]},ESC_PODE=false;
const escPost=(u,b)=>api(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});
const escSegs=e=>String(e.segmentos||'TODOS').split('|').filter(Boolean);
const escSegTxt=e=>escSegs(e).map(s=>ESC_SEG_CURTO[s]||s).join(', ');
const escData=iso=>String(iso||'').split('-').reverse().join('/');

async function escCarregar(){
 const pn=await api('/escolar/painel');
 ESC_OPC=pn.opcoes||ESC_OPC;ESC_PODE=!!pn.podeEditar;
 const itens=(pn.rows||[]).map(e=>({uid:'esc:'+e.id,id:e.id,modulo:'calescolar',titulo:e.titulo,data:e.dataInicio,fim:e.dataFim&&e.dataFim!==e.dataInicio?e.dataFim:'',hora:e.horaInicio||'',tipo:e.tipoEvento||'EVENTO',segmentos:escSegs(e),responsavel:'',editavel:ESC_PODE,raw:e}));
 return {itens,opcoes:{responsaveis:[]},eu:pn.eu,podeEditar:ESC_PODE};
}
function escAbrir(it){return escForm(it)}

/** Quem pode editar vê o formulário; os demais veem os detalhes (e podem pedir apoio ao Marketing). */
async function escForm(it,dataInicial=''){
 if(pref('safeMode',false)&&ESC_PODE)return toast('Modo Seguro ativo: edição bloqueada.','warn');
 const edit=!!it,e=edit?it.raw:{};
 const segs=new Set(edit?escSegs(e):['TODOS']);
 const ro=!ESC_PODE;
 const dis=ro?'disabled':'';
 const ligados=(e.solicitacoes||[]);
 const o=adminOverlay(`<h3>${edit?(ro?esc(e.titulo):'Editar evento'):'Novo evento'}</h3>
  <form id="escForm" class="cm-form" novalidate>
   <label class="wide">Título *<input class="control" id="eTitulo" maxlength="140" required autocomplete="off" value="${attr(e.titulo||'')}" ${dis}></label>
   <div class="wide"><span class="cm-lbl">Data *</span><input type="hidden" id="eData" value="${attr(e.dataInicio||dataInicial)}"><input type="hidden" id="eFim" value="${attr(e.dataFim&&e.dataFim!==e.dataInicio?e.dataFim:'')}"><button type="button" class="control cm-rng" id="eRange" ${dis}></button><small class="cm-dica">Escolha o dia e, se durar mais de um dia, o último dia — tudo no mesmo calendário.</small></div>
   <label>Horário inicial (opcional)<input class="control" type="time" id="eHi" value="${attr(e.horaInicio||'')}" ${dis}></label>
   <label>Horário final (opcional)<input class="control" type="time" id="eHf" value="${attr(e.horaFim||'')}" ${dis}></label>
   <label>Tipo de evento<select class="control" id="eTipo" ${dis}>${(ESC_OPC.tipos||[]).map(([k,l])=>`<option value="${k}" ${k===(e.tipoEvento||'EVENTO')?'selected':''}>${esc(l)}</option>`).join('')}</select></label>
   <label>Local (opcional)<input class="control" id="eLocal" maxlength="140" value="${attr(e.local||'')}" ${dis}></label>
   <fieldset class="wide cm-segs"><legend>Segmentos</legend>${(ESC_OPC.segmentos||[]).map(([k,l])=>`<label class="check-row"><input type="checkbox" data-seg="${k}" ${segs.has(k)?'checked':''} ${dis}> ${esc(l)}</label>`).join('')}</fieldset>
   <label class="wide">Descrição ou observações (opcional)<textarea class="control" id="eDesc" rows="3" maxlength="1000" ${dis}>${esc(e.descricao||'')}</textarea></label>
   <div class="cm-erro wide" id="eErro" role="alert"></div>
   <div class="actions wide">${edit&&!ro?'<button type="button" class="btn danger-soft" id="eExcluir">Excluir</button>':''}<span class="cm-esp"></span><button type="button" class="btn soft" data-close>${ro?'Fechar':'Cancelar'}</button>${ro?'':'<button type="submit" class="btn" id="eSalvar">Salvar</button>'}</div>
  </form>`);
 const f=o.el;
 // "Toda a escola" exclui os demais segmentos, e vice-versa
 f.querySelectorAll('[data-seg]').forEach(c=>c.onchange=()=>{
  if(c.dataset.seg==='TODOS'&&c.checked)f.querySelectorAll('[data-seg]').forEach(x=>{if(x!==c)x.checked=false});
  else if(c.checked)f.querySelector('[data-seg="TODOS"]').checked=false;
  if(![...f.querySelectorAll('[data-seg]')].some(x=>x.checked))f.querySelector('[data-seg="TODOS"]').checked=true;
 });
  const pintaRng=()=>{const d=$('#eData',f).value,a=$('#eFim',f).value;$('#eRange',f).textContent='📅 '+(d?(a&&a!==d?`${fmtDate(d)} a ${fmtDate(a)}`:fmtDate(d)):'Escolher a data')};pintaRng();
  $('#eRange',f).onclick=()=>{if(ro)return;PeriodoPicker.abrir({de:$('#eData',f).value,ate:$('#eFim',f).value||$('#eData',f).value,titulo:'Dia do evento (e o último dia)'},(d,a)=>{$('#eData',f).value=d;$('#eFim',f).value=a===d?'':a;pintaRng()})};
   if(ro)return;
 $('#eTitulo',f).focus();
 $('#escForm',f).onsubmit=async ev=>{
  ev.preventDefault();const err=$('#eErro',f);err.textContent='';
  const body={id:edit?e.id:'',titulo:$('#eTitulo',f).value,dataInicio:$('#eData',f).value,dataFim:$('#eFim',f).value,horaInicio:$('#eHi',f).value,horaFim:$('#eHf',f).value,tipoEvento:$('#eTipo',f).value,local:$('#eLocal',f).value,descricao:$('#eDesc',f).value,segmentos:[...f.querySelectorAll('[data-seg]')].filter(x=>x.checked).map(x=>x.dataset.seg)};
  const btn=$('#eSalvar',f);btn.disabled=true;
  try{await escPost('/escolar/salvar',body);o.close();toast(edit?'Evento atualizado':'Evento criado');await ESC.recarregar()}catch(x){err.textContent=x.message;btn.disabled=false}
 };
 $('#eExcluir',f)&&($('#eExcluir',f).onclick=async()=>{
  if(!confirm(`Excluir "${e.titulo}"? Ele vai para a Lixeira e pode ser restaurado. As solicitações já criadas a partir dele continuam.`))return;
  try{await escPost('/escolar/excluir',{id:e.id});o.close();toast('Evento movido para a Lixeira');await ESC.recarregar()}catch(x){$('#eErro',f).textContent=x.message}
 });
}
function escPedir(e,acao,pai){
 const rot=(ESC_OPC.acoes||[]).find(a=>a[0]===acao)?.[1]||'Apoio';
 const o=adminOverlay(`<h3>${esc(rot)}</h3><p class="kpi-note">Evento: <b>${esc(e.titulo)}</b> · ${esc(escData(e.dataInicio))}</p>
  <form id="escPed" class="cm-form" novalidate><label>Prazo (opcional)<input class="control" type="date" id="pPrazo"></label><label class="wide">Observação (opcional)<textarea class="control" id="pObs" rows="3" maxlength="500"></textarea></label>
  <div class="cm-erro wide" id="pErro" role="alert"></div><div class="actions wide"><button type="button" class="btn soft" data-close>Voltar</button><button type="submit" class="btn" id="pOk">Criar solicitação</button></div></form>`);
 $('#escPed',o.el).onsubmit=async ev=>{
  ev.preventDefault();$('#pOk',o.el).disabled=true;
  try{const s=await escPost('/escolar/solicitar',{id:e.id,acao,prazo:$('#pPrazo',o.el).value,observacao:$('#pObs',o.el).value});invalidate('solicitacoes');o.close();pai&&pai.close();toast(`Solicitação ${s.id} criada`);await ESC.recarregar()}
  catch(x){$('#pErro',o.el).textContent=x.message;$('#pOk',o.el).disabled=false}
 };
}
const ESC=CalMotor.criar({
 chave:'escolar',tituloPagina:'Calendário Escolar',eyebrow:'PLANEJAMENTO',
 descricao:'Eventos e atividades oficiais do Colégio Evolução, por segmento. As datas comemorativas e as ações de Marketing têm calendários próprios.',
 tipos:ESC_TIPOS,carregar:escCarregar,novo:d=>escForm(null,d),abrir:escAbrir,
 mover:(it,d)=>escPost('/escolar/mover',{id:it.id,data:d}),
 modos:[['month','Mês'],['week','Semana'],['list','Próximos']],modoPadrao:'month',
 busca:true,filtroResponsavel:false,
 filtroExtra:{rotulo:'Segmento',vazio:'Todos os segmentos',opcoes:()=>(ESC_OPC.segmentos||[]).map(([k,l])=>[k,l]),testa:(i,v)=>i.segmentos.includes(v)||i.segmentos.includes('TODOS')},
 detalhe:i=>escSegTxt(i.raw),
});
async function renderEscolar(){return ESC.render()}
