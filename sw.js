const CACHE='pontian-digital-library-v3.1.1-97a8d68cb710';
const CORE=['./','./index.html','./library-data.json','./manifest.webmanifest','./PontianDL_Logo.svg','./assets/book-placeholder.webp','./icons/icon-192.png','./icons/icon-512.png','./icons/icon-maskable-192.png','./icons/icon-maskable-512.png','./vendor/openpageflip/0.7.0/index.iife.js','./vendor/openpageflip/0.7.0/styles.css'];
// Optional during source-only staging; required for full offline editing after CI build.
const OPTIONAL=["./vendor/tiptap/tiptap.bundle.js","./vendor/hyphenopoly/6.1.0/Hyphenopoly_Loader.js","./vendor/hyphenopoly/6.1.0/Hyphenopoly.js","./vendor/hyphenopoly/6.1.0/patterns/el-polyton.wasm","./vendor/hyphenopoly/6.1.0/patterns/el-monoton.wasm"];
const base=new URL('./',self.registration.scope);
const appIndex=new URL('index.html',base).href;
const studioIndex=new URL('admin.html',base).href;
const libraryJson=new URL('library-data.json',base).href;
const timeout=5000;
async function network(req){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
 try{return await fetch(req,{cache:'no-cache',signal:controller.signal});}
 finally{clearTimeout(timer);}
}
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const cache=await caches.open(CACHE);
 try{
  // A missing critical asset fails installation instead of activating partial content.
  await Promise.all(CORE.map(async path=>{
   const url=new URL(path,base);
   const res=await fetch(new Request(url,{cache:'reload'}));
   if(!res.ok)throw Error('Critical precache asset '+path+': HTTP '+res.status);
   await cache.put(url.href,res);
  }));
  // Cache vendored editor/hyphenation assets if the verified build has published them.
  await Promise.all(OPTIONAL.map(async file=>{
    try{const url=new URL(file,base);const response=await fetch(new Request(url,{cache:'reload'}));if(response.ok)await cache.put(url.href,response);}catch(err){console.warn('Optional offline asset unavailable',file,err);}
  }));
  await self.skipWaiting();
 }catch(e){await caches.delete(CACHE);throw e;}
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith('pontian-digital-library-')&&k!==CACHE).map(k=>caches.delete(k)));
 await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
 const req=event.request;if(req.method!=='GET')return;
 const url=new URL(req.url);if(url.origin!==location.origin||!url.href.startsWith(base.href))return;
 const studio=url.pathname===new URL('admin.html',base).pathname;
 const isNav=req.mode==='navigate';
 const isJson=url.href===libraryJson;
 if(isNav||isJson){event.respondWith((async()=>{
  const cache=await caches.open(CACHE);
  try{
   const response=await network(req);
   if(!response.ok)throw Error('HTTP '+response.status);
   // Don't hold up the render while writing the cache.
   event.waitUntil(cache.put(req,response.clone()).catch(e=>console.warn('Cache write',e)));
   return response;
  }catch(err){
   const cached=await cache.match(req);
   if(cached)return cached;
   if(studio)return await cache.match(studioIndex)||Response.error();
   if(isNav)return await cache.match(appIndex)||Response.error();
   return await cache.match(libraryJson)||Response.error();
  }
 })());return;}
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE);
  // Versioned static files still use network-first to prevent stale assets after redeployment.
  try{const response=await network(req);if(response.ok){event.waitUntil(cache.put(req,response.clone()).catch(()=>{}));return response;}}
  catch(e){}
  return await cache.match(req)||Response.error();
 })());
});
