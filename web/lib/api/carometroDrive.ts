import { contextoCm } from '../carometroAcesso';
import { Ctx } from '../ctx';
import { requireAdmin } from '../auth';
import { q, q1, run } from '../db';
import { fail, now, Row, strv } from '../util';
import { json } from './handlers';
import { auditar } from '../carometroFoto';
import { DRIVE_ESTADO_INTEGRACAO, linkPastaDrive, pastaDriveId } from '../carometroDrive';

const limpa = (v: unknown, n: number) => strv(v).replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const publico = (r: Row) => ({ id: Number(r.id), nome: r.nome, link: linkPastaDrive(String(r.pasta_id)), obs: r.obs, estado: r.estado, conferidaEm: r.conferida_em, conferidaPor: r.conferida_por, criadoPor: r.criado_por, criadoEm: r.criado_em });

/** Referências de pastas do Drive: qualquer usuário interno consulta; só o Administrador registra, confere ou remove. */
export async function carometroDriveRoute(c: Ctx, u: Row, ator: string): Promise<Response | null> {
  const { path, method } = c;
  if(path.startsWith('/carometro/drive') && contextoCm.getStore()?.segmentos.length) fail(403,'As pastas gerais do Drive são restritas à equipe com acesso a todos os segmentos.');
  if (!path.startsWith('/carometro/drive')) return null;
  if (path === '/carometro/drive' && method === 'GET') {
    const rows = await q('SELECT * FROM cm_drive_refs WHERE ativo=1 ORDER BY id DESC');
    return json({ integracao: DRIVE_ESTADO_INTEGRACAO, podeEditar: !!Number(u.admin), rows: rows.map(publico) });
  }
  if (method !== 'POST') fail(405, 'Método não permitido.');
  await requireAdmin(c);
  const b = await c.body();
  if (path === '/carometro/drive') {
    const nome = limpa(b.nome, 120), id = pastaDriveId(strv(b.pasta)), obs = limpa(b.obs, 300);
    if (!nome) fail(400, 'Dê um nome à pasta.');
    if (!id) fail(400, 'Informe o link da pasta do Google Drive (drive.google.com/drive/folders/…) ou o identificador dela.');
    const ja = await q1('SELECT id,ativo FROM cm_drive_refs WHERE pasta_id=?', [id]);
    if (ja && Number(ja.ativo)) fail(409, 'Esta pasta já está registrada.');
    if (ja) await run("UPDATE cm_drive_refs SET ativo=1,nome=?,obs=?,estado='nao_verificada',conferida_em='',conferida_por='' WHERE id=?", [nome, obs, ja.id]);
    else await run('INSERT INTO cm_drive_refs(nome,pasta_id,obs,criado_por,criado_em) VALUES(?,?,?,?,?)', [nome, id, obs, ator, now()]);
    await auditar(ator, 'drive-pasta-registrada', null, nome);
    return json({ ok: true });
  }
  const ref = await q1('SELECT * FROM cm_drive_refs WHERE id=? AND ativo=1', [Number(b.id) || 0]) ?? fail(404, 'Pasta não encontrada.');
  if (path === '/carometro/drive/conferir') {
    await run("UPDATE cm_drive_refs SET estado='conferida_manual',conferida_em=?,conferida_por=? WHERE id=?", [now(), ator, ref.id]);
    await auditar(ator, 'drive-pasta-conferida', null, `${ref.nome} (conferência manual)`);
    return json({ ok: true });
  }
  if (path === '/carometro/drive/remover') {
    await run('UPDATE cm_drive_refs SET ativo=0 WHERE id=?', [ref.id]);
    await auditar(ator, 'drive-pasta-removida', null, String(ref.nome));
    return json({ ok: true });
  }
  return fail(404, 'Rota não encontrada.');
}
