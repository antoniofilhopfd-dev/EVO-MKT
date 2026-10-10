// Importa os XLSX de DADOS/ pelo endpoint /api/admin/import e confere contagens, acentos e contadores de ID. Uso: node importar.test.js <install.out>
const fs=require('fs'),path=require('path'),{execFileSync}=require('child_process');
const out=fs.readFileSync(process.argv[2],'utf8');const pw=k=>out.match(new RegExp(k+'[^:]*: (\\S+)'))[1];const B=(process.env.BASE||'http://127.0.0.1:8080')+'/api';
let ok=0,bad=0;const t=(n,c,x)=>{c?ok++:bad++;console.log(c?'OK  ':'FAIL',n);if(!c&&x!==undefined)console.log('    ',JSON.stringify(x).slice(0,300))};
const os=require('os');const SRC=path.join(__dirname,'fixtures/DADOS');const DADOS=fs.mkdtempSync(path.join(os.tmpdir(),'evo-dados-'));
// cópia das planilhas com linhas de exemplo (as de DADOS/ vêm só com cabeçalhos)
execFileSync('python3',['-c',`
import openpyxl,shutil,os,sys
src,dst=sys.argv[1],sys.argv[2]
for f in os.listdir(src):
    if f.endswith('.xlsx'):shutil.copy(os.path.join(src,f),os.path.join(dst,f))
def add(name,rows):
    p=os.path.join(dst,name);wb=openpyxl.load_workbook(p);ws=wb.worksheets[0];h=[c.value for c in ws[1]]
    for r in rows:ws.append([r.get(k,'') for k in h])
    wb.save(p)
add('EVO_MKT_TAREFAS.xlsx',[{'id':'TAR-0007','titulo':'Tarefa importada','status':'NOVO','descricao':'Descrição ç ã é & <ok>','criadoEm':'2026-09-01T10:00:00-03:00'},{'id':'TAR-0010','titulo':'Outra','status':'EM ANDAMENTO','prazo':'2026-10-20'},{'id':'','titulo':'sem id (ignorada)'}])
add('EVO_MKT_CAMPANHAS.xlsx',[{'id':'CAM-0003','titulo':'Matrículas 2027','status':'ATIVA'}])
`,SRC,DADOS]);
(async()=>{
 let r=await fetch(B+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({codigo:'NAT-3301',senha:pw('NAT-3301')})});const ck=r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
 const H={Cookie:ck,'X-EVO':'1'};
 const files=fs.readdirSync(DADOS).filter(f=>/^EVO_MKT_.*\.xlsx$/.test(f));
 // contagem esperada via Python (openpyxl), independente do leitor do app
 const exp=JSON.parse(execFileSync('python3',['-c',`
import openpyxl,json,sys,os
d=sys.argv[1];o={}
for f in sorted(os.listdir(d)):
    if not f.endswith('.xlsx'):continue
    ws=openpyxl.load_workbook(os.path.join(d,f),read_only=True).worksheets[0]
    rows=list(ws.iter_rows(values_only=True))
    if not rows:continue
    h=[str(x).strip() if x is not None else '' for x in rows[0]]
    if 'id' not in h:o[f]=0;continue
    i=h.index('id');o[f]=sum(1 for r in rows[1:] if r[i] not in (None,''))
print(json.dumps(o))`,DADOS],{encoding:'utf8'}));
 const fd=new FormData();for(const f of files)fd.append('files',new File([fs.readFileSync(path.join(DADOS,f))],f));
 r=await fetch(B+'/admin/import',{method:'POST',headers:H,body:fd});const j=await r.json();t('importação responde 200',r.status===200,j);t('importou 3 registros (TAR-0007, TAR-0010, CAM-0003)',j.importados.tarefas===2&&j.importados.campanhas===1,j.importados);
 let tot=0,totExp=0,allOk=true;
 for(const f of files){const mod=f.match(/EVO_MKT_(.*)\.xlsx/)[1].toLowerCase();const got=typeof j.importados[mod]==='number'?j.importados[mod]:-1;const e=exp[f]??0;tot+=Math.max(got,0);totExp+=e;if(got!==e){allOk=false;console.log('    divergência',mod,'esperado',e,'veio',got)}}
 t(`contagem por módulo bate com a planilha (${tot}/${totExp} registros)`,allOk&&tot===totExp);
 // acentos e leitura via API de dados
 const t7=(await (await fetch(B+'/data?module=tarefas&id=TAR-0007',{headers:H})).json());
 t('texto com acentos e símbolos (& <ok>) preservado',t7.descricao==='Descrição ç ã é & <ok>'&&t7.criadoEm==='2026-09-01T10:00:00-03:00',t7);
 // reimportar não duplica
 r=await fetch(B+'/admin/import',{method:'POST',headers:H,body:fd});const j2=await r.json();t('reimportar não duplica (0 novos)',Object.values(j2.importados).every(v=>v===0),j2);
 // contador de ID segue do maior importado e IDs nunca reaproveitados
 const tr=await (await fetch(B+'/data?module=tarefas',{headers:H})).json();const maxId=Math.max(0,...tr.rows.map(x=>+(x.id.match(/(\d+)$/)||[0,0])[1]));
 r=await fetch(B+'/data?module=tarefas',{method:'POST',headers:{...H,'Content-Type':'application/json'},body:JSON.stringify({titulo:'Nova depois da importação'})});const nv=await r.json();
 t('novo ID continua depois do maior importado',+(nv.id.match(/(\d+)$/)[1])===maxId+1,{maxId,novo:nv.id});t('maior ID importado é 10',maxId===10);
 // nome fora do padrão é ignorado
 const bf=new FormData();bf.append('files',new File(['x'],'qualquer.xlsx'));r=await fetch(B+'/admin/import',{method:'POST',headers:H,body:bf});t('arquivo fora do padrão é ignorado',/ignorado/.test(JSON.stringify((await r.json()).importados)));
 // sem sessão
 r=await fetch(B+'/admin/import',{method:'POST',headers:{'X-EVO':'1'},body:fd});t('sem sessão: 401',r.status===401);
 console.log(`${ok} ok, ${bad} falhas`);process.exit(bad?1:0);
})();
