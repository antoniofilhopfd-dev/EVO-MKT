import { Ctx } from '../ctx';
import { q, run } from '../db';
import { allowedSegment, requireInternal, requireAdmin, requireManager, requirePortal } from '../auth';
import { MODULES, getRow, TEAM_WRITE, audit } from '../records';
import { adicionarComentario, checklist, checklistItem, comentarios, novoIdChecklistOrdem } from '../trabalho';
import { setSetting, setting } from '../settings';
import { fail, now, Row, strv } from '../util';
import { json } from './handlers';

const MODULOS_TRABALHO = ['tarefas', 'projetos', 'conteudos', 'eventos', 'campanhas', 'solicitacoes', 'aprovacoes', 'ideias'];

async function alvo(c: Ctx, escrita: boolean): Promise<{ mod: string; id: string; u: Row }> {
  const u = await requireInternal(c);
  const b = c.method === 'GET' || c.method === 'DELETE' ? null : await c.body();
  const mod = strv(b?.module ?? c.qs('module')), id = strv(b?.id ?? c.qs('id'));
  if (!MODULOS_TRABALHO.includes(mod) || !(mod in MODULES)) fail(400, 'Módulo não permitido.');
  if (!(await getRow(mod, id))) fail(404, 'Registro não encontrado.');
  if (escrita && u.role !== 'manager' && !TEAM_WRITE.includes(mod)) fail(403, 'Seu perfil não pode alterar este módulo.');
  return { mod, id, u };
}

export async function trabalhoRoute(c: Ctx) {
  const { path, method } = c;
  // ----- comentários -----
  if (path === '/comments' && method === 'GET') {
    const { mod, id } = await alvo(c, false);
    return json({ rows: await comentarios(mod, id, false) });
  }
  if (path === '/comments' && method === 'POST') {
    const u = await requireInternal(c);
    const b = await c.body();
    const mod = strv(b.module), id = strv(b.id);
    if (!MODULOS_TRABALHO.includes(mod)) fail(400, 'Módulo não permitido.');
    if (!(await getRow(mod, id))) fail(404, 'Registro não encontrado.');
    await adicionarComentario(mod, id, String(u.nome), 'int', strv(b.texto), mod === 'solicitacoes' ? b.interno !== false : true);
    await audit(String(u.codigo), 'comentar', mod, id);
    return json({ ok: true });
  }
  if (path === '/portal/comments') {
    const u = await requirePortal(c);
    const b = method === 'POST' ? await c.body() : {};
    const id = strv(b.id ?? c.qs('id'));
    const sol = (await getRow('solicitacoes', id)) ?? fail(404, 'Demanda não encontrada.');
    if (!allowedSegment(u, sol.segmento ?? '')) fail(403, 'Demanda de outro segmento.');
    if (method === 'GET') return json({ rows: (await comentarios('solicitacoes', id, true)).map((r) => ({ ...r, autor: r.autor_tipo === 'portal' ? r.autor : 'Marketing' })) });
    if (method !== 'POST') fail(405, 'Método não permitido.');
    await adicionarComentario('solicitacoes', id, String(u.nome), 'portal', strv(b.texto), false);
    return json({ ok: true });
  }
  // ----- checklist -----
  if (path === '/checklist' && method === 'GET') {
    const { mod, id } = await alvo(c, false);
    return json({ rows: await checklist(mod, id) });
  }
  if (path === '/checklist' && method === 'POST') {
    const { mod, id, u } = await alvo(c, true);
    const t = strv((await c.body()).texto).trim();
    if (!t) fail(400, 'Escreva o item.');
    if (t.length > 300) fail(400, 'Item muito longo (máximo 300 caracteres).');
    if ((await q('SELECT COUNT(*) n FROM record_checklist WHERE modulo=? AND registro=?', [mod, id]))[0].n >= 100) fail(400, 'Limite de 100 itens por checklist.');
    await run('INSERT INTO record_checklist(modulo,registro,texto,feito,ordem,atualizado_em) VALUES(?,?,?,0,?,?)', [mod, id, t, await novoIdChecklistOrdem(mod, id), now()]);
    await audit(String(u.codigo), 'checklist', mod, id);
    return json({ ok: true });
  }
  if (path === '/checklist' && method === 'PUT') {
    const u = await requireInternal(c);
    const b = await c.body();
    const it = (await checklistItem(Number(b.itemId))) ?? fail(404, 'Item não encontrado.');
    if (u.role !== 'manager' && !TEAM_WRITE.includes(String(it.modulo))) fail(403, 'Seu perfil não pode alterar este módulo.');
    if ('feito' in b) await run('UPDATE record_checklist SET feito=?,atualizado_em=? WHERE id=?', [b.feito ? 1 : 0, now(), it.id]);
    if ('texto' in b && strv(b.texto).trim()) await run('UPDATE record_checklist SET texto=?,atualizado_em=? WHERE id=?', [strv(b.texto).trim().slice(0, 300), now(), it.id]);
    return json({ ok: true });
  }
  if (path === '/checklist' && method === 'DELETE') {
    const u = await requireInternal(c);
    const it = (await checklistItem(Number(c.qs('itemId')))) ?? fail(404, 'Item não encontrado.');
    if (u.role !== 'manager' && !TEAM_WRITE.includes(String(it.modulo))) fail(403, 'Seu perfil não pode alterar este módulo.');
    await run('DELETE FROM record_checklist WHERE id=?', [it.id]);
    return json({ ok: true });
  }
  // ----- automações (liga/desliga) -----
  if (path === '/admin/automacoes') {
    await requireAdmin(c);
    if (method === 'POST') {
      const b = await c.body();
      for (const k of ['auto_tarefa_solicitacao', 'auto_recorrencia']) if (k in b) await setSetting(k, b[k] ? '1' : '0');
    }
    return json({ auto_tarefa_solicitacao: (await setting('auto_tarefa_solicitacao', '1')) !== '0', auto_recorrencia: (await setting('auto_recorrencia', '1')) !== '0' });
  }
  return fail(404, 'Rota não encontrada.');
}
