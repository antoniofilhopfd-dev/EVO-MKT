/* Service worker do EVO MKT: guarda só a "casca" (HTML/CSS/JS/ícones). NUNCA guarda /api (dados sempre do servidor). */
const V='evo-shell-v5.17.1',SHELL=['/','/index.html','/app.js','/admin.js','/configuracoes.js','/arquivos.js','/charts.js','/tpbase.js','/tpgm.js','/tpmais1.js','/tpmais2.js','/trafegopro.css','/operacao.js','/studio.js','/gerenciador.js','/trafego.js','/trafego.css','/solicitacoes.js','/solicitacoes.css','/calmkt.js','/calmkt.css','/calescolar.js','/calescolar.css','/datacom.js','/datacom.css','/planejamento.js','/calunico.js','/planify.css','/planejamento.css','/dashboard.js','/dashboard.css','/identidade.css','/studio.css','/views.js','/style.css','/design.css','/a11y.js','/portal.css','/pwa.js','/icons/icon-192.png','/img/logo-colegio.png','/img/logo-colegio-branco.png','/img/logo-simbolo.png','/fonts/objectivity-regular.woff2','/fonts/objectivity-medium.woff2','/fonts/objectivity-bold.woff2'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.origin!==location.origin||u.pathname.startsWith('/api/')||u.pathname==='/aprovar.html'||u.pathname==='/calendario.html')return; // dados: sempre rede
  e.respondWith(fetch(e.request).then(r=>{if(r.ok){const c=r.clone();caches.open(V).then(x=>x.put(e.request,c))}return r}).catch(()=>caches.match(e.request).then(r=>r||caches.match('/index.html'))));
});
