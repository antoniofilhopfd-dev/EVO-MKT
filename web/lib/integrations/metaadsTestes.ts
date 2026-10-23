import { Row } from '../util';
import { act, conferirObjeto, registrar } from './metaadsGerenciador';
import { metaGet, metaPost } from './meta';
import { paginar } from './metaads';

/**
 * Testes A/B (estudos de divisão da Meta), pixel e catálogos. Testes: cria e lista. Pixel e catálogos: só leitura (o Gerenciador de Eventos
 * e o Commerce Manager continuam sendo da Meta). Escrita validada só contra o simulador: o primeiro teste real deve ser supervisionado.
 */
const ID_OK = /^[A-Za-z0-9_]{2,40}$/;
const seguro = async <T>(f: () => Promise<T>, vazio: T): Promise<T> => { try { return await f(); } catch { return vazio; } };

async function negocio(conta: string): Promise<string> {
  const r = await metaGet(`/act_${conta}`, { fields: 'business' });
  const id = String(r.business?.id ?? '');
  if (!ID_OK.test(id)) throw new Error('A conta de anúncios não está ligada a um Business Manager, que a Meta exige para testes A/B e catálogos.');
  return id;
}

export async function listarTestes(): Promise<Row[]> {
  const { id: conta } = await act();
  const biz = await negocio(conta);
  const l = await paginar(`/${biz}/ad_studies`, { fields: 'id,name,description,type,start_time,end_time,cells{id,name,treatment_percentage,adsets{id,name},campaigns{id,name}}', limit: 50 }, 2);
  const agora = Date.now() / 1000;
  return l.filter((x) => String(x.type ?? 'SPLIT_TEST') === 'SPLIT_TEST').map((x) => {
    const ini = Date.parse(String(x.start_time ?? '')) / 1000 || Number(x.start_time) || 0, fim = Date.parse(String(x.end_time ?? '')) / 1000 || Number(x.end_time) || 0;
    return {
      id: String(x.id), nome: String(x.name ?? ''), descricao: String(x.description ?? ''), inicio: ini ? new Date(ini * 1000).toISOString() : '', fim: fim ? new Date(fim * 1000).toISOString() : '',
      situacao: !ini || ini > agora ? 'Agendado' : fim && fim < agora ? 'Encerrado' : 'Em andamento',
      celulas: ((x.cells?.data ?? x.cells ?? []) as Row[]).map((c) => ({ nome: String(c.name ?? ''), percentual: Number(c.treatment_percentage ?? 0), itens: [...(c.adsets?.data ?? []), ...(c.campaigns?.data ?? [])].map((i: Row) => String(i.name ?? i.id)) })),
    };
  });
}

export async function criarTeste(b: Row, quem: string): Promise<Row> {
  const { id: conta } = await act();
  if (b.confirmou !== true) throw new Error('Confirme a criação do teste.');
  const nome = String(b.nome ?? '').trim();
  if (nome.length < 3 || nome.length > 100) throw new Error('Dê um nome ao teste (3 a 100 caracteres).');
  const nivel = String(b.nivel ?? '') === 'campanha' ? 'campanha' : 'conjunto';
  const ids = [...new Set(((Array.isArray(b.ids) ? b.ids : []) as unknown[]).map(String))];
  if (ids.length < 2 || ids.length > 5) throw new Error('Escolha de 2 a 5 itens para comparar.');
  if (ids.some((i) => !ID_OK.test(i))) throw new Error('Item inválido.');
  const ini = Date.parse(String(b.inicio ?? '')), fim = Date.parse(String(b.fim ?? ''));
  if (!Number.isFinite(ini) || !Number.isFinite(fim)) throw new Error('Informe o início e o fim do teste.');
  if (ini < Date.now() + 5 * 60000) throw new Error('O teste precisa começar no futuro (a Meta pede alguns minutos de antecedência).');
  if (fim <= ini) throw new Error('O fim precisa ser depois do início.');
  const dias = (fim - ini) / 86400000;
  if (dias < 1 || dias > 30) throw new Error('A duração do teste vai de 1 a 30 dias.');
  const nomes: string[] = [];
  for (const i of ids) nomes.push(String((await conferirObjeto(i, conta, '')).name ?? i));
  const base = Math.floor(100 / ids.length), sobra = 100 - base * ids.length;
  const cells = ids.map((i, k) => ({ name: nomes[k].slice(0, 100), treatment_percentage: base + (k < sobra ? 1 : 0), ...(nivel === 'campanha' ? { campaigns: [i] } : { adsets: [i] }) }));
  const biz = await negocio(conta);
  try {
    const r = await metaPost(`/${biz}/ad_studies`, {
      name: nome, description: String(b.descricao ?? '').slice(0, 500), type: 'SPLIT_TEST', start_time: String(Math.floor(ini / 1000)), end_time: String(Math.floor(fim / 1000)),
      cells: JSON.stringify(cells), confidence_level: '90',
    });
    const id = String(r.id ?? '');
    if (!id) throw new Error('A Meta não devolveu o teste criado.');
    await registrar(quem, 'teste', id, nome, 'criar-teste-ab', null, { nivel, ids });
    return { id, nome, celulas: cells.length };
  } catch (e: any) {
    await registrar(quem, 'teste', '-', nome, 'criar-teste-ab', null, null, e.message);
    throw new Error('A Meta recusou: ' + String(e.message).replace(/^Meta [A-Z]+ \S+: /, ''));
  }
}

/** Pixels da conta, com o último disparo e os eventos dos últimos 7 dias; e os catálogos do Business Manager. Só leitura. */
export async function eventosEcatalogos(): Promise<Row> {
  const { id: conta } = await act();
  const pixels = await seguro(async () => {
    const l = await paginar(`/act_${conta}/adspixels`, { fields: 'id,name,last_fired_time,is_unavailable,creation_time', limit: 20 }, 1);
    const fora: Row[] = [];
    for (const p of l.slice(0, 10)) {
      const st = await seguro(async () => (await metaGet(`/${p.id}/stats`, { aggregation: 'event', start_time: String(Math.floor(Date.now() / 1000) - 7 * 86400) })).data as Row[], [] as Row[]);
      const eventos = new Map<string, number>();
      for (const bloco of st ?? []) for (const e of (bloco.data ?? []) as Row[]) eventos.set(String(e.value), (eventos.get(String(e.value)) ?? 0) + Number(e.count ?? 0));
      fora.push({ id: String(p.id), nome: String(p.name ?? ''), ultimoDisparo: String(p.last_fired_time ?? ''), indisponivel: !!p.is_unavailable, eventos: [...eventos].map(([nome, total]) => ({ nome, total })).sort((a, b) => b.total - a.total).slice(0, 12) });
    }
    return fora;
  }, [] as Row[]);
  const aviso: string[] = [];
  const catalogos = await seguro(async () => {
    const biz = await negocio(conta);
    return (await paginar(`/${biz}/owned_product_catalogs`, { fields: 'id,name,product_count,vertical', limit: 25 }, 1)).map((c) => ({ id: String(c.id), nome: String(c.name ?? ''), produtos: c.product_count ?? null, tipo: String(c.vertical ?? '') }));
  }, null as Row[] | null);
  if (catalogos === null) aviso.push('Não consegui ler os catálogos (a conta pode não estar ligada a um Business Manager ou faltar permissão).');
  return { pixels, catalogos: catalogos ?? [], aviso };
}
