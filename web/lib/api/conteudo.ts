import { Ctx } from '../ctx';
import { q } from '../db';
import { requireInternal } from '../auth';
import { audit, getRow, listRows, logStatus, modifyRow } from '../records';
import { registrarNotificacao } from '../notificacoes';
import { adicionarComentario } from '../trabalho';
import { fail, lower, now, Row, strv } from '../util';
import { json } from './handlers';

export const CANAIS = ['Instagram', 'TikTok', 'YouTube'];

/**
 * Estado da publicação, deliberadamente separado do status editorial:
 * um agendamento INTERNO nunca é tratado como publicação confirmada.
 */
export function estadoPublicacao(r: Row, ig?: Row | null): string {
  const st = strv(r.status).toUpperCase();
  if (ig?.status === 'ERRO') return 'FALHA NA PUBLICAÇÃO';
  if (ig?.status === 'PUBLICADO' && ig.media_id) return 'PUBLICAÇÃO CONFIRMADA';
  if (ig?.status === 'PROCESSANDO') return 'ENVIADO À PLATAFORMA';
  if (st === 'PUBLICADO') return strv(r.publicadoConfirmadoEm) || strv(r.linkPublicacao) ? 'PUBLICAÇÃO CONFIRMADA' : 'PUBLICADO SEM CONFIRMAÇÃO';
  if (st === 'PROGRAMADO') return 'AGENDADO INTERNAMENTE';
  if (st === 'APROVADO') return 'APROVADO';
  if (st === 'PRODUÇÃO' || st === 'REVISÃO') return 'EM PRODUÇÃO';
  if (st === 'ARQUIVADO') return 'ARQUIVADO';
  return 'PLANEJADO';
}

async function conteudo(id: string): Promise<Row> {
  const r = (await getRow('conteudos', id)) ?? fail(404, 'Conteúdo não encontrado.');
  return r;
}

export async function conteudoRoute(c: Ctx) {
  const { path, method } = c;
  const u = await requireInternal(c);
  if (path === '/content/states') {
    const igs = new Map((await q('SELECT conteudo_id,status,media_id,erro FROM ig_publish')).map((x: Row) => [String(x.conteudo_id), x]));
    return json({
      rows: (await listRows('conteudos')).map((r) => {
        const ig = igs.get(String(r.id));
        return { id: r.id, canal: strv(r.canal) || 'Instagram', estado: estadoPublicacao(r, ig), erro: ig?.status === 'ERRO' ? ig.erro : '' };
      }),
      canais: CANAIS,
    });
  }
  if (path === '/content/decision' && method === 'POST') {
    const b = await c.body();
    const id = strv(b.id);
    const cur = await conteudo(id);
    if (strv(cur.status).toUpperCase() !== 'REVISÃO') fail(409, 'A decisão só vale para conteúdos em REVISÃO.');
    const permitido = u.role === 'manager' || (strv(cur.revisor).trim() !== '' && lower(strv(cur.revisor)) === lower(String(u.nome)));
    if (!permitido) fail(403, 'Só a Gerência ou o revisor indicado neste conteúdo pode decidir.');
    const decisao = strv(b.decisao).toUpperCase();
    const comentario = strv(b.comentario).trim();
    const alvo: Record<string, string> = { APROVADO: 'APROVADO', 'AJUSTES SOLICITADOS': 'PRODUÇÃO', REPROVADO: 'ARQUIVADO' };
    if (!(decisao in alvo)) fail(400, 'Decisão inválida.');
    if (decisao !== 'APROVADO' && comentario.length < 3) fail(400, decisao === 'REPROVADO' ? 'Informe o motivo da recusa.' : 'Descreva os ajustes necessários.');
    const para = alvo[decisao];
    const motivo = `${decisao === 'APROVADO' ? 'Aprovado' : decisao === 'REPROVADO' ? 'Reprovado' : 'Ajustes solicitados'} por ${u.nome}${comentario ? ': ' + comentario.slice(0, 300) : ''}`;
    await modifyRow('conteudos', id, async (r, conn) => {
      if (strv(r.status).toUpperCase() !== 'REVISÃO') fail(409, 'O conteúdo mudou de etapa enquanto você decidia. Atualize a tela.');
      await logStatus(conn, 'conteudos', id, strv(r.status), para, String(u.codigo), motivo);
      return { ...r, status: para, aprovacaoDecisao: decisao, aprovadoPor: String(u.nome), aprovadoEm: now(), versaoAprovada: strv(b.versao).trim().slice(0, 60) || strv(r.versao), aprovacaoComentario: comentario, atualizadoEm: now(), atualizadoPor: String(u.codigo) };
    });
    if (comentario) await adicionarComentario('conteudos', id, String(u.nome), 'int', `[${decisao}] ${comentario}`, true);
    await audit(String(u.codigo), 'decisao-conteudo', 'conteudos', id);
    if (strv(cur.responsavel).trim()) await registrarNotificacao('responsavel', strv(cur.responsavel), `Conteúdo ${decisao === 'APROVADO' ? 'aprovado' : decisao === 'REPROVADO' ? 'reprovado' : 'com ajustes'}`, `"${cur.titulo}": ${motivo}`, 'conteudos', id);
    return json({ ok: true, status: para });
  }
  if (path === '/content/confirm' && method === 'POST') {
    const b = await c.body();
    const id = strv(b.id);
    const cur = await conteudo(id);
    const link = strv(b.link).trim();
    if (!/^https:\/\/[^\s]{4,500}$/.test(link)) fail(400, 'Informe o link https da publicação para confirmá-la.');
    if (!['APROVADO', 'PROGRAMADO'].includes(strv(cur.status).toUpperCase())) fail(409, 'Só conteúdos APROVADOS ou PROGRAMADOS podem ser confirmados como publicados.');
    const ig = (await q('SELECT status FROM ig_publish WHERE conteudo_id=?', [id]))[0];
    if (ig?.status === 'PROCESSANDO') fail(409, 'O Instagram ainda está processando este conteúdo.');
    await modifyRow('conteudos', id, async (r, conn) => {
      await logStatus(conn, 'conteudos', id, strv(r.status), 'PUBLICADO', String(u.codigo), `Publicação confirmada manualmente por ${u.nome}: ${link}`);
      return { ...r, status: 'PUBLICADO', linkPublicacao: link, publicadoConfirmadoEm: now(), publicadoConfirmadoPor: String(u.nome), atualizadoEm: now(), atualizadoPor: String(u.codigo) };
    });
    await audit(String(u.codigo), 'confirmar-publicacao', 'conteudos', id);
    return json({ ok: true });
  }
  return fail(404, 'Rota não encontrada.');
}
