import { Ctx } from '../ctx';
import { q, q1, run } from '../db';
import { requireAdmin, requireInternal } from '../auth';
import { audit } from '../records';
import { makeBackup } from '../backup';
import { iaAtiva, variacoesDeLegenda } from '../ia';
import { setting } from '../settings';
import { env, fail, Row, strv } from '../util';
import { EVO_VERSION } from '../records';
import { json } from './handlers';

/** Apoio de Configurações: e-mail das pessoas, relatório da migração, arquivos sem vínculo e IA (rascunho). */
const usados = async () => (await q("SELECT data FROM records WHERE modulo IN ('conteudos','ideias','calendario','campanhas','templates','configuracoes')")).map((r) => String(r.data)).join('\n');

export async function sistemaRoute(c: Ctx): Promise<Response> {
  const { path, method } = c;
  if (path === '/ia/estado') { await requireInternal(c); return json({ ativa: await iaAtiva(), modelo: (await setting('ia_modelo')) || 'claude-sonnet-5-5', guiaVoz: Number((await requireInternal(c)).admin) ? await setting('ia_guia_voz') : undefined }); }
  if (path === '/ia/variacoes' && method === 'POST') {
    const u = await requireInternal(c);
    const variacoes = await variacoesDeLegenda(await c.body());
    await audit(String(u.codigo), 'ia-variacoes');
    return json({ variacoes, rascunho: true });
  }
  const u = await requireAdmin(c);
  if (path === '/admin/users/email' && method === 'POST') {
    const b = await c.body();
    const cod = strv(b.codigo).trim().toUpperCase(), email = strv(b.email).trim();
    if (email && !/^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(email)) fail(400, 'E-mail inválido.');
    if (!(await q1('SELECT 1 FROM users WHERE codigo=?', [cod]))) fail(404, 'Ficha não encontrada.');
    await run('UPDATE users SET email=? WHERE codigo=?', [email, cod]);
    await audit(String(u.codigo), 'email-usuario:' + cod);
    return json({ ok: true });
  }
  if (path === '/admin/sistema') {
    // Somente leitura: nenhuma consulta altera dados. Valores reais do servidor e do banco (nada fixo).
    await requireAdmin(c);
    if (method !== 'GET') return fail(405, 'Somente consulta.');
    const tabelas = await q1("SELECT COUNT(*) n, COALESCE(SUM(data_length+index_length),0) b FROM information_schema.tables WHERE table_schema=DATABASE()");
    const regs = await q1('SELECT COUNT(*) n FROM records'), arq = await q1('SELECT COUNT(*) n, COALESCE(SUM(tamanho),0) b FROM arquivos');
    const mig = await q1('SELECT COUNT(*) n, MAX(name) ultima FROM schema_migrations');
    const bk = await q1('SELECT nome,criado_em FROM backups ORDER BY criado_em DESC LIMIT 1');
    return json({
      versao: EVO_VERSION, node: process.version, ambiente: env('NODE_ENV') === 'production' ? 'Produção' : 'Desenvolvimento ou teste', fuso: env('TIMEZONE', 'America/Fortaleza'),
      banco: { tabelas: Number(tabelas?.n ?? 0), bytes: Number(tabelas?.b ?? 0) }, registros: Number(regs?.n ?? 0), arquivos: { total: Number(arq?.n ?? 0), bytes: Number(arq?.b ?? 0) },
      migracoes: { aplicadas: Number(mig?.n ?? 0), ultima: strv(mig?.ultima) }, ultimoBackup: bk ? { nome: strv(bk.nome), criadoEm: strv(bk.criado_em) } : null,
    });
  }
  if (path === '/admin/migracao') {
    const r = await q1("SELECT v,criado_em FROM relatorio_migracao WHERE k='cinco_areas'");
    return json({ relatorio: r ? JSON.parse(String(r.v)) : null, criadoEm: r?.criado_em ?? '' });
  }
  if (path === '/admin/arquivos-sem-vinculo') {
    const base = await usados();
    const rows = (await q('SELECT caminho,tamanho,criado_em FROM arquivos ORDER BY criado_em DESC')).filter((r) => !base.includes(String(r.caminho)));
    return json({ total: rows.length, bytes: rows.reduce((s, r) => s + Number(r.tamanho ?? 0), 0), rows: rows.slice(0, 500).map((r) => ({ caminho: r.caminho, tamanho: Number(r.tamanho), criadoEm: r.criado_em })) });
  }
  if (path === '/admin/arquivos-sem-vinculo/excluir' && method === 'POST') {
    const b = await c.body();
    if (b.confirmar !== true) fail(400, 'Confirme a exclusão.');
    const alvos = (Array.isArray(b.caminhos) ? b.caminhos : []).map(String).slice(0, 500);
    if (!alvos.length) fail(400, 'Escolha ao menos um arquivo.');
    const base = await usados();
    const livres = alvos.filter((p) => !base.includes(p));
    if (livres.length !== alvos.length) fail(409, 'Algum arquivo passou a ser usado por uma publicação. Atualize a lista.');
    const backup = await makeBackup('antesexcluirarquivos', { completo: true }); // ponto de volta antes de apagar
    let n = 0;
    for (const p of livres) n += (await run('DELETE FROM arquivos WHERE caminho=?', [p])) as unknown as number > 0 ? 1 : 0;
    await audit(String(u.codigo), 'excluir-arquivos-sem-vinculo:' + livres.length);
    return json({ ok: true, excluidos: n, backup });
  }
  return fail(404, 'Rota não encontrada.');
}
export type { Row };
