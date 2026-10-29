import { createHash } from 'node:crypto';

/** Texto do termo de uso de imagem: montagem a partir do modelo, prazo e hash. Funções puras (sem banco, sem rede). */
export const CANAIS = ['Instagram', 'Facebook', 'Site', 'YouTube', 'Materiais impressos', 'Eventos e telões', 'Imprensa e parceiros', 'Tráfego pago (anúncios)'];
export const PERIODOS = ['INDETERMINADO', 'ATE_DATA', 'MESES'];
export const PLACEHOLDERS = ['responsavel', 'aluno', 'matricula', 'turma', 'colegio', 'finalidade', 'canais', 'local', 'prazo', 'observacoes', 'decisao'];

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
export function montarTermo(m: ModeloTermo, d: DadosTermo, colegio = 'Colégio Evolução'): string {
  const obs = m.observacoes.trim() ? `Observações: ${m.observacoes.trim()}\n\n` : '';
  const vals: Record<string, string> = {
    responsavel: d.responsavel.trim() || '________________________', aluno: d.aluno, matricula: d.matricula, turma: d.turma || '-', colegio,
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
