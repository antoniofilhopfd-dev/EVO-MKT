const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),path=require('node:path');
const file=path.join(__dirname,'../lib/integrations/meta.ts'),calls=[],out={};
const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
vm.runInNewContext(code,{exports:out,Date,Math,Number,URL,console,require:n=>({
 '../settings':{setting:async()=>'',intLog:async()=>{}},'../util':{env:(k,d)=>d},
 './http':{qsOf:x=>new URLSearchParams(x).toString(),httpOk:r=>r[1],httpCall:async(method,url)=>{const p=new URL(url).searchParams,since=Number(p.get('since')),until=Number(p.get('until'));assert.ok(until-since<=2592000);calls.push({since,until});return [200,{data:p.get('metric').split(',').map(name=>({name,total_value:{value:4}}))}];}}
}[n]||{})});
(async()=>{for(const days of [28,29,30,31,60,90]){calls.length=0;const since=Date.parse('2026-01-01T03:00:00Z')/1000,until=since+days*86400-1;const r=await out.igMetricasIntervalo('123',since,until);assert.equal(calls.length,Math.ceil(days/30));assert.equal(calls[0].since,since);assert.equal(calls.at(-1).until,until);for(let i=1;i<calls.length;i++)assert.equal(calls[i].since,calls[i-1].until+1);assert.equal(r.views,calls.length*4);console.log('OK '+days+' dias sem lacunas nem sobreposição');}
 calls.length=0;const now=Math.floor(Date.now()/1000);await out.igMetricasIntervalo('123',now-60,now+86400);assert.ok(calls[0].until<=Math.floor(Date.now()/1000));
 calls.length=0;await out.igMetricasIntervalo('123',now+60,now+120);assert.equal(calls.length,0);
 assert.ok(fs.readFileSync(file,'utf8').includes('const ins = await igMetricasIntervalo(ig, since, until - 1)'));console.log('9 verificações passaram.');
})().catch(e=>{console.error(e);process.exit(1)});
