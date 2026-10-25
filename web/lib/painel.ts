import { q } from './db';
import { Filtros, conteudoCabe, filtrosSemEfeito } from './filtros';
import { listRows } from './records';
import { addDays, fmtDate, parseLocal, Row, strv } from './util';
import { contasMonitoradas, MetaConta } from './integrations/meta';

/**
 * Dados orgânicos do Instagram já sincronizados (nada de chamadas à Meta aqui), com os filtros globais aplicados.
 * Um filtro que a fonte não consegue aplicar nunca é ignorado em silêncio: volta em `semEfeito`/`vinculadas`.
 */
export const formatoDoPost = (tipo: unknown): string => {
  const t = strv(tipo).toUpperCase();
  return t === 'REELS' ? 'Reels' : t === 'STORY' ? 'Stories' : t === 'CAROUSEL_ALBUM' ? 'Carrossel' : t === 'VIDEO' ? 'Vídeo' : 'Feed';
};
const FMT_DIA_BR = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Fortaleza', year: 'numeric', month: '2-digit', day: '2-digit' });
/** Dia (America/Fortaleza) de um horário da Meta (ex.: 2026-09-01T02:00:00+0000 é 31/08 em Fortaleza). */
export function diaLocal(iso: unknown): string {
  const t = strv(iso), d = new Date(t.replace(/([+-]\d\d)(\d\d)$/, '$1:$2'));
  return isNaN(d.getTime()) ? t.slice(0, 10) : FMT_DIA_BR.format(d);
}
const semArroba = (s: string) => s.replace(/^@/, '').replace(/[._]/g, '').toLowerCase();

export async function contasDoPerfil(perfil: string): Promise<MetaConta[]> {
  const todas = await contasMonitoradas().catch(() => []);
  return perfil ? todas.filter((c) => semArroba(c.usuario) === semArroba(perfil)) : todas;
}

export interface PostFiltrado extends Row { media_id: string; conta: string; publicado_em: string; tipo: string; formato: string; interacoes: number; conteudo?: Row }
export interface Organico { posts: PostFiltrado[]; contas: MetaConta[]; vinculadas: boolean; semEfeito: string[]; todos: PostFiltrado[] }

export async function organico(f: Filtros): Promise<Organico> {
  const contas = await contasDoPerfil(f.perfil);
  const ids = contas.map((c) => c.ig);
  if (!ids.length) return { posts: [], contas, vinculadas: !!(f.segmento || f.campanha), semEfeito: [], todos: [] };
  const rows = (await q(`SELECT conta,media_id,publicado_em,tipo,legenda,curtidas,comentarios,salvos,compartilhamentos,alcance,visualizacoes,seguidores_novos,permalink,miniatura FROM ig_posts WHERE conta IN (${ids.map(() => '?').join(',')}) AND SUBSTR(publicado_em,1,10)>=? AND SUBSTR(publicado_em,1,10)<=? ORDER BY publicado_em DESC`, [...ids, fmtDate(addDays(parseLocal(f.de + 'T12:00:00'), -1)), fmtDate(addDays(parseLocal(f.ate + 'T12:00:00'), 1))]))
    .filter((p) => { const d = diaLocal(p.publicado_em); return d >= f.de && d <= f.ate; });
  const conteudos = await listRows('conteudos');
  const porMidia = new Map(conteudos.filter((r) => strv(r.instagramMediaId)).map((r) => [strv(r.instagramMediaId), r]));
  let todos: PostFiltrado[] = rows.map((p) => ({ ...p, media_id: strv(p.media_id), conta: strv(p.conta), publicado_em: strv(p.publicado_em), tipo: strv(p.tipo), formato: formatoDoPost(p.tipo), interacoes: Number(p.curtidas) + Number(p.comentarios) + Number(p.salvos) + Number(p.compartilhamentos), conteudo: porMidia.get(strv(p.media_id)) }));
  const vinculadas = !!(f.segmento || f.campanha);
  let posts = todos;
  if (f.formato) posts = posts.filter((p) => p.formato.toLowerCase() === f.formato.toLowerCase());
  if (vinculadas) posts = posts.filter((p) => p.conteudo && conteudoCabe(p.conteudo, { ...f, perfil: '', formato: '' }));
  return { posts, contas, vinculadas, semEfeito: filtrosSemEfeito(f, ['perfil', 'formato', 'segmento', 'campanha']), todos };
}

const soma = (xs: PostFiltrado[], k: string) => xs.reduce((s, p) => s + (Number(p[k]) || 0), 0);
const algum = (xs: PostFiltrado[], k: string) => xs.some((p) => p[k] !== null && p[k] !== undefined);
export function resumoOrganico(o: Organico): Row {
  const p = o.posts;
  return {
    publicacoes: p.length, interacoes: p.length ? soma(p, 'interacoes') : null,
    alcance: algum(p, 'alcance') ? soma(p, 'alcance') : null, visualizacoes: algum(p, 'visualizacoes') ? soma(p, 'visualizacoes') : null,
    seguidoresGerados: algum(p, 'seguidores_novos') ? soma(p, 'seguidores_novos') : null,
    curtidas: p.length ? soma(p, 'curtidas') : null, comentarios: p.length ? soma(p, 'comentarios') : null, salvamentos: algum(p, 'salvos') ? soma(p, 'salvos') : null, compartilhamentos: algum(p, 'compartilhamentos') ? soma(p, 'compartilhamentos') : null,
    somenteVinculadas: o.vinculadas,
  };
}
export const melhorPost = (o: Organico): Row | null => {
  const m = [...o.posts].sort((a, b) => b.interacoes - a.interacoes)[0];
  return m ? { id: m.media_id, legenda: strv(m.legenda).slice(0, 110), interacoes: m.interacoes, alcance: m.alcance ?? null, formato: m.formato, miniatura: strv(m.miniatura), link: strv(m.permalink), quando: m.publicado_em, tituloConteudo: m.conteudo ? strv(m.conteudo.titulo) : '' } : null;
};
