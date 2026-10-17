import { Ctx } from '../ctx';
import { requireInternal } from '../auth';
import { q, q1, run } from '../db';
import { conteudoCoerente } from '../files';
import { ALLOWED_EXT, audit } from '../records';
import { setSetting, setting } from '../settings';
import { envInt, fail, now, Row, safePart, strv } from '../util';
import { randHex } from '../crypto';
import { json } from './handlers';

/**
 * Biblioteca de Arquivos: todos os arquivos guardados no MySQL (tabela `arquivos`), com pastas.
 * Envios novos ficam em BIBLIOTECA/<pasta>/. Anexos de solicitações e mídias de posts continuam onde estão e aparecem em pastas próprias.
 * Renomear e mover só mudam o nome de exibição e a pasta (o caminho não muda, então nenhuma referência quebra).
 * Arquivo em uso por algum registro não pode ser excluído.
 */
const MIME: Record<string, string> = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', mp4: 'video/mp4', mov: 'video/quicktime', txt: 'text/plain', csv: 'text/csv', mp3: 'audio/mpeg', wav: 'audio/wav' };
const pastaVirtual = (caminho: string) => (caminho.startsWith('ANEXOS/SOLICITACOES/') ? 'Anexos de solicitações' : caminho.startsWith('ANEXOS/CONTEUDOS/') ? 'Mídias do Instagram' : caminho.startsWith('ANEXOS/') ? 'Outros anexos' : 'Geral');
const tipoDe = (mime: string) => (mime.startsWith('image/') ? 'imagem' : mime.startsWith('video/') ? 'video' : mime.startsWith('audio/') ? 'audio' : mime === 'application/pdf' ? 'documento' : 'outro');
const nomePasta = (v: unknown) => strv(v).replace(/[\\/]+/g, ' ').replace(/[^\p{L}\p{N} ._-]/gu, '').trim().slice(0, 60);
const pastasCriadas = async (): Promise<string[]> => { try { const l = JSON.parse(await setting('arquivos_pastas', '[]')); return Array.isArray(l) ? l.map(String) : []; } catch { return []; } };

async function emUso(caminho: string): Promise<boolean> {
  const esc = caminho.replace(/[\\%_]/g, (m) => '\\' + m);
  return !!(await q1('SELECT 1 FROM records WHERE data LIKE ? LIMIT 1', [`%${esc}%`])) || !!(await q1('SELECT 1 FROM ig_publish WHERE conteudo_id=? LIMIT 1', [caminho]));
}
const linha = (r: Row) => {
  const caminho = String(r.caminho);
  const nome = r.nome ? String(r.nome) : caminho.split('/').pop()!;
  return { caminho, nome, pasta: r.pasta ? String(r.pasta) : pastaVirtual(caminho), mime: r.mime, tipo: tipoDe(String(r.mime)), tamanho: Number(r.tamanho), criadoEm: r.criado_em, origem: caminho.startsWith('BIBLIOTECA/') ? 'biblioteca' : 'registro' };
};

export async function arquivosRoute(c: Ctx): Promise<Response> {
  const u = await requireInternal(c);
  const { path, method } = c;
  if (path === '/arquivos/lista' && method === 'GET') {
    const rows = (await q('SELECT caminho,mime,tamanho,criado_em,nome,pasta FROM arquivos ORDER BY criado_em DESC LIMIT 5000')).map(linha);
    const pastas = [...new Set([...(await pastasCriadas()), ...rows.map((r) => r.pasta)])].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    return json({ rows, pastas, maxMb: envInt('MAX_UPLOAD_MB', 15) });
  }
  if (path === '/arquivos/pasta' && method === 'POST') {
    const nome = nomePasta((await c.body()).nome);
    if (nome.length < 2) fail(400, 'Informe o nome da pasta (mínimo de 2 letras).');
    const l = await pastasCriadas();
    if (!l.some((x) => x.toLowerCase() === nome.toLowerCase())) { l.push(nome); await setSetting('arquivos_pastas', JSON.stringify(l.slice(0, 200))); }
    await audit(String(u.codigo), 'arquivos-pasta', 'arquivos', nome);
    return json({ ok: true, nome }, 201);
  }
  if (path === '/arquivos/enviar' && method === 'POST') {
    if (!c.header('content-type').includes('multipart/form-data')) fail(400, 'Envie os arquivos em um formulário (multipart).');
    const form = await c.req.formData();
    const files = form.getAll('files').filter((f): f is File => typeof f !== 'string');
    if (!files.length) fail(400, 'Escolha ao menos um arquivo.');
    if (files.length > 10) fail(400, 'Envie no máximo 10 arquivos por vez.');
    const pasta = nomePasta(form.get('pasta')) || 'Geral';
    const max = envInt('MAX_UPLOAD_MB', 15) * 1048576;
    const salvos: Row[] = [];
    for (const f of files) {
      if (f.size > max) fail(413, `"${f.name}" passa do limite de ${Math.floor(max / 1048576)} MB.`);
      const base = safePart(f.name.split(/[\\/]/).pop() || '') || 'arquivo';
      const ext = (base.includes('.') ? base.split('.').pop()! : '').toLowerCase();
      if (!ALLOWED_EXT.includes(ext)) fail(400, `Tipo de arquivo não permitido: .${ext}`);
      const buf = Buffer.from(await f.arrayBuffer());
      if (!conteudoCoerente(ext, buf)) fail(400, `O conteúdo de "${base}" não corresponde ao tipo .${ext}.`);
      let caminho = `BIBLIOTECA/${safePart(pasta)}/${base}`;
      if (await q1('SELECT 1 FROM arquivos WHERE caminho=?', [caminho])) caminho = `BIBLIOTECA/${safePart(pasta)}/${base.slice(0, base.length - ext.length - 1)}_${randHex(4)}.${ext}`;
      await run('INSERT INTO arquivos(caminho,mime,tamanho,conteudo,criado_em,nome,pasta) VALUES(?,?,?,?,?,?,?)', [caminho, MIME[ext] ?? 'application/octet-stream', f.size, buf, now(), base, pasta]);
      salvos.push(linha({ caminho, mime: MIME[ext] ?? 'application/octet-stream', tamanho: f.size, criado_em: now(), nome: base, pasta }));
    }
    await audit(String(u.codigo), 'arquivos-enviar', 'arquivos', String(salvos.length));
    return json({ ok: true, arquivos: salvos }, 201);
  }
  const corpo = method === 'POST' ? await c.body() : {};
  const caminho = strv(corpo.caminho);
  if (path === '/arquivos/renomear' && method === 'POST') {
    const nome = safePart(strv(corpo.nome)).slice(0, 150);
    if (nome.length < 1) fail(400, 'Informe o novo nome.');
    if (!(await q1('SELECT 1 FROM arquivos WHERE caminho=?', [caminho]))) fail(404, 'Arquivo não encontrado.');
    await run('UPDATE arquivos SET nome=? WHERE caminho=?', [nome, caminho]);
    await audit(String(u.codigo), 'arquivos-renomear', 'arquivos', caminho);
    return json({ ok: true, nome });
  }
  if (path === '/arquivos/mover' && method === 'POST') {
    const pasta = nomePasta(corpo.pasta);
    if (!pasta) fail(400, 'Informe a pasta.');
    if (!(await q1('SELECT 1 FROM arquivos WHERE caminho=?', [caminho]))) fail(404, 'Arquivo não encontrado.');
    await run('UPDATE arquivos SET pasta=? WHERE caminho=?', [pasta, caminho]);
    await audit(String(u.codigo), 'arquivos-mover', 'arquivos', caminho);
    return json({ ok: true, pasta });
  }
  if (path === '/arquivos/excluir' && method === 'POST') {
    if (corpo.confirmou !== true) fail(400, 'Confirme a exclusão.');
    if (!(await q1('SELECT 1 FROM arquivos WHERE caminho=?', [caminho]))) fail(404, 'Arquivo não encontrado.');
    if (!caminho.startsWith('BIBLIOTECA/')) fail(409, 'Este arquivo pertence a um registro (solicitação ou publicação) e não é excluído por aqui.');
    if (await emUso(caminho)) fail(409, 'Este arquivo está em uso por um registro e não pode ser excluído.');
    await run('DELETE FROM arquivos WHERE caminho=?', [caminho]);
    await audit(String(u.codigo), 'arquivos-excluir', 'arquivos', caminho);
    return json({ ok: true });
  }
  return fail(404, 'Rota não encontrada.');
}
