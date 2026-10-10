// Administração → Backups → importar planilhas (XLSX), e criação de backup. Uso: node ui5.test.js <install.out>
const {chromium}=require(process.env.PLAYWRIGHT||'/opt/node-tools/node_modules/playwright');const fs=require('fs'),os=require('os'),path=require('path'),{execFileSync}=require('child_process');
const out=fs.readFileSync(process.argv[2],'utf8');const pw=k=>out.match(new RegExp(k+'[^:]*: (\\S+)'))[1];const BASE=process.env.BASE||'http://127.0.0.1:8080';
let ok=0,bad=0;const t=(n,c,x)=>{c?ok++:bad++;console.log(c?'OK  ':'FAIL',n);if(!c&&x!==undefined)console.log('    ',String(x).slice(0,300))};
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'evo-ui5-'));const f=path.join(dir,'EVO_MKT_IDEIAS.xlsx');
 execFileSync('python3',['-c',`
import openpyxl,sys
wb=openpyxl.Workbook();ws=wb.active;ws.append(['id','titulo','status','descricao']);ws.append(['IDE-0005','Ideia vinda da planilha','IDEIA','Ação ç']);wb.save(sys.argv[1])`,f]);
 const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
 const p=await (await b.newContext({viewport:{width:1440,height:1000}})).newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('dialog',d=>d.accept('Senha26x'));
 await p.goto(BASE+'/');await p.fill('#internalCode','NAT-3301');await p.fill('#internalPass',pw('NAT-3301'));await p.click('#internalLoginBtn');await p.waitForSelector('.today-banner');
 await p.evaluate(()=>{adminTab='backups';go('administracao')});await p.waitForSelector('#xlsxImport');
 t('aba Backups mostra o importador de planilhas',true);
 await p.setInputFiles('#xlsxFiles',f);await p.click('#xlsxImport');await p.waitForSelector('.admin-overlay');
 t('importação mostra resultado (1 novo em ideias)',/ideias[\s\S]*1 novo/i.test(await p.$eval('.admin-overlay',e=>e.innerText)),await p.$eval('.admin-overlay',e=>e.innerText));
 await p.click('.admin-overlay [data-close]');
 await p.evaluate(()=>go('ideias'));await p.waitForTimeout(1200);
 t('ideia importada aparece no módulo Ideias',/Ideia vinda da planilha/.test(await p.$eval('#content',e=>e.innerText)));
 await p.evaluate(()=>{adminTab='backups';go('administracao')});await p.waitForSelector('#bkNow');await p.click('#bkNow');await p.waitForTimeout(1500);
 t('criar backup agora lista o arquivo gerado',/evo_backup_\d{8}_\d{6}_manual\.json\.gz/.test(await p.$eval('#adminBody',e=>e.innerText)));
 await p.click('[data-bkval]');await p.waitForSelector('.admin-overlay');
 t('botão Validar mostra "Backup válido" com as tabelas',/Backup válido[\s\S]*records[\s\S]*users/.test(await p.$eval('.admin-overlay',e=>e.innerText)));await p.click('.admin-overlay [data-close]');
 t('registro de execuções aparece na aba',/Registro de execuções[\s\S]*criar/.test(await p.$eval('#adminBody',e=>e.innerText)));
 await p.click('[data-bkrest]');await p.waitForSelector('.admin-overlay');
 t('botão Restaurar (com dupla confirmação) mostra "Restauração concluída" e o backup de segurança',/Restauração concluída[\s\S]*prerestauracao/.test(await p.$eval('.admin-overlay',e=>e.innerText)));
 t('sem erros de JS',errs.length===0,errs.join('|'));
 await b.close();console.log(`${ok} ok, ${bad} falhas`);process.exit(bad?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
