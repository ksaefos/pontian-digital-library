const CACHE='pontian-digital-library-v4.0.0-beta.1-97a8d68cb710';
const CORE=['./','./index.html','./public-data/catalog.json','./manifest.webmanifest','./PontianDL_Logo.svg','./assets/book-placeholder.webp','./icons/icon-192.png','./icons/icon-512.png','./icons/icon-maskable-192.png','./icons/icon-maskable-512.png','./catalog/reader-session.js','./catalog/library.js','./catalog/offline.js','./catalog/help.js'];
const OPTIONAL=["./vendor/tiptap/tiptap.bundle.js","./vendor/hyphenopoly/6.1.0/Hyphenopoly_Loader.js","./vendor/hyphenopoly/6.1.0/Hyphenopoly.js","./vendor/hyphenopoly/6.1.0/patterns/el-polyton.wasm","./vendor/hyphenopoly/6.1.0/patterns/el-monoton.wasm"];
const base=new URL('./',self.registration.scope),appIndex=new URL('index.html',base).href;
const studioPath=new URL('admin.html',base).pathname,timeout=5000;
async function network(req,cacheMode='no-cache'){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
 try{return await fetch(req,{cache:cacheMode,signal:controller.signal});}finally{clearTimeout(timer);}
}
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const cache=await caches.open(CACHE);
 try{await Promise.all(CORE.map(async file=>{const url=new URL(file,base),response=await fetch(new Request(url,{cache:'reload'}));if(!response.ok)throw Error('Critical asset '+file);await cache.put(url.href,response);}));await self.skipWaiting();}
 catch(error){await caches.delete(CACHE);throw error;}
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 const keys=await caches.keys();
 await Promise.all(keys.filter(key=>key.startsWith('pontian-digital-library-')&&key!==CACHE).map(key=>caches.delete(key)));
 const cache=await caches.open(CACHE);for(const req of await cache.keys())if(new URL(req.url).pathname===studioPath)await cache.delete(req);
 await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
 const req=event.request;if(req.method!=='GET')return;
 const url=new URL(req.url);if(url.origin!==location.origin||!url.href.startsWith(base.href))return;
 if(url.pathname===studioPath){event.respondWith(network(req,'no-store').catch(()=>Response.error()));return;}
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE),immutable=/\.[a-f0-9]{20}\./.test(url.pathname)||url.pathname.includes('/reader/media/');
  if(immutable){const hit=await cache.match(req);if(hit)return hit;}
  try{const response=await network(req);if(!response.ok)throw Error('HTTP '+response.status);event.waitUntil(cache.put(req,response.clone()).catch(()=>{}));return response;}
  catch(error){return await cache.match(req)||(req.mode==='navigate'?await cache.match(appIndex):null)||Response.error();}
 })());
});
self.addEventListener('message',event=>{
 if(event.data?.kind!=='pdl-cache-assets'||!Array.isArray(event.data.urls))return;
 const port=event.ports?.[0];
 event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);let done=0;
  try{
   for(const file of [...new Set(event.data.urls)]){
    const url=new URL(file,base);
    if(url.origin!==base.origin||!url.href.startsWith(base.href)||url.pathname===studioPath)throw Error('Invalid offline asset');
    if(!await cache.match(url.href)){const response=await network(url.href);if(!response.ok)throw Error('HTTP '+response.status);await cache.put(url.href,response);}
    port?.postMessage({done:++done});
   }
   port?.postMessage({complete:true});
  }catch(error){port?.postMessage({error:String(error.message||error)});}
 })());
});
