import { gzipSync } from 'node:zlib';
import { q, q1, run, withTx } from './db';
import { cleanInput, currentIp, fail, lower, now, Row, strv } from './util';
import { notifyMail } from './mail';
import { env, envInt } from './util';

export const EVO_VERSION = '5.0.0-web';
export const MODULES: Record<string, string> = {
  agenda: 'AGE', aprovacoes: 'APR', arquivos: 'ARQ', calendario: 'CAL', campanhas: 'CAM', configuracoes: 'CFG', conteudos: 'CON',
  equipe: 'EQP', eventos: 'EVT', ideias: 'IDE', instagram: 'INS', integracoes: 'INT', lixeira: 'LIX', projetos: 'PRJ',
  relatorios: 'REL', solicitacoes: 'SOL', tarefas: 'TAR', templates: 'TPL', trafego: 'TRF',
};
export const BASE_HEADERS = ['id', 'titulo', 'status', 'prioridade', 'responsavel', 'segmento', 'dataInicio', 'prazo', 'descricao', 'tags', 'origem', 'idExterno', 'ultimaSincronizacao', 'criadoEm', 'atualizadoEm'];
export const TEAM_WRITE = ['agenda', 'calendario', 'tarefas', 'projetos', 'eventos', 'conteudos', 'ideias', 'campanhas', 'aprovacoes', 'instagram', 'trafego', 'templates', 'arquivos', 'solicitacoes', 'relatorios'];
export const PUBLIC_FIELDS = ['id', 'titulo', 'status', 'prioridade', 'responsavel', 'segmento', 'solicitante', 'prazo', 'descricao', 'criadoEm', 'atualizadoEm', 'tipoSolicitacao', 'objetivo', 'publicoAlvo', 'mensagemPrincipal', 'canal', 'slaDias', 'prazoSLA', 'prazoNegociado', 'referencias', 'anexos', 'triagemStatus', 'retornoSolicitante', 'respostaSolicitante', 'aprovacaoSolicitante', 'motivoUrgencia', 'distribuidoEm', 'ajusteSolicitadoEm', 'respondidoSolicitanteEm', 'entregaEm', 'entregaEnviadaEm', 'aprovadoSolicitanteEm', 'arquivosEntrega', 'entregaMensagem', 'recorrente', 'recorrenciaFrequencia', 'recorrenciaFim', 'solicitanteNome', 'avaliacaoNota', 'avaliacaoComentario', 'avaliadoEm'];
export const CREATE_FIELDS = ['titulo', 'tipoSolicitacao', 'segmento', 'objetivo', 'publicoAlvo', 'mensagemPrincipal', 'canal', 'prazo', 'prioridade', 'motivoUrgencia', 'referencias', 'slaDias', 'prazoSLA', 'aprovacaoSolicitante', 'recorrente', 'recorrenciaFrequencia', 'recorrenciaFim', 'solicitanteNome'];
export const UPDATE_FIELDS = ['respostaSolicitante', 'respondidoSolicitanteEm', 'aprovacaoSolicitante', 'aprovadoSolicitanteEm', 'avaliacaoNota', 'avaliacaoComentario', 'avaliadoEm'];
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
export async function mergeHeaders(mod: string, keys: string[]): Promise<void> {
  const h = await headersOf(mod);
  const add = keys.filter((k) => !h.includes(k));
  if (!add.length) return;
  await run('INSERT INTO module_headers(modulo,headers) VALUES(?,?) ON DUPLICATE KEY UPDATE headers=VALUES(headers)', [mod, JSON.stringify([...h, ...add])]);
}
export async function listRows(mod: string): Promise<Row[]> {
  return (await q<{ data: string }>('SELECT data FROM records WHERE modulo=? ORDER BY criado_em,id', [mod])).map((r) => JSON.parse(r.data));
}
export async function getRow(mod: string, id: string): Promise<Row | null> {
  const r = await q1<{ data: string }>('SELECT data FROM records WHERE modulo=? AND id=?', [mod, id]);
  return r ? JSON.parse(r.data) : null;
}
export async function insertRow(mod: string, input: Row, ator: string): Promise<Row> {
  const clean = cleanInput(input);
  delete clean.id;
  const id = await newId(mod);
  const t = now();
  const row: Row = { id, ...clean, criadoEm: t, atualizadoEm: t, criadoPor: ator };
  await run('INSERT INTO records(modulo,id,data,criado_em,atualizado_em) VALUES(?,?,?,?,?)', [mod, id, JSON.stringify(row), t, t]);
  await mergeHeaders(mod, Object.keys(row));
  await audit(ator, 'criar', mod, id);
  return row;
}
export async function saveRow(mod: string, row: Row): Promise<void> {
  await run('UPDATE records SET data=?,atualizado_em=? WHERE modulo=? AND id=?', [JSON.stringify(row), row.atualizadoEm, mod, row.id]);
  await mergeHeaders(mod, Object.keys(row));
}
export async function updateRow(mod: string, id: string, patchIn: Row, ator: string): Promise<Row> {
  const cur = (await getRow(mod, id)) ?? fail(404, 'Registro não encontrado.');
  const patch = cleanInput(patchIn);
  for (const k of ['id', 'criadoEm', 'criadoPor', 'atualizadoPor']) delete patch[k];
  const nw: Row = { ...cur, ...patch, atualizadoEm: now(), atualizadoPor: ator };
  await saveRow(mod, nw);
  await audit(ator, 'editar', mod, id);
  return nw;
}
export async function trashRow(mod: string, id: string, ator: string): Promise<void> {
  const cur = (await getRow(mod, id)) ?? fail(404, 'Registro não encontrado.');
  if (mod === 'lixeira') {
    await run('DELETE FROM records WHERE modulo=? AND id=?', ['lixeira', id]);
    await audit(ator, 'excluir-permanente', 'lixeira', id);
    return;
  }
  const copy: Row = { ...cur };
  delete copy.id;
  copy.origem = mod;
  copy.idOriginal = id;
  await insertRow('lixeira', copy, ator);
  await run('DELETE FROM records WHERE modulo=? AND id=?', [mod, id]);
  await audit(ator, 'lixeira', mod, id);
}
export function publicRow(r: Row): Row {
  const o: Row = {};
  for (const k of PUBLIC_FIELDS) if (k in r) o[k] = r[k];
  return o;
}
export function teamMayDelete(u: Row, row: Row): boolean {
  if (u.role === 'manager') return true;
  const resp = String(row.responsavel ?? '').trim();
  return (row.criadoPor ?? '') === u.codigo || resp === '' || lower(resp) === lower(u.nome);
}

// ---------- backup (guardado no próprio banco; os últimos BACKUP_KEEP) ----------
const pad = (n: number) => String(n).padStart(2, '0');
export async function makeBackup(motivo = 'manual'): Promise<string> {
  const dump = {
    versao: EVO_VERSION, em: now(), motivo,
    records: await q('SELECT * FROM records'), headers: await q('SELECT * FROM module_headers'),
    counters: await q('SELECT * FROM id_counters'), used_ids: await q('SELECT id FROM used_ids'), notices: await q('SELECT * FROM notices'),
  };
  const d = new Date();
  const nome = `evo_backup_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}_${motivo.replace(/[^a-z0-9]/gi, '')}.json.gz`;
  await run('INSERT INTO backups(nome,criado_em,conteudo) VALUES(?,?,?) ON DUPLICATE KEY UPDATE conteudo=VALUES(conteudo)', [nome, now(), gzipSync(Buffer.from(JSON.stringify(dump)), { level: 6 })]);
  const keep = envInt('BACKUP_KEEP', 30);
  const old = await q<{ nome: string }>('SELECT nome FROM backups ORDER BY nome DESC LIMIT 1000 OFFSET ?', [keep]);
  for (const o of old) await run('DELETE FROM backups WHERE nome=?', [o.nome]);
  return nome;
}
export async function autoBackupIfDue(): Promise<void> {
  const r = await q1<{ m: string | null }>('SELECT MAX(criado_em) m FROM backups');
  const last = r?.m ? Date.parse(r.m) : 0;
  if (Date.now() - last > 86400_000) await makeBackup('auto');
}

// ---------- e-mail por pessoa / atribuição / fichas da Equipe ----------
export async function emailForPerson(name: string): Promise<string> {
  const n = lower(name.trim());
  if (!n) return '';
  for (const r of await listRows('equipe')) {
    if (lower(String(r.titulo ?? '').trim()) === n && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.email ?? '')) return r.email;
  }
  return '';
}
export async function notifyAssignment(mod: string, nw: Row, old: Row | null, actorName: string): Promise<void> {
  if (!['tarefas', 'projetos', 'conteudos', 'eventos', 'solicitacoes', 'agenda'].includes(mod)) return;
  const resp = String(nw.responsavel ?? '').trim();
  if (!resp || lower(resp) === lower(actorName)) return;
  if (old && lower(String(old.responsavel ?? '').trim()) === lower(resp)) return;
  const to = await emailForPerson(resp);
  if (!to) return;
  await notifyMail(`Nova atribuição: ${nw.titulo ?? nw.id}`, `Olá, ${resp}!\n\n${actorName} atribuiu a você: ${nw.titulo ?? ''}\nMódulo: ${mod} · Prazo: ${nw.prazo || '—'}\n\nAcesse o EVO MKT para ver os detalhes.`, to);
}
export async function seedEquipe(ator: string): Promise<number> {
  const have = (await listRows('equipe')).map((r) => lower(String(r.titulo ?? '').trim()));
  let n = 0;
  for (const u of await q('SELECT codigo,nome,role,label FROM users WHERE ativo=1 ORDER BY codigo')) {
    if (have.includes(lower(u.nome))) continue;
    await insertRow('equipe', { titulo: u.nome, status: 'ATIVO', funcao: u.label, nivelAcesso: u.role === 'manager' ? 'Administrador' : 'Marketing', capacidadeSemanal: '40', ativo: 'SIM', email: '', codigoInterno: u.codigo }, ator);
    n++;
  }
  return n;
}
export { env, strv };
