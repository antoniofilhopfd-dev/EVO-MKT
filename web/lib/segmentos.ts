/** Catálogo único de segmentos e perfis do Marketing (fonte para filtros, calendário, conteúdos e Tráfego). */
export const SEGMENTOS: [string, string][] = [
  ['INFANTIL', 'Educação Infantil'],
  ['FUND1', 'Ensino Fundamental – Anos Iniciais'],
  ['FUND2', 'Ensino Fundamental – Anos Finais'],
  ['MEDIO', 'Ensino Médio'],
  ['ADMIN', 'Administrativo'],
  ['DIRECAO', 'Direção'],
  ['TODOS', 'Todos'],
];
export const PERFIS = ['@evolucaopb', '@geracaoevolucao'];
export const rotuloSegmento = (k: string) => SEGMENTOS.find((s) => s[0] === k)?.[1] ?? k;
/** Valores antigos (texto livre) → chave do catálogo. */
export function chaveSegmento(v: string): string {
  const t = String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  if (!t) return '';
  if (/^(todos|toda a escola|geral|ambos)$/.test(t)) return 'TODOS';
  if (/infantil|maternal|jardim/.test(t)) return 'INFANTIL';
  if (/iniciais|fundamental i\b|1o ao 5o|fund1|^ano1$/.test(t)) return 'FUND1';
  if (/finais|fundamental ii|6o ao 9o|fund2/.test(t)) return 'FUND2';
  if (/medio/.test(t)) return 'MEDIO';
  if (/admin/.test(t)) return 'ADMIN';
  if (/direcao/.test(t)) return 'DIRECAO';
  return '';
}
