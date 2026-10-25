import { Ctx } from '../ctx';
import { requireAdmin, requireInternal } from '../auth';
import { audit } from '../records';
import { setting } from '../settings';
import { fail, Row, strv } from '../util';
import { gConnected } from '../integrations/google';
import { agendaAdicionar, agendaAtualizar, agendaPublica, agendaRemover, agendasCadastradas, agendasDaConta, agendasVerificar, ErroAgenda, eventoCriar, eventoEditar, eventoExcluir, eventosAgendas, eventosLegado, GRUPOS } from '../integrations/agendas';
import { json } from './handlers';

/**
 * Calendário Geral escolar e Agendas Google. Consulta: toda a equipe de Marketing. Criar, editar e excluir eventos: a equipe de Marketing,
 * SOMENTE na agenda marcada como editável (a do Marketing) e com escrita real no Google (conferido a cada alteração).
 * Cadastrar, ajustar e remover agendas: só o Administrador.
 */
export async function agendasRoute(c: Ctx): Promise<Response> {
  const { path, method } = c;
  const u = await requireInternal(c);
  try {
    if (path === '/agendas' && method === 'GET') {
      const ags = await agendasCadastradas();
      return json({
        agendas: ags.map(agendaPublica), grupos: GRUPOS.map(([k, nome, cor]) => ({ k, nome, cor })), conectado: await gConnected(), conta: await setting('g_email'),
        ultimaSync: ags.map((a) => a.ultima_sync).filter(Boolean).sort().at(-1) ?? '', podeConfigurar: !!Number(u.admin) && u.role === 'manager',
      });
    }
    if (path === '/agendas/descobrir' && method === 'GET') {
      await requireAdmin(c);
      const cad = new Set((await agendasCadastradas()).map((a) => a.calendar_id));
      return json({ rows: (await agendasDaConta()).map((i: Row) => ({ id: String(i.id), nome: String(i.summaryOverride || i.summary || i.id), papel: String(i.accessRole ?? ''), cadastrada: cad.has(String(i.id)) })) });
    }
    if (path === '/agendas/adicionar' && method === 'POST') {
      const a = await requireAdmin(c);
      const ag = await agendaAdicionar(strv((await c.body()).id), String(a.nome));
      await audit(String(a.codigo), 'agenda-google-cadastrada', 'google_agendas', ag.calendar_id);
      return json({ ok: true, agenda: agendaPublica(ag) }, 201);
    }
    if (path === '/agendas/atualizar' && method === 'POST') {
      const a = await requireAdmin(c);
      const b = await c.body();
      const ag = await agendaAtualizar(strv(b.id), b);
      await audit(String(a.codigo), 'agenda-google-ajustada', 'google_agendas', ag.calendar_id);
      return json({ ok: true, agenda: agendaPublica(ag) });
    }
    if (path === '/agendas/verificar' && method === 'POST') {
      const a = await requireAdmin(c);
      const ags = await agendasVerificar();
      await audit(String(a.codigo), 'agendas-google-verificadas', 'google_agendas', '');
      return json({ ok: true, agendas: ags.map(agendaPublica) });
    }
    if (path === '/agendas/remover' && method === 'POST') {
      const a = await requireAdmin(c);
      const id = strv((await c.body()).id);
      await agendaRemover(id);
      await audit(String(a.codigo), 'agenda-google-removida', 'google_agendas', id);
      return json({ ok: true });
    }
    if (path === '/agenda/eventos' && method === 'GET') {
      const de = c.qs('de'), ate = c.qs('ate');
      const r = await eventosAgendas(de, ate);
      const legado = await eventosLegado(de, ate);
      const ags = (await agendasCadastradas()).map(agendaPublica);
      return json({ itens: [...r.itens, ...legado].sort((x, y) => (String(x.dia) + (x.horaInicio || '00:00')).localeCompare(String(y.dia) + (y.horaInicio || '00:00'))), avisos: r.avisos, agendas: ags, pode: ags.some((a) => a.permissao === 'edicao') });
    }
    if (path === '/agenda/evento' && method === 'POST') {
      const b = await c.body();
      const ev = await eventoCriar(b, String(u.nome));
      await audit(String(u.codigo), 'evento-escolar-criado', 'google_agendas', `${ev.calendarId}|${ev.eventId}`);
      return json({ ok: true, evento: ev }, 201);
    }
    if (path === '/agenda/evento' && method === 'PUT') {
      const b = await c.body();
      const ev = await eventoEditar(b, String(u.nome));
      await audit(String(u.codigo), 'evento-escolar-editado', 'google_agendas', `${ev.calendarId}|${ev.eventId}`);
      return json({ ok: true, evento: ev });
    }
    if (path === '/agenda/evento/excluir' && method === 'POST') {
      const b = await c.body();
      await eventoExcluir(b);
      await audit(String(u.codigo), 'evento-escolar-excluido', 'google_agendas', `${strv(b.calendarId)}|${strv(b.eventId)}`);
      return json({ ok: true });
    }
  } catch (e: any) {
    if (e instanceof ErroAgenda) return fail(e.http, e.message);
    throw e;
  }
  return fail(404, 'Rota não encontrada.');
}
