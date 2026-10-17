import { Ctx } from '../ctx';
import { q } from '../db';
import { requireInternal, requireManager } from '../auth';
import { saveUploads } from '../files';
import { caminhoSolicitacao, ETAPAS, Etapa, etapaDe, ROTULO_ETAPA } from '../fluxo';
import { registrarNotificacao } from '../notificacoes';
import { audit, getRow, insertRow, listRows, modifyRow, notifyAssignment, updateRow } from '../records';
import { fail, fmtDate, HttpError, lower, now, Row, strv } from '../util';
import { json } from './handlers';

/**
 * Tela única "Solicitações": 4 etapas (Pendente, Em andamento, Em aprovação, Concluído) sobre os 9 status internos.
 * Os dados e o Portal continuam com os status originais; aqui só se traduz e se valida quem pode mover o quê.
 */
const PRIORIDADES = ['BAIXA', 'MÉDIA', 'ALTA', 'URGENTE'];
const STATUS_DE: Record<Etapa, string> = {
  PENDENTE: 'EM ANÁLISE', EM_ANDAMENTO: 'EM EXECUÇÃO', EM_APROVACAO: 'AGUARDANDO APROVAÇÃO DO SOLICITANTE', CONCLUIDO: 'CONCLUÍDA',
};
/** Quem não é Gerência só faz estes avanços, e só nas solicitações em que é o responsável. */
const EQUIPE_PODE: [Etapa, Etapa][] = [['PENDENTE', 'EM_ANDAMENTO'], ['EM_ANDAMENTO', 'EM_APROVACAO'], ['EM_ANDAMENTO', 'CONCLUIDO']];
const EDITAVEIS = ['titulo', 'descricao', 'solicitante', 'segmento', 'prazo', 'prioridade', 'exigeAprovacao'];

const ehDono = (u: Row, r: Row) => strv(r.responsavel).trim() !== '' && lower(strv(r.responsavel).trim()) === lower(String(u.nome));
const sim = (v: unknown) => ['1', 'sim', 'true', 's'].includes(lower(strv(v).trim()));

/** Aprovação só quando necessária: marcada na solicitação; as vindas do Portal pedem conferência do solicitante, salvo indicação contrária. */
export function exigeAprovacao(r: Row): boolean {
  const v = strv(r.exigeAprovacao).trim();
  if (v !== '') return sim(v);
  return strv(r.origem) === 'PORTAL_SOLICITANTE';
}
export const prazoEfetivo = (r: Row) => strv(r.prazoNegociado) || strv(r.prazo) || strv(r.prazoSLA);

function enriquecer(r: Row, hoje: string): Row {
  const etapa = etapaDe(strv(r.status));
  const prazo = prazoEfetivo(r);
  return {
    ...r, etapa, etapaRotulo: ROTULO_ETAPA[etapa], prazoEfetivo: prazo, exigeAprovacao: exigeAprovacao(r) ? '1' : '0',
    cancelada: strv(r.status).toUpperCase() === 'CANCELADA', aguardandoSolicitante: strv(r.status).toUpperCase() === 'AGUARDANDO SOLICITANTE',
    atrasada: etapa !== 'CONCLUIDO' && prazo !== '' && prazo < hoje,
  };
}

async function opcoes(rows: Row[]): Promise<Row> {
  const segs = new Set<string>(), resp = new Set<string>(), sol = new Set<string>();
  for (const r of rows) { if (strv(r.segmento).trim()) segs.add(strv(r.segmento).trim()); if (strv(r.solicitante).trim()) sol.add(strv(r.solicitante).trim()); if (strv(r.responsavel).trim()) resp.add(strv(r.responsavel).trim()); }
  for (const p of await q('SELECT nome,segmentos FROM portal_users WHERE ativo=1')) { sol.add(String(p.nome)); try { for (const s of JSON.parse(p.segmentos)) segs.add(String(s)); } catch { /* ignora */ } }
  for (const u of await q('SELECT nome FROM users WHERE ativo=1 ORDER BY nome')) resp.add(String(u.nome));
  for (const e of await listRows('equipe')) if (strv(e.titulo).trim() && lower(strv(e.ativo || 'SIM')) !== 'não') resp.add(strv(e.titulo).trim());
  const ord = (s: Set<string>) => [...s].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  return { segmentos: ord(segs), responsaveis: ord(resp), solicitantes: ord(sol), prioridades: PRIORIDADES };
}

async function avisarGerencia(u: Row, titulo: string, texto: string, id: string): Promise<void> {
  if (u.role !== 'manager') await registrarNotificacao('solicitacao', 'gerencia', titulo, texto, 'solicitacoes', id);
}

export async function solicitacoesRoute(c: Ctx): Promise<Response> {
  const { path, method } = c;
  const u = await requireInternal(c);
  const gerente = u.role === 'manager';

  if (path === '/solicitacoes/painel' && method === 'GET') {
    const rows = await listRows('solicitacoes');
    const hoje = fmtDate(new Date());
    return json({ rows: rows.map((r) => enriquecer(r, hoje)), opcoes: await opcoes(rows), eu: { nome: u.nome, role: u.role, codigo: u.codigo }, hoje });
  }

  if (path === '/solicitacoes/nova' && method === 'POST') {
    const b = await c.body();
    const titulo = strv(b.titulo).trim();
    if (titulo.length < 3) fail(400, 'Informe o título (mínimo 3 letras).');
    const prioridade = strv(b.prioridade).trim().toUpperCase() || 'MÉDIA';
    if (!PRIORIDADES.includes(prioridade)) fail(400, 'Prioridade inválida.');
    const prazo = strv(b.prazo).trim();
    if (prazo && !/^\d{4}-\d{2}-\d{2}$/.test(prazo)) fail(400, 'Prazo inválido.');
    const resp = strv(b.responsavel).trim();
    if (resp && !gerente && lower(resp) !== lower(String(u.nome))) fail(403, 'Só a Gerente distribui para outras pessoas.');
    const descricao = strv(b.descricao).trim();
    const status = resp ? 'DISTRIBUÍDA' : 'AGUARDANDO TRIAGEM';
    const row: Row = {
      titulo, descricao, objetivo: descricao, solicitante: strv(b.solicitante).trim() || String(u.nome), segmento: strv(b.segmento).trim(),
      responsavel: resp, prazo, prioridade, status, triagemStatus: status, origem: 'INTERNO', tipoSolicitacao: 'Demanda interna',
      exigeAprovacao: sim(b.exigeAprovacao) ? '1' : '0', aprovacaoSolicitante: 'PENDENTE',
    };
    if (resp) { row.gerenteTriagem = String(u.nome); row.distribuidoEm = now(); }
    const novo = await insertRow('solicitacoes', row, u.codigo);
    await notifyAssignment('solicitacoes', novo, null, u.nome);
    if (resp && lower(resp) !== lower(String(u.nome))) await registrarNotificacao('responsavel', resp, 'Demanda atribuída a você', `"${titulo}" agora está com você.`, 'solicitacoes', String(novo.id));
    await avisarGerencia(u, 'Nova solicitação', `${u.nome} cadastrou "${titulo}".`, String(novo.id));
    return json(enriquecer(novo, fmtDate(new Date())), 201);
  }

  if (path === '/solicitacoes/editar' && method === 'POST') {
    const b = await c.body();
    const id = strv(b.id);
    const cur = (await getRow('solicitacoes', id)) ?? fail(404, 'Solicitação não encontrada.');
    if (!gerente && !ehDono(u, cur)) fail(403, 'Só a Gerente ou o responsável pode alterar esta solicitação.');
    if (etapaDe(strv(cur.status)) === 'CONCLUIDO') fail(409, 'Solicitação concluída: reabra para alterar.');
    const patch: Row = {};
    for (const k of EDITAVEIS) if (k in b) patch[k] = strv(b[k]).trim();
    if ('exigeAprovacao' in patch) patch.exigeAprovacao = sim(patch.exigeAprovacao) ? '1' : '0';
    if (!gerente) delete patch.exigeAprovacao;
    if ('titulo' in patch && String(patch.titulo).length < 3) fail(400, 'Informe o título (mínimo 3 letras).');
    if ('prioridade' in patch) { patch.prioridade = String(patch.prioridade).toUpperCase(); if (!PRIORIDADES.includes(patch.prioridade)) fail(400, 'Prioridade inválida.'); }
    if ('prazo' in patch && patch.prazo && !/^\d{4}-\d{2}-\d{2}$/.test(patch.prazo)) fail(400, 'Prazo inválido.');
    if ('prazo' in patch) patch.prazoNegociado = ''; // um prazo novo substitui o negociado antigo
    if ('descricao' in patch) patch.objetivo = patch.descricao;
    const nw = await updateRow('solicitacoes', id, patch, u.codigo, { semTarefa: true });
    return json(enriquecer(nw, fmtDate(new Date())));
  }

  if (path === '/solicitacoes/distribuir' && method === 'POST') {
    await requireManager(c);
    const b = await c.body();
    const id = strv(b.id);
    const cur = (await getRow('solicitacoes', id)) ?? fail(404, 'Solicitação não encontrada.');
    const resp = strv(b.responsavel).trim();
    if (!resp) fail(400, 'Escolha o responsável.');
    if (etapaDe(strv(cur.status)) === 'CONCLUIDO') fail(409, 'Solicitação concluída: reabra para distribuir.');
    const patch: Row = { responsavel: resp, gerenteTriagem: String(u.nome), triagemStatus: strv(cur.triagemStatus) };
    const st = strv(cur.status).toUpperCase();
    if (['NOVA', 'AGUARDANDO TRIAGEM', 'EM ANÁLISE'].includes(st)) { patch.status = 'DISTRIBUÍDA'; patch.triagemStatus = 'DISTRIBUÍDA'; patch.distribuidoEm = now(); }
    const prazo = strv(b.prazo).trim();
    if (prazo) { if (!/^\d{4}-\d{2}-\d{2}$/.test(prazo)) fail(400, 'Prazo inválido.'); patch.prazo = prazo; patch.prazoNegociado = ''; }
    if (strv(b.prioridade).trim()) { const p = strv(b.prioridade).trim().toUpperCase(); if (!PRIORIDADES.includes(p)) fail(400, 'Prioridade inválida.'); patch.prioridade = p; }
    const nw = await updateRow('solicitacoes', id, patch, u.codigo, { semTarefa: true });
    await notifyAssignment('solicitacoes', nw, cur, u.nome);
    return json(enriquecer(nw, fmtDate(new Date())));
  }

  if (path === '/solicitacoes/mover' && method === 'POST') {
    const b = await c.body();
    const id = strv(b.id);
    const cur = (await getRow('solicitacoes', id)) ?? fail(404, 'Solicitação não encontrada.');
    const alvoNome = strv(b.etapa).trim().toUpperCase();
    const motivo = strv(b.motivo).trim();
    const statusAtual = strv(cur.status).toUpperCase();
    const de = etapaDe(statusAtual);
    const cancelar = alvoNome === 'CANCELADA';
    if (!cancelar && !(ETAPAS as readonly string[]).includes(alvoNome)) fail(400, 'Etapa inválida.');
    const para = (cancelar ? 'CONCLUIDO' : alvoNome) as Etapa;
    if (!gerente) {
      if (cancelar) fail(403, 'Só a Gerente cancela uma solicitação.');
      if (!ehDono(u, cur)) fail(403, 'Só a Gerente ou o responsável pode mudar a etapa desta solicitação.');
      if (de !== para && !EQUIPE_PODE.some(([a, z]) => a === de && z === para)) fail(403, `A equipe avança só para a etapa seguinte; de ${ROTULO_ETAPA[de]} para ${ROTULO_ETAPA[para]} fale com a Gerente.`);
    }
    if (cancelar) {
      if (de === 'CONCLUIDO') fail(409, 'Solicitação já concluída ou cancelada.');
      if (motivo.length < 3) throw new HttpError(409, 'Informe o motivo do cancelamento.', { motivo: true });
    } else {
      if (de === para) return json(enriquecer(cur, fmtDate(new Date())));
      const volta = ETAPAS.indexOf(para) < ETAPAS.indexOf(de);
      if (volta && motivo.length < 3) throw new HttpError(409, `Informe o motivo para voltar de ${ROTULO_ETAPA[de]} para ${ROTULO_ETAPA[para]}.`, { motivo: true });
      if (statusAtual === 'CANCELADA' && !volta) fail(409, 'Solicitação cancelada: reabra antes de mover.');
      if (para !== 'PENDENTE' && !strv(cur.responsavel).trim()) fail(409, 'Distribua a solicitação (escolha o responsável) antes de iniciar.');
      const exige = exigeAprovacao(cur);
      if (para === 'EM_APROVACAO' && !exige) fail(409, 'Esta solicitação não exige aprovação: conclua direto.');
      if (para === 'CONCLUIDO' && de !== 'EM_APROVACAO' && exige) fail(409, 'Esta solicitação exige aprovação: envie para Em aprovação antes de concluir.');
    }
    const destino = cancelar ? 'CANCELADA' : STATUS_DE[para];
    // reabrir uma cancelada começa pela triagem; o restante segue as transições permitidas
    const partida = statusAtual === 'CANCELADA' ? 'AGUARDANDO TRIAGEM' : statusAtual;
    const passos = (statusAtual === 'CANCELADA' ? ['AGUARDANDO TRIAGEM'] : []).concat(caminhoSolicitacao(partida, destino));
    if (!passos.length && partida !== destino) fail(409, 'Essa mudança não é permitida a partir da etapa atual.');
    let atual: Row = cur, anterior = statusAtual;
    for (const passo of passos) {
      const patch: Row = { status: passo, triagemStatus: passo, motivoTransicao: motivo || 'Movida no quadro' };
      if (passo === 'EM EXECUÇÃO' && !atual.iniciadoEm) { patch.iniciadoEm = now(); patch.iniciadoPor = String(u.nome); }
      if (passo === 'AGUARDANDO APROVAÇÃO DO SOLICITANTE') { patch.aprovacaoSolicitante = 'PENDENTE'; patch.entregaEm = now(); patch.retornoSolicitante = strv(b.mensagem).trim() || 'Material concluído. Confira e aprove a entrega.'; }
      if (passo === 'CONCLUÍDA') {
        patch.concluidoEm = now();
        if (anterior === 'AGUARDANDO APROVAÇÃO DO SOLICITANTE') { patch.aprovacaoSolicitante = 'APROVADO'; patch.aprovadoSolicitanteEm = now(); patch.aprovadoPor = String(u.nome); }
      }
      if (passo === 'CANCELADA') patch.canceladaEm = now();
      if (de === 'CONCLUIDO' || statusAtual === 'CANCELADA') { patch.concluidoEm = ''; patch.canceladaEm = ''; }
      atual = await updateRow('solicitacoes', id, patch, u.codigo, { semTarefa: true });
      anterior = passo;
    }
    await audit(String(u.codigo), 'mover', 'solicitacoes', id);
    if (para === 'EM_APROVACAO') await avisarGerencia(u, 'Solicitação em aprovação', `"${strv(cur.titulo)}" foi enviada para aprovação por ${u.nome}.`, id);
    if (para === 'CONCLUIDO' && !cancelar) await avisarGerencia(u, 'Solicitação concluída', `"${strv(cur.titulo)}" foi concluída por ${u.nome}.`, id);
    return json(enriquecer(atual, fmtDate(new Date())));
  }

  if (path === '/solicitacoes/pedir-info' && method === 'POST') {
    const b = await c.body();
    const id = strv(b.id);
    const cur = (await getRow('solicitacoes', id)) ?? fail(404, 'Solicitação não encontrada.');
    if (!gerente && !ehDono(u, cur)) fail(403, 'Só a Gerente ou o responsável pode pedir informações ao solicitante.');
    if (strv(cur.origem) !== 'PORTAL_SOLICITANTE') fail(409, 'Só solicitações vindas do Portal têm solicitante para responder.');
    const msg = strv(b.mensagem).trim();
    if (msg.length < 3) fail(400, 'Escreva o que você precisa saber.');
    const st = strv(cur.status).toUpperCase();
    if (st === 'AGUARDANDO SOLICITANTE') fail(409, 'Já está aguardando o solicitante.');
    if (!['AGUARDANDO TRIAGEM', 'EM ANÁLISE', 'DISTRIBUÍDA', 'EM EXECUÇÃO'].includes(st)) fail(409, 'Nesta etapa não é possível pedir informações.');
    const nw = await updateRow('solicitacoes', id, { status: 'AGUARDANDO SOLICITANTE', triagemStatus: 'DEVOLVIDA PARA AJUSTES', retornoSolicitante: msg, ajusteSolicitadoEm: now(), motivoTransicao: msg }, u.codigo, { semTarefa: true });
    return json(enriquecer(nw, fmtDate(new Date())));
  }

  if (path === '/solicitacoes/anexo' && method === 'POST') {
    const id = c.qs('id');
    const cur = (await getRow('solicitacoes', id)) ?? fail(404, 'Solicitação não encontrada.');
    if (!gerente && !ehDono(u, cur) && strv(cur.criadoPor) !== String(u.codigo)) fail(403, 'Só a Gerente, o responsável ou quem criou pode anexar.');
    const salvos = await saveUploads(c, id, '');
    if (!salvos.length) fail(400, 'Escolha ao menos um arquivo.');
    const nw = await modifyRow('solicitacoes', id, (r) => {
      const atuais = strv(r.anexos).split('|').map((s) => s.trim()).filter(Boolean);
      return { ...r, anexos: [...atuais, ...salvos].join(' | '), atualizadoEm: now() };
    });
    await audit(String(u.codigo), 'upload', 'solicitacoes', id);
    return json({ files: salvos, anexos: strv(nw.anexos) });
  }

  return fail(404, 'Rota não encontrada.');
}
