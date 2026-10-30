import { AsyncLocalStorage } from 'node:async_hooks';
import { Ctx } from './ctx';
import { requireInternal } from './auth';
import { q1 } from './db';
import { fail, Row } from './util';
import { segmentoCm } from './carometro';
export type AcaoCm = 'consultar'|'importar'|'substituir'|'baixar'|'imprimir';
export interface PoliticaCm { usuario: Row; segmentos: string[]; consultar: boolean; importar: boolean; substituir: boolean; baixar: boolean; imprimir: boolean }
export const contextoCm = new AsyncLocalStorage<PoliticaCm>();
export async function politicaCm(u: Row): Promise<PoliticaCm> {
  const r = Number(u.admin) ? null : await q1('SELECT * FROM cm_permissoes WHERE codigo=?',[u.codigo]);
  let segmentos: string[] = []; if(r) { try { segmentos=JSON.parse(r.segmentos); } catch { fail(403,'Política de acesso inválida.'); } }
  const manager = u.role==='manager';
  return {usuario:u,segmentos,consultar:r?!!Number(r.consultar):true,importar:r?!!Number(r.importar):manager,substituir:r?!!Number(r.substituir):manager,baixar:r?!!Number(r.baixar):manager,imprimir:r?!!Number(r.imprimir):true};
}
export function permiteTurma(turma: string): boolean { const p=contextoCm.getStore(); return !p?.segmentos.length || p.segmentos.includes(segmentoCm(turma)); }
export function exigirTurma(turma: string): void { if(!permiteTurma(turma)) fail(403,'Esta turma está fora dos seus segmentos.'); }
export async function exigirAluno(id: number): Promise<Row> { const a=await q1('SELECT id,turma FROM ui_alunos WHERE id=?',[id])??fail(404,'Aluno não encontrado.');exigirTurma(String(a.turma));return a; }
export async function exigirCm(c: Ctx, acao: AcaoCm='importar'): Promise<Row> { const p=contextoCm.getStore()??await politicaCm(await requireInternal(c));if(!p.consultar||!p[acao])fail(403,'Seu perfil não tem permissão para esta ação no carômetro.');return p.usuario; }
