import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
const root=path.resolve(import.meta.dirname,'..');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png'};
const server=createServer(async(req,res)=>{try{
 const file=path.resolve(root,'dist','.'+new URL(req.url,'http://localhost').pathname);
 if(!file.startsWith(path.join(root,'dist')+path.sep)||!(await stat(file)).isFile()){res.writeHead(404).end();return;}
 res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});res.end(await readFile(file));
}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));

let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage({serviceWorkers:'block',viewport:{width:390,height:844}});
 await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);await page.waitForFunction(()=>libraryState.books.length===4);
 const id=await page.evaluate(()=>libraryState.books.find(b=>b.hyphenation==='el-polyton').id);
 const client=await page.context().newCDPSession(page);await client.send('HeapProfiler.enable');
 const samples=[];
 for(let i=0;i<6;i++){
  await page.evaluate(id=>openBook(id),id);
  await page.waitForFunction(()=>typeof document.getElementById('reader-frame')?.contentWindow?.pdlProgressStats==='function');
  const f=page.frames().find(f=>f.url()==='about:srcdoc');
  await f.waitForFunction(()=>pdlProgressStats().complete,null,{timeout:180000});
  await page.evaluate(()=>closeBook());
  await page.waitForFunction(()=>document.getElementById('reader-frame').contentDocument?.URL==='about:blank');
  await client.send('HeapProfiler.collectGarbage');await client.send('HeapProfiler.collectGarbage');
  const heap=await client.send('Runtime.getHeapUsage'),dom=await client.send('Memory.getDOMCounters');
  samples.push({cycle:i+1,usedMiB:Math.round(heap.usedSize/1048576*100)/100,...dom});
 }
 // Warm font/WASM loading before comparing retained DOM. Heap size is
 // diagnostic only: engine caches need not be reclaimed on this schedule.
 const baseline=samples[1];
 for(const sample of samples.slice(2)){
  for(const key of ['documents','nodes','jsEventListeners']){
   assert.equal(sample[key],baseline[key],`Reader close retained ${key} after cycle ${sample.cycle}`);
  }
 }
 console.log('PASS Reader open/close lifecycle: '+JSON.stringify(samples));
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
