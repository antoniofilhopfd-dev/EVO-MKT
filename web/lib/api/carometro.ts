import { Ctx } from '../ctx';
import { requireInternal } from '../auth';
import { q, q1 } from '../db';
import { fail, lower, Row } from '../util';
import { json } from './handlers';
import { atualizarVencimentos } from '../imagemDados';
import { autorizacaoDe, compararTurmaCm, normNome, segmentoCm, SEGMENTOS_CM, serieDe } from '../carometro';

/**
 * Carômetro Escolar, etapa 1: consulta (somente leitura) sobre o cadastro de alunos do Uso de Imagem.
 * Só usuários internos. Nenhuma rota é pública e nenhuma grava dados.
 */
const anoLetivo = () => String(new Date().getFullYear());

const SQL_ALUNOS = `SELECT a.id, a.matricula, a.nome, a.turma,
  (SELECT s.status FROM ui_solicitacoes s WHERE s.aluno_id=a.id AND s.status<>'CANCELADO' ORDER BY s.id DESC LIMIT 1) situacao,
  (SELECT s.vence_em FROM ui_solicitacoes s WHERE s.aluno_id=a.id AND s.status<>'CANCELADO' ORDER BY s.id DESC LIMIT 1) vence_em,
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
    fotoId: null, _vence: String(r.vence_em ?? ''), _em: String(r.situacao_em ?? ''),
  }));
}
const publico = (a: Row) => { const { _vence, _em, ...p } = a; return p; };

export async function carometroRoute(c: Ctx): Promise<Response> {
  const { path, method } = c;
  await requireInternal(c);
  if (method !== 'GET') fail(405, 'No Carômetro desta etapa só há consulta.');
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
    const ind = { alunos: rows.length, comFoto: 0, semFoto: rows.length, duplicados: rows.filter((a) => a.duplicado).length, semTurma: rows.filter((a) => !a.segmento).length };
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
    return json({ aluno: { ...publico(a), anoLetivo: anoLetivo(), colegasNaTurma: colegas, autorizacaoFonte: fonte, autorizacaoDesde: String(ev?.autorizo_em ?? a._em ?? '').slice(0, 10), autorizacaoValeAte: a._vence } });
  }
  return fail(404, 'Rota não encontrada.');
}
