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
  if (c.path === '/instagram/historico-planilhas') {
    const arquivo = c.url.searchParams.get('arquivo') || '';
    const aba = c.url.searchParams.get('aba') || '';
    const conta = c.url.searchParams.get('conta') || '';
    const pagina = Math.max(1, Math.min(10000, Number(c.url.searchParams.get('pagina')) || 1));
    const limite = Math.max(1, Math.min(100, Number(c.url.searchParams.get('limite')) || 30));
    const filtros: string[] = [];
    const parametros: unknown[] = [];
    if (arquivo) { filtros.push('arquivo = ?'); parametros.push(arquivo); }
    if (aba) { filtros.push('aba = ?'); parametros.push(aba); }
    if (conta) { filtros.push('conta = ?'); parametros.push(conta); }
    const where = filtros.length ? ' WHERE ' + filtros.join(' AND ') : '';
    const count = await q1<{ total: number }>('SELECT COUNT(*) AS total FROM instagram_historico_planilhas' + where, parametros);
    const rows = await q('SELECT arquivo,aba,linha_origem,conta,categoria,data_referencia,identificador,valores_json FROM instagram_historico_planilhas' + where + ' ORDER BY arquivo,aba,linha_origem LIMIT ? OFFSET ?', [...parametros, limite, (pagina - 1) * limite]);
    return json({ total: Number(count?.total || 0), pagina, limite,
      rows: rows.map(r => ({arquivo:r.arquivo,aba:r.aba,linha:r.linha_origem,conta:r.conta,categoria:r.categoria,data:r.data_referencia,celulas:JSON.parse(String(r.valores_json || '{}'))})),
      aviso: 'Histórico documental não somado aos resultados oficiais da Meta. Pode conter cabeçalhos e registros coincidentes.',
      origem: { fonte: 'Planilhas históricas importadas', natureza: 'dados originais, separados da API Meta' } });
  }
  if (c.path === '/instagram/ranking') {
    /** Todas as publicações do Instagram (sincronizadas com a Meta) do período e perfil escolhidos, com as métricas de cada uma. */
    const o = await organico(f);
    const usuario = new Map(o.contas.map((x) => [x.ig, '@' + x.usuario.replace(/^@/, '')]));
    const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
    const posts = o.posts.slice(0, 1000).map((p) => ({
      id: p.media_id, quando: p.publicado_em, formato: p.formato, legenda: strv(p.legenda), miniatura: strv(p.miniatura), link: strv(p.permalink),
      perfil: usuario.get(p.conta) ?? p.conta, curtidas: num(p.curtidas), comentarios: num(p.comentarios), salvos: num(p.salvos), compartilhamentos: num(p.compartilhamentos),
      alcance: num(p.alcance), visualizacoes: num(p.visualizacoes), visitasPerfil: num(p.visitas_perfil), seguidoresNovos: num(p.seguidores_novos), interacoes: p.interacoes,
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
  if (c.path === '/instagram/geral') {
    /** Visão Geral do Instagram: indicadores, comparação das contas, formatos e melhores publicações. Nada é inventado: sem dado vira null. */
    const o = await organico(f), oAnt = await organico(anterior(f));
    const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
    const somaN = (ps: PostFiltrado[], k: string) => (ps.some((x) => x[k] !== null && x[k] !== undefined) ? ps.reduce((a, x) => a + (Number(x[k]) || 0), 0) : null);
    const kp = (ps: PostFiltrado[]) => {
      const alcance = somaN(ps, 'alcance'), interacoes = ps.reduce((a, x) => a + x.interacoes, 0);
      return { publicacoes: ps.length, alcance, visualizacoes: somaN(ps, 'visualizacoes'), visitasPerfil: somaN(ps, 'visitas_perfil'), interacoes, curtidas: somaN(ps, 'curtidas'), comentarios: somaN(ps, 'comentarios'), compartilhamentos: somaN(ps, 'compartilhamentos'), salvamentos: somaN(ps, 'salvos'), seguidoresGerados: somaN(ps, 'seguidores_novos'), engajamento: alcance ? Math.round((interacoes / alcance) * 1000) / 10 : null };
    };
    const ids = o.contas.map((x) => x.ig);
    const snaps = ids.length ? await q(`SELECT conta,dia,seguidores FROM ig_seguidores WHERE conta IN (${ids.map(() => '?').join(',')}) AND dia<=? ORDER BY dia`, [...ids, f.ate]) : [];
    const porContaSeg = (ig: string) => {
      const l = snaps.filter((x) => strv(x.conta) === ig);
      const atual = l.length ? Number(l[l.length - 1].seguidores) : null;
      const antes = l.filter((x) => strv(x.dia) < f.de), dentro = l.filter((x) => strv(x.dia) >= f.de);
      const base = antes.length ? antes[antes.length - 1] : dentro[0];
      return { atual, base: base ? Number(base.seguidores) : null, desde: base ? strv(base.dia) : '', completo: antes.length > 0 };
    };
    const contas = o.contas.map((x) => {
      const ps = o.posts.filter((p) => p.conta === x.ig), sg = porContaSeg(x.ig);
      return { usuario: x.usuario, ...kp(ps), seguidores: sg.atual, novosSeguidores: sg.atual !== null && sg.base !== null ? sg.atual - sg.base : null, novosDesde: sg.desde, novosCompleto: sg.completo };
    });
    const total = kp(o.posts), totalAnt = kp(oAnt.posts);
    const sgTot = contas.every((x) => x.seguidores !== null) && contas.length ? contas.reduce((a, x) => a + Number(x.seguidores), 0) : null;
    const novosTot = contas.length && contas.every((x) => x.novosSeguidores !== null) ? contas.reduce((a, x) => a + Number(x.novosSeguidores), 0) : null;
    const baseTot = sgTot !== null && novosTot !== null ? sgTot - novosTot : null;
    const serieSeg = new Map<string, number>();
    for (const sn of snaps) if (strv(sn.dia) >= f.de) serieSeg.set(strv(sn.dia), (serieSeg.get(strv(sn.dia)) ?? 0) + Number(sn.seguidores));
    const porDia = new Map<string, { alcance: number; visualizacoes: number; interacoes: number }>();
    for (const p of o.posts) { const d = diaLocal(p.publicado_em), x = porDia.get(d) ?? { alcance: 0, visualizacoes: 0, interacoes: 0 }; x.alcance += Number(p.alcance) || 0; x.visualizacoes += Number(p.visualizacoes) || 0; x.interacoes += p.interacoes; porDia.set(d, x); }
    const formatos = new Map<string, number>(); for (const p of o.posts) formatos.set(p.formato, (formatos.get(p.formato) ?? 0) + 1);
    const melhores = [...o.posts].sort((a, b) => b.interacoes - a.interacoes).slice(0, 3).map((p) => ({ id: p.media_id, quando: p.publicado_em, formato: p.formato, legenda: strv(p.legenda).slice(0, 110), titulo: p.conteudo ? strv(p.conteudo.titulo) : '', miniatura: strv(p.miniatura), link: strv(p.permalink), perfil: o.contas.find((x) => x.ig === p.conta)?.usuario ?? '', alcance: n(p.alcance), interacoes: p.interacoes, comentarios: n(p.comentarios), salvamentos: n(p.salvos), curtidas: n(p.curtidas) }));
    return json({
      filtros: f, anteriorPeriodo: { de: anterior(f).de, ate: anterior(f).ate }, naoDeduplicado: contas.length > 1,
      atual: total, anterior: totalAnt,
      seguidores: { atual: sgTot, novos: novosTot, base: baseTot, desde: contas.map((x) => x.novosDesde).filter(Boolean).sort()[0] ?? '', completo: contas.length > 0 && contas.every((x) => x.novosCompleto), serie: [...serieSeg.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([dia, seguidores]) => ({ dia, seguidores })) },
      contas, formatos: [...formatos.entries()].map(([formato, publicacoes]) => ({ formato, publicacoes })).sort((a, b) => b.publicacoes - a.publicacoes),
      porDia: [...porDia.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([dia, x]) => ({ dia, ...x })), melhores,
      ultimaSync: await setting('ig_last_sync'), aviso: await setting('ig_sync_warning'),
      origem: { fonte: 'Instagram (API oficial da Meta, orgânico)', periodo: `${f.de} a ${f.ate}`, atualizadoEm: await setting('ig_last_sync'), aviso: await setting('ig_sync_warning'), natureza: 'publicações do período (não inclui anúncios); seguidores desde a primeira sincronização' },
    });
  }
  if (c.path === '/instagram/ranking-contas') {
    /** Histórico das contas, semana a semana (domingo a sábado), mês a mês ou ano a ano, só com leituras reais. Sem dado: null ("Sem dados"). */
    const visao = ['semana', 'mes', 'ano'].includes(c.qs('visao')) ? c.qs('visao') : 'semana';
    const hoje = now().slice(0, 10), anoAtual = Number(hoje.slice(0, 4));
    const ano = /^\d{4}$/.test(c.qs('ano')) ? Number(c.qs('ano')) : anoAtual;
    if (ano < 2020 || ano > anoAtual + 1) fail(400, 'Ano inválido.');
    const contas = await contasDoPerfil(f.perfil), ids = contas.map((x) => x.ig), principal = (await setting('ig_user_id')) || ids[0] || '';
    const marcas = ids.map(() => '?').join(',') || "''";
    const num = (v: unknown) => (v === null || v === undefined || strv(v) === '' ? null : Number(v));
    const snaps = ids.length ? await q(`SELECT conta,dia,seguidores FROM ig_seguidores WHERE conta IN (${marcas}) ORDER BY dia`, ids) : [];
    const segEm = (ig: string, de: string, ate: string) => { const l = snaps.filter((x) => strv(x.conta) === ig && strv(x.dia) >= de && strv(x.dia) <= ate); return l.length ? Number(l[l.length - 1].seguidores) : null; };
    const semanas = ids.length ? await q(`SELECT * FROM ig_conta_semana WHERE conta IN (${marcas})`, ids) : [];
    const mensais = (await listRows('instagram')).filter((r) => r.origem === 'INSTAGRAM_API' && /^\d{4}-\d{2}$/.test(strv(r.periodo)) && ids.includes(strv(r.idExterno) || principal));
    const celula = (m: Row | null, seg: number | null, segAnt: number | null) => {
      const alcance = m ? num(m.alcance) : null, interacoes = m ? num(m.interacoes) : null;
      return { seguidores: seg, novos: seg !== null && segAnt !== null ? seg - segAnt : null, alcance, visualizacoes: m ? num(m.visualizacoes) : null, visitasPerfil: m ? num(m.visitasPerfil) : null, interacoes, engajamento: alcance && interacoes !== null ? Math.round((interacoes / alcance) * 1000) / 10 : null };
    };
    const vazia = (cs: { seguidores: number | null; alcance: number | null; interacoes: number | null; visualizacoes: number | null }[]) => cs.every((x) => x.seguidores === null && x.alcance === null && x.interacoes === null && x.visualizacoes === null);
    const dom = (d: string, n: number) => fmtDate(addDays(parseLocal(d + 'T12:00:00'), n));
    const periodos: Row[] = [];
    if (visao === 'semana') {
      // Semana 1 do ano é a que contém 1º de janeiro (domingo a sábado): Semana 41 de 2026 = 04/10 a 10/10.
      const jan1 = `${ano}-01-01`, s1 = dom(jan1, -new Date(jan1 + 'T12:00:00Z').getUTCDay());
      for (let n = 1, ini = s1; ini <= `${ano}-12-31` && ini <= hoje; n++, ini = dom(ini, 7)) {
        const fim = dom(ini, 6), ant = dom(ini, -7);
        const cs = contas.map((ct) => {
          const m = semanas.find((x) => strv(x.conta) === ct.ig && strv(x.inicio) === ini) ?? null;
          const seg = segEm(ct.ig, ini, fim < hoje ? fim : hoje), segAnt = segEm(ct.ig, ant, dom(ini, -1));
          return { usuario: ct.usuario, ...celula(m ? { alcance: m.alcance, visualizacoes: m.visualizacoes, visitasPerfil: m.visitas_perfil, interacoes: m.interacoes } : null, seg, segAnt) };
        });
        periodos.push({ chave: ini, rotulo: `Semana ${n}`, inicio: ini, fim, parcial: fim >= hoje, vazia: vazia(cs), contas: cs });
      }
    } else if (visao === 'mes') {
      for (let m = 1; m <= 12; m++) {
        const per = `${ano}-${String(m).padStart(2, '0')}`, ini = `${per}-01`, fim = fmtDate(new Date(Date.UTC(ano, m, 0, 12))), mAnt = m === 1 ? `${ano - 1}-12` : `${ano}-${String(m - 1).padStart(2, '0')}`;
        const cs = contas.map((ct) => {
          const reg = mensais.find((r) => strv(r.periodo) === per && (strv(r.idExterno) || principal) === ct.ig) ?? null;
          const seg = segEm(ct.ig, ini, fim), segAnt = segEm(ct.ig, `${mAnt}-01`, dom(ini, -1));
          return { usuario: ct.usuario, ...celula(reg ? { alcance: reg.alcance, visualizacoes: reg.impressoes ?? reg.visualizacoes, visitasPerfil: reg.visitasPerfil, interacoes: reg.interacoes } : null, seg, segAnt) };
        });
        periodos.push({ chave: per, rotulo: String(m), inicio: ini, fim, parcial: ini <= hoje && fim >= hoje, futuro: ini > hoje, vazia: vazia(cs), contas: cs });
      }
    } else {
      const anos = new Set<number>([anoAtual]);
      for (const r of mensais) anos.add(Number(strv(r.periodo).slice(0, 4)));
      for (const sn of snaps) anos.add(Number(strv(sn.dia).slice(0, 4)));
      for (const a of [...anos].sort((x, y) => x - y)) {
        const ini = `${a}-01-01`, fim = `${a}-12-31`;
        const cs = contas.map((ct) => {
          const regs = mensais.filter((r) => strv(r.periodo).startsWith(String(a)) && (strv(r.idExterno) || principal) === ct.ig);
          const soma = (k: string) => (regs.some((r) => num(r[k]) !== null) ? regs.reduce((t, r) => t + (num(r[k]) ?? 0), 0) : null);
          const seg = segEm(ct.ig, ini, fim < hoje ? fim : hoje), segAnt = segEm(ct.ig, `${a - 1}-01-01`, `${a - 1}-12-31`);
          return { usuario: ct.usuario, ...celula(regs.length ? { alcance: soma('alcance'), visualizacoes: soma('impressoes') ?? soma('visualizacoes'), visitasPerfil: soma('visitasPerfil'), interacoes: soma('interacoes') } : null, seg, segAnt) };
        });
        periodos.push({ chave: String(a), rotulo: String(a), inicio: ini, fim, parcial: a === anoAtual, vazia: vazia(cs), contas: cs });
      }
    }
    return json({
      visao, ano, anos: Array.from({ length: anoAtual - 2025 + 1 }, (_, i) => 2025 + i), periodos, contas: contas.map((x) => x.usuario), ultimaSync: await setting('ig_last_sync'),
      origem: { fonte: 'Instagram (API oficial da Meta, orgânico)', periodo: visao === 'ano' ? 'todos os anos com dados' : `ano ${ano}`, atualizadoEm: await setting('ig_last_sync'), aviso: await setting('ig_sync_warning'), natureza: 'alcance de cada conta é único por conta (não se soma entre contas); seguidores só existem desde a primeira sincronização; semanas desde 04/10/2026; no ano, alcance e visualizações são a soma dos meses' },
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
