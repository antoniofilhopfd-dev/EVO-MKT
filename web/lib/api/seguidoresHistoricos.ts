import { Ctx } from '../ctx';
import { requireInternal } from '../auth';
import { q } from '../db';
import { json } from './handlers';
import { Row, strv } from '../util';

type Ponto={mes:string;data:string;seguidores:number;aproximado:boolean;fonte:string;aba:string;linha:number;conta:string};
const fontes:Record<string,string>={
  'Insigths - Evolução':'@evolucaopb',
  'Cópia de Insigths - Evolução':'@evolucaopb',
  'Insigths - Geração':'@geracao.evolucao',
  'Insigths - Geração 2026':'@geracao.evolucao',
};
function numero(v:unknown):{n:number;aproximado:boolean}|null{
  if(typeof v==='number'&&Number.isInteger(v)&&v>=0)return {n:v,aproximado:false};
  if(typeof v!=='string')return null;
  const s=v.trim().toLowerCase().replace(/\s+/g,' ');
  if(/^(x|--?|-|não disponível)$/i.test(s))return null;
  const m=s.match(/^(\d+(?:[.,]\d+)?)\s*mil$/);
  if(m)return {n:Math.round(Number(m[1].replace(',','.'))*1000),aproximado:true};
  if(/^\d+$/.test(s))return {n:Number(s),aproximado:false};
  return null;
}
function celula(c:Record<string,unknown>,col:string,linha:number):unknown{return c[col+linha];}
function dataFinal(v:unknown,ano:number):string|null{
  if(typeof v!=='string')return null;
  const re=/(\d{1,2})\/(\d{1,2})/g;
  const datas=[...v.matchAll(re)];
  if(!datas.length)return null;
  const ultima=datas[datas.length-1], primeira=datas[0];
  const dia=Number(ultima[1]),mes=Number(ultima[2]);
  // Períodos que cruzam dezembro-janeiro: a seção anual utiliza o ano da data final.
  let y=ano;
  if(datas.length>1 && Number(primeira[2])>Number(ultima[2])) y=ano;
  const d=new Date(Date.UTC(y,mes-1,dia));
  if(d.getUTCFullYear()!==y||d.getUTCMonth()!==mes-1||d.getUTCDate()!==dia)return null;
  return `${y}-${String(mes).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
}
/** Retorna o último registro comprovável de cada mês. Nunca estima o fechamento do mês. */
export async function historicoMensalSeguidores(c:Ctx):Promise<Response>{
  await requireInternal(c);
  const historicos=await q<Row>("SELECT arquivo,aba,linha_origem,valores_json FROM instagram_historico_planilhas WHERE arquivo='Métricas - Instagram.xlsx' AND aba IN (?,?,?,?) ORDER BY aba,linha_origem",
    Object.keys(fontes));
  const pontos:Ponto[]=[];
  const anos=new Map<string,number>();
  for(const r of historicos){
    const aba=strv(r.aba),conta=fontes[aba],linha=Number(r.linha_origem);
    if(!conta||!Number.isInteger(linha))continue;
    let cells:Record<string,unknown>;
    try{cells=JSON.parse(strv(r.valores_json));}catch{continue;}
    const a=celula(cells,'A',linha);
    if((typeof a==='number'||typeof a==='string') && /^20\d{2}$/.test(String(a))){
      anos.set(aba,Number(a));continue;
    }
    const ano=anos.get(aba);if(!ano)continue;
    const data=dataFinal(a,ano), total=numero(celula(cells,'D',linha));
    if(!data||!total)continue;
    pontos.push({mes:data.slice(0,7),data,seguidores:total.n,aproximado:total.aproximado,fonte:'Planilha histórica',aba,linha,conta});
  }
  const meta=await q<Row>("SELECT s.conta,s.dia,s.seguidores FROM ig_seguidores s INNER JOIN (SELECT conta,SUBSTRING(dia,1,7) mes,MAX(dia) dia FROM ig_seguidores GROUP BY conta,SUBSTRING(dia,1,7)) fim ON fim.conta=s.conta AND fim.dia=s.dia");
  // Mapeamento do ID Meta é feito pela configuração, não pelo nome exibido no Instagram.
  const integracoes=await q<Row>("SELECT k,v FROM integration_settings WHERE k IN ('ig_user_id','ig_user_id_geracao')");
  const idPrincipal=strv(integracoes.find(x=>x.k==='ig_user_id')?.v);
  for(const r of meta){
    const conta=strv(r.conta)===idPrincipal?'@evolucaopb':null;
    if(!conta)continue; // IDs adicionais não devem ser atribuídos por suposição.
    const data=strv(r.dia),n=Number(r.seguidores);
    if(!/^20\d\d-\d\d-\d\d$/.test(data)||!Number.isFinite(n))continue;
    pontos.push({mes:data.slice(0,7),data,seguidores:n,aproximado:false,fonte:'Meta API',aba:'ig_seguidores',linha:0,conta});
  }
  const melhor=new Map<string,Ponto>();
  for(const p of pontos){
    const k=p.conta+'|'+p.mes,ant=melhor.get(k);
    if(!ant || (p.fonte==='Meta API'&&ant.fonte!=='Meta API') ||
      (p.fonte===ant.fonte && (p.data>ant.data ||(p.data===ant.data&&!p.aproximado&&ant.aproximado))))
      melhor.set(k,p);
  }
  const rows=[...melhor.values()].sort((a,b)=>a.mes.localeCompare(b.mes)||a.conta.localeCompare(b.conta));
  return json({rows,observacao:'Último registro disponível em cada mês; valores em mil são aproximados. Meses ausentes não são preenchidos.'});
}
