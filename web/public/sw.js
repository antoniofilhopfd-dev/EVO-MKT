/* EVO MKT: cache apenas de imagens/fontes estáticas. JS/HTML/CSS pela rede, sem substituição indevida por index.html. */
const CACHE='evo-static-v6-20261025-53';
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(
  caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))
    .then(()=>self.clients.claim())
));
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin)return;
  if(url.pathname.startsWith('/api/')||url.pathname.endsWith('.js')||url.pathname.endsWith('.css')||url.pathname.endsWith('.html')||url.pathname==='/'||req.mode==='navigate')return;
  if(!/\\.(?:png|jpe?g|svg|webp|gif|ico|woff2?)$/i.test(url.pathname))return;
  event.respondWith(fetch(req).then(response=>{
    if(response.ok&&response.type==='basic'){
      const copy=response.clone();
      event.waitUntil(caches.open(CACHE).then(cache=>cache.put(req,copy)));
    }
    return response;
  }).catch(()=>caches.match(req).then(hit=>hit||Response.error())));
});
