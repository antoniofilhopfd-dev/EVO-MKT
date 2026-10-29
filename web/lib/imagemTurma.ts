/** Ordem escolar das turmas: Infantil 1 a 5, depois 1º a 9º Ano, depois 1ª a 3ª Série; dentro de cada uma, pela letra (A, B, C…). */
export function chaveTurma(turma: string): [number, number, string] {
  const t = String(turma ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[º°ª]/g, '').replace(/\s+/g, ' ').trim();
  const letra = /(?:^|[\s\-/])([a-z])$/.exec(t)?.[1] ?? '';
  let m = /infantil\s*(\d)/.exec(t) ?? /(\d)\s*infantil/.exec(t);
  if (m) return [0, +m[1], letra];
  m = /(\d{1,2})\s*(?:o\s*)?(?:ano|serie)\b/.exec(t) ?? /\b(?:ano|serie)\s*(\d{1,2})/.exec(t);
  if (m) return [/serie/.test(t) ? 2 : 1, +m[1], letra];
  return [9, 0, t];
}
export const compararTurma = (a: string, b: string): number => {
  const x = chaveTurma(a), y = chaveTurma(b);
  return x[0] - y[0] || x[1] - y[1] || x[2].localeCompare(y[2], 'pt-BR') || String(a).localeCompare(String(b), 'pt-BR');
};
