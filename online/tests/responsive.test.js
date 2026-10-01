// Detecta estouro horizontal em todas as telas, em larguras de janela do Windows. Uso: node responsive.test.js <install.out>
const {chromium}=require(process.env.PLAYWRIGHT||'/opt/node-tools/node_modules/playwright');const fs=require('fs');
const out=fs.readFileSync(process.argv[2],'utf8');const pw=out.match(/NAT-3301[^:]*: (\S+)/)[1];const BASE=process.env.BASE||'http://127.0.0.1:8080';
(async()=>{const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});let bad=0;
 for(const [w,h] of [[1280,720],[1024,700],[800,600]]){
  const p=await (await b.newContext({viewport:{width:w,height:h}})).newPage();p.on('dialog',d=>d.accept('SenhaForte2026x'));
  await p.goto(BASE+'/');await p.fill('#internalCode','NAT-3301');await p.fill('#internalPass',pw);await p.click('#internalLoginBtn');if(!(await p.waitForSelector('#nav .navitem',{timeout:2500}).catch(()=>null))){await p.fill('#internalPass','SenhaForte2026x');await p.click('#internalLoginBtn');await p.waitForSelector('#nav .navitem')}
  const pages=await p.$$eval('#nav .navitem',e=>e.map(x=>x.dataset.page));
  for(const pg of pages){await p.evaluate(x=>go(x),pg);await p.waitForTimeout(250);
   const o=await p.evaluate(()=>{const c=document.getElementById('content');const bw=document.documentElement.scrollWidth-document.documentElement.clientWidth;const cw=c.scrollWidth-c.clientWidth;const modalCut=0;return {bw,cw}});
   if(o.bw>2||o.cw>2){bad++;console.log(`ESTOURO ${w}x${h} ${pg}`,o);await p.screenshot({path:`/tmp/claude-0/resp_${w}_${pg}.png`})}}
  await p.close()}
 console.log(bad?`${bad} tela(s) com estouro`:'sem estouro horizontal');await b.close();process.exit(bad?1:0)})();
