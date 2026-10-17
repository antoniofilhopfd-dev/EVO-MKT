import { q } from '../db';
import { notifyMail } from '../mail';
import { registrarNotificacao } from '../notificacoes';
import { setSetting, setting } from '../settings';
import { addDays, fmtDate, now, Row } from '../util';
import { metaConnected } from './meta';
import { publicUrl } from './http';
import { arvore, editarObjeto } from './metaadsGerenciador';
import { cfgGestao } from './metaadsGestao';
import { relatorioTrafego } from './metarelatorio';

/** Recursos opcionais de Tráfego: regras automáticas, relatório semanal por e-mail, matrículas (custo por matrícula) e rascunhos de campanha. Tudo desligado por padrão. */

// ---------- regras automáticas ----------
export interface Regras { ativa: boolean; acao: 'AVISAR' | 'PAUSAR'; gastoSemResultado: number; dias: number; custoMax: number }
export const REGRAS_PADRAO: Regras = { ativa: false, acao: 'AVISAR', gastoSemResultado: 30, dias: 3, custoMax: 0 };
export async function cfgRegras(): Promise<Regras> {
  let r: Partial<Regras> = {};
  try { r = JSON.parse((await setting('ads_regras')) || '{}'); } catch { /* inválido: padrão */ }
  const n = (v: unknown, d: number, min: number, max: number) => { const x = Number(v); return Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : d; };
  return { ativa: r.ativa === true, acao: r.acao === 'PAUSAR' ? 'PAUSAR' : 'AVISAR', gastoSemResultado: n(r.gastoSemResultado, REGRAS_PADRAO.gastoSemResultado, 0, 100000), dias: Math.floor(n(r.dias, REGRAS_PADRAO.dias, 1, 30)), custoMax: n(r.custoMax, 0, 0, 100000) };
}
export async function salvarRegras(b: Row): Promise<Regras> {
  const atual = await cfgRegras();
  const novo = { ...atual, ...(typeof b.ativa === 'boolean' ? { ativa: b.ativa } : {}), ...(b.acao ? { acao: b.acao } : {}), ...('gastoSemResultado' in b ? { gastoSemResultado: b.gastoSemResultado } : {}), ...('dias' in b ? { dias: b.dias } : {}), ...('custoMax' in b ? { custoMax: b.custoMax } : {}) };
  await setSetting('ads_regras', JSON.stringify(novo));
  return cfgRegras();
}

/** Avalia os anúncios ativos dos últimos N dias. Devolve o que encontrou/fez. `simular` só mostra, sem pausar nem avisar. */
export async function rodarRegras(simular = false): Promise<Row> {
  const cfg = await cfgRegras();
  if ((await setting('trafego_gestao')) !== '1') return { ativa: false, motivo: 'modo somente leitura' };
  if (!cfg.ativa && !simular) return { ativa: false };
  if (!(await metaConnected())) throw new Error('Instagram/Meta não conectado.');
  const ate = fmtDate(new Date()), de = fmtDate(addDays(new Date(), -(cfg.dias - 1)));
  const t = await arvore(de, ate, false);
  const achados: Row[] = [];
  const gestao = (await cfgGestao()).ativa;
  let avisados: Record<string, string> = {};
  try { avisados = JSON.parse((await setting('ads_regras_avisados')) || '{}'); } catch { /* recomeça */ }
  const hoje = fmtDate(new Date());
  for (const c of t.campanhas) for (const s of c.conjuntos) for (const a of s.anuncios) {
    if (a.status !== 'ACTIVE' || c.status !== 'ACTIVE' || s.status !== 'ACTIVE') continue;
    let motivo = '';
    if (cfg.gastoSemResultado > 0 && a.gasto >= cfg.gastoSemResultado && !(a.resultados > 0)) motivo = `gastou ${a.gasto.toFixed(2)} em ${cfg.dias} dia(s) sem nenhum resultado`;
    else if (cfg.custoMax > 0 && a.resultados > 0 && a.custoResultado > cfg.custoMax) motivo = `custo por resultado ${a.custoResultado.toFixed(2)} acima do limite de ${cfg.custoMax.toFixed(2)}`;
    if (!motivo) continue;
    const item: Row = { id: a.id, anuncio: a.nome, campanha: c.nome, motivo, acao: 'AVISAR' };
    if (!simular) {
      if (cfg.acao === 'PAUSAR' && gestao) {
        try { await editarObjeto('anuncio', a.id, { status: 'PAUSED' }, true, 'Regra automática'); item.acao = 'PAUSADO'; } catch (e: any) { item.acao = 'ERRO: ' + e.message; }
      }
      if (item.acao !== 'AVISAR' || avisados[a.id] !== hoje) {
        const msg = `${a.nome} (${c.nome}): ${motivo}.${item.acao === 'PAUSADO' ? ' O anúncio foi pausado pela regra automática.' : ''}`;
        await registrarNotificacao('ads_regra', 'gerencia', item.acao === 'PAUSADO' ? 'Anúncio pausado pela regra' : 'Anúncio pede atenção', msg, 'trafego', a.id);
        await notifyMail(item.acao === 'PAUSADO' ? 'Anúncio pausado por regra automática' : 'Anúncio pede atenção', msg);
        avisados[a.id] = hoje;
      }
    }
    achados.push(item);
  }
  if (!simular) await setSetting('ads_regras_avisados', JSON.stringify(Object.fromEntries(Object.entries(avisados).filter(([, d]) => d === hoje))));
  return { ativa: cfg.ativa, simulado: simular, avaliados: t.campanhas.length, achados };
}

// ---------- relatório semanal por e-mail ----------
export async function enviarRelatorioSemanal(forcar = false): Promise<Row> {
  if (!forcar && (await setting('ads_relatorio_semanal')) !== '1') return { ativo: false };
  const hoje = fmtDate(new Date());
  const dow = new Date(hoje + 'T12:00:00').getDay();
  if (!forcar && (dow !== 1 || (await setting('ads_relatorio_enviado')) === hoje)) return { ativo: true, enviado: false, motivo: 'só segunda-feira, uma vez' };
  const fim = fmtDate(addDays(new Date(hoje + 'T12:00:00'), -1)), ini = fmtDate(addDays(new Date(hoje + 'T12:00:00'), -7));
  const d = await relatorioTrafego(ini, fim);
  const br = (v: number) => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const s = d.semanal;
  const linhas = (d.campanhas as Row[]).map((c) => `- ${c.curto || c.nome}: ${br(c.investimento)} · ${c.conversas} conversas${c.conversas ? ' · ' + br(c.custoConversa) + '/conversa' : ''}`);
  const link = `${publicUrl()}/relatorio-trafego.html?de=${ini}&ate=${fim}`;
  await notifyMail(`Relatório semanal de tráfego (${ini.slice(8)}/${ini.slice(5, 7)} a ${fim.slice(8)}/${fim.slice(5, 7)})`,
    `Investimento: ${br(s.investimento)}\nAlcance: ${Number(s.alcance).toLocaleString('pt-BR')}\nCliques: ${Number(s.cliques).toLocaleString('pt-BR')}\nConversas iniciadas: ${s.conversas}${s.conversas ? ' (' + br(s.custoConversa) + ' por conversa)' : ''}\n\nPor campanha:\n${linhas.join('\n') || '(sem gasto)'}\n\nRelatório completo para salvar em PDF (entre como Gerência): ${link}`);
  await setSetting('ads_relatorio_enviado', hoje);
  return { ativo: true, enviado: true };
}

// ---------- matrículas por mês (custo por matrícula) ----------
export async function rascunhos(): Promise<Row[]> {
  try { return JSON.parse((await setting('ads_rascunhos')) || '[]'); } catch { return []; }
}
export async function salvarRascunho(nome: string, dados: unknown, id?: string): Promise<Row> {
  const lista = await rascunhos();
  const txt = JSON.stringify(dados);
  if (txt.length > 20000) throw new Error('Rascunho grande demais.');
  const nm = nome.trim().slice(0, 80) || 'Rascunho sem nome';
  const novo = { id: id && lista.some((r) => r.id === id) ? id : 'R' + Date.now().toString(36), nome: nm, salvoEm: now(), dados };
  const resto = lista.filter((r) => r.id !== novo.id);
  if (resto.length >= 20) throw new Error('No máximo 20 rascunhos. Exclua algum.');
  await setSetting('ads_rascunhos', JSON.stringify([novo, ...resto]));
  return novo;
}
export async function excluirRascunho(id: string): Promise<void> {
  await setSetting('ads_rascunhos', JSON.stringify((await rascunhos()).filter((r) => r.id !== id)));
}
