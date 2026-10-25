import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { q, q1, run } from './db';
import { makeBackup } from './backup';
import { now, Row } from './util';

/**
 * Migração 027 (reestruturação em cinco áreas).
 *  antes():  backup completo (com anexos) + cópia de tudo que será removido (arquivo "legadov6", só para consulta) + contagens.
 *  depois(): converte os materiais antigos em materiais das publicações e grava o relatório do que foi mantido, migrado e removido.
 */
export const MODULOS_REMOVIDOS = ['solicitacoes', 'tarefas', 'projetos', 'eventos', 'agenda', 'equipe', 'aprovacoes', 'relatorios', 'arquivos', 'integracoes', 'trafego', 'lixeira'];
const CHAVES_REMOVIDAS = ['portal_ativo', 'auto_tarefa_solicitacao', 'auto_recorrencia', 'g_auto_drive_entregas', 'g_drive_folder_id', 'g_sheet_id', 'g_sheet_url', 'g_sheet_modules', 'g_last_sheet_export', 'trafego_gestao', 'meta_ads_gestao', 'ads_regras', 'ads_relatorio_semanal', 'ads_rascunhos', 'ads_teto_dia', 'ads_teto_mes', 'ads_dias_max', 'ads_whatsapp', 'ads_raio_km'];

interface Antes { backup: string; legado: string; contagens: Record<string, number>; arquivosRemovidos: string[]; equipe: Row[] }
let antesGuardado: Antes | null = null;
const sha = (o: unknown) => createHash('sha256').update(JSON.stringify(o)).digest('hex');
const tabelaExiste = async (t: string) => !!(await q1('SELECT 1 FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=?', [t]));

export async function antes(): Promise<void> {
  // instalação nova (sem fichas e sem registros): não há o que proteger, e um backup sem Administrador não passaria na verificação
  const fichas = Number((await q1('SELECT COUNT(*) c FROM users'))?.c ?? 0), regs = Number((await q1('SELECT COUNT(*) c FROM records'))?.c ?? 0);
  if (!fichas && !regs) { antesGuardado = { backup: '', legado: '', contagens: {}, arquivosRemovidos: [], equipe: [] }; return; }
  const pad = (n: number) => String(n).padStart(2, '0');
  // 1) backup completo padrão (inclui anexos): é o ponto de volta
  const backup = await makeBackup('prereestruturacao', { completo: true });
  // 2) o que vai sair, guardado à parte (consulta; nunca restaurável)
  const marcas = MODULOS_REMOVIDOS.map(() => '?').join(',');
  const registros = await q(`SELECT modulo,id,data,criado_em,atualizado_em FROM records WHERE modulo IN (${marcas})`, MODULOS_REMOVIDOS);
  const tabelas: Record<string, Row[]> = { records: registros };
  for (const t of ['portal_users', 'notices', 'approval_links']) if (await tabelaExiste(t)) tabelas[t] = await q(`SELECT * FROM ${t}`);
  tabelas.integration_settings = await q(`SELECT k,v FROM integration_settings WHERE k IN (${CHAVES_REMOVIDAS.map(() => '?').join(',')})`, CHAVES_REMOVIDAS);
  const anexos = await q("SELECT caminho,mime,tamanho,conteudo,criado_em FROM arquivos WHERE caminho LIKE 'ANEXOS/SOLICITACOES/%'");
  const referenciados = (await q("SELECT data FROM records WHERE modulo IN ('conteudos','ideias','calendario','campanhas','templates')")).map((r) => String(r.data)).join('\n');
  const arquivosRemovidos: string[] = [];
  tabelas.arquivos = anexos.map((r) => {
    if (!referenciados.includes(String(r.caminho))) arquivosRemovidos.push(String(r.caminho));
    return { ...r, conteudo: (r.conteudo as Buffer).toString('base64') };
  });
  const manifesto: Record<string, { linhas: number; sha256: string }> = {};
  for (const [t, rows] of Object.entries(tabelas)) manifesto[t] = { linhas: rows.length, sha256: sha(rows) };
  const d = new Date();
  const nome = `evo_backup_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}_legadov6.json.gz`;
  const dump = { versao: '5.17.54', formato: 2, em: now(), motivo: 'legadov6', somenteLegado: true, completo: false, tabelas, manifesto, sha256_total: sha(manifesto) };
  await run('INSERT INTO backups(nome,criado_em,conteudo) VALUES(?,?,?) ON DUPLICATE KEY UPDATE conteudo=VALUES(conteudo)', [nome, now(), gzipSync(Buffer.from(JSON.stringify(dump)), { level: 6 })]);
  const contagens: Record<string, number> = {};
  for (const m of MODULOS_REMOVIDOS) contagens[m] = Number((await q1('SELECT COUNT(*) c FROM records WHERE modulo=?', [m]))?.c ?? 0);
  for (const [t, rows] of Object.entries(tabelas)) if (t !== 'records') contagens['tabela:' + t] = rows.length;
  const equipe = registros.filter((r) => r.modulo === 'equipe').map((r) => { try { return JSON.parse(String(r.data)) as Row; } catch { return {}; } });
  antesGuardado = { backup, legado: nome, contagens, arquivosRemovidos, equipe };
}

const papelDeEstado = (e: string) => (/FINAL/i.test(e) ? 'final' : 'producao');
const ehDrive = (u: string) => /^https:\/\/(drive|docs)\.google\.com\//i.test(u);
const novoId = (n: number) => 'M-' + String(n).padStart(4, '0');

/** Converte referências antigas (anexos, versões de arquivo, mídia do Instagram, registros da Biblioteca) em `materiais` da publicação. */
export async function materiaisDaPublicacao(r: Row, daBiblioteca: Row[]): Promise<Row[]> {
  const out: Row[] = [];
  const t = now();
  const ja = new Set<string>();
  const add = (papel: string, ref: string, nome: string, extra: Row = {}) => {
    ref = ref.trim();
    if (!ref || ja.has(papel + '|' + ref)) return;
    ja.add(papel + '|' + ref);
    const url = /^https?:\/\//i.test(ref);
    const bloco = /^(ANEXOS|BIBLIOTECA)\//.test(ref.replace(/\\/g, '/'));
    out.push({ id: novoId(out.length + 1), papel, tipo: url ? (ehDrive(ref) ? 'drive' : 'link') : bloco ? 'arquivo' : 'caminho', nome: (nome || ref.split(/[\\/]/).pop() || ref).slice(0, 160), ...(url ? { url: ref } : { caminho: ref }), versao: 1, grupo: papel + ':' + out.length, substituido: false, criadoEm: t, criadoPor: 'migracao', ...extra });
  };
  for (const a of String(r.anexos ?? '').split('|')) add('referencia', a, '');
  let versoes: Row[] = [];
  try { const x = JSON.parse(String(r.arquivoVersoes ?? '[]')); if (Array.isArray(x)) versoes = x; } catch { /* sem versões */ }
  versoes.forEach((v, i) => add(papelDeEstado(String(v.estado ?? '')), String(v.ref ?? v.referencia ?? v.arquivo ?? ''), `Versão ${v.versao ?? i + 1}`, { versao: Number(v.versao) || i + 1 }));
  if (r.arquivoFinal) add('final', String(r.arquivoFinal), 'Arquivo final');
  if (r.midiaInstagram) for (const m of String(r.midiaInstagram).split('|')) add('final', m, '');
  for (const b of daBiblioteca) add(/miniatura|capa/i.test(String(b.tagsArquivo ?? '')) ? 'miniatura' : 'referencia', String(b.caminhoArquivo ?? ''), String(b.titulo ?? ''));
  return out;
}

export async function depois(): Promise<void> {
  const a = antesGuardado;
  const t = now();
  const biblio = a ? [] : [];
  void biblio;
  // materiais das publicações: a Biblioteca antiga já foi apagada do banco, então vem da cópia guardada em `antes`
  const relBiblioteca: Record<string, Row[]> = {};
  if (a) {
    const leg = await q1('SELECT conteudo FROM backups WHERE nome=?', [a.legado]);
    if (leg) {
      const { gunzipSync } = await import('node:zlib');
      const d = JSON.parse(gunzipSync(leg.conteudo as Buffer).toString('utf8'));
      for (const r of (d.tabelas.records as Row[]).filter((x) => x.modulo === 'arquivos')) {
        try { const o = JSON.parse(String(r.data)); const cid = String(o.conteudoId ?? '').trim(); if (cid) (relBiblioteca[cid] ??= []).push(o); } catch { /* registro inválido */ }
      }
    }
  }
  let migrados = 0, publicacoes = 0;
  for (const row of await q("SELECT id,data FROM records WHERE modulo='conteudos'")) {
    let r: Row;
    try { r = JSON.parse(String(row.data)); } catch { continue; }
    publicacoes++;
    if (Array.isArray(r.materiais)) continue;
    const mats = await materiaisDaPublicacao(r, relBiblioteca[String(r.id)] ?? []);
    if (!mats.length) continue;
    r.materiais = mats;
    await run('UPDATE records SET data=? WHERE modulo=? AND id=?', [JSON.stringify(r), 'conteudos', row.id]);
    migrados += mats.length;
  }
  // arquivos que sobraram sem nenhuma publicação/registro apontando para eles (nada é apagado; só relatado)
  const usados = (await q("SELECT data FROM records WHERE modulo IN ('conteudos','ideias','calendario','campanhas','templates')")).map((r) => String(r.data)).join('\n');
  const semVinculo = (await q('SELECT caminho,tamanho,criado_em FROM arquivos ORDER BY criado_em DESC')).filter((r) => !usados.includes(String(r.caminho)));
  const relatorio = {
    geradoEm: t, versaoAnterior: '5.17.54', backup: a?.backup ?? '', copiaDosDadosRemovidos: a?.legado ?? '',
    removidos: a?.contagens ?? {}, anexosDeSolicitacoesApagados: a?.arquivosRemovidos ?? [],
    mantidos: { publicacoes }, materiaisMigrados: migrados,
    arquivosSemVinculo: { total: semVinculo.length, bytes: semVinculo.reduce((s, r) => s + Number(r.tamanho ?? 0), 0), lista: semVinculo.slice(0, 500).map((r) => ({ caminho: r.caminho, tamanho: Number(r.tamanho), criadoEm: r.criado_em })) },
  };
  await run('INSERT INTO relatorio_migracao(k,v,criado_em) VALUES(?,?,?) ON DUPLICATE KEY UPDATE v=VALUES(v),criado_em=VALUES(criado_em)', ['cinco_areas', JSON.stringify(relatorio), t]);
  antesGuardado = null;
}
