import Anthropic from '@anthropic-ai/sdk';
import { setting } from './settings';
import { env, fail, Row } from './util';

export const IA_MODELO = () => env('IA_MODEL', 'claude-opus-5-5');

export async function iaConfigurada(): Promise<boolean> {
  return (await setting('anthropic_key')) !== '' || env('ANTHROPIC_API_KEY') !== '';
}

export interface Rascunho { legenda: string; hashtags: string[] }

const CAMPOS: [string, string][] = [
  ['titulo', 'Título'], ['segmento', 'Segmento'], ['perfil', 'Perfil'], ['formato', 'Formato'], ['objetivo', 'Objetivo'], ['publicoAlvo', 'Público-alvo'],
  ['mensagemPrincipal', 'Mensagem principal'], ['descricao', 'Descrição'], ['categoriaIdeia', 'Categoria'], ['sazonalidade', 'Data/sazonalidade'], ['ctaSugerido', 'CTA sugerido'], ['cta', 'CTA'], ['legenda', 'Legenda atual'],
];

/** Gera 3 rascunhos de legenda com o guia de voz do Colégio. Nunca publica nada: a equipe revisa e escolhe. */
export async function gerarLegendas(reg: Row, instrucao: string): Promise<Rascunho[]> {
  const apiKey = (await setting('anthropic_key')) || env('ANTHROPIC_API_KEY');
  if (!apiKey) fail(400, 'A IA não está configurada. A Gerência precisa informar a chave em Administração → Integrações.');
  const guia = (await setting('ia_guia_voz')).trim();
  const client = new Anthropic({ apiKey, baseURL: env('ANTHROPIC_BASE_URL') || undefined, maxRetries: 2, timeout: 60_000 });
  const ficha = CAMPOS.filter(([k]) => String(reg[k] ?? '').trim()).map(([k, l]) => `${l}: ${String(reg[k]).trim().slice(0, 800)}`).join('\n');
  const system = [
    'Você escreve legendas de Instagram para o Colégio Evolução, em português do Brasil.',
    'Use somente fatos presentes na ficha. Nunca invente datas, preços, nomes, resultados ou promessas.',
    'Se faltar informação importante, escreva a legenda mesmo assim e deixe [COMPLETAR: o que falta] no ponto exato.',
    guia ? `Guia de voz do Colégio (siga à risca):\n${guia}` : 'Tom: acolhedor, claro e profissional, adequado a famílias e estudantes.',
    'Responda SOMENTE com JSON válido, sem texto antes ou depois, neste formato: {"opcoes":[{"legenda":"...","hashtags":["#..."]},{"legenda":"...","hashtags":["#..."]},{"legenda":"...","hashtags":["#..."]}]}',
    'As 3 opções devem ser diferentes entre si (por exemplo: direta, emocional, informativa). No máximo 5 hashtags por opção.',
  ].join('\n');
  let resp;
  try {
    resp = await client.messages.create({
      model: IA_MODELO(), max_tokens: 4000, system,
      output_config: { effort: 'low' },
      messages: [{ role: 'user', content: `Ficha do conteúdo:\n${ficha || '(sem detalhes)'}${instrucao ? `\n\nPedido extra da equipe: ${instrucao.slice(0, 300)}` : ''}` }],
    });
  } catch (e: any) {
    fail(502, `Não foi possível gerar agora (${String(e?.message ?? e).slice(0, 160)}).`);
  }
  if (resp.stop_reason === 'refusal') fail(422, 'A IA recusou este pedido. Reescreva o pedido ou escreva a legenda manualmente.');
  const texto = resp.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('\n');
  return lerRascunhos(texto);
}

export function lerRascunhos(texto: string): Rascunho[] {
  const ini = texto.indexOf('{'), fim = texto.lastIndexOf('}');
  if (ini < 0 || fim <= ini) fail(502, 'A IA devolveu uma resposta fora do formato. Tente de novo.');
  let j: any;
  try { j = JSON.parse(texto.slice(ini, fim + 1)); } catch { fail(502, 'A IA devolveu uma resposta fora do formato. Tente de novo.'); }
  const ops: Rascunho[] = (Array.isArray(j?.opcoes) ? j.opcoes : [])
    .map((o: any) => ({ legenda: String(o?.legenda ?? '').trim().slice(0, 2200), hashtags: (Array.isArray(o?.hashtags) ? o.hashtags : []).map((h: any) => String(h).trim()).filter((h: string) => /^#\S+$/.test(h)).slice(0, 5) }))
    .filter((o: Rascunho) => o.legenda);
  if (!ops.length) fail(502, 'A IA não devolveu legendas. Tente de novo.');
  return ops.slice(0, 3);
}
