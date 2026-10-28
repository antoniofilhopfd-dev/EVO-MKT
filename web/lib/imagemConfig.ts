import { setSetting, setting } from './settings';

/** Ajustes do módulo Uso de Imagem (guardados nas configurações do sistema; só o Administrador altera). */
export interface ConfigImagem {
  linkDias: number; lembreteIntervaloDias: number; lembreteMax: number; avisoVencimentoDias: number; retencaoAnos: number;
  bloquearVersaoAntiga: boolean; quemValida: 'equipe' | 'admin'; quemRevoga: 'equipe' | 'admin'; canais: string[]; mensagemEnvio: string; mensagemLembrete: string;
}
export const PADRAO: ConfigImagem = {
  linkDias: 15, lembreteIntervaloDias: 3, lembreteMax: 3, avisoVencimentoDias: 30, retencaoAnos: 5, bloquearVersaoAntiga: true, quemValida: 'equipe', quemRevoga: 'equipe', canais: ['whatsapp', 'email'],
  mensagemEnvio: 'Olá! O Colégio Evolução pede a sua autorização (ou a sua recusa) para o uso de imagem de {aluno}. Leia e responda com calma por este link seguro: {link}\n\nO código de acesso será informado por outro meio. O link vale até {validade}.',
  mensagemLembrete: 'Olá! Lembrando da solicitação de autorização de uso de imagem de {aluno} (protocolo {protocolo}). Use o link que enviamos para responder. Se perdeu o link ou o código, é só nos avisar que enviamos outro.',
};
const K = (n: string) => 'ui_cfg_' + n;
const num = (v: string, d: number, min: number, max: number) => { const n = Number(v); return Number.isFinite(n) && v !== '' ? Math.min(max, Math.max(min, Math.round(n))) : d; };

export async function lerConfig(): Promise<ConfigImagem> {
  const g = (n: string) => setting(K(n), '');
  const canais = (await g('canais')).split(',').map((x) => x.trim()).filter((x) => ['whatsapp', 'email'].includes(x));
  return {
    linkDias: num(await g('linkDias'), PADRAO.linkDias, 1, 60), lembreteIntervaloDias: num(await g('lembreteIntervaloDias'), PADRAO.lembreteIntervaloDias, 1, 30), lembreteMax: num(await g('lembreteMax'), PADRAO.lembreteMax, 0, 10),
    avisoVencimentoDias: num(await g('avisoVencimentoDias'), PADRAO.avisoVencimentoDias, 1, 365), retencaoAnos: num(await g('retencaoAnos'), PADRAO.retencaoAnos, 1, 30),
    bloquearVersaoAntiga: (await g('bloquearVersaoAntiga')) !== '0', quemValida: (await g('quemValida')) === 'admin' ? 'admin' : 'equipe', quemRevoga: (await g('quemRevoga')) === 'admin' ? 'admin' : 'equipe',
    canais: (await g('canais')) === '' ? PADRAO.canais : canais, mensagemEnvio: (await g('mensagemEnvio')) || PADRAO.mensagemEnvio, mensagemLembrete: (await g('mensagemLembrete')) || PADRAO.mensagemLembrete,
  };
}

/** Valida e grava. Devolve o erro em português ou null. */
export async function gravarConfig(b: Record<string, unknown>): Promise<string | null> {
  const n = (k: string, min: number, max: number, rot: string): number | string => { const v = Number(b[k]); return Number.isInteger(v) && v >= min && v <= max ? v : `${rot}: use um número inteiro de ${min} a ${max}.`; };
  const campos: [string, number, number, string][] = [['linkDias', 1, 60, 'Validade do link (dias)'], ['lembreteIntervaloDias', 1, 30, 'Intervalo entre lembretes (dias)'], ['lembreteMax', 0, 10, 'Máximo de lembretes'], ['avisoVencimentoDias', 1, 365, 'Aviso de vencimento (dias)'], ['retencaoAnos', 1, 30, 'Retenção (anos)']];
  const vals: Record<string, string> = {};
  for (const [k, min, max, rot] of campos) { const r = n(k, min, max, rot); if (typeof r === 'string') return r; vals[k] = String(r); }
  const msgE = String(b.mensagemEnvio ?? '').trim(), msgL = String(b.mensagemLembrete ?? '').trim();
  if (msgE && (!msgE.includes('{link}') || msgE.length > 1500)) return 'A mensagem de envio precisa conter {link} (até 1.500 letras).';
  if (msgL.length > 1500) return 'A mensagem de lembrete passa de 1.500 letras.';
  const canais = (Array.isArray(b.canais) ? b.canais : []).map(String).filter((x) => ['whatsapp', 'email'].includes(x));
  for (const [k, v] of Object.entries(vals)) await setSetting(K(k), v);
  await setSetting(K('bloquearVersaoAntiga'), b.bloquearVersaoAntiga === false ? '0' : '1');
  await setSetting(K('quemValida'), b.quemValida === 'admin' ? 'admin' : 'equipe');
  await setSetting(K('quemRevoga'), b.quemRevoga === 'admin' ? 'admin' : 'equipe');
  await setSetting(K('canais'), canais.join(','));
  await setSetting(K('mensagemEnvio'), msgE);
  await setSetting(K('mensagemLembrete'), msgL);
  return null;
}

/** Vencimento do termo a partir da data da decisão e do prazo do modelo. '' = não vence. */
export function calcVence(tipo: string, valor: string, decisaoEm: string): string {
  if (tipo === 'ATE_DATA' && /^\d{4}-\d{2}-\d{2}$/.test(valor)) return valor;
  if (tipo === 'MESES' && /^\d{1,3}$/.test(valor) && +valor > 0) {
    const d = new Date(decisaoEm.slice(0, 10) + 'T12:00:00Z'); if (Number.isNaN(d.getTime())) return '';
    const dia = d.getUTCDate(); d.setUTCMonth(d.getUTCMonth() + +valor); if (d.getUTCDate() !== dia) d.setUTCDate(0);
    return d.toISOString().slice(0, 10);
  }
  return '';
}
export const mensagemCom = (tpl: string, v: Record<string, string>): string => tpl.replace(/\{(\w+)\}/g, (_, k: string) => v[k] ?? '');
