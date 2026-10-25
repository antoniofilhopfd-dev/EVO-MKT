/* Tráfego Pago: funções puras compartilhadas pelo painel (Visão Geral, Desempenho) e pelo relatório A4 (pré-visualização e PDF).
   Ficam num arquivo só para que filtros, totais, semanas e agrupamentos deem exatamente o mesmo número em todas as telas.
   Nada aqui toca a página (sem DOM) e nada escreve na Meta. */
const TF_SEGMENTOS = { INFANTIL: 'Educação Infantil', FUND1: 'Anos Iniciais', FUND2: 'Anos Finais', MEDIO: 'Ensino Médio', SEM: 'Sem segmento' };
const tfSegRotulo = k => TF_SEGMENTOS[k || 'SEM'] || k || 'Sem segmento';
const TF_STATUS_OPCOES = [['todos', 'Todos os status'], ['ativos', 'Ativos'], ['pausados', 'Pausados'], ['analise', 'Em análise'], ['problemas', 'Com problemas ou reprovados'], ['arquivados', 'Arquivados ou excluídos'], ['desconhecidos', 'Status indisponível']];

/** O status é o efetivo ATUAL informado pela Meta (nunca deduzido de métricas maiores que zero). */
function tfCabeStatus(status, filtro) {
  const s = String(status || '');
  if (!filtro || filtro === 'todos') return true;
  if (filtro === 'ativos') return s === 'ACTIVE';
  if (filtro === 'pausados') return ['PAUSED', 'CAMPAIGN_PAUSED', 'ADSET_PAUSED'].includes(s);
  if (filtro === 'analise') return ['PENDING_REVIEW', 'IN_PROCESS', 'PREAPPROVED'].includes(s);
  if (filtro === 'problemas') return ['WITH_ISSUES', 'DISAPPROVED', 'PENDING_BILLING_INFO'].includes(s);
  if (filtro === 'arquivados') return ['ARCHIVED', 'DELETED'].includes(s);
  return !s;
}

/** CTR, CPC e custo por conversa SEMPRE dos valores absolutos. Alcance não é aditivo: só vale o da conta, nunca a soma das linhas. */
function tfTotais(linhas, alcance = null) {
  const n = v => Number(v) || 0;
  const investimento = linhas.reduce((s, l) => s + n(l.investimento), 0), impressoes = linhas.reduce((s, l) => s + n(l.impressoes), 0);
  const cliques = linhas.reduce((s, l) => s + n(l.cliques), 0), conversas = linhas.reduce((s, l) => s + n(l.conversas), 0);
  return { investimento, impressoes, alcance, cliques, ctr: impressoes ? cliques / impressoes * 100 : null, cpc: cliques ? investimento / cliques : null, conversas, custoConversa: conversas ? investimento / conversas : null };
}

/** Aplica status, segmento, campanha e conjunto sobre as listas devolvidas pela API. `filtrado` diz se algum filtro está ativo (então o alcance total deixa de valer). */
function tfFiltrar(d, f = {}) {
  const norm = x => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const busca = norm(f.busca);
  // campanha: o filtro "campanha" compara pelo próprio id; conjuntos e anúncios, pela campanha a que pertencem
  const camp = (d.campanhas || []).filter(r => tfCabeStatus(r.status, f.status) && (!f.segmento || (r.segmento || 'SEM') === f.segmento) && (!f.campanha || r.id === f.campanha) && (!busca || norm(r.nome).includes(busca)));
  const conj = (d.conjuntos || []).filter(r => tfCabeStatus(r.status, f.status) && (!f.segmento || (r.segmento || 'SEM') === f.segmento) && (!f.campanha || r.campanhaId === f.campanha) && (!f.conjunto || r.id === f.conjunto) && (!busca || norm(r.nome).includes(busca) || norm(r.campanha).includes(busca)));
  const anun = (d.anuncios || []).filter(r => tfCabeStatus(r.status, f.status) && (!f.segmento || (r.segmento || 'SEM') === f.segmento) && (!f.campanha || r.campanhaId === f.campanha) && (!f.conjunto || r.conjuntoId === f.conjunto) && (!busca || norm(r.nome).includes(busca) || norm(r.campanha).includes(busca) || norm(r.conjunto).includes(busca)));
  const filtrado = !!(f.segmento || f.campanha || f.conjunto || (f.status && f.status !== 'todos') || busca);
  return { campanhas: camp, conjuntos: conj, anuncios: anun, filtrado };
}

/** Série diária (investimento por campanha) restrita às campanhas escolhidas; devolve também o total por dia. */
function tfSerieFiltrada(diario, campanhas) {
  const nomes = new Set(campanhas.map(c => c.nome));
  const series = diario.series.filter(s => nomes.has(s.nome));
  const total = diario.dias.map((_, i) => series.reduce((s, x) => s + (Number(x.valores[i]) || 0), 0));
  return { dias: diario.dias, series, total };
}

/* ---------- semanas (domingo a sábado) ---------- */
const tfSomaDias = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const tfDiaSemana = iso => new Date(iso + 'T12:00:00Z').getUTCDay(); // 0 = domingo
const tfInicioSemana = iso => tfSomaDias(iso, -tfDiaSemana(iso));
/** Semana epidemiológica (domingo a sábado): a semana 1 é a primeira que tem pelo menos 4 dias no novo ano. */
function tfSemanaEpi(iso) {
  const fimSemana = tfSomaDias(tfInicioSemana(iso), 6);
  const ano = Number(fimSemana.slice(0, 4)); // a semana pertence ao ano em que cai a maior parte dela
  const ini1 = ano2 => { const j1 = `${ano2}-01-01`, d = tfDiaSemana(j1); return d <= 3 ? tfSomaDias(j1, -d) : tfSomaDias(j1, 7 - d); };
  let anoSem = ano, base = ini1(ano);
  const inicio = tfInicioSemana(iso);
  if (inicio < base) { anoSem = ano - 1; base = ini1(anoSem); }
  else { const prox = ini1(ano + 1); if (inicio >= prox) { anoSem = ano + 1; base = prox; } }
  return { semana: Math.round((Date.parse(inicio + 'T12:00:00Z') - Date.parse(base + 'T12:00:00Z')) / 604800000) + 1, ano: anoSem };
}

/** Agrupa uma série diária em dia / semana (dom–sáb) / mês. Os totais por grupo somam exatamente o total do período. */
function tfAgrupar(dias, valores, modo) {
  if (modo === 'dia') return dias.map((d, i) => ({ chave: d, de: d, ate: d, valor: Number(valores[i]) || 0 }));
  const grupos = new Map();
  dias.forEach((d, i) => {
    const chave = modo === 'semana' ? tfInicioSemana(d) : d.slice(0, 7);
    const g = grupos.get(chave) ?? { chave, de: d, ate: d, valor: 0 };
    g.valor += Number(valores[i]) || 0; if (d < g.de) g.de = d; if (d > g.ate) g.ate = d; grupos.set(chave, g);
  });
  return [...grupos.values()];
}

/** Rótulo curto de um dia: 18/10. */
const tfDM = iso => iso.slice(8, 10) + '/' + iso.slice(5, 7);
const TF_MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const TF_DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
/** "Dom, 18 out" */
const tfDiaLongo = iso => `${TF_DIAS[tfDiaSemana(iso)]}, ${Number(iso.slice(8, 10))} ${TF_MESES[Number(iso.slice(5, 7)) - 1].slice(0, 3)}`;
