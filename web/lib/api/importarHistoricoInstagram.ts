import { Ctx } from '../ctx';
import { requireAdmin } from '../auth';
import { getPool } from '../db';
import { makeBackup } from '../backup';
import { fail } from '../util';
import { json } from './handlers';

const allowed = new Set(['Métricas - Instagram.xlsx','Instagram_Planilha.xlsx','Marketing Hub — Colégio Evolução.xlsx']);
const column = (v: unknown, n: number) => typeof v === 'string' ? v.slice(0,n) : '';
const conta = (file:string,tab:string) => {
 const s=(file+' '+tab).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 return /geracao|\bger\b/.test(s)?'@geracao.evolucao':/evolucao|\bev\b/.test(s)?'@evolucaopb':null;
};
const categoria=(tab:string)=>/stori/i.test(tab)?'stories':/seman/i.test(tab)?'semanal':/mensa/i.test(tab)?'mensal':/feed|posts/i.test(tab)?'publicacoes':/insig|metric/i.test(tab)?'indicadores':/camp/i.test(tab)?'campanhas':'historico';

/** Administrative-only upload, isolated from Meta metrics. No edit/delete operations. */
export async function importarHistoricoInstagram(c: Ctx): Promise<Response> {
 await requireAdmin(c);
 if(c.method!=='POST') return fail(405,'Método não permitido');
 const b=await c.body();
 if(b.acao==='backup') {
   const nome=await makeBackup('antes-importacao-historico-instagram',{completo:true});
   return json({ok:true,backup:nome});
 }
 if(b.acao!=='lote' || !Array.isArray(b.linhas) || !b.linhas.length || b.linhas.length>100)
   return fail(400,'Lote inválido (1 a 100 registros).');
 const values:(string | number | null)[][]=[];
 const keys=new Set<string>();
 for(const item of b.linhas){
   if(!item || !allowed.has(item.arquivo) || typeof item.aba!=='string' || !item.aba.trim() || item.aba.length>180 || !Number.isInteger(item.row) || item.row<1 || !item.cells || typeof item.cells!=='object' || Array.isArray(item.cells))
     return fail(400,'Registro inválido.');
   const key=item.arquivo+'\u001f'+item.aba+'\u001f'+item.row;
   if(keys.has(key)) return fail(400,'Linha repetida no lote.');
   keys.add(key);
   const serialized=JSON.stringify(item.cells);
   if(serialized.length>60000) return fail(400,'Linha muito extensa.');
   values.push([column(item.arquivo,180),column(item.aba,180),item.row,conta(item.arquivo,item.aba),categoria(item.aba),null,null,serialized,new Date().toISOString()]);
 }
 const db=await getPool().getConnection();
 try{
   await db.beginTransaction();
   const [tables]=await db.query("SHOW TABLES LIKE 'instagram_historico_planilhas'");
   if(!(tables as unknown[]).length) { await db.rollback(); return fail(409,'Migração 032 ainda não aplicada.'); }
   let inseridas=0,existentes=0;
   for(const row of values){
     const [result]=await db.execute('INSERT IGNORE INTO instagram_historico_planilhas (arquivo,aba,linha_origem,conta,categoria,data_referencia,identificador,valores_json,atualizado_em) VALUES (?,?,?,?,?,?,?,?,?)',row);
     if((result as {affectedRows:number}).affectedRows===1) inseridas++; else existentes++;
   }
   await db.commit();
   return json({ok:true,inseridas,existentes,total:values.length});
 }catch(e){await db.rollback();throw e;}finally{db.release();}
}
