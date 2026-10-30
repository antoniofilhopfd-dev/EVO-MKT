import { Ctx } from '../ctx';
import { requireManager } from '../auth';
import { q, q1, run } from '../db';
import { fail, now, Row, strv } from '../util';
import { json } from './handlers';
import { auditar } from '../carometroFoto';
import { autorizacaoDe, compararTurmaCm } from '../carometro';

const limpa = (v: unknown, n: number) => strv(v).replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const MAX_SEL = 600;

const alunosDe = (ids: number[]) => ids.length
  ? q(`SELECT a.id,a.matricula,a.nome,a.turma,(SELECT f.id FROM cm_fotos f WHERE f.aluno_id=a.id AND f.ativa=1 LIMIT 1) foto_id,
        (SELECT s.status FROM ui_solicitacoes s WHERE s.aluno_id=a.id AND s.status<>'CANCELADO' ORDER BY s.id DESC LIMIT 1) situacao
        FROM ui_alunos a WHERE a.ativo=1 AND a.id IN (${ids.map(() => '?').join(',')})`, ids)
  : Promise.resolve([] as Row[]);
const publico = (a: Row) => ({ id: Number(a.id), matricula: String(a.matricula), nome: String(a.nome), turma: String(a.turma ?? ''), fotoId: a.foto_id ? Number(a.foto_id) : null, autorizacao: autorizacaoDe(a.situacao) });
const ordena = (rows: Row[]) => rows.sort((x, y) => compararTurmaCm(String(x.turma), String(y.turma)) || String(x.nome).localeCompare(String(y.nome), 'pt-BR'));

/** Seleções salvas e sessões de fotos. Seleções: cada pessoa edita as suas (o Administrador, todas); compartilhadas todos veem. Sessões: a Gerência cria e edita. */
export async function carometroSelRoute(c: Ctx, u: Row, ator: string): Promise<Response | null> {
  const { path, method } = c;
  if (!/^\/carometro\/(selec|sess)/.test(path)) return null;
  const admin = !!Number(u.admin), meu = String(u.codigo ?? '');
  const podeSel = (s: Row) => admin || String(s.dono) === meu;

  // ---------- seleções ----------
  if (path === '/carometro/selecoes' && method === 'GET') {
    const rows = await q(`SELECT s.*, (SELECT COUNT(*) FROM cm_selecao_itens i JOIN ui_alunos a ON a.id=i.aluno_id AND a.ativo=1 WHERE i.selecao_id=s.id) n,
      (SELECT COUNT(DISTINCT a.turma) FROM cm_selecao_itens i JOIN ui_alunos a ON a.id=i.aluno_id AND a.ativo=1 WHERE i.selecao_id=s.id) turmas
      FROM cm_selecoes s WHERE s.dono=? OR s.compartilhada=1 ORDER BY s.atualizado_em DESC, s.id DESC`, [meu]);
    return json({ rows: rows.map((s) => ({ id: Number(s.id), nome: s.nome, dono: s.dono_nome, meu: String(s.dono) === meu, podeEditar: podeSel(s), compartilhada: !!Number(s.compartilhada), alunos: Number(s.n), turmas: Number(s.turmas), atualizadoEm: s.atualizado_em })) });
  }
  if (path === '/carometro/selecao' && method === 'GET') {
    const s = await q1('SELECT * FROM cm_selecoes WHERE id=?', [Number(c.qs('id')) || 0]);
    if (!s || (String(s.dono) !== meu && !Number(s.compartilhada) && !admin)) fail(404, 'Seleção não encontrada.');
    const ids = (await q('SELECT aluno_id FROM cm_selecao_itens WHERE selecao_id=?', [s.id])).map((r) => Number(r.aluno_id));
    return json({ selecao: { id: Number(s.id), nome: s.nome, dono: s.dono_nome, compartilhada: !!Number(s.compartilhada), podeEditar: podeSel(s) }, alunos: ordena(await alunosDe(ids)).map(publico) });
  }
  if (path === '/carometro/selecao' && method === 'POST') {
    const b = await c.body(), nome = limpa(b.nome, 120), id = Number(b.id) || 0;
    const ids = [...new Set((Array.isArray(b.aluno_ids) ? b.aluno_ids : []).map(Number).filter((n) => n > 0))];
    if (!nome) fail(400, 'Dê um nome à seleção.');
    if (!ids.length) fail(400, 'Escolha ao menos um aluno.');
    if (ids.length > MAX_SEL) fail(400, `Uma seleção aceita até ${MAX_SEL} alunos.`);
    const validos = (await alunosDe(ids)).map((a) => Number(a.id));
    if (!validos.length) fail(400, 'Nenhum dos alunos escolhidos está ativo.');
    const comp = b.compartilhada ? 1 : 0;
    let sid = id;
    if (id) {
      const s = await q1('SELECT * FROM cm_selecoes WHERE id=?', [id]) ?? fail(404, 'Seleção não encontrada.');
      if (!podeSel(s)) fail(403, 'Só quem criou a seleção (ou o Administrador) pode alterá-la.');
      await run('UPDATE cm_selecoes SET nome=?, compartilhada=?, atualizado_em=? WHERE id=?', [nome, comp, now(), id]);
      await run('DELETE FROM cm_selecao_itens WHERE selecao_id=?', [id]);
    } else {
      await run('INSERT INTO cm_selecoes(nome,dono,dono_nome,compartilhada,criado_em,atualizado_em) VALUES(?,?,?,?,?,?)', [nome, meu, ator, comp, now(), now()]);
      sid = Number((await q1('SELECT id FROM cm_selecoes WHERE dono=? ORDER BY id DESC LIMIT 1', [meu]))?.id);
    }
    for (const a of validos) await run('INSERT IGNORE INTO cm_selecao_itens(selecao_id,aluno_id) VALUES(?,?)', [sid, a]);
    await auditar(ator, id ? 'selecao-editada' : 'selecao-criada', null, `${nome}: ${validos.length} aluno(s)`);
    return json({ ok: true, id: sid, alunos: validos.length });
  }
  if (path === '/carometro/selecao/duplicar' && method === 'POST') {
    const b = await c.body(), s = await q1('SELECT * FROM cm_selecoes WHERE id=?', [Number(b.id) || 0]);
    if (!s || (String(s.dono) !== meu && !Number(s.compartilhada) && !admin)) fail(404, 'Seleção não encontrada.');
    await run('INSERT INTO cm_selecoes(nome,dono,dono_nome,compartilhada,criado_em,atualizado_em) VALUES(?,?,?,0,?,?)', [`${String(s.nome).slice(0, 110)} (cópia)`, meu, ator, now(), now()]);
    const sid = Number((await q1('SELECT id FROM cm_selecoes WHERE dono=? ORDER BY id DESC LIMIT 1', [meu]))?.id);
    await run('INSERT INTO cm_selecao_itens(selecao_id,aluno_id) SELECT ?, aluno_id FROM cm_selecao_itens WHERE selecao_id=?', [sid, s.id]);
    await auditar(ator, 'selecao-duplicada', null, String(s.nome));
    return json({ ok: true, id: sid });
  }
  if (path === '/carometro/selecao/excluir' && method === 'POST') {
    const b = await c.body(), s = await q1('SELECT * FROM cm_selecoes WHERE id=?', [Number(b.id) || 0]) ?? fail(404, 'Seleção não encontrada.');
    if (!podeSel(s)) fail(403, 'Só quem criou a seleção (ou o Administrador) pode excluí-la.');
    await run('DELETE FROM cm_selecao_itens WHERE selecao_id=?', [s.id]); await run('DELETE FROM cm_selecoes WHERE id=?', [s.id]);
    await auditar(ator, 'selecao-excluida', null, String(s.nome));
    return json({ ok: true });
  }

  // ---------- sessões de fotos ----------
  const resumoSessao = async (s: Row) => {
    const itens = await sessaoItens(s);
    const n = itens.length, feitos = itens.filter((i) => i.situacao === 'fotografado').length;
    return { id: Number(s.id), nome: s.nome, data: s.data, turma: s.turma, status: s.status, obs: s.obs, criadoPor: s.criado_por, total: n, fotografados: feitos, ausentes: itens.filter((i) => i.situacao === 'ausente').length, refazer: itens.filter((i) => i.situacao === 'refazer').length };
  };
  /** Situação efetiva: o que foi marcado à mão vale; "pendente" vira "fotografado" sozinho se o aluno recebeu foto a partir do dia da sessão. */
  const sessaoItens = async (s: Row) => {
    const rows = await q(`SELECT a.id,a.matricula,a.nome,a.turma,i.situacao,
      (SELECT f.id FROM cm_fotos f WHERE f.aluno_id=a.id AND f.ativa=1 LIMIT 1) foto_id,
      (SELECT f.enviado_em FROM cm_fotos f WHERE f.aluno_id=a.id AND f.ativa=1 LIMIT 1) foto_em
      FROM cm_sessao_itens i JOIN ui_alunos a ON a.id=i.aluno_id AND a.ativo=1 WHERE i.sessao_id=?`, [s.id]);
    return ordena(rows).map((r) => ({ id: Number(r.id), matricula: String(r.matricula), nome: String(r.nome), turma: String(r.turma), fotoId: r.foto_id ? Number(r.foto_id) : null,
      situacao: r.situacao === 'pendente' && r.foto_id && String(r.foto_em).slice(0, 10) >= String(s.data) ? 'fotografado' : String(r.situacao) }));
  };
  if (path === '/carometro/sessoes' && method === 'GET') {
    const rows = await q('SELECT * FROM cm_sessoes ORDER BY data DESC, id DESC LIMIT 100');
    return json({ rows: await Promise.all(rows.map(resumoSessao)), podeEditar: u.role === 'manager', turmas: [...new Set((await q("SELECT DISTINCT turma FROM ui_alunos WHERE ativo=1 AND turma<>''")).map((r) => String(r.turma)))].sort(compararTurmaCm) });
  }
  if (path === '/carometro/sessao' && method === 'GET') {
    const s = await q1('SELECT * FROM cm_sessoes WHERE id=?', [Number(c.qs('id')) || 0]) ?? fail(404, 'Sessão não encontrada.');
    return json({ sessao: await resumoSessao(s), itens: await sessaoItens(s), podeEditar: u.role === 'manager' });
  }
  if (method === 'POST' && path.startsWith('/carometro/sessao')) {
    await requireManager(c);
    const b = await c.body();
    if (path === '/carometro/sessao') {
      const nome = limpa(b.nome, 120), data = strv(b.data), turma = limpa(b.turma, 60), obs = limpa(b.obs, 400), id = Number(b.id) || 0;
      if (!nome) fail(400, 'Dê um nome à sessão.');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) fail(400, 'Informe a data da sessão.');
      if (id) {
        await q1('SELECT id FROM cm_sessoes WHERE id=?', [id]) ?? fail(404, 'Sessão não encontrada.');
        await run('UPDATE cm_sessoes SET nome=?, data=?, obs=? WHERE id=?', [nome, data, obs, id]);
        return json({ ok: true, id });
      }
      if (!turma) fail(400, 'Escolha a turma.');
      const alunos = await q('SELECT id FROM ui_alunos WHERE ativo=1 AND turma=?', [turma]);
      if (!alunos.length) fail(400, 'Esta turma não tem alunos ativos.');
      await run("INSERT INTO cm_sessoes(nome,data,turma,status,obs,criado_por,criado_em) VALUES(?,?,?, 'aberta',?,?,?)", [nome, data, turma, obs, ator, now()]);
      const sid = Number((await q1('SELECT id FROM cm_sessoes WHERE criado_por=? ORDER BY id DESC LIMIT 1', [ator]))?.id);
      await run('INSERT INTO cm_sessao_itens(sessao_id,aluno_id) SELECT ?, id FROM ui_alunos WHERE ativo=1 AND turma=?', [sid, turma]);
      await auditar(ator, 'sessao-criada', null, `${nome} · ${turma} · ${alunos.length} aluno(s)`);
      return json({ ok: true, id: sid });
    }
    if (path === '/carometro/sessao/item') {
      const sit = strv(b.situacao);
      if (!['pendente', 'fotografado', 'ausente', 'refazer'].includes(sit)) fail(400, 'Situação inválida.');
      const n = await run('UPDATE cm_sessao_itens SET situacao=? WHERE sessao_id=? AND aluno_id=?', [sit, Number(b.sessao_id) || 0, Number(b.aluno_id) || 0]);
      if (!n) fail(404, 'Aluno não está nesta sessão.');
      return json({ ok: true });
    }
    if (path === '/carometro/sessao/status') {
      const st = strv(b.status);
      if (!['aberta', 'concluida'].includes(st)) fail(400, 'Situação inválida.');
      if (!(await run('UPDATE cm_sessoes SET status=? WHERE id=?', [st, Number(b.id) || 0]))) fail(404, 'Sessão não encontrada.');
      await auditar(ator, st === 'concluida' ? 'sessao-concluida' : 'sessao-reaberta', null, `sessão ${b.id}`);
      return json({ ok: true });
    }
    if (path === '/carometro/sessao/excluir') {
      const id = Number(b.id) || 0;
      await run('DELETE FROM cm_sessao_itens WHERE sessao_id=?', [id]); await run('DELETE FROM cm_sessoes WHERE id=?', [id]);
      return json({ ok: true });
    }
  }
  return fail(404, 'Rota não encontrada.');
}
