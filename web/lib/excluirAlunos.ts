import { q, q1, run, withTx } from './db';
import { fail, now } from './util';
import { auditar } from './carometroFoto';

export interface AlunoConfirmado { id: number; nome: string; matricula: string }
/** Exclusão do cadastro compartilhado e seus arquivos, sem deixar referências órfãs.
 * Solicitações de autorização impedem a exclusão; a inativação continua disponível em Uso de Imagem. */
export async function excluirAlunos(ids: number[], ator: string, confirmados?: AlunoConfirmado[]) {
  return withTx(async () => {
    await q1('SELECT id FROM cm_guard WHERE id=1 FOR UPDATE');
    const excluidosIds: number[] = [], mantidos: { aluno: string; motivo: string }[] = [];
    for (const id of ids) {
      const a = await q1('SELECT id,nome,matricula FROM ui_alunos WHERE id=? FOR UPDATE', [id]);
      if (!a) { if (confirmados) fail(409, 'Um dos alunos foi alterado ou excluído. Atualize a lista e selecione novamente.'); continue; }
      if (confirmados) {
        const visto = confirmados.find(x => x.id === id);
        if (!visto || visto.nome !== String(a.nome) || visto.matricula !== String(a.matricula)) fail(409, 'O cadastro mudou desde a seleção. Atualize a lista e confira o nome e a matrícula.');
      }
      if (await q1('SELECT id FROM ui_solicitacoes WHERE aluno_id=? LIMIT 1', [id])) {
        mantidos.push({ aluno: String(a.nome), motivo: 'Tem solicitações de autorização. Preserve o histórico usando Inativar em Uso de Imagem › Alunos.' });
        continue;
      }
      const fotos = await q('SELECT id,caminho_original,caminho_padrao,caminho_mini FROM cm_fotos WHERE aluno_id=?', [id]);
      const itens = await q('SELECT id,caminho_original,caminho_padrao,caminho_mini FROM cm_lote_itens WHERE aluno_id=?', [id]);
      const caminhos = new Set(fotos.concat(itens).flatMap(f => [f.caminho_original,f.caminho_padrao,f.caminho_mini]).filter(Boolean));
      for (const caminho of caminhos) await run('DELETE FROM arquivos WHERE caminho=?', [caminho]);
      for (const f of fotos) {
        await run('UPDATE cm_lote_itens SET foto_id=NULL WHERE foto_id=?', [f.id]);
        await run('UPDATE cm_lote_itens SET anterior_id=NULL WHERE anterior_id=?', [f.id]);
      }
      for (const it of itens) await run('DELETE FROM cm_pendencias_ign WHERE chave=?', [`arquivo_orfao:i${it.id}`]);
      await run('DELETE FROM cm_lote_itens WHERE aluno_id=?', [id]);
      await run('DELETE FROM cm_fotos WHERE aluno_id=?', [id]);
      await run('DELETE FROM cm_selecao_itens WHERE aluno_id=?', [id]);
      await run('DELETE FROM cm_sessao_itens WHERE aluno_id=?', [id]);
      await run('DELETE FROM cm_anos WHERE aluno_id=?', [id]);
      for (const tipo of ['sem_foto','imagem_baixa','duplicado','varias_turmas','sem_turma']) await run('DELETE FROM cm_pendencias_ign WHERE chave=?', [`${tipo}:${id}`]);
      await run('UPDATE cm_auditoria SET aluno_id=NULL WHERE aluno_id=?', [id]);
      await run('UPDATE ui_eventos SET aluno_id=NULL WHERE aluno_id=?', [id]);
      await run('DELETE FROM ui_alunos WHERE id=?', [id]);
      await auditar(ator, 'aluno-excluido', null, `${a.nome} · matrícula ${a.matricula} · ID ${id}; ${fotos.length} foto(s)`);
      await run('INSERT INTO ui_eventos(quando,ator,acao,aluno_id,detalhe) VALUES(?,?,?,NULL,?)', [now(),ator,'aluno-excluido',`${a.nome} · matrícula ${a.matricula}`.slice(0,400)]);
      excluidosIds.push(id);
    }
    return { ok: true, excluidos: excluidosIds.length, excluidosIds, mantidos };
  });
}
