import { createHash } from 'node:crypto';
import { withTx } from './db';
import { listRows } from './records';
import { now, Row, strv } from './util';
import { horarioTikTokData } from './conteudo';

export type TipoLembreteTikTok = 'antecipado' | 'horario' | 'atrasado';
export type LembreteTikTok = { tipo: TipoLembreteTikTok; destino: string; chave: string; agendadoEm: string; titulo: string; texto: string };

/** Planejamento puro: só conteúdo TikTok agendado, nunca envia/publica mídia. */
export function lembreteTikTokDe(r: Row, instante: Date): LembreteTikTok | null {
  if (strv(r.canal).trim().toLowerCase() !== 'tiktok') return null;
  if (strv(r.status).trim().toUpperCase() !== 'AGENDADO') return null;
  const responsavel = strv(r.responsavel).trim();
  const horario = strv(r.publicacaoEm).trim();
  if (!responsavel) return null;
  const programado = horarioTikTokData(horario);
  if (!programado || !Number.isFinite(instante.getTime())) return null;
  const minutos = (instante.getTime() - programado.getTime()) / 60000;
  // Recuperação: apenas o aviso correspondente à janela atual.
  // Atrasos superiores a 24 horas não geram alertas antigos indefinidamente.
  if (minutos < -30 || minutos >= 24 * 60) return null;
  // Avisos antecipados e de horário não são reproduzidos fora de suas janelas.
  const tipo: TipoLembreteTikTok = minutos < 0 ? 'antecipado' : minutos < 15 ? 'horario' : 'atrasado';
  const id = strv(r.id);
  if (!id) return null;
  // Em publicações legadas, a identidade estável mantém a deduplicação original.
  // Cada NOVO agendamento gera seu próprio agendamentoTikTokId na rota de agendar.
  const ciclo = strv(r.agendamentoTikTokId).trim() || 'legado';
  const chave = createHash('sha256').update(JSON.stringify([id, ciclo, programado.toISOString(), responsavel, tipo])).digest('hex');
  const descricao = tipo === 'antecipado' ? 'será publicada manualmente em breve' : tipo === 'horario' ? 'está no horário da publicação manual' : 'está atrasada e aguarda publicação manual';
  return {
    tipo, destino: responsavel, chave, agendadoEm: horario,
    titulo: tipo === 'antecipado' ? 'TikTok: publicação em 30 minutos' : tipo === 'horario' ? 'TikTok: horário de publicar' : 'TikTok: publicação atrasada',
    texto: `"${strv(r.titulo).slice(0, 140)}" ${descricao}. Abra o EVO MKT para conferir as autorizações e publicar no TikTok. Horário previsto: ${horario.slice(0, 16).replace('T', ' ')}.`,
  };
}

/**
 * Cron próprio do TikTok: registra evento e notificação NA MESMA transação.
 * A chave única é a proteção de idempotência. Se houver falha, ambas operações
 * são revertidas e o próximo cron recupera o evento devido.
 */
export async function executarLembretesTikTok(instante: Date = new Date()): Promise<{ criados: number; examinados: number }> {
  let criados = 0, examinados = 0;
  for (const linha of await listRows('conteudos')) {
    if (!lembreteTikTokDe(linha, instante)) continue;
    examinados++;
    const enviado = await withTx(async (conn) => {
      const [rows] = await conn.query('SELECT data FROM records WHERE modulo=? AND id=? FOR UPDATE', ['conteudos', linha.id]);
      const atual = (rows as {data: string}[])[0];
      if (!atual) return false;
      const aviso = lembreteTikTokDe(JSON.parse(atual.data), instante);
      if (!aviso) return false;
      const [gravado] = await conn.query(
        'INSERT IGNORE INTO tiktok_reminder_events(chave,conteudo_id,tipo,destino,agendado_em,gerado_em) VALUES(?,?,?,?,?,?)',
        [aviso.chave, linha.id, aviso.tipo, aviso.destino.slice(0, 120), aviso.agendadoEm, now(instante)]
      );
      if ((gravado as {affectedRows: number}).affectedRows !== 1) return false;
      await conn.query(
        'INSERT INTO notifications(quando,tipo,modulo,registro,destino,titulo,texto) VALUES(?,?,?,?,?,?,?)',
        [now(instante), 'tiktok-manual', 'conteudos', linha.id, aviso.destino.slice(0, 120), aviso.titulo, aviso.texto.slice(0, 500)]
      );
      return true;
    });
    if (enviado) criados++;
  }
  return { criados, examinados };
}
