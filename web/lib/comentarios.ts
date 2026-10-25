import { q, q1, run } from './db';
import { fail, now, Row } from './util';

/** Comentários internos e checklist dos registros (Conteúdos, Ideias, Campanhas editoriais). */
export async function comentarios(mod: string, id: string): Promise<Row[]> {
  return q('SELECT id,autor,autor_tipo,quando,texto,interno FROM record_comments WHERE modulo=? AND registro=? ORDER BY id', [mod, id]);
}
export async function adicionarComentario(mod: string, id: string, autor: string, texto: string): Promise<void> {
  const t = texto.trim();
  if (t.length < 1) fail(400, 'Escreva o comentário.');
  if (t.length > 2000) fail(400, 'Comentário muito longo (máximo 2000 caracteres).');
  await run('INSERT INTO record_comments(modulo,registro,autor,autor_tipo,quando,texto,interno) VALUES(?,?,?,?,?,?,1)', [mod, id, autor.slice(0, 120), 'int', now(), t]);
}
export const checklist = (mod: string, id: string) => q('SELECT id,texto,feito,ordem FROM record_checklist WHERE modulo=? AND registro=? ORDER BY ordem,id', [mod, id]);
export async function checklistItem(id: number): Promise<Row | null> {
  return (await q1('SELECT * FROM record_checklist WHERE id=?', [id])) as Row | null;
}
export async function novaOrdemChecklist(mod: string, id: string): Promise<number> {
  return Number((await q1('SELECT COALESCE(MAX(ordem),0)+1 n FROM record_checklist WHERE modulo=? AND registro=?', [mod, id]))?.n ?? 1);
}
