import { chaveSegmento } from './segmentos';
import { now, Row, strv } from './util';

/**
 * Regras de uma publicação (módulo `conteudos`), em um lugar só:
 * fluxo, o que falta, materiais (referência, produção, final, miniatura) com versões e versões do texto.
 */
export const ETAPAS = ['IDEIA', 'RASCUNHO', 'EM PRODUÇÃO', 'EM REVISÃO', 'APROVADO', 'AGENDADO', 'PUBLICADO'] as const;
export const STATUS_VALIDOS: string[] = [...ETAPAS, 'ARQUIVADO'];
export const FORMATOS = ['Feed', 'Stories', 'Reels', 'Carrossel', 'Vídeo', 'Foto', 'Outro'];
export const PAPEIS: Record<string, string> = { referencia: 'Referência', producao: 'Arquivo em produção', final: 'Arquivo final', miniatura: 'Miniatura' };

/** Status de versões anteriores do sistema → fluxo atual. */
const LEGADO: Record<string, string> = { BRIEFING: 'RASCUNHO', 'PRODUÇÃO': 'EM PRODUÇÃO', 'REVISÃO': 'EM REVISÃO', PROGRAMADO: 'AGENDADO' };
export const statusAtual = (s: unknown) => { const t = strv(s).trim().toUpperCase(); return LEGADO[t] ?? t; };

/** Mudanças de status feitas pela edição comum. Aprovar, agendar e publicar têm rota própria (cada uma confere seus requisitos). */
const SO_POR_ROTA = ['APROVADO', 'AGENDADO', 'PUBLICADO'];
export function validarStatusPorEdicao(de: string, para: string): string | null {
  const a = statusAtual(de), p = statusAtual(para);
  if (!STATUS_VALIDOS.includes(p)) return `Status inválido: ${para}.`;
  if (a === p) return null;
  if (SO_POR_ROTA.includes(p)) return p === 'APROVADO' ? 'Para aprovar, use a decisão de revisão (Aprovar).' : p === 'AGENDADO' ? 'Para agendar, use o botão Agendar (o conteúdo precisa estar aprovado).' : 'Para marcar como publicado, use Confirmar publicação.';
  if (a === 'PUBLICADO') return 'Uma publicação já publicada não volta no fluxo. Duplique-a para criar uma nova.';
  return null;
}

export const materiaisDe = (r: Row): Row[] => (Array.isArray(r.materiais) ? (r.materiais as Row[]) : []);
export const materiaisAtivos = (r: Row, papel?: string) => materiaisDe(r).filter((m) => !m.substituido && (!papel || m.papel === papel));

export interface Pendencia { chave: string; texto: string }
/** O que ainda falta para a publicação poder sair (só para quem ainda não foi publicado). */
export function pendencias(r: Row): Pendencia[] {
  const st = statusAtual(r.status);
  if (st === 'PUBLICADO' || st === 'ARQUIVADO') return [];
  const out: Pendencia[] = [];
  if (!strv(r.legenda).trim()) out.push({ chave: 'legenda', texto: 'Falta a legenda' });
  if (!strv(r.publicacaoEm).trim()) out.push({ chave: 'data', texto: 'Falta a data de publicação' });
  if (!materiaisAtivos(r, 'final').length && !strv(r.midiaInstagram).trim()) out.push({ chave: 'arte', texto: 'Falta a arte final' });
  if (!strv(r.perfil).trim()) out.push({ chave: 'perfil', texto: 'Falta o perfil' });
  if (!strv(r.formato).trim()) out.push({ chave: 'formato', texto: 'Falta o formato' });
  if (!strv(r.responsavel).trim()) out.push({ chave: 'responsavel', texto: 'Falta o responsável' });
  return out;
}

/** O que a publicação precisa para ser agendada (mais rígido que `pendencias`). */
export function requisitosDeAgendamento(r: Row): string[] {
  const falta: string[] = [];
  if (!strv(r.titulo).trim()) falta.push('título');
  if (!strv(r.legenda).trim()) falta.push('legenda');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(strv(r.publicacaoEm))) falta.push('data e horário de publicação');
  if (!materiaisAtivos(r, 'final').length && !strv(r.midiaInstagram).trim()) falta.push('arte final');
  if (!strv(r.perfil).trim()) falta.push('perfil');
  if (!strv(r.formato).trim()) falta.push('formato');
  if (strv(r.publicarInstagram) === 'SIM' && !strv(r.midiaInstagram).trim() && (Array.isArray(r.materiais) ? materiaisAtivos(r, 'final').length > 0 : true)) falta.push('arte final em JPEG ou vídeo MP4/MOV (o Instagram não publica PNG nem PDF)');
  return falta;
}

/** Mantém `midiaInstagram`/`midiasInstagram` (o que o publicador do Instagram lê) iguais aos materiais finais que são arquivos. */
export function sincronizarMidia(r: Row): void {
  const finais = materiaisAtivos(r, 'final').filter((m) => m.tipo === 'arquivo' && /\.(jpe?g|mp4|mov)$/i.test(strv(m.caminho))).map((m) => strv(m.caminho));
  if (!finais.length) { if (Array.isArray(r.materiais)) { r.midiaInstagram = ''; r.midiasInstagram = ''; } return; }
  r.midiaInstagram = finais[0];
  r.midiasInstagram = JSON.stringify(finais);
}

const ehDrive = (u: string) => /^https:\/\/(drive|docs)\.google\.com\//i.test(u);
export const urlPermitida = (u: string) => /^https:\/\/[^\s]{4,800}$/.test(u);
export const tipoDeLink = (u: string) => (ehDrive(u) ? 'drive' : 'link');

/** Acrescenta um material; se `grupo` já existe, é uma nova versão e a anterior fica guardada como substituída. */
export function adicionarMaterial(r: Row, m: { papel: string; tipo: string; nome: string; caminho?: string; url?: string; grupo?: string; mime?: string; tamanho?: number }, ator: string): Row {
  const lista = materiaisDe(r).map((x) => ({ ...x }));
  const grupo = m.grupo || `${m.papel}:${lista.length + 1}`;
  const doGrupo = lista.filter((x) => x.grupo === grupo);
  const versao = doGrupo.reduce((n, x) => Math.max(n, Number(x.versao) || 1), 0) + 1;
  for (const x of doGrupo) x.substituido = true;
  const id = 'M-' + String(lista.reduce((n, x) => Math.max(n, Number(String(x.id ?? '').slice(2)) || 0), 0) + 1).padStart(4, '0');
  const novo: Row = { id, papel: m.papel, tipo: m.tipo, nome: m.nome.slice(0, 160), ...(m.caminho ? { caminho: m.caminho } : {}), ...(m.url ? { url: m.url } : {}), ...(m.mime ? { mime: m.mime } : {}), ...(m.tamanho ? { tamanho: m.tamanho } : {}), versao, grupo, substituido: false, criadoEm: now(), criadoPor: ator };
  r.materiais = [...lista, novo];
  sincronizarMidia(r);
  return novo;
}

/** Guarda uma versão do texto (título, legenda, hashtags, CTA) sempre que ele muda; no máximo 50. */
export function registrarVersaoTexto(antes: Row, depois: Row, ator: string): void {
  const campos = ['titulo', 'legenda', 'hashtags', 'cta'];
  const mudou = campos.some((c) => strv(antes[c]) !== strv(depois[c]));
  if (!mudou) return;
  const lista: Row[] = Array.isArray(antes.versoes) ? (antes.versoes as Row[]) : [];
  if (!lista.length && campos.some((c) => strv(antes[c]).trim())) lista.push({ n: 1, quando: strv(antes.criadoEm) || now(), autor: strv(antes.criadoPor), titulo: strv(antes.titulo), legenda: strv(antes.legenda), hashtags: strv(antes.hashtags), cta: strv(antes.cta) });
  const n = (lista[lista.length - 1]?.n as number || 0) + 1;
  lista.push({ n, quando: now(), autor: ator, titulo: strv(depois.titulo), legenda: strv(depois.legenda), hashtags: strv(depois.hashtags), cta: strv(depois.cta) });
  depois.versoes = lista.slice(-50);
}

/** Segmentos antigos (texto livre) viram o nome do catálogo único. */
export const segmentoNormalizado = (v: unknown): string => {
  const k = chaveSegmento(strv(v));
  return k ? ({ INFANTIL: 'Educação Infantil', FUND1: 'Ensino Fundamental – Anos Iniciais', FUND2: 'Ensino Fundamental – Anos Finais', MEDIO: 'Ensino Médio', ADMIN: 'Administrativo', DIRECAO: 'Direção', TODOS: 'Todos' } as Record<string, string>)[k] : strv(v);
};

/** Copia uma publicação para uma nova (duplicar ou adaptar): zera o que é da publicação anterior. */
export function copiaParaNova(r: Row, extra: Row): Row {
  const c: Row = { ...r };
  for (const k of ['id', 'criadoEm', 'atualizadoEm', 'criadoPor', 'atualizadoPor', 'instagramMediaId', 'instagramLink', 'linkPublicacao', 'publicadoConfirmadoEm', 'publicadoConfirmadoPor', 'aprovacaoDecisao', 'aprovadoPor', 'aprovadoEm', 'versaoAprovada', 'aprovacaoComentario', 'versoes', 'publicacaoEm'])
    delete c[k];
  c.status = 'RASCUNHO';
  c.materiais = materiaisDe(r).filter((m) => !m.substituido && m.papel !== 'final' && m.papel !== 'miniatura').map((m, i) => ({ ...m, id: 'M-' + String(i + 1).padStart(4, '0'), criadoEm: now() }));
  sincronizarMidia(c);
  return { ...c, ...extra };
}
