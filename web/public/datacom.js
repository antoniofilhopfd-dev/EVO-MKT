/* Datas Comemorativas: terceiro calendário (independente do de Marketing e do Escolar), sobre o mesmo motor CalMotor.
   As datas do catálogo e as regras (fixas e móveis) são calculadas no servidor para o ano escolhido; nada é copiado ano a ano.
   A equipe marca quais datas são relevantes, cadastra as suas e, se quiser, cria uma ação no Planejamento ou uma solicitação. */
const DC_GLIFOS={FERIADO_NACIONAL:'⚑',FERIADO_ESTADUAL_PB:'⚐',FERIADO_MUNICIPAL_JP:'⌂',EDUCACIONAL:'✎',CULTURAL:'★',RELIGIOSA:'✚',PROFISSIONAL:'⚒',AMBIENTAL:'❀',SAUDE:'♥',INSTITUCIONAL:'▣'};
const DC_PADRAO=Object.keys(DC_GLIFOS);
const DC_MESES=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const DC_SEMANA=['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'];
let DC={categorias:[],grupoFeriados:[],eu:{nome:'',role:'',codigo:''}};
const dcPost=(u,b)=>api(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});
const dcBr=iso=>String(iso||'').split('-').reverse().join('/');
const dcClasse=cod=>DC_PADRAO.includes(cod)?'t-'+cod:'dc-c'+([...cod].reduce((a,c)=>a+c.charCodeAt(0),0)%6);
const dcNomeCat=cod=>(DC.categorias.find(c=>c.codigo===cod)||{nome:cod}).nome;

async function dcCarregar(ano){
 const d=await api('/datacom/painel?ano='+ano);
 DC=d;
 const tipos=d.categorias.map(c=>({k:c.codigo,rotulo:c.nome,glifo:DC_GLIFOS[c.codigo]||'◆',classe:dcClasse(c.codigo)}));
 const itens=d.itens.map(i=>({uid:i.uid,id:i.id,modulo:'datacom',titulo:i.nome,data:i.data,fim:i.fim&&i.fim!==i.data?i.fim:'',hora:'',tipo:i.categoria,responsavel:'',editavel:false,raw:i}));
 return {itens,tipos,eu:d.eu,podeEditar:true};
}
const dcChips=r=>`<span class="dc-chip ${dcClasse(r.categoria)}">${esc(dcNomeCat(r.categoria))}</span><span class="dc-chip">${r.movel?'Data móvel':'Data fixa'}</span>${r.status==='pendente'?'<span class="dc-chip pend">Pendente de validação</span>':'<span class="dc-chip ok">Confirmada</span>'}${r.relevante==='SIM'?'<span class="dc-chip rel">★ Relevante</span>':''}`;

/* ---------- detalhe da data ---------- */
async function dcAbrir(it){
 const r=it.raw;
 let equipe=[];try{equipe=((await getRows('equipe')).rows||[]).map(x=>x.titulo).filter(Boolean)}catch{}
 const gerente=DC.eu.role==='manager';
 const pend=r.status==='pendente';
 const vs=r.vinculos.solicitacoes,vp=r.vinculos.planejamento;
 const o=adminOverlay(`<div class="dc-det"><h3>${esc(r.nome)}</h3>
  <div class="dc-chips">${dcChips(r)}</div>
  <dl class="dc-dl"><dt>Data</dt><dd>${esc(dcBr(r.data))}${r.fim&&r.fim!==r.data?' a '+esc(dcBr(r.fim)):''}</dd><dt>Regra</dt><dd>${esc(r.regra)}${r.repeteAnual?' · repete todo ano':''}</dd>
   ${r.baseLegal?`<dt>Base</dt><dd>${esc(r.baseLegal)}</dd>`:''}<dt>Validação</dt><dd>${esc(r.fonte)}</dd>${r.descricao?`<dt>Descrição</dt><dd>${esc(r.descricao)}</dd>`:''}</dl>
  ${pend?'<p class="dc-aviso" role="note">Esta data ainda não foi confirmada em fonte oficial; por isso não é tratada como feriado e não permite criar ações. Valide-a antes de usar.</p>':''}
  <section><h4>Relevância para o marketing</h4><div class="dc-seg" role="group" aria-label="Relevância"><button type="button" data-rel="SIM" class="${r.relevante==='SIM'?'on':''}" aria-pressed="${r.relevante==='SIM'}">Relevante</button><button type="button" data-rel="NAO" class="${r.relevante==='NAO'?'on':''}" aria-pressed="${r.relevante==='NAO'}">Não relevante</button>${r.origem==='catalogo'&&r.relevanteAjustado?'<button type="button" data-rel="">Voltar ao padrão</button>':''}</div>
   <label class="dc-obs">Observações da equipe<textarea class="control" id="dcObs" rows="2" maxlength="1000">${esc(r.observacoes||'')}</textarea></label><button type="button" class="softbtn" id="dcObsSalvar">Salvar observações</button></section>
  <section><h4>Ações a partir desta data</h4><p class="kpi-note">Opcional. Nada é criado sozinho, e a data comemorativa não é copiada.</p>
   <div class="dc-acoes"><button type="button" class="softbtn" id="dcPlanejar" ${pend?'disabled':''}>Criar ação no Planejamento</button><button type="button" class="softbtn" id="dcSolicitar" ${pend?'disabled':''}>Criar solicitação</button></div>
   ${vp.length||vs.length?`<div class="dc-vinc">${vp.map(p=>`<button type="button" class="softbtn" data-plan="${attr(p.id)}">Ação ${esc(p.id)} · ${esc(p.titulo)}</button>`).join('')}${vs.map(s=>`<button type="button" class="softbtn" data-sol="${attr(s.id)}">${esc(s.id)} · ${esc(s.titulo)}</button>`).join('')}</div>`:''}</section>
  <div class="actions">${r.origem==='personalizada'&&r.editavel?'<button type="button" class="btn soft" id="dcEditar">Editar</button><button type="button" class="btn danger-soft" id="dcExcluir">Excluir</button>':''}<span class="cm-esp"></span><button type="button" class="btn soft" data-close>Fechar</button></div></div>`);
 const f=o.el,recarrega=async()=>{await DC_CAL.recarregar()};
 f.querySelectorAll('[data-rel]').forEach(b=>b.onclick=async()=>{try{await dcPost('/datacom/relevancia',{id:r.id,relevante:b.dataset.rel});o.close();toast('Relevância atualizada');await recarrega()}catch(e){toast(e.message,'warn')}});
 $('#dcObsSalvar',f).onclick=async()=>{try{await dcPost('/datacom/relevancia',{id:r.id,relevante:r.relevanteAjustado||r.origem==='personalizada'?r.relevante:'',observacoes:$('#dcObs',f).value});toast('Observações salvas');await recarrega()}catch(e){toast(e.message,'warn')}};
 f.querySelectorAll('[data-sol]').forEach(b=>b.onclick=()=>{o.close();slAbrirExterno(b.dataset.sol,()=>DC_CAL.recarregar())});
 f.querySelectorAll('[data-plan]').forEach(b=>b.onclick=async()=>{try{const p=await api('/data?module=projetos&id='+encodeURIComponent(b.dataset.plan));o.close();state.module='projetos';openModal(p)}catch(e){toast(e.message,'warn')}});
 $('#dcPlanejar',f).onclick=()=>dcAcao(r,'planejar',equipe,gerente,o);
 $('#dcSolicitar',f).onclick=()=>dcAcao(r,'solicitar',equipe,gerente,o);
 $('#dcEditar',f)&&($('#dcEditar',f).onclick=()=>{o.close();dcForm(r)});
 $('#dcExcluir',f)&&($('#dcExcluir',f).onclick=async()=>{
  if(!confirm(`Excluir "${r.nome}"? Ela vai para a Lixeira e pode ser restaurada. Ações e solicitações já criadas continuam.`))return;
  try{await dcPost('/datacom/excluir',{id:r.id});o.close();toast('Data movida para a Lixeira');await recarrega()}catch(e){toast(e.message,'warn')}
 });
}
/* mini-formulário das duas ações opcionais */
function dcAcao(r,tipo,equipe,gerente,pai){
 const plan=tipo==='planejar';
 const o=adminOverlay(`<h3>${plan?'Criar ação no Planejamento':'Criar solicitação'}</h3><p class="kpi-note">${esc(r.nome)} · ${esc(dcBr(r.data))}</p>
  <form id="dcAc" class="cm-form" novalidate>
   <label class="wide">${plan?'Ação planejada':'O que solicitar'}<input class="control" id="aTexto" maxlength="120" value="${attr(plan?`Ação para ${r.nome}`:'Produzir arte para o Instagram')}" autocomplete="off"></label>
   <label>Prazo ${plan?'':'(opcional)'}<input class="control" type="date" id="aPrazo" value="${plan?attr(r.data):''}"></label>
   ${gerente?`<label>Responsável (opcional)<select class="control" id="aResp"><option value="">A definir</option>${equipe.map(n=>`<option>${esc(n)}</option>`).join('')}</select></label>`:''}
   <label class="wide">Observação (opcional)<textarea class="control" id="aObs" rows="2" maxlength="500"></textarea></label>
   <div class="cm-erro wide" id="aErro" role="alert"></div>
   <div class="actions wide"><button type="button" class="btn soft" data-close>Voltar</button><button type="submit" class="btn" id="aOk">${plan?'Criar ação':'Criar solicitação'}</button></div></form>`);
 $('#aTexto',o.el).focus();
 $('#dcAc',o.el).onsubmit=async ev=>{
  ev.preventDefault();$('#aOk',o.el).disabled=true;
  try{
   const base={id:r.id,data:r.data,prazo:$('#aPrazo',o.el).value,responsavel:$('#aResp',o.el)?.value||'',observacao:$('#aObs',o.el).value};
   const x=plan?await dcPost('/datacom/planejar',{...base,acao:$('#aTexto',o.el).value}):await dcPost('/datacom/solicitar',{...base,texto:$('#aTexto',o.el).value});
   invalidate(plan?'projetos':'solicitacoes');o.close();pai&&pai.close();toast(plan?`Ação ${x.id} criada no Planejamento`:`Solicitação ${x.id} criada`);await DC_CAL.recarregar();
  }catch(e){$('#aErro',o.el).textContent=e.message;$('#aOk',o.el).disabled=false}
 };
}

/* ---------- cadastro e edição de datas da equipe ---------- */
function dcForm(r,dataIso=''){
 const edit=!!r,rd=edit?(r.regraDados||{}):{};
 const d0=dataIso?dataIso.split('-').map(Number):null;
 const tipo=edit?rd.regraTipo:'fixa';
 const mesSel=(id,v)=>`<select class="control" id="${id}">${DC_MESES.map((m,i)=>`<option value="${i+1}" ${Number(v)===i+1?'selected':''}>${m}</option>`).join('')}</select>`;
 const o=adminOverlay(`<h3>${edit?'Editar data':'Nova data'}</h3>
  <form id="dcForm" class="cm-form" novalidate>
   <label class="wide">Nome da data *<input class="control" id="fNome" maxlength="100" required autocomplete="off" value="${attr(edit?r.nome:'')}"></label>
   <label>Categoria<select class="control" id="fCat">${DC.categorias.map(c=>`<option value="${attr(c.codigo)}" ${(edit?r.categoria:'CULTURAL')===c.codigo?'selected':''}>${esc(c.nome)}</option>`).join('')}<option value="__nova">＋ Nova categoria…</option></select></label>
   <label id="fCatNovaL" hidden>Nome da nova categoria<input class="control" id="fCatNova" maxlength="60"></label>
   <label class="wide">Como a data é definida
     <select class="control" id="fTipo"><option value="fixa" ${tipo==='fixa'?'selected':''}>Data fixa (dia e mês)</option><option value="nesimo" ${tipo==='nesimo'?'selected':''}>Móvel: dia da semana do mês (ex.: 2º domingo de maio)</option><option value="pascoa" ${tipo==='pascoa'?'selected':''}>Móvel: relativa à Páscoa</option><option value="mes" ${tipo==='mes'?'selected':''}>Mês inteiro (campanha)</option></select></label>
   <div class="wide cm-regra" data-r="fixa"><label>Dia<input class="control" type="number" min="1" max="31" id="fDia" value="${attr(rd.regraDia||(d0?d0[2]:''))}"></label><label>Mês${mesSel('fMesFixa',rd.regraMes||(d0?d0[1]:1))}</label></div>
   <div class="wide cm-regra" data-r="nesimo"><label>Qual<select class="control" id="fN">${[[1,'1º'],[2,'2º'],[3,'3º'],[4,'4º'],[-1,'Último']].map(([v,l])=>`<option value="${v}" ${Number(rd.regraN||2)===v?'selected':''}>${l}</option>`).join('')}</select></label><label>Dia da semana<select class="control" id="fSem">${DC_SEMANA.map((s,i)=>`<option value="${i}" ${Number(rd.regraDiaSemana??0)===i?'selected':''}>${s}</option>`).join('')}</select></label><label>Mês${mesSel('fMesN',rd.regraMes||1)}</label></div>
   <div class="wide cm-regra" data-r="pascoa"><label>Dias em relação à Páscoa (negativo = antes)<input class="control" type="number" min="-100" max="100" id="fOff" value="${attr(rd.regraOffset||'0')}"></label></div>
   <div class="wide cm-regra" data-r="mes"><label>Mês${mesSel('fMesM',rd.regraMes||1)}</label></div>
   <label class="check-row wide"><input type="checkbox" id="fRep" ${(edit?rd.repeteAnual!=='NAO':true)?'checked':''}> Repete todo ano</label>
   <label id="fAnoL" hidden>Ano<input class="control" type="number" min="1900" max="2100" id="fAno" value="${attr(rd.ano||(d0?d0[0]:new Date().getFullYear()))}"></label>
   <label>Relevante para o marketing<select class="control" id="fRel"><option value="SIM" ${(edit?r.relevante:'SIM')==='SIM'?'selected':''}>Sim</option><option value="NAO" ${edit&&r.relevante==='NAO'?'selected':''}>Não</option></select></label>
   <label class="wide">Descrição (opcional)<textarea class="control" id="fDesc" rows="2" maxlength="500">${esc(edit?r.descricao:'')}</textarea></label>
   <label class="wide">Observações (opcional)<textarea class="control" id="fObs" rows="2" maxlength="1000">${esc(edit?r.observacoes:'')}</textarea></label>
   <div class="cm-erro wide" id="fErro" role="alert"></div>
   <div class="actions wide"><button type="button" class="btn soft" data-close>Cancelar</button><button type="submit" class="btn" id="fOk">Salvar</button></div></form>`);
 const f=o.el;
 const atualiza=()=>{f.querySelectorAll('.cm-regra').forEach(x=>x.hidden=x.dataset.r!==$('#fTipo',f).value);$('#fAnoL',f).hidden=$('#fRep',f).checked;$('#fCatNovaL',f).hidden=$('#fCat',f).value!=='__nova'};
 ['#fTipo','#fRep','#fCat'].forEach(s=>$(s,f).onchange=atualiza);atualiza();$('#fNome',f).focus();
 $('#dcForm',f).onsubmit=async ev=>{
  ev.preventDefault();const err=$('#fErro',f);err.textContent='';const btn=$('#fOk',f);btn.disabled=true;
  try{
   let cat=$('#fCat',f).value;
   if(cat==='__nova'){const c=await dcPost('/datacom/categoria',{nome:$('#fCatNova',f).value});cat=c.codigo}
   const t=$('#fTipo',f).value;
   const regra=t==='fixa'?{tipo:t,dia:$('#fDia',f).value,mes:$('#fMesFixa',f).value}:t==='nesimo'?{tipo:t,n:$('#fN',f).value,diaSemana:$('#fSem',f).value,mes:$('#fMesN',f).value}:t==='pascoa'?{tipo:t,offset:$('#fOff',f).value}:{tipo:t,mes:$('#fMesM',f).value};
   await dcPost('/datacom/salvar',{id:edit?r.id:'',nome:$('#fNome',f).value,categoria:cat,regra,repeteAnual:$('#fRep',f).checked?'SIM':'NAO',ano:$('#fAno',f).value,relevante:$('#fRel',f).value,descricao:$('#fDesc',f).value,observacoes:$('#fObs',f).value});
   o.close();toast(edit?'Data atualizada':'Data cadastrada');await DC_CAL.recarregar();
  }catch(e){err.textContent=e.message;btn.disabled=false}
 };
}

const DC_CAL=CalMotor.criar({
 chave:'datacom',tituloPagina:'Datas Comemorativas',eyebrow:'PLANEJAMENTO',rotuloNovo:'+ Nova data',
 descricao:'Feriados e datas relevantes ao marketing escolar, calculadas para cada ano. Marque as que a equipe quer trabalhar; datas ainda não confirmadas ficam em “Pendentes de validação”.',
 tipos:[],carregar:dcCarregar,novo:d=>dcForm(null,d),abrir:dcAbrir,
 modos:[['month','Mês'],['year','Ano'],['list','Lista']],modoPadrao:'month',porAno:true,listaEscopo:'ano',busca:true,filtroResponsavel:false,
 filtrosExtras:[
  {chave:'grupo',vazio:'Todas as datas',opcoes:()=>[['feriados','Feriados'],['educacionais','Datas educacionais']],testa:(i,v)=>!v||(v==='feriados'?DC.grupoFeriados.includes(i.raw.categoria):i.raw.categoria==='EDUCACIONAL')},
  {chave:'validacao',vazio:'Confirmadas',opcoes:()=>[['pendentes','Pendentes de validação'],['todas','Todas (inclui pendentes)']],testa:(i,v)=>v==='todas'||(v==='pendentes'?i.raw.status==='pendente':i.raw.status==='confirmada')},
 ],
 alternancias:[{chave:'relevantes',rotulo:'Somente datas relevantes',testa:i=>i.raw.relevante==='SIM'}],
 classeDia:lista=>lista.some(i=>DC.grupoFeriados.includes(i.raw.categoria)&&i.raw.status==='confirmada')?'feriado':'',
 detalhe:i=>i.raw.regra,
});
async function renderDatacom(){return DC_CAL.render()}
