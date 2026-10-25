import { lerFiltros } from '../filtros';
import { rotuloSegmento } from '../segmentos';
import { Ctx } from '../ctx';
import { q, q1, run } from '../db';
import { requireInternal } from '../auth';
import { audit, getRow, insertRow, listRows, logStatus, modifyRow } from '../records';
import { registrarNotificacao } from '../notificacoes';
import { adicionarComentario } from '../comentarios';
import { adicionarMaterial, copiaParaNova, materiaisAtivos, materiaisDe, pendencias, PAPEIS, requisitosDeAgendamento, sincronizarMidia, statusAtual, tipoDeLink, urlPermitida } from '../conteudo';
import { conteudoCoerente } from '../files';
import { envInt, fail, now, Row, safePart, strv } from '../util';
import { igMarkError, igPublish } from '../integrations/meta';
import { json } from './handlers';

export const CANAIS = ['Instagram', 'TikTok', 'YouTube'];
const MIME: Record<string, string> = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', mp4: 'video/mp4', mov: 'video/quicktime', txt: 'text/plain', csv: 'text/csv', zip: 'application/zip', svg: 'image/svg+xml', mp3: 'audio/mpeg', wav: 'audio/wav' };
const EXT_MATERIAL = ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'mp4', 'mov', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'zip', 'psd', 'ai', 'svg', 'mp3', 'wav'];

/**
 * Estado da publicação, deliberadamente separado do status editorial:
 * um agendamento INTERNO nunca é tratado como publicação confirmada.
 */
export function estadoPublicacao(r: Row, ig?: Row | null): string {
  const st = statusAtual(r.status);
  if (ig?.status === 'ERRO') return 'FALHA NA PUBLICAÇÃO';
  if (ig?.status === 'PUBLICADO' && ig.media_id) return 'PUBLICAÇÃO CONFIRMADA';
  if (ig?.status === 'PROCESSANDO') return 'ENVIADO À PLATAFORMA';
  if (st === 'PUBLICADO') return strv(r.publicadoConfirmadoEm) || strv(r.linkPublicacao) ? 'PUBLICAÇÃO CONFIRMADA' : 'PUBLICADO SEM CONFIRMAÇÃO';
  if (st === 'AGENDADO') return 'AGENDADO INTERNAMENTE';
  if (st === 'APROVADO') return 'APROVADO';
  if (st === 'EM PRODUÇÃO' || st === 'EM REVISÃO') return 'EM PRODUÇÃO';
  if (st === 'ARQUIVADO') return 'ARQUIVADO';
  return 'PLANEJADO';
}

async function conteudo(id: string): Promise<Row> {
  return (await getRow('conteudos', id)) ?? fail(404, 'Publicação não encontrada.');
}
const sair = (r: Row) => ({ id: r.id, materiais: materiaisDe(r) });

export async function conteudoRoute(c: Ctx) {
  const { path, method } = c;
  const u = await requireInternal(c);
  if (path === '/content/list' && method === 'GET') {
    const f = lerFiltros(c);
    const inteiro = (k: string, padrao: number, max: number) => {
      const v = c.qs(k);
      if (!v) return padrao;
      if (!/^\d+$/.test(v) || Number(v) < 1 || Number(v) > max) fail(400, 'Paginação inválida.');
      return Number(v);
    };
    const tamanho = inteiro('tamanho', 30, 100), solicitada = inteiro('pagina', 1, 1000000);
    const where = ["r.modulo='conteudos'"], args: unknown[] = [];
    const campo = (k: string) => `COALESCE(JSON_UNQUOTE(JSON_EXTRACT(r.data,'$.${k}')),'')`;
    const igual = (k: string, v: string) => { if (v) { where.push(`${campo(k)}=?`); args.push(v); } };
    if (f.perfil) { where.push(`${campo('perfil')} IN (?, 'Ambos')`); args.push(f.perfil); }
    if (f.segmento) { where.push(`${campo('segmento')} IN (?, 'Todos')`); args.push(rotuloSegmento(f.segmento)); }
    igual('formato', f.formato); igual('campanhaId', f.campanha);
    igual('status', c.qs('status')); igual('responsavel', c.qs('responsavel'));
    const busca = c.qs('busca').trim().toLowerCase().slice(0, 300);
    if (busca) { where.push(`LOCATE(?, LOWER(CONCAT(${campo('titulo')},' ',${campo('legenda')},' ',${campo('hashtags')})))>0`); args.push(busca); }
    // Foco do Dashboard: IDs validados e parametrizados, sem carregar toda a coleção.
    if (c.url.searchParams.has('ids')) {
      const ids = c.qs('ids').split(',').filter(Boolean);
      if (ids.length > 5000 || ids.some(id => !/^[A-Za-z0-9._-]{1,64}$/.test(id))) fail(400, 'Foco inválido.');
      where.push(ids.length ? `r.id IN (${ids.map(() => '?').join(',')})` : '1=0'); args.push(...ids);
    }
    const sqlWhere = where.join(' AND ');
    const total = Number((await q1(`SELECT COUNT(*) n FROM records r WHERE ${sqlWhere}`, args))?.n || 0);
    const paginas = Math.max(1, Math.ceil(total / tamanho)), pagina = Math.min(solicitada, paginas);
    const dados = await q(`SELECT r.data,p.status ig_status,p.media_id,p.erro FROM records r LEFT JOIN ig_publish p ON p.conteudo_id=r.id WHERE ${sqlWhere} ORDER BY ${campo('publicacaoEm')} DESC,r.id DESC LIMIT ${tamanho} OFFSET ${(pagina - 1) * tamanho}`, args);
    const rows = dados.map(x => JSON.parse(x.data));
    const estados = dados.map((x, i) => ({ id: rows[i].id, estado: estadoPublicacao(rows[i], { status: x.ig_status, media_id: x.media_id }), erro: x.ig_status === 'ERRO' ? x.erro : '', pendencias: pendencias(rows[i]) }));
    return json({ rows, estados, total, pagina, paginas, tamanho });
  }
  if (path === '/content/states') {
    const igs = new Map((await q('SELECT conteudo_id,status,media_id,erro FROM ig_publish')).map((x: Row) => [String(x.conteudo_id), x]));
    return json({
      rows: (await listRows('conteudos')).map((r) => {
        const ig = igs.get(String(r.id));
        return { id: r.id, canal: strv(r.canal) || 'Instagram', estado: estadoPublicacao(r, ig), erro: ig?.status === 'ERRO' ? ig.erro : '', pendencias: pendencias(r) };
      }),
      canais: CANAIS,
    });
  }
  if (path === '/content/decision' && method === 'POST') {
    const b = await c.body();
    const id = strv(b.id);
    const cur = await conteudo(id);
    if (statusAtual(cur.status) !== 'EM REVISÃO') fail(409, 'A decisão só vale para publicações EM REVISÃO.');
    const decisao = strv(b.decisao).toUpperCase();
    const comentario = strv(b.comentario).trim();
    const alvo: Record<string, string> = { APROVADO: 'APROVADO', 'AJUSTES SOLICITADOS': 'EM PRODUÇÃO', REPROVADO: 'ARQUIVADO' };
    if (!(decisao in alvo)) fail(400, 'Decisão inválida.');
    if (decisao !== 'APROVADO' && comentario.length < 3) fail(400, decisao === 'REPROVADO' ? 'Informe o motivo da recusa.' : 'Descreva os ajustes necessários.');
    const para = alvo[decisao];
    const motivo = `${decisao === 'APROVADO' ? 'Aprovado' : decisao === 'REPROVADO' ? 'Reprovado' : 'Ajustes solicitados'} por ${u.nome}${comentario ? ': ' + comentario.slice(0, 300) : ''}`;
    await modifyRow('conteudos', id, async (r, conn) => {
      if (statusAtual(r.status) !== 'EM REVISÃO') fail(409, 'A publicação mudou de etapa enquanto você decidia. Atualize a tela.');
      await logStatus(conn, 'conteudos', id, strv(r.status), para, String(u.codigo), motivo);
      return { ...r, status: para, aprovacaoDecisao: decisao, aprovadoPor: String(u.nome), aprovadoEm: now(), versaoAprovada: strv(b.versao).trim().slice(0, 60) || String((Array.isArray(r.versoes) ? (r.versoes as Row[]).at(-1)?.n : '') ?? ''), aprovacaoComentario: comentario, atualizadoEm: now(), atualizadoPor: String(u.codigo) };
    });
    if (comentario) await adicionarComentario('conteudos', id, String(u.nome), `[${decisao}] ${comentario}`);
    await audit(String(u.codigo), 'decisao-conteudo', 'conteudos', id);
    if (strv(cur.responsavel).trim()) await registrarNotificacao('responsavel', strv(cur.responsavel), `Publicação ${decisao === 'APROVADO' ? 'aprovada' : decisao === 'REPROVADO' ? 'reprovada' : 'com ajustes'}`, `"${cur.titulo}": ${motivo}`, 'conteudos', id);
    return json({ ok: true, status: para });
  }
  if (path === '/content/schedule' && method === 'POST') {
    const b = await c.body();
    const id = strv(b.id);
    const cur = await conteudo(id);
    if (b.desagendar) {
      if (statusAtual(cur.status) !== 'AGENDADO') fail(409, 'Esta publicação não está agendada.');
      const ig = await q1('SELECT status FROM ig_publish WHERE conteudo_id=?', [id]);
      if (ig?.status === 'PROCESSANDO' || ig?.status === 'PUBLICADO') fail(409, 'O Instagram já recebeu esta publicação.');
      await modifyRow('conteudos', id, async (r, conn) => { await logStatus(conn, 'conteudos', id, 'AGENDADO', 'APROVADO', String(u.codigo), `Agendamento desfeito por ${u.nome}`); return { ...r, status: 'APROVADO', atualizadoEm: now(), atualizadoPor: String(u.codigo) }; });
      await audit(String(u.codigo), 'desagendar-conteudo', 'conteudos', id);
      return json({ ok: true, status: 'APROVADO' });
    }
    if (statusAtual(cur.status) !== 'APROVADO') fail(409, 'Só publicações APROVADAS podem ser agendadas.');
    const quando = strv(b.quando).trim();
    if (quando && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(quando)) fail(400, 'Data e horário inválidos.');
    const alvo = { ...cur, ...(quando ? { publicacaoEm: quando } : {}) };
    const falta = requisitosDeAgendamento(alvo);
    if (falta.length) fail(409, `Para agendar falta: ${falta.join(', ')}.`);
    await modifyRow('conteudos', id, async (r, conn) => {
      await logStatus(conn, 'conteudos', id, strv(r.status), 'AGENDADO', String(u.codigo), `Agendado por ${u.nome} para ${strv(alvo.publicacaoEm).replace('T', ' ').slice(0, 16)}`);
      return { ...r, ...(quando ? { publicacaoEm: quando } : {}), status: 'AGENDADO', atualizadoEm: now(), atualizadoPor: String(u.codigo) };
    });
    await audit(String(u.codigo), 'agendar-conteudo', 'conteudos', id);
    return json({ ok: true, status: 'AGENDADO' });
  }
  if (path === '/content/publicar-rapido' && method === 'POST') {
    /** "Publicar agora" e "Agendar" em um passo (sem etapa de aprovação): confere os requisitos, agenda e, se for agora, envia ao Instagram. */
    const b = await c.body();
    const id = strv(b.id);
    const cur = await conteudo(id);
    const agora = b.modo === 'agora';
    const st = statusAtual(cur.status);
    if (['PUBLICADO', 'ARQUIVADO'].includes(st)) fail(409, 'Esta publicação já foi publicada ou arquivada.');
    const quando = agora ? now().slice(0, 16) : strv(b.quando).trim();
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(quando)) fail(400, 'Escolha a data e o horário da publicação.');
    if (!agora && quando <= now().slice(0, 16)) fail(400, 'Escolha uma data e um horário no futuro.');
    const alvo: Row = { ...cur, publicacaoEm: quando, publicarInstagram: 'SIM' };
    sincronizarMidia(alvo);
    const falta = requisitosDeAgendamento(alvo);
    if (falta.length) fail(409, `Para ${agora ? 'publicar' : 'agendar'} falta: ${falta.join(', ')}.`);
    const fmt = strv(alvo.formato).toLowerCase();
    if (fmt.includes('carrossel') && materiaisAtivos(alvo, 'final').length < 2) fail(409, 'O carrossel precisa de 2 a 20 fotos.');
    await modifyRow('conteudos', id, async (r, conn) => {
      await logStatus(conn, 'conteudos', id, strv(r.status), 'AGENDADO', String(u.codigo), `${agora ? 'Publicação imediata' : 'Agendada'} por ${u.nome} para ${quando.replace('T', ' ')}`);
      const nova: Row = { ...r, publicacaoEm: quando, publicarInstagram: 'SIM', status: 'AGENDADO', aprovadoPor: String(u.nome), aprovadoEm: now(), atualizadoEm: now(), atualizadoPor: String(u.codigo) };
      sincronizarMidia(nova);
      return nova;
    });
    await audit(String(u.codigo), agora ? 'publicar-agora' : 'agendar-rapido', 'conteudos', id);
    if (!agora) return json({ ok: true, status: 'AGENDADO' });
    try {
      const r = await igPublish(id, String(u.codigo));
      return json({ ok: true, status: r.status, link: r.link });
    } catch (e: any) {
      await igMarkError(id, e.message);
      return fail(502, String(e.message).replace(/access_token=[^&\s"]+/g, 'access_token=***'));
    }
  }
  if (path === '/content/confirm' && method === 'POST') {
    const b = await c.body();
    const id = strv(b.id);
    const cur = await conteudo(id);
    const link = strv(b.link).trim();
    if (!/^https:\/\/[^\s]{4,500}$/.test(link)) fail(400, 'Informe o link https da publicação para confirmá-la.');
    if (!['APROVADO', 'AGENDADO'].includes(statusAtual(cur.status))) fail(409, 'Só publicações APROVADAS ou AGENDADAS podem ser confirmadas como publicadas.');
    const ig = (await q('SELECT status FROM ig_publish WHERE conteudo_id=?', [id]))[0];
    if (ig?.status === 'PROCESSANDO') fail(409, 'O Instagram ainda está processando esta publicação.');
    await modifyRow('conteudos', id, async (r, conn) => {
      await logStatus(conn, 'conteudos', id, strv(r.status), 'PUBLICADO', String(u.codigo), `Publicação confirmada manualmente por ${u.nome}: ${link}`);
      return { ...r, status: 'PUBLICADO', linkPublicacao: link, publicadoConfirmadoEm: now(), publicadoConfirmadoPor: String(u.nome), atualizadoEm: now(), atualizadoPor: String(u.codigo) };
    });
    await audit(String(u.codigo), 'confirmar-publicacao', 'conteudos', id);
    return json({ ok: true });
  }
  if (path === '/content/duplicate' && method === 'POST') {
    const cur = await conteudo(strv((await c.body()).id));
    const novo = await insertRow('conteudos', copiaParaNova(cur, { titulo: `${strv(cur.titulo)} (cópia)`.slice(0, 140), duplicadoDe: String(cur.id), responsavel: strv(cur.responsavel) }), String(u.codigo), { interno: true });
    await audit(String(u.codigo), 'duplicar-conteudo', 'conteudos', String(cur.id));
    return json(novo, 201);
  }
  if (path === '/content/adapt' && method === 'POST') {
    const b = await c.body();
    const cur = await conteudo(strv(b.id));
    const perfil = strv(b.perfil).trim();
    if (!perfil || !['@evolucaopb', '@geracaoevolucao'].includes(perfil)) fail(400, 'Escolha o perfil de destino (@evolucaopb ou @geracaoevolucao).');
    if (strv(cur.perfil) === perfil) fail(409, 'A publicação já é deste perfil.');
    const novo = await insertRow('conteudos', copiaParaNova(cur, { titulo: strv(cur.titulo), perfil, adaptadoDe: String(cur.id), compartilhado: 'NAO', contaInstagram: '' }), String(u.codigo), { interno: true });
    await audit(String(u.codigo), 'adaptar-conteudo', 'conteudos', String(cur.id));
    return json(novo, 201);
  }
  if (path === '/content/share' && method === 'POST') {
    const b = await c.body();
    const id = strv(b.id);
    await conteudo(id);
    const on = b.compartilhado === true || strv(b.compartilhado).toUpperCase() === 'SIM';
    const r = await modifyRow('conteudos', id, (cur) => ({ ...cur, compartilhado: on ? 'SIM' : 'NAO', perfil: on ? 'Ambos' : strv(cur.perfil) === 'Ambos' ? '' : strv(cur.perfil), atualizadoEm: now(), atualizadoPor: String(u.codigo) }));
    await audit(String(u.codigo), on ? 'compartilhar-conteudo' : 'descompartilhar-conteudo', 'conteudos', id);
    return json({ ok: true, perfil: r.perfil, compartilhado: r.compartilhado });
  }
  if (path === '/content/versions' && method === 'GET') {
    const r = await conteudo(c.qs('id'));
    return json({ versoes: Array.isArray(r.versoes) ? r.versoes : [], atual: { titulo: strv(r.titulo), legenda: strv(r.legenda), hashtags: strv(r.hashtags), cta: strv(r.cta) } });
  }
  // ---------- materiais da publicação ----------
  if (path === '/content/materials' && method === 'GET') {
    return json({ ...sair(await conteudo(c.qs('id'))), papeis: PAPEIS });
  }
  if (path === '/content/material' && method === 'POST') {
    if (!c.header('content-type').includes('multipart/form-data')) fail(400, 'Envie o arquivo em um formulário (multipart).');
    const form = await c.req.formData();
    const id = strv(form.get('id'));
    const papel = strv(form.get('papel'));
    if (!(papel in PAPEIS)) fail(400, 'Escolha o tipo do material: referência, produção, final ou miniatura.');
    const grupo = strv(form.get('grupo')).trim();
    const arqs = form.getAll('files').filter((f): f is File => typeof f !== 'string');
    if (!arqs.length) fail(400, 'Escolha ao menos um arquivo.');
    if (arqs.length > 20) fail(400, 'No máximo 20 arquivos por envio.');
    const max = envInt('MAX_UPLOAD_MB', 15) * 1048576;
    const atual = await conteudo(id);
    if (papel === 'final' && !grupo && materiaisAtivos(atual, 'final').length + arqs.length > 20) fail(400, 'A publicação aceita no máximo 20 itens de arte final (limite do carrossel).');
    const novos: Row[] = [];
    for (const f of arqs) {
      if (f.size > max) fail(413, `"${f.name}" passa do limite de ${Math.floor(max / 1048576)} MB.`);
      const base = safePart(f.name.split(/[\\/]/).pop() || '') || 'arquivo';
      const ext = (base.includes('.') ? base.split('.').pop()! : '').toLowerCase();
      if (!EXT_MATERIAL.includes(ext)) fail(400, `Tipo de arquivo não permitido: .${ext}`);
      if (papel === 'final' && !['jpg', 'jpeg', 'mp4', 'mov', 'png', 'pdf'].includes(ext)) fail(400, 'O arquivo final deve ser imagem (JPG/PNG), vídeo (MP4/MOV) ou PDF.');
      if (papel === 'miniatura' && !['jpg', 'jpeg', 'png'].includes(ext)) fail(400, 'A miniatura deve ser JPG ou PNG.');
      const buf = Buffer.from(await f.arrayBuffer());
      if (!conteudoCoerente(ext, buf)) fail(400, `O conteúdo de "${base}" não corresponde ao tipo .${ext}.`);
      const rel = `ANEXOS/CONTEUDOS/${safePart(id)}/${papel}_${Math.random().toString(16).slice(2, 10)}_${base}`;
      await run('INSERT INTO arquivos(caminho,mime,tamanho,conteudo,criado_em) VALUES(?,?,?,?,?)', [rel, MIME[ext] ?? 'application/octet-stream', f.size, buf, now()]);
      await modifyRow('conteudos', id, (r) => {
        const m = adicionarMaterial(r, { papel, tipo: 'arquivo', nome: base, caminho: rel, grupo: arqs.length === 1 ? grupo || undefined : undefined, mime: MIME[ext], tamanho: f.size }, String(u.codigo));
        novos.push(m);
        return { ...r, atualizadoEm: now(), atualizadoPor: String(u.codigo) };
      });
    }
    await audit(String(u.codigo), 'material', 'conteudos', id);
    return json({ ok: true, novos, ...sair(await conteudo(id)) }, 201);
  }
  if (path === '/content/material/link' && method === 'POST') {
    const b = await c.body();
    const id = strv(b.id), papel = strv(b.papel), url = strv(b.url).trim();
    if (!(papel in PAPEIS)) fail(400, 'Escolha o tipo do material.');
    if (!urlPermitida(url)) fail(400, 'Informe um link https (por exemplo, do Google Drive).');
    await conteudo(id);
    let novo: Row = {};
    await modifyRow('conteudos', id, (r) => {
      novo = adicionarMaterial(r, { papel, tipo: tipoDeLink(url), nome: strv(b.nome).trim() || (tipoDeLink(url) === 'drive' ? 'Arquivo no Google Drive' : 'Link'), url, grupo: strv(b.grupo).trim() || undefined }, String(u.codigo));
      return { ...r, atualizadoEm: now(), atualizadoPor: String(u.codigo) };
    });
    await audit(String(u.codigo), 'material', 'conteudos', id);
    return json({ ok: true, novo, ...sair(await conteudo(id)) }, 201);
  }
  if (path === '/content/material/remove' && method === 'POST') {
    const b = await c.body();
    const id = strv(b.id), mid = strv(b.materialId);
    const cur = await conteudo(id);
    const alvo = materiaisDe(cur).find((m) => m.id === mid) ?? fail(404, 'Material não encontrado.');
    await modifyRow('conteudos', id, (r) => {
      const resto = materiaisDe(r).filter((m) => m.id !== mid);
      // se tirou a versão atual de um grupo, a anterior volta a valer
      const doGrupo = resto.filter((m) => m.grupo === alvo.grupo);
      if (doGrupo.length && !doGrupo.some((m) => !m.substituido)) { const ult = doGrupo.reduce((a, m) => ((Number(m.versao) || 0) > (Number(a.versao) || 0) ? m : a)); ult.substituido = false; }
      const nr = { ...r, materiais: resto, atualizadoEm: now(), atualizadoPor: String(u.codigo) };
      sincronizarMidia(nr);
      return nr;
    });
    const cam = strv(alvo.caminho);
    if (cam && !(await q1("SELECT 1 FROM records WHERE modulo='conteudos' AND LOCATE(?, data) > 0", [cam]))) await run('DELETE FROM arquivos WHERE caminho=? AND caminho LIKE ?', [cam, 'ANEXOS/CONTEUDOS/%']);
    await audit(String(u.codigo), 'material', 'conteudos', id);
    return json({ ok: true, ...sair(await conteudo(id)) });
  }
  return fail(404, 'Rota não encontrada.');
}
