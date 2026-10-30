import { Ctx } from '../ctx';
import { requireAdmin } from '../auth';
import { q,q1,run } from '../db';
import { fail,now } from '../util';
import { json } from './handlers';
import { contextoCm, exigirCm, exigirTurma, permiteTurma } from '../carometroAcesso';
import { SEGMENTOS_CM, segmentoCm } from '../carometro';
import { auditar } from '../carometroFoto';
export async function carometroGestaoRoute(c: Ctx, ator: string): Promise<Response|null> {
 const {path,method}=c;
 if(path==='/carometro/acesso') return json(contextoCm.getStore());
 if(path==='/carometro/permissoes') {
  await requireAdmin(c);
  if(method==='GET') return json({usuarios:await q('SELECT codigo,nome,role,admin FROM users WHERE ativo=1'),politicas:await q('SELECT * FROM cm_permissoes'),segmentos:SEGMENTOS_CM});
  if(method!=='POST')fail(405,'Método não permitido.');
  const b=await c.body(), codigo=String(b.codigo??'');
  const u=await q1('SELECT admin FROM users WHERE codigo=? AND ativo=1',[codigo])??fail(404,'Usuário não encontrado.');
  if(Number(u.admin))fail(400,'O Administrador mantém acesso completo.');
  const segmentos=Array.isArray(b.segmentos)?[...new Set(b.segmentos.map(String))]:[];
  if(segmentos.some(s=>!SEGMENTOS_CM.some(x=>x.k===s)))fail(400,'Segmento inválido.');
  await run('REPLACE INTO cm_permissoes(codigo,segmentos,consultar,importar,substituir,baixar,imprimir) VALUES(?,?,?,?,?,?,?)',[codigo,JSON.stringify(segmentos),...['consultar','importar','substituir','baixar','imprimir'].map(k=>b[k]?1:0)]);
  await auditar(ator,'permissoes-alteradas',null,codigo);return json({ok:true});
 }
 if(!path.startsWith('/carometro/ano'))return null;
 await exigirCm(c,'substituir');
 if(method==='GET')return json({ano:new Date().getFullYear(),historico:await q('SELECT ano,COUNT(*) alunos,MAX(revisado_em) revisadoEm FROM cm_anos GROUP BY ano ORDER BY ano DESC'),alunos:(await q('SELECT id,matricula,nome,turma FROM ui_alunos WHERE ativo=1 ORDER BY turma,nome')).filter(a=>permiteTurma(String(a.turma)))});
 if(method!=='POST')fail(405,'Método não permitido.');
 const b=await c.body(), ano=Number(b.ano), linhas=Array.isArray(b.linhas)?b.linhas:[];
 if(!Number.isInteger(ano)||ano<2020||ano>2100||!linhas.length||linhas.length>5000)fail(400,'Informe o ano e até 5000 alunos.');
 const ids=new Set<number>();
 for(const l of linhas) {
  const id=Number(l.id),turma=String(l.turma??'').trim();
  if(ids.has(id)||!segmentoCm(turma)||turma.length>60)fail(400,'Confira as turmas e os alunos repetidos.');ids.add(id);
  const a=await q1('SELECT id,turma FROM ui_alunos WHERE id=? AND ativo=1 FOR UPDATE',[id])??fail(404,'Aluno não encontrado.');
  exigirTurma(String(a.turma));exigirTurma(turma);
  if(String(a.turma)!==String(l.anterior))fail(409,'O cadastro foi alterado. Reabra a revisão antes de aplicar.');
  await run('INSERT IGNORE INTO cm_anos(ano,aluno_id,turma,segmento,revisado_por,revisado_em) VALUES(?,?,?,?,?,?)',[ano-1,id,a.turma,segmentoCm(String(a.turma)),ator,now()]);
  await run('INSERT INTO cm_anos(ano,aluno_id,turma,segmento,revisado_por,revisado_em) VALUES(?,?,?,?,?,?) ON DUPLICATE KEY UPDATE turma=VALUES(turma),segmento=VALUES(segmento),revisado_por=VALUES(revisado_por),revisado_em=VALUES(revisado_em)',[ano,id,turma,segmentoCm(turma),ator,now()]);
  await run('UPDATE ui_alunos SET turma=?,segmento=?,atualizado_em=? WHERE id=?',[turma,segmentoCm(turma),now(),id]);
 }
 await auditar(ator,'revisao-anual',null,`${ano}: ${ids.size} aluno(s), fotos e matrículas preservadas`);return json({ok:true,alunos:ids.size});
}
