import { q, q1, run, withTx } from './db';
import { cleanInput, currentIp, fail, lower, now, Row, strv } from './util';
import { env, envInt } from './util';

export const EVO_VERSION = '6.0.0-web';
/** Módulos que guardam registros genéricos (tabela `records`). Só o que pertence às cinco áreas do sistema. */
export const MODULES: Record<string, string> = {
  calendario: 'CAL', calescolar: 'ESC', datacom: 'DTC', campanhas: 'CAM', conteudos: 'CON', ideias: 'IDE', templates: 'TPL', configuracoes: 'CFG',
  instagram: 'INS', // métricas por período lidas da API do Instagram (somente leitura pela interface)
};
export const BASE_HEADERS = ['id', 'titulo', 'status', 'prioridade', 'responsavel', 'segmento', 'dataInicio', 'prazo', 'descricao', 'tags', 'origem', 'idExterno', 'ultimaSincronizacao', 'criadoEm', 'atualizadoEm'];
/** Módulos que a Equipe também pode alterar (Configurações é só do Administrador). */
export const TEAM_WRITE = ['calendario', 'conteudos', 'ideias', 'campanhas', 'templates'];
export const ALLOWED_EXT = ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'mp4', 'mov', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'zip', 'psd', 'ai', 'svg', 'mp3', 'wav'];

export async function audit(ator: string, acao: string, mod = '', id = ''): Promise<void> {
  try {
    await run('INSERT INTO audit_log(quando,ator,acao,modulo,registro,ip) VALUES(?,?,?,?,?,?)', [now(), ator, acao, mod, id, currentIp()]);
  } catch {
    /* auditoria nunca derruba a operação */
  }
}

// ---------- IDs: únicos, sequenciais por módulo, nunca reutilizados ----------
export async function newId(mod: string): Promise<string> {
  const pre = MODULES[mod];
  for (let i = 0; i < 50; i++) {
    const id = await withTx(async (c) => {
      const [rs] = await c.query('SELECT n FROM id_counters WHERE modulo=? FOR UPDATE', [mod]);
      const cur = (rs as Row[])[0];
      const n = (cur ? Number(cur.n) : 0) + 1;
      if (cur) await c.query('UPDATE id_counters SET n=? WHERE modulo=?', [n, mod]);
      else await c.query('INSERT INTO id_counters(modulo,n) VALUES(?,?)', [mod, n]);
      const cand = `${pre}-${String(n).padStart(4, '0')}`;
      const [used] = await c.query('SELECT 1 FROM used_ids WHERE id=?', [cand]);
      if ((used as Row[]).length) return null;
      await c.query('INSERT INTO used_ids(id) VALUES(?)', [cand]);
      return cand;
    });
    if (id) return id;
  }
  return fail(500, 'Não foi possível gerar um ID único.');
}

// ---------- registros ----------
export async function headersOf(mod: string): Promise<string[]> {
  const r = await q1<{ headers: string }>('SELECT headers FROM module_headers WHERE modulo=?', [mod]);
  const h = r ? JSON.parse(r.headers) : [];
  return Array.isArray(h) && h.length ? h : BASE_HEADERS;
}
type Exec = { query: (sql: string, p?: unknown[]) => Promise<unknown> };
export async function mergeHeaders(mod: string, keys: string[], c?: Exec): Promise<void> {
  const h = await headersOf(mod);
  const add = keys.filter((k) => !h.includes(k));
  if (!add.length) return;
  const sql = 'INSERT INTO module_headers(modulo,headers) VALUES(?,?) ON DUPLICATE KEY UPDATE headers=VALUES(headers)';
  const args = [mod, JSON.stringify([...h, ...add])];
  if (c) await c.query(sql, args);
  else await run(sql, args);
}
export async function listRows(mod: string): Promise<Row[]> {
  return (await q<{ data: string }>('SELECT data FROM records WHERE modulo=? ORDER BY criado_em,id', [mod])).map((r) => JSON.parse(r.data));
}
export async function getRow(mod: string, id: string): Promise<Row | null> {
  const r = await q1<{ data: string }>('SELECT data FROM records WHERE modulo=? AND id=?', [mod, id]);
  return r ? JSON.parse(r.data) : null;
}
/** Vínculos entre módulos: o registro apontado precisa existir (integridade referencial na aplicação, já que os dados ficam em JSON). */
const VINCULOS_VALIDADOS: Record<string, string> = { eventoEscolarId: 'calescolar' };
export async function validarVinculosGenericos(patch: Row): Promise<void> {
  for (const [campo, alvo] of Object.entries(VINCULOS_VALIDADOS)) {
    const v = strv(patch[campo]).trim();
    if (v && !(await getRow(alvo, v))) fail(400, `Vínculo inválido: ${campo} "${v}" não existe.`);
  }
}
export async function insertRow(mod: string, input: Row, ator: string): Promise<Row> {
  const clean = cleanInput(input);
  delete clean.id;
  await validarVinculosGenericos(clean);
  const id = await newId(mod);
  const t = now();
  const row: Row = { id, ...clean, criadoEm: t, atualizadoEm: t, criadoPor: ator };
  // registro, cabeçalhos e status inicial: tudo ou nada
  await withTx(async (c) => {
    await c.query('INSERT INTO records(modulo,id,data,criado_em,atualizado_em) VALUES(?,?,?,?,?)', [mod, id, JSON.stringify(row), t, t]);
    await mergeHeaders(mod, Object.keys(row), c);
    if (row.status) await logStatus(c, mod, id, '', String(row.status), ator, 'criação');
  });
  await audit(ator, 'criar', mod, id);
  return row;
}
/** Registra uma mudança de status (na mesma transação quando `c` é informado). */
export async function logStatus(c: { query: (sql: string, p: unknown[]) => Promise<unknown> } | null, mod: string, id: string, de: string, para: string, ator: string, motivo = '', campo = 'status'): Promise<void> {
  const sql = 'INSERT INTO status_history(modulo,registro,campo,de,para,ator,quando,motivo) VALUES(?,?,?,?,?,?,?,?)';
  const p = [mod, id, campo, de.slice(0, 120), para.slice(0, 120), ator.slice(0, 120), now(), motivo.slice(0, 500)];
  if (c) await c.query(sql, p);
  else await run(sql, p);
}
export async function saveRow(mod: string, row: Row): Promise<void> {
  await run('UPDATE records SET data=?,atualizado_em=? WHERE modulo=? AND id=?', [JSON.stringify(row), row.atualizadoEm, mod, row.id]);
  await mergeHeaders(mod, Object.keys(row));
}
/** Lê o registro com trava (SELECT … FOR UPDATE), aplica `fn` e grava: duas edições simultâneas não se sobrescrevem. */
export async function modifyRow(mod: string, id: string, fn: (cur: Row, c: any) => Row | Promise<Row>): Promise<Row> {
  const nw = await withTx(async (c) => {
    const [rs] = await c.query('SELECT data FROM records WHERE modulo=? AND id=? FOR UPDATE', [mod, id]);
    const cur = (rs as Row[])[0];
    if (!cur) fail(404, 'Registro não encontrado.');
    const merged = await fn(JSON.parse(cur.data), c);
    await c.query('UPDATE records SET data=?,atualizado_em=? WHERE modulo=? AND id=?', [JSON.stringify(merged), merged.atualizadoEm, mod, id]);
    return merged;
  });
  await mergeHeaders(mod, Object.keys(nw));
  return nw;
}
export async function updateRow(mod: string, id: string, patchIn: Row, ator: string): Promise<Row> {
  const patch = cleanInput(patchIn);
  for (const k of ['id', 'criadoEm', 'criadoPor', 'atualizadoPor']) delete patch[k];
  const motivoInformado = strv(patch.motivoTransicao);
  delete patch.motivoTransicao;
  await validarVinculosGenericos(patch);
  const nw = await modifyRow(mod, id, async (cur, c) => {
    if (patch.status !== undefined && String(patch.status) !== String(cur.status ?? ''))
      await logStatus(c, mod, id, String(cur.status ?? ''), String(patch.status), ator, motivoInformado.trim());
    if (patch.responsavel !== undefined && String(patch.responsavel).trim() !== String(cur.responsavel ?? '').trim() && String(cur.responsavel ?? '').trim() !== '')
      await logStatus(c, mod, id, String(cur.responsavel ?? ''), String(patch.responsavel), ator, motivoInformado.trim(), 'responsavel');
    for (const campo of ['prazo', 'publicacaoEm']) {
      if (patch[campo] !== undefined && strv(patch[campo]) !== strv(cur[campo]) && strv(cur[campo]) !== '') await logStatus(c, mod, id, strv(cur[campo]), strv(patch[campo]), ator, motivoInformado.trim(), campo);
    }
    return { ...cur, ...patch, atualizadoEm: now(), atualizadoPor: ator };
  });
  await audit(ator, 'editar', mod, id);
  return nw;
}
/** Exclusão definitiva (a tela pede confirmação). Apaga junto o histórico, os comentários e o checklist do registro. */
export async function deleteRow(mod: string, id: string, ator: string): Promise<void> {
  await getRow(mod, id) ?? fail(404, 'Registro não encontrado.');
  await run('DELETE FROM records WHERE modulo=? AND id=?', [mod, id]);
  for (const t of ['status_history', 'record_comments', 'record_checklist']) await run(`DELETE FROM ${t} WHERE modulo=? AND registro=?`, [mod, id]);
  await audit(ator, 'excluir', mod, id);
}
export function teamMayDelete(u: Row, row: Row): boolean {
  if (Number(u.admin)) return true;
  const resp = String(row.responsavel ?? '').trim();
  return (row.criadoPor ?? '') === u.codigo || resp === '' || lower(resp) === lower(u.nome);
}
// ---------- e-mail por pessoa ----------
export async function emailForPerson(name: string): Promise<string> {
  const n = lower(name.trim());
  if (!n) return '';
  for (const r of await q('SELECT nome,email FROM users WHERE ativo=1')) {
    if (lower(String(r.nome ?? '').trim()) === n && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(r.email ?? ''))) return String(r.email);
  }
  return '';
}
export { env, strv };
