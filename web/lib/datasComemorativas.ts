/**
 * Datas Comemorativas: regras de cálculo (fixas e móveis) e catálogo inicial.
 * O catálogo NÃO é gravado por ano no banco: cada ano é calculado a partir da regra, então não há duplicação e as datas
 * "aparecem" nos anos seguintes sozinhas. Cada item traz a fonte/base usada na conferência e se está confirmado ou pendente.
 * Regra de ouro: nada entra como oficial sem fonte; o que não foi confirmado fica com status "pendente" (não aparece como oficial).
 */
export type Regra =
  | { tipo: 'fixa'; mes: number; dia: number }
  | { tipo: 'nesimo'; mes: number; n: number; diaSemana: number } // n: 1..4, ou -1 = último
  | { tipo: 'pascoa'; offset: number } // dias antes (-) ou depois (+) do domingo de Páscoa
  | { tipo: 'mes'; mes: number }; // mês inteiro (campanhas)

const p2 = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
export const diasNoMes = (ano: number, mes: number) => new Date(Date.UTC(ano, mes, 0)).getUTCDate();
export const bissexto = (a: number) => (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0;

/** Domingo de Páscoa (calendário gregoriano; algoritmo de Meeus/Jones/Butcher). */
export function pascoa(ano: number): string {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(utc(ano, mes, dia));
}

/** Data da regra no ano (ou null quando a regra não cai naquele ano, ex.: 29/02 em ano comum). */
export function ocorrencia(r: Regra, ano: number): { data: string; fim?: string } | null {
  if (r.tipo === 'fixa') {
    if (r.dia > diasNoMes(ano, r.mes)) return null;
    return { data: iso(utc(ano, r.mes, r.dia)) };
  }
  if (r.tipo === 'mes') return { data: iso(utc(ano, r.mes, 1)), fim: iso(utc(ano, r.mes, diasNoMes(ano, r.mes))) };
  if (r.tipo === 'pascoa') {
    const [y, m, d] = pascoa(ano).split('-').map(Number);
    return { data: iso(utc(y, m, d + r.offset)) };
  }
  if (r.n === -1) {
    for (let d = diasNoMes(ano, r.mes); d >= 1; d--) if (utc(ano, r.mes, d).getUTCDay() === r.diaSemana) return { data: iso(utc(ano, r.mes, d)) };
    return null;
  }
  let achados = 0;
  for (let d = 1; d <= diasNoMes(ano, r.mes); d++) if (utc(ano, r.mes, d).getUTCDay() === r.diaSemana && ++achados === r.n) return { data: iso(utc(ano, r.mes, d)) };
  return null;
}

export const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const DIAS_SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
export const ehMovel = (r: Regra) => r.tipo === 'nesimo' || r.tipo === 'pascoa';

export function descreverRegra(r: Regra): string {
  if (r.tipo === 'fixa') return `${r.dia} de ${MESES[r.mes - 1]}`;
  if (r.tipo === 'mes') return `mês de ${MESES[r.mes - 1]} (campanha)`;
  if (r.tipo === 'nesimo') return `${r.n === -1 ? 'último' : r.n + 'º'} ${DIAS_SEMANA[r.diaSemana]} de ${MESES[r.mes - 1]}`;
  if (r.offset === 0) return 'Domingo de Páscoa';
  return `Páscoa ${r.offset < 0 ? '−' : '+'} ${Math.abs(r.offset)} dia${Math.abs(r.offset) === 1 ? '' : 's'}`;
}

/** Valida e normaliza uma regra recebida do navegador. Devolve a mensagem de erro, ou a regra pronta. */
export function normalizarRegra(b: Record<string, any>): { regra?: Regra; erro?: string } {
  const int = (v: unknown) => (/^-?\d+$/.test(String(v ?? '').trim()) ? Number(v) : NaN);
  const tipo = String(b.tipo ?? '');
  if (tipo === 'fixa') {
    const mes = int(b.mes), dia = int(b.dia);
    if (!(mes >= 1 && mes <= 12)) return { erro: 'Mês inválido.' };
    if (!(dia >= 1 && dia <= diasNoMes(2024, mes))) return { erro: 'Dia inválido para este mês.' }; // 2024 é bissexto: 29/02 vale (só aparece nos anos bissextos)
    return { regra: { tipo, mes, dia } };
  }
  if (tipo === 'nesimo') {
    const mes = int(b.mes), n = int(b.n), diaSemana = int(b.diaSemana);
    if (!(mes >= 1 && mes <= 12)) return { erro: 'Mês inválido.' };
    if (![1, 2, 3, 4, -1].includes(n)) return { erro: 'Escolha 1º, 2º, 3º, 4º ou último.' };
    if (!(diaSemana >= 0 && diaSemana <= 6)) return { erro: 'Dia da semana inválido.' };
    return { regra: { tipo, mes, n, diaSemana } };
  }
  if (tipo === 'pascoa') {
    const offset = int(b.offset);
    if (!(offset >= -100 && offset <= 100)) return { erro: 'A distância da Páscoa deve ficar entre -100 e 100 dias.' };
    return { regra: { tipo, offset } };
  }
  if (tipo === 'mes') {
    const mes = int(b.mes);
    if (!(mes >= 1 && mes <= 12)) return { erro: 'Mês inválido.' };
    return { regra: { tipo, mes } };
  }
  return { erro: 'Escolha o tipo de regra: dia fixo, dia da semana do mês ou relativo à Páscoa.' };
}

export const CATEGORIAS_PADRAO: [string, string][] = [
  ['FERIADO_NACIONAL', 'Feriados nacionais'],
  ['FERIADO_ESTADUAL_PB', 'Feriados estaduais da Paraíba'],
  ['FERIADO_MUNICIPAL_JP', 'Feriados municipais de João Pessoa'],
  ['EDUCACIONAL', 'Datas educacionais'],
  ['CULTURAL', 'Datas culturais'],
  ['RELIGIOSA', 'Datas religiosas'],
  ['PROFISSIONAL', 'Datas profissionais'],
  ['AMBIENTAL', 'Datas ambientais'],
  ['SAUDE', 'Saúde e conscientização'],
  ['INSTITUCIONAL', 'Datas institucionais e outras'],
];
export const CATEGORIAS_FERIADO = ['FERIADO_NACIONAL', 'FERIADO_ESTADUAL_PB', 'FERIADO_MUNICIPAL_JP'];

export interface ItemCatalogo {
  id: string; nome: string; categoria: string; regra: Regra;
  /** Sugestão inicial de relevância para o marketing (a equipe pode mudar). */
  relevante: boolean;
  status: 'confirmada' | 'pendente';
  fonte: string; baseLegal: string; descricao?: string;
}
const VERIFICADO = 'Conferido em 17/10/2026';
const L = (nome: string) => nome;

export const CATALOGO: ItemCatalogo[] = [
  // ---- Feriados nacionais (Lei 10.607/2002 e Lei 9.093/1995; lista conferida em calendários oficiais de tribunais e órgãos federais) ----
  { id: 'ano-novo', nome: L('Confraternização Universal (Ano Novo)'), categoria: 'FERIADO_NACIONAL', regra: { tipo: 'fixa', mes: 1, dia: 1 }, relevante: false, status: 'confirmada', baseLegal: 'Lei 10.607/2002', fonte: `${VERIFICADO}: lista de feriados nacionais da Lei 10.607/2002 e calendários TRE-PB/TJPB.` },
  { id: 'sexta-feira-santa', nome: L('Sexta-feira da Paixão'), categoria: 'FERIADO_NACIONAL', regra: { tipo: 'pascoa', offset: -2 }, relevante: false, status: 'confirmada', baseLegal: 'Lei 9.093/1995', fonte: `${VERIFICADO}: CNMP/MPF tratam a Paixão de Cristo como feriado nacional (Lei 9.093/1995). Data móvel: Páscoa − 2 dias.` },
  { id: 'tiradentes', nome: L('Tiradentes'), categoria: 'FERIADO_NACIONAL', regra: { tipo: 'fixa', mes: 4, dia: 21 }, relevante: false, status: 'confirmada', baseLegal: 'Lei 10.607/2002', fonte: `${VERIFICADO}: Lei 10.607/2002.` },
  { id: 'dia-do-trabalho', nome: L('Dia do Trabalho'), categoria: 'FERIADO_NACIONAL', regra: { tipo: 'fixa', mes: 5, dia: 1 }, relevante: false, status: 'confirmada', baseLegal: 'Lei 10.607/2002', fonte: `${VERIFICADO}: Lei 10.607/2002.` },
  { id: 'independencia', nome: L('Independência do Brasil'), categoria: 'FERIADO_NACIONAL', regra: { tipo: 'fixa', mes: 9, dia: 7 }, relevante: true, status: 'confirmada', baseLegal: 'Lei 10.607/2002', fonte: `${VERIFICADO}: Lei 10.607/2002 e calendário TJPB (07/09/2026, feriado nacional).` },
  { id: 'nossa-senhora-aparecida', nome: L('Nossa Senhora Aparecida'), categoria: 'FERIADO_NACIONAL', regra: { tipo: 'fixa', mes: 10, dia: 12 }, relevante: false, status: 'confirmada', baseLegal: 'Lei 10.607/2002', fonte: `${VERIFICADO}: Lei 10.607/2002. Coincide com o Dia das Crianças.` },
  { id: 'finados', nome: L('Finados'), categoria: 'FERIADO_NACIONAL', regra: { tipo: 'fixa', mes: 11, dia: 2 }, relevante: false, status: 'confirmada', baseLegal: 'Lei 10.607/2002', fonte: `${VERIFICADO}: Lei 10.607/2002.` },
  { id: 'proclamacao-republica', nome: L('Proclamação da República'), categoria: 'FERIADO_NACIONAL', regra: { tipo: 'fixa', mes: 11, dia: 15 }, relevante: false, status: 'confirmada', baseLegal: 'Lei 10.607/2002', fonte: `${VERIFICADO}: Lei 10.607/2002.` },
  { id: 'consciencia-negra', nome: L('Dia Nacional de Zumbi e da Consciência Negra'), categoria: 'FERIADO_NACIONAL', regra: { tipo: 'fixa', mes: 11, dia: 20 }, relevante: true, status: 'confirmada', baseLegal: 'Lei 14.759/2023', fonte: `${VERIFICADO}: Lei 14.759, de 21/12/2023 (texto na Câmara dos Deputados): feriado nacional em 20 de novembro.` },
  { id: 'natal', nome: L('Natal'), categoria: 'FERIADO_NACIONAL', regra: { tipo: 'fixa', mes: 12, dia: 25 }, relevante: true, status: 'confirmada', baseLegal: 'Lei 10.607/2002', fonte: `${VERIFICADO}: Lei 10.607/2002.` },
  // ---- Paraíba e João Pessoa ----
  { id: 'data-magna-pb', nome: L('Data Magna da Paraíba'), categoria: 'FERIADO_ESTADUAL_PB', regra: { tipo: 'fixa', mes: 8, dia: 5 }, relevante: false, status: 'confirmada', baseLegal: 'Lei Estadual 10.601/2015, art. 1º', fonte: `${VERIFICADO}: calendários de feriados do TJPB (Ato Conjunto 04/2025) e do TRE-PB (Portaria 403/2025) citam a Lei Estadual 10.601/2015.`, descricao: 'Lembra a fundação da cidade de Nossa Senhora das Neves (hoje João Pessoa), em 5/8/1585.' },
  { id: 'nossa-senhora-das-neves-jp', nome: L('Nossa Senhora das Neves, padroeira de João Pessoa'), categoria: 'FERIADO_MUNICIPAL_JP', regra: { tipo: 'fixa', mes: 8, dia: 5 }, relevante: false, status: 'confirmada', baseLegal: 'Lei Municipal 8.805/1999 (citada em calendário da Justiça Eleitoral)', fonte: `${VERIFICADO}: calendário de feriados da Justiça Eleitoral na Paraíba cita a Lei Municipal 8.805/1999; confirmar o texto no Diário Oficial do Município.`, descricao: 'Feriado religioso municipal; a data coincide com o aniversário da cidade.' },
  { id: 'imaculada-conceicao-jp', nome: L('Imaculada Conceição (João Pessoa)'), categoria: 'FERIADO_MUNICIPAL_JP', regra: { tipo: 'fixa', mes: 12, dia: 8 }, relevante: false, status: 'pendente', baseLegal: 'a confirmar', fonte: `${VERIFICADO}: fontes divergentes sobre a base legal (lista do MPF cita a Lei Municipal 13.768/2019, mas há dúvida sobre a norma atual). Validar no Diário Oficial do Município antes de usar como feriado.` },
  { id: 'sao-joao-jp', nome: L('São João (João Pessoa)'), categoria: 'FERIADO_MUNICIPAL_JP', regra: { tipo: 'fixa', mes: 6, dia: 24 }, relevante: false, status: 'pendente', baseLegal: 'a confirmar', fonte: `${VERIFICADO}: fontes de imprensa divergem (algumas citam João Pessoa e Campina Grande, sem base legal). Validar na Prefeitura de João Pessoa antes de usar como feriado.` },
  // ---- Datas educacionais ----
  { id: 'combate-ao-bullying', nome: L('Dia Nacional de Combate ao Bullying e à Violência na Escola'), categoria: 'EDUCACIONAL', regra: { tipo: 'fixa', mes: 4, dia: 7 }, relevante: false, status: 'confirmada', baseLegal: 'Lei 13.277/2016', fonte: `${VERIFICADO}: Lei 13.277, de 29/4/2016 (DOU 2/5/2016).` },
  { id: 'livro-infantil', nome: L('Dia Nacional do Livro Infantil'), categoria: 'EDUCACIONAL', regra: { tipo: 'fixa', mes: 4, dia: 18 }, relevante: true, status: 'confirmada', baseLegal: 'Lei 10.402/2002', fonte: `${VERIFICADO}: Lei 10.402, de 8/1/2002 (aniversário de Monteiro Lobato).` },
  { id: 'dia-do-estudante', nome: L('Dia do Estudante'), categoria: 'EDUCACIONAL', regra: { tipo: 'fixa', mes: 8, dia: 11 }, relevante: true, status: 'confirmada', baseLegal: 'sem lei federal localizada (data tradicional)', fonte: `${VERIFICADO}: data tradicional, ligada aos cursos jurídicos de 1827 e à comemoração iniciada em 1927; não foi localizada lei federal. Não é feriado.` },
  { id: 'dia-do-professor', nome: L('Dia do Professor'), categoria: 'EDUCACIONAL', regra: { tipo: 'fixa', mes: 10, dia: 15 }, relevante: true, status: 'confirmada', baseLegal: 'Decreto 52.682/1963', fonte: `${VERIFICADO}: Decreto 52.682, de 14/10/1963 (feriado escolar, não nacional).` },
  // ---- Datas culturais ----
  { id: 'dia-da-mulher', nome: L('Dia Internacional da Mulher'), categoria: 'CULTURAL', regra: { tipo: 'fixa', mes: 3, dia: 8 }, relevante: true, status: 'confirmada', baseLegal: 'ONU (1975)', fonte: `${VERIFICADO}: oficializado pela ONU em 1975 (Ano Internacional da Mulher).` },
  { id: 'dia-dos-povos-indigenas', nome: L('Dia dos Povos Indígenas'), categoria: 'CULTURAL', regra: { tipo: 'fixa', mes: 4, dia: 19 }, relevante: false, status: 'confirmada', baseLegal: 'Lei 14.402/2022', fonte: `${VERIFICADO}: Lei 14.402/2022 substituiu o Dia do Índio (Decreto-Lei 5.540/1943).` },
  { id: 'dia-das-maes', nome: L('Dia das Mães'), categoria: 'CULTURAL', regra: { tipo: 'nesimo', mes: 5, n: 2, diaSemana: 0 }, relevante: true, status: 'confirmada', baseLegal: 'Decreto 21.366/1932', fonte: `${VERIFICADO}: Decreto 21.366, de 5/5/1932; celebrado no 2º domingo de maio.` },
  { id: 'dia-dos-pais', nome: L('Dia dos Pais'), categoria: 'CULTURAL', regra: { tipo: 'nesimo', mes: 8, n: 2, diaSemana: 0 }, relevante: true, status: 'confirmada', baseLegal: 'sem lei localizada (convenção desde 1953)', fonte: `${VERIFICADO}: proposto em 1953 por Sylvio Bhering (jornal O Globo) e celebrado no 2º domingo de agosto; não foi localizada lei que fixe a data.` },
  { id: 'dia-do-folclore', nome: L('Dia do Folclore'), categoria: 'CULTURAL', regra: { tipo: 'fixa', mes: 8, dia: 22 }, relevante: false, status: 'confirmada', baseLegal: 'Decreto 56.747/1965', fonte: `${VERIFICADO}: Decreto 56.747, de 17/8/1965 (texto no Planalto).` },
  { id: 'dia-das-criancas', nome: L('Dia das Crianças'), categoria: 'CULTURAL', regra: { tipo: 'fixa', mes: 10, dia: 12 }, relevante: true, status: 'confirmada', baseLegal: 'Decreto 4.867/1924', fonte: `${VERIFICADO}: Decreto 4.867, de 5/11/1924 (festa da criança); popularizado a partir dos anos 1960.` },
  { id: 'carnaval-segunda', nome: L('Carnaval (segunda-feira) — ponto facultativo'), categoria: 'CULTURAL', regra: { tipo: 'pascoa', offset: -48 }, relevante: false, status: 'confirmada', baseLegal: 'Lei 5.010/1966, art. 62 (ponto facultativo)', fonte: `${VERIFICADO}: calendário do TRE-PB trata o Carnaval como ponto facultativo; não é feriado nacional.` },
  { id: 'carnaval-terca', nome: L('Carnaval (terça-feira) — ponto facultativo'), categoria: 'CULTURAL', regra: { tipo: 'pascoa', offset: -47 }, relevante: false, status: 'confirmada', baseLegal: 'Lei 5.010/1966, art. 62 (ponto facultativo)', fonte: `${VERIFICADO}: calendário do TRE-PB trata o Carnaval como ponto facultativo; não é feriado nacional.` },
  // ---- Datas religiosas ----
  { id: 'pascoa', nome: L('Domingo de Páscoa'), categoria: 'RELIGIOSA', regra: { tipo: 'pascoa', offset: 0 }, relevante: true, status: 'confirmada', baseLegal: 'cálculo da Páscoa (calendário gregoriano)', fonte: `${VERIFICADO}: algoritmo de Meeus/Jones/Butcher, testado contra as Páscoas de 2024 a 2030.` },
  { id: 'corpus-christi', nome: L('Corpus Christi — ponto facultativo'), categoria: 'RELIGIOSA', regra: { tipo: 'pascoa', offset: 60 }, relevante: false, status: 'confirmada', baseLegal: 'ponto facultativo (feriado só onde houver lei local)', fonte: `${VERIFICADO}: calendário do TRE-PB trata Corpus Christi como ponto facultativo. Páscoa + 60 dias.` },
  // ---- Datas ambientais ----
  { id: 'dia-da-agua', nome: L('Dia Mundial da Água'), categoria: 'AMBIENTAL', regra: { tipo: 'fixa', mes: 3, dia: 22 }, relevante: true, status: 'confirmada', baseLegal: 'ONU, Resolução A/RES/47/193 (1993)', fonte: `${VERIFICADO}: Resolução 47/193 da Assembleia Geral da ONU, de 21/2/1993.` },
  { id: 'dia-do-meio-ambiente', nome: L('Dia Mundial do Meio Ambiente'), categoria: 'AMBIENTAL', regra: { tipo: 'fixa', mes: 6, dia: 5 }, relevante: false, status: 'confirmada', baseLegal: 'ONU (1972)', fonte: `${VERIFICADO}: criado pela ONU em 1972, na abertura da Conferência de Estocolmo (5/6).` },
  { id: 'dia-da-arvore', nome: L('Dia da Árvore'), categoria: 'AMBIENTAL', regra: { tipo: 'fixa', mes: 9, dia: 21 }, relevante: false, status: 'confirmada', baseLegal: 'decreto federal de 1965 (número a conferir no Planalto)', fonte: `${VERIFICADO}: Festa Anual das Árvores instituída por decreto federal em 24/2/1965; data de 21/9 também prevista em lei paulista (Lei 3.401/1956). O número do decreto federal diverge entre fontes.` },
  // ---- Saúde e conscientização ----
  { id: 'dia-mundial-da-saude', nome: L('Dia Mundial da Saúde'), categoria: 'SAUDE', regra: { tipo: 'fixa', mes: 4, dia: 7 }, relevante: false, status: 'confirmada', baseLegal: 'OMS (1950)', fonte: `${VERIFICADO}: marca a fundação da OMS (7/4/1948); criado em 1950.` },
  { id: 'dia-do-autismo', nome: L('Dia Mundial de Conscientização do Autismo'), categoria: 'SAUDE', regra: { tipo: 'fixa', mes: 4, dia: 2 }, relevante: true, status: 'confirmada', baseLegal: 'ONU, Resolução A/RES/62/139 (2007)', fonte: `${VERIFICADO}: Resolução 62/139 da Assembleia Geral da ONU, de 18/12/2007, a partir de 2008.` },
  { id: 'dia-da-saude-mental', nome: L('Dia Mundial da Saúde Mental'), categoria: 'SAUDE', regra: { tipo: 'fixa', mes: 10, dia: 10 }, relevante: false, status: 'confirmada', baseLegal: 'Federação Mundial de Saúde Mental (1992), apoio da OMS', fonte: `${VERIFICADO}: criado em 1992 pela Federação Mundial de Saúde Mental, com apoio da OMS.` },
  { id: 'setembro-amarelo', nome: L('Setembro Amarelo'), categoria: 'SAUDE', regra: { tipo: 'mes', mes: 9 }, relevante: true, status: 'confirmada', baseLegal: 'campanha (CVV, CFM e ABP, desde 2015 no Brasil)', fonte: `${VERIFICADO}: campanha de prevenção ao suicídio iniciada no Brasil em 2015 por CVV, CFM e ABP; não foi localizada lei federal específica.` },
  { id: 'outubro-rosa', nome: L('Outubro Rosa'), categoria: 'SAUDE', regra: { tipo: 'mes', mes: 10 }, relevante: false, status: 'confirmada', baseLegal: 'Lei 13.733/2018', fonte: `${VERIFICADO}: Lei 13.733, de 16/11/2018 (atividades anuais em outubro sobre o câncer de mama).` },
  { id: 'novembro-azul', nome: L('Novembro Azul'), categoria: 'SAUDE', regra: { tipo: 'mes', mes: 11 }, relevante: false, status: 'confirmada', baseLegal: 'campanha (Instituto Lado a Lado pela Vida, 2008)', fonte: `${VERIFICADO}: campanha de saúde do homem criada no Brasil em 2008; não foi localizada lei federal específica.` },
];
export const CATALOGO_POR_ID = new Map(CATALOGO.map((c) => [c.id, c]));
