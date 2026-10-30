import { q } from './db';
import { Row } from './util';
import { compararTurmaCm, normNome, segmentoCm } from './carometro';

export const TIPOS_PEND: Record<string, string> = {
  sem_foto: 'Sem foto', imagem_baixa: 'Imagem de baixa qualidade', duplicado: 'Nome repetido na turma',
  varias_turmas: 'Mesmo nome em mais de uma turma', sem_turma: 'Turma não reconhecida', arquivo_orfao: 'Arquivo sem aluno (lote aberto)',
};
export interface Pend { chave: string; tipo: string; alunoId: number | null; aluno: string; matricula: string; turma: string; detalhe: string; ignorada: boolean; motivo: string; por: string }

/** Tudo o que atrapalha um carômetro confiável. Calculado na hora a partir dos dados; só as decisões de "deixar como está" ficam guardadas. */
export async function calcularPendencias(): Promise<Pend[]> {
  const alunos = await q(`SELECT a.id,a.matricula,a.nome,a.turma,f.largura,f.altura,f.aviso,f.id foto_id
    FROM ui_alunos a LEFT JOIN cm_fotos f ON f.aluno_id=a.id AND f.ativa=1 WHERE a.ativo=1`);
  const ign = new Map((await q('SELECT chave,motivo,por FROM cm_pendencias_ign')).map((r) => [String(r.chave), r]));
  const out: Pend[] = [];
  const add = (tipo: string, a: Row | null, alvo: string | number, detalhe: string, extra: Partial<Pend> = {}) => {
    const chave = `${tipo}:${alvo}`, i = ign.get(chave);
    out.push({ chave, tipo, alunoId: a ? Number(a.id) : null, aluno: a ? String(a.nome) : '', matricula: a ? String(a.matricula) : '', turma: a ? String(a.turma ?? '') : '', detalhe, ignorada: !!i, motivo: i ? String(i.motivo) : '', por: i ? String(i.por) : '', ...extra });
  };
  const porNomeTurma = new Map<string, Row[]>(), porNome = new Map<string, Row[]>();
  for (const a of alunos) {
    const n = normNome(String(a.nome));
    porNomeTurma.set(`${a.turma}|${n}`, [...(porNomeTurma.get(`${a.turma}|${n}`) ?? []), a]);
    porNome.set(n, [...(porNome.get(n) ?? []), a]);
  }
  for (const a of alunos) {
    if (!a.foto_id) add('sem_foto', a, a.id, 'Nenhuma foto vinculada.');
    else if (Number(a.largura) < 450 || Number(a.altura) < 600 || /baixa/i.test(String(a.aviso))) add('imagem_baixa', a, a.id, `Resolução ${a.largura}×${a.altura}; o recomendado é 600×800.`);
    if ((porNomeTurma.get(`${a.turma}|${normNome(String(a.nome))}`) ?? []).length > 1) add('duplicado', a, a.id, 'Há outro aluno com o mesmo nome nesta turma (confira se não é cadastro repetido).');
    const outras = (porNome.get(normNome(String(a.nome))) ?? []).filter((x) => x.turma !== a.turma);
    if (outras.length && String(a.turma)) add('varias_turmas', a, a.id, `Também aparece em: ${[...new Set(outras.map((x) => String(x.turma)))].slice(0, 3).join(', ')}. Pode ser troca de turma não atualizada.`);
    if (!segmentoCm(String(a.turma ?? ''))) add('sem_turma', a, a.id, String(a.turma) ? `A turma “${a.turma}” não segue o padrão (ex.: 3º Ano A).` : 'Aluno sem turma.');
  }
  for (const r of await q(`SELECT i.id,i.nome_arquivo,i.estado,i.motivo,i.lote_id FROM cm_lote_itens i JOIN cm_lotes l ON l.id=i.lote_id AND l.estado='simulado' WHERE i.estado IN ('orfa','ambigua','invalida')`))
    add('arquivo_orfao', null, `i${r.id}`, `${r.nome_arquivo} (lote #${r.lote_id}): ${r.motivo || 'sem aluno'}`, { aluno: String(r.nome_arquivo) });
  return out.sort((x, y) => Number(x.ignorada) - Number(y.ignorada) || compararTurmaCm(x.turma, y.turma) || x.aluno.localeCompare(y.aluno, 'pt-BR'));
}
export const contagemPend = (p: Pend[]) => Object.fromEntries(Object.keys(TIPOS_PEND).map((t) => [t, p.filter((x) => x.tipo === t && !x.ignorada).length]));
