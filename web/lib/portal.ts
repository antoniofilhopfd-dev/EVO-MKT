import { run } from './db';
import { setting, setSetting } from './settings';
import { HttpError } from './util';

/**
 * Interruptor do Portal das Coordenações. DESLIGADO por padrão: sem a chave `portal_ativo = 1` nenhum acesso externo
 * funciona (páginas, login, APIs, links de aprovação de demandas). Código, tabelas, códigos de acesso, solicitações,
 * comentários, anexos e histórico ficam intactos; religar não exige reconstruir nada.
 */
export const MSG_PORTAL_OFF = 'O Portal das Coordenações está temporariamente indisponível. Para registrar um pedido, fale com o Marketing (WhatsApp ou pessoalmente).';
export const portalAtivo = async (): Promise<boolean> => (await setting('portal_ativo', '0')) === '1';
export async function exigirPortalAtivo(): Promise<void> {
  if (!(await portalAtivo())) throw new HttpError(503, MSG_PORTAL_OFF, { portalIndisponivel: true });
}
export async function definirPortal(ativo: boolean): Promise<void> {
  await setSetting('portal_ativo', ativo ? '1' : '0');
  if (!ativo) await run("DELETE FROM sessions WHERE tipo='por'"); // ao suspender, ninguém continua logado; os códigos continuam guardados
}
