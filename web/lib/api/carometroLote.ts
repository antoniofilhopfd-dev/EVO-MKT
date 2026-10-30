import { Ctx } from '../ctx';
import { requireManager } from '../auth';
import { q, q1, run } from '../db';
import { fail, Row } from '../util';
import { unzipSync } from 'fflate';
import { json } from './handlers';
import { auditar, FOTO_MAX_BYTES } from '../carometroFoto';
import { adicionarArquivo, aplicarLote, AlunoLote, cancelarLote, desfazerLote, itensDoLote, lerManifesto, MAX_ITENS_LOTE, novoLote, pendentes, resumoItens } from '../carometroLote';

/** Rotas do lote de fotos. Só a Gerência (quem pode enviar fotos). Devolve null quando o caminho não é de lote. */
export async function carometroLoteRoute(c: Ctx, ator: string): Promise<Response | null> {
  const { path, method } = c;
  if (!path.startsWith('/carometro/lote')) return null;
  await requireManager(c);
  const abrir = async (id: number) => (await q1('SELECT * FROM cm_lotes WHERE id=?', [id])) ?? fail(404, 'Lote não encontrado.');
  const detalhe = async (id: number) => {
    const l = await abrir(id), itens = await itensDoLote(id), resumo = resumoItens(itens);
    const turma = String(l.turma ?? '');
    const alunosTurma = turma ? (await q('SELECT id,matricula,nome FROM ui_alunos WHERE ativo=1 AND turma=? ORDER BY nome', [turma])).map((a) => ({ id: Number(a.id), matricula: String(a.matricula), nome: String(a.nome) })) : [];
    const usados = new Set(itens.filter((i) => ['ok', 'sugerida'].includes(String(i.estado)) && i.alunoId).map((i) => i.alunoId));
    const faltam = alunosTurma.filter((a) => !usados.has(a.id));
    return { alunosTurma, faltam, lote: { id: Number(l.id), turma, estado: l.estado, criadoPor: l.criado_por, criadoEm: l.criado_em, aplicadoEm: l.aplicado_em, resumo: l.resumo }, itens, resumo, pendencias: pendentes(itens) };
  };

  if (path === '/carometro/lotes' && method === 'GET') {
    return json({ rows: (await q('SELECT id,turma,estado,criado_por,criado_em,aplicado_em,desfeito_em,resumo FROM cm_lotes ORDER BY id DESC LIMIT 20')).map((l) => ({ id: Number(l.id), turma: String(l.turma ?? ''), estado: l.estado, criadoPor: l.criado_por, criadoEm: l.criado_em, aplicadoEm: l.aplicado_em, desfeitoEm: l.desfeito_em, resumo: l.resumo })) });
  }
  if (path === '/carometro/lote' && method === 'GET') return json(await detalhe(Number(c.qs('id')) || 0));

  if (path === '/carometro/lote/foto' && method === 'GET') {
    const it = await q1('SELECT caminho_padrao,caminho_mini FROM cm_lote_itens WHERE id=?', [Number(c.qs('item')) || 0]) ?? fail(404, 'Foto não encontrada.');
    const a = await q1('SELECT mime,conteudo FROM arquivos WHERE caminho=?', [c.qs('tam') === 'padrao' ? it.caminho_padrao : it.caminho_mini]) ?? fail(404, 'Foto não encontrada.');
    return new Response(new Uint8Array(Buffer.from(a.conteudo)), { headers: { 'Content-Type': String(a.mime), 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
  }

  if (method !== 'POST') fail(405, 'Método não permitido.');

  if (path === '/carometro/lote/fotos') {
    const form = await c.req.formData();
    let id = Number(form.get('lote_id')) || 0;
    const manifesto = String(form.get('manifesto') ?? ''), turmaForm = String(form.get('turma') ?? '').trim().slice(0, 60);
    if (id) { const l = await abrir(id); if (l.estado !== 'simulado') fail(409, 'Este lote já foi encerrado.'); }
    else {
      if (turmaForm && !(await q1('SELECT id FROM ui_alunos WHERE ativo=1 AND turma=? LIMIT 1', [turmaForm]))) fail(404, 'Turma sem alunos ativos.');
      id = await novoLote(ator, manifesto, turmaForm);
    }
    const lote = await abrir(id), man = lerManifesto(String(lote.manifesto || manifesto));
    const turmaLote = String(lote.turma ?? '');
    const alunos = (await (turmaLote ? q('SELECT id,matricula,nome,turma FROM ui_alunos WHERE ativo=1 AND turma=?', [turmaLote]) : q('SELECT id,matricula,nome,turma FROM ui_alunos WHERE ativo=1'))).map((a) => ({ id: Number(a.id), matricula: String(a.matricula), nome: String(a.nome), turma: String(a.turma) })) as AlunoLote[];
    const arqs = form.getAll('arquivo').filter((f): f is File => f instanceof File && f.size > 0);
    if (!arqs.length) fail(400, 'Escolha as fotos.');
    const ja = Number((await q1('SELECT COUNT(*) n FROM cm_lote_itens WHERE lote_id=?', [id]))?.n ?? 0);
    if (ja + arqs.length > MAX_ITENS_LOTE) fail(400, `Cada lote aceita até ${MAX_ITENS_LOTE} fotos. Divida em lotes menores.`);
    for (const f of arqs) {
      if (/\.zip$/i.test(f.name) || f.type === 'application/zip' || f.type === 'application/x-zip-compressed') {
        // pasta compactada: cada imagem dentro vira uma foto do lote (sem subpastas do sistema, no máximo 400 e 5 MB cada)
        if (f.size > 60 * 1048576) fail(413, 'O ZIP passa de 60 MB. Divida a turma em dois arquivos.');
        let entradas: Record<string, Uint8Array>;
        try { entradas = unzipSync(new Uint8Array(await f.arrayBuffer()), { filter: (e) => e.originalSize <= FOTO_MAX_BYTES && !/(^|\/)(__MACOSX|\.)/.test(e.name) && /\.(jpe?g|png|webp)$/i.test(e.name) }); }
        catch { fail(400, 'Não foi possível abrir o ZIP. Envie um ZIP comum com as fotos.'); }
        const nomes = Object.keys(entradas).sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
        if (!nomes.length) fail(400, 'O ZIP não tem fotos JPG, PNG ou WebP.');
        const ja2 = Number((await q1('SELECT COUNT(*) n FROM cm_lote_itens WHERE lote_id=?', [id]))?.n ?? 0);
        if (ja2 + nomes.length > MAX_ITENS_LOTE) fail(400, `Cada lote aceita até ${MAX_ITENS_LOTE} fotos. Divida em lotes menores.`);
        for (const n of nomes) await adicionarArquivo(id, n.split('/').pop() || 'foto', Buffer.from(entradas[n]), alunos, man, !!turmaLote);
        continue;
      }
      if (f.size > FOTO_MAX_BYTES) await run("INSERT INTO cm_lote_itens(lote_id,nome_arquivo,estado,motivo) VALUES(?,?, 'invalida', 'A foto passa de 5 MB.')", [id, f.name.replace(/[^\w.\- ]/g, '_').slice(0, 190)]);
      else await adicionarArquivo(id, f.name || 'foto', Buffer.from(await f.arrayBuffer()), alunos, man, !!turmaLote);
    }
    return json({ ok: true, loteId: id });
  }

  const b = await c.body(), id = Number(b.lote_id) || 0;
  if (path === '/carometro/lote/resolver') {
    const l = await abrir(id); if (l.estado !== 'simulado') fail(409, 'Este lote já foi encerrado.');
    const it = await q1('SELECT * FROM cm_lote_itens WHERE id=? AND lote_id=?', [Number(b.item_id) || 0, id]) ?? fail(404, 'Foto do lote não encontrada.');
    if (it.estado === 'invalida') fail(409, 'Esta foto é inválida e não pode ser aplicada.');
    const acao = String(b.acao);
    if (acao === 'ignorar') await run("UPDATE cm_lote_itens SET estado='ignorada', motivo='Ignorada por decisão da Gerência.' WHERE id=?", [it.id]);
    else if (acao === 'confirmar') {
      if (!it.aluno_id) fail(400, 'Escolha o aluno.');
      await run("UPDATE cm_lote_itens SET estado='ok', confianca='manual', motivo='Confirmada pela Gerência.' WHERE id=?", [it.id]);
    } else if (acao === 'vincular') {
      const al = await q1('SELECT id,turma FROM ui_alunos WHERE id=? AND ativo=1', [Number(b.aluno_id) || 0]) ?? fail(404, 'Aluno não encontrado.');
      if (l.turma && String(al.turma) !== String(l.turma)) fail(409, `Este lote é da turma ${l.turma}; escolha um aluno dessa turma.`);
      await run("UPDATE cm_lote_itens SET estado='ok', aluno_id=?, regra='Manual', confianca='manual', motivo='Vinculada pela Gerência.' WHERE id=?", [Number(b.aluno_id), it.id]);
    } else if (acao === 'restaurar') await run("UPDATE cm_lote_itens SET estado=?, motivo='' WHERE id=? AND estado='ignorada'", [it.aluno_id ? 'sugerida' : 'orfa', it.id]);
    else fail(400, 'Ação inválida.');
    return json(await detalhe(id));
  }
  if (path === '/carometro/lote/aplicar') {
    const l = await abrir(id); if (l.estado !== 'simulado') fail(409, 'Este lote já foi encerrado.');
    const d = await detalhe(id);
    if (d.pendencias) fail(409, `Ainda há ${d.pendencias} foto(s) para decidir (sugestões, sem aluno ou em conflito).`);
    if (!d.resumo.prontos) fail(409, 'Nenhuma foto pronta para aplicar.');
    const r = await aplicarLote(id, ator);
    return json({ ok: true, ...r });
  }
  /** Turma inteira: liga as fotos ainda sem aluno aos alunos que faltam, na ordem dos arquivos × ordem alfabética. Entram como sugestão: a Gerência confere os rostos. */
  if (path === '/carometro/lote/preencher-ordem') {
    const l = await abrir(id); if (l.estado !== 'simulado') fail(409, 'Este lote já foi encerrado.');
    if (!l.turma) fail(400, 'Esta opção é só para lote de uma turma.');
    const d0 = await detalhe(id);
    const soltas = d0.itens.filter((i) => ['orfa', 'ambigua'].includes(String(i.estado))).sort((a, b) => String(a.arquivo).localeCompare(String(b.arquivo), 'pt-BR', { numeric: true }));
    const livres = [...d0.faltam].sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
    if (!soltas.length) fail(409, 'Não há fotos sem aluno neste lote.');
    if (!livres.length) fail(409, 'Todos os alunos da turma já têm foto neste lote.');
    let n = 0;
    for (let k = 0; k < Math.min(soltas.length, livres.length); k++) {
      await run("UPDATE cm_lote_itens SET estado='sugerida', aluno_id=?, regra='Ordem dos arquivos', confianca='baixa', motivo='Ligada pela ordem do arquivo e pela ordem alfabética da turma; confira o rosto.' WHERE id=?", [livres[k].id, soltas[k].id]);
      n++;
    }
    await auditar(ator, 'lote-ordem', null, `lote ${id}: ${n} foto(s) ligadas pela ordem`);
    return json({ ...(await detalhe(id)), ligadas: n, sobraram: soltas.length - n });
  }
  if (path === '/carometro/lote/confirmar-todas') {
    const l = await abrir(id); if (l.estado !== 'simulado') fail(409, 'Este lote já foi encerrado.');
    const n = await run("UPDATE cm_lote_itens SET estado='ok', confianca='manual', motivo='Confirmada pela Gerência.' WHERE lote_id=? AND estado='sugerida' AND aluno_id IS NOT NULL", [id]);
    await auditar(ator, 'lote-confirmadas', null, `lote ${id}: ${n} sugestão(ões) confirmadas`);
    return json({ ...(await detalhe(id)), confirmadas: n });
  }
  if (path === '/carometro/lote/cancelar') {
    const l = await abrir(id); if (l.estado !== 'simulado') fail(409, 'Só dá para cancelar um lote ainda não aplicado.');
    await cancelarLote(id, ator);
    return json({ ok: true });
  }
  if (path === '/carometro/lote/desfazer') {
    const l = await abrir(id); if (l.estado !== 'aplicado') fail(409, 'Só dá para desfazer um lote aplicado.');
    return json({ ok: true, ...(await desfazerLote(id, ator)) });
  }
  return fail(404, 'Rota não encontrada.');
}
