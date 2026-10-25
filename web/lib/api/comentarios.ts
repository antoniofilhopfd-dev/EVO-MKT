import { Ctx } from '../ctx';
import { q, run } from '../db';
import { requireInternal } from '../auth';
import { MODULES, getRow, TEAM_WRITE, audit } from '../records';
import { adicionarComentario, checklist, checklistItem, comentarios, novaOrdemChecklist } from '../comentarios';
import { fail, now, Row, strv } from '../util';
import { json } from './handlers';

const MODULOS = ['conteudos', 'ideias', 'campanhas'];

async function alvo(c: Ctx, escrita: boolean): Promise<{ mod: string; id: string; u: Row }> {
  const u = await requireInternal(c);
  const b = c.method === 'GET' || c.method === 'DELETE' ? null : await c.body();
  const mod = strv(b?.module ?? c.qs('module')), id = strv(b?.id ?? c.qs('id'));
  if (!MODULOS.includes(mod) || !(mod in MODULES)) fail(400, 'Módulo não permitido.');
  if (!(await getRow(mod, id))) fail(404, 'Registro não encontrado.');
  if (escrita && !Number(u.admin) && !TEAM_WRITE.includes(mod)) fail(403, 'Seu perfil não pode alterar este módulo.');
  return { mod, id, u };
}

export async function comentariosRoute(c: Ctx) {
  const { path, method } = c;
  if (path === '/comments' && method === 'GET') {
    const { mod, id } = await alvo(c, false);
    return json({ rows: await comentarios(mod, id) });
  }
  if (path === '/comments' && method === 'POST') {
    const { mod, id, u } = await alvo(c, true);
    await adicionarComentario(mod, id, String(u.nome), strv((await c.body()).texto));
    await audit(String(u.codigo), 'comentar', mod, id);
    return json({ ok: true });
  }
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
    await run('INSERT INTO record_checklist(modulo,registro,texto,feito,ordem,atualizado_em) VALUES(?,?,?,0,?,?)', [mod, id, t, await novaOrdemChecklist(mod, id), now()]);
    await audit(String(u.codigo), 'checklist', mod, id);
    return json({ ok: true });
  }
  if (path === '/checklist' && method === 'PUT') {
    const u = await requireInternal(c);
    const b = await c.body();
    const it = (await checklistItem(Number(b.itemId))) ?? fail(404, 'Item não encontrado.');
    if (!Number(u.admin) && !TEAM_WRITE.includes(String(it.modulo))) fail(403, 'Seu perfil não pode alterar este módulo.');
    if ('feito' in b) await run('UPDATE record_checklist SET feito=?,atualizado_em=? WHERE id=?', [b.feito ? 1 : 0, now(), it.id]);
    if ('texto' in b && strv(b.texto).trim()) await run('UPDATE record_checklist SET texto=?,atualizado_em=? WHERE id=?', [strv(b.texto).trim().slice(0, 300), now(), it.id]);
    return json({ ok: true });
  }
  if (path === '/checklist' && method === 'DELETE') {
    const u = await requireInternal(c);
    const it = (await checklistItem(Number(c.qs('itemId')))) ?? fail(404, 'Item não encontrado.');
    if (!Number(u.admin) && !TEAM_WRITE.includes(String(it.modulo))) fail(403, 'Seu perfil não pode alterar este módulo.');
    await run('DELETE FROM record_checklist WHERE id=?', [it.id]);
    return json({ ok: true });
  }
  return fail(404, 'Rota não encontrada.');
}
