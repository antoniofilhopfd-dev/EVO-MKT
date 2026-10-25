import { Ctx } from './ctx';
import { chaveSegmento, PERFIS, SEGMENTOS } from './segmentos';
import { addDays, fail, fmtDate, parseLocal, Row, strv } from './util';
import { FORMATOS } from './conteudo';

/** Filtros globais do Marketing (período, perfil, segmento, formato, campanha editorial), validados no servidor. */
export interface Filtros { de: string; ate: string; dias: number; perfil: string; segmento: string; formato: string; campanha: string }

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const diasEntre = (de: string, ate: string) => Math.round((parseLocal(`${ate}T12:00:00`).getTime() - parseLocal(`${de}T12:00:00`).getTime()) / 86400000) + 1;

export function lerFiltros(c: Ctx): Filtros {
  const hoje = fmtDate(new Date());
  let de = c.qs('de'), ate = c.qs('ate');
  if (!ISO.test(de) || !ISO.test(ate)) { ate = hoje; de = fmtDate(addDays(parseLocal(hoje + 'T12:00:00'), -29)); }
  if (de > ate) fail(400, 'Período inválido: a data inicial vem depois da final.');
  const dias = diasEntre(de, ate);
  if (dias > 400) fail(400, 'Período acima de 400 dias.');
  const perfil = c.qs('perfil');
  if (perfil && perfil !== 'Todos' && !PERFIS.includes(perfil)) fail(400, 'Perfil inválido.');
  const segmento = c.qs('segmento');
  if (segmento && segmento !== 'TODOS' && !SEGMENTOS.some((s) => s[0] === segmento)) fail(400, 'Segmento inválido.');
  const formato = c.qs('formato');
  if (formato && !FORMATOS.includes(formato)) fail(400, 'Formato inválido.');
  const campanha = c.qs('campanha');
  if (campanha && !/^[A-Za-z0-9._-]{1,40}$/.test(campanha)) fail(400, 'Campanha inválida.');
  return { de, ate, dias, perfil: perfil === 'Todos' ? '' : perfil, segmento: segmento === 'TODOS' ? '' : segmento, formato, campanha };
}

/** A publicação cabe nos filtros de perfil, segmento, formato e campanha? (o período é tratado por quem chama.) */
export function conteudoCabe(r: Row, f: Filtros): boolean {
  if (f.perfil && !['Ambos', f.perfil].includes(strv(r.perfil))) return false;
  if (f.segmento) { const k = chaveSegmento(strv(r.segmento)); if (k !== f.segmento && k !== 'TODOS') return false; }
  if (f.formato && strv(r.formato).toLowerCase() !== f.formato.toLowerCase()) return false;
  if (f.campanha && strv(r.campanhaId) !== f.campanha) return false;
  return true;
}

/** Os filtros que a fonte NÃO consegue aplicar (ex.: a Meta não conhece segmento de uma publicação). */
export const filtrosSemEfeito = (f: Filtros, aplica: ('perfil' | 'segmento' | 'formato' | 'campanha')[]) => (['perfil', 'segmento', 'formato', 'campanha'] as const).filter((k) => f[k] && !aplica.includes(k));
