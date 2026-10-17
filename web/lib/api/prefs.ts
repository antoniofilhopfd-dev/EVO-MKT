import { Ctx } from '../ctx';
import { requireInternal } from '../auth';
import { q, q1, run } from '../db';
import { fail, now, strv } from '../util';
import { json } from './handlers';

/** Preferências por usuário (layout do Tráfego, colunas, visões e filtros salvos). Só o próprio usuário lê e grava as suas. */
const CHAVE = /^[a-z0-9._-]{1,80}$/;
const MAX = 120_000;
export async function prefsRoute(c: Ctx): Promise<Response> {
  const u = await requireInternal(c);
  const cod = String(u.codigo);
  if (c.method === 'GET') {
    const k = c.qs('chave');
    if (!k) return json({ rows: (await q('SELECT chave,atualizado FROM user_prefs WHERE codigo=? ORDER BY chave', [cod])) });
    if (!CHAVE.test(k)) fail(400, 'Chave inválida.');
    const r = await q1('SELECT valor FROM user_prefs WHERE codigo=? AND chave=?', [cod, k]);
    return json({ chave: k, valor: r ? String(r.valor) : null });
  }
  const b = await c.body();
  const k = strv(b.chave);
  if (!CHAVE.test(k)) fail(400, 'Chave inválida.');
  if (b.excluir === true) { await run('DELETE FROM user_prefs WHERE codigo=? AND chave=?', [cod, k]); return json({ ok: true }); }
  const valor = typeof b.valor === 'string' ? b.valor : JSON.stringify(b.valor ?? null);
  if (valor.length > MAX) fail(413, 'Preferência grande demais.');
  await run('INSERT INTO user_prefs(codigo,chave,valor,atualizado) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE valor=VALUES(valor),atualizado=VALUES(atualizado)', [cod, k, valor, now()]);
  return json({ ok: true });
}
