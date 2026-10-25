import { setting } from './settings';
import { env, fail, Row, strv } from './util';
import { httpCall } from './integrations/http';

/**
 * IA como RASCUNHO: gera variações de legenda para a pessoa escolher. Nada é salvo nem publicado por aqui.
 * Chamada HTTPS direta (sem biblioteca); desligada enquanto não houver uma chave em Configurações › IA.
 */
export const iaAtiva = async () => (await setting('anthropic_key')) !== '';
const BASE = () => env('ANTHROPIC_API_BASE', 'https://api.anthropic.com');

export async function variacoesDeLegenda(b: Row): Promise<string[]> {
  const chave = await setting('anthropic_key');
  if (!chave) fail(409, 'A IA está desligada. Cole uma chave em Configurações › IA para usar as variações.');
  const legenda = strv(b.legenda).trim().slice(0, 2200), titulo = strv(b.titulo).trim().slice(0, 140);
  if (!legenda && !titulo) fail(400, 'Escreva um título ou um rascunho de legenda para gerar variações.');
  const guia = (await setting('ia_guia_voz')).trim();
  const modelo = (await setting('ia_modelo')) || 'claude-sonnet-5-5';
  const contexto = [`Perfil: ${strv(b.perfil) || 'não informado'}`, `Segmento: ${strv(b.segmento) || 'não informado'}`, `Formato: ${strv(b.formato) || 'Feed'}`, strv(b.objetivo) && `Objetivo: ${strv(b.objetivo).slice(0, 80)}`].filter(Boolean).join('\n');
  const prompt = `Você escreve legendas de Instagram para o Colégio Evolução (escola em João Pessoa, PB). Escreva em português do Brasil, com tom acolhedor e institucional, sem inventar fatos, datas, preços ou nomes.\n${guia ? `Guia de voz da escola:\n${guia}\n` : ''}${contexto}\nTítulo interno: ${titulo || '(sem título)'}\nRascunho atual da legenda:\n${legenda || '(vazio)'}\n\nGere 3 variações da legenda, cada uma com no máximo 600 caracteres. Responda apenas com um JSON no formato {"variacoes":["...","...","..."]}.`;
  const [st, j] = await httpCall('POST', `${BASE()}/v1/messages`, { 'x-api-key': chave, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, JSON.stringify({ model: modelo, max_tokens: 1500, messages: [{ role: 'user', content: prompt }] }), 40);
  if (st === 401 || st === 403) fail(502, 'A chave da IA foi recusada. Confira em Configurações › IA.');
  if (st === 429) fail(502, 'A IA está com muitas chamadas agora. Tente de novo em instantes.');
  if (st < 200 || st >= 300) fail(502, 'A IA não respondeu agora. Tente de novo mais tarde.');
  const texto = ((j?.content ?? []) as Row[]).map((x) => strv(x.text)).join('');
  let lista: unknown = [];
  try { lista = JSON.parse(texto.slice(texto.indexOf('{'), texto.lastIndexOf('}') + 1)).variacoes; } catch { /* resposta fora do formato */ }
  const out = (Array.isArray(lista) ? lista : []).map((x) => strv(x).trim().slice(0, 2200)).filter(Boolean).slice(0, 3);
  if (!out.length) fail(502, 'A IA respondeu fora do formato esperado. Tente de novo.');
  return out;
}
