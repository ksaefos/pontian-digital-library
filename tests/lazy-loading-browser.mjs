import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
const root=path.resolve(import.meta.dirname,'..'),dist=path.join(root,'dist'),prefix='/library/';
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.wasm':'application/wasm','.woff2':'font/woff2','.otf':'font/otf','.webmanifest':'application/manifest+json'};
let networkOffline=false;
const server=createServer(async(req,res)=>{try{
 if(networkOffline){res.writeHead(503,{'Cache-Control':'no-store'}).end('Offline test');return;}
 const pathname=new URL(req.url,'http://local').pathname;if(!pathname.startsWith(prefix)){res.writeHead(404).end();return;}
 const file=path.resolve(dist,pathname.slice(prefix.length)||'index.html');if(!file.startsWith(dist+path.sep)||!(await stat(file)).isFile()){res.writeHead(404).end();return;}
 res.writeHead(200,{'Cache-Control':'no-store','Content-Type':types[path.extname(file)]||'application/octet-stream'});res.end(await readFile(file));
}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}${prefix}`;
const catalog=JSON.parse(await readFile(path.join(dist,'public-data/catalog.json'),'utf8'));
let browser;
const loaded=async page=>{await page.waitForFunction(()=>libraryState.books.length===4);};
const stable=async page=>{await page.waitForFunction(()=>typeof document.getElementById('reader-frame')?.contentWindow?.pdlProgressStats==='function');const frame=page.frames().find(f=>f.url()==='about:srcdoc');await frame.waitForFunction(()=>pdlProgressStats().complete,null,{timeout:180000});return frame;};
try{
 browser=await chromium.launch({headless:true});const context=await browser.newContext(),page=await context.newPage(),requests=[],errors=[];
 page.on('request',r=>requests.push(r.url()));page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(base+'index.html');await loaded(page);await page.waitForFunction(()=>navigator.serviceWorker.controller!==null,null,{timeout:30000});console.log('PASS lightweight catalog and active service worker');
 assert.ok(!requests.some(url=>/\/books\/book\.|\/glossary\.|\/reader\//.test(url)),'Initial catalog must not request Reader, books, glossary or reading fonts');
 assert.ok(!requests.some(url=>url.endsWith('/library-data.json')),'The full authoritative JSON is not a catalog dependency');
 assert.ok(await page.evaluate(()=>libraryState.books.every(b=>b.chapters.every(c=>!('text'in c)))));
 const first=catalog.books[0],second=catalog.books[1];
 await page.evaluate(id=>openBook('studio:'+id),first.id);await stable(page);console.log('PASS first lazy book rendered');
 assert.ok(await page.evaluate(()=>pdlOfflineBookReady),'Opened book and all Reader/font choices must be prepared offline');
 assert.ok(!requests.some(url=>url.endsWith(second.url.slice(2))),'Opening one book must not fetch another book');
 await page.evaluate(()=>closeBook());networkOffline=true;await context.setOffline(true);await page.reload();await loaded(page);console.log('PASS offline catalog reload');
 await page.evaluate(id=>openBook('studio:'+id),first.id);await stable(page);await page.evaluate(()=>closeBook());
 await page.evaluate(id=>openBook('studio:'+id),second.id);assert.equal(await page.evaluate(()=>activeBook),null,'An uncached offline book must fail cleanly');
 networkOffline=false;await context.setOffline(false);await page.locator('#pdl-offline-download').click();await page.waitForFunction(()=>document.getElementById('pdl-offline-status').textContent.includes('είναι διαθέσιμη'),null,{timeout:180000});
 networkOffline=true;await context.setOffline(true);await page.reload();await loaded(page);console.log('PASS offline catalog reload');await page.evaluate(id=>openBook('studio:'+id),second.id);await stable(page);
 assert.deepEqual(errors,[]);await context.close();networkOffline=false;
 // A cancelled lazy fetch must never reopen a closed Reader or replace another book.
 const isolated=await browser.newContext({serviceWorkers:'block'}),race=await isolated.newPage();let release,entered;
 const gate=new Promise(r=>release=r),hit=new Promise(r=>entered=r);
 await race.route('**/'+first.url.slice(2),async route=>{entered();await gate;await route.continue();});
 let releaseDependencies,dependenciesEntered;
 const dependencyGate=new Promise(r=>releaseDependencies=r),dependencyHit=new Promise(r=>dependenciesEntered=r);
 await race.route('**/catalog/app.*.js',async route=>{dependenciesEntered();await dependencyGate;await route.continue();});
 await race.goto(base+'index.html',{waitUntil:'commit'});await dependencyHit;
 assert.equal(await race.locator('.library-grid .book-card').count(),0,'Cards must not become interactive while catalog dependencies are missing');
 releaseDependencies();await loaded(race);await race.evaluate(id=>{openBook('studio:'+id);},first.id);await hit;
 await race.evaluate(()=>closeBook());release();await race.waitForFunction(()=>!document.body.classList.contains('reading'));
 assert.equal(await race.evaluate(()=>document.getElementById('reader-frame').hasAttribute('srcdoc')),false);
 await race.evaluate(id=>openBook('studio:'+id),second.id);const frame=await stable(race);assert.equal(await frame.evaluate(()=>PDL_IMPORTED_BOOK_ID),'studio:'+second.id);
 let fail=true;await race.route('**/'+catalog.books[2].url.slice(2),async route=>{if(fail){fail=false;await route.fulfill({status:503,body:'retry'});}else await route.continue();});
 await race.evaluate(()=>closeBook());await race.evaluate(id=>openBook('studio:'+id),catalog.books[2].id);assert.equal(await race.evaluate(()=>activeBook),null);
 await race.evaluate(id=>openBook('studio:'+id),catalog.books[2].id);await stable(race);await isolated.close();
 console.log('PASS built subpath deployment: metadata-only startup; lazy book/glossary/Reader; offline opened book + all fonts; explicit complete offline download; uncached offline error; cancellation; retry; correct book isolation');
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
