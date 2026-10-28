import { Ctx } from '../ctx';
import { rateCheck, rateFail } from '../auth';
import { sha256 } from '../crypto';
import { q1, run } from '../db';
import { eventoSolic, ENCERRADAS, lerArquivoSolic, salvarArquivoSolic, sha, solicCompleta, termoPdfDe } from '../imagemDados';
import { termosPdf } from '../imagemPdf';
import { examinarPdfAssinado, PARENTESCOS, validarAssinaturaDesenhada } from '../imagemPortal';
import { fail, now, Row, strv } from '../util';
import { json } from './handlers';

/**
 * Portal do responsável (rotas públicas, sem login). O acesso é por link único + código de acesso combinado à parte; cada chamada
 * confere os dois. Nada daqui devolve dados de outros alunos. Só se enxerga a solicitação do próprio link.
 * Estados: ABERTO → (AUTORIZO) AGUARDANDO_ASSINATURA → assinatura desenhada = AUTORIZADO, ou PDF GOV.BR = AGUARDANDO_VALIDACAO (a equipe valida).
 */
const dataBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)} ${iso.slice(11, 16)}`;
const MAX_ERROS_IP = 20, MAX_TENTATIVAS_CODIGO = 5;
const ua = (c: Ctx) => c.ua.slice(0, 200);

/** Confere link e código. Falhas contam por endereço e por link; passou o limite, o link bloqueia e é preciso gerar outro. */
async function acesso(c: Ctx, b: Row): Promise<{ ac: Row; s: Row }> {
  await rateCheck('uip:' + c.ip, MAX_ERROS_IP);
  const token = strv(b.token), codigo = strv(b.codigo).replace(/\D/g, '');
  const invalido = async (): Promise<never> => { await rateFail('uip:' + c.ip); return fail(404, 'Este link não é válido. Peça um novo ao colégio.'); };
  if (token.length < 32 || token.length > 128) return invalido();
  const ac = await q1('SELECT * FROM ui_acessos WHERE token_hash=?', [sha256(token)]);
  if (!ac || !Number(ac.ativo)) return invalido();
  if (String(ac.expira_em) < now()) fail(410, 'Este link expirou. Peça um novo link ao colégio.');
  if (Number(ac.tentativas) >= MAX_TENTATIVAS_CODIGO) fail(423, 'Acesso bloqueado por tentativas incorretas do código. Peça um novo link ao colégio.');
  if (sha256(`${token}:${codigo}`) !== ac.codigo_hash) {
    await run('UPDATE ui_acessos SET tentativas=tentativas+1 WHERE id=?', [ac.id]);
    await rateFail('uip:' + c.ip);
    const resta = MAX_TENTATIVAS_CODIGO - Number(ac.tentativas) - 1;
    fail(403, resta > 0 ? `Código incorreto. Restam ${resta} tentativa(s).` : 'Código incorreto. O acesso foi bloqueado: peça um novo link ao colégio.');
  }
  await run('UPDATE ui_acessos SET ultimo_acesso=?, tentativas=0 WHERE id=?', [now(), ac.id]);
  const s = (await solicCompleta(Number(ac.solicitacao_id))) ?? fail(404, 'Este link não é válido. Peça um novo ao colégio.');
  return { ac, s };
}

const visao = (s: Row, ac: Row) => ({
  protocolo: s.protocolo, aluno: s.aluno, turma: s.turma, modelo: s.modelo_nome, versao: s.modelo_versao, texto: s.termo_texto, hash: String(s.termo_hash).slice(0, 16),
  status: s.status, decisao: s.decisao, modalidade: s.modalidade, responsavel: s.resp_confirmado || s.responsavel_nome, parentesco: s.parentesco,
  encerrada: ENCERRADAS.includes(s.status), decididaEm: s.decisao_em ? dataBR(s.decisao_em) : '', expiraEm: dataBR(String(ac.expira_em)), parentescos: PARENTESCOS,
  recusaDoArquivo: s.status === 'AGUARDANDO_ASSINATURA' && s.validado_por ? s.validacao_obs || 'O arquivo enviado não foi aceito. Assine de novo e envie outro.' : '',
  podeBaixarFinal: ['AUTORIZADO', 'NAO_AUTORIZADO'].includes(s.status) && !!s.final_hash,
});

export async function imagemPortalRoute(c: Ctx): Promise<Response> {
  const { path, method } = c;
  if (method !== 'POST') fail(405, 'Método não permitido.');
  const cab = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' };

  // multipart: o PDF assinado no GOV.BR
  if (path === '/public/imagem/govbr') {
    const form = await c.req.formData();
    const { s } = await acesso(c, { token: form.get('token'), codigo: form.get('codigo') });
    if (s.status !== 'AGUARDANDO_ASSINATURA' || s.decisao !== 'AUTORIZO') fail(409, 'Esta solicitação não está esperando um arquivo assinado.');
    const f = form.get('arquivo');
    if (!(f instanceof File) || !f.size) fail(400, 'Escolha o arquivo PDF assinado.');
    if (f.size > 5 * 1048576) fail(413, 'O arquivo passa de 5 MB.');
    const buf = Buffer.from(await f.arrayBuffer());
    const original = await termosPdf([termoPdfDe(s)]);
    const ex = examinarPdfAssinado(buf, original);
    if (!ex.pdf) fail(400, 'O arquivo não é um PDF válido. Envie o PDF assinado que você baixou do assinador do GOV.BR.');
    if (!ex.temAssinatura) fail(400, 'Este PDF não tem assinatura digital. Assine em assinador.iti.br e envie o arquivo assinado baixado de lá (não use “Imprimir em PDF”).');
    await salvarArquivoSolic(Number(s.id), 'govbr', `termo-assinado-govbr_${s.protocolo}.pdf`, buf, 'application/pdf', `assinatura_detectada=sim; contem_original=${ex.contemOriginal ? 'sim' : 'nao'}`, c.ip);
    await run("UPDATE ui_solicitacoes SET status='AGUARDANDO_VALIDACAO',modalidade='GOVBR',decisao_em=?,ip_decisao=?,ua_decisao=?,validado_por='',validacao_obs='',atualizado_em=? WHERE id=?", [now(), c.ip, ua(c), now(), s.id]);
    await eventoSolic(Number(s.id), 'responsável', 'govbr-enviado', `SHA-256 ${sha(buf).slice(0, 16)}…, ${buf.length} bytes`);
    return json({ ok: true, status: 'AGUARDANDO_VALIDACAO', protocolo: s.protocolo }, 200, cab);
  }

  const b = await c.body();
  const { ac, s } = await acesso(c, b);

  if (path === '/public/imagem/abrir') {
    if (['AGUARDANDO_ENVIO', 'ENVIADO'].includes(s.status)) {
      await run("UPDATE ui_solicitacoes SET status='ABERTO',aberto_em=?,atualizado_em=? WHERE id=?", [now(), now(), s.id]);
      await eventoSolic(Number(s.id), 'responsável', 'aberto', '');
      s.status = 'ABERTO';
    }
    return json(visao(s, ac), 200, cab);
  }

  if (path === '/public/imagem/decidir') {
    if (!['AGUARDANDO_ENVIO', 'ENVIADO', 'ABERTO', 'AGUARDANDO_ASSINATURA'].includes(s.status)) fail(409, ENCERRADAS.includes(s.status) ? 'Esta solicitação já foi respondida.' : 'Esta solicitação já está em validação e não pode ser alterada.');
    const decisao = strv(b.decisao), nome = strv(b.responsavel_nome).replace(/\s+/g, ' ').trim(), parentesco = strv(b.parentesco);
    if (!['AUTORIZO', 'NAO_AUTORIZO'].includes(decisao)) fail(400, 'Escolha AUTORIZO ou NÃO AUTORIZO.');
    if (nome.length < 5 || !nome.includes(' ') || nome.length > 160) fail(400, 'Digite o nome completo do responsável legal.');
    if (!PARENTESCOS.includes(parentesco)) fail(400, 'Informe o seu grau de responsabilidade.');
    if (b.leu_termo !== true || b.dados_corretos !== true || b.sou_responsavel !== true) fail(400, 'Marque as três confirmações: li o termo, os dados estão corretos e sou o responsável legal.');
    if (decisao === 'AUTORIZO') {
      await run("UPDATE ui_solicitacoes SET status='AGUARDANDO_ASSINATURA',decisao='AUTORIZO',resp_confirmado=?,parentesco=?,atualizado_em=? WHERE id=?", [nome, parentesco, now(), s.id]);
      await eventoSolic(Number(s.id), 'responsável', 'autorizo-escolhido', `${nome} (${parentesco}); falta assinar`);
      return json({ ok: true, status: 'AGUARDANDO_ASSINATURA' }, 200, cab);
    }
    const em = now();
    const pdf = await termosPdf([termoPdfDe({ ...s, resp_confirmado: nome }, { tipo: 'NAO_AUTORIZO', nome, parentesco, em: dataBR(em) })]);
    await salvarArquivoSolic(Number(s.id), 'final', `registro-nao-autorizacao_${s.protocolo}.pdf`, pdf, 'application/pdf', 'registro de não autorização', c.ip);
    await run("UPDATE ui_solicitacoes SET status='NAO_AUTORIZADO',decisao='NAO_AUTORIZO',decisao_em=?,resp_confirmado=?,parentesco=?,modalidade='',ip_decisao=?,ua_decisao=?,final_hash=?,atualizado_em=? WHERE id=?", [em, nome, parentesco, c.ip, ua(c), sha(pdf), em, s.id]);
    await eventoSolic(Number(s.id), 'responsável', 'nao-autorizado', `${nome} (${parentesco})`);
    return json({ ok: true, status: 'NAO_AUTORIZADO', protocolo: s.protocolo }, 200, cab);
  }

  if (path === '/public/imagem/assinar') {
    if (s.status !== 'AGUARDANDO_ASSINATURA' || s.decisao !== 'AUTORIZO') fail(409, ENCERRADAS.includes(s.status) ? 'Esta solicitação já foi respondida.' : 'Esta solicitação não está esperando assinatura.');
    if (b.confirmo_assinatura !== true) fail(400, 'Confirme que a assinatura desenhada é sua e vale como a sua autorização.');
    const v = await validarAssinaturaDesenhada(strv(b.assinatura));
    if (!v.ok) fail(400, v.erro);
    const em = now();
    const pdf = await termosPdf([termoPdfDe(s, { tipo: 'DESENHADA', nome: s.resp_confirmado, parentesco: s.parentesco, em: dataBR(em), png: v.png })]);
    await salvarArquivoSolic(Number(s.id), 'assinatura', `assinatura_${s.protocolo}.png`, v.png, 'image/png', `sha256=${v.hash.slice(0, 16)}`, c.ip);
    await salvarArquivoSolic(Number(s.id), 'final', `termo-assinado_${s.protocolo}.pdf`, pdf, 'application/pdf', 'termo com assinatura manuscrita desenhada', c.ip);
    await run("UPDATE ui_solicitacoes SET status='AUTORIZADO',modalidade='DESENHADA',decisao_em=?,ip_decisao=?,ua_decisao=?,final_hash=?,atualizado_em=? WHERE id=?", [em, c.ip, ua(c), sha(pdf), em, s.id]);
    await eventoSolic(Number(s.id), 'responsável', 'autorizado', `assinatura desenhada; ${s.resp_confirmado} (${s.parentesco})`);
    return json({ ok: true, status: 'AUTORIZADO', protocolo: s.protocolo }, 200, cab);
  }

  if (path === '/public/imagem/pdf') {
    const tipo = strv(b.tipo) === 'final' ? 'final' : 'original';
    let buf: Buffer;
    if (tipo === 'final') { const f = (await lerArquivoSolic(Number(s.id), 'final')) ?? (s.status === 'AUTORIZADO' ? await lerArquivoSolic(Number(s.id), 'govbr') : null); if (!f) fail(404, 'Ainda não há documento final.'); buf = f.buf; }
    else buf = await termosPdf([termoPdfDe(s)]);
    return new Response(new Uint8Array(buf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="Autorizacao-Uso-de-Imagem_${s.protocolo}${tipo === 'final' ? '_assinada' : ''}.pdf"`, ...cab } });
  }

  return fail(404, 'Rota não encontrada.');
}
