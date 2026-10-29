const CACHE_NAME='pontian-digital-library-v1.7.1';
const CORE=['./','./index.html','./library-data.json','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png','./PontianDL_Logo.svg'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME&&k.startsWith('pontian-digital-library-')).map(k=>caches.delete(k)))),self.clients.claim()]))});
self.addEventListener('fetch',e=>{
 const req=e.request,url=new URL(req.url);
 if(req.method!=='GET'||url.origin!==self.location.origin)return;
 if(req.mode==='navigate'||url.pathname.endsWith('/library-data.json')){
  e.respondWith(fetch(req).then(resp=>{if(resp.ok){const copy=resp.clone();caches.open(CACHE_NAME).then(c=>c.put(req,copy)).catch(()=>{});}return resp;}).catch(async()=>await caches.match(req)|| (req.mode==='navigate'?await caches.match('./index.html'):Response.error())));
  return;
 }
 e.respondWith(caches.match(req).then(cached=>cached||fetch(req).then(resp=>{if(resp.ok){const copy=resp.clone();caches.open(CACHE_NAME).then(c=>c.put(req,copy)).catch(()=>{});}return resp;})));
});
