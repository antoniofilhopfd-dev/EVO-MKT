const {chromium}=require('/opt/node-tools/node_modules/playwright');const fs=require('fs');
const out=fs.readFileSync(process.argv[2],'utf8');const pw=out.match(/NAT-3301[^:]*: (\S+)/)[1];const BASE='http://127.0.0.1:8080';
(async()=>{const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});const p=await (await b.newContext({viewport:{width:1366,height:1000}})).newPage();p.on('dialog',d=>d.accept('Senha26x'));
await p.goto(BASE+'/');await p.fill('#internalCode','NAT-3301');await p.fill('#internalPass',pw);await p.click('#internalLoginBtn');await p.waitForSelector('.today-banner');
await p.evaluate(()=>{adminTab='integracoes';go('administracao')});await p.waitForSelector('#prontidao');await p.waitForTimeout(500);await p.screenshot({path:'/tmp/evo-prints/09_prontidao.png'});await b.close()})();
