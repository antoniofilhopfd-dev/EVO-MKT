import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

/**
 * Carrega, no servidor, as MESMAS funções puras que o painel e a pré-visualização usam (public/trafego-comum.js):
 * filtros, totais, semanas dom–sáb e agrupamento. Assim a tela, o PDF e os testes concordam sempre nos números.
 */
export interface TrafegoComum {
  tfFiltrar(d: any, f?: any): { campanhas: any[]; conjuntos: any[]; anuncios: any[]; filtrado: boolean };
  tfTotais(linhas: any[], alcance?: number | null): any;
  tfAgrupar(dias: string[], valores: number[], modo: 'dia' | 'semana' | 'mes'): { chave: string; de: string; ate: string; valor: number }[];
  tfSemanaEpi(iso: string): { semana: number; ano: number };
  tfSerieFiltrada(diario: any, campanhas: any[]): any;
  tfSegRotulo(k: string): string;
  TF_STATUS_OPCOES: [string, string][];
  tfDiaLongo(iso: string): string;
}
let cache: TrafegoComum | null = null;
export function trafegoComum(): TrafegoComum {
  if (cache) return cache;
  const ctx: any = {}; vm.createContext(ctx);
  const codigo = readFileSync(join(process.cwd(), 'public', 'trafego-comum.js'), 'utf8');
  vm.runInContext(codigo + ';Object.assign(globalThis,{tfFiltrar,tfTotais,tfAgrupar,tfSemanaEpi,tfSerieFiltrada,tfSegRotulo,TF_STATUS_OPCOES,tfDiaLongo});', ctx);
  cache = ctx as TrafegoComum; return cache;
}
