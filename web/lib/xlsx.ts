import { unzipSync, strFromU8 } from 'fflate';
import { run, q1, withTx } from './db';
import { audit, mergeHeaders, MODULES } from './records';
import { now, Row } from './util';

const ent = (s: string) =>
  s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const textOf = (xml: string) => [...xml.matchAll(/<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g)].map((m) => ent(m[1])).join('');

/** Leitor mínimo de XLSX (primeira planilha). Devolve [cabeçalhos, linhas]. */
export function readXlsx(buf: Uint8Array): [string[], Row[]] {
  const z = unzipSync(buf);
  const shared: string[] = [];
  if (z['xl/sharedStrings.xml']) {
    for (const m of strFromU8(z['xl/sharedStrings.xml']).matchAll(/<(?:\w+:)?si\b[^>]*>([\s\S]*?)<\/(?:\w+:)?si>/g)) shared.push(textOf(m[1]));
  }
  const sheet = z['xl/worksheets/sheet1.xml'];
  if (!sheet) throw new Error('Planilha 1 ausente.');
  const rows: Record<number, string>[] = [];
  for (const r of strFromU8(sheet).matchAll(/<(?:\w+:)?row\b[^>]*>([\s\S]*?)<\/(?:\w+:)?row>/g)) {
    const line: Record<number, string> = {};
    for (const c of r[1].matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)) {
      const attrs = c[1];
      const ref = attrs.match(/\br="([A-Z]+)\d*"/)?.[1] ?? 'A';
      let col = 0;
      for (const ch of ref) col = col * 26 + (ch.charCodeAt(0) - 64);
      col--;
      const t = attrs.match(/\bt="(\w+)"/)?.[1] ?? '';
      const inner = c[2] ?? '';
      const v = inner.match(/<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/)?.[1] ?? '';
      line[col] = t === 's' ? shared[+v] ?? '' : t === 'inlineStr' ? textOf(inner) : ent(v);
    }
    rows.push(line);
  }
  if (!rows.length) return [[], []];
  const hdr: Record<number, string> = {};
  for (const [i, h] of Object.entries(rows[0])) if (h.trim() !== '') hdr[+i] = h.trim();
  const out: Row[] = [];
  for (const line of rows.slice(1)) {
    const rec: Row = {};
    for (const [i, h] of Object.entries(hdr)) rec[h] = String(line[+i] ?? '').trim();
    if (Object.values(rec).some((v) => v !== '')) out.push(rec);
  }
  return [Object.values(hdr), out];
}

/** Importa uma planilha de um módulo preservando os IDs; nunca reutiliza IDs já usados. Devolve quantas linhas entraram. */
export async function importModule(mod: string, buf: Uint8Array, ator: string): Promise<number> {
  if (!(mod in MODULES)) throw new Error('Módulo desconhecido: ' + mod);
  const [hdr, rows] = readXlsx(buf);
  if (hdr.length) await mergeHeaders(mod, hdr);
  let max = 0, n = 0;
  await withTx(async (c) => {
    for (const r of rows) {
      const id = String(r.id ?? '').trim();
      if (!id) continue;
      const [used] = await c.query('SELECT 1 FROM used_ids WHERE id=?', [id]);
      if ((used as Row[]).length) continue;
      const t = r.criadoEm || now();
      await c.query('INSERT INTO used_ids(id) VALUES(?)', [id]);
      await c.query('INSERT INTO records(modulo,id,data,criado_em,atualizado_em) VALUES(?,?,?,?,?)', [mod, id, JSON.stringify(r), t, r.atualizadoEm || t]);
      const m = id.match(/(\d+)$/);
      if (m) max = Math.max(max, +m[1]);
      n++;
    }
    if (n) {
      const [cur] = await c.query('SELECT n FROM id_counters WHERE modulo=? FOR UPDATE', [mod]);
      const have = (cur as Row[])[0] ? Number((cur as Row[])[0].n) : 0;
      if ((cur as Row[])[0]) await c.query('UPDATE id_counters SET n=? WHERE modulo=?', [Math.max(have, max), mod]);
      else await c.query('INSERT INTO id_counters(modulo,n) VALUES(?,?)', [mod, max]);
    }
  });
  await audit(ator, 'importar-xlsx', mod, String(n));
  return n;
}
export { run, q1 };
