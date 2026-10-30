import { randomBytes } from 'node:crypto';
import { q, q1, run } from './db';
import { now, Row } from './util';
import { normNome } from './carometro';
import { auditar, guardarFoto, prepararFoto, FotoPronta } from './carometroFoto';

/** Importação de fotos em lote: nada vira foto de aluno até o lote ser aplicado. A conciliação nunca associa por nome sozinha. */
export const MAX_ITENS_LOTE = 400;
const semExt = (n: string) => n.replace(/\.[A-Za-z0-9]{2,5}$/, '').trim();

/** Linhas "matricula;nome_arquivo;origem" (com ou sem cabeçalho; separador ; , ou tab). Devolve arquivo(minúsculo) → matrícula. */
export function lerManifesto(txt: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const lin of String(txt ?? '').replace(/^﻿/, '').split(/\r?\n/)) {
    if (!lin.trim()) continue;
    const c = lin.split(/[;\t,]/).map((x) => x.trim().replace(/^"|"$/g, ''));
    if (c.length < 2 || /^matr[ií]cula$/i.test(c[0])) continue;
    m.set(c[1].toLowerCase(), c[0]);
  }
  return m;
}

export interface AlunoLote { id: number; matricula: string; nome: string; turma: string }
export interface Conc { estado: 'ok' | 'sugerida' | 'ambigua' | 'orfa'; regra: string; confianca: string; aluno_id: number | null; motivo: string }

export function conciliar(arquivo: string, alunos: AlunoLote[], manifesto: Map<string, string>): Conc {
  const porMat = new Map(alunos.map((a) => [a.matricula.toLowerCase(), a]));
  const man = manifesto.get(arquivo.toLowerCase());
  if (man) {
    const a = porMat.get(man.toLowerCase());
    return a ? { estado: 'ok', regra: 'Manifesto', confianca: 'alta', aluno_id: a.id, motivo: '' }
      : { estado: 'orfa', regra: 'Manifesto', confianca: '', aluno_id: null, motivo: `Matrícula ${man} do manifesto não existe no cadastro.` };
  }
  const base = semExt(arquivo), ex = porMat.get(base.toLowerCase());
  if (ex) return { estado: 'ok', regra: 'Matrícula exata', confianca: 'alta', aluno_id: ex.id, motivo: '' };
  const nome = normNome(base.replace(/[_\-.]+/g, ' ')), cand = nome.length >= 5 ? alunos.filter((a) => normNome(a.nome) === nome) : [];
  if (cand.length === 1) return { estado: 'sugerida', regra: 'Nome', confianca: 'baixa', aluno_id: cand[0].id, motivo: 'Sugestão pelo nome do arquivo; confirme antes de aplicar.' };
  if (cand.length > 1) return { estado: 'ambigua', regra: 'Nome', confianca: '', aluno_id: null, motivo: `${cand.length} alunos com este nome; escolha o aluno.` };
  return { estado: 'orfa', regra: '', confianca: '', aluno_id: null, motivo: 'Nenhum aluno com esta matrícula ou nome.' };
}

const staged = (loteId: number, n: number, k: string) => `CAROMETRO/LOTE/${loteId}/${n}_${k}`;
const ins = (c: string, mime: string, b: Buffer) => run('INSERT INTO arquivos(caminho,mime,tamanho,conteudo,criado_em) VALUES(?,?,?,?,?)', [c, mime, b.length, b, now()]);

export async function novoLote(ator: string, manifesto: string): Promise<number> {
  const codigo = 'L' + randomBytes(8).toString('hex');
  await run('INSERT INTO cm_lotes(codigo,estado,criado_por,criado_em,manifesto) VALUES(?,?,?,?,?)', [codigo, 'simulado', ator, now(), manifesto.slice(0, 500_000)]);
  return Number((await q1('SELECT id FROM cm_lotes WHERE codigo=?', [codigo]))?.id);
}

export async function adicionarArquivo(loteId: number, nome: string, buf: Buffer, alunos: AlunoLote[], manifesto: Map<string, string>): Promise<void> {
  const total = Number((await q1('SELECT COUNT(*) n FROM cm_lote_itens WHERE lote_id=?', [loteId]))?.n ?? 0);
  const n = total + 1, limpo = nome.replace(/[^\w.\- ]/g, '_').slice(0, 190);
  const r = await prepararFoto(buf);
  if ('erro' in r) {
    await run("INSERT INTO cm_lote_itens(lote_id,nome_arquivo,estado,motivo) VALUES(?,?, 'invalida', ?)", [loteId, limpo, r.erro]);
    return;
  }
  const f = r as FotoPronta, c = conciliar(limpo, alunos, manifesto);
  const cam = { o: staged(loteId, n, 'original'), p: staged(loteId, n, 'padrao.jpg'), m: staged(loteId, n, 'mini.jpg') };
  await ins(cam.o, f.mime, f.original); await ins(cam.p, 'image/jpeg', f.padrao); await ins(cam.m, 'image/jpeg', f.mini);
  const ant = c.aluno_id ? (await q1('SELECT id FROM cm_fotos WHERE aluno_id=? AND ativa=1', [c.aluno_id]))?.id ?? null : null;
  await run('INSERT INTO cm_lote_itens(lote_id,nome_arquivo,estado,regra,confianca,aluno_id,motivo,caminho_original,caminho_padrao,caminho_mini,mime,largura,altura,tamanho,aviso,anterior_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    [loteId, limpo, c.estado, c.regra, c.confianca, c.aluno_id, c.motivo, cam.o, cam.p, cam.m, f.mime, f.largura, f.altura, f.original.length, f.aviso, ant]);
}

/** Itens do lote com o aluno, a foto atual e o conflito (várias fotos para o mesmo aluno) já calculados. */
export async function itensDoLote(loteId: number): Promise<Row[]> {
  const rows = await q(`SELECT i.*, a.nome aluno_nome, a.matricula, a.turma, (SELECT f.id FROM cm_fotos f WHERE f.aluno_id=i.aluno_id AND f.ativa=1 LIMIT 1) foto_atual FROM cm_lote_itens i LEFT JOIN ui_alunos a ON a.id=i.aluno_id WHERE i.lote_id=? ORDER BY i.id`, [loteId]);
  const cont = new Map<number, number>();
  for (const r of rows) if (r.aluno_id && ['ok', 'sugerida'].includes(String(r.estado))) cont.set(Number(r.aluno_id), (cont.get(Number(r.aluno_id)) ?? 0) + 1);
  return rows.map((r) => ({
    id: Number(r.id), arquivo: r.nome_arquivo, estado: r.estado, regra: r.regra, confianca: r.confianca, alunoId: r.aluno_id ? Number(r.aluno_id) : null,
    aluno: r.aluno_nome ?? '', matricula: r.matricula ?? '', turma: r.turma ?? '', motivo: r.motivo, largura: r.largura, altura: r.altura, tamanho: r.tamanho, aviso: r.aviso,
    substitui: !!r.foto_atual && ['ok', 'sugerida'].includes(String(r.estado)), conflito: !!r.aluno_id && ['ok', 'sugerida'].includes(String(r.estado)) && (cont.get(Number(r.aluno_id)) ?? 0) > 1, aplicado: !!r.foto_id,
  }));
}
export const resumoItens = (its: Row[]) => ({
  total: its.length, prontos: its.filter((i) => i.estado === 'ok' && !i.conflito).length, sugeridas: its.filter((i) => i.estado === 'sugerida').length, ambiguas: its.filter((i) => i.estado === 'ambigua').length,
  orfas: its.filter((i) => i.estado === 'orfa').length, invalidas: its.filter((i) => i.estado === 'invalida').length, ignoradas: its.filter((i) => i.estado === 'ignorada').length,
  conflitos: its.filter((i) => i.conflito).length, substituem: its.filter((i) => i.substitui && i.estado === 'ok').length,
});
export const pendentes = (its: Row[]) => its.filter((i) => ['sugerida', 'ambigua', 'orfa'].includes(String(i.estado)) || i.conflito).length;

async function apagarStaging(loteId: number): Promise<void> {
  await run('DELETE FROM arquivos WHERE caminho LIKE ?', [`CAROMETRO/LOTE/${loteId}/%`]);
}
export async function cancelarLote(loteId: number, ator: string): Promise<void> {
  await apagarStaging(loteId);
  await run("UPDATE cm_lotes SET estado='cancelado', resumo='Cancelado sem alterar nenhuma foto' WHERE id=?", [loteId]);
  await auditar(ator, 'lote-cancelado', null, `lote ${loteId}`);
}

export async function aplicarLote(loteId: number, ator: string): Promise<{ aplicadas: number; substituidas: number }> {
  const itens = await q("SELECT * FROM cm_lote_itens WHERE lote_id=? AND estado='ok' AND aluno_id IS NOT NULL ORDER BY id", [loteId]);
  let aplicadas = 0, substituidas = 0;
  for (const it of itens) {
    const buf = async (c: string) => Buffer.from((await q1('SELECT conteudo FROM arquivos WHERE caminho=?', [c]))?.conteudo);
    const original = await buf(it.caminho_original);
    const pronta = await prepararFoto(original);
    if ('erro' in pronta) continue;
    const ant = (await q1('SELECT id FROM cm_fotos WHERE aluno_id=? AND ativa=1', [it.aluno_id]))?.id ?? null;
    const fotoId = await guardarFoto(Number(it.aluno_id), pronta, String(it.nome_arquivo), `lote-${loteId}`, ator);
    await run('UPDATE cm_lote_itens SET foto_id=?, anterior_id=? WHERE id=?', [fotoId, ant, it.id]);
    aplicadas++; if (ant) substituidas++;
  }
  await apagarStaging(loteId);
  const resumo = `${aplicadas} foto(s) aplicada(s), ${substituidas} substituíram foto anterior`;
  await run("UPDATE cm_lotes SET estado='aplicado', aplicado_em=?, aplicado_por=?, resumo=? WHERE id=?", [now(), ator, resumo, loteId]);
  await auditar(ator, 'lote-aplicado', null, `lote ${loteId}: ${resumo}`);
  return { aplicadas, substituidas };
}

/** Desfaz o lote só onde nada mudou depois: a foto do lote ainda é a atual. A versão anterior volta a ser a atual. */
export async function desfazerLote(loteId: number, ator: string): Promise<{ desfeitas: number; mantidas: number }> {
  const itens = await q('SELECT * FROM cm_lote_itens WHERE lote_id=? AND foto_id IS NOT NULL', [loteId]);
  let desfeitas = 0, mantidas = 0;
  for (const it of itens) {
    const f = await q1('SELECT id,aluno_id,ativa FROM cm_fotos WHERE id=?', [it.foto_id]);
    if (!f || !Number(f.ativa)) { mantidas++; continue; }
    await run('UPDATE cm_fotos SET ativa=0, desativada_em=? WHERE id=?', [now(), f.id]);
    if (it.anterior_id) await run("UPDATE cm_fotos SET ativa=1, desativada_em='' WHERE id=?", [it.anterior_id]);
    desfeitas++;
  }
  const resumo = `${desfeitas} foto(s) desfeita(s); ${mantidas} mantida(s) porque já foram alteradas depois`;
  await run("UPDATE cm_lotes SET estado='desfeito', desfeito_em=?, resumo=? WHERE id=?", [now(), resumo, loteId]);
  await auditar(ator, 'lote-desfeito', null, `lote ${loteId}: ${resumo}`);
  return { desfeitas, mantidas };
}
