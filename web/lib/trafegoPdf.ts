import { Row } from './util';
import { trafegoComum } from './trafegoComum';
import { baixarVarias, brl, cabecalho, carregarLogo, cartoes, COR, dm, dmy, gerarPdf, graficoBarras, graficoBarrasELinha, limpa, n0, nota, pc, tabela, titulo, varTxt, garanteEspaco, PAGINA } from './pdf';

const NOME_PERIODO: Record<string, string> = { semana: 'Esta semana', semana_ant: 'Semana anterior', mes: 'Este mês', mes_ant: 'Mês anterior', ano: 'Este ano', x: 'Período personalizado' };
export interface OpcoesRelatorio { tipoPeriodo: string; status: string; segmento: string; campanha: string; semanal: boolean }

/** Relatório Geral do Tráfego Pago (Meta Ads) em PDF A4, a partir dos dados já lidos da Meta. Somente leitura. */
export async function relatorioTrafegoPdf(d: Row, o: OpcoesRelatorio, geradoEm: string): Promise<Buffer> {
  const C = trafegoComum();
  const p = d.periodo as { de: string; ate: string; dias: number }, ant = d.anterior as { de: string; ate: string };
  const f = C.tfFiltrar(d, { status: o.status, segmento: o.segmento, campanha: o.campanha });
  const filtrado = f.filtrado, camp = f.campanhas, anuncios = f.anuncios;
  const atual = filtrado ? C.tfTotais(camp, null) : d.atual as Row;
  const nomePer = NOME_PERIODO[o.tipoPeriodo] ?? 'Período';
  const filtrosTxt = [o.status !== 'todos' ? 'status: ' + (C.TF_STATUS_OPCOES.find((x) => x[0] === o.status)?.[1] ?? o.status) : '', o.segmento ? 'segmento: ' + C.tfSegRotulo(o.segmento) : '', o.campanha ? 'campanha: ' + (camp[0]?.nome ?? o.campanha) : ''].filter(Boolean).join(' · ');
  const [logo, fotos] = await Promise.all([carregarLogo(), baixarVarias(anuncios.map((a: Row) => String(a.miniatura || a.imagem || '')))]);
  const diario = filtrado ? C.tfSerieFiltrada(d.diario, camp) : (d.diario as Row);
  const dias: string[] = diario.dias;
  // evolução diária; períodos longos são agrupados por semana (dom–sáb) ou mês para o gráfico continuar legível
  const modo: 'dia' | 'semana' | 'mes' = dias.length > 200 ? 'mes' : dias.length > 45 ? 'semana' : 'dia';
  const rot = (g: { chave: string; de: string }) => (modo === 'dia' ? dm(g.de) : modo === 'semana' ? dm(g.de) : `${g.chave.slice(5, 7)}/${g.chave.slice(2, 4)}`);
  const gInv = C.tfAgrupar(dias, diario.total, modo);
  const impTot: number[] = d.diario.impressoes ?? dias.map(() => 0), cliTot: number[] = d.diario.cliques ?? dias.map(() => 0);
  const gImp = C.tfAgrupar(dias, filtrado ? dias.map(() => 0) : impTot, modo), gCli = C.tfAgrupar(dias, filtrado ? dias.map(() => 0) : cliTot, modo);

  return gerarPdf({ titulo: `Relatório geral - Tráfego Pago - ${dmy(p.de)} a ${dmy(p.ate)}` }, `Colégio Evolução · EVO MKT · Tráfego Pago (Meta Ads, somente leitura) · ${dmy(p.de)} a ${dmy(p.ate)}`, async (doc) => {
    let y = cabecalho(doc, logo, 'Relatório geral - Tráfego Pago (Meta Ads)', [`Colégio Evolução | ${dmy(p.de)} a ${dmy(p.ate)} (${nomePer}, ${p.dias} dia${p.dias === 1 ? '' : 's'})`, `Comparado a ${dmy(ant.de)} a ${dmy(ant.ate)} (mesma duração)`, ...(filtrosTxt ? ['Filtros: ' + filtrosTxt] : [])], ['Gerado em', geradoEm]);
    const a = atual as Row, v = (d.variacoes ?? {}) as Row, at = (d.anteriorTotais ?? {}) as Row;
    const vs = (k: string, fmt: (x: number | null) => string) => (filtrado || at[k] === null || at[k] === undefined ? undefined : `vs. ${fmt(at[k] as number)}`);
    y = titulo(doc, y, filtrado ? 'Indicadores do período (recorte filtrado)' : 'Indicadores do período', `${dmy(p.de)} a ${dmy(p.ate)}`);
    y = cartoes(doc, y, [
      { rot: 'Investimento', valor: brl(a.investimento as number), var: filtrado ? undefined : varTxt(v.investimento), nota: vs('investimento', brl) },
      { rot: 'Impressões', valor: n0(a.impressoes as number), var: filtrado ? undefined : varTxt(v.impressoes), nota: vs('impressoes', n0) },
      { rot: 'Alcance', valor: n0(a.alcance as number | null), var: filtrado ? undefined : varTxt(v.alcance), nota: filtrado ? 'não somado entre linhas' : vs('alcance', n0) },
      { rot: 'Cliques', valor: n0(a.cliques as number), var: filtrado ? undefined : varTxt(v.cliques), nota: vs('cliques', n0) },
      { rot: 'CTR médio', valor: pc(a.ctr as number | null), var: filtrado ? undefined : varTxt(v.ctr), nota: vs('ctr', pc) },
      { rot: 'CPC médio', valor: brl(a.cpc as number | null), var: filtrado ? undefined : varTxt(v.cpc), nota: vs('cpc', brl) },
      { rot: 'Conversas iniciadas', valor: n0(a.conversas as number), var: filtrado ? undefined : varTxt(v.conversas), nota: vs('conversas', n0) },
      { rot: 'Custo por conversa', valor: brl(a.custoConversa as number | null), var: filtrado ? undefined : varTxt(v.custoConversa), nota: vs('custoConversa', brl) },
    ], 4, 56) + 4;
    // gráficos
    const gw = (PAGINA.w - PAGINA.m * 2 - 8) / 2, gh = 150;
    y = garanteEspaco(doc, y, gh + 24); y = titulo(doc, y, 'Evolução no período', modo === 'dia' ? 'POR DIA' : modo === 'semana' ? 'POR SEMANA (DOM-SAB)' : 'POR MÊS');
    graficoBarras(doc, PAGINA.m, y, gw, gh, gInv.map(rot), [{ nome: 'Investimento', valores: gInv.map((g) => g.valor), cor: COR.azul }], (x) => 'R$ ' + n0(x), 'Investimento ' + (modo === 'dia' ? 'diário' : modo === 'semana' ? 'semanal' : 'mensal'));
    if (filtrado) graficoBarras(doc, PAGINA.m + gw + 8, y, gw, gh, [], [], n0, 'Impressões e cliques por dia (indisponível com filtros)');
    else graficoBarrasELinha(doc, PAGINA.m + gw + 8, y, gw, gh, gImp.map(rot), { nome: 'Impressões', valores: gImp.map((g) => g.valor), cor: COR.claro }, { nome: 'Cliques', valores: gCli.map((g) => g.valor), cor: COR.laranja }, n0, n0, 'Impressões e cliques');
    y += gh + 12;
    if (o.semanal) {
      const sem = C.tfAgrupar(dias, diario.total, 'semana'), convSem = filtrado ? null : C.tfAgrupar(dias, d.diario.conversas ?? dias.map(() => 0), 'semana');
      const totI = sem.reduce((s, g) => s + g.valor, 0), totC = convSem ? convSem.reduce((s, g) => s + g.valor, 0) : null;
      y = garanteEspaco(doc, y, 60); y = titulo(doc, y, 'Recorte semanal (domingo a sábado)', 'SEMANAS DENTRO DO PERÍODO');
      y = tabela(doc, y, [{ t: 'Semana', w: 60 }, { t: 'Período', w: 110 }, { t: 'Dias', w: 40, al: 'right' }, { t: 'Investimento', w: 90, al: 'right' }, ...(convSem ? [{ t: 'Conversas', w: 70, al: 'right' as const }, { t: 'Custo/conversa', w: 90, al: 'right' as const }] : [])],
        sem.map((g, i) => [`Semana ${C.tfSemanaEpi(g.de).semana}`, `${dm(g.de)} a ${dm(g.ate)}`, String(Math.round((Date.parse(g.ate + 'T12:00:00Z') - Date.parse(g.de + 'T12:00:00Z')) / 86400000) + 1), brl(g.valor), ...(convSem ? [n0(convSem[i].valor), brl(convSem[i].valor ? g.valor / convSem[i].valor : null)] : [])]),
        { total: ['TOTAL', '', String(dias.length), brl(totI), ...(convSem ? [n0(totC), brl(totC ? totI / (totC as number) : null)] : [])], alturaLinha: 16 });
    }
    // resumo por campanha
    y = garanteEspaco(doc, y, 70); y = titulo(doc, y, 'Resumo das campanhas (principais por investimento)', `${camp.length} campanha(s)`);
    const tc = C.tfTotais(camp, filtrado ? null : (d.atual as Row).alcance as number | null);
    y = tabela(doc, y, [{ t: 'Campanha', w: 118 }, { t: 'Status', w: 42 }, { t: 'Invest. (R$)', w: 52, al: 'right' }, { t: 'Impress.', w: 44, al: 'right' }, { t: 'Alcance', w: 40, al: 'right' }, { t: 'Cliques', w: 36, al: 'right' }, { t: 'CTR', w: 34, al: 'right' }, { t: 'CPC (R$)', w: 40, al: 'right' }, { t: 'Conv.', w: 30, al: 'right' }, { t: 'Custo/Conv.', w: 46, al: 'right' }],
      camp.map((c: Row) => [String(c.nome), String(c.statusRotulo || '-'), brl(c.investimento as number).replace('R$ ', ''), n0(c.impressoes as number), n0(c.alcance as number | null), n0(c.cliques as number), pc(c.ctr as number | null), brl(c.cpc as number | null).replace('R$ ', ''), n0(c.conversas as number), brl(c.custoConversa as number | null).replace('R$ ', '')]),
      { total: ['TOTAL', '', brl(tc.investimento).replace('R$ ', ''), n0(tc.impressoes), n0(tc.alcance), n0(tc.cliques), pc(tc.ctr), brl(tc.cpc).replace('R$ ', ''), n0(tc.conversas), brl(tc.custoConversa).replace('R$ ', '')], alturaLinha: 19 });
    // detalhamento por anúncio, com fotos
    y = garanteEspaco(doc, y, 90); y = titulo(doc, y, 'Detalhamento dos anúncios (com fotos)', `${anuncios.length} anúncio(s)`);
    const ta = C.tfTotais(anuncios, null);
    y = tabela(doc, y, [{ t: 'Foto', w: 34 }, { t: 'Anúncio', w: 84 }, { t: 'Campanha', w: 50 }, { t: 'Status', w: 46 }, { t: 'Invest. (R$)', w: 46, al: 'right' }, { t: 'Impress.', w: 40, al: 'right' }, { t: 'Alcance', w: 38, al: 'right' }, { t: 'Cliques', w: 32, al: 'right' }, { t: 'CTR', w: 30, al: 'right' }, { t: 'CPC (R$)', w: 34, al: 'right' }, { t: 'Conv.', w: 26, al: 'right' }, { t: 'Custo/Conv.', w: 40, al: 'right' }],
      anuncios.map((x: Row, i: number) => [{ img: fotos[i], vazio: 'Sem imagem' }, String(x.nome), String(x.codigo || x.campanha), String(x.statusRotulo || '-'), brl(x.investimento as number).replace('R$ ', ''), n0(x.impressoes as number), n0(x.alcance as number | null), n0(x.cliques as number), pc(x.ctr as number | null), brl(x.cpc as number | null).replace('R$ ', ''), n0(x.conversas as number), brl(x.custoConversa as number | null).replace('R$ ', '')]),
      { alturaLinha: 38, total: ['TOTAL', '', '', '', brl(ta.investimento).replace('R$ ', ''), n0(ta.impressoes), '-', n0(ta.cliques), pc(ta.ctr), brl(ta.cpc).replace('R$ ', ''), n0(ta.conversas), brl(ta.custoConversa).replace('R$ ', '')] });
    const avisos = [...((d.avisos as string[]) ?? []), ...(filtrado ? ['Recorte filtrado: totais recalculados a partir das linhas exibidas; o alcance não é somado entre linhas e a comparação com o período anterior não se aplica.'] : [])];
    y = nota(doc, y, avisos.join(' '));
    nota(doc, y, 'Conversas = conversas iniciadas pelos anúncios (não inclui leads de formulário). CTR, CPC e custo por conversa são calculados dos valores absolutos. O alcance do total vem da conta e não soma o das campanhas. Status é o atual na Meta. Dados lidos da Meta (somente leitura); a Meta pode ajustar números por até 72 horas.');
  });
}
