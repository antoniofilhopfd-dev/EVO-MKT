import { contextoCm, politicaCm, exigirCm, exigirAluno, exigirTurma, permiteTurma } from '../carometroAcesso';
import { carometroGestaoRoute } from './carometroGestao';
import { Ctx } from '../ctx';
import { requireAdmin, requireInternal, requireManager } from '../auth';
import { q, q1, withTx } from '../db';
import { fail, lower, now, Row, strv } from '../util';
import { json } from './handlers';
import { atualizarVencimentos } from '../imagemDados';
import { auditar, enquadrarFoto, guardarFoto, historicoFotos, lerArquivoFoto, prepararFoto, FOTO_MAX_BYTES } from '../carometroFoto';
import { run } from '../db';
import { carometroLoteRoute } from './carometroLote';
import { carometroSelRoute } from './carometroSel';
import { carometroDriveRoute } from './carometroDrive';
import { calcularPendencias, contagemPend, TIPOS_PEND } from '../carometroPend';
import { carometroPdf, carregarAlunosPdf, fotoPadrao, ordenarAlunosPdf } from '../carometroPdf';
import { autorizacaoDe, compararTurmaCm, normNome, segmentoCm, SEGMENTOS_CM, serieDe } from '../carometro';

/**
 * Carômetro Escolar, etapa 1: consulta (somente leitura) sobre o cadastro de alunos do Uso de Imagem.
 * Só usuários internos. Nenhuma rota é pública e nenhuma grava dados.
 */
const anoLetivo = () => String(new Date().getFullYear());

const SQL_ALUNOS = `SELECT a.id, a.matricula, a.nome, a.turma,
  (SELECT s.status FROM ui_solicitacoes s WHERE s.aluno_id=a.id AND s.status<>'CANCELADO' ORDER BY s.id DESC LIMIT 1) situacao,
  (SELECT s.vence_em FROM ui_solicitacoes s WHERE s.aluno_id=a.id AND s.status<>'CANCELADO' ORDER BY s.id DESC LIMIT 1) vence_em,
  (SELECT f.id FROM cm_fotos f WHERE f.aluno_id=a.id AND f.ativa=1 ORDER BY f.id DESC LIMIT 1) foto_id,
  (SELECT s.atualizado_em FROM ui_solicitacoes s WHERE s.aluno_id=a.id AND s.status<>'CANCELADO' ORDER BY s.id DESC LIMIT 1) situacao_em
  FROM ui_alunos a WHERE a.ativo=1`;

async function carregar(): Promise<Row[]> {
  await atualizarVencimentos();
  const rows = await q(SQL_ALUNOS);
  const nomes = new Map<string, number>();
  for (const r of rows) { const k = `${r.turma}|${normNome(String(r.nome))}`; nomes.set(k, (nomes.get(k) ?? 0) + 1); }
  return rows.map((r) => ({
    id: Number(r.id), matricula: String(r.matricula), nome: String(r.nome), turma: String(r.turma ?? ''),
    serie: serieDe(String(r.turma ?? '')), segmento: segmentoCm(String(r.turma ?? '')),
    autorizacao: autorizacaoDe(r.situacao), duplicado: (nomes.get(`${r.turma}|${normNome(String(r.nome))}`) ?? 0) > 1,
    fotoId: r.foto_id ? Number(r.foto_id) : null, _vence: String(r.vence_em ?? ''), _em: String(r.situacao_em ?? ''),
  }));
}
const publico = (a: Row) => { const { _vence, _em, ...p } = a; return p; };

export async function carometroRoute(c: Ctx): Promise<Response> {
  const u=await requireInternal(c), politica=await politicaCm(u);
  if(!politica.consultar && c.path!=='/carometro/acesso') fail(403,'Seu perfil não tem acesso ao carômetro.');
  return contextoCm.run(politica, async () => {
  if (c.method === 'POST') return withTx(async () => {
    await q1('SELECT id FROM cm_guard WHERE id=1 FOR UPDATE');
    return executarCarometro(c);
  });
  return executarCarometro(c);
  });
}

async function executarCarometro(c: Ctx): Promise<Response> {
  const { path, method } = c;
  const u = await requireInternal(c);
  const ator = String(u.nome ?? u.codigo ?? '');

  const gestao=await carometroGestaoRoute(c,ator); if(gestao)return gestao;
  const drv = await carometroDriveRoute(c, u, ator);
  if (drv) return drv;
  const sel = await carometroSelRoute(c, u, ator);
  if (sel) return sel;
  const lote = await carometroLoteRoute(c, ator);
  if (lote) return lote;

  if(path==='/carometro/foto/enquadrar') {
    await exigirCm(c,'substituir');
    const b=method==='POST'?await c.body():{},id=Number(b.foto_id||c.qs('id'));
    const f=await q1('SELECT * FROM cm_fotos WHERE id=?',[id])??fail(404,'Foto não encontrada.');await exigirAluno(Number(f.aluno_id));
    const arq=await lerArquivoFoto(id,'original')??fail(404,'Original não encontrado.');
    if(method==='GET')return new Response(new Uint8Array(arq.buf),{headers:{'Content-Type':arq.mime,'Cache-Control':'private, no-store'}});
    if(method!=='POST')fail(405,'Método não permitido.');
    if(!Number(f.ativa))fail(409,'A foto atual foi alterada. Reabra a ficha.');
    const pronta=await prepararFoto(arq.buf);if('erro' in pronta)fail(400,pronta.erro);
    let crop;try{crop=await enquadrarFoto(arq.buf,b.recorte);}catch{fail(400,'Enquadramento inválido.');}
    pronta.padrao=crop.padrao;pronta.mini=crop.mini;
    const novoId=await guardarFoto(Number(f.aluno_id),pronta,String(f.nome_original),'enquadramento-manual',ator);
    return json({ok:true,id:novoId});
  }
  // ---- fotos ----
  if (path === '/carometro/foto' && method === 'GET') {
    const tam = c.qs('tam') === 'original' ? 'original' : c.qs('tam') === 'mini' ? 'mini' : 'padrao';
    if (tam === 'original') await exigirCm(c,'baixar');
    const f = await lerArquivoFoto(Number(c.qs('id')) || 0, tam) ?? fail(404, 'Foto não encontrada.');
    await exigirAluno(f.alunoId);
    if (tam === 'original') await auditar(ator, 'original-baixado', f.alunoId, '');
    const cab: Record<string, string> = { 'Content-Type': f.mime, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" };
    if (tam === 'original') cab['Content-Disposition'] = `attachment; filename="${f.nome.replace(/[^A-Za-z0-9._-]/g, '_') || 'foto'}"`;
    return new Response(new Uint8Array(f.buf), { headers: cab });
  }
  if (path === '/carometro/foto' && method === 'POST') {
    const form = await c.req.formData();
    const alunoId = Number(form.get('aluno_id')) || 0, arq = form.get('arquivo');
    await q1('SELECT id FROM ui_alunos WHERE id=? AND ativo=1', [alunoId]) ?? fail(404, 'Aluno não encontrado.');
    if (!(arq instanceof File) || !arq.size) fail(400, 'Escolha a foto.');
    if (arq.size > FOTO_MAX_BYTES) fail(413, 'A foto passa de 5 MB. Reduza o tamanho e envie de novo.');
    await exigirAluno(alunoId);
    if(await q1('SELECT id FROM cm_fotos WHERE aluno_id=? AND ativa=1',[alunoId])) await exigirCm(c,'substituir');else await exigirCm(c,'importar');
    const pronta = await prepararFoto(Buffer.from(await arq.arrayBuffer()));
    if ('erro' in pronta) fail(400, pronta.erro);
    const id = await guardarFoto(alunoId, pronta, arq.name || 'foto', 'envio-individual', ator);
    return json({ ok: true, id, aviso: pronta.aviso });
  }
  if (path === '/carometro/foto/restaurar' && method === 'POST') {
    await exigirCm(c,'substituir');
    const b = await c.body(), f = await q1('SELECT id,aluno_id,versao,ativa FROM cm_fotos WHERE id=?', [Number(b.id) || 0]) ?? fail(404, 'Versão não encontrada.');
    await exigirAluno(Number(f.aluno_id));
    if (Number(f.ativa)) fail(409, 'Esta versão já é a foto atual.');
    await run('UPDATE cm_fotos SET ativa=0, desativada_em=? WHERE aluno_id=? AND ativa=1', [now(), f.aluno_id]);
    await run('UPDATE cm_fotos SET ativa=1, desativada_em=\'\' WHERE id=?', [f.id]);
    await auditar(ator, 'foto-restaurada', Number(f.aluno_id), `versão ${f.versao}`);
    return json({ ok: true });
  }
  if (path === '/carometro/foto/remover' && method === 'POST') {
    await exigirCm(c,'substituir');
    const b = await c.body(), alunoId = Number(b.aluno_id) || 0;
    const f = await q1('SELECT id,versao,aluno_id FROM cm_fotos WHERE aluno_id=? AND ativa=1', [alunoId]) ?? fail(404, 'Este aluno não tem foto atual.');
    await exigirAluno(Number(f.aluno_id ?? alunoId));
    await run('UPDATE cm_fotos SET ativa=0, desativada_em=? WHERE id=?', [now(), f.id]);
    await auditar(ator, 'foto-retirada', alunoId, `versão ${f.versao} (continua no histórico)`);
    return json({ ok: true });
  }
  /** Exclusão definitiva de uma versão (original, padrão e miniatura). Só o Administrador. */
  if (path === '/carometro/foto/excluir' && method === 'POST') {
    await requireAdmin(c);
    const b = await c.body(), f = await q1('SELECT * FROM cm_fotos WHERE id=?', [Number(b.id) || 0]) ?? fail(404, 'Versão não encontrada.');
    for (const cam of [f.caminho_original, f.caminho_padrao, f.caminho_mini]) await run('DELETE FROM arquivos WHERE caminho=?', [cam]);
    await run('DELETE FROM cm_fotos WHERE id=?', [f.id]);
    await auditar(ator, 'foto-excluida', Number(f.aluno_id), `versão ${f.versao} apagada definitivamente`);
    return json({ ok: true });
  }
  if (path === '/carometro/pendencias' && method === 'GET') {
    const permitidos=new Set((await q('SELECT id,turma FROM ui_alunos')).filter(a=>permiteTurma(String(a.turma))).map(a=>Number(a.id)));
    const todas = (await calcularPendencias()).filter(p=>p.alunoId?permitidos.has(p.alunoId):!contextoCm.getStore()?.segmentos.length), tipo = c.qs('tipo'), est = c.qs('estado') === 'ignoradas' ? 'ignoradas' : 'abertas';
    const rows = todas.filter((p) => (!tipo || p.tipo === tipo) && (est === 'ignoradas' ? p.ignorada : !p.ignorada));
    return json({ tipos: TIPOS_PEND, contagem: contagemPend(todas), abertas: todas.filter((p) => !p.ignorada).length, ignoradas: todas.filter((p) => p.ignorada).length, total: rows.length, limite: 1000, rows: rows.slice(0, 1000) });
  }
  if (path === '/carometro/pendencias/ignorar' && method === 'POST') {
    await exigirCm(c,'substituir');
    const b = await c.body(), motivo = strv(b.motivo).replace(/\s+/g, ' ').trim().slice(0, 300), chaves = [...new Set((Array.isArray(b.chaves) ? b.chaves : []).map(String))].filter((k) => /^[a-z_]+:i?\d+$/.test(k)).slice(0, 500);
    if (motivo.length < 3) fail(400, 'Explique em poucas palavras por que a pendência pode ficar como está.');
    if (!chaves.length) fail(400, 'Escolha as pendências.');
    const validas = new Set((await calcularPendencias()).filter(p=>!p.alunoId || false).map(p=>p.chave));
    for(const p of await calcularPendencias()) if(p.alunoId){try{await exigirAluno(p.alunoId);validas.add(p.chave);}catch{}}
    if(contextoCm.getStore()?.segmentos.length) for(const k of [...validas]) if(k.startsWith('arquivo_orfao')) validas.delete(k);
    let n = 0;
    for (const k of chaves) if (validas.has(k)) { await run('INSERT INTO cm_pendencias_ign(chave,motivo,por,em) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE motivo=VALUES(motivo),por=VALUES(por),em=VALUES(em)', [k, motivo, ator, now()]); n++; }
    await auditar(ator, 'pendencias-ignoradas', null, `${n} pendência(s): ${motivo}`);
    return json({ ok: true, ignoradas: n });
  }
  if (path === '/carometro/pendencias/reabrir' && method === 'POST') {
    await exigirCm(c,'substituir');
    const b = await c.body(), chaves = (Array.isArray(b.chaves) ? b.chaves : []).map(String).filter((k) => /^[a-z_]+:i?\d+$/.test(k)).slice(0, 500);
    const todosPend=await calcularPendencias();
    for(const k of chaves){const p=todosPend.find(p=>p.chave===k);if(!p)fail(404,'Pendência não encontrada.');if(p.alunoId)await exigirAluno(p.alunoId);else if(contextoCm.getStore()?.segmentos.length)fail(403,'Pendência fora do seu segmento.');}
    let n = 0; for (const k of chaves) n += await run('DELETE FROM cm_pendencias_ign WHERE chave=?', [k]);
    await auditar(ator, 'pendencias-reabertas', null, `${n} pendência(s)`);
    return json({ ok: true, reabertas: n });
  }
  if (path === '/carometro/pdf' && method === 'GET') {
    await exigirCm(c,'imprimir');
    const origem = c.qs('origem'), orient = c.qs('orientacao') === 'paisagem' ? 'paisagem' : 'retrato', por = [4, 5, 6].includes(Number(c.qs('porlinha'))) ? (Number(c.qs('porlinha')) as 4 | 5 | 6) : 5;
    const soAut = c.qs('so_autorizados') === '1';
    let ids: number[] = [], titulo = '', mostrarTurma = false;
    if (origem === 'turma') {
      const turma = c.qs('turma');
      ids = (await q('SELECT id FROM ui_alunos WHERE ativo=1 AND turma=?', [turma])).map((r) => Number(r.id));
      if (!turma || !ids.length) fail(404, 'Turma sem alunos ativos.');
      titulo = turma;
    } else if (origem === 'selecao') {
      const s = await q1('SELECT * FROM cm_selecoes WHERE id=?', [Number(c.qs('selecao')) || 0]);
      if (!s || (String(s.dono) !== String(u.codigo ?? '') && !Number(s.compartilhada) && !Number(u.admin))) fail(404, 'Seleção não encontrada.');
      ids = (await q('SELECT aluno_id FROM cm_selecao_itens WHERE selecao_id=?', [s.id])).map((r) => Number(r.aluno_id));
      titulo = `Seleção: ${s.nome}`; mostrarTurma = true;
    } else fail(400, 'Escolha a turma ou uma seleção.');
    if (ids.length > 600) fail(400, 'O PDF aceita até 600 alunos.');
    let alunos = ordenarAlunosPdf((await carregarAlunosPdf(ids)).filter(a=>permiteTurma(a.turma)));
    const total = alunos.length;
    if (soAut) alunos = alunos.filter((a) => a.autorizacao === 'AUTORIZADO');
    if (!alunos.length) fail(404, soAut ? 'Nenhum aluno com autorização de imagem vigente nesta lista.' : 'Nenhum aluno ativo nesta lista.');
    if (origem === 'turma') alunos.sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR'));
    const quando = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Fortaleza', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date());
    const sub = `Ano letivo ${anoLetivo()}${soAut ? ` - somente com autorização de imagem (${alunos.length} de ${total})` : ''}`;
    const r = await carometroPdf(alunos, { titulo, subtitulo: sub, orientacao: orient, porLinha: por, matricula: c.qs('matricula') === '1', mostrarTurma }, fotoPadrao, quando);
    await auditar(ator, c.qs('baixar') === '1' ? 'pdf-baixado' : 'pdf-previa', null, `${titulo}: ${alunos.length} aluno(s), ${r.paginas} página(s)`);
    const nome = `Carometro-${titulo.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'lista'}.pdf`;
    return new Response(new Uint8Array(r.buf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `${c.qs('baixar') === '1' ? 'attachment' : 'inline'}; filename="${nome}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'X-Carometro-Paginas': String(r.paginas), 'X-Carometro-Alunos': String(alunos.length) } });
  }
  if (method !== 'GET') fail(405, 'Método não permitido.');
  const todos = (await carregar()).filter(a=>permiteTurma(a.turma));

  if (path === '/carometro/alunos') {
    const busca = lower(c.qs('busca')).trim(), seg = c.qs('segmento'), serie = c.qs('serie'), turma = c.qs('turma'), aut = c.qs('autorizacao');
    const nb = normNome(busca);
    const foto = c.qs('foto');
    const base0 = todos.filter((a) => (!seg || a.segmento === seg) && (!serie || a.serie === serie) && (!turma || a.turma === turma) && (!aut || a.autorizacao === aut)
      && (!nb || normNome(a.nome).includes(nb) || lower(a.matricula).includes(busca)));
    const rows = base0.filter((a) => foto === 'sem' ? !a.fotoId : foto === 'com' ? !!a.fotoId : true);
    rows.sort((x, y) => compararTurmaCm(x.turma, y.turma) || x.nome.localeCompare(y.nome, 'pt-BR'));
    const base = todos.filter((a) => (!seg || a.segmento === seg));
    const navMapa = new Map<string, { turma: string; alunos: number; semFoto: number }>();
    for (const a of base) if (a.turma) { const x = navMapa.get(a.turma) ?? { turma: a.turma, alunos: 0, semFoto: 0 }; x.alunos++; if (!a.fotoId) x.semFoto++; navMapa.set(a.turma, x); }
    const nav = [...navMapa.values()].sort((x, y) => compararTurmaCm(x.turma, y.turma));
    const series = [...new Set(base.map((a) => a.serie).filter(Boolean))].sort(compararTurmaCm);
    const turmas = [...new Set(base.filter((a) => !serie || a.serie === serie).map((a) => a.turma).filter(Boolean))].sort(compararTurmaCm);
    const ind = { alunos: base0.length, comFoto: base0.filter((a) => a.fotoId).length, semFoto: base0.filter((a) => !a.fotoId).length, duplicados: base0.filter((a) => a.duplicado).length, semTurma: base0.filter((a) => !a.segmento).length };
    return json({ anoLetivo: anoLetivo(), indicadores: ind, segmentos: SEGMENTOS_CM, series, turmas, nav, total: rows.length, limite: 600, rows: rows.slice(0, 600).map(publico) });
  }

  if (path === '/carometro/turmas') {
    const porSeg = SEGMENTOS_CM.map((s) => {
      const alunos = todos.filter((a) => a.segmento === s.k);
      const mapa = new Map<string, number>();
      for (const a of alunos) mapa.set(a.turma, (mapa.get(a.turma) ?? 0) + 1);
      const series = new Map<string, { serie: string; turmas: { turma: string; alunos: number }[] }>();
      for (const [turma, n] of [...mapa].sort((x, y) => compararTurmaCm(x[0], y[0]))) {
        const sr = serieDe(turma) || turma, g = series.get(sr) ?? { serie: sr, turmas: [] };
        g.turmas.push({ turma, alunos: n }); series.set(sr, g);
      }
      return { ...s, alunos: alunos.length, series: [...series.values()] };
    });
    const semSeg = todos.filter((a) => !a.segmento);
    return json({ anoLetivo: anoLetivo(), segmentos: porSeg, semSegmento: semSeg.length, total: todos.length });
  }

  if (path === '/carometro/aluno') {
    const id = Number(c.qs('id'));
    const a = todos.find((x) => x.id === id) ?? fail(404, 'Aluno não encontrado.');
    const colegas = todos.filter((x) => x.turma === a.turma).length;
    const fonte = a.autorizacao === 'SEM_INFORMACAO' ? '' : 'Módulo Uso de Imagem';
    const ev = await q1('SELECT autorizo_em FROM ui_solicitacoes WHERE aluno_id=? AND status<>\'CANCELADO\' ORDER BY id DESC LIMIT 1', [id]);
    return json({ aluno: { ...publico(a), anoLetivo: anoLetivo(), colegasNaTurma: colegas, autorizacaoFonte: fonte, autorizacaoDesde: String(ev?.autorizo_em ?? a._em ?? '').slice(0, 10), autorizacaoValeAte: a._vence }, fotos: await historicoFotos(id), podeEditar: !!(contextoCm.getStore()?.importar || contextoCm.getStore()?.substituir), podeBaixar: !!contextoCm.getStore()?.baixar, podeExcluir: !!Number(u.admin) });
  }
  return fail(404, 'Rota não encontrada.');
}
