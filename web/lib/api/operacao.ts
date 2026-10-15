import { Ctx } from '../ctx';
import { verificarIntegridade } from '../integridade';
import { gerarLegendas } from '../ia';
import { rateCheck, rateFail } from '../auth';
import { melhoresHorarios, proximasDatas, rankingConteudos, saudePorSegmento } from '../insights';
import { listarNotificacoes } from '../notificacoes';
import { run } from '../db';
import { q, q1 } from '../db';
import { allowedSegment, requireInternal, requireManager, requirePortal } from '../auth';
import { fluxoPublico, FINAL_SOLICITACAO } from '../fluxo';
import { audit, getRow, listRows } from '../records';
import { setSetting, setting } from '../settings';
import { diasUteisEntre, HistRow, hojeLocal, periodosPorStatus, slaInfo } from '../sla';
import { addDays, env, fail, fmtDate, localParts, now, Row } from '../util';
import { contasMonitoradas, igContaValida } from '../integrations/meta';
import { json } from './handlers';

const ymd = (s: unknown) => String(s ?? '').slice(0, 10);
const aberta = (r: Row) => !FINAL_SOLICITACAO.includes(String(r.status ?? '').toUpperCase());
const media = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : 0);

async function historicoPorRegistro(mod: string): Promise<Map<string, (HistRow & { registro: string })[]>> {
  const m = new Map<string, (HistRow & { registro: string })[]>();
  for (const h of await q('SELECT registro,campo,de,para,quando,ator,motivo FROM status_history WHERE modulo=? ORDER BY id', [mod])) {
    if (!m.has(h.registro)) m.set(h.registro, []);
    m.get(h.registro)!.push(h as any);
  }
  return m;
}

/** Linha do tempo de um registro: mudanças de status/responsável + eventos de auditoria. */
async function timeline(mod: string, id: string, portal: boolean): Promise<Row[]> {
  const out: Row[] = [];
  for (const h of await q('SELECT campo,de,para,quando,ator,motivo FROM status_history WHERE modulo=? AND registro=? ORDER BY id', [mod, id])) {
    const interno = !String(h.ator).startsWith('portal:');
    out.push({
      quando: h.quando, tipo: h.campo === 'status' ? 'status' : h.campo === 'responsavel' ? 'responsavel' : 'prazo',
      ator: portal && interno ? 'Marketing' : h.ator,
      texto: h.campo === 'responsavel' ? `Responsável: ${h.de} → ${h.para}` : h.campo === 'prazo' ? `Prazo: ${h.de} → ${h.para}` : h.campo === 'publicacaoEm' ? `Publicação: ${h.de} → ${h.para}` : h.de ? `Status: ${h.de} → ${h.para}` : `Registrada com status ${h.para}`,
      motivo: h.motivo,
    });
  }
  if (!portal) {
    const map: Record<string, string> = { criar: 'Criada', editar: 'Editada', 'upload': 'Anexo enviado', 'upload-entrega': 'Entrega enviada', lixeira: 'Excluída' };
    for (const a of await q("SELECT quando,ator,acao FROM audit_log WHERE modulo=? AND registro=? AND acao IN ('criar','editar','upload','upload-entrega','lixeira') ORDER BY id", [mod, id]))
      out.push({ quando: a.quando, tipo: 'evento', ator: a.ator, texto: map[a.acao] ?? a.acao, motivo: '' });
  }
  return out.sort((a, b) => String(a.quando).localeCompare(String(b.quando)));
}

export async function operacaoRoute(c: Ctx) {
  const { path } = c;
  if (path === '/fluxo') {
    // regras de status (fonte única): qualquer sessão válida (equipe ou Portal)
    try { await requireInternal(c); } catch { await requirePortal(c); }
    return json(fluxoPublico());
  }
  if (path === '/timeline') {
    await requireInternal(c);
    const mod = c.qs('module'), id = c.qs('id');
    if (!(await getRow(mod, id))) fail(404, 'Registro não encontrado.');
    return json({ rows: await timeline(mod, id, false) });
  }
  if (path === '/portal/timeline') {
    const u = await requirePortal(c);
    const id = c.qs('id');
    const r = (await getRow('solicitacoes', id)) ?? fail(404, 'Demanda não encontrada.');
    if (!allowedSegment(u, r.segmento ?? '')) fail(403, 'Demanda de outro segmento.');
    const hist = await q('SELECT campo,de,para,quando FROM status_history WHERE modulo=? AND registro=? ORDER BY id', ['solicitacoes', id]);
    return json({ rows: await timeline('solicitacoes', id, true), sla: slaPublico(slaInfo(r, hist as any, hojeLocal())) });
  }
  if (path === '/sla') {
    await requireInternal(c);
    const id = c.qs('id');
    const r = (await getRow('solicitacoes', id)) ?? fail(404, 'Demanda não encontrada.');
    const hist = await q('SELECT campo,de,para,quando FROM status_history WHERE modulo=? AND registro=? ORDER BY id', ['solicitacoes', id]);
    return json(slaInfo(r, hist as any, hojeLocal()));
  }
  if (path === '/notificacoes') {
    const u = await requireInternal(c);
    const rows = await listarNotificacoes(String(u.nome), u.role === 'manager');
    return json({ rows, naoLidas: rows.filter((r: Row) => !r.lida).length });
  }
  if (path === '/notificacoes/lida' && c.method === 'POST') {
    const u = await requireInternal(c);
    const b = await c.body();
    const ids = Array.isArray(b.ids) ? b.ids.map(Number).filter(Boolean) : [];
    const dest = u.role === 'manager' ? "destino IN ('gerencia',?) OR destino LIKE 'portal:%'" : 'destino=?';
    if (b.todas) await run(`UPDATE notifications SET lida=1 WHERE ${dest}`, [String(u.nome)]);
    else if (ids.length) await run(`UPDATE notifications SET lida=1 WHERE id IN (${ids.map(() => '?').join(',')}) AND (${dest})`, [...ids, String(u.nome)]);
    return json({ ok: true });
  }
  if (path === '/ia/legenda' && c.method === 'POST') {
    const u = await requireInternal(c);
    const b = await c.body();
    const mod = String(b.modulo ?? '');
    if (!['conteudos', 'ideias', 'solicitacoes'].includes(mod)) fail(400, 'Módulo não permitido.');
    const reg = (await getRow(mod, String(b.id ?? ''))) ?? fail(404, 'Registro não encontrado.');
    await rateCheck('ia:' + u.codigo, 12); // no máximo 12 pedidos a cada 15 minutos por pessoa (custo e abuso)
    await rateFail('ia:' + u.codigo);
    const opcoes = await gerarLegendas(reg, String(b.instrucao ?? ''));
    await audit(String(u.codigo), 'ia-legenda', mod, String(reg.id));
    return json({ opcoes });
  }
  if (path === '/admin/integridade') {
    await requireManager(c);
    return json(await verificarIntegridade());
  }
  if (path === '/insights') {
    await requireManager(c);
    return json({ saude: await saudePorSegmento(), datas: proximasDatas(90), horarios: await melhoresHorarios(await igContaValida(c.qs('conta'))), ranking: await rankingConteudos(8, await igContaValida(c.qs('conta'))) });
  }
  if (path === '/studio/modelos') {
    await requireInternal(c);
    if (c.method === 'GET') {
      let modelos: unknown = [];
      try { modelos = JSON.parse((await setting('studio_modelos')) || '[]'); } catch { /* guardado inválido */ }
      return json({ modelos });
    }
    if (c.method !== 'POST') return fail(405, 'Método não permitido.');
    const b = await c.body();
    const lista = Array.isArray(b.modelos) ? b.modelos : fail(400, 'Envie a lista de modelos.');
    if (lista.length > 50) fail(400, 'No máximo 50 modelos.');
    const limpos = lista.map((m: any) => {
      const nome = String(m?.nome ?? '').trim().slice(0, 60);
      if (!nome) fail(400, 'Todo modelo precisa de um nome.');
      return { nome, legenda: String(m?.legenda ?? '').slice(0, 2200), cta: String(m?.cta ?? '').slice(0, 160), hashtags: String(m?.hashtags ?? '').slice(0, 600) };
    });
    await setSetting('studio_modelos', JSON.stringify(limpos));
    return json({ ok: true, modelos: limpos });
  }
  if (path === '/instagram/seguidores/manual' && c.method === 'POST') {
    const u = await requireManager(c);
    const b = await c.body();
    const conta = await igContaValida(String(b.conta ?? '')), mes = String(b.mes ?? '').trim(), n = Math.floor(Number(b.seguidores));
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) fail(400, 'Informe o mês no formato AAAA-MM.');
    if (!Number.isFinite(n) || n < 0 || n > 100000000) fail(400, 'Número de seguidores inválido.');
    const [y, m] = mes.split('-').map(Number);
    const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const hoje = fmtDate(new Date());
    const dia = `${mes}-${String(ultimo).padStart(2, '0')}`;
    const alvo = dia > hoje ? hoje : dia;
    if (await q1('SELECT 1 FROM ig_seguidores WHERE conta=? AND dia LIKE ? AND atualizado_em NOT LIKE ?', [conta, mes + '%', 'manual%'])) fail(409, 'Esse mês já tem registro automático do sistema; o número manual só vale para meses sem registro.');
    await run('INSERT INTO ig_seguidores(conta,dia,seguidores,seguindo,midias,atualizado_em) VALUES(?,?,?,0,0,?) ON DUPLICATE KEY UPDATE seguidores=VALUES(seguidores),atualizado_em=VALUES(atualizado_em)', [conta, alvo, n, 'manual ' + now()]);
    await audit(String(u.codigo), 'ig-seguidores-manual', 'instagram', mes);
    return json({ ok: true });
  }
  if (path === '/instagram/relatorio') {
    await requireManager(c);
    const lp = localParts(new Date());
    const mes = /^\d{4}-\d{2}$/.test(c.qs('mes')) ? c.qs('mes') : `${lp.y}-${String(lp.m).padStart(2, '0')}`;
    const [y, m] = mes.split('-').map(Number);
    const ant = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
    const conta = await igContaValida(c.qs('conta'));
    const linhas = (await listRows('instagram')).filter((r) => r.origem === 'INSTAGRAM_API' && String(r.idExterno ?? conta) === conta);
    const pega = (per: string) => linhas.find((r) => r.periodo === per) ?? null;
    const posts = (await q('SELECT media_id,publicado_em,tipo,legenda,curtidas,comentarios,salvos,compartilhamentos,alcance,miniatura,permalink FROM ig_posts WHERE conta=? AND publicado_em LIKE ? ORDER BY publicado_em DESC', [conta, mes + '%'])).map((p) => ({ ...p, interacoes: Number(p.curtidas) + Number(p.comentarios) + Number(p.salvos) + Number(p.compartilhamentos) }));
    const seg = async (per: string) => (await q1('SELECT seguidores FROM ig_seguidores WHERE conta=? AND dia LIKE ? ORDER BY dia DESC LIMIT 1', [conta, per + '%']))?.seguidores ?? null;
    return json({ mes, anterior: ant, atual: pega(mes), anteriorMetricas: pega(ant), seguidores: await seg(mes), seguidoresAnterior: await seg(ant), posts: posts.sort((a, b) => b.interacoes - a.interacoes), conta: (await contasMonitoradas()).find((x) => x.ig === conta)?.usuario ?? '' });
  }
  if (path === '/instagram/contas') {
    await requireInternal(c);
    return json({ contas: await contasMonitoradas(), principal: await setting('ig_user_id') });
  }
  if (path === '/instagram/seguidores') {
    await requireInternal(c);
    const conta = await igContaValida(c.qs('conta'));
    const snaps = await q('SELECT dia,seguidores FROM ig_seguidores WHERE conta=? ORDER BY dia', [conta]);
    const ult = (chave: (d: string) => string) => {
      const m = new Map<string, number>();
      for (const s of snaps) m.set(chave(String(s.dia)), Number(s.seguidores)); // ordenado: o último do período vence
      const ks = [...m.keys()];
      return ks.map((k, i) => ({ periodo: k, seguidores: m.get(k)!, variacao: i ? m.get(k)! - m.get(ks[i - 1])! : null }));
    };
    return json({ mensal: ult((d) => d.slice(0, 7)), anual: ult((d) => d.slice(0, 4)), primeiroRegistro: snaps[0]?.dia ?? '', atual: snaps.length ? Number(snaps[snaps.length - 1].seguidores) : null });
  }
  if (path === '/instagram/posts') {
    await requireInternal(c);
    const conta = await igContaValida(c.qs('conta'));
    const rows = (await q('SELECT media_id,publicado_em,tipo,legenda,curtidas,comentarios,salvos,compartilhamentos,alcance,miniatura,permalink FROM ig_posts WHERE conta=? ORDER BY publicado_em DESC LIMIT 1000', [conta])).map((p) => {
      const interacoes = Number(p.curtidas) + Number(p.comentarios) + Number(p.salvos) + Number(p.compartilhamentos);
      const alcance = p.alcance === null || p.alcance === undefined ? null : Number(p.alcance);
      return {
        id: p.media_id, quando: p.publicado_em, tipo: p.tipo, legenda: p.legenda, curtidas: Number(p.curtidas), comentarios: Number(p.comentarios),
        salvos: Number(p.salvos), compartilhamentos: Number(p.compartilhamentos), alcance, interacoes,
        engajamento: alcance ? Math.round((interacoes / alcance) * 1000) / 10 : null, miniatura: p.miniatura, link: p.permalink,
      };
    });
    return json({ rows, conta, contas: await contasMonitoradas(), ultimaSync: await setting('ig_last_sync') });
  }
  if (path === '/studio/hashtags') {
    const u = await requireInternal(c);
    if (c.method === 'GET') {
      let grupos: unknown = [];
      try { grupos = JSON.parse((await setting('studio_hashtags')) || '[]'); } catch { /* guardado inválido: lista vazia */ }
      return json({ grupos });
    }
    if (c.method !== 'POST') return fail(405, 'Método não permitido.');
    const b = await c.body();
    const lista = Array.isArray(b.grupos) ? b.grupos : fail(400, 'Envie a lista de grupos.');
    if (lista.length > 30) fail(400, 'No máximo 30 grupos de hashtags.');
    const limpos = lista.map((g: any) => {
      const nome = String(g?.nome ?? '').trim().slice(0, 40);
      const tags = (Array.isArray(g?.tags) ? g.tags : []).map((t: any) => String(t).trim()).filter((t: string) => /^#[\p{L}\p{N}_]{1,60}$/u.test(t)).slice(0, 30);
      if (!nome) fail(400, 'Todo grupo precisa de um nome.');
      return { nome, tags: [...new Set(tags)] };
    });
    await setSetting('studio_hashtags', JSON.stringify(limpos));
    await audit(String(u.codigo), 'studio-hashtags');
    return json({ ok: true, grupos: limpos });
  }
  if (path === '/datas') {
    await requireInternal(c);
    return json({ rows: proximasDatas(Number(c.qs('dias')) || 90) });
  }
  if (path === '/indicadores') {
    await requireManager(c);
    return json(await indicadores(c));
  }
  return fail(404, 'Rota não encontrada.');
}

/** O Portal vê o prazo e o estado, não a contabilidade interna. */
function slaPublico(s: ReturnType<typeof slaInfo>) {
  return { vencimento: s.vencimento, estado: s.estado, negociado: s.negociado, restantesDiasUteis: s.restantesDiasUteis };
}

async function indicadores(c: Ctx): Promise<Row> {
  const hoje = hojeLocal();
  const ate = ymd(c.qs('ate')) || hoje;
  const de = ymd(c.qs('de')) || fmtDate(addDays(new Date(), -30));
  const fSeg = c.qs('segmento'), fResp = c.qs('responsavel'), fTipo = c.qs('tipo');
  const noPeriodo = (d: string) => !!d && d >= de && d <= ate;
  const todas = await listRows('solicitacoes');
  const sols = todas.filter((r) => (!fSeg || r.segmento === fSeg) && (!fResp || r.responsavel === fResp) && (!fTipo || r.tipoSolicitacao === fTipo));
  const H = await historicoPorRegistro('solicitacoes');
  const histDe = (id: string) => H.get(id) ?? [];
  const info = new Map(sols.map((r) => [r.id, slaInfo(r, histDe(r.id), hoje)]));
  const ids = (xs: Row[]) => xs.slice(0, 200).map((r) => r.id as string);
  const ind: Row[] = [];
  const add = (id: string, titulo: string, lista: Row[], definicao: string, extra: Row = {}) => ind.push({ id, titulo, valor: lista.length, ids: ids(lista), modulo: 'solicitacoes', definicao, ...extra });

  const recebidas = sols.filter((r) => noPeriodo(ymd(r.criadoEm)));
  add('recebidas', 'Solicitações recebidas', recebidas, 'Demandas criadas no período (data de criação).');
  add('distribuidas', 'Distribuídas no período', sols.filter((r) => noPeriodo(ymd(r.distribuidoEm))), 'Demandas com data de distribuição no período.');
  const concluidasPer = sols.filter((r) => info.get(r.id)!.fim && noPeriodo(info.get(r.id)!.fim) && String(r.status).toUpperCase() === 'CONCLUÍDA');
  add('concluidas', 'Concluídas no período', concluidasPer, 'Demandas cuja transição para CONCLUÍDA ocorreu no período.');
  const abertas = sols.filter(aberta);
  add('abertas', 'Demandas abertas agora', abertas, 'Todas as demandas que não estão CONCLUÍDA nem CANCELADA (situação atual, ignora o período).');
  add('aguardandoTriagem', 'Aguardando triagem', abertas.filter((r) => ['AGUARDANDO TRIAGEM', 'NOVA'].includes(String(r.status).toUpperCase())), 'Status AGUARDANDO TRIAGEM ou NOVA.');
  add('urgentesSemResponsavel', 'Urgentes sem responsável', abertas.filter((r) => String(r.prioridade).toUpperCase() === 'URGENTE' && !String(r.responsavel ?? '').trim()), 'Prioridade URGENTE, aberta e sem responsável.');
  add('slaVencido', 'SLA vencido', abertas.filter((r) => info.get(r.id)!.estado === 'vencido'), 'Aberta e com vencimento (dias úteis) anterior a hoje; demandas pausadas não entram.');
  add('slaAtencao', 'SLA vence em até 1 dia útil', abertas.filter((r) => info.get(r.id)!.estado === 'atencao'), 'Aberta e com 0 ou 1 dia útil restante.');
  add('slaPausado', 'SLA pausado (aguardando solicitante)', abertas.filter((r) => info.get(r.id)!.estado === 'pausado'), 'Status AGUARDANDO SOLICITANTE: o relógio está parado.');
  add('aguardandoAprovacao', 'Aguardando aprovação do solicitante', abertas.filter((r) => String(r.status).toUpperCase() === 'AGUARDANDO APROVAÇÃO DO SOLICITANTE'), 'Entrega enviada e ainda sem resposta do solicitante.');
  const reabertas = sols.filter((r) => histDe(r.id).some((h) => h.campo === 'status' && h.de === 'CONCLUÍDA' && noPeriodo(ymd(h.quando))));
  add('reabertas', 'Reabertas no período', reabertas, 'Demandas que saíram de CONCLUÍDA no período.');
  const devolvidas = sols.filter((r) => histDe(r.id).some((h) => h.campo === 'status' && noPeriodo(ymd(h.quando)) && (h.para === 'AGUARDANDO SOLICITANTE' || (h.de === 'AGUARDANDO APROVAÇÃO DO SOLICITANTE' && h.para === 'EM EXECUÇÃO'))));
  add('devolvidas', 'Devolvidas/ajustes no período', devolvidas, 'Pedidos de complementação enviados ao solicitante e ajustes solicitados após a entrega.');
  const redistrib = sols.filter((r) => histDe(r.id).some((h) => h.campo === 'responsavel' && noPeriodo(ymd(h.quando))));
  add('redistribuidas', 'Redistribuídas no período', redistrib, 'Demandas cujo responsável foi trocado no período (histórico de redistribuições).');
  const cumpridas = concluidasPer.filter((r) => info.get(r.id)!.estado === 'concluido_no_prazo').length;
  ind.push({ id: 'cumprimentoSla', titulo: 'Cumprimento do SLA', valor: concluidasPer.length ? Math.round((cumpridas / concluidasPer.length) * 100) : null, unidade: '%', ids: ids(concluidasPer), modulo: 'solicitacoes', definicao: 'Concluídas no período dentro do vencimento ÷ concluídas no período. Sem concluídas = sem dado (não 0%).', detalhe: `${cumpridas} de ${concluidasPer.length}` });
  const tempos = concluidasPer.map((r) => diasUteisEntre(info.get(r.id)!.inicio, info.get(r.id)!.fim));
  ind.push({ id: 'tempoAtendimento', titulo: 'Tempo médio de atendimento', valor: concluidasPer.length ? media(tempos) : null, unidade: 'dias úteis', ids: ids(concluidasPer), modulo: 'solicitacoes', definicao: 'Média de dias úteis entre o recebimento e a conclusão das demandas concluídas no período (inclui as pausas).' });
  const notas = sols.filter((r) => Number(r.avaliacaoNota) > 0 && noPeriodo(ymd(r.avaliadoEm || r.atualizadoEm)));
  ind.push({ id: 'avaliacao', titulo: 'Avaliação média do solicitante', valor: notas.length ? media(notas.map((r) => Number(r.avaliacaoNota))) : null, unidade: 'de 5', ids: ids(notas), modulo: 'solicitacoes', definicao: 'Média das notas de 1 a 5 registradas no período.' });

  const comNps = sols.filter((r) => String(r.npsNota ?? '') !== '' && noPeriodo(ymd(r.avaliadoEm || r.atualizadoEm)));
  const npsDe = (xs: Row[]) => { const n = xs.length, pro = xs.filter((r) => Number(r.npsNota) >= 9).length, det = xs.filter((r) => Number(r.npsNota) <= 6).length; return n ? Math.round(((pro - det) / n) * 100) : null; };
  ind.push({ id: 'nps', titulo: 'NPS do atendimento', valor: npsDe(comNps), unidade: 'pontos', ids: ids(comNps), modulo: 'solicitacoes', detalhe: comNps.length ? `${comNps.length} resposta(s)` : '', definicao: 'Pesquisa 0–10 (recomendaria o Marketing a um colega?): % de promotores (9–10) menos % de detratores (0–6), de -100 a 100. Sem respostas = sem dado.' });
  // tabelas
  const agrupa = (lista: Row[], chave: (r: Row) => string) => {
    const m = new Map<string, Row[]>();
    for (const r of lista) { const k = chave(r) || '—'; if (!m.has(k)) m.set(k, []); m.get(k)!.push(r); }
    return [...m.entries()].map(([k, v]) => ({ chave: k, total: v.length, ids: ids(v) })).sort((a, b) => b.total - a.total);
  };
  const porEtapaMap = new Map<string, number[]>();
  for (const r of sols) for (const p of periodosPorStatus(r, histDe(r.id), hoje)) if (noPeriodo(p.de) && !FINAL_SOLICITACAO.includes(p.status)) { (porEtapaMap.get(p.status) ?? porEtapaMap.set(p.status, []).get(p.status)!).push(Math.max(0, diasUteisEntre(p.de, p.ate))); }
  const porEtapa = [...porEtapaMap.entries()].map(([etapa, v]) => ({ etapa, mediaDiasUteis: media(v), ocorrencias: v.length })).sort((a, b) => b.mediaDiasUteis - a.mediaDiasUteis);
  // carga por pessoa (demandas + tarefas): é CARGA ATUAL, não medida de produtividade
  const tarefas = await listRows('tarefas');
  const limite = Number(env('LIMITE_SOBRECARGA', '8')) || 8;
  const pessoas = new Set<string>([...abertas.map((r) => String(r.responsavel ?? '').trim()), ...tarefas.map((r) => String(r.responsavel ?? '').trim())].filter(Boolean));
  const carga = [...pessoas].map((nome) => {
    const d = abertas.filter((r) => String(r.responsavel).trim() === nome);
    const t = tarefas.filter((r) => String(r.responsavel).trim() === nome && !/CONCLU|CANCEL/i.test(String(r.status)));
    const emAnd = t.filter((r) => /ANDAMENTO/i.test(String(r.status))).length;
    const atras = t.filter((r) => r.prazo && ymd(r.prazo) < hoje).length;
    const bloq = t.filter((r) => /BLOQUE/i.test(String(r.status))).length;
    const slaV = d.filter((r) => info.get(r.id)!.estado === 'vencido').length;
    const total = d.length + t.length;
    return { responsavel: nome, demandasAbertas: d.length, tarefasEmAndamento: emAnd, tarefasAbertas: t.length, tarefasAtrasadas: atras, bloqueadas: bloq, slaVencido: slaV, itensAbertos: total, sobrecarga: total > limite || atras >= 3 };
  }).sort((a, b) => b.itensAbertos - a.itensAbertos);
  const motivos = agrupa(tarefas.filter((r) => /BLOQUE/i.test(String(r.status)) || r.bloqueadoPor), (r) => String(r.bloqueadoPor || r.motivoBloqueio || 'Sem motivo informado'));
  return {
    periodo: { de, ate }, filtros: { segmento: fSeg, responsavel: fResp, tipo: fTipo }, geradoEm: hoje,
    regras: { diasUteis: 'segunda a sexta, exceto feriados informados em FERIADOS', pausa: 'AGUARDANDO SOLICITANTE', limiteSobrecarga: limite },
    indicadores: ind,
    tabelas: {
      npsPorSegmento: [...new Set(comNps.map((r) => String(r.segmento)))].map((seg) => ({ segmento: seg, nps: npsDe(comNps.filter((r) => r.segmento === seg)), respostas: comNps.filter((r) => r.segmento === seg).length })),
      porSegmento: agrupa(recebidas, (r) => String(r.segmento)), porTipo: agrupa(recebidas, (r) => String(r.tipoSolicitacao)),
      porEtapa, cargaPorPessoa: carga, motivosBloqueio: motivos,
    },
  };
}
