import { Ctx } from '../ctx';
import { requireInternal } from '../auth';
import { q, q1, run } from '../db';
import { audit, getRow, listRows } from '../records';
import { setting } from '../settings';
import { addDays, fail, fmtDate, now, parseLocal, Row, strv } from '../util';
import { chaveSegmento, rotuloSegmento } from '../segmentos';
import { Filtros, lerFiltros } from '../filtros';
import { contasDoPerfil, diaLocal, melhorPost, organico, PostFiltrado, resumoOrganico } from '../painel';
import { json } from './handlers';

/** Instagram orgânico: visão geral e desempenho por dimensão, sempre a partir de publicações já sincronizadas. */
const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const FMT_BR = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Fortaleza', weekday: 'short', hour: '2-digit', hourCycle: 'h23' });
const partesBR = (iso: string) => {
  const d = new Date(iso.replace(/([+-]\d\d)(\d\d)$/, '$1:$2'));
  if (isNaN(d.getTime())) return null;
  const p = FMT_BR.formatToParts(d);
  const w: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { dia: w[p.find((x) => x.type === 'weekday')!.value], hora: +p.find((x) => x.type === 'hour')!.value };
};
const diasDoMes = (a: number, m: number) => new Date(Date.UTC(a, m, 0)).getUTCDate();
const dois = (n: number) => String(n).padStart(2, '0');
/** Período de comparação: mês (ou ano) a partir do dia 1 compara com o mês (ou ano) anterior até o mesmo dia; os demais, com a janela anterior do mesmo tamanho. */
const anterior = (f: Filtros): Filtros => {
  const [a, m, d] = f.ate.split('-').map(Number);
  if (f.de.slice(8) === '01' && f.de.slice(0, 7) === f.ate.slice(0, 7)) {
    const pm = m === 1 ? 12 : m - 1, pa = m === 1 ? a - 1 : a;
    return { ...f, de: `${pa}-${dois(pm)}-01`, ate: `${pa}-${dois(pm)}-${dois(Math.min(d, diasDoMes(pa, pm)))}` };
  }
  if (f.de.slice(5) === '01-01' && f.de.slice(0, 4) === f.ate.slice(0, 4)) {
    return { ...f, de: `${a - 1}-01-01`, ate: `${a - 1}-${dois(m)}-${dois(Math.min(d, diasDoMes(a - 1, m)))}` };
  }
  const ate = fmtDate(addDays(parseLocal(f.de + 'T12:00:00'), -1));
  return { ...f, de: fmtDate(addDays(parseLocal(ate + 'T12:00:00'), -(f.dias - 1))), ate };
};

type Dim = 'perfil' | 'segmento' | 'formato' | 'tema' | 'objetivo' | 'campanha' | 'dia' | 'horario';
const DIMENSOES: Dim[] = ['perfil', 'segmento', 'formato', 'tema', 'objetivo', 'campanha', 'dia', 'horario'];
/** Dimensões que dependem de a publicação estar ligada a uma publicação do EVO MKT (a Meta não sabe segmento, tema, objetivo nem campanha editorial). */
const SO_VINCULADAS: Dim[] = ['segmento', 'tema', 'objetivo', 'campanha'];

export async function desempenhoRoute(c: Ctx): Promise<Response> {
  const u = await requireInternal(c);
  if (c.path !== '/instagram/vinculo' && c.method !== 'GET') fail(405, 'Método não permitido.');
  const f = lerFiltros(c);
  if (c.path === '/instagram/ranking') {
    /** Todas as publicações do Instagram (sincronizadas com a Meta) do período e perfil escolhidos, com as métricas de cada uma. */
    const o = await organico(f);
    const usuario = new Map(o.contas.map((x) => [x.ig, '@' + x.usuario.replace(/^@/, '')]));
    const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
    const posts = o.posts.slice(0, 1000).map((p) => ({
      id: p.media_id, quando: p.publicado_em, formato: p.formato, legenda: strv(p.legenda), miniatura: strv(p.miniatura), link: strv(p.permalink),
      perfil: usuario.get(p.conta) ?? p.conta, curtidas: num(p.curtidas), comentarios: num(p.comentarios), salvos: num(p.salvos), compartilhamentos: num(p.compartilhamentos),
      alcance: num(p.alcance), visualizacoes: num(p.visualizacoes), interacoes: p.interacoes,
      engajamento: num(p.alcance) ? Math.round((p.interacoes / Number(p.alcance)) * 1000) / 10 : null,
      conteudoId: p.conteudo ? strv(p.conteudo.id) : '', titulo: p.conteudo ? strv(p.conteudo.titulo) : '',
    }));
    return json({
      filtros: f, rows: posts, contas: o.contas.map((x) => x.usuario), ultimaSync: await setting('ig_last_sync'), aviso: await setting('ig_sync_warning'),
      origem: { fonte: 'Instagram (API oficial da Meta, orgânico)', periodo: `${f.de} a ${f.ate}`, atualizadoEm: await setting('ig_last_sync'), aviso: await setting('ig_sync_warning'), natureza: 'publicações já postadas (não inclui anúncios)' },
    });
  }
  if (c.path === '/instagram/mensal') {
    /** Informações mensais e anuais da conta (seguidores, alcance, visualizações, interações e publicações), do perfil escolhido. */
    const contas = await contasDoPerfil(f.perfil), ids = contas.map((x) => x.ig), principal = (await setting('ig_user_id')) || ids[0] || '';
    const n = (v: unknown) => Number(v || 0), mes = (v: unknown) => strv(v).slice(0, 7);
    const marcas = ids.map(() => '?').join(',') || "''";
    const CAMPOS = ['alcance', 'impressoes', 'visitasPerfil', 'interacoes', 'curtidas', 'comentarios', 'compartilhamentos', 'salvamentos', 'posts', 'reels'] as const;
    const meses = new Map<string, Row>();
    const get = (m: string): Row => meses.get(m) ?? (meses.set(m, { periodo: m, seguidores: null, ...Object.fromEntries(CAMPOS.map((k) => [k, null])) }), meses.get(m)!);
    const somar = (o: Row, k: string, v: number) => { o[k] = (o[k] === null || o[k] === undefined ? 0 : Number(o[k])) + v; };
    for (const r of await listRows('instagram')) {
      if (r.origem !== 'INSTAGRAM_API' || !/^\d{4}-\d{2}$/.test(strv(r.periodo)) || !ids.includes(strv(r.idExterno) || principal)) continue;
      const o = get(strv(r.periodo));
      for (const k of CAMPOS) if (k !== 'posts' && k !== 'reels' && strv(r[k]) !== '') somar(o, k, n(r[k]));
      if (strv(r.seguidores) !== '') somar(o, '_segRegistro', n(r.seguidores));
    }
    const snaps = ids.length ? await q(`SELECT conta,dia,seguidores FROM ig_seguidores WHERE conta IN (${marcas}) ORDER BY dia`, ids) : [];
    const ultimoPorConta = new Map<string, Map<string, number>>();
    for (const sn of snaps) { const m = mes(sn.dia); (ultimoPorConta.get(m) ?? ultimoPorConta.set(m, new Map()).get(m)!).set(strv(sn.conta), n(sn.seguidores)); }
    for (const [m, porConta] of ultimoPorConta) get(m).seguidores = [...porConta.values()].reduce((a, b) => a + b, 0);
    const posts = ids.length ? await q(`SELECT tipo,publicado_em FROM ig_posts WHERE conta IN (${marcas})`, ids) : [];
    for (const p of posts) { const o = get(diaLocal(p.publicado_em).slice(0, 7)); somar(o, strv(p.tipo).toUpperCase() === 'REELS' ? 'reels' : 'posts', 1); }
    const ordem = [...meses.keys()].sort();
    for (const m of ordem) { const o = meses.get(m)!; if (o.seguidores === null && o._segRegistro !== undefined) o.seguidores = o._segRegistro; delete o._segRegistro; }
    const mensal: Row[] = ordem.map((m, i): Row => { const o = meses.get(m)!, ant = i ? meses.get(ordem[i - 1])! : null; return { ...o, variacao: ant && o.seguidores !== null && ant.seguidores !== null ? Number(o.seguidores) - Number(ant.seguidores) : null }; });
    const anos = new Map<string, Row>();
    for (const o of mensal) {
      const a = strv(o.periodo).slice(0, 4);
      const y = anos.get(a) ?? (anos.set(a, { periodo: a, seguidores: null, meses: 0, ...Object.fromEntries(CAMPOS.map((k) => [k, null])) }), anos.get(a)!);
      for (const k of CAMPOS) if (o[k] !== null && o[k] !== undefined) somar(y, k, Number(o[k]));
      if (o.seguidores !== null) y.seguidores = o.seguidores;
      y.meses = Number(y.meses) + 1;
    }
    const anual: Row[] = [...anos.values()].map((y, i, todos): Row => ({ ...y, variacao: i && y.seguidores !== null && todos[i - 1].seguidores !== null ? Number(y.seguidores) - Number(todos[i - 1].seguidores) : null }));
    return json({
      mensal, anual, contas: contas.map((x) => x.usuario), atual: snaps.length ? mensal.filter((o) => o.seguidores !== null).slice(-1)[0]?.seguidores ?? null : null,
      primeiroRegistro: snaps[0] ? strv(snaps[0].dia) : '', ultimaSync: await setting('ig_last_sync'), aviso: await setting('ig_sync_warning'),
      origem: { fonte: 'Instagram (API oficial da Meta, orgânico)', periodo: 'todos os meses sincronizados', atualizadoEm: await setting('ig_last_sync'), aviso: await setting('ig_sync_warning'), natureza: 'métricas da conta por mês; seguidores só existem desde a primeira sincronização' },
    });
  }
  if (c.path === '/instagram/visao') {
    const o = await organico(f), oAnt = await organico(anterior(f));
    const resumo = resumoOrganico(o), resumoAnt = resumoOrganico(oAnt);
    const seg = o.vinculadas ? [] : await q(`SELECT conta,dia,seguidores FROM ig_seguidores WHERE conta IN (${o.contas.map(() => '?').join(',') || "''"}) AND dia>=? AND dia<=? ORDER BY dia`, [...o.contas.map((x) => x.ig), fmtDate(addDays(parseLocal(f.de + 'T12:00:00'), -1)), f.ate]);
    const porDia = new Map<string, number>(); // soma dos perfis escolhidos, dia a dia
    for (const s of seg) porDia.set(String(s.dia), (porDia.get(String(s.dia)) ?? 0) + Number(s.seguidores));
    const serie = [...porDia.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([dia, seguidores]) => ({ dia, seguidores }));
    const serieInteracoes = new Map<string, number>();
    for (const p of o.posts) serieInteracoes.set(diaLocal(p.publicado_em), (serieInteracoes.get(diaLocal(p.publicado_em)) ?? 0) + p.interacoes);
    return json({
      filtros: f, anteriorPeriodo: { de: anterior(f).de, ate: anterior(f).ate }, resumo, resumoAnterior: resumoAnt, contas: o.contas.map((x) => x.usuario),
      seguidores: serie.length ? { atual: serie[serie.length - 1].seguidores, variacao: serie.length > 1 ? serie[serie.length - 1].seguidores - serie[0].seguidores : null, serie } : null,
      interacoesPorDia: [...serieInteracoes.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([dia, interacoes]) => ({ dia, interacoes })),
      melhor: melhorPost(o), recentes: o.posts.slice(0, 500).map((p) => ({ id: p.media_id, quando: p.publicado_em, formato: p.formato, legenda: strv(p.legenda).slice(0, 120), interacoes: p.interacoes, alcance: p.alcance ?? null, miniatura: strv(p.miniatura), link: strv(p.permalink), titulo: p.conteudo ? strv(p.conteudo.titulo) : '' })),
      semEfeito: o.semEfeito, somenteVinculadas: o.vinculadas, ultimaSync: await setting('ig_last_sync'),
      origem: { fonte: 'Instagram (API oficial da Meta, orgânico)', periodo: `${f.de} a ${f.ate}`, atualizadoEm: await setting('ig_last_sync'), aviso: await setting('ig_sync_warning'), natureza: 'publicações do período (não inclui anúncios)' },
    });
  }
  if (c.path === '/instagram/desempenho') {
    const dim = (DIMENSOES as string[]).includes(c.qs('dim')) ? (c.qs('dim') as Dim) : 'formato';
    const o = await organico(f);
    const semVinculo = SO_VINCULADAS.includes(dim) && !o.vinculadas;
    const base: PostFiltrado[] = semVinculo ? o.posts.filter((p) => p.conteudo) : o.posts;
    const campanhas = new Map((await listRows('campanhas')).map((r) => [String(r.id), strv(r.titulo) || String(r.id)]));
    const contaUsuario = new Map(o.contas.map((x) => [x.ig, '@' + x.usuario.replace(/^@/, '')]));
    const chave = (p: PostFiltrado): [string, string] | null => {
      const cn = p.conteudo ?? {};
      switch (dim) {
        case 'perfil': return [p.conta, contaUsuario.get(p.conta) ?? p.conta];
        case 'formato': return [p.formato, p.formato];
        case 'segmento': { const k = chaveSegmento(strv(cn.segmento)); return k ? [k, rotuloSegmento(k)] : ['', 'Sem segmento']; }
        case 'tema': return [strv(cn.tema) || '', strv(cn.tema) || 'Sem tema'];
        case 'objetivo': return [strv(cn.objetivo) || '', strv(cn.objetivo) || 'Sem objetivo'];
        case 'campanha': { const id = strv(cn.campanhaId); return [id, id ? campanhas.get(id) ?? id : 'Sem campanha editorial']; }
        case 'dia': { const t = partesBR(p.publicado_em); return t ? [String(t.dia), DIAS[t.dia]] : null; }
        case 'horario': { const t = partesBR(p.publicado_em); return t ? [String(t.hora), `${String(t.hora).padStart(2, '0')}h`] : null; }
      }
    };
    const grupos = new Map<string, { rotulo: string; posts: PostFiltrado[] }>();
    for (const p of base) { const k = chave(p); if (!k) continue; (grupos.get(k[0]) ?? grupos.set(k[0], { rotulo: k[1], posts: [] }).get(k[0])!).posts.push(p); }
    const soma = (xs: PostFiltrado[], k: string) => xs.reduce((s, p) => s + (Number(p[k]) || 0), 0);
    let rows = [...grupos.entries()].map(([k, g]) => {
      const comAlcance = g.posts.filter((p) => p.alcance !== null && p.alcance !== undefined);
      const inter = soma(g.posts, 'interacoes');
      return { chave: k, rotulo: g.rotulo, publicacoes: g.posts.length, interacoes: inter, mediaInteracoes: Math.round((inter / g.posts.length) * 10) / 10, alcance: comAlcance.length ? soma(comAlcance, 'alcance') : null, melhor: melhorPost({ ...o, posts: g.posts }) };
    });
    rows = dim === 'dia' ? rows.sort((a, b) => Number(a.chave) - Number(b.chave)) : dim === 'horario' ? rows.sort((a, b) => Number(a.chave) - Number(b.chave)) : rows.sort((a, b) => b.mediaInteracoes - a.mediaInteracoes);
    return json({
      filtros: f, dim, rows, total: base.length, minimo: 3,
      aviso: semVinculo ? 'Esta análise considera só as publicações ligadas a uma publicação do EVO MKT (a Meta não informa segmento, tema, objetivo nem campanha editorial).' : '',
      somenteVinculadas: semVinculo || o.vinculadas,
      origem: { fonte: 'Instagram (API oficial da Meta, orgânico)', periodo: `${f.de} a ${f.ate}`, atualizadoEm: await setting('ig_last_sync'), aviso: await setting('ig_sync_warning'), natureza: 'média de interações por publicação (curtidas, comentários, salvamentos e compartilhamentos)' },
    });
  }
  if (c.path === '/instagram/impulsionados') {
    // orgânico × impulsionado: só quando o vínculo entre o anúncio e a publicação foi confirmado por uma pessoa
    const vinc = await q('SELECT ad_id,conteudo_id,quem,quando FROM ads_vinculos');
    const o = await organico({ ...f, perfil: f.perfil });
    const porMidia = new Map(o.todos.filter((p) => p.conteudo).map((p) => [String(p.conteudo!.id), p]));
    const out: Row[] = [];
    for (const v of vinc) {
      const post = porMidia.get(strv(v.conteudo_id));
      if (!post) continue;
      const ads = await q('SELECT anuncio,campanha,SUM(gasto) gasto,SUM(impressoes) impressoes,MAX(alcance) alcance,SUM(cliques) cliques,SUM(conversas) conversas FROM ads_anuncios WHERE anuncio_id=? GROUP BY anuncio,campanha', [strv(v.ad_id)]);
      if (!ads.length) continue;
      const a = ads[0];
      out.push({ conteudo: strv(post.conteudo!.titulo), conteudoId: strv(v.conteudo_id), anuncioId: strv(v.ad_id), anuncio: strv(a.anuncio), campanha: strv(a.campanha), organico: { interacoes: post.interacoes, alcance: post.alcance ?? null, visualizacoes: post.visualizacoes ?? null }, pago: { investimento: Number(a.gasto), impressoes: Number(a.impressoes), alcance: Number(a.alcance), cliques: Number(a.cliques), conversas: Number(a.conversas) }, confirmadoPor: strv(v.quem), confirmadoEm: strv(v.quando) });
    }
    return json({ rows: out, aviso: out.length ? '' : 'Nenhum anúncio foi vinculado a uma publicação. Sem o vínculo confirmado, o sistema não compara orgânico e impulsionado.', origem: { fonte: 'Instagram (orgânico) + Meta Ads (acumulado do anúncio na última sincronização), ligados por vínculo confirmado', periodo: 'último valor sincronizado', atualizadoEm: await setting('meta_ads_ultima_sync'), natureza: 'o anúncio não é filtrado pelo período' } });
  }
  if (c.path === '/instagram/vinculo' && c.method === 'POST') {
    const b = await c.body();
    const anuncio = strv(b.anuncio).trim(), conteudo = strv(b.conteudo).trim();
    if (!/^\d{5,25}$/.test(anuncio)) fail(400, 'Informe o ID numérico do anúncio.');
    if (!(await getRow('conteudos', conteudo))) fail(404, 'Publicação não encontrada.');
    if (b.remover) { await run('DELETE FROM ads_vinculos WHERE ad_id=? AND conteudo_id=?', [anuncio, conteudo]); await audit(String(u.codigo), 'vinculo-anuncio-remover', 'conteudos', conteudo); return json({ ok: true }); }
    if (!(await q1('SELECT 1 FROM ads_anuncios WHERE anuncio_id=? LIMIT 1', [anuncio]))) fail(404, 'Esse anúncio ainda não aparece nos dados sincronizados do Tráfego Pago.');
    await run('INSERT INTO ads_vinculos(ad_id,conteudo_id,quem,quando) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE quem=VALUES(quem),quando=VALUES(quando)', [anuncio, conteudo, String(u.codigo), now()]);
    await audit(String(u.codigo), 'vinculo-anuncio', 'conteudos', conteudo);
    return json({ ok: true });
  }
  return fail(404, 'Rota não encontrada.');
}
