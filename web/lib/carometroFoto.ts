import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { q, q1, run } from './db';
import { now } from './util';

/** Regras das fotos do Carômetro: JPG, PNG ou WebP, até 5 MB (fotos pequenas, a partir de 100×100, são aceitas e não são ampliadas). O original é guardado como veio; a versão padrão (600×800, 3:4) é a que aparece nas telas e no PDF. */
export const FOTO_MAX_BYTES = 5 * 1048576;
export const FOTO_PADRAO = { w: 600, h: 800 }, FOTO_MINI = { w: 240, h: 320 };
const MIME: Record<string, string> = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

export interface FotoPronta { original: Buffer; padrao: Buffer; mini: Buffer; mime: string; largura: number; altura: number; sha256: string; aviso: string }

/** Confere o conteúdo de verdade (não a extensão) e gera as versões. Devolve o texto do erro quando o arquivo não serve. */
export async function prepararFoto(bruto: Buffer): Promise<FotoPronta | { erro: string }> {
  if (!bruto.length) return { erro: 'Escolha uma foto.' };
  if (bruto.length > FOTO_MAX_BYTES) return { erro: 'A foto passa de 5 MB. Reduza o tamanho e envie de novo.' };
  try {
    const img = sharp(bruto, { limitInputPixels: 60_000_000, failOn: 'error' });
    const meta = await img.metadata();
    const mime = MIME[String(meta.format)];
    if (!mime) return { erro: 'Formato não aceito. Envie JPG, PNG ou WebP.' };
    if ((meta.pages ?? 1) > 1) return { erro: 'Imagem animada não é aceita. Envie uma foto comum.' };
    // dimensões já com a rotação do EXIF aplicada (foto de celular costuma vir girada)
    const girada = [5, 6, 7, 8].includes(meta.orientation ?? 1);
    const largura = girada ? meta.height ?? 0 : meta.width ?? 0, altura = girada ? meta.width ?? 0 : meta.height ?? 0;
    if (largura < 100 || altura < 100) return { erro: 'A foto é pequena demais (mínimo 100 × 100 pixels).' };
    // recorte centralizado, sem distorcer; rotate() aplica o EXIF e a conversão remove metadados (inclusive localização)
    const base = () => sharp(bruto, { limitInputPixels: 60_000_000 }).rotate().flatten({ background: '#ffffff' });
    const padrao = await base().resize(FOTO_PADRAO.w, FOTO_PADRAO.h, { fit: 'cover', position: 'attention', withoutEnlargement: true }).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
    const mini = await base().resize(FOTO_MINI.w, FOTO_MINI.h, { fit: 'cover', position: 'attention', withoutEnlargement: true }).jpeg({ quality: 78, mozjpeg: true }).toBuffer();
    const avisos: string[] = [];
    if(await possivelDesfoque(bruto)) avisos.push('Possível desfoque: confira a nitidez.');
    const prop = largura / altura;
    if (largura < 600 || altura < 800) avisos.push('Resolução baixa: confira a nitidez antes de imprimir.');
    if (prop > 1.05) avisos.push('Foto na horizontal: foi recortada no centro. Confira o enquadramento.');
    return { original: bruto, padrao, mini, mime, largura, altura, sha256: sha(bruto), aviso: avisos.join(' ').slice(0, 200) };
  } catch (e) {
    const m = String((e as Error)?.message ?? e);
    if (/sharp|libvips|glibc|Cannot find module|dlopen/i.test(m)) {
      console.error('[carometro] processamento de imagens indisponível:', m.slice(0, 300));
      return { erro: 'O servidor não conseguiu processar a imagem (módulo de imagens indisponível). Avise o suporte.' };
    }
    return { erro: 'Não foi possível ler esta imagem. Envie um JPG, PNG ou WebP válido.' };
  }
}

export async function auditar(ator: string, acao: string, alunoId: number | null, detalhe: string): Promise<void> {
  await run('INSERT INTO cm_auditoria(quando,ator,acao,aluno_id,detalhe) VALUES(?,?,?,?,?)', [now(), ator, acao, alunoId, detalhe.slice(0, 400)]);
}

const ext = (mime: string) => (mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg');
/** Guarda uma nova versão e a torna a ativa; a anterior continua no histórico. */
export async function guardarFoto(alunoId: number, f: FotoPronta, nome: string, origem: string, ator: string): Promise<number> {
  const versao = Number((await q1('SELECT COALESCE(MAX(versao),0)+1 v FROM cm_fotos WHERE aluno_id=?', [alunoId]))?.v ?? 1);
  const base = `CAROMETRO/${alunoId}/v${versao}_${Date.now().toString(36)}`;
  const cam = { o: `${base}_original.${ext(f.mime)}`, p: `${base}_padrao.jpg`, m: `${base}_mini.jpg` };
  const ins = (c: string, mime: string, b: Buffer) => run('INSERT INTO arquivos(caminho,mime,tamanho,conteudo,criado_em) VALUES(?,?,?,?,?)', [c, mime, b.length, b, now()]);
  await ins(cam.o, f.mime, f.original); await ins(cam.p, 'image/jpeg', f.padrao); await ins(cam.m, 'image/jpeg', f.mini);
  await run('UPDATE cm_fotos SET ativa=0, desativada_em=? WHERE aluno_id=? AND ativa=1', [now(), alunoId]);
  await run('INSERT INTO cm_fotos(aluno_id,versao,caminho_original,caminho_padrao,caminho_mini,nome_original,mime,largura,altura,tamanho,sha256,origem,aviso,ativa,enviado_por,enviado_em) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)',
    [alunoId, versao, cam.o, cam.p, cam.m, nome.replace(/[^\w.\- ]/g, '_').slice(0, 160), f.mime, f.largura, f.altura, f.original.length, f.sha256, origem, f.aviso, ator, now()]);
  await auditar(ator, versao === 1 ? 'foto-enviada' : 'foto-substituida', alunoId, `versão ${versao}, ${f.largura}×${f.altura}, ${f.original.length} bytes`);
  return Number((await q1('SELECT id FROM cm_fotos WHERE aluno_id=? AND versao=?', [alunoId, versao]))?.id);
}

export const historicoFotos = (alunoId: number) =>
  q('SELECT id,versao,mime,largura,altura,tamanho,origem,aviso,ativa,enviado_por,enviado_em,desativada_em FROM cm_fotos WHERE aluno_id=? ORDER BY versao DESC', [alunoId]);

export async function lerArquivoFoto(fotoId: number, tam: 'mini' | 'padrao' | 'original'): Promise<{ buf: Buffer; mime: string; nome: string; alunoId: number } | null> {
  const f = await q1('SELECT * FROM cm_fotos WHERE id=?', [fotoId]);
  if (!f) return null;
  const cam = tam === 'mini' ? f.caminho_mini : tam === 'padrao' ? f.caminho_padrao : f.caminho_original;
  const a = await q1('SELECT mime, conteudo FROM arquivos WHERE caminho=?', [cam]);
  if (!a) return null;
  return { buf: Buffer.from(a.conteudo), mime: String(a.mime), nome: String(f.nome_original), alunoId: Number(f.aluno_id) };
}

/** Enquadramento normalizado sobre a imagem orientada. Mantém o original intacto. */
export async function enquadrarFoto(bruto: Buffer, dados: unknown): Promise<{ padrao: Buffer; mini: Buffer }> {
  const d = dados as Record<string, unknown>;
  const x = Number(d?.x), y = Number(d?.y), w = Number(d?.w), h = Number(d?.h), giro = Number(d?.giro ?? 0);
  if (![x,y,w,h,giro].every(Number.isFinite) || x < 0 || y < 0 || w <= 0 || h <= 0 || x+w > 1.001 || y+h > 1.001 || ![0,90,180,270].includes(giro)) throw new Error('Enquadramento inválido.');
  const { data, info } = await sharp(await sharp(bruto).rotate().toBuffer()).rotate(giro).flatten({background:'#fff'}).toBuffer({resolveWithObject:true});
  const left = Math.min(info.width-1, Math.round(x*info.width)), top = Math.min(info.height-1, Math.round(y*info.height));
  const crop = { left, top, width: Math.max(1, Math.min(info.width-left, Math.round(w*info.width))), height: Math.max(1, Math.min(info.height-top, Math.round(h*info.height))) };
  const versao = (width: number, height: number) => sharp(data).extract(crop).resize(width,height,{fit:'cover'}).jpeg({quality:86}).toBuffer();
  return {padrao:await versao(600,800),mini:await versao(240,320)};
}

/** Variância do Laplaciano: apenas um alerta de conferência, nunca bloqueia uma foto. */
export async function possivelDesfoque(buf: Buffer): Promise<boolean> {
 const {data,info}=await sharp(buf).rotate().resize(192,192,{fit:'inside'}).greyscale().raw().toBuffer({resolveWithObject:true});
 let sum=0,squares=0,n=0;
 for(let y=1;y<info.height-1;y++)for(let x=1;x<info.width-1;x++){
  const i=y*info.width+x,v=4*data[i]-data[i-1]-data[i+1]-data[i-info.width]-data[i+info.width];sum+=v;squares+=v*v;n++;
 }
 return n>0 && squares/n-(sum/n)**2<20;
}
