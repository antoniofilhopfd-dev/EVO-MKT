import { Ctx } from '../ctx';
import { requireInternal } from '../auth';
import { etapaDe } from '../fluxo';
import { listRows } from '../records';
import { addDays, fail, fmtDate, parseLocal, Row, strv } from '../util';
import { json } from './handlers';
import { prazoEfetivo } from './solicitacoes';
import { situacaoDe } from './planejamento';

/** Dashboard: só números e listas calculados dos registros reais (nada estimado, nenhum segundo gerenciador de tarefas). */
const somar = (s: string, n: number) => fmtDate(addDays(parseLocal(s + 'T12:00:00'), n));

export async function dashboardRoute(c: Ctx): Promise<Response> {
  const u = await requireInternal(c);
  if (c.path !== '/dashboard/resumo') return fail(404, 'Rota não encontrada.');
  const hoje = fmtDate(new Date());
  const dow = parseLocal(hoje + 'T12:00:00').getDay();
  const semIni = somar(hoje, -dow), semFim = somar(semIni, 6);

  const sols = await listRows('solicitacoes');
  const abertas = sols.filter((s) => etapaDe(strv(s.status)) !== 'CONCLUIDO');
  const cont = (e: string) => abertas.filter((s) => etapaDe(strv(s.status)) === e).length;
  const atrasadas = abertas.filter((s) => prazoEfetivo(s) !== '' && prazoEfetivo(s) < hoje);
  const resumoSol = (s: Row) => ({ id: s.id, titulo: s.titulo, responsavel: strv(s.responsavel), prazo: prazoEfetivo(s), etapa: etapaDe(strv(s.status)) });

  // próximos compromissos (7 dias): reuniões, coberturas e compromissos do Calendário de Marketing e da Agenda
  const limite = somar(hoje, 7);
  const compromissos: Row[] = [];
  for (const mod of ['calendario', 'agenda']) {
    for (const r of await listRows(mod)) {
      const bruto = strv(r.inicioEm || r.dataInicio);
      const data = bruto.slice(0, 10);
      if (!data || data < hoje || data > limite || /CANCEL/i.test(strv(r.status))) continue;
      let hora = bruto.length > 10 ? bruto.slice(11, 16) : '';
      if (hora === '00:00' || /^s/i.test(strv(r.diaInteiro))) hora = '';
      compromissos.push({ id: r.id, titulo: r.titulo, data, hora, tipo: strv(r.tipoItem) || 'Compromisso' });
    }
  }
  compromissos.sort((a, b) => String(a.data + (a.hora || '')).localeCompare(String(b.data + (b.hora || ''))));

  const eventos = (await listRows('calescolar')).filter((e) => strv(e.dataFim || e.dataInicio) >= hoje).sort((a, b) => strv(a.dataInicio).localeCompare(strv(b.dataInicio))).slice(0, 5)
    .map((e) => ({ id: e.id, titulo: e.titulo, data: e.dataInicio, fim: e.dataFim, horaInicio: e.horaInicio ?? '', local: e.local ?? '' }));

  const acoes = (await listRows('projetos')).filter((p) => situacaoDe(p) !== 'FINALIZADO' && strv(p.arquivada) !== 'SIM' && strv(p.dataInicio) && strv(p.dataInicio) <= semFim && (strv(p.prazo) || strv(p.dataInicio)) >= semIni)
    .sort((a, b) => strv(a.dataInicio).localeCompare(strv(b.dataInicio))).slice(0, 8)
    .map((p) => ({ id: p.id, titulo: p.titulo, dataInicio: p.dataInicio, dataFim: strv(p.prazo) || p.dataInicio, responsavel: strv(p.responsavel), situacao: situacaoDe(p) }));

  const desde = somar(hoje, -14);
  const entregas = sols.filter((s) => etapaDe(strv(s.status)) === 'CONCLUIDO' && strv(s.status).toUpperCase() === 'CONCLUÍDA')
    .map((s) => ({ s, quando: strv(s.concluidoEm || s.aprovadoSolicitanteEm || s.atualizadoEm).slice(0, 10) }))
    .filter((x) => x.quando >= desde).sort((a, b) => b.quando.localeCompare(a.quando)).slice(0, 6)
    .map((x) => ({ id: x.s.id, titulo: x.s.titulo, responsavel: strv(x.s.responsavel), quando: x.quando }));

  return json({
    hoje, semana: { ini: semIni, fim: semFim }, eu: { nome: u.nome, role: u.role },
    solicitacoes: { pendentes: cont('PENDENTE'), emAndamento: cont('EM_ANDAMENTO'), emAprovacao: cont('EM_APROVACAO'), atrasadas: atrasadas.length, listaAtrasadas: atrasadas.sort((a, b) => prazoEfetivo(a).localeCompare(prazoEfetivo(b))).slice(0, 5).map(resumoSol) },
    compromissos: compromissos.slice(0, 8), eventosEscolares: eventos, acoesDaSemana: acoes, entregasRecentes: entregas,
  });
}
