
/* Histórico de seguidores a partir de 11/10/2026. Nenhuma contagem é estimada. */
const DB_SEGUIDORES_INICIO='2026-10-11';
const DB_SEG_MODOS=[['semana','Semana'],['mes','Mês'],['ano','Ano']];
let DB_SEG_MODO='semana';
function dbSegDados(d) {
 const serie=(d?.seguidores?.serie||[]).filter(p=>p.dia>=DB_SEGUIDORES_INICIO&&Number.isFinite(Number(p.seguidores)))
   .map(p=>({dia:p.dia,valor:Number(p.seguidores)})).sort((a,b)=>a.dia.localeCompare(b.dia));
 return [...new Map(serie.map(p=>[p.dia,p])).values()].sort((a,b)=>a.dia.localeCompare(b.dia));
}
function dbSegAgrupar(serie,modo) {
 const chave=dia=>{
   if(modo==='ano')return dia.slice(0,4);
   if(modo==='mes')return dia.slice(0,7);
   const d=new Date(dia+'T12:00:00Z'),w=d.getUTCDay();d.setUTCDate(d.getUTCDate()-w);
   return d.toISOString().slice(0,10);
 };
 const map=new Map();
 serie.forEach(p=>{const k=chave(p.dia);if(!map.has(k))map.set(k,[]);map.get(k).push(p)});
 return [...map.entries()].map(([k,val])=>{
   const primeiro=val[0],ultimo=val[val.length-1];
   const rotulo=modo==='ano'?k:modo==='mes'?k.slice(5,7)+'/'+k.slice(0,4):fmtDate(k)+' a '+fmtDate((()=>{const d=new Date(k+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+6);return d.toISOString().slice(0,10)})());
   return {rotulo,primeiro,ultimo,variacao:val.length>1?ultimo.valor-primeiro.valor:null,amostras:val.length};
 });
}
function dbSegTabela(serie,modo) {
 const linhas=dbSegAgrupar(serie,modo);
 return linhas.length?`<div class="tablewrap"><table class="datatable"><thead><tr><th>Período</th><th>Primeiro registro</th><th>Último registro</th><th class="num">Seguidores</th><th class="num">Variação*</th></tr></thead><tbody>${linhas.map(r=>`<tr><td>${esc(r.rotulo)}</td><td>${fmtDate(r.primeiro.dia)}</td><td>${fmtDate(r.ultimo.dia)}</td><td class="num"><b>${fmtN(r.ultimo.valor)}</b></td><td class="num">${r.variacao===null?'sem base':(r.variacao>0?'+':'')+fmtN(r.variacao)}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty compact">Ainda não existem registros de seguidores desde 11/10/2026 para este perfil.</div>';
}

const dbMini = (src, alt = '') => src ? `<img src="${attr(src)}" alt="${attr(alt)}" loading="lazy" referrerpolicy="no-referrer">` : '<span class="db-sem-img">Sem imagem</span>';
const dbSegNome = k => (typeof CG_GRUPOS !== 'undefined' ? (CG_GRUPOS.find(g => g[0] === k) || [, k])[1] : k);
const dbDif = (a, b) => delta(varPct(a, b));
const dbCard = (icone, rot, valor, rodape) => `<div class="kpi tf-kpi db-kpi"><span class="tf-ico" aria-hidden="true">${icone}</span><small>${rot}</small><strong>${valor}</strong>${rodape || ''}</div>`;
const dbNota = txt => `<i class="kd flat">${esc(txt)}</i>`;
/** Faixa do período: nome do filtro, datas com dia da semana (domingo a sábado) e número da semana. */
function dbFaixa() {
  const f = Filtros.get(), hoje = hojeBR(), ate = f.ate > hoje ? hoje : f.ate;
  const nome = f.p === 'x' ? 'Período personalizado' : ((typeof PERIODOS !== 'undefined' ? PERIODOS.find(x => x[0] === f.p) : null) || [, 'Período'])[1];
  const sem = (f.p === 'semana' || f.p === 'semana_ant') ? ` · Semana ${tfSemanaEpi(f.de).semana}` : '';
  return `<div class="db-faixa"><b>${esc(nome)}${esc(sem)}</b><span>${esc(tfDiaLongo(f.de))} – ${esc(tfDiaLongo(ate))}</span></div>`;
}
function dbEventos(ev) {
  if (!ev) return '<div class="empty compact">Não foi possível ler o Calendário agora.</div>';
  if (!(ev.agendas || []).length) return '<div class="empty-rich"><strong>Nenhuma agenda do Google cadastrada</strong><p>O Administrador cadastra as agendas em Configurações › Agendas Google.</p><button class="btn soft" data-go="configuracoes">Abrir Configurações</button></div>';
  const hoje = hojeBR(), itens = (ev.itens || []).filter(e => e.diaFim >= hoje).slice(0, 5);
  const avisos = (ev.avisos || []).map(a => `<p class="foco-chip" role="note">${esc(a)}</p>`).join('');
  return avisos + (itens.length ? `<ul class="db-eventos">${itens.map(e => `<li><button type="button" data-go="calendario" class="db-ev"><span class="db-ev-dia"><b>${Number(e.dia.slice(8))}</b>${esc(TF_MESES[Number(e.dia.slice(5, 7)) - 1].slice(0, 3).toUpperCase())}</span><i class="db-ev-cor" style="background:${attr(e.cor)}"></i><span class="db-ev-txt"><b>${esc(e.titulo)}</b><small>${e.diaInteiro ? 'Dia inteiro' : esc(e.horaInicio)} · ${esc((e.segmentos || []).map(dbSegNome).join(', ') || 'Geral')}</small></span></button></li>`).join('')}</ul>` : '<div class="empty compact">Nenhum evento escolar nos próximos dias.</div>');
}

PAGINAS.hoje = async function () {
  const f = Filtros.get(), hoje = hojeBR(), filtroPerfil = f.perfil;
  const mais45 = tfSomaDias(hoje, 45);
  const [d, g, seguidores, ev] = await Promise.all([
    api('/dashboard/resumo?' + Filtros.query()),
    api('/instagram/geral?' + Filtros.query()).catch(() => null),
    api('/instagram/visao?' + new URLSearchParams({ de: DB_SEGUIDORES_INICIO, ate: hoje, ...(filtroPerfil ? { perfil: filtroPerfil } : {}) }).toString()).catch(() => null),
    api(`/agenda/eventos?de=${hoje}&ate=${mais45}`).catch(() => null),
  ]);
  const ig = d.instagram, t = d.trafego, serieSeguidores = dbSegDados(seguidores);
  const igOn = ig.conectado || (g && g.contas && g.contas.length);
  // ---- faixa de indicadores (só dados reais; sem fonte, aparece “—” e o motivo) ----
  const semIg = dbNota('Instagram não conectado'), semTr = dbNota(t.disponivel ? '' : 'Tráfego indisponível');
  const sg = g?.seguidores, a = g?.atual, ant = g?.anterior;
  const cartoes = [
    dbCard('◎', 'Seguidores', sg && sg.atual !== null ? fmtN(sg.atual) : '—', !g || sg.atual === null ? (igOn ? dbNota('Sem histórico ainda') : semIg) : (sg.base ? dbDif(sg.atual, sg.base) + (sg.completo ? '' : dbNota('desde ' + fmtDate(sg.desde))) : dbNota('sem base de comparação'))),
    dbCard('◉', 'Alcance', a && a.alcance !== null ? fmtN(a.alcance) : '—', a ? (a.alcance === null ? dbNota('a Meta não informou') : dbDif(a.alcance, ant.alcance)) : semIg),
    dbCard('✉', 'Interações', a ? fmtN(a.interacoes) : '—', a ? dbDif(a.interacoes, ant.interacoes) : semIg),
    dbCard('＄', 'Investimento (anúncios)', t.disponivel ? money(t.atual.investimento) : '—', t.disponivel ? (t.variacoes ? delta(t.variacoes.investimento, { bomSubir: true }) : dbNota('última sincronização')) : semTr),
    dbCard('✆', 'Conversas iniciadas', t.disponivel ? fmtN(t.atual.conversas) : '—', t.disponivel ? (t.variacoes ? delta(t.variacoes.conversas, { bomSubir: true }) : '') : semTr),
    dbCard('◎', 'Custo por conversa', t.disponivel && t.atual.custoConversa !== null ? money(t.atual.custoConversa) : '—', t.disponivel ? (t.variacoes ? delta(t.variacoes.custoConversa, { bomSubir: false }) : '') : semTr),
  ].join('');
  // ---- blocos ----
  const recentes = (d.recentes || []).length ? `<div class="db-recentes">${d.recentes.map(r => `<article class="db-rec">${r.link ? `<a href="${attr(r.link)}" target="_blank" rel="noopener noreferrer" class="db-rec-img" aria-label="Abrir no Instagram">${dbMini(r.miniatura, r.titulo || r.legenda)}</a>` : `<span class="db-rec-img">${dbMini(r.miniatura, r.titulo || r.legenda)}</span>`}<b>${esc(r.titulo || r.legenda || '(sem legenda)')}</b><small>${esc(r.formato)} · ${esc(fmtDate(String(r.quando).slice(0, 10)))}${r.perfil ? ' · @' + esc(r.perfil.replace(/^@/, '')) : ''}</small><small>${fmtN(r.interacoes)} interações</small></article>`).join('')}</div>` : `<div class="empty compact">${igOn ? 'Nenhuma publicação do Instagram sincronizada neste período.' : 'Instagram não conectado. Conecte em Configurações › Instagram.'}</div>`;
  const campAtivas = t.disponivel && (t.campanhasAtivas || []).length ? `<ul class="db-camp">${t.campanhasAtivas.map(c => `<li><span class="db-camp-img">${dbMini(c.miniatura, c.nome)}</span><div><b>${esc(c.nome)}</b> <span class="badge ok">${esc(c.statusRotulo || 'Ativo')}</span><small>${money(c.investimento)}</small><small>${fmtN(c.conversas)} conversa(s) · ${c.custoConversa === null ? 'sem custo por conversa' : money(c.custoConversa) + ' por conversa'}</small></div></li>`).join('')}</ul>` : `<div class="empty compact">${t.disponivel ? 'Nenhuma campanha ativa com veiculação neste período.' : esc(t.motivo || 'Tráfego Pago indisponível agora.')}</div>`;
  const mp = ig.melhor;
  const melhor = mp ? `<div class="db-melhor">${mp.miniatura ? `<img src="${attr(mp.miniatura)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<div class="db-sem-img">Sem imagem</div>'}<div><span class="badge">${esc(mp.formato)}</span><p>${esc(mp.tituloConteudo || mp.legenda || '(sem legenda)')}</p><small>${fmtN(mp.interacoes)} interações${mp.alcance !== null && mp.alcance !== undefined ? ' · ' + fmtN(mp.alcance) + ' de alcance' : ''}</small></div></div>` : '<div class="empty compact">Nenhuma publicação sincronizada neste período.</div>';
  const insights = d.insights.length ? d.insights.map(i => `<div class="insight"><b>${esc(i.titulo)}</b><p>${esc(i.texto)}</p><small>Fonte: ${esc(i.fonte)} · amostra: ${esc(i.amostra)}</small><button class="btn soft" data-go="${i.link.pagina}">${esc(i.link.rotulo)}</button></div>`).join('') : '<div class="empty compact">Ainda não há dados suficientes para análises neste período.</div>';
  const integ = d.integracoes.map(x => `<li><span class="db-int-nome"><b>${esc(x.nome)}</b><small>${x.ultimaSync ? 'Última sincronização: ' + esc(fmtDateTime(x.ultimaSync)) : 'Ainda sem sincronização'}</small></span><span class="badge ${x.conectado ? 'ok' : x.problema ? 'warn' : 'mute'}">${x.conectado ? 'Conectado' : x.problema ? 'Reconectar' : 'Não conectado'}</span></li>`).join('');
  const alertas = d.alertas.length ? d.alertas.map(x => `<div class="alerta-int"><b>${esc(x.nome)}</b><span>${esc(x.msg)}</span><button class="btn soft" data-go="${x.pagina}">Resolver</button></div>`).join('') : '';
  const dias = t.disponivel && t.diario ? t.diario.dias.map((x, i) => ({ x, total: t.diario.total[i] })) : [];

  $('#content').innerHTML = `<div class="db">${dbFaixa()}
    <div class="kpis kpis6 db-kpis">${cartoes}</div>
    <div class="db2"><div class="db2-main">
      <div class="db-duas">
        <section class="card" aria-labelledby="dbSeg"><div class="db-tit"><h2 id="dbSeg">Evolução de seguidores</h2>${origem(ig.origem)}<button class="btn soft" data-go="igvisao">Ver Instagram</button></div>
          ${serieSeguidores.length > 1 ? '<div id="dbChSeg"></div>' : '<div class="empty compact">O histórico de seguidores começou na primeira sincronização; ainda há menos de 2 registros.</div>'}
          <details class="tf-tabela"><summary>Ver como tabela</summary><div class="pills" role="group" aria-label="Agrupar seguidores por período">${DB_SEG_MODOS.map(([k, rot]) => `<button type="button" class="pill ${DB_SEG_MODO === k ? 'on' : ''}" data-db-seg="${k}">${rot}</button>`).join('')}</div><div id="dbSegTabela">${dbSegTabela(serieSeguidores, DB_SEG_MODO)}</div></details>
          <p class="kpi-note">Histórico desde 11/10/2026 · ${esc(filtroPerfil || 'Todos os perfis')}. Os dados anteriores à primeira sincronização não são reconstruídos.</p></section>
        <section class="card" aria-labelledby="dbTr"><div class="db-tit"><h2 id="dbTr">Investimento diário · Tráfego Pago</h2>${origem(t.origem)}<button class="btn soft" data-go="trafego">Ver Tráfego Pago</button></div>
          ${dias.length ? '<div id="dbChTr"></div>' : `<div class="empty compact">${t.disponivel ? 'Sem investimento por dia neste período.' : esc(t.motivo || 'Tráfego Pago indisponível agora.')}</div>`}
          ${t.semEfeito?.length ? '<p class="kpi-note">O filtro de perfil não existe na Meta Ads; os anúncios mostram a conta inteira.</p>' : ''}</section>
      </div>
      <section class="card" aria-labelledby="dbRec"><div class="db-tit"><h2 id="dbRec">Conteúdos recentes</h2><button class="btn soft" data-go="igconteudos">Ver todos</button></div>${recentes}</section>
      <section class="card" aria-labelledby="dbCamp"><div class="db-tit"><h2 id="dbCamp">Campanhas ativas</h2><small>somente consulta</small><button class="btn soft" data-go="tfdesempenho">Ver todas</button></div>${campAtivas}</section>
      <div class="db-duas">
        <section class="card" aria-labelledby="dbMel"><div class="db-tit"><h2 id="dbMel">Destaque do período</h2>${origem(ig.origem)}</div>${melhor}</section>
        <section class="card" aria-labelledby="dbIns"><div class="db-tit"><h2 id="dbIns">Análises e oportunidades</h2><small>até 3, calculados dos seus dados</small></div>${insights}</section>
      </div></div>
      <aside class="db2-lado">
        <section class="card" aria-labelledby="dbEv"><div class="db-tit"><h2 id="dbEv">Próximos eventos escolares</h2><button class="btn soft" data-go="calendario">Ver calendário</button></div>${dbEventos(ev)}</section>
        <section class="card" aria-labelledby="dbInt"><div class="db-tit"><h2 id="dbInt">Integrações</h2><button class="btn soft" data-go="configuracoes">Gerenciar</button></div><ul class="db-int">${integ}</ul>${alertas || '<div class="ok-txt">Nenhum ponto de atenção.</div>'}</section>
      </aside></div></div>`;
  bindGoButtons();
  if (serieSeguidores.length > 1 && $('#dbChSeg')) EvoCharts.linha($('#dbChSeg'), { dados: serieSeguidores.map(x => ({ x: x.dia, seguidores: x.valor })), series: [{ k: 'seguidores', nome: 'Seguidores' }], zero: false, altura: 220, rotuloAcessivel: 'Seguidores por dia' });
  if (dias.length && $('#dbChTr')) EvoCharts.linha($('#dbChTr'), { dados: dias, series: [{ k: 'total', nome: 'Investimento', cor: '#063996', fmt: money }], altura: 220, rotuloAcessivel: 'Investimento diário em anúncios' });
  $$('[data-db-seg]').forEach(b => b.onclick = () => {
    DB_SEG_MODO = b.dataset.dbSeg;
    $$('[data-db-seg]').forEach(x => x.classList.toggle('on', x.dataset.dbSeg === DB_SEG_MODO));
    $('#dbSegTabela').innerHTML = dbSegTabela(serieSeguidores, DB_SEG_MODO);
  });
};
