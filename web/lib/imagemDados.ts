import { createHash } from 'node:crypto';
import { q, q1, run } from './db';
import { RegistroPdf, TermoPdf } from './imagemPdf';
import { now, Row } from './util';

/** Auxiliares compartilhados pelas rotas internas e pelo portal do responsável. */
export const ENCERRADAS = ['AUTORIZADO', 'NAO_AUTORIZADO', 'VENCIDO', 'REVOGADO', 'CANCELADO', 'ERRO'];
export const PORTAL_STATUS_ABERTOS = ['AGUARDANDO_ENVIO', 'ENVIADO', 'ABERTO', 'AGUARDANDO_ASSINATURA', 'AGUARDANDO_VALIDACAO'];

export async function eventoSolic(id: number, ator: string, acao: string, detalhe = ''): Promise<void> {
  await run('INSERT INTO ui_solic_eventos(solicitacao_id,quando,ator,acao,detalhe) VALUES(?,?,?,?,?)', [id, now(), ator, acao, detalhe.slice(0, 400)]);
}

export const sha = (b: Buffer | string): string => createHash('sha256').update(b).digest('hex');

/** Lê uma solicitação com os dados do aluno. */
export const solicCompleta = (id: number): Promise<Row | undefined> =>
  q1('SELECT s.*, a.nome aluno, a.matricula, a.turma FROM ui_solicitacoes s JOIN ui_alunos a ON a.id=s.aluno_id WHERE s.id=?', [id]);

export const termoPdfDe = (r: Row, registro?: RegistroPdf): TermoPdf => ({
  protocolo: r.protocolo, texto: r.termo_texto, hash: r.termo_hash, versao: r.modelo_versao, modelo: r.modelo_nome, aluno: r.aluno, matricula: r.matricula, turma: r.turma,
  responsavel: r.resp_confirmado || r.responsavel_nome, criadoEm: r.criado_em, registro,
});

/** Guarda um arquivo na tabela `arquivos` e o registra na solicitação (os anteriores do mesmo tipo ficam inativos, nunca apagados). */
export async function salvarArquivoSolic(solicId: number, tipo: string, nome: string, buf: Buffer, mime: string, info: string, ip: string): Promise<void> {
  const caminho = `USO-IMAGEM/${solicId}/${tipo}_${Date.now().toString(36)}_${nome}`;
  await run('INSERT INTO arquivos(caminho,mime,tamanho,conteudo,criado_em) VALUES(?,?,?,?,?)', [caminho, mime, buf.length, buf, now()]);
  await run('UPDATE ui_arquivos SET ativo=0 WHERE solicitacao_id=? AND tipo=?', [solicId, tipo]);
  await run('INSERT INTO ui_arquivos(solicitacao_id,tipo,caminho,nome,sha256,tamanho,info,ativo,criado_em,ip) VALUES(?,?,?,?,?,?,?,1,?,?)', [solicId, tipo, caminho, nome, sha(buf), buf.length, info.slice(0, 400), now(), ip.slice(0, 64)]);
}

export async function lerArquivoSolic(solicId: number, tipo: string): Promise<{ buf: Buffer; nome: string; mime: string; sha256: string } | null> {
  const a = await q1('SELECT * FROM ui_arquivos WHERE solicitacao_id=? AND tipo=? AND ativo=1 ORDER BY id DESC LIMIT 1', [solicId, tipo]);
  if (!a) return null;
  const f = await q1('SELECT mime, conteudo FROM arquivos WHERE caminho=?', [a.caminho]);
  if (!f) return null;
  return { buf: Buffer.from(f.conteudo), nome: a.nome, mime: f.mime, sha256: a.sha256 };
}

/** Marca como VENCIDO o que passou do prazo do termo (o dia do vencimento ainda vale). Chamado ao abrir o módulo e o portal. */
export async function atualizarVencimentos(): Promise<number> {
  const hoje = now().slice(0, 10);
  const venc = await q("SELECT id FROM ui_solicitacoes WHERE status='AUTORIZADO' AND vence_em<>'' AND vence_em<?", [hoje]);
  for (const r of venc) {
    await run("UPDATE ui_solicitacoes SET status='VENCIDO',atualizado_em=? WHERE id=? AND status='AUTORIZADO'", [now(), r.id]);
    await eventoSolic(Number(r.id), 'sistema', 'vencido', 'prazo do termo terminou');
  }
  return venc.length;
}
