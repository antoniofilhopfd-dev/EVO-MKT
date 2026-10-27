/**
 * Importa todas as abas do manifesto gerado a partir das três planilhas, mantendo células
 * originais e proveniência. NÃO altera dados oficiais da API Meta nem adivinha duplicatas.
 *
 * Uso a partir da pasta web:
 *   node scripts/importar-historico-instagram.mjs /caminho/manifesto_todas_as_abas.json --dry-run
 *   node scripts/importar-historico-instagram.mjs /caminho/manifesto_todas_as_abas.json --apply
 * Requer migração 032 aplicada e DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME configurados.
 */
import fs from 'node:fs/promises';
import mysql from 'mysql2/promise';
const args=process.argv.slice(2);
const file=args.find(a=>!a.startsWith('--'));
const aplicar=args.includes('--apply');
if (!file || (aplicar && args.includes('--dry-run'))) {
  console.error('Uso: node scripts/importar-historico-instagram.mjs manifesto.json [--dry-run|--apply]');
  process.exit(2);
}
const data=JSON.parse(await fs.readFile(file,'utf8'));
if (!data || !data.conteudo || !Array.isArray(data.abas)) throw Error('Manifesto inválido.');
const normalizar=v=>typeof v==='string' && ['-','x','X','n/a','N/A'].includes(v.trim())?null:v;
const contaDe=(arquivo,aba)=>{
  const s=(arquivo+' '+aba).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  if (/geracao|\bger\b/.test(s)) return '@geracao.evolucao';
  if (/evolucao|\bev\b/.test(s)) return '@evolucaopb';
  return null;
};
const categoriaDe=aba=>{
  const s=aba.toLowerCase();
  if (/stori/.test(s)) return 'stories';
  if (/seman/.test(s)) return 'semanal';
  if (/mensa/.test(s)) return 'mensal';
  if (/feed|posts/.test(s)) return 'publicacoes';
  if (/insig|metric/.test(s)) return 'indicadores';
  if (/camp/.test(s)) return 'campanhas';
  return 'historico';
};
const lista=[];
for (const [arquivo,abas] of Object.entries(data.conteudo)) for (const [aba,linhas] of Object.entries(abas)) {
  if (!Array.isArray(linhas)) throw Error('Aba inválida: '+aba);
  for (const l of linhas) {
    if (!Number.isInteger(l.row) || l.row < 1 || !l.cells || typeof l.cells!=='object') throw Error('Linha inválida: '+arquivo+'/'+aba);
    const cells=Object.fromEntries(Object.entries(l.cells).map(([k,v])=>[k,normalizar(v)]));
    // Guardar a data como célula original, sem supor se o Excel usou texto ou serial.
    lista.push([arquivo,aba,l.row,contaDe(arquivo,aba),categoriaDe(aba),null,null,JSON.stringify(cells),new Date().toISOString()]);
  }
}
const total=lista.length;
const chaves=new Set(lista.map(r=>r.slice(0,3).join('\u0000')));
if (chaves.size!==total) throw Error('Duplicidade de origem no próprio manifesto.');
console.log(JSON.stringify({abas:data.abas.length,linhas:total,modo:aplicar?'GRAVAÇÃO':'SIMULAÇÃO',contas:[...new Set(lista.map(r=>r[3]))]},null,2));
if(!aplicar){console.log('Nenhum dado gravado. Para importar use --apply após backup e migração 032.');process.exit(0);}
for(const k of ['DB_USER','DB_NAME']) if(!process.env[k]) throw Error('Falta configurar '+k);
const connection=await mysql.createConnection({host:process.env.DB_HOST||'localhost',port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER,password:process.env.DB_PASSWORD||'',database:process.env.DB_NAME,charset:'utf8mb4'});
try{
  await connection.beginTransaction();
  const [tables]=await connection.query("SHOW TABLES LIKE 'instagram_historico_planilhas'");
  if(!tables.length) throw Error('Aplique a migração 032 antes da importação.');
  let inseridas=0,existentes=0;
  for(const row of lista){
    const [result]=await connection.execute(`INSERT IGNORE INTO instagram_historico_planilhas (arquivo,aba,linha_origem,conta,categoria,data_referencia,identificador,valores_json,atualizado_em) VALUES (?,?,?,?,?,?,?,?,?)`,row);
    if(result.affectedRows===1) inseridas++;else existentes++;
  }
  await connection.commit();
  console.log(JSON.stringify({resultado:'importado',inseridas,jaExistentes:existentes,total}));
}catch(e){await connection.rollback();throw e;}finally{await connection.end();}
