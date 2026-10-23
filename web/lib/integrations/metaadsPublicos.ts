import { sha256 } from '../crypto';
import { setting } from '../settings';
import { Row } from '../util';
import { act, registrar } from './metaadsGerenciador';
import { metaDelete, metaPost } from './meta';

/**
 * Públicos personalizados (como no Gerenciador da Meta): lista de contatos, visitantes do site (pixel), quem interagiu com o Instagram,
 * semelhantes, renomear e excluir. Contatos são "hasheados" (SHA-256) aqui no servidor antes de ir à Meta e NÃO ficam guardados no sistema.
 * Como o resto da escrita: validado só contra o simulador; o primeiro uso real deve ser supervisionado.
 */
const ID_OK = /^[A-Za-z0-9_]{2,40}$/;
const nomeOk = (v: unknown) => { const n = String(v ?? '').trim(); if (n.length < 3 || n.length > 100) throw new Error('Dê um nome ao público (3 a 100 caracteres).'); return n; };
const faixaN = (v: unknown, min: number, max: number, rot: string) => { const n = Math.floor(Number(v)); if (!Number.isFinite(n) || n < min || n > max) throw new Error(`${rot}: use de ${min} a ${max}.`); return n; };

/** Divide a lista colada em e-mails e telefones, normaliza como a Meta pede e devolve os dois conjuntos já com SHA-256. */
export function prepararContatos(texto: string): { emails: string[]; telefones: string[]; ignorados: number } {
  const emails = new Set<string>(), tels = new Set<string>();
  let ignorados = 0;
  for (const bruto of String(texto ?? '').split(/[\n;,\t]+/)) {
    const v = bruto.trim();
    if (!v) continue;
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) { emails.add(sha256(v.toLowerCase())); continue; }
    const d = v.replace(/\D/g, '');
    const tel = d.length === 10 || d.length === 11 ? '55' + d : d.length === 12 || d.length === 13 ? d : '';
    if (tel) tels.add(sha256(tel)); else ignorados++;
  }
  return { emails: [...emails], telefones: [...tels], ignorados };
}

export async function criarPublico(b: Row, quem: string): Promise<Row> {
  const { id: conta } = await act();
  if (b.confirmou !== true) throw new Error('Confirme a criação do público.');
  const tipo = String(b.tipo ?? '').toUpperCase(), nome = nomeOk(b.nome);
  let pedido: Row, extra: { emails: string[]; telefones: string[]; ignorados: number } | null = null;
  if (tipo === 'CONTATOS') {
    if (b.autorizacao !== true) throw new Error('Confirme que os contatos autorizaram receber comunicação (LGPD).');
    extra = prepararContatos(String(b.contatos ?? ''));
    if (!extra.emails.length && !extra.telefones.length) throw new Error('Nenhum e-mail ou telefone válido na lista. Use um por linha.');
    if (extra.emails.length + extra.telefones.length > 20000) throw new Error('Envie no máximo 20.000 contatos por vez.');
    pedido = { name: nome, subtype: 'CUSTOM', description: String(b.descricao ?? '').slice(0, 200), customer_file_source: 'USER_PROVIDED_ONLY' };
  } else if (tipo === 'SITE') {
    if (!ID_OK.test(String(b.pixelId ?? ''))) throw new Error('Escolha o pixel.');
    const dias = faixaN(b.dias ?? 30, 1, 180, 'Dias');
    const filtros = String(b.url ?? '').trim() ? [{ field: 'url', operator: 'i_contains', value: String(b.url).trim().slice(0, 200) }] : [{ field: 'url', operator: 'i_contains', value: '' }];
    pedido = { name: nome, subtype: 'WEBSITE', retention_days: String(dias), prefill: 'true', rule: JSON.stringify({ inclusions: { operator: 'or', rules: [{ event_sources: [{ id: String(b.pixelId), type: 'pixel' }], retention_seconds: dias * 86400, filter: { operator: 'and', filters: filtros } }] } }) };
  } else if (tipo === 'INSTAGRAM') {
    const ig = String(b.instagramId || (await setting('ig_user_id')));
    if (!ID_OK.test(ig)) throw new Error('Conta do Instagram inválida.');
    const dias = faixaN(b.dias ?? 90, 1, 365, 'Dias');
    pedido = { name: nome, subtype: 'ENGAGEMENT', prefill: 'true', rule: JSON.stringify({ inclusions: { operator: 'or', rules: [{ event_sources: [{ id: ig, type: 'ig_business' }], retention_seconds: dias * 86400, filter: { operator: 'and', filters: [{ field: 'event', operator: 'eq', value: 'ig_business_profile_all' }] } }] } }) };
  } else if (tipo === 'SEMELHANTE') {
    if (!ID_OK.test(String(b.origemId ?? ''))) throw new Error('Escolha o público de origem.');
    const pct = faixaN(b.percentual ?? 1, 1, 10, 'Semelhança (%)');
    pedido = { name: nome, subtype: 'LOOKALIKE', origin_audience_id: String(b.origemId), lookalike_spec: JSON.stringify({ type: 'similarity', country: 'BR', ratio: pct / 100 }) };
  } else throw new Error('Tipo de público inválido.');
  let id = '';
  try {
    const r = await metaPost(`/act_${conta}/customaudiences`, pedido);
    id = String(r.id ?? '');
    if (!id) throw new Error('A Meta não devolveu o público criado.');
    if (extra) {
      for (const [schema, lista] of [['EMAIL_SHA256', extra.emails], ['PHONE_SHA256', extra.telefones]] as const) {
        for (let i = 0; i < lista.length; i += 5000) await metaPost(`/${id}/users`, { payload: JSON.stringify({ schema, data: lista.slice(i, i + 5000) }) });
      }
    }
    await registrar(quem, 'publico', id, nome, 'criar-publico', null, { tipo, contatos: extra ? extra.emails.length + extra.telefones.length : undefined });
    return { id, nome, tipo, enviados: extra ? extra.emails.length + extra.telefones.length : undefined, ignorados: extra?.ignorados };
  } catch (e: any) {
    await registrar(quem, 'publico', id || '-', nome, 'criar-publico', null, null, e.message);
    throw new Error('A Meta recusou: ' + String(e.message).replace(/^Meta [A-Z]+ \S+: /, ''));
  }
}

export async function editarPublico(b: Row, quem: string): Promise<Row> {
  await act();
  const id = String(b.id ?? '');
  if (!ID_OK.test(id)) throw new Error('Público inválido.');
  const pedido: Row = {};
  if (b.nome !== undefined) pedido.name = nomeOk(b.nome);
  if (b.descricao !== undefined) pedido.description = String(b.descricao).slice(0, 200);
  if (!Object.keys(pedido).length) throw new Error('Nada para alterar.');
  try { await metaPost(`/${id}`, pedido); } catch (e: any) { await registrar(quem, 'publico', id, String(pedido.name ?? ''), 'editar-publico', null, pedido, e.message); throw e; }
  await registrar(quem, 'publico', id, String(pedido.name ?? ''), 'editar-publico', null, pedido);
  return { id, ...pedido };
}

export async function excluirPublico(b: Row, quem: string): Promise<Row> {
  await act();
  const id = String(b.id ?? '');
  if (!ID_OK.test(id)) throw new Error('Público inválido.');
  if (b.confirmou !== true) throw new Error('Excluir exige confirmação.');
  try { await metaDelete(`/${id}`); } catch (e: any) { await registrar(quem, 'publico', id, '', 'excluir-publico', null, null, e.message); throw e; }
  await registrar(quem, 'publico', id, '', 'excluir-publico', null, null);
  return { id };
}
