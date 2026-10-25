import { Ctx } from '../ctx';
import { requireAdmin, stepUp } from '../auth';
import { q, q1, run } from '../db';
import { audit, listRows, MODULES } from '../records';
import { fail, Row, strv } from '../util';
import { json } from './handlers';

/**
 * LGPD, no que se aplica a este sistema:
 *  - exportação dos dados de uma pessoa (ficha, registros em que aparece, comentários e operações), só o Administrador;
 *  - anonimização autorizada da ficha: a pessoa perde o acesso e o nome/e-mail deixam de ser identificáveis.
 * O histórico operacional (conteúdos, auditoria) é preservado por regra do sistema: os registros continuam
 * apontando para o código da ficha, não para um nome. Nada é apagado.
 */
const CAMPOS_PESSOA = ['responsavel', 'criadoPor', 'revisor', 'aprovador'];

export async function lgpdRoute(c: Ctx): Promise<Response> {
  const m = await requireAdmin(c);
  if (c.path === '/admin/lgpd/exportar' && c.method === 'GET') {
    const cod = strv(c.qs('codigo')).trim().toUpperCase();
    const tipo = 'interno';
    const ficha = await q1('SELECT codigo,nome,role,label,admin,ativo FROM users WHERE codigo=?', [cod]);
    if (!ficha) fail(404, 'Ficha não encontrada.');
    const nome = strv(ficha.nome);
    const registros: Row[] = [];
    for (const mod of Object.keys(MODULES)) {
      for (const r of await listRows(mod)) {
        const campos = CAMPOS_PESSOA.filter((k) => strv(r[k]).trim() !== '' && (strv(r[k]).trim() === cod || strv(r[k]).trim().toLowerCase() === nome.toLowerCase()));
        if (campos.length) registros.push({ modulo: mod, id: r.id, titulo: strv(r.titulo), campos });
      }
    }
    const comentarios = await q('SELECT modulo,registro,quando,texto FROM record_comments WHERE autor=? OR autor=? ORDER BY id DESC LIMIT 1000', [cod, nome]);
    const operacoes = await q('SELECT quando,acao,modulo,registro FROM audit_log WHERE ator=? OR ator=? ORDER BY id DESC LIMIT 1000', [cod, nome]);
    await audit(String(m.codigo), 'lgpd-exportar:' + cod);
    return json({ geradoEm: new Date().toISOString(), ficha: { ...ficha, tipo }, registros, comentarios, operacoes });
  }
  if (c.path === '/admin/lgpd/anonimizar' && c.method === 'POST') {
    const input = await c.body();
    await stepUp(m, input);
    if (input.confirmar !== 'ANONIMIZAR') fail(400, 'Confirme a anonimização.');
    const cod = strv(input.codigo).trim().toUpperCase();
    const alvo = await q1('SELECT * FROM users WHERE codigo=?', [cod]);
    if (!alvo) fail(404, 'Ficha não encontrada.');
    if (cod === m.codigo) fail(400, 'Você não pode anonimizar a própria ficha.');
    if (alvo.role === 'manager' && Number(alvo.admin) && Number(alvo.ativo)
      && Number((await q1("SELECT COUNT(*) c FROM users WHERE role='manager' AND admin=1 AND ativo=1"))?.c) <= 1) fail(400, 'Não é possível anonimizar o único Administrador ativo.');
    const anonimo = `Pessoa removida ${cod}`;
    await run("UPDATE users SET nome=?,email='',ativo=0,acesso_hmac=NULL,acesso_enc=NULL WHERE codigo=?", [anonimo, cod]);
    await run('DELETE FROM sessions WHERE codigo=?', [cod]);
    await run('DELETE FROM trusted_devices WHERE codigo=?', [cod]);
    await audit(String(m.codigo), 'lgpd-anonimizar:' + cod);
    return json({ ok: true, codigo: cod, nome: anonimo });
  }
  return fail(404, 'Rota não encontrada.');
}
