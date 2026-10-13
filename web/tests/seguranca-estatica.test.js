// Auditoria estática: SQL, segredos, APIs perigosas e cabeçalhos de configuração. Uso: node seguranca-estatica.test.js
const fs=require('fs'),path=require('path'),{execFileSync}=require('child_process');
const WEB=path.join(__dirname,'..');let ok=0,bad=0;const t=(n,c,x)=>{c?ok++:bad++;console.log(c?'OK  ':'FAIL',n);if(!c&&x!==undefined)console.log('    ',String(typeof x==='string'?x:JSON.stringify(x)).slice(0,700))};
const walk=(d,ext,out=[])=>{for(const f of fs.readdirSync(d,{withFileTypes:true})){if(['node_modules','.next','dist'].includes(f.name))continue;const p=path.join(d,f.name);if(f.isDirectory())walk(p,ext,out);else if(ext.some(e=>f.name.endsWith(e)))out.push(p)}return out};
// 1) SQL: toda interpolação dentro de consulta deve ser identificador/constante conhecida (valores sempre vão por "?")
const permitido=[/^tab$/,/^t$/,/^table$/,/^dest$/,/^where$/,/^extra$/,/^tipo === 'interno' \? ',role' : ''$/,/^spec\.cols\.join\(','\)$/,/^cols\.join\(','\)$/,/^FILES_TABLE\.cols\.join\(','\)$/,/^ids\.map\(\(\) => '\?'\)\.join\(','\)$/,/^Math\.min\(200, limite\)$/,/^soPublicos \? 'AND interno=0' : ''$/,/^periodo \? 'WHERE periodo=\?' : ''$/];
const achados=[];
for(const f of walk(path.join(WEB,'lib'),['.ts']).concat(walk(path.join(WEB,'app'),['.ts']))){if(f.endsWith('migrations.generated.ts'))continue;
 const src=fs.readFileSync(f,'utf8');const re=/\b(q|q1|run|query)\(\s*`([^`]*)`/g;let m;
 while((m=re.exec(src))){const sql=m[2];const ints=[...sql.matchAll(/\$\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/g)].map(x=>x[1].trim());
  for(const e of ints)if(!permitido.some(r=>r.test(e)))achados.push(path.relative(WEB,f)+': ${'+e+'}')}}
t('SQL: nenhuma interpolação fora da lista de identificadores/constantes revisados',achados.length===0,achados);
// 2) segredos no código versionado
let tracked=[];try{tracked=execFileSync('git',['ls-files'],{cwd:WEB,encoding:'utf8'}).split('\n').filter(Boolean)}catch{}
const textual=tracked.filter(f=>/\.(ts|js|mjs|json|md|html|css|sql|sh|php|webmanifest)$/.test(f)&&!/package-lock/.test(f)&&!/^tests\//.test(f)); // tests/ usa valores falsos de propósito
const padroes=[[/sk-ant-[A-Za-z0-9_-]{20,}/,'chave Anthropic'],[/AKIA[0-9A-Z]{16}/,'chave AWS'],[/-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/,'chave privada'],[/AIza[0-9A-Za-z_-]{35}/,'chave Google'],[/EAA[A-Za-z0-9]{60,}/,'token Meta'],[/ghp_[A-Za-z0-9]{30,}/,'token GitHub']];
const vazou=[];for(const f of textual){const s=fs.readFileSync(path.join(WEB,f),'utf8');for(const [re,nome] of padroes)if(re.test(s))vazou.push(`${f}: ${nome}`)}
t('segredos: nenhum token/chave conhecida nos arquivos versionados',vazou.length===0,vazou);
t('segredos: nenhum arquivo .env versionado',!tracked.some(f=>/(^|\/)\.env(\.|$)/.test(f)&&!/\.example$/.test(f)));
// 3) APIs perigosas no código
const js=walk(path.join(WEB,'public'),['.js']).concat(walk(path.join(WEB,'lib'),['.ts']),walk(path.join(WEB,'app'),['.ts']));
const perigo=[];for(const f of js){const s=fs.readFileSync(f,'utf8');const dw=(s.match(/document\.write\s*\(/g)||[]).length;const permitidoDw=f.endsWith(path.join('public','app.js'))?1:0; // 1 uso revisado: relatório impresso, com esc() em tudo (teste de XSS cobre)
 if(/\beval\s*\(/.test(s)||/new Function\s*\(/.test(s)||dw>permitidoDw||/dangerouslySetInnerHTML/.test(s)||/child_process/.test(s))perigo.push(path.relative(WEB,f))}
t('código: sem eval, new Function, document.write, dangerouslySetInnerHTML nem child_process',perigo.length===0,perigo);
// 4) configuração de cabeçalhos
const cfg=fs.readFileSync(path.join(WEB,'next.config.mjs'),'utf8');
t("cabeçalhos: CSP sem 'unsafe-eval' e sem 'unsafe-inline' em scripts, frame-ancestors none",/script-src 'self'"/.test(cfg)&&!/unsafe-eval/.test(cfg)&&/frame-ancestors 'none'/.test(cfg));
t('cabeçalhos: HSTS, nosniff, X-Frame-Options, Referrer-Policy, Permissions-Policy, COOP, CORP configurados',['Strict-Transport-Security','X-Content-Type-Options','X-Frame-Options','Referrer-Policy','Permissions-Policy','Cross-Origin-Opener-Policy','Cross-Origin-Resource-Policy'].every(h=>cfg.includes(h)));
// 5) cookies
const ctx=fs.readFileSync(path.join(WEB,'lib/ctx.ts'),'utf8');
t('cookie de sessão: HttpOnly, SameSite=Strict e Secure em HTTPS',/HttpOnly/.test(ctx)&&/SameSite=Strict/.test(ctx)&&/parts\.push\('Secure'\)/.test(ctx));
// 6) senhas e códigos
const crypto=fs.readFileSync(path.join(WEB,'lib/crypto.ts'),'utf8');
t('senhas: bcrypt; segredos em repouso: AES-256-GCM; comparações em tempo constante',/bcrypt/.test(crypto)&&/aes-256-gcm/i.test(crypto)&&/timingSafeEqual/.test(crypto));
t('aleatoriedade de tokens vem de crypto.randomBytes (não de Math.random)',!/Math\.random\(\)/.test(fs.readFileSync(path.join(WEB,'lib/auth.ts'),'utf8'))&&!/Math\.random\(\)/.test(crypto));
console.log(`${ok} ok, ${bad} falhas`);process.exit(bad?1:0);
