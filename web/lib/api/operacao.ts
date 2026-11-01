import { Ctx } from '../ctx';
import { verificarIntegridade } from '../integridade';
import { rateCheck, rateFail } from '../auth';
import { gerarInsights, hojeLocal, melhoresHorarios, proximasDatas, rankingConteudos } from '../insights';
import { lerFiltros } from '../filtros';
import { listarNotificacoes } from '../notificacoes';
import { run } from '../db';
import { q, q1 } from '../db';
import { respostaPdf } from '../pdf';
import { relatorioInstagramPdf } from '../igPdf';
import { requireInternal, requireAdmin } from '../auth';
import { audit, getRow, listRows } from '../records';
import { setSetting, setting } from '../settings';
import { addDays, env, fail, fmtDate, localParts, now, Row } from '../util';
import { contasMonitoradas, igContaValida, igMetricasJanela, metaConnected } from '../integrations/meta';
import { json } from './handlers';

const ymd = (s: unknown) => String(s ?? '').slice(0, 10);

/** Linha do tempo de um registro: mudanças de status/responsável + eventos de auditoria. */
async function timeline(mod: string, id: string): Promise<Row[]> {
  const out: Row[] = [];
  for (const h of await q('SELECT campo,de,para,quando,ator,motivo FROM status_history WHERE modulo=? AND registro=? ORDER BY id', [mod, id])) {
    out.push({
      quando: h.quando, tipo: h.campo === 'status' ? 'status' : h.campo === 'responsavel' ? 'responsavel' : 'prazo', ator: h.ator,
      texto: h.campo === 'responsavel' ? `Responsável: ${h.de} → ${h.para}` : h.campo === 'prazo' ? `Prazo: ${h.de} → ${h.para}` : h.campo === 'publicacaoEm' ? `Publicação: ${h.de} → ${h.para}` : h.de ? `Status: ${h.de} → ${h.para}` : `Registrado com status ${h.para}`,
      motivo: h.motivo,
    });
  }
  const map: Record<string, string> = { criar: 'Criado', editar: 'Editado', material: 'Material enviado', excluir: 'Excluído' };
  for (const a of await q("SELECT quando,ator,acao FROM audit_log WHERE modulo=? AND registro=? AND acao IN ('criar','editar','material','excluir') ORDER BY id", [mod, id]))
    out.push({ quando: a.quando, tipo: 'evento', ator: a.ator, texto: map[a.acao] ?? a.acao, motivo: '' });
  return out.sort((a, b) => String(a.quando).localeCompare(String(b.quando)));
}

export async function operacaoRoute(c: Ctx) {
  const { path } = c;
  if (path === '/timeline') {
    await requireInternal(c);
    const mod = c.qs('module'), id = c.qs('id');
    if (!(await getRow(mod, id))) fail(404, 'Registro não encontrado.');
    return json({ rows: await timeline(mod, id) });
  }
  if (path === '/team') {
    await requireInternal(c);
    return json({ rows: (await q('SELECT nome,label FROM users WHERE ativo=1 ORDER BY nome')).map((r) => ({ nome: r.nome, funcao: r.label })) });
  }
  if (path === '/notificacoes') {
    const u = await requireInternal(c);
    const rows = await listarNotificacoes(String(u.nome), u.role === 'manager');
    return json({ rows, naoLidas: rows.filter((r: Row) => !r.lida).length });
  }
  if (path === '/notificacoes/lida' && c.method === 'POST') {
    const u = await requireInternal(c);
    const b = await c.body();
    const ids = Array.isArray(b.ids) ? b.ids.map(Number).filter(Boolean) : [];
    const dest = u.role === 'manager' ? "destino IN ('gerencia',?)" : 'destino=?';
    if (b.todas) await run(`UPDATE notifications SET lida=1 WHERE ${dest}`, [String(u.nome)]);
    else if (ids.length) await run(`UPDATE notifications SET lida=1 WHERE id IN (${ids.map(() => '?').join(',')}) AND (${dest})`, [...ids, String(u.nome)]);
    return json({ ok: true });
  }
  if (path === '/admin/integridade') {
    await requireAdmin(c);
    return json(await verificarIntegridade());
  }
  if (path === '/insights') {
    await requireInternal(c);
    const f = lerFiltros(c);
    return json({ insights: await gerarInsights(f, null, hojeLocal()), datas: proximasDatas(90), horarios: await melhoresHorarios(await igContaValida(c.qs('conta'))), ranking: await rankingConteudos(8, await igContaValida(c.qs('conta'))) });
  }
  if (path === '/studio/modelos') {
    await requireInternal(c);
    if (c.method === 'GET') {
      let modelos: unknown = [];
      try { modelos = JSON.parse((await setting('studio_modelos')) || '[]'); } catch { /* guardado inválido */ }
      return json({ modelos });
    }
    if (c.method !== 'POST') return fail(405, 'Método não permitido.');
    const b = await c.body();
    const lista = Array.isArray(b.modelos) ? b.modelos : fail(400, 'Envie a lista de modelos.');
    if (lista.length > 50) fail(400, 'No máximo 50 modelos.');
    const limpos = lista.map((m: any) => {
      const nome = String(m?.nome ?? '').trim().slice(0, 60);
      if (!nome) fail(400, 'Todo modelo precisa de um nome.');
      return { nome, legenda: String(m?.legenda ?? '').slice(0, 2200), cta: String(m?.cta ?? '').slice(0, 160), hashtags: String(m?.hashtags ?? '').slice(0, 600) };
    });
    await setSetting('studio_modelos', JSON.stringify(limpos));
    return json({ ok: true, modelos: limpos });
  }
  if (path === '/instagram/seguidores/manual' && c.method === 'POST') {
    const u = await requireInternal(c);
    const b = await c.body();
    const conta = await igContaValida(String(b.conta ?? '')), mes = String(b.mes ?? '').trim(), n = Math.floor(Number(b.seguidores));
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) fail(400, 'Informe o mês no formato AAAA-MM.');
    if (!Number.isFinite(n) || n < 0 || n > 100000000) fail(400, 'Número de seguidores inválido.');
    const [y, m] = mes.split('-').map(Number);
    const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const hoje = fmtDate(new Date());
    const dia = `${mes}-${String(ultimo).padStart(2, '0')}`;
    const alvo = dia > hoje ? hoje : dia;
    if (await q1('SELECT 1 FROM ig_seguidores WHERE conta=? AND dia LIKE ? AND atualizado_em NOT LIKE ?', [conta, mes + '%', 'manual%'])) fail(409, 'Esse mês já tem registro automático do sistema; o número manual só vale para meses sem registro.');
    await run('INSERT INTO ig_seguidores(conta,dia,seguidores,seguindo,midias,atualizado_em) VALUES(?,?,?,0,0,?) ON DUPLICATE KEY UPDATE seguidores=VALUES(seguidores),atualizado_em=VALUES(atualizado_em)', [conta, alvo, n, 'manual ' + now()]);
    await audit(String(u.codigo), 'ig-seguidores-manual', 'instagram', mes);
    return json({ ok: true });
  }
  if (path === '/instagram/relatorio' || path === '/instagram/relatorio.pdf') {
    await requireInternal(c);
    if (c.method !== 'GET') return fail(405, 'O relatório é somente consulta.');
    const lp = localParts(new Date());
    const mes = /^\d{4}-\d{2}$/.test(c.qs('mes')) ? c.qs('mes') : `${lp.y}-${String(lp.m).padStart(2, '0')}`;
    const [y, m] = mes.split('-').map(Number);
    const ant = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
    const conta = await igContaValida(c.qs('conta'));
    const linhas = (await listRows('instagram')).filter((r) => r.origem === 'INSTAGRAM_API' && String(r.idExterno ?? conta) === conta);
    const pega = (per: string) => linhas.find((r) => r.periodo === per) ?? null;
    const posts = (await q('SELECT media_id,publicado_em,tipo,legenda,curtidas,comentarios,salvos,compartilhamentos,alcance,visualizacoes,seguidores_novos,visitas_perfil,miniatura,permalink FROM ig_posts WHERE conta=? AND publicado_em LIKE ? ORDER BY publicado_em DESC', [conta, mes + '%'])).map((p) => ({ ...p, interacoes: Number(p.curtidas) + Number(p.comentarios) + Number(p.salvos) + Number(p.compartilhamentos) }));
    const seg = async (per: string) => (await q1('SELECT seguidores FROM ig_seguidores WHERE conta=? AND dia LIKE ? ORDER BY dia DESC LIMIT 1', [conta, per + '%']))?.seguidores ?? null;
    // série diária de seguidores do mês e semanas (dom–sáb) que tocam o mês; nada é estimado: sem leitura, a lista vem vazia
    const serieSeguidores = (await q('SELECT dia,seguidores FROM ig_seguidores WHERE conta=? AND dia LIKE ? ORDER BY dia', [conta, mes + '%'])).map((r) => ({ dia: String(r.dia), seguidores: Number(r.seguidores) }));
    const ultimoDia = new Date(Date.UTC(y, m, 0)).getUTCDate(), iniMes = `${mes}-01`, fimMes = `${mes}-${String(ultimoDia).padStart(2, '0')}`;
    const semanas = (await q('SELECT inicio,fim,alcance,visualizacoes,interacoes FROM ig_conta_semana WHERE conta=? AND fim>=? AND inicio<=? ORDER BY inicio', [conta, iniMes, fimMes])).map((r) => ({ inicio: String(r.inicio), fim: String(r.fim), alcance: r.alcance === null ? null : Number(r.alcance), visualizacoes: r.visualizacoes === null ? null : Number(r.visualizacoes), interacoes: r.interacoes === null ? null : Number(r.interacoes) }));
    const hojeDia = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Fortaleza' }).format(new Date());
    const parcial = hojeDia >= iniMes && hojeDia < fimMes;
    // Para meses sem snapshot salvo, tenta recuperar métricas diretamente da Meta.
    // Consulta somente leitura: não altera histórico nem fabrica alcance somando posts.
    let atualRelatorio = pega(mes);
    let origemAlcance = atualRelatorio?.alcance == null ? 'indisponivel' : 'historico';
    if (atualRelatorio?.alcance == null && iniMes <= hojeDia) {
      try {
        const metricas = await igMetricasJanela(conta, iniMes, parcial ? hojeDia : fimMes);
        if (metricas.reach !== undefined && Number.isFinite(Number(metricas.reach))) {
          atualRelatorio = { ...(atualRelatorio ?? {}), alcance: Number(metricas.reach) };
          origemAlcance = 'meta_consulta';
        }
      } catch (e) {
        console.warn('[instagram/relatorio] alcance histórico não recuperado da Meta:', e instanceof Error ? e.message : String(e));
      }
    }
    const dados = { mes, anterior: ant, origemAlcance, periodo: { de: iniMes, ate: parcial ? hojeDia : fimMes, parcial, futuro: hojeDia < iniMes }, atual: atualRelatorio, anteriorMetricas: pega(ant), seguidores: await seg(mes), seguidoresAnterior: await seg(ant), serieSeguidores, semanas, posts: posts.sort((a, b) => b.interacoes - a.interacoes), conta: (await contasMonitoradas()).find((x) => x.ig === conta)?.usuario ?? '' };
    if (path === '/instagram/relatorio.pdf') {
      const quando = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Fortaleza', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date());
      return respostaPdf(await relatorioInstagramPdf(dados, quando), `Relatorio-Mensal-Instagram${dados.conta ? '_' + String(dados.conta).replace(/^@/, '') : ''}_${mes}.pdf`);
    }
    return json(dados);
  }
  if (path === '/instagram/periodo') {
    await requireInternal(c);
    const conta = await igContaValida(c.qs('conta'));
    const modo = ['7', '30', '90', 'ano', 'tudo'].includes(c.qs('p')) ? c.qs('p') : '30';
    const hoje = fmtDate(new Date()), ymd = (d: Date) => fmtDate(d);
    const vazio = { alcance: 0, impressoes: 0, visitasPerfil: 0, interacoes: 0, curtidas: 0, comentarios: 0, compartilhamentos: 0, salvamentos: 0 };
    const n = (v: unknown) => Number(v ?? 0) || 0;
    const linhas = (await listRows('instagram')).filter((r) => r.origem === 'INSTAGRAM_API' && String(r.idExterno ?? conta) === conta && /^\d{4}-\d{2}$/.test(String(r.periodo ?? '')));
    const dasLinhas = (fil: (per: string) => boolean) => {
      const rs = linhas.filter((r) => fil(String(r.periodo)));
      const o: Record<string, number> = { ...vazio };
      for (const r of rs) for (const k of Object.keys(vazio)) o[k] += n(r[k]);
      return { ...o, meses: rs.length };
    };
    const daMeta = async (de: string, ate: string) => {
      const m = await igMetricasJanela(conta, de, ate);
      return { alcance: n(m.reach), impressoes: n(m.views), visitasPerfil: n(m.profile_views), interacoes: n(m.total_interactions), curtidas: n(m.likes), comentarios: n(m.comments), compartilhamentos: n(m.shares), salvamentos: n(m.saves) };
    };
    const posts = async (de: string, ate: string) => {
      const rs = await q('SELECT tipo FROM ig_posts WHERE conta=? AND SUBSTR(publicado_em,1,10)>=? AND SUBSTR(publicado_em,1,10)<=?', [conta, de, ate]);
      return { posts: rs.filter((x) => x.tipo !== 'REELS').length, reels: rs.filter((x) => x.tipo === 'REELS').length };
    };
    let de = '', ate = hoje, rotulo = '', atual: Row = {}, anterior: Row | null = null, fonte = '', aviso = '';
    try {
      if (modo === 'ano' || modo === 'tudo') {
        const ano = hoje.slice(0, 4);
        de = modo === 'ano' ? `${ano}-01-01` : (linhas.map((r) => String(r.periodo)).sort()[0] ?? hoje.slice(0, 7)) + '-01';
        rotulo = modo === 'ano' ? `Ano ${ano} (parcial)` : 'Todo o período sincronizado';
        atual = dasLinhas((p) => modo === 'tudo' || p.startsWith(ano));
        anterior = modo === 'ano' ? dasLinhas((p) => p.startsWith(String(Number(ano) - 1))) : null;
        if (anterior && !(anterior as any).meses) anterior = null;
        fonte = 'meses sincronizados';
        if (!(atual as any).meses) aviso = 'Ainda não há meses sincronizados. Use "Carregar histórico" em Instagram → Ranking.';
      } else {
        const dias = Number(modo);
        de = ymd(new Date(Date.now() - (dias - 1) * 86400000));
        const deAnt = ymd(new Date(Date.now() - (2 * dias - 1) * 86400000)), ateAnt = ymd(new Date(Date.now() - dias * 86400000));
        rotulo = `Últimos ${dias} dias`;
        if (!(await metaConnected())) throw new Error('Instagram não conectado.');
        atual = await daMeta(de, hoje);
        try { anterior = await daMeta(deAnt, ateAnt); } catch { anterior = null; }
        fonte = 'Meta ao vivo';
      }
    } catch (e: any) { return fail(502, e.message); }
    Object.assign(atual, await posts(de, ate));
    if (anterior) Object.assign(anterior, await posts(modo === 'ano' ? `${Number(hoje.slice(0, 4)) - 1}-01-01` : ymd(new Date(Date.now() - (2 * Number(modo) - 1) * 86400000)), modo === 'ano' ? `${Number(hoje.slice(0, 4)) - 1}-12-31` : ymd(new Date(Date.now() - Number(modo) * 86400000))));
    const snaps = await q('SELECT dia,seguidores FROM ig_seguidores WHERE conta=? ORDER BY dia', [conta]);
    const atualSeg = snaps.length ? Number(snaps[snaps.length - 1].seguidores) : null;
    const antes = snaps.filter((x) => String(x.dia) <= de).pop() ?? snaps[0];
    const inicioSeg = antes ? Number(antes.seguidores) : null;
    const usuario = (await contasMonitoradas()).find((x) => x.ig === conta)?.usuario ?? '';
    return json({ modo, rotulo, de, ate, conta, usuario, fonte, aviso, atual, anterior, seguidores: { atual: atualSeg, inicio: inicioSeg, novos: atualSeg !== null && inicioSeg !== null && snaps.length > 1 ? atualSeg - inicioSeg : null, desde: antes ? String(antes.dia) : '' } });
  }
  if (path === '/instagram/contas') {
    await requireInternal(c);
    return json({ contas: await contasMonitoradas(), principal: await setting('ig_user_id') });
  }
  if (path === '/instagram/seguidores') {
    await requireInternal(c);
    const conta = await igContaValida(c.qs('conta'));
    const snaps = await q('SELECT dia,seguidores FROM ig_seguidores WHERE conta=? ORDER BY dia', [conta]);
    const ult = (chave: (d: string) => string) => {
      const m = new Map<string, number>();
      for (const s of snaps) m.set(chave(String(s.dia)), Number(s.seguidores)); // ordenado: o último do período vence
      const ks = [...m.keys()];
      return ks.map((k, i) => ({ periodo: k, seguidores: m.get(k)!, variacao: i ? m.get(k)! - m.get(ks[i - 1])! : null }));
    };
    return json({ mensal: ult((d) => d.slice(0, 7)), anual: ult((d) => d.slice(0, 4)), primeiroRegistro: snaps[0]?.dia ?? '', atual: snaps.length ? Number(snaps[snaps.length - 1].seguidores) : null });
  }
  if (path === '/instagram/posts') {
    await requireInternal(c);
    const conta = await igContaValida(c.qs('conta'));
    const rows = (await q('SELECT media_id,publicado_em,tipo,legenda,curtidas,comentarios,salvos,compartilhamentos,alcance,visualizacoes,seguidores_novos,visitas_perfil,miniatura,permalink FROM ig_posts WHERE conta=? ORDER BY publicado_em DESC LIMIT 1000', [conta])).map((p) => {
      const interacoes = Number(p.curtidas) + Number(p.comentarios) + Number(p.salvos) + Number(p.compartilhamentos);
      const alcance = p.alcance === null || p.alcance === undefined ? null : Number(p.alcance);
      return {
        id: p.media_id, quando: p.publicado_em, tipo: p.tipo, legenda: p.legenda, curtidas: Number(p.curtidas), comentarios: Number(p.comentarios),
        salvos: Number(p.salvos), compartilhamentos: Number(p.compartilhamentos), alcance, visualizacoes: p.visualizacoes === null || p.visualizacoes === undefined ? null : Number(p.visualizacoes), seguidoresNovos: p.seguidores_novos === null || p.seguidores_novos === undefined ? null : Number(p.seguidores_novos), visitasPerfil: p.visitas_perfil === null || p.visitas_perfil === undefined ? null : Number(p.visitas_perfil), interacoes,
        engajamento: alcance ? Math.round((interacoes / alcance) * 1000) / 10 : null, miniatura: p.miniatura, link: p.permalink,
      };
    });
    let metricas: unknown = null; try { metricas = JSON.parse((await setting(`ig_metricas_${conta}`)) || 'null'); } catch { /* sem registro */ }
    return json({ rows, conta, contas: await contasMonitoradas(), ultimaSync: await setting('ig_last_sync'), metricas });
  }
  if (path === '/studio/hashtags') {
    const u = await requireInternal(c);
    if (c.method === 'GET') {
      let grupos: unknown = [];
      try { grupos = JSON.parse((await setting('studio_hashtags')) || '[]'); } catch { /* guardado inválido: lista vazia */ }
      return json({ grupos });
    }
    if (c.method !== 'POST') return fail(405, 'Método não permitido.');
    const b = await c.body();
    const lista = Array.isArray(b.grupos) ? b.grupos : fail(400, 'Envie a lista de grupos.');
    if (lista.length > 30) fail(400, 'No máximo 30 grupos de hashtags.');
    const limpos = lista.map((g: any) => {
      const nome = String(g?.nome ?? '').trim().slice(0, 40);
      const tags = (Array.isArray(g?.tags) ? g.tags : []).map((t: any) => String(t).trim()).filter((t: string) => /^#[\p{L}\p{N}_]{1,60}$/u.test(t)).slice(0, 30);
      if (!nome) fail(400, 'Todo grupo precisa de um nome.');
      return { nome, tags: [...new Set(tags)] };
    });
    await setSetting('studio_hashtags', JSON.stringify(limpos));
    await audit(String(u.codigo), 'studio-hashtags');
    return json({ ok: true, grupos: limpos });
  }
  if (path === '/datas') {
    await requireInternal(c);
    return json({ rows: proximasDatas(Number(c.qs('dias')) || 90) });
  }
  return fail(404, 'Rota não encontrada.');
}
