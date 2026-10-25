import { Row } from './util';
import { baixarVarias, cabecalho, carregarLogo, cartoes, COR, dmy, dm, garanteEspaco, gerarPdf, graficoBarras, graficoLinha, imagemNaCaixa, limpa, n0, nota, PAGINA, tabela, titulo, Doc } from './pdf';

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const FORMATO = (t: unknown) => { const x = String(t || '').toUpperCase(); return x === 'REELS' ? 'Reels' : x === 'STORY' ? 'Stories' : x === 'CAROUSEL_ALBUM' || x === 'IMAGE' || x === 'FEED' ? 'Posts' : x === 'VIDEO' ? 'Posts' : 'Outros'; };
const CORES_FMT: Record<string, string> = { Reels: COR.roxo, Posts: COR.claro, Stories: COR.laranja, Outros: COR.cinza };
const pct1 = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
/** Variação % entre dois valores de métricas que existem de verdade; sem base, devolve texto neutro (nunca inventa). */
function variacao(a: number | null | undefined, b: number | null | undefined): { t: string; cor: string } {
  if (a === null || a === undefined || b === null || b === undefined) return { t: 'sem mes anterior', cor: COR.cinza };
  if (!b) return { t: a ? 'novo no mes' : 'estavel', cor: COR.cinza };
  const p = ((a - b) / b) * 100;
  if (Math.abs(p) < 0.05) return { t: 'estavel', cor: COR.cinza };
  return { t: `${p > 0 ? '+' : '-'}${pct1(Math.abs(p))}% vs. mes anterior`, cor: p > 0 ? COR.verde : COR.vermelho };
}
const num = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);

/** Rosca (anel) com fatias proporcionais; o centro mostra o total. */
function rosca(doc: Doc, cx: number, cy: number, r: number, fatias: { v: number; cor: string }[], centro: string, sub: string): void {
  const tot = fatias.reduce((s, f) => s + f.v, 0);
  if (tot <= 0) { doc.circle(cx, cy, r).lineWidth(10).strokeColor('#E6E9F0').stroke(); }
  else {
    let ang = -Math.PI / 2;
    for (const f of fatias.filter((x) => x.v > 0)) {
      const d = (f.v / tot) * Math.PI * 2, n = Math.max(2, Math.ceil(d / 0.05));
      doc.moveTo(cx + r * Math.cos(ang), cy + r * Math.sin(ang));
      for (let i = 1; i <= n; i++) doc.lineTo(cx + r * Math.cos(ang + (d * i) / n), cy + r * Math.sin(ang + (d * i) / n));
      doc.lineWidth(11).strokeColor(f.cor).stroke(); ang += d;
    }
  }
  doc.font('Helvetica-Bold').fontSize(12).fillColor(COR.escuro).text(limpa(centro), cx - 34, cy - 9, { width: 68, align: 'center', lineBreak: false });
  doc.font('Helvetica').fontSize(6.8).fillColor(COR.cinza).text(limpa(sub), cx - 34, cy + 5, { width: 68, align: 'center', lineBreak: false });
}

/** Relatório Mensal do Instagram (orgânico) em PDF A4 paginado, a partir dos mesmos dados da pré-visualização. Somente leitura. */
export async function relatorioInstagramPdf(d: Row, geradoEm: string): Promise<Buffer> {
  const mes = String(d.mes), [ano, mm] = mes.split('-').map(Number);
  const nomeMes = `${MESES[mm - 1][0].toUpperCase()}${MESES[mm - 1].slice(1)} de ${ano}`;
  const per = d.periodo as { de: string; ate: string; parcial: boolean };
  const a = (d.atual ?? null) as Row | null, p = (d.anteriorMetricas ?? null) as Row | null;
  const posts = (d.posts as Row[]) ?? [];
  const seg = num(d.seguidores), segA = num(d.seguidoresAnterior), novos = seg !== null && segA !== null ? seg - segA : null;
  const top = [...posts].sort((x, y) => (num(y.alcance) ?? 0) - (num(x.alcance) ?? 0)).slice(0, 5);
  const [logo, fotos] = await Promise.all([carregarLogo(), baixarVarias(top.map((x) => String(x.miniatura || '')))]);
  const somaPosts = (k: string) => posts.reduce((s, x) => s + (num(x[k]) ?? 0), 0);
  const conta = String(d.conta || '');

  return gerarPdf({ titulo: `Relatório Mensal - Instagram - ${nomeMes}` }, `Relatório Mensal - Instagram${conta ? ' @' + conta : ''} · Período: ${dmy(per.de)} a ${dmy(per.ate)}${per.parcial ? ' (mês em andamento)' : ''} · Gerado em ${geradoEm}`, async (doc) => {
    let y = cabecalho(doc, logo, 'Relatório Mensal - Instagram', [nomeMes, `Período: ${dmy(per.de)} a ${dmy(per.ate)}${per.parcial ? ' (mês em andamento)' : ''}`], [conta ? '@' + conta : 'Instagram', 'Perfil institucional']);
    y = titulo(doc, y, 'Resumo do mês', 'INSTAGRAM ORGÂNICO');
    y = nota(doc, y - 6, `Principais indicadores do Instagram no período de ${dmy(per.de)} a ${dmy(per.ate)}. Este relatório não inclui anúncios (Tráfego Pago).`);
    // indicadores: só os que a API real trouxe
    const itens: { rot: string; valor: string; var: { t: string; cor: string }; nota?: string }[] = [];
    if (seg !== null) itens.push({ rot: 'Seguidores', valor: n0(seg), var: variacao(seg, segA) });
    if (novos !== null) itens.push({ rot: 'Novos seguidores', valor: (novos > 0 ? '+' : '') + n0(novos), var: { t: 'no mês', cor: COR.cinza } });
    if (a && num(a.alcance) !== null) itens.push({ rot: 'Alcance', valor: n0(num(a.alcance)), var: variacao(num(a.alcance), p ? num(p.alcance) : null) });
    if (a && num(a.impressoes) !== null) itens.push({ rot: 'Visualizações', valor: n0(num(a.impressoes)), var: variacao(num(a.impressoes), p ? num(p.impressoes) : null) });
    const interacoes = a && num(a.interacoes) !== null ? num(a.interacoes) : null;
    if (interacoes !== null) itens.push({ rot: 'Interações', valor: n0(interacoes), var: variacao(interacoes, p ? num(p.interacoes) : null) });
    if (a && num(a.salvamentos) !== null) itens.push({ rot: 'Salvamentos', valor: n0(num(a.salvamentos)), var: variacao(num(a.salvamentos), p ? num(p.salvamentos) : null) });
    if (a && num(a.compartilhamentos) !== null) itens.push({ rot: 'Compartilhamentos', valor: n0(num(a.compartilhamentos)), var: variacao(num(a.compartilhamentos), p ? num(p.compartilhamentos) : null) });
    itens.push({ rot: 'Publicações no mês', valor: n0(posts.length), var: { t: 'sincronizadas da Meta', cor: COR.cinza } });
    y = cartoes(doc, y, itens, 4, 52) + 2;
    if (!a) y = nota(doc, y, 'As métricas mensais da conta (alcance, visualizações, interações) deste mês ainda não foram carregadas da Meta (Instagram > Ranking > Carregar histórico); por isso não aparecem. Nada é estimado.');
    // gráficos: seguidores e alcance/visualizações
    const gw = (PAGINA.w - PAGINA.m * 2 - 8) / 2, gh = 150;
    y = garanteEspaco(doc, y, gh + 12);
    const ss = (d.serieSeguidores as { dia: string; seguidores: number }[]) ?? [];
    if (ss.length > 1) graficoLinha(doc, PAGINA.m, y, gw, gh, ss.map((x) => dm(x.dia)), ss.map((x) => x.seguidores), COR.azul, n0, `Evolução de seguidores${novos !== null ? `  (${novos > 0 ? '+' : ''}${n0(novos)} no mês)` : ''}`);
    else graficoLinha(doc, PAGINA.m, y, gw, gh, [], [], COR.azul, n0, 'Evolução de seguidores (menos de 2 registros no mês)');
    const sem = ((d.semanas as Row[]) ?? []).filter((s) => num(s.alcance) !== null || num(s.visualizacoes) !== null);
    graficoBarras(doc, PAGINA.m + gw + 8, y, gw, gh, sem.map((s) => dm(String(s.inicio))), [{ nome: 'Alcance', valores: sem.map((s) => num(s.alcance) ?? 0), cor: COR.azul }, { nome: 'Visualizações', valores: sem.map((s) => num(s.visualizacoes) ?? 0), cor: COR.roxo }], n0, sem.length ? 'Alcance e visualizações por semana' : 'Alcance e visualizações (sem dados semanais)');
    y += gh + 12;
    // desempenho por tipo de conteúdo + interações por tipo
    const porFmt: Record<string, { alcance: number; inter: number; n: number }> = {};
    for (const x of posts) { const f = FORMATO(x.tipo); const o = porFmt[f] ?? (porFmt[f] = { alcance: 0, inter: 0, n: 0 }); o.alcance += num(x.alcance) ?? 0; o.inter += Number(x.interacoes) || 0; o.n++; }
    const fmts = ['Reels', 'Posts', 'Stories', 'Outros'].filter((f) => porFmt[f]);
    const totAlc = fmts.reduce((s, f) => s + porFmt[f].alcance, 0), totInt = fmts.reduce((s, f) => s + porFmt[f].inter, 0);
    y = garanteEspaco(doc, y, 150);
    doc.roundedRect(PAGINA.m, y, gw, 140, 5).lineWidth(0.6).fillAndStroke('#FFFFFF', COR.linha);
    doc.font('Helvetica-Bold').fontSize(9).fillColor(COR.escuro).text('Desempenho por tipo de conteúdo', PAGINA.m + 8, y + 7, { lineBreak: false });
    doc.font('Helvetica').fontSize(7).fillColor(COR.cinza).text('Alcance somado das publicações do mês, por formato', PAGINA.m + 8, y + 19, { lineBreak: false });
    fmts.forEach((f, i) => {
      const yy = y + 36 + i * 24, v = porFmt[f], share = totAlc ? v.alcance / totAlc : 0;
      doc.font('Helvetica-Bold').fontSize(8).fillColor(COR.texto).text(`${f} (${v.n})`, PAGINA.m + 10, yy, { width: 70, lineBreak: false });
      doc.font('Helvetica-Bold').fontSize(9).fillColor(COR.escuro).text(n0(v.alcance), PAGINA.m + 82, yy, { width: 56, lineBreak: false });
      doc.rect(PAGINA.m + 10, yy + 12, gw - 70, 4).fill('#E6E9F0'); doc.rect(PAGINA.m + 10, yy + 12, Math.max(1, (gw - 70) * share), 4).fill(CORES_FMT[f]);
      doc.font('Helvetica').fontSize(7.5).fillColor(COR.cinza).text(`${pct1(share * 100)}%`, PAGINA.m + gw - 54, yy + 8, { width: 44, align: 'right', lineBreak: false });
    });
    if (!fmts.length) doc.font('Helvetica').fontSize(8).fillColor(COR.cinza).text('Sem publicações sincronizadas neste mês.', PAGINA.m + 10, y + 70);
    const x2 = PAGINA.m + gw + 8;
    doc.roundedRect(x2, y, gw, 140, 5).lineWidth(0.6).fillAndStroke('#FFFFFF', COR.linha);
    doc.font('Helvetica-Bold').fontSize(9).fillColor(COR.escuro).text('Interações por tipo de conteúdo', x2 + 8, y + 7, { lineBreak: false });
    doc.font('Helvetica').fontSize(7).fillColor(COR.cinza).text('Curtidas, comentários, salvamentos e compartilhamentos das publicações', x2 + 8, y + 19, { lineBreak: false });
    rosca(doc, x2 + 62, y + 82, 36, fmts.map((f) => ({ v: porFmt[f].inter, cor: CORES_FMT[f] })), n0(totInt), 'interações');
    fmts.forEach((f, i) => { const yy = y + 50 + i * 20; doc.rect(x2 + 118, yy + 1, 7, 7).fill(CORES_FMT[f]); doc.font('Helvetica').fontSize(8).fillColor(COR.texto).text(f, x2 + 130, yy, { width: 60, lineBreak: false }); doc.font('Helvetica-Bold').text(`${totInt ? pct1((porFmt[f].inter / totInt) * 100) : '0'}%`, x2 + 190, yy, { width: 40, align: 'right', lineBreak: false }); });
    y += 152;
    // melhores conteúdos
    y = garanteEspaco(doc, y, 150); y = titulo(doc, y, 'Melhores conteúdos do mês', 'MAIOR ALCANCE');
    if (top.length) {
      const cw = (PAGINA.w - PAGINA.m * 2 - 4 * 6) / 5;
      top.forEach((x, i) => {
        const cx = PAGINA.m + i * (cw + 6);
        doc.roundedRect(cx, y, cw, 132, 5).lineWidth(0.6).fillAndStroke('#FFFFFF', COR.linha);
        if (!fotos[i] || !imagemNaCaixa(doc, fotos[i]!, cx + 3, y + 3, cw - 6, 62)) { doc.roundedRect(cx + 3, y + 3, cw - 6, 62, 3).fill('#F3F5F9'); doc.font('Helvetica').fontSize(7).fillColor(COR.cinza).text('Sem imagem', cx + 3, y + 30, { width: cw - 6, align: 'center', lineBreak: false }); }
        doc.circle(cx + 11, y + 11, 7).fill(COR.laranja); doc.font('Helvetica-Bold').fontSize(8).fillColor('#fff').text(String(i + 1), cx + 7, y + 7.5, { width: 8, align: 'center', lineBreak: false });
        doc.font('Helvetica-Bold').fontSize(7.2).fillColor(COR.texto).text(limpa(x.legenda || 'Sem legenda'), cx + 4, y + 69, { width: cw - 8, height: 18, ellipsis: true });
        doc.font('Helvetica').fontSize(6.8).fillColor(COR.cinza).text(`${FORMATO(x.tipo)} · ${dmy(String(x.publicado_em).slice(0, 10))}`, cx + 4, y + 89, { width: cw - 8, lineBreak: false });
        const m = (rot: string, v: unknown, xx: number, yy: number) => doc.font('Helvetica').fontSize(6.8).fillColor(COR.cinza).text(`${rot} `, xx, yy, { continued: true, lineBreak: false }).font('Helvetica-Bold').fillColor(COR.escuro).text(n0(num(v)), { lineBreak: false });
        m('Alcance', x.alcance, cx + 4, y + 100); m('Visualiz.', x.visualizacoes, cx + cw / 2 + 2, y + 100);
        m('Curtidas', x.curtidas, cx + 4, y + 111); m('Salvos', x.salvos, cx + cw / 2 + 2, y + 111);
        m('Coment.', x.comentarios, cx + 4, y + 121); m('Compart.', x.compartilhamentos, cx + cw / 2 + 2, y + 121);
      });
      y += 140;
    } else y = nota(doc, y, 'Nenhuma publicação sincronizada neste mês.');
    // resumo geral e metas/comparativo
    y = garanteEspaco(doc, y, 90); y = titulo(doc, y, 'Resumo geral do mês', 'COMPARAÇÃO COM O MÊS ANTERIOR');
    const lin = (rot: string, v: number | null, ant: number | null, mais = false): string[] => [rot, v === null ? '-' : (mais && v > 0 ? '+' : '') + n0(v), variacao(v, ant).t.replace(' vs. mes anterior', '')];
    const linhas: string[][] = [];
    if (seg !== null) linhas.push(lin('Seguidores (final do mês)', seg, segA));
    if (novos !== null) linhas.push(['Novos seguidores', (novos > 0 ? '+' : '') + n0(novos), '-']);
    if (a) for (const [r, k] of [['Alcance', 'alcance'], ['Visualizações', 'impressoes'], ['Visitas ao perfil', 'visitasPerfil'], ['Interações', 'interacoes'], ['Curtidas', 'curtidas'], ['Comentários', 'comentarios'], ['Salvamentos', 'salvamentos'], ['Compartilhamentos', 'compartilhamentos']] as [string, string][]) if (num(a[k]) !== null) linhas.push(lin(r, num(a[k]), p ? num(p[k]) : null));
    linhas.push(['Publicações sincronizadas', n0(posts.length), '-']);
    if (!a && posts.length) linhas.push(['Interações (soma das publicações)', n0(somaPosts('interacoes')), '-']);
    y = tabela(doc, y, [{ t: 'Indicador', w: 200 }, { t: 'Total no mês', w: 110, al: 'right' }, { t: 'vs. mês anterior', w: 120, al: 'right' }], linhas, { alturaLinha: 16 });
    // metas e comparativo: mês atual x anterior (só o que existe nos dois)
    const comp = [['Seguidores', seg, segA], ['Alcance', a ? num(a.alcance) : null, p ? num(p.alcance) : null], ['Visualizações', a ? num(a.impressoes) : null, p ? num(p.impressoes) : null], ['Interações', a ? num(a.interacoes) : null, p ? num(p.interacoes) : null]].filter((r) => r[1] !== null && r[2] !== null) as [string, number, number][];
    if (comp.length) {
      y = garanteEspaco(doc, y, 40 + comp.length * 28); y = titulo(doc, y, 'Mês atual x mês anterior');
      const mx = Math.max(...comp.flatMap((r) => [r[1], r[2]]), 1), bw = PAGINA.w - PAGINA.m * 2 - 190;
      comp.forEach(([rot, v1, v2]) => {
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COR.texto).text(rot, PAGINA.m, y + 4, { width: 90, lineBreak: false });
        doc.rect(PAGINA.m + 96, y, Math.max(2, (bw * v1) / mx), 9).fill(COR.azul); doc.font('Helvetica-Bold').fontSize(8).fillColor(COR.escuro).text(n0(v1), PAGINA.m + 100 + (bw * v1) / mx, y + 1, { lineBreak: false });
        doc.rect(PAGINA.m + 96, y + 12, Math.max(2, (bw * v2) / mx), 9).fill('#C9D3E6'); doc.font('Helvetica').fontSize(8).fillColor(COR.cinza).text(n0(v2), PAGINA.m + 100 + (bw * v2) / mx, y + 13, { lineBreak: false });
        y += 28;
      });
    }
    y += 4;
    nota(doc, y, 'Dados lidos da Meta (somente leitura); o EVO MKT não altera nada na plataforma. Alcance, visualizações e impressões são métricas diferentes e não são somadas entre si nem entre meses. Seguidores do fim do mês vêm do último registro sincronizado. Quando o mês anterior ou uma métrica não está disponível, o relatório indica em vez de estimar.');
  });
}
