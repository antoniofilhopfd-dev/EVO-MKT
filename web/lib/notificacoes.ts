import { q, run } from './db';
import { now } from './util';

/** Destino: 'gerencia' (toda a Gerência), 'portal:<segmento>' (registro do que o solicitante recebe) ou o nome do responsável. */
export async function registrarNotificacao(tipo: string, destino: string, titulo: string, texto = '', modulo = '', registro = ''): Promise<void> {
  try {
    await run('INSERT INTO notifications(quando,tipo,modulo,registro,destino,titulo,texto) VALUES(?,?,?,?,?,?,?)', [now(), tipo, modulo, registro, destino.slice(0, 120), titulo.slice(0, 200), texto.slice(0, 500)]);
    await run('DELETE FROM notifications WHERE id < (SELECT m FROM (SELECT MAX(id)-2000 m FROM notifications) x)');
  } catch {
    /* o aviso nunca pode derrubar a operação que o gerou */
  }
}

export async function listarNotificacoes(nome: string, gerente: boolean, limite = 60) {
  const where = gerente ? "destino IN ('gerencia',?) OR destino LIKE 'portal:%'" : 'destino=?';
  return q(`SELECT id,quando,tipo,modulo,registro,destino,titulo,texto,lida FROM notifications WHERE ${where} ORDER BY id DESC LIMIT ${Math.min(200, limite)}`, [nome]);
}
