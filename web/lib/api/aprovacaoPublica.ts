import { Ctx } from '../ctx';
import { q, q1, run } from '../db';
import { rateCheck, rateFail, requireInternal } from '../auth';
import { randHex, sha256 } from '../crypto';
import { serveFile } from '../files';
import { validarTransicaoSolicitacao } from '../fluxo';
import { publicUrl } from '../integrations/http';
import { notifyMail } from '../mail';
import { registrarNotificacao } from '../notificacoes';
import { audit, getRow, logStatus, modifyRow } from '../records';
import { addDays, fail, fmtDate, now, Row, strv } from '../util';
import { json } from './handlers';

const AGUARDA = 'AGUARDANDO APROVAÇÃO DO SOLICITANTE';
const arquivosDe = (r: Row) => String(r.arquivosEntrega ?? '').split('|').map((x) => x.replace(/\\/g, '/').trim()).filter(Boolean);

const ehPost = (id: string) => String(id).startsWith('CON-');
const midiaDe = (r: Row) => String(r.midiaInstagram ?? '').replace(/\\/g, '/').trim();

/** Procura o link pelo token (só o hash fica no banco). Falha com a mesma mensagem para inexistente, expirado ou usado. */
async function linkValido(c: Ctx, token: string): Promise<{ link: Row; sol: Row; mod: string }> {
  await rateCheck('apr:' + c.ip, 40);
  const link = token.length >= 32 ? await q1('SELECT * FROM approval_links WHERE token_hash=?', [sha256(token)]) : null;
  const mod = link && ehPost(link.solicitacao) ? 'conteudos' : 'solicitacoes';
  const sol = link ? await getRow(mod, link.solicitacao) : null;
  if (!link || !sol || link.usado_em || link.expira_em < now()) {
    await rateFail('apr:' + c.ip);
    fail(404, 'Este link não é mais válido. Peça um novo ao Marketing.');
  }
  return { link, sol, mod };
}

export async function aprovacaoPublicaRoute(c: Ctx) {
  const { path, method } = c;
  if (path === '/manager/approval-link' && method === 'POST') {
    const u = await requireInternal(c);
    const b = await c.body();
    const id = strv(b.id);
    if (ehPost(id)) {
      const post = (await getRow('conteudos', id)) ?? fail(404, 'Conteúdo não encontrado.');
      if (String(post.status).toUpperCase() !== 'REVISÃO') fail(409, 'O link só pode ser criado quando o post está em aprovação (etapa REVISÃO).');
      if (!strv(post.legenda).trim() && !midiaDe(post)) fail(409, 'Escreva a legenda ou anexe a mídia antes de gerar o link.');
      const dias = Math.min(30, Math.max(1, Number(b.dias) || 7));
      const token = randHex(32);
      await run("UPDATE approval_links SET expira_em=? WHERE solicitacao=? AND usado_em='' AND expira_em>?", [now(), id, now()]);
      await run('INSERT INTO approval_links(token_hash,solicitacao,criado_por,criado_em,expira_em) VALUES(?,?,?,?,?)', [sha256(token), id, String(u.codigo), now(), now(addDays(new Date(), dias))]);
      await audit(String(u.codigo), 'link-aprovacao', 'conteudos', id);
      return json({ url: `${publicUrl(c.url.origin)}/aprovar.html?t=${token}`, expiraEm: now(addDays(new Date(), dias)), dias });
    }
    const sol = (await getRow('solicitacoes', id)) ?? fail(404, 'Demanda não encontrada.');
    if (String(sol.status).toUpperCase() !== AGUARDA) fail(409, 'O link só pode ser criado quando a entrega está aguardando aprovação.');
    if (!arquivosDe(sol).length && !strv(sol.entregaMensagem).trim()) fail(409, 'Anexe a entrega (ou escreva a mensagem de entrega) antes de gerar o link.');
    const dias = Math.min(30, Math.max(1, Number(b.dias) || 7));
    const token = randHex(32);
    await run("UPDATE approval_links SET expira_em=? WHERE solicitacao=? AND usado_em='' AND expira_em>?", [now(), id, now()]); // só um link ativo por demanda
    await run('INSERT INTO approval_links(token_hash,solicitacao,criado_por,criado_em,expira_em) VALUES(?,?,?,?,?)', [sha256(token), id, String(u.codigo), now(), now(addDays(new Date(), dias))]);
    await audit(String(u.codigo), 'link-aprovacao', 'solicitacoes', id);
    return json({ url: `${publicUrl(c.url.origin)}/aprovar.html?t=${token}`, expiraEm: now(addDays(new Date(), dias)), dias });
  }
  if (path === '/public/approval' && method === 'GET') {
    const { link, sol, mod } = await linkValido(c, c.qs('t'));
    if (mod === 'conteudos') {
      if (String(sol.status).toUpperCase() !== 'REVISÃO') fail(409, 'Este post já foi respondido.');
      const m = midiaDe(sol);
      return json({
        tipo: 'post', titulo: sol.titulo, perfil: sol.perfil ?? '', formato: sol.formato ?? '', legenda: sol.legenda ?? '', hashtags: sol.hashtags ?? '', cta: sol.cta ?? '',
        publicacaoEm: sol.publicacaoEm ?? '', expiraEm: link.expira_em, midia: m ? { path: m, video: /\.(mp4|mov)$/i.test(m) } : null,
      });
    }
    if (String(sol.status).toUpperCase() !== AGUARDA) fail(409, 'Esta entrega já foi respondida.');
    return json({
      titulo: sol.titulo, segmento: sol.segmento, solicitante: sol.solicitante, mensagem: sol.entregaMensagem ?? '', expiraEm: link.expira_em,
      arquivos: arquivosDe(sol).map((p) => ({ nome: p.split('/').pop(), path: p })),
    });
  }
  if (path === '/public/approval/file' && method === 'GET') {
    const { sol, mod } = await linkValido(c, c.qs('t'));
    const rel = c.qs('path').replace(/\\/g, '/').trim();
    if (!(mod === 'conteudos' ? [midiaDe(sol)] : arquivosDe(sol)).includes(rel) || !rel) fail(403, 'Arquivo não autorizado.');
    return serveFile(rel, null, mod === 'conteudos' ? ['ANEXOS/CONTEUDOS/'] : undefined);
  }
  if (path === '/public/approval' && method === 'POST') {
    const b = await c.body();
    const { link, sol, mod } = await linkValido(c, strv(b.t));
    const acao = strv(b.acao).toUpperCase();
    const nome = strv(b.nome).trim().slice(0, 80);
    const comentario = strv(b.comentario).trim().slice(0, 500);
    if (!['APROVADO', 'AJUSTES SOLICITADOS'].includes(acao)) fail(400, 'Escolha aprovar ou pedir ajustes.');
    if (nome.length < 3) fail(400, 'Informe seu nome para registrar a resposta.');
    if (acao === 'AJUSTES SOLICITADOS' && comentario.length < 3) fail(400, 'Descreva os ajustes que você precisa.');
    const ator = 'link:' + nome;
    if (mod === 'conteudos') {
      const novo = acao === 'APROVADO' ? 'APROVADO' : 'PRODUÇÃO';
      const why = acao === 'APROVADO' ? `Post aprovado por ${nome} (link)` : `Ajustes solicitados por ${nome} (link): ${comentario}`;
      const row = await modifyRow('conteudos', sol.id, async (cur, conn) => {
        if (String(cur.status).toUpperCase() !== 'REVISÃO') fail(409, 'Este post já foi respondido.');
        const t = now();
        await logStatus(conn, 'conteudos', sol.id, 'REVISÃO', novo, ator, why);
        await conn.query('UPDATE approval_links SET usado_em=?,decisao=?,aprovador=? WHERE token_hash=?', [t, acao, nome, link.token_hash]);
        return { ...cur, status: novo, aprovacaoDecisao: acao, aprovadoPor: nome, aprovadoEm: t, aprovacaoComentario: comentario, atualizadoEm: t, aprovadoPorLink: nome };
      });
      await audit(ator, 'editar', 'conteudos', sol.id);
      await registrarNotificacao('resposta_solicitante', 'gerencia', 'Resposta pelo link de aprovação', `${nome} ${acao === 'APROVADO' ? 'aprovou' : 'pediu ajustes em'} o post "${row.titulo}".`, 'conteudos', String(sol.id));
      if (strv(row.responsavel).trim()) await registrarNotificacao('responsavel', strv(row.responsavel), `Post ${acao === 'APROVADO' ? 'aprovado' : 'com ajustes'} pelo link`, `${row.titulo} · ${nome}${comentario ? ': ' + comentario : ''}`, 'conteudos', String(sol.id));
      await notifyMail(`Post ${acao === 'APROVADO' ? 'aprovado' : 'com ajustes solicitados'} (link): ${row.titulo}`, `ID: ${sol.id} · ${nome}${comentario ? '\n' + comentario : ''}`);
      return json({ ok: true, resultado: acao });
    }
    const para = acao === 'APROVADO' ? 'CONCLUÍDA' : 'EM EXECUÇÃO';
    const motivo = acao === 'APROVADO' ? `Entrega aprovada por ${nome} (link)` : `Ajustes solicitados por ${nome} (link): ${comentario}`;
    const row = await modifyRow('solicitacoes', sol.id, async (cur, conn) => {
      if (String(cur.status).toUpperCase() !== AGUARDA) fail(409, 'Esta entrega já foi respondida.');
      validarTransicaoSolicitacao(AGUARDA, para, motivo, true);
      const t = now();
      const r: Row = { ...cur, status: para, aprovacaoSolicitante: acao, atualizadoEm: t, aprovadoPorLink: nome };
      if (acao === 'APROVADO') { r.triagemStatus = 'CONCLUÍDA'; r.aprovadoSolicitanteEm = r.aprovadoSolicitanteEm || t; }
      else { r.triagemStatus = 'DISTRIBUÍDA'; r.respostaSolicitante = comentario; r.respondidoSolicitanteEm = r.respondidoSolicitanteEm || t; }
      await logStatus(conn, 'solicitacoes', sol.id, AGUARDA, para, ator, motivo);
      await conn.query('UPDATE approval_links SET usado_em=?,decisao=?,aprovador=? WHERE token_hash=?', [t, acao, nome, link.token_hash]);
      return r;
    });
    await audit(ator, 'editar', 'solicitacoes', sol.id);
    await registrarNotificacao('resposta_solicitante', 'gerencia', 'Resposta pelo link de aprovação', `${nome} ${acao === 'APROVADO' ? 'aprovou' : 'pediu ajustes em'} "${row.titulo}".`, 'solicitacoes', sol.id);
    await notifyMail(`Demanda ${acao === 'APROVADO' ? 'aprovada' : 'com ajustes solicitados'} (link): ${row.titulo}`, `ID: ${sol.id} · ${nome}${comentario ? '\n' + comentario : ''}`);
    return json({ ok: true, resultado: acao });
  }
  return fail(404, 'Rota não encontrada.');
}

export async function linksDaDemanda(id: string): Promise<Row[]> {
  return q('SELECT criado_por,criado_em,expira_em,usado_em,decisao,aprovador FROM approval_links WHERE solicitacao=? ORDER BY criado_em DESC', [id]);
}
