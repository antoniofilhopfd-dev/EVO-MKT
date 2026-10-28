import { Ctx } from '../ctx';
import { requireAdmin } from '../auth';
import { q, q1, run } from '../db';
import { audit } from '../records';
import { respostaPdf } from '../pdf';
import { hashBytes, termosPdf, TermoPdf } from '../imagemPdf';
import { CANAIS, hashTexto, montarTermo, PLACEHOLDERS, validaModelo } from '../imagemTermo';
import { fail, now, Row, strv } from '../util';
import { json } from './handlers';

/** Uso de Imagem, etapa 2: modelos (só o Administrador edita), prévia, solicitações em lote e PDF do termo. */
export const STATUS_SOLIC = ['AGUARDANDO_ENVIO', 'ENVIADO', 'ABERTO', 'AGUARDANDO_ASSINATURA', 'AGUARDANDO_VALIDACAO', 'AUTORIZADO', 'NAO_AUTORIZADO', 'VENCIDO', 'REVOGADO', 'ERRO', 'CANCELADO'];
/** Situações em que já existe um pedido em andamento ou concluído para o aluno e o modelo (não se cria outro). */
const ATIVAS = ['AGUARDANDO_ENVIO', 'ENVIADO', 'ABERTO', 'AGUARDANDO_ASSINATURA', 'AGUARDANDO_VALIDACAO', 'AUTORIZADO'];

const modeloPublico = (r: Row) => ({ id: r.id, nome: r.nome, tipo: r.tipo, finalidade: r.finalidade, canais: String(r.canais).split(',').map((x: string) => x.trim()).filter(Boolean), local_uso: r.local_uso, periodo_tipo: r.periodo_tipo, periodo_valor: r.periodo_valor, observacoes: r.observacoes, corpo: r.corpo, versao: r.versao, ativo: !!Number(r.ativo), atualizadoEm: r.atualizado_em, atualizadoPor: r.atualizado_por });
const solicPublica = (r: Row) => ({ id: r.id, protocolo: r.protocolo, alunoId: r.aluno_id, aluno: r.aluno, matricula: r.matricula, turma: r.turma, modelo: r.modelo_nome, versao: r.modelo_versao, status: r.status, responsavel: r.responsavel_nome, email: r.responsavel_email, telefone: r.responsavel_tel, lote: r.lote, criadoEm: r.criado_em, criadoPor: r.criado_por });
async function evento(id: number, ator: string, acao: string, detalhe = '') {
  await run('INSERT INTO ui_solic_eventos(solicitacao_id,quando,ator,acao,detalhe) VALUES(?,?,?,?,?)', [id, now(), ator, acao, detalhe.slice(0, 400)]);
}
const limpa = (v: unknown, n: number) => strv(v).replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const novoProtocolo = (id: number) => `UI-${now().slice(0, 4)}-${String(id).padStart(6, '0')}`;

export async function imagemSolicRoute(c: Ctx, u: Row): Promise<Response | null> {
  const { path, method } = c;
  const ator = String(u.nome ?? u.codigo ?? '');

  if (path === '/imagem/modelos' && method === 'GET') {
    const rows = await q('SELECT * FROM ui_modelos ORDER BY ativo DESC, nome');
    return json({ rows: rows.map(modeloPublico), canais: CANAIS, marcadores: PLACEHOLDERS, podeEditar: !!Number(u.admin) && u.role === 'manager' });
  }

  if (path === '/imagem/modelos' && method === 'POST') {
    await requireAdmin(c);
    const b = await c.body();
    const v = validaModelo(b);
    if ('erro' in v) fail(400, v.erro);
    const m = v.m, id = Number(b.id) || 0;
    if (id) {
      const atual = await q1('SELECT * FROM ui_modelos WHERE id=?', [id]) ?? fail(404, 'Modelo não encontrado.');
      if (await q1('SELECT id FROM ui_modelos WHERE nome=? AND id<>?', [m.nome, id])) fail(409, 'Já existe outro modelo com este nome.');
      // só conta como nova versão se o conteúdo do termo mudou; solicitações já criadas guardam o texto da versão em que nasceram
      const mudou = ['corpo', 'finalidade', 'canais', 'local_uso', 'periodo_tipo', 'periodo_valor', 'observacoes'].some((k) => String(atual[k]) !== String((m as unknown as Row)[k]));
      await run('UPDATE ui_modelos SET nome=?,tipo=?,finalidade=?,canais=?,local_uso=?,periodo_tipo=?,periodo_valor=?,observacoes=?,corpo=?,versao=versao+?,atualizado_em=?,atualizado_por=? WHERE id=?', [m.nome, m.tipo, m.finalidade, m.canais, m.local_uso, m.periodo_tipo, m.periodo_valor, m.observacoes, m.corpo, mudou ? 1 : 0, now(), ator, id]);
      await audit(ator, 'imagem-modelo-editado', 'ui_modelos', String(id));
      return json({ ok: true, id, novaVersao: mudou });
    }
    if (await q1('SELECT id FROM ui_modelos WHERE nome=?', [m.nome])) fail(409, 'Já existe um modelo com este nome.');
    await run('INSERT INTO ui_modelos(nome,tipo,finalidade,canais,local_uso,periodo_tipo,periodo_valor,observacoes,corpo,versao,ativo,criado_em,atualizado_em,atualizado_por) VALUES(?,?,?,?,?,?,?,?,?,1,1,?,?,?)', [m.nome, m.tipo, m.finalidade, m.canais, m.local_uso, m.periodo_tipo, m.periodo_valor, m.observacoes, m.corpo, now(), now(), ator]);
    const novo = await q1('SELECT id FROM ui_modelos WHERE nome=?', [m.nome]);
    await audit(ator, 'imagem-modelo-criado', 'ui_modelos', String(novo?.id ?? ''));
    return json({ ok: true, id: novo?.id }, 201);
  }

  if (path === '/imagem/modelos/ativo' && method === 'POST') {
    await requireAdmin(c);
    const b = await c.body(), id = Number(b.id) || 0;
    await q1('SELECT id FROM ui_modelos WHERE id=?', [id]) ?? fail(404, 'Modelo não encontrado.');
    await run('UPDATE ui_modelos SET ativo=?,atualizado_em=?,atualizado_por=? WHERE id=?', [b.ativo ? 1 : 0, now(), ator, id]);
    await audit(ator, b.ativo ? 'imagem-modelo-ativado' : 'imagem-modelo-desativado', 'ui_modelos', String(id));
    return json({ ok: true });
  }

  /** Prévia do documento: aceita o modelo salvo (modelo_id) ou um rascunho (modelo), e um aluno real ou de exemplo. Não grava nada. */
  if (path === '/imagem/previa' && method === 'POST') {
    const b = await c.body();
    let m: Row | undefined;
    if (b.modelo_id) m = await q1('SELECT * FROM ui_modelos WHERE id=?', [Number(b.modelo_id)]) ?? fail(404, 'Modelo não encontrado.');
    else { const v = validaModelo((b.modelo ?? {}) as Row); if ('erro' in v) fail(400, v.erro); m = v.m as unknown as Row; }
    const al = b.aluno_id ? await q1('SELECT nome,matricula,turma FROM ui_alunos WHERE id=?', [Number(b.aluno_id)]) : undefined;
    const texto = montarTermo(m as never, { aluno: al?.nome ?? 'Nome do Aluno (exemplo)', matricula: al?.matricula ?? '000000', turma: al?.turma ?? '0º Ano A', responsavel: limpa(b.responsavel, 160) });
    return json({ texto, hash: hashTexto(texto), versao: m.versao ?? null });
  }

  if (path === '/imagem/solicitacoes' && method === 'GET') {
    const status = c.qs('status'), busca = c.qs('busca').toLowerCase(), modelo = Number(c.qs('modelo')) || 0;
    const like = `%${busca}%`;
    const rows = await q(
      `SELECT s.*, a.nome aluno, a.matricula, a.turma FROM ui_solicitacoes s JOIN ui_alunos a ON a.id=s.aluno_id
       WHERE (?='' OR s.status=?) AND (?=0 OR s.modelo_id=?) AND (?='' OR LOWER(a.nome) LIKE ? OR a.matricula LIKE ? OR s.protocolo LIKE ?) ORDER BY s.id DESC LIMIT 1000`,
      [status, status, modelo, modelo, busca, like, like, like],
    );
    return json({ rows: rows.map(solicPublica), status: STATUS_SOLIC });
  }

  /** Cria uma solicitação para cada aluno escolhido à mão. Texto, versão e hash ficam congelados no momento da criação. */
  if (path === '/imagem/solicitacoes/criar' && method === 'POST') {
    const b = await c.body();
    const m = await q1('SELECT * FROM ui_modelos WHERE id=? AND ativo=1', [Number(b.modelo_id)]) ?? fail(400, 'Escolha um modelo ativo.');
    const itens = Array.isArray(b.alunos) ? (b.alunos as Row[]) : [];
    if (!itens.length) fail(400, 'Marque ao menos um aluno.');
    if (itens.length > 300) fail(400, 'Crie até 300 solicitações por vez.');
    const lote = `L${now().replace(/\D/g, '').slice(0, 12)}`;
    const criadas: { id: number; protocolo: string; aluno: string }[] = [], ignoradas: { aluno: string; motivo: string }[] = [];
    const vistos = new Set<number>();
    for (const it of itens) {
      const id = Number(it.id) || 0;
      const al = await q1('SELECT * FROM ui_alunos WHERE id=?', [id]);
      if (!al) { ignoradas.push({ aluno: `#${id}`, motivo: 'Aluno não encontrado.' }); continue; }
      if (!Number(al.ativo)) { ignoradas.push({ aluno: al.nome, motivo: 'Aluno inativo.' }); continue; }
      if (vistos.has(id)) continue;
      vistos.add(id);
      const marcas = ATIVAS.map(() => '?').join(',');
      const dup = await q1(`SELECT protocolo, status FROM ui_solicitacoes WHERE aluno_id=? AND modelo_id=? AND status IN (${marcas}) LIMIT 1`, [id, m.id, ...ATIVAS]);
      if (dup) { ignoradas.push({ aluno: al.nome, motivo: `Já existe a solicitação ${dup.protocolo} (${String(dup.status).toLowerCase().replace(/_/g, ' ')}) com este modelo.` }); continue; }
      const resp = limpa(it.responsavel, 160), email = limpa(it.email, 190).toLowerCase(), tel = String(it.telefone ?? '').replace(/\D/g, '').slice(0, 15);
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { ignoradas.push({ aluno: al.nome, motivo: 'E-mail do responsável inválido.' }); continue; }
      if (tel && (tel.length < 10 || tel.length > 13)) { ignoradas.push({ aluno: al.nome, motivo: 'Telefone do responsável inválido (use DDD + número).' }); continue; }
      await run('INSERT INTO ui_solicitacoes(aluno_id,modelo_id,modelo_nome,modelo_versao,termo_texto,periodo_tipo,periodo_valor,responsavel_nome,responsavel_email,responsavel_tel,status,lote,criado_por,criado_em,atualizado_em) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [id, m.id, m.nome, m.versao, '', m.periodo_tipo, m.periodo_valor, resp, email, tel, 'AGUARDANDO_ENVIO', lote, ator, now(), now()]);
      const sid = Number((await q1('SELECT LAST_INSERT_ID() id'))?.id);
      const protocolo = novoProtocolo(sid);
      const texto = montarTermo(m as never, { aluno: al.nome, matricula: al.matricula, turma: al.turma, responsavel: resp });
      const hash = hashTexto(`${protocolo}\n${m.versao}\n${texto}`);
      await run('UPDATE ui_solicitacoes SET protocolo=?,termo_texto=?,termo_hash=? WHERE id=?', [protocolo, texto, hash, sid]);
      await evento(sid, ator, 'criada', `Modelo "${m.nome}" v${m.versao}`);
      criadas.push({ id: sid, protocolo, aluno: al.nome });
    }
    if (criadas.length) await run('INSERT INTO ui_eventos(quando,ator,acao,aluno_id,detalhe) VALUES(?,?,?,?,?)', [now(), ator, 'solicitacoes-criadas', null, `${criadas.length} solicitação(ões) com o modelo "${m.nome}"`]);
    if (criadas.length) await audit(ator, 'imagem-solicitacoes-criadas', 'ui_solicitacoes', `${lote}:${criadas.length}`);
    return json({ ok: true, lote, criadas, ignoradas }, 201);
  }

  if (path === '/imagem/solicitacoes/cancelar' && method === 'POST') {
    const id = Number((await c.body()).id) || 0;
    const s = await q1('SELECT status FROM ui_solicitacoes WHERE id=?', [id]) ?? fail(404, 'Solicitação não encontrada.');
    if (s.status !== 'AGUARDANDO_ENVIO') fail(409, 'Só dá para cancelar uma solicitação que ainda não foi enviada.');
    await run("UPDATE ui_solicitacoes SET status='CANCELADO',atualizado_em=? WHERE id=?", [now(), id]);
    await evento(id, ator, 'cancelada', '');
    await audit(ator, 'imagem-solicitacao-cancelada', 'ui_solicitacoes', String(id));
    return json({ ok: true });
  }

  /** PDF de uma ou várias solicitações (ids=1,2,3): uma página por aluno, para impressão ou assinatura. */
  if (path === '/imagem/solicitacoes/pdf' && method === 'GET') {
    const ids = [...new Set(c.qs('ids').split(',').map((x) => Number(x)).filter((n) => n > 0))].slice(0, 300);
    if (!ids.length) fail(400, 'Escolha ao menos uma solicitação.');
    const rows = await q(`SELECT s.*, a.nome aluno, a.matricula, a.turma FROM ui_solicitacoes s JOIN ui_alunos a ON a.id=s.aluno_id WHERE s.id IN (${ids.map(() => '?').join(',')}) ORDER BY a.nome`, ids);
    if (!rows.length) fail(404, 'Solicitação não encontrada.');
    const termos: TermoPdf[] = rows.map((r) => ({ protocolo: r.protocolo, texto: r.termo_texto, hash: r.termo_hash, versao: r.modelo_versao, modelo: r.modelo_nome, aluno: r.aluno, matricula: r.matricula, turma: r.turma, responsavel: r.responsavel_nome, criadoEm: r.criado_em }));
    const buf = await termosPdf(termos);
    for (const r of rows) {
      if (!r.pdf_hash && rows.length === 1) await run('UPDATE ui_solicitacoes SET pdf_hash=? WHERE id=?', [hashBytes(buf), r.id]);
      await evento(r.id, ator, 'pdf-baixado', rows.length > 1 ? 'em lote' : '');
    }
    return respostaPdf(buf, rows.length === 1 ? `Autorizacao-Uso-de-Imagem_${rows[0].protocolo}.pdf` : `Autorizacoes-Uso-de-Imagem_${rows.length}-alunos.pdf`);
  }

  return null;
}
