import { Ctx } from '../ctx';
import { requireInternal } from '../auth';
import { q, q1, run } from '../db';
import { audit } from '../records';
import { fail, lower, now, Row, strv } from '../util';
import { lerXlsx } from '../xlsxLeitura';
import { json } from './handlers';
import { imagemSolicRoute } from './imagemSolic';
import { atualizarVencimentos } from '../imagemDados';
import { lerConfig } from '../imagemConfig';

/**
 * Uso de Imagem. Etapa 1: alunos (cadastro, importação sem apagar nada e busca) e painel.
 * Quem usa: a equipe de Marketing (qualquer usuário interno). Os dados dos alunos nunca saem destas rotas para páginas públicas.
 */
export const SEGMENTOS: Record<string, string> = { INFANTIL: 'Educação Infantil', FUND1: 'Anos Iniciais', FUND2: 'Anos Finais', MEDIO: 'Ensino Médio' };

/** Entende "Fundamental I", "Anos Iniciais", "EI", "3º ano EM"… e devolve a chave do segmento (ou '' se não reconhecer). */
export function segmentoDe(txt: string): string {
  const s = lower(txt).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  if (SEGMENTOS[txt.toUpperCase()]) return txt.toUpperCase();
  if (/(infantil|\bei\b|maternal|jardim|creche)/.test(s)) return 'INFANTIL';
  if (/(anos iniciais|fundamental (i|1)\b|fund (i|1)\b|\bf1\b|\bfi\b|\b[1-5] ?ano)/.test(s) && !/(finais|ii|2)\b/.test(s.replace(/\b[1-5] ?ano/, ''))) return 'FUND1';
  if (/(anos finais|fundamental (ii|2)\b|fund (ii|2)\b|\bf2\b|\bfii\b|\b[6-9] ?ano)/.test(s)) return 'FUND2';
  if (/(medio|\bem\b|\b[1-3] ?serie|ensino medio)/.test(s)) return 'MEDIO';
  if (/(iniciais|fundamental)/.test(s)) return /(finais|ii\b|2\b)/.test(s) ? 'FUND2' : 'FUND1';
  return '';
}

const limpa = (v: unknown, n: number) => strv(v).replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const alunoPublico = (r: Row) => ({ id: r.id, matricula: r.matricula, nome: r.nome, turma: r.turma, segmento: r.segmento, segmentoNome: SEGMENTOS[r.segmento] ?? 'Sem segmento', ativo: !!Number(r.ativo), atualizadoEm: r.atualizado_em, situacao: r.situacao ?? '' });

async function evento(ator: string, acao: string, alunoId: number | null, detalhe: string) {
  await run('INSERT INTO ui_eventos(quando,ator,acao,aluno_id,detalhe) VALUES(?,?,?,?,?)', [now(), ator, acao, alunoId, detalhe.slice(0, 400)]);
}

/** Valida uma linha de aluno; devolve o texto do erro ou os campos limpos. */
function validaAluno(b: Row): { erro: string } | { aluno: { matricula: string; nome: string; turma: string; segmento: string } } {
  const matricula = limpa(b.matricula, 40), nome = limpa(b.nome, 160), turma = limpa(b.turma, 60);
  if (!nome) return { erro: 'Falta o nome do aluno.' };
  if (!matricula) return { erro: 'Falta a matrícula.' };
  if (!/^[\p{L}\p{N}._/-]+$/u.test(matricula)) return { erro: 'A matrícula tem caracteres inválidos.' };
  const bruto = limpa(b.segmento, 60);
  const segmento = bruto ? segmentoDe(bruto) : segmentoDe(turma);
  if (bruto && !segmento) return { erro: `Segmento “${bruto}” não reconhecido (use Educação Infantil, Anos Iniciais, Anos Finais ou Ensino Médio).` };
  return { aluno: { matricula, nome, turma, segmento } };
}

export async function imagemRoute(c: Ctx): Promise<Response> {
  const { path, method } = c;
  const u = await requireInternal(c);
  const ator = String(u.nome ?? u.codigo ?? '');

  await atualizarVencimentos();
  const outra = await imagemSolicRoute(c, u);
  if (outra) return outra;

  if (path === '/imagem/alunos' && method === 'GET') {
    const busca = lower(c.qs('busca')).trim(), seg = c.qs('segmento'), turma = c.qs('turma'), inativos = c.qs('inativos') === '1', situ = c.qs('situacao').toUpperCase().replace(/[^A-Z_]/g, '');
    const like = `%${busca}%`;
    const rows = await q(
      `SELECT a.*, (SELECT s.status FROM ui_solicitacoes s WHERE s.aluno_id=a.id AND s.status<>'CANCELADO' ORDER BY s.id DESC LIMIT 1) situacao FROM ui_alunos a WHERE (a.ativo=1 OR ?=1) AND (?='' OR a.segmento=?) AND (?='' OR a.turma=?) AND (?='' OR LOWER(a.nome) LIKE ? OR a.matricula LIKE ?) HAVING (?='' OR (?='SEM' AND situacao IS NULL) OR situacao=?) ORDER BY a.nome LIMIT 1000`,
      [inativos ? 1 : 0, seg, seg, turma, turma, busca, like, like, situ, situ, situ],
    );
    const turmas = (await q('SELECT DISTINCT turma FROM ui_alunos WHERE ativo=1 AND turma<>\'\' ORDER BY turma')).map((r) => r.turma);
    const total = (await q1('SELECT COUNT(*) n FROM ui_alunos WHERE ativo=1'))?.n ?? 0;
    return json({ rows: rows.map(alunoPublico), turmas, total: Number(total), limite: rows.length >= 1000, segmentos: Object.entries(SEGMENTOS).map(([k, nome]) => ({ k, nome })) });
  }

  if (path === '/imagem/alunos' && method === 'POST') {
    const b = await c.body();
    const v = validaAluno(b);
    if ('erro' in v) fail(400, v.erro);
    const a = v.aluno, id = Number(b.id) || 0;
    if (id) {
      const atual = await q1('SELECT id FROM ui_alunos WHERE id=?', [id]) ?? fail(404, 'Aluno não encontrado.');
      const dup = await q1('SELECT id FROM ui_alunos WHERE matricula=? AND id<>?', [a.matricula, id]);
      if (dup) fail(409, 'Já existe outro aluno com esta matrícula.');
      await run('UPDATE ui_alunos SET matricula=?,nome=?,turma=?,segmento=?,atualizado_em=? WHERE id=?', [a.matricula, a.nome, a.turma, a.segmento, now(), atual.id]);
      await evento(ator, 'aluno-editado', id, a.nome);
      await audit(ator, 'imagem-aluno-editado', 'ui_alunos', String(id));
      return json({ ok: true, id });
    }
    if (await q1('SELECT id FROM ui_alunos WHERE matricula=?', [a.matricula])) fail(409, 'Já existe um aluno com esta matrícula.');
    await run('INSERT INTO ui_alunos(matricula,nome,turma,segmento,ativo,criado_em,atualizado_em) VALUES(?,?,?,?,1,?,?)', [a.matricula, a.nome, a.turma, a.segmento, now(), now()]);
    const novo = await q1('SELECT id FROM ui_alunos WHERE matricula=?', [a.matricula]);
    await evento(ator, 'aluno-criado', novo?.id ?? null, a.nome);
    await audit(ator, 'imagem-aluno-criado', 'ui_alunos', String(novo?.id ?? ''));
    return json({ ok: true, id: novo?.id }, 201);
  }

  if (path === '/imagem/alunos/ativo' && method === 'POST') {
    const b = await c.body(), id = Number(b.id) || 0, ativo = b.ativo ? 1 : 0;
    const r = await q1('SELECT id,nome FROM ui_alunos WHERE id=?', [id]) ?? fail(404, 'Aluno não encontrado.');
    await run('UPDATE ui_alunos SET ativo=?,atualizado_em=? WHERE id=?', [ativo, now(), id]);
    await evento(ator, ativo ? 'aluno-reativado' : 'aluno-inativado', id, String(r.nome));
    await audit(ator, ativo ? 'imagem-aluno-reativado' : 'imagem-aluno-inativado', 'ui_alunos', String(id));
    return json({ ok: true });
  }

  /** Lê um .xlsx enviado em base64 e devolve as linhas para o navegador montar a prévia. Não grava nada. */
  if (path === '/imagem/alunos/ler-planilha' && method === 'POST') {
    const b = await c.body();
    const dados = strv(b.base64);
    if (!dados || dados.length > 1_900_000) fail(400, 'Envie uma planilha de até 1,4 MB (ou salve como .csv).');
    try { return json({ linhas: lerXlsx(Buffer.from(dados, 'base64')) }); } catch (e) { fail(400, (e as Error).message); }
  }

  /** Importa (ou só confere, com `previa`) uma lista de alunos. Existentes são atualizados pela matrícula; nada é apagado. */
  if (path === '/imagem/alunos/importar' && method === 'POST') {
    const b = await c.body();
    const linhas = Array.isArray(b.linhas) ? (b.linhas as Row[]) : fail(400, 'Nenhuma linha para importar.');
    if (!linhas.length) fail(400, 'Nenhuma linha para importar.');
    if (linhas.length > 5000) fail(400, 'Importe até 5.000 alunos por vez.');
    const previa = !!b.previa;
    const out = { novos: 0, atualizados: 0, iguais: 0, erros: [] as { linha: number; erro: string }[], repetidos: 0 };
    const vistos = new Set<string>();
    for (let i = 0; i < linhas.length; i++) {
      const v = validaAluno(linhas[i]);
      if ('erro' in v) { out.erros.push({ linha: i + 1, erro: v.erro }); continue; }
      const a = v.aluno;
      if (vistos.has(a.matricula)) { out.repetidos++; out.erros.push({ linha: i + 1, erro: `Matrícula ${a.matricula} repetida na lista; usei só a primeira.` }); continue; }
      vistos.add(a.matricula);
      const atual = await q1('SELECT * FROM ui_alunos WHERE matricula=?', [a.matricula]);
      if (!atual) {
        out.novos++;
        if (!previa) await run('INSERT INTO ui_alunos(matricula,nome,turma,segmento,ativo,criado_em,atualizado_em) VALUES(?,?,?,?,1,?,?)', [a.matricula, a.nome, a.turma, a.segmento, now(), now()]);
      } else if (atual.nome !== a.nome || atual.turma !== a.turma || (a.segmento && atual.segmento !== a.segmento)) {
        out.atualizados++;
        if (!previa) await run('UPDATE ui_alunos SET nome=?,turma=?,segmento=?,atualizado_em=? WHERE id=?', [a.nome, a.turma, a.segmento || atual.segmento, now(), atual.id]);
      } else out.iguais++;
    }
    if (!previa) {
      await evento(ator, 'importacao', null, `${out.novos} novo(s), ${out.atualizados} atualizado(s), ${out.iguais} igual(is), ${out.erros.length} com problema`);
      await audit(ator, 'imagem-alunos-importados', 'ui_alunos', `${out.novos}+${out.atualizados}`);
    }
    return json({ ok: true, previa, ...out });
  }

  if (path === '/imagem/painel' && method === 'GET') {
    const ativos = Number((await q1('SELECT COUNT(*) n FROM ui_alunos WHERE ativo=1'))?.n ?? 0);
    const porSeg = await q('SELECT segmento, COUNT(*) n FROM ui_alunos WHERE ativo=1 GROUP BY segmento');
    const porSit: Record<string, number> = {};
    for (const r of await q("SELECT status, COUNT(*) n FROM (SELECT aluno_id, SUBSTRING_INDEX(GROUP_CONCAT(status ORDER BY id DESC), ',', 1) status FROM ui_solicitacoes WHERE status<>'CANCELADO' GROUP BY aluno_id) t GROUP BY status")) porSit[r.status] = Number(r.n);
    const cont = (...st: string[]) => st.reduce((a, k) => a + (porSit[k] ?? 0), 0);
    const cfg = await lerConfig(), limite = new Date(Date.now() + cfg.avisoVencimentoDias * 86400_000).toISOString().slice(0, 10), hoje = new Date().toISOString().slice(0, 10);
    const naoUsar = await q(`SELECT a.id, a.nome, a.turma, t.status, t.protocolo, t.vence_em FROM ui_alunos a JOIN ui_solicitacoes t ON t.id=(SELECT MAX(s.id) FROM ui_solicitacoes s WHERE s.aluno_id=a.id AND s.status<>'CANCELADO') WHERE a.ativo=1 AND t.status IN ('NAO_AUTORIZADO','VENCIDO','REVOGADO') ORDER BY a.nome LIMIT 40`);
    const vencemLogo = await q(`SELECT a.id, a.nome, a.turma, t.protocolo, t.vence_em FROM ui_alunos a JOIN ui_solicitacoes t ON t.id=(SELECT MAX(s.id) FROM ui_solicitacoes s WHERE s.aluno_id=a.id AND s.status<>'CANCELADO') WHERE a.ativo=1 AND t.status='AUTORIZADO' AND t.vence_em<>'' AND t.vence_em<=? AND t.vence_em>=? ORDER BY t.vence_em LIMIT 40`, [limite, hoje]);
    const recentes = await q('SELECT e.quando, e.ator, e.acao, e.detalhe, a.nome aluno FROM ui_eventos e LEFT JOIN ui_alunos a ON a.id=e.aluno_id ORDER BY e.id DESC LIMIT 8');
    return json({
      totalAlunos: ativos,
      autorizados: cont('AUTORIZADO'), pendentes: cont('AGUARDANDO_ENVIO', 'ENVIADO', 'ABERTO', 'AGUARDANDO_ASSINATURA', 'AGUARDANDO_VALIDACAO'), naoAutorizados: cont('NAO_AUTORIZADO'), vencidos: cont('VENCIDO'), revogados: cont('REVOGADO'), comSolicitacao: Object.values(porSit).reduce((a, n) => a + n, 0),
      segmentos: Object.entries(SEGMENTOS).map(([k, nome]) => ({ k, nome, n: Number(porSeg.find((r) => r.segmento === k)?.n ?? 0) })).concat([{ k: '', nome: 'Sem segmento', n: Number(porSeg.find((r) => !r.segmento)?.n ?? 0) }]),
      recentes, naoUsar, vencemLogo, avisoDias: cfg.avisoVencimentoDias,
    });
  }

  fail(404, 'Rota não encontrada.');
}
