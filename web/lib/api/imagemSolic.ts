import { Ctx } from '../ctx';
import { requireAdmin } from '../auth';
import { q, q1, run } from '../db';
import { audit } from '../records';
import { respostaPdf } from '../pdf';
import { hashBytes, termosPdf, TermoPdf } from '../imagemPdf';
import { CANAIS, cpfMascarado, hashTexto, montarTermo, PLACEHOLDERS, validaModelo } from '../imagemTermo';
import { fail, now, Row, strv } from '../util';
import { randHex, sha256 } from '../crypto';
import { publicUrl } from '../integrations/http';
import { comprovantePdf } from '../imagemPdf';
import { dadosComprovante, ENCERRADAS, lerArquivoSolic, solicCompleta } from '../imagemDados';
import { imagemGestaoRoute } from './imagemGestao';
import { calcVence, lerConfig, mensagemCom } from '../imagemConfig';
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

  const gestao = await imagemGestaoRoute(c, u);
  if (gestao) return gestao;

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
    const texto = montarTermo(m as never, { aluno: al?.nome ?? 'Nome do Aluno (exemplo)', matricula: al?.matricula ?? '000000', turma: al?.turma ?? '0º Ano A', responsavel: limpa(b.responsavel, 160) }, undefined, now().slice(0, 4));
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
      await run('INSERT INTO ui_solicitacoes(aluno_id,modelo_id,modelo_nome,modelo_versao,termo_texto,periodo_tipo,periodo_valor,responsavel_nome,responsavel_email,responsavel_tel,status,lote,criado_por,criado_em,atualizado_em,pede_cpf) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [id, m.id, m.nome, m.versao, '', m.periodo_tipo, m.periodo_valor, resp, email, tel, 'AGUARDANDO_ENVIO', lote, ator, now(), now(), /\{\{\s*cpf\s*\}\}/.test(String(m.corpo)) ? 1 : 0]);
      const sid = Number((await q1('SELECT LAST_INSERT_ID() id'))?.id);
      const protocolo = novoProtocolo(sid);
      const texto = montarTermo(m as never, { aluno: al.nome, matricula: al.matricula, turma: al.turma, responsavel: resp }, undefined, now().slice(0, 4));
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
    const b = await c.body(), id = Number(b.id) || 0, motivo = limpa(b.motivo, 400);
    const s = await q1('SELECT status FROM ui_solicitacoes WHERE id=?', [id]) ?? fail(404, 'Solicitação não encontrada.');
    if (!['AGUARDANDO_ENVIO', 'ENVIADO', 'ABERTO', 'AGUARDANDO_ASSINATURA'].includes(s.status)) fail(409, 'Só dá para cancelar uma solicitação que ainda não foi respondida. Para uma autorização em vigor, use Revogar.');
    if (s.status !== 'AGUARDANDO_ENVIO' && motivo.length < 5) fail(400, 'Explique o motivo do cancelamento (o link já foi enviado).');
    await run("UPDATE ui_solicitacoes SET status='CANCELADO',cancelado_motivo=?,atualizado_em=? WHERE id=?", [motivo, now(), id]);
    await run('UPDATE ui_acessos SET ativo=0 WHERE solicitacao_id=?', [id]);
    await evento(id, ator, 'cancelada', motivo);
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

  /** Gera o link único e o código de acesso. O link anterior deixa de valer. Token e código só aparecem agora: no banco ficam só os hashes. */
  if (path === '/imagem/solicitacoes/link' && method === 'POST') {
    const b = await c.body(), id = Number(b.id) || 0;
    const s = await solicCompleta(id) ?? fail(404, 'Solicitação não encontrada.');
    if (ENCERRADAS.includes(s.status)) fail(409, 'Esta solicitação já está encerrada; não há mais o que enviar.');
    const cfg = await lerConfig();
    const mod = await q1('SELECT versao FROM ui_modelos WHERE id=?', [s.modelo_id]);
    if (cfg.bloquearVersaoAntiga && mod && Number(mod.versao) > Number(s.modelo_versao) && !['AGUARDANDO_ASSINATURA', 'AGUARDANDO_VALIDACAO'].includes(s.status)) fail(409, `O modelo foi alterado depois desta solicitação (v${s.modelo_versao} para v${mod.versao}). Cancele esta solicitação e crie outra com a versão atual.`);
    const dias = Math.min(60, Math.max(1, Number(b.dias) || cfg.linkDias));
    const token = randHex(24), codigo = String(Math.floor(100000 + (Number.parseInt(randHex(4), 16) / 0x100000000) * 900000));
    const expira = now(new Date(Date.now() + dias * 86400_000));
    await run('UPDATE ui_acessos SET ativo=0 WHERE solicitacao_id=?', [id]);
    await run('INSERT INTO ui_acessos(solicitacao_id,token_hash,codigo_hash,expira_em,tentativas,ativo,criado_em,criado_por) VALUES(?,?,?,?,0,1,?,?)', [id, sha256(token), sha256(`${token}:${codigo}`), expira, now(), ator]);
    await evento(id, ator, 'link-gerado', `válido por ${dias} dia(s)`);
    await audit(ator, 'imagem-link-gerado', 'ui_solicitacoes', String(id));
    const link = `${publicUrl(c.url.origin)}/autorizar.html#${token}`;
    const mensagem = mensagemCom(cfg.mensagemEnvio, { aluno: s.aluno, link, validade: `${expira.slice(8, 10)}/${expira.slice(5, 7)}/${expira.slice(0, 4)}`, protocolo: s.protocolo });
    return json({ ok: true, link, codigo, expiraEm: expira, mensagem, telefone: s.responsavel_tel, email: s.responsavel_email, canais: cfg.canais });
  }

  /** O envio é feito por uma pessoa (WhatsApp, e-mail, bilhete). O sistema só registra que foi enviado, quando a equipe confirma. */
  if (path === '/imagem/solicitacoes/enviado' && method === 'POST') {
    const b = await c.body(), id = Number(b.id) || 0, canal = ['whatsapp', 'email', 'presencial', 'outro'].includes(strv(b.canal)) ? strv(b.canal) : 'outro';
    const s = await q1('SELECT status FROM ui_solicitacoes WHERE id=?', [id]) ?? fail(404, 'Solicitação não encontrada.');
    if (s.status !== 'AGUARDANDO_ENVIO') fail(409, 'Esta solicitação já foi marcada como enviada.');
    await run("UPDATE ui_solicitacoes SET status='ENVIADO',enviado_em=?,enviado_canal=?,atualizado_em=? WHERE id=?", [now(), canal, now(), id]);
    await evento(id, ator, 'enviado', `canal: ${canal} (confirmado pela equipe)`);
    return json({ ok: true });
  }

  if (path === '/imagem/solicitacoes/detalhe' && method === 'GET') {
    const id = Number(c.qs('id')) || 0;
    const s = await solicCompleta(id) ?? fail(404, 'Solicitação não encontrada.');
    const eventos = await q('SELECT quando,ator,acao,detalhe FROM ui_solic_eventos WHERE solicitacao_id=? ORDER BY id DESC LIMIT 100', [id]);
    const arquivos = await q('SELECT tipo,nome,sha256,tamanho,info,criado_em FROM ui_arquivos WHERE solicitacao_id=? AND ativo=1 ORDER BY id', [id]);
    const ac = await q1('SELECT expira_em,tentativas,ativo,ultimo_acesso FROM ui_acessos WHERE solicitacao_id=? ORDER BY id DESC LIMIT 1', [id]);
    return json({
      solicitacao: { ...solicPublica(s), decisao: s.decisao, decisaoEm: s.decisao_em, respConfirmado: s.resp_confirmado, parentesco: s.parentesco, modalidade: s.modalidade, termoHash: s.termo_hash, cpfResponsavel: s.resp_cpf ? cpfMascarado(String(s.resp_cpf)) : '', validadoPor: s.validado_por, validadoEm: s.validado_em, validacaoObs: s.validacao_obs, enviadoEm: s.enviado_em, enviadoCanal: s.enviado_canal, abertoEm: s.aberto_em },
      eventos, arquivos, acesso: ac ? { expiraEm: ac.expira_em, ativo: !!Number(ac.ativo) && String(ac.expira_em) >= now() && Number(ac.tentativas) < 5, ultimoAcesso: ac.ultimo_acesso } : null,
    });
  }

  if (path === '/imagem/solicitacoes/comprovante' && method === 'GET') {
    const id = Number(c.qs('id')) || 0;
    const s = await solicCompleta(id) ?? fail(404, 'Solicitação não encontrada.');
    const dc = await dadosComprovante(s) ?? fail(404, 'Ainda não há arquivo assinado enviado.');
    await evento(id, ator, 'comprovante-baixado', '');
    return new Response(new Uint8Array(await comprovantePdf(dc)), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="Comprovante-Recebimento_${s.protocolo}.pdf"`, 'Cache-Control': 'no-store' } });
  }

  if (path === '/imagem/solicitacoes/arquivo' && method === 'GET') {
    const id = Number(c.qs('id')) || 0, tipo = ['govbr', 'final', 'assinatura'].includes(c.qs('tipo')) ? c.qs('tipo') : '';
    if (!tipo) fail(400, 'Tipo de arquivo inválido.');
    const f = await lerArquivoSolic(id, tipo) ?? fail(404, 'Arquivo não encontrado.');
    await evento(id, ator, 'arquivo-baixado', tipo);
    return new Response(new Uint8Array(f.buf), { headers: { 'Content-Type': f.mime, 'Content-Disposition': `attachment; filename="${f.nome.replace(/[^A-Za-z0-9._-]/g, '_')}"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  }

  /** Validação manual do PDF do GOV.BR: a pessoa confere em https://validar.iti.gov.br e registra aqui o resultado. Só então vira Autorizado. */
  if (path === '/imagem/solicitacoes/validar' && method === 'POST') {
    if ((await lerConfig()).quemValida === 'admin') await requireAdmin(c);
    const b = await c.body(), id = Number(b.id) || 0, resultado = strv(b.resultado);
    const s = await q1('SELECT status,periodo_tipo,periodo_valor FROM ui_solicitacoes WHERE id=?', [id]) ?? fail(404, 'Solicitação não encontrada.');
    if (s.status !== 'AGUARDANDO_VALIDACAO') fail(409, 'Esta solicitação não está aguardando validação.');
    if (!['VALIDO', 'INVALIDO'].includes(resultado)) fail(400, 'Informe o resultado da validação.');
    const obs = limpa(b.obs, 400);
    if (resultado === 'VALIDO') {
      if (b.conferido_no_validar !== true) fail(400, 'Confirme que a assinatura foi conferida em validar.iti.gov.br e que o documento corresponde ao termo.');
      const f = await lerArquivoSolic(id, 'govbr');
      await run("UPDATE ui_solicitacoes SET status='AUTORIZADO',validado_por=?,validado_em=?,validacao_obs=?,final_hash=?,vence_em=?,atualizado_em=? WHERE id=?", [ator, now(), obs, f?.sha256 ?? '', calcVence(String(s.periodo_tipo), String(s.periodo_valor), now()), now(), id]);
      await evento(id, ator, 'validado', `assinatura GOV.BR conferida manualmente${obs ? ': ' + obs : ''}`);
    } else {
      if (obs.length < 5) fail(400, 'Explique o motivo (o responsável verá a mensagem).');
      await run("UPDATE ui_solicitacoes SET status='AGUARDANDO_ASSINATURA',validado_por=?,validado_em=?,validacao_obs=?,atualizado_em=? WHERE id=?", [ator, now(), obs, now(), id]);
      await evento(id, ator, 'arquivo-recusado', obs);
    }
    await audit(ator, resultado === 'VALIDO' ? 'imagem-govbr-validado' : 'imagem-govbr-recusado', 'ui_solicitacoes', String(id));
    return json({ ok: true });
  }

  return null;
}
