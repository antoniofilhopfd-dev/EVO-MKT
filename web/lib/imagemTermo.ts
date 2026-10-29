import { createHash } from 'node:crypto';

/** Texto do termo de uso de imagem: montagem a partir do modelo, prazo e hash. Funções puras (sem banco, sem rede). */
export const CANAIS = ['Instagram', 'Facebook', 'Site', 'YouTube', 'Materiais impressos', 'Eventos e telões', 'Imprensa e parceiros', 'Tráfego pago (anúncios)'];
export const PERIODOS = ['INDETERMINADO', 'ATE_DATA', 'MESES'];
export const PLACEHOLDERS = ['responsavel', 'aluno', 'matricula', 'turma', 'ano', 'cpf', 'data', 'colegio', 'finalidade', 'canais', 'local', 'prazo', 'observacoes', 'decisao'];
/** Espaços em branco do termo impresso. No PDF assinado, cada um é trocado pelo dado real (nome, CPF, data). */
export const BRANCO_RESP = '_'.repeat(24), BRANCO_CPF = '_'.repeat(19);
export const brancoData = (ano: string) => `____ de ________________ de ${ano}`;
export const cpfValido = (v: string): boolean => {
  const d = String(v).replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (n: number) => { let s = 0; for (let i = 0; i < n; i++) s += +d[i] * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return dv(9) === +d[9] && dv(10) === +d[10];
};
export const cpfFormatado = (v: string) => String(v).replace(/\D/g, '').replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
export const cpfMascarado = (v: string) => (String(v).replace(/\D/g, '').length === 11 ? `***.${String(v).replace(/\D/g, '').slice(3, 6)}.${String(v).replace(/\D/g, '').slice(6, 9)}-**` : '');

export interface ModeloTermo { corpo: string; finalidade: string; canais: string; local_uso: string; periodo_tipo: string; periodo_valor: string; observacoes: string }
export interface DadosTermo { aluno: string; matricula: string; turma: string; responsavel: string }

const dmy = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso);

/** Frase do prazo, igual no texto, no PDF e na prévia. */
export function textoPrazo(tipo: string, valor: string): string {
  if (tipo === 'ATE_DATA' && /^\d{4}-\d{2}-\d{2}$/.test(valor)) return `até ${dmy(valor)}`;
  if (tipo === 'MESES' && /^\d{1,3}$/.test(valor) && +valor > 0) return `${+valor} ${+valor === 1 ? 'mês' : 'meses'}, contados da data da assinatura`;
  return 'prazo indeterminado, até que seja revogada';
}

/** Monta o texto final. `decisao` é "AUTORIZO" no termo para assinatura; marcadores desconhecidos somem. */
export function montarTermo(m: ModeloTermo, d: DadosTermo, colegio = 'Colégio Evolução', ano = String(new Date().getFullYear())): string {
  const obs = m.observacoes.trim() ? `Observações: ${m.observacoes.trim()}\n\n` : '';
  const vals: Record<string, string> = {
    responsavel: d.responsavel.trim() || BRANCO_RESP, ano, cpf: BRANCO_CPF, data: brancoData(ano), aluno: d.aluno, matricula: d.matricula, turma: d.turma || '-', colegio,
    finalidade: m.finalidade.trim() || '-', canais: m.canais.trim() || '-', local: m.local_uso.trim() || '-', prazo: textoPrazo(m.periodo_tipo, m.periodo_valor), observacoes: obs, decisao: 'AUTORIZO',
  };
  return m.corpo.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => vals[k] ?? '').replace(/\n{3,}/g, '\n\n').trim();
}

export const hashTexto = (t: string): string => createHash('sha256').update(t, 'utf8').digest('hex');

/** Confere os campos de um modelo; devolve o erro em português ou os campos já limpos. */
export function validaModelo(b: Record<string, unknown>): { erro: string } | { m: ModeloTermo & { nome: string; tipo: string } } {
  const s = (v: unknown, n: number) => String(v ?? '').replace(/\r/g, '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, n);
  const nome = s(b.nome, 120), corpo = s(b.corpo, 8000), tipo = ['PADRAO', 'EVENTO', 'PERSONALIZADO'].includes(String(b.tipo)) ? String(b.tipo) : 'PADRAO';
  if (!nome) return { erro: 'Dê um nome ao modelo.' };
  if (corpo.length < 40) return { erro: 'O texto do termo está curto demais.' };
  if (!/\{\{\s*aluno\s*\}\}/.test(corpo)) return { erro: 'O texto precisa citar o aluno com {{aluno}}.' };
  const finalidade = s(b.finalidade, 1000);
  if (!finalidade) return { erro: 'Informe a finalidade do uso da imagem (explícita e específica).' };
  const canais = (Array.isArray(b.canais) ? b.canais : String(b.canais ?? '').split(',')).map((x) => s(x, 60)).filter(Boolean).join(', ').slice(0, 500);
  if (!canais) return { erro: 'Escolha ao menos um canal de divulgação.' };
  const periodo_tipo = PERIODOS.includes(String(b.periodo_tipo)) ? String(b.periodo_tipo) : 'INDETERMINADO';
  let periodo_valor = s(b.periodo_valor, 12);
  if (periodo_tipo === 'ATE_DATA' && !/^\d{4}-\d{2}-\d{2}$/.test(periodo_valor)) return { erro: 'Informe a data final do prazo.' };
  if (periodo_tipo === 'MESES' && !(/^\d{1,3}$/.test(periodo_valor) && +periodo_valor > 0)) return { erro: 'Informe a quantidade de meses do prazo.' };
  if (periodo_tipo === 'INDETERMINADO') periodo_valor = '';
  return { m: { nome, tipo, corpo, finalidade, canais, local_uso: s(b.local_uso, 200), periodo_tipo, periodo_valor, observacoes: s(b.observacoes, 1000) } };
}
