import { Ctx } from '../ctx';
import { q } from '../db';
import { allowedSegment, requireInternal, requireManager, requirePortal } from '../auth';
import { fluxoPublico, FINAL_SOLICITACAO } from '../fluxo';
import { getRow, listRows } from '../records';
import { diasUteisEntre, HistRow, hojeLocal, periodosPorStatus, slaInfo } from '../sla';
import { addDays, env, fail, fmtDate, Row } from '../util';
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
      quando: h.quando, tipo: h.campo === 'responsavel' ? 'responsavel' : 'status',
      ator: portal && interno ? 'Marketing' : h.ator,
      texto: h.campo === 'responsavel' ? `Responsável: ${h.de} → ${h.para}` : h.de ? `Status: ${h.de} → ${h.para}` : `Registrada com status ${h.para}`,
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
      porSegmento: agrupa(recebidas, (r) => String(r.segmento)), porTipo: agrupa(recebidas, (r) => String(r.tipoSolicitacao)),
      porEtapa, cargaPorPessoa: carga, motivosBloqueio: motivos,
    },
  };
}
