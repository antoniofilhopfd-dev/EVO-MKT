import { Ctx } from '../ctx';
import { requireAdmin, requireInternal, requireManager } from '../auth';
import { q, q1 } from '../db';
import { fail, lower, now, Row } from '../util';
import { json } from './handlers';
import { atualizarVencimentos } from '../imagemDados';
import { auditar, guardarFoto, historicoFotos, lerArquivoFoto, prepararFoto, FOTO_MAX_BYTES } from '../carometroFoto';
import { run } from '../db';
import { carometroLoteRoute } from './carometroLote';
import { autorizacaoDe, compararTurmaCm, normNome, segmentoCm, SEGMENTOS_CM, serieDe } from '../carometro';

/**
 * Carômetro Escolar, etapa 1: consulta (somente leitura) sobre o cadastro de alunos do Uso de Imagem.
 * Só usuários internos. Nenhuma rota é pública e nenhuma grava dados.
 */
const anoLetivo = () => String(new Date().getFullYear());

const SQL_ALUNOS = `SELECT a.id, a.matricula, a.nome, a.turma,
  (SELECT s.status FROM ui_solicitacoes s WHERE s.aluno_id=a.id AND s.status<>'CANCELADO' ORDER BY s.id DESC LIMIT 1) situacao,
  (SELECT s.vence_em FROM ui_solicitacoes s WHERE s.aluno_id=a.id AND s.status<>'CANCELADO' ORDER BY s.id DESC LIMIT 1) vence_em,
  (SELECT f.id FROM cm_fotos f WHERE f.aluno_id=a.id AND f.ativa=1 ORDER BY f.id DESC LIMIT 1) foto_id,
  (SELECT s.atualizado_em FROM ui_solicitacoes s WHERE s.aluno_id=a.id AND s.status<>'CANCELADO' ORDER BY s.id DESC LIMIT 1) situacao_em
  FROM ui_alunos a WHERE a.ativo=1`;

async function carregar(): Promise<Row[]> {
  await atualizarVencimentos();
  const rows = await q(SQL_ALUNOS);
  const nomes = new Map<string, number>();
  for (const r of rows) { const k = `${r.turma}|${normNome(String(r.nome))}`; nomes.set(k, (nomes.get(k) ?? 0) + 1); }
  return rows.map((r) => ({
    id: Number(r.id), matricula: String(r.matricula), nome: String(r.nome), turma: String(r.turma ?? ''),
    serie: serieDe(String(r.turma ?? '')), segmento: segmentoCm(String(r.turma ?? '')),
    autorizacao: autorizacaoDe(r.situacao), duplicado: (nomes.get(`${r.turma}|${normNome(String(r.nome))}`) ?? 0) > 1,
    fotoId: r.foto_id ? Number(r.foto_id) : null, _vence: String(r.vence_em ?? ''), _em: String(r.situacao_em ?? ''),
  }));
}
const publico = (a: Row) => { const { _vence, _em, ...p } = a; return p; };

export async function carometroRoute(c: Ctx): Promise<Response> {
  const { path, method } = c;
  const u = await requireInternal(c);
  const ator = String(u.nome ?? u.codigo ?? '');

  const lote = await carometroLoteRoute(c, ator);
  if (lote) return lote;

  // ---- fotos ----
  if (path === '/carometro/foto' && method === 'GET') {
    const tam = c.qs('tam') === 'original' ? 'original' : c.qs('tam') === 'mini' ? 'mini' : 'padrao';
    if (tam === 'original') await requireManager(c);
    const f = await lerArquivoFoto(Number(c.qs('id')) || 0, tam) ?? fail(404, 'Foto não encontrada.');
    if (tam === 'original') await auditar(ator, 'original-baixado', f.alunoId, '');
    const cab: Record<string, string> = { 'Content-Type': f.mime, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" };
    if (tam === 'original') cab['Content-Disposition'] = `attachment; filename="${f.nome.replace(/[^A-Za-z0-9._-]/g, '_') || 'foto'}"`;
    return new Response(new Uint8Array(f.buf), { headers: cab });
  }
  if (path === '/carometro/foto' && method === 'POST') {
    await requireManager(c);
    const form = await c.req.formData();
    const alunoId = Number(form.get('aluno_id')) || 0, arq = form.get('arquivo');
    await q1('SELECT id FROM ui_alunos WHERE id=? AND ativo=1', [alunoId]) ?? fail(404, 'Aluno não encontrado.');
    if (!(arq instanceof File) || !arq.size) fail(400, 'Escolha a foto.');
    if (arq.size > FOTO_MAX_BYTES) fail(413, 'A foto passa de 5 MB. Reduza o tamanho e envie de novo.');
    const pronta = await prepararFoto(Buffer.from(await arq.arrayBuffer()));
    if ('erro' in pronta) fail(400, pronta.erro);
    const id = await guardarFoto(alunoId, pronta, arq.name || 'foto', 'envio-individual', ator);
    return json({ ok: true, id, aviso: pronta.aviso });
  }
  if (path === '/carometro/foto/restaurar' && method === 'POST') {
    await requireManager(c);
    const b = await c.body(), f = await q1('SELECT id,aluno_id,versao,ativa FROM cm_fotos WHERE id=?', [Number(b.id) || 0]) ?? fail(404, 'Versão não encontrada.');
    if (Number(f.ativa)) fail(409, 'Esta versão já é a foto atual.');
    await run('UPDATE cm_fotos SET ativa=0, desativada_em=? WHERE aluno_id=? AND ativa=1', [now(), f.aluno_id]);
    await run('UPDATE cm_fotos SET ativa=1, desativada_em=\'\' WHERE id=?', [f.id]);
    await auditar(ator, 'foto-restaurada', Number(f.aluno_id), `versão ${f.versao}`);
    return json({ ok: true });
  }
  if (path === '/carometro/foto/remover' && method === 'POST') {
    await requireManager(c);
    const b = await c.body(), alunoId = Number(b.aluno_id) || 0;
    const f = await q1('SELECT id,versao FROM cm_fotos WHERE aluno_id=? AND ativa=1', [alunoId]) ?? fail(404, 'Este aluno não tem foto atual.');
    await run('UPDATE cm_fotos SET ativa=0, desativada_em=? WHERE id=?', [now(), f.id]);
    await auditar(ator, 'foto-retirada', alunoId, `versão ${f.versao} (continua no histórico)`);
    return json({ ok: true });
  }
  /** Exclusão definitiva de uma versão (original, padrão e miniatura). Só o Administrador. */
  if (path === '/carometro/foto/excluir' && method === 'POST') {
    await requireAdmin(c);
    const b = await c.body(), f = await q1('SELECT * FROM cm_fotos WHERE id=?', [Number(b.id) || 0]) ?? fail(404, 'Versão não encontrada.');
    for (const cam of [f.caminho_original, f.caminho_padrao, f.caminho_mini]) await run('DELETE FROM arquivos WHERE caminho=?', [cam]);
    await run('DELETE FROM cm_fotos WHERE id=?', [f.id]);
    await auditar(ator, 'foto-excluida', Number(f.aluno_id), `versão ${f.versao} apagada definitivamente`);
    return json({ ok: true });
  }
  if (method !== 'GET') fail(405, 'Método não permitido.');
  const todos = await carregar();

  if (path === '/carometro/alunos') {
    const busca = lower(c.qs('busca')).trim(), seg = c.qs('segmento'), serie = c.qs('serie'), turma = c.qs('turma'), aut = c.qs('autorizacao');
    const nb = normNome(busca);
    const rows = todos.filter((a) => (!seg || a.segmento === seg) && (!serie || a.serie === serie) && (!turma || a.turma === turma) && (!aut || a.autorizacao === aut)
      && (!nb || normNome(a.nome).includes(nb) || lower(a.matricula).includes(busca)));
    rows.sort((x, y) => compararTurmaCm(x.turma, y.turma) || x.nome.localeCompare(y.nome, 'pt-BR'));
    const base = todos.filter((a) => (!seg || a.segmento === seg));
    const series = [...new Set(base.map((a) => a.serie).filter(Boolean))].sort(compararTurmaCm);
    const turmas = [...new Set(base.filter((a) => !serie || a.serie === serie).map((a) => a.turma).filter(Boolean))].sort(compararTurmaCm);
    const ind = { alunos: rows.length, comFoto: rows.filter((a) => a.fotoId).length, semFoto: rows.filter((a) => !a.fotoId).length, duplicados: rows.filter((a) => a.duplicado).length, semTurma: rows.filter((a) => !a.segmento).length };
    return json({ anoLetivo: anoLetivo(), indicadores: ind, segmentos: SEGMENTOS_CM, series, turmas, total: rows.length, limite: 600, rows: rows.slice(0, 600).map(publico) });
  }

  if (path === '/carometro/turmas') {
    const porSeg = SEGMENTOS_CM.map((s) => {
      const alunos = todos.filter((a) => a.segmento === s.k);
      const mapa = new Map<string, number>();
      for (const a of alunos) mapa.set(a.turma, (mapa.get(a.turma) ?? 0) + 1);
      const series = new Map<string, { serie: string; turmas: { turma: string; alunos: number }[] }>();
      for (const [turma, n] of [...mapa].sort((x, y) => compararTurmaCm(x[0], y[0]))) {
        const sr = serieDe(turma) || turma, g = series.get(sr) ?? { serie: sr, turmas: [] };
        g.turmas.push({ turma, alunos: n }); series.set(sr, g);
      }
      return { ...s, alunos: alunos.length, series: [...series.values()] };
    });
    const semSeg = todos.filter((a) => !a.segmento);
    return json({ anoLetivo: anoLetivo(), segmentos: porSeg, semSegmento: semSeg.length, total: todos.length });
  }

  if (path === '/carometro/aluno') {
    const id = Number(c.qs('id'));
    const a = todos.find((x) => x.id === id) ?? fail(404, 'Aluno não encontrado.');
    const colegas = todos.filter((x) => x.turma === a.turma).length;
    const fonte = a.autorizacao === 'SEM_INFORMACAO' ? '' : 'Módulo Uso de Imagem';
    const ev = await q1('SELECT autorizo_em FROM ui_solicitacoes WHERE aluno_id=? AND status<>\'CANCELADO\' ORDER BY id DESC LIMIT 1', [id]);
    return json({ aluno: { ...publico(a), anoLetivo: anoLetivo(), colegasNaTurma: colegas, autorizacaoFonte: fonte, autorizacaoDesde: String(ev?.autorizo_em ?? a._em ?? '').slice(0, 10), autorizacaoValeAte: a._vence }, fotos: await historicoFotos(id), podeEditar: u.role === 'manager', podeExcluir: !!Number(u.admin) });
  }
  return fail(404, 'Rota não encontrada.');
}
