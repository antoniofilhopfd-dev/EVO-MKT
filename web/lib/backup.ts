import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { q, q1, run, withTx } from './db';
import { notifyMail } from './mail';
import { audit } from './records';
import { envInt, fail, now, Row } from './util';

export const BACKUP_FORMAT = 2;
export const BACKUP_NAME_RE = /^evo_backup_[0-9]{8}_[0-9]{6}_[A-Za-z0-9]+\.json\.gz$/;

/** Tabelas do backup (colunas explícitas: o restaurador nunca confia em nomes de coluna vindos do arquivo). */
const TABLES: Record<string, { cols: string[]; restore: 'replace' | 'merge' | 'ignore' | 'counters' | 'info'; opt?: boolean }> = {
  records: { cols: ['modulo', 'id', 'data', 'criado_em', 'atualizado_em'], restore: 'replace' },
  module_headers: { cols: ['modulo', 'headers'], restore: 'replace' },
  id_counters: { cols: ['modulo', 'n'], restore: 'counters' },
  used_ids: { cols: ['id'], restore: 'ignore' },
  notices: { cols: ['id', 'data'], restore: 'replace' },
  users: { cols: ['codigo', 'nome', 'role', 'label', 'admin', 'pass_hash', 'must_change', 'ativo', 'acesso_hmac', 'acesso_enc'], restore: 'replace' },
  portal_users: { cols: ['codigo', 'nome', 'perfil', 'segmentos', 'pass_hash', 'must_change', 'ativo', 'acesso_hmac', 'acesso_enc'], restore: 'replace' },
  integration_settings: { cols: ['k', 'v'], restore: 'replace' },
  google_event_map: { cols: ['modulo', 'id', 'event_id', 'hash'], restore: 'replace' },
  ig_publish: { cols: ['conteudo_id', 'status', 'container_id', 'media_id', 'erro', 'quando'], restore: 'replace' },
  // tabelas acrescentadas depois do formato 2 original: backups mais antigos não as trazem (opt = ausência não é erro)
  status_history: { cols: ['id', 'modulo', 'registro', 'campo', 'de', 'para', 'ator', 'quando', 'motivo'], restore: 'replace', opt: true },
  notifications: { cols: ['id', 'quando', 'tipo', 'modulo', 'registro', 'destino', 'titulo', 'texto', 'lida'], restore: 'replace', opt: true },
  approval_links: { cols: ['token_hash', 'solicitacao', 'criado_por', 'criado_em', 'expira_em', 'usado_em', 'decisao', 'aprovador'], restore: 'replace', opt: true },
  record_comments: { cols: ['id', 'modulo', 'registro', 'autor', 'autor_tipo', 'quando', 'texto', 'interno'], restore: 'replace', opt: true },
  record_checklist: { cols: ['id', 'modulo', 'registro', 'texto', 'feito', 'ordem', 'atualizado_em'], restore: 'replace', opt: true },
  ads_snapshots: { cols: ['id', 'conta', 'campanha_id', 'campanha', 'periodo', 'gasto', 'impressoes', 'alcance', 'cliques', 'resultados', 'conversas', 'inicio', 'moeda', 'status', 'objetivo', 'orcamento_diario', 'atualizado_em'], restore: 'replace', opt: true },
  ig_seguidores: { cols: ['conta', 'dia', 'seguidores', 'seguindo', 'midias', 'atualizado_em'], restore: 'replace', opt: true },
  datacom_ajustes: { cols: ['catalogo_id', 'relevante', 'observacoes', 'atualizado_em', 'atualizado_por'], restore: 'replace', opt: true },
  datacom_categorias: { cols: ['codigo', 'nome', 'criado_em', 'criado_por'], restore: 'replace', opt: true },
  ads_ids: { cols: ['meta_id', 'nivel', 'codigo', 'criado_em'], restore: 'replace', opt: true },
  ads_vinculos: { cols: ['ad_id', 'conteudo_id', 'quem', 'quando'], restore: 'replace', opt: true },
  ads_diario: { cols: ['conta', 'dia', 'gasto', 'impressoes', 'cliques', 'resultados', 'conversas', 'moeda', 'atualizado_em'], restore: 'replace', opt: true },
  ads_anuncios: { cols: ['conta', 'anuncio_id', 'periodo', 'anuncio', 'campanha', 'gasto', 'impressoes', 'alcance', 'cliques', 'resultados', 'conversas', 'inicio', 'moeda', 'status', 'problema', 'ativo', 'atualizado_em'], restore: 'replace', opt: true },
  ads_lancamentos: { cols: ['id', 'chave', 'quem', 'quando', 'tipo', 'referencia', 'titulo', 'objetivo', 'orcamento_dia', 'dias', 'inicio', 'fim', 'compromisso', 'moeda', 'publico', 'campanha_id', 'conjunto_id', 'anuncio_id', 'estado', 'erro', 'atualizado_em'], restore: 'replace', opt: true },
  ads_acoes: { cols: ['id', 'quando', 'quem', 'nivel', 'objeto_id', 'nome', 'acao', 'antes', 'depois', 'resultado', 'erro'], restore: 'replace', opt: true },
  audit_log: { cols: ['id', 'quando', 'ator', 'acao', 'modulo', 'registro', 'ip'], restore: 'info' },
};
const FILES_TABLE = { name: 'arquivos', cols: ['caminho', 'mime', 'tamanho', 'conteudo', 'criado_em'] };
const MAX_FILES_BYTES = 60 * 1024 * 1024; // anexos no backup "completo": limite de segurança

const sha = (o: unknown) => createHash('sha256').update(JSON.stringify(o)).digest('hex');
const pad = (n: number) => String(n).padStart(2, '0');

async function logBackup(acao: string, nome: string, status: 'OK' | 'ERRO', detalhe: string): Promise<void> {
  try {
    await run('INSERT INTO backup_log(quando,acao,nome,status,detalhe) VALUES(?,?,?,?,?)', [now(), acao, nome, status, detalhe.slice(0, 480)]);
    await run('DELETE FROM backup_log WHERE id < (SELECT m FROM (SELECT MAX(id)-500 m FROM backup_log) x)');
  } catch {
    /* o log nunca derruba a operação */
  }
}

/** Monta o conteúdo do backup (sem gravar). */
async function collect(motivo: string, completo: boolean): Promise<{ dump: Row; resumo: Record<string, number> }> {
  const tabelas: Record<string, Row[]> = {};
  for (const [t, spec] of Object.entries(TABLES)) {
    const extra = t === 'audit_log' ? ' ORDER BY id DESC LIMIT 20000' : '';
    tabelas[t] = await q(`SELECT ${spec.cols.join(',')} FROM ${t}${extra}`);
  }
  let anexosIncompletos = false;
  if (completo) {
    const tot = Number((await q1('SELECT COALESCE(SUM(tamanho),0) s FROM arquivos'))?.s ?? 0);
    if (tot > MAX_FILES_BYTES) {
      anexosIncompletos = true;
      tabelas[FILES_TABLE.name] = [];
    } else {
      tabelas[FILES_TABLE.name] = (await q(`SELECT ${FILES_TABLE.cols.join(',')} FROM arquivos`)).map((r) => ({ ...r, conteudo: (r.conteudo as Buffer).toString('base64') }));
    }
  }
  const manifesto: Record<string, { linhas: number; sha256: string }> = {};
  const resumo: Record<string, number> = {};
  for (const [t, rows] of Object.entries(tabelas)) {
    manifesto[t] = { linhas: rows.length, sha256: sha(rows) };
    resumo[t] = rows.length;
  }
  const dump = { versao: '5.x', formato: BACKUP_FORMAT, em: now(), motivo, completo, anexosIncompletos, tabelas, manifesto, sha256_total: sha(manifesto) };
  return { dump, resumo };
}

export async function makeBackup(motivo = 'manual', opts: { completo?: boolean } = {}): Promise<string> {
  const d = new Date();
  const nome = `evo_backup_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}_${motivo.replace(/[^a-z0-9]/gi, '') || 'x'}.json.gz`;
  try {
    const { dump, resumo } = await collect(motivo, !!opts.completo);
    const gz = gzipSync(Buffer.from(JSON.stringify(dump)), { level: 6 });
    // confere o que acabou de ser gerado ANTES de considerar o backup válido
    const check = validateBuffer(gz);
    if (!check.ok) throw new Error('Backup gerado não passou na verificação: ' + check.erros.join('; '));
    await run('INSERT INTO backups(nome,criado_em,conteudo) VALUES(?,?,?) ON DUPLICATE KEY UPDATE conteudo=VALUES(conteudo)', [nome, now(), gz]);
    const keep = envInt('BACKUP_KEEP', 30);
    const old = await q<{ nome: string }>('SELECT nome FROM backups ORDER BY nome DESC LIMIT 1000 OFFSET ?', [keep]);
    for (const o of old) await run('DELETE FROM backups WHERE nome=?', [o.nome]);
    await logBackup('criar', nome, 'OK', `${Object.entries(resumo).map(([k, v]) => `${k}:${v}`).join(' ')} · ${(gz.length / 1024).toFixed(0)} KB${dump.anexosIncompletos ? ' · anexos acima do limite: não incluídos' : ''}`);
    return nome;
  } catch (e: any) {
    await logBackup('criar', nome, 'ERRO', String(e?.message ?? e));
    throw e;
  }
}

/** Backup diário: nunca registra sucesso se falhou; avisa a Gerente por e-mail (no máximo uma vez por dia). */
export async function autoBackupIfDue(): Promise<void> {
  const r = await q1<{ m: string | null }>("SELECT MAX(criado_em) m FROM backups WHERE nome LIKE '%\\_auto.json.gz'");
  const last = r?.m ? Date.parse(r.m) : 0;
  if (Date.now() - last <= 86400_000) return;
  const falhou = await q1("SELECT quando FROM backup_log WHERE acao='criar' AND status='ERRO' AND nome LIKE '%\\_auto.json.gz' ORDER BY id DESC LIMIT 1");
  if (falhou && Date.now() - Date.parse(falhou.quando) < 86400_000) return; // já avisou hoje
  try {
    await makeBackup('auto');
  } catch (e: any) {
    await notifyMail('Falha no backup automático', `O backup diário do EVO MKT falhou: ${String(e?.message ?? e).slice(0, 300)}\nVerifique em Administração → Backups.`);
  }
}

export interface Validation { ok: boolean; formato: number; erros: string[]; avisos: string[]; resumo: Record<string, number>; em: string }

/** Verifica estrutura, contagens e hashes. Backups antigos (formato 1) passam com aviso, sem verificação de integridade. */
export function validateBuffer(gz: Buffer): Validation {
  const out: Validation = { ok: false, formato: 0, erros: [], avisos: [], resumo: {}, em: '' };
  let dump: Row;
  try {
    dump = JSON.parse(gunzipSync(gz).toString('utf8'));
  } catch {
    out.erros.push('Arquivo corrompido: não foi possível descompactar/ler.');
    return out;
  }
  out.em = String(dump.em ?? '');
  if (!dump.tabelas) {
    // formato 1 (anterior): records/headers/counters/used_ids/notices na raiz
    out.formato = 1;
    for (const k of ['records', 'headers', 'counters', 'used_ids', 'notices']) {
      if (!Array.isArray(dump[k])) out.erros.push(`Formato 1: faltou "${k}".`);
      else out.resumo[k] = dump[k].length;
    }
    out.avisos.push('Backup antigo (formato 1): sem fichas de acesso, configurações nem verificação de integridade. Só dados dos módulos serão restaurados.');
    out.ok = out.erros.length === 0;
    return out;
  }
  out.formato = Number(dump.formato ?? 0);
  if (out.formato !== BACKUP_FORMAT) out.erros.push(`Formato ${out.formato} não suportado.`);
  const tabelas = dump.tabelas as Record<string, Row[]>;
  const man = (dump.manifesto ?? {}) as Record<string, { linhas: number; sha256: string }>;
  if (sha(man) !== dump.sha256_total) out.erros.push('Manifesto adulterado ou incompleto.');
  for (const t of [...Object.keys(TABLES), ...(dump.completo ? [FILES_TABLE.name] : [])]) {
    const rows = tabelas[t];
    if (!Array.isArray(rows)) { if (TABLES[t]?.opt) out.avisos.push(`Backup anterior à tabela "${t}": ela não será alterada na restauração.`); else out.erros.push(`Tabela "${t}" ausente.`); continue; }
    out.resumo[t] = rows.length;
    if (!man[t] || man[t].linhas !== rows.length) out.erros.push(`Tabela "${t}": contagem não confere.`);
    else if (man[t].sha256 !== sha(rows)) out.erros.push(`Tabela "${t}": conteúdo não confere (hash).`);
  }
  if (!Array.isArray(tabelas.users) || !tabelas.users.some((u) => u.role === 'manager' && Number(u.ativo) === 1 && (u.admin === undefined || Number(u.admin) === 1))) out.erros.push('O backup não tem nenhum Administrador ativo; restaurar deixaria o sistema sem acesso.');
  if (dump.anexosIncompletos) out.avisos.push('Anexos acima do limite do backup: não foram incluídos (use o dump do banco para eles).');
  if (!dump.completo) out.avisos.push('Backup sem anexos: arquivos enviados não são alterados na restauração.');
  out.ok = out.erros.length === 0;
  return out;
}

async function loadBackup(nome: string): Promise<Buffer> {
  if (!BACKUP_NAME_RE.test(nome)) fail(400, 'Arquivo inválido.');
  const r = await q1('SELECT conteudo FROM backups WHERE nome=?', [nome]);
  if (!r) fail(404, 'Backup não encontrado.');
  return r.conteudo as Buffer;
}

export async function validateBackup(nome: string): Promise<Validation> {
  const v = validateBuffer(await loadBackup(nome));
  await logBackup('validar', nome, v.ok ? 'OK' : 'ERRO', v.ok ? `formato ${v.formato}` : v.erros.join('; '));
  return v;
}

const insertChunks = async (c: any, table: string, cols: string[], rows: any[][]) => {
  for (let i = 0; i < rows.length; i += 400) await c.query(`INSERT INTO ${table}(${cols.join(',')}) VALUES ?`, [rows.slice(i, i + 400)]);
};

/**
 * Restaura um backup: valida, cria um backup de segurança, e aplica tudo em UMA transação.
 * - IDs nunca são reutilizados: contadores ficam no maior valor entre o atual e o do backup; ids usados são acumulados.
 * - A sessão da Gerente que restaura é preservada (se a ficha dela existir no backup).
 */
export async function restoreBackup(nome: string, ator: string): Promise<{ restaurado: Record<string, number>; seguranca: string; avisos: string[] }> {
  const gz = await loadBackup(nome);
  const v = validateBuffer(gz);
  if (!v.ok) {
    await logBackup('restaurar', nome, 'ERRO', 'recusado: ' + v.erros.join('; '));
    fail(400, 'Backup inválido, restauração recusada: ' + v.erros.join(' '));
  }
  const seguranca = await makeBackup('prerestauracao', { completo: false });
  const dump = JSON.parse(gunzipSync(gz).toString('utf8'));
  const restaurado: Record<string, number> = {};
  try {
    await withTx(async (c) => {
      const legado = !dump.tabelas;
      const T: Record<string, Row[]> = legado
        ? { records: dump.records, module_headers: dump.headers, id_counters: dump.counters, used_ids: dump.used_ids, notices: dump.notices }
        : dump.tabelas;
      const [cur] = await c.query('SELECT modulo,n FROM id_counters');
      const maxCur: Record<string, number> = {};
      for (const r of cur as Row[]) maxCur[r.modulo] = Number(r.n);
      for (const [t, spec] of Object.entries(TABLES)) {
        const rows = T[t];
        if (!Array.isArray(rows) || spec.restore === 'info') continue;
        // backups anteriores à separação Administrador × Gerente não têm "admin": toda Gerente daquela época vira Administradora
        const data = rows.map((r) => spec.cols.map((k) => (k === 'admin' && t === 'users' && r.admin === undefined ? (r.role === 'manager' ? 1 : 0) : r[k] === undefined ? null : r[k])));
        if (spec.restore === 'replace') {
          await c.query(`DELETE FROM ${t}`);
          await insertChunks(c, t, spec.cols, data);
        } else if (spec.restore === 'counters') {
          const merged = new Map<string, number>(Object.entries(maxCur));
          for (const r of rows) merged.set(r.modulo, Math.max(merged.get(r.modulo) ?? 0, Number(r.n)));
          await c.query('DELETE FROM id_counters');
          await insertChunks(c, 'id_counters', ['modulo', 'n'], [...merged.entries()]);
        } else if (spec.restore === 'ignore') {
          for (let i = 0; i < data.length; i += 400) await c.query(`INSERT IGNORE INTO ${t}(${spec.cols.join(',')}) VALUES ?`, [data.slice(i, i + 400)]);
        }
        restaurado[t] = rows.length;
      }
      if (Array.isArray(T[FILES_TABLE.name])) {
        for (const r of T[FILES_TABLE.name]) {
          await c.query('INSERT INTO arquivos(caminho,mime,tamanho,conteudo,criado_em) VALUES(?,?,?,?,?) ON DUPLICATE KEY UPDATE mime=VALUES(mime),tamanho=VALUES(tamanho),conteudo=VALUES(conteudo)', [r.caminho, r.mime, r.tamanho, Buffer.from(r.conteudo, 'base64'), r.criado_em]);
        }
        restaurado[FILES_TABLE.name] = T[FILES_TABLE.name].length;
      }
      if (!legado) {
        // sessões: só a de quem restaurou continua, e apenas se a ficha existir no backup restaurado
        const [ex] = await c.query("SELECT 1 FROM users WHERE codigo=? AND role='manager' AND ativo=1", [ator]);
        if ((ex as Row[]).length) await c.query('DELETE FROM sessions WHERE NOT (tipo=? AND codigo=?)', ['int', ator]);
        else await c.query('DELETE FROM sessions');
        await c.query('DELETE FROM trusted_devices WHERE codigo NOT IN (SELECT codigo FROM users UNION SELECT codigo FROM portal_users)');
      }
    });
  } catch (e: any) {
    await logBackup('restaurar', nome, 'ERRO', 'falhou e foi desfeito: ' + String(e?.message ?? e));
    throw e;
  }
  await logBackup('restaurar', nome, 'OK', `${Object.entries(restaurado).map(([k, n]) => `${k}:${n}`).join(' ')} · segurança: ${seguranca}`);
  await audit(ator, 'restaurar-backup', '', nome);
  return { restaurado, seguranca, avisos: v.avisos };
}

export async function backupLog(limit = 30): Promise<Row[]> {
  return q('SELECT quando,acao,nome,status,detalhe FROM backup_log ORDER BY id DESC LIMIT ' + Math.min(100, Math.max(1, limit)));
}
