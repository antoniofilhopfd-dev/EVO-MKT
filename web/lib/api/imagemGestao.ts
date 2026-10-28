import { Ctx } from '../ctx';
import { requireAdmin } from '../auth';
import { q, q1, run } from '../db';
import { audit } from '../records';
import { respostaPdf } from '../pdf';
import { eventoSolic, ENCERRADAS, solicCompleta } from '../imagemDados';
import { lerConfig, gravarConfig, mensagemCom } from '../imagemConfig';
import { dadosRelatorio, fichaPdf, lerFiltro, relatorioPdf, relatorioXlsx } from '../imagemRelatorio';
import { fail, now, Row, strv } from '../util';
import { json } from './handlers';

/** Uso de Imagem, etapa 4: ficha do aluno, relatórios (tela, PDF e Excel), ajustes, revogação e lembretes moderados. */
const quandoBR = () => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Fortaleza', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date());
const limpa = (v: unknown, n: number) => strv(v).replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const LEMBRAVEIS = ['ENVIADO', 'ABERTO', 'AGUARDANDO_ASSINATURA'];

async function fichaDados(id: number) {
  const aluno = await q1('SELECT * FROM ui_alunos WHERE id=?', [id]) ?? fail(404, 'Aluno não encontrado.');
  const sols = await q('SELECT s.* FROM ui_solicitacoes s WHERE s.aluno_id=? ORDER BY s.id DESC', [id]);
  for (const s of sols) {
    s.eventos = await q('SELECT quando,ator,acao,detalhe FROM ui_solic_eventos WHERE solicitacao_id=? ORDER BY id DESC LIMIT 60', [s.id]);
    s.arquivos = await q('SELECT tipo,nome,sha256,tamanho,info,criado_em FROM ui_arquivos WHERE solicitacao_id=? AND ativo=1 ORDER BY id', [s.id]);
  }
  return { aluno, solicitacoes: sols };
}

export async function imagemGestaoRoute(c: Ctx, u: Row): Promise<Response | null> {
  const { path, method } = c;
  const ator = String(u.nome ?? u.codigo ?? '');
  const ehAdmin = !!Number(u.admin) && u.role === 'manager';

  if (path === '/imagem/config' && method === 'GET') {
    const cfg = await lerConfig(), corte = now(new Date(Date.now() - cfg.retencaoAnos * 365.25 * 86400_000));
    const el = await q1("SELECT COUNT(*) n FROM ui_solicitacoes WHERE status IN ('NAO_AUTORIZADO','VENCIDO','REVOGADO','CANCELADO') AND atualizado_em<?", [corte]);
    return json({ config: cfg, podeEditar: ehAdmin, retencao: { anos: cfg.retencaoAnos, elegiveisParaRevisao: Number(el?.n ?? 0) } });
  }
  if (path === '/imagem/config' && method === 'POST') {
    await requireAdmin(c);
    const erro = await gravarConfig(await c.body());
    if (erro) fail(400, erro);
    await audit(ator, 'imagem-config-alterada', 'ui_config', '');
    return json({ ok: true, config: await lerConfig() });
  }

  if (path === '/imagem/alunos/ficha' && method === 'GET') {
    const f = await fichaDados(Number(c.qs('id')) || 0);
    return json({
      aluno: { id: f.aluno.id, nome: f.aluno.nome, matricula: f.aluno.matricula, turma: f.aluno.turma, segmento: f.aluno.segmento, ativo: !!Number(f.aluno.ativo) },
      solicitacoes: f.solicitacoes.map((s) => ({ id: s.id, protocolo: s.protocolo, modelo: s.modelo_nome, versao: s.modelo_versao, status: s.status, responsavel: s.resp_confirmado || s.responsavel_nome, parentesco: s.parentesco, decisao: s.decisao, decisaoEm: s.decisao_em, modalidade: s.modalidade, venceEm: s.vence_em, criadoEm: s.criado_em, revogadoEm: s.revogado_em, revogadoPor: s.revogado_por, revogadoMotivo: s.revogado_motivo, validadoPor: s.validado_por, validadoEm: s.validado_em, termoHash: s.termo_hash, lembretes: s.lembretes, eventos: s.eventos, arquivos: s.arquivos })),
    });
  }
  if (path === '/imagem/alunos/ficha.pdf' && method === 'GET') {
    const f = await fichaDados(Number(c.qs('id')) || 0);
    await audit(ator, 'imagem-ficha-exportada', 'ui_alunos', String(f.aluno.id));
    return respostaPdf(await fichaPdf(f, quandoBR()), `Ficha-Uso-de-Imagem_${String(f.aluno.matricula).replace(/[^A-Za-z0-9_-]/g, '_')}.pdf`);
  }

  if (path === '/imagem/relatorio' || path === '/imagem/relatorio.pdf' || path === '/imagem/relatorio.xlsx') {
    if (method !== 'GET') fail(405, 'Método não permitido.');
    const f = lerFiltro(c.qs), d = await dadosRelatorio(f);
    if (path === '/imagem/relatorio') return json({ filtro: f, resumo: { total: d.total, alunos: d.alunos, porStatus: d.porStatus }, porSegmento: d.porSegmento, porTurma: d.porTurma, linhas: d.linhas.slice(0, 500).map((r) => ({ id: r.id, protocolo: r.protocolo, aluno: r.aluno, matricula: r.matricula, turma: r.turma, segmento: r.segmento, modelo: r.modelo_nome, versao: r.modelo_versao, status: r.status, criadoEm: r.criado_em, decisaoEm: r.decisao_em, venceEm: r.vence_em })), truncado: d.linhas.length > 500 });
    await audit(ator, path.endsWith('pdf') ? 'imagem-relatorio-pdf' : 'imagem-relatorio-xlsx', 'ui_solicitacoes', String(d.total));
    if (path.endsWith('.pdf')) return respostaPdf(await relatorioPdf(d, f, quandoBR()), `Relatorio-Uso-de-Imagem_${now().slice(0, 10)}.pdf`);
    return new Response(new Uint8Array(relatorioXlsx(d)), { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="Relatorio-Uso-de-Imagem_${now().slice(0, 10)}.xlsx"`, 'Cache-Control': 'no-store' } });
  }

  /** Revogação: o termo passa a REVOGADO; a evidência (arquivos, hash, histórico) fica. */
  if (path === '/imagem/solicitacoes/revogar' && method === 'POST') {
    if ((await lerConfig()).quemRevoga === 'admin') await requireAdmin(c);
    const b = await c.body(), id = Number(b.id) || 0, motivo = limpa(b.motivo, 400);
    const s = await solicCompleta(id) ?? fail(404, 'Solicitação não encontrada.');
    if (s.status !== 'AUTORIZADO') fail(409, 'Só uma autorização em vigor pode ser revogada.');
    if (motivo.length < 5) fail(400, 'Registre quem pediu e por quê (mínimo de 5 letras).');
    await run("UPDATE ui_solicitacoes SET status='REVOGADO',revogado_em=?,revogado_por=?,revogado_motivo=?,atualizado_em=? WHERE id=?", [now(), ator, motivo, now(), id]);
    await eventoSolic(id, ator, 'revogado', motivo);
    await audit(ator, 'imagem-autorizacao-revogada', 'ui_solicitacoes', String(id));
    return json({ ok: true });
  }

  /** Lembretes moderados: respeita o intervalo mínimo e o máximo configurados. O sistema só prepara o texto; quem envia é uma pessoa. */
  if (path === '/imagem/solicitacoes/lembrete' && method === 'POST') {
    const b = await c.body(), ids = [...new Set((Array.isArray(b.ids) ? b.ids : []).map(Number).filter((n: number) => n > 0))].slice(0, 200);
    if (!ids.length) fail(400, 'Marque ao menos uma solicitação.');
    const cfg = await lerConfig(), ok: Row[] = [], ignoradas: { aluno: string; motivo: string }[] = [];
    for (const id of ids) {
      const s = await solicCompleta(id);
      if (!s) continue;
      if (!LEMBRAVEIS.includes(s.status)) { ignoradas.push({ aluno: s.aluno, motivo: ENCERRADAS.includes(s.status) ? 'Solicitação já encerrada.' : s.status === 'AGUARDANDO_ENVIO' ? 'Ainda não foi enviada: envie primeiro.' : 'Aguardando a validação da equipe: não é caso de lembrete.' }); continue; }
      if (Number(s.lembretes) >= cfg.lembreteMax) { ignoradas.push({ aluno: s.aluno, motivo: `Já recebeu ${cfg.lembreteMax} lembrete(s): o limite foi atingido. Prefira um contato direto.` }); continue; }
      const ref = String(s.ultimo_lembrete || s.enviado_em || s.criado_em);
      const proximo = new Date(Date.parse(ref) + cfg.lembreteIntervaloDias * 86400_000);
      if (Date.now() < proximo.getTime()) { ignoradas.push({ aluno: s.aluno, motivo: `Muito cedo: o intervalo mínimo é de ${cfg.lembreteIntervaloDias} dia(s). Próximo lembrete a partir de ${proximo.toISOString().slice(8, 10)}/${proximo.toISOString().slice(5, 7)}.` }); continue; }
      await run('UPDATE ui_solicitacoes SET lembretes=lembretes+1,ultimo_lembrete=?,atualizado_em=? WHERE id=?', [now(), now(), id]);
      await eventoSolic(id, ator, 'lembrete', `lembrete ${Number(s.lembretes) + 1} de ${cfg.lembreteMax}`);
      ok.push({ id, aluno: s.aluno, protocolo: s.protocolo, telefone: s.responsavel_tel, email: s.responsavel_email, numero: Number(s.lembretes) + 1, mensagem: mensagemCom(cfg.mensagemLembrete, { aluno: s.aluno, protocolo: s.protocolo }) });
    }
    if (ok.length) await audit(ator, 'imagem-lembretes-preparados', 'ui_solicitacoes', String(ok.length));
    return json({ ok: true, lembretes: ok, ignoradas, max: cfg.lembreteMax });
  }

  return null;
}
