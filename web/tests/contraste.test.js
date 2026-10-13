// Contraste (WCAG AA, 4,5:1) dos pares de cor do design system, lidos de public/design.css. Uso: node contraste.test.js
const fs=require('fs'),path=require('path');
const css=fs.readFileSync(path.join(__dirname,'../public/design.css'),'utf8');
const tok=n=>{const m=css.match(new RegExp('--'+n+':\\s*(#[0-9A-Fa-f]{3,6})\\b'));if(!m)throw new Error('token ausente: '+n);let h=m[1];if(h.length===4)h='#'+[...h.slice(1)].map(c=>c+c).join('');return h};
const lum=h=>{const c=[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255).map(v=>v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4));return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2]};
const ratio=(a,b)=>{const[x,y]=[lum(a),lum(b)].sort((p,q)=>q-p);return (x+0.05)/(y+0.05)};
let ok=0,bad=0;const t=(n,c,x)=>{c?ok++:bad++;console.log(c?'OK  ':'FAIL',n,x!==undefined?`(${x})`:'')};
const pares=[['ink','card'],['ink','page'],['ink-2','card'],['ink-3','card'],['ink-3','page'],['brand','card'],['brand','brand-bg'],['ok','ok-bg'],['bad','bad-bg'],['alert','alert-bg'],['brand-dark','card']];
for(const [f,b] of pares){const r=ratio(tok(f),tok(b));t(`texto --${f} sobre --${b}`,r>=4.5,r.toFixed(2)+':1')}
const branco='#FFFFFF';for(const f of ['brand','brand-dark','bad','ok']){const r=ratio(branco,tok(f));t(`texto branco sobre --${f} (botões/faixas)`,r>=4.5,r.toFixed(2)+':1')}
// o laranja institucional é decorativo (indicador/borda), nunca cor de texto sobre fundo claro
t('laranja institucional não é usado como cor de texto (só realce)',!/(^|[;{\s])color:\s*var\(--accent\)/.test(css)&&!/(^|[;{\s])color:\s*#FF7800/i.test(css));
console.log(`${ok} ok, ${bad} falhas`);process.exit(bad?1:0);
