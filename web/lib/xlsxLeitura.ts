import { strFromU8, unzipSync } from 'fflate';

/** Lê a primeira planilha de um .xlsx e devolve as linhas como texto. Só leitura: nada é gravado nem executado. */
export function lerXlsx(buf: Uint8Array): string[][] {
  let z: Record<string, Uint8Array>;
  try {
    z = unzipSync(buf, { filter: (f) => /^xl\/(sharedStrings\.xml|worksheets\/sheet\d+\.xml)$/.test(f.name) && f.originalSize < 20_000_000 });
  } catch {
    throw new Error('Não foi possível abrir a planilha. Salve como .xlsx ou .csv e tente de novo.');
  }
  const decode = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, '&');
  const compartilhadas: string[] = [];
  if (z['xl/sharedStrings.xml']) {
    for (const si of strFromU8(z['xl/sharedStrings.xml']).match(/<si[\s\S]*?<\/si>/g) ?? []) compartilhadas.push(decode((si.match(/<t[^>]*>([\s\S]*?)<\/t>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, '')).join('')));
  }
  const nome = Object.keys(z).filter((k) => k.startsWith('xl/worksheets/')).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))[0];
  if (!nome) throw new Error('A planilha não tem nenhuma aba com dados.');
  const col = (ref: string) => { let n = 0; for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
  const linhas: string[][] = [];
  for (const lm of strFromU8(z[nome]).match(/<row[\s\S]*?<\/row>/g) ?? []) {
    const linha: string[] = [];
    for (const cm of lm.match(/<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g) ?? []) {
      const ref = /\br="([A-Z]+\d+)"/.exec(cm)?.[1]; if (!ref) continue;
      const tipo = /\bt="(\w+)"/.exec(cm)?.[1] ?? '';
      let v = '';
      if (tipo === 's') v = compartilhadas[+(/<v>(\d+)<\/v>/.exec(cm)?.[1] ?? -1)] ?? '';
      else if (tipo === 'inlineStr') v = decode((cm.match(/<t[^>]*>([\s\S]*?)<\/t>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, '')).join(''));
      else v = decode(/<v>([\s\S]*?)<\/v>/.exec(cm)?.[1] ?? '');
      linha[col(ref)] = v.trim();
    }
    if (linha.some((x) => x)) linhas.push(Array.from(linha, (x) => x ?? ''));
    if (linhas.length > 5000) throw new Error('A planilha tem linhas demais (máximo 5.000).');
  }
  return linhas;
}
