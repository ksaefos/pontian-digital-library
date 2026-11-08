import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {readFile, stat} from 'node:fs/promises';
import path, {resolve} from 'node:path';
import {chromium} from 'playwright';

const root=resolve(import.meta.dirname,'..');
const data=JSON.parse(readFileSync(resolve(root,'library-data.json'),'utf8'));
const book=data.books.find(b=>b.title==='Η Σωνίτσα');
assert.ok(book,'Stress-test book is missing');

// Run the PWA with a real, same-origin HTTP address, like the public website.
// page.setContent() creates an opaque-origin about:blank document, where
// library-data.json, OpenPageFlip and localStorage do not work as in production.
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
 '.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8',
 '.mjs':'text/javascript; charset=utf-8','.webmanifest':'application/manifest+json',
 '.svg':'image/svg+xml','.wasm':'application/wasm','.webp':'image/webp',
 '.woff2':'font/woff2','.otf':'font/otf','.png':'image/png'};
const server=createServer(async(req,res)=>{
 try{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const filename=resolve(root,'.'+pathname);
  if(filename!==root&&!filename.startsWith(root+path.sep)){
   res.writeHead(403).end();return;
  }
  const s=await stat(filename);
  if(!s.isFile()){res.writeHead(404).end('Not Found');return;}
  res.writeHead(200,{'Content-Type':types[path.extname(filename)]||'application/octet-stream'});
  res.end(await readFile(filename));
 }catch{res.writeHead(404).end('Not Found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
let browser, page, frame;
const errors=[], warnings=[];
const diagnostics=async()=>{
 if(!page)return {note:'Browser page not created'};
 try{return await page.evaluate(()=>{
  const reader=document.querySelector('#reader-frame')?.contentWindow;
  return {url:location.href,importStatus:document.querySelector('#pdl-import-status')?.textContent,
   readerExists:!!reader,readerFontStatus:reader?.document?.fonts?.status,
   progress:reader?.pdlProgressStats?.(),
   status:reader?.document?.getElementById('pdl-progress-status')?.textContent||''};
 });}catch(e){return {diagnosticsError:String(e)};}
};
try{
 browser=await chromium.launch({headless:true,
  ...(process.env.PDL_CHROMIUM_EXECUTABLE?{executablePath:process.env.PDL_CHROMIUM_EXECUTABLE}:{})});
 page=await browser.newPage({viewport:{width:390,height:844}});
 page.on('pageerror',error=>errors.push(String(error)));
 page.on('console',message=>{
  if(message.type()==='error'||message.type()==='warning')warnings.push(message.text());
 });
 await page.goto(base+'/index.html',{waitUntil:'domcontentloaded',timeout:30000});
 await page.waitForFunction(()=>document.querySelector('#pdl-import-status')?.textContent?.includes('Δημοσιεύτηκαν'),null,{timeout:30000});
 await page.evaluate(id=>openBook('studio:'+id),book.id);
 await page.waitForFunction(()=>typeof document.querySelector('#reader-frame')?.contentWindow?.pdlProgressStats==='function',null,{timeout:30000});
 frame=page.frames().find(f=>f.url()==='about:srcdoc');
 assert.ok(frame,'Reader iframe not initialized');
 // Stop immediately on a real engine failure instead of hiding it behind a timeout.
 await frame.waitForFunction(()=>{
  const s=pdlProgressStats();return s.chapters[0]?.pages>=6||s.errors.length>0;
 },null,{timeout:60000});
 const startup=await frame.evaluate(()=>pdlProgressStats());
 assert.ok(!startup.errors.length,'Initial progressive pagination failed: '+startup.errors.join(' | '));
 assert.ok(startup.chapters[0].pages>=6,'The first six pages were not produced');
 const first=await frame.evaluate(()=>pdlProgressStats());
 assert.equal(first.chapters[0].done,false,'The first six pages must arrive before the whole book is paginated');
 assert.ok(!first.errors.length,'First batch must not fail');
 await frame.evaluate(()=>pdlProgressGoAbsolute(60));
 await frame.waitForFunction(()=>{const s=pdlProgressStats();return s.complete||s.errors.length>0;},null,{timeout:180000});
 assert.ok(!(await frame.evaluate(()=>pdlProgressStats())).errors.length,'Book pagination stopped before completion');
 // Completion becomes visible at the end of the last batch, slightly before
 // the pending absolute-page jump is committed. Wait for both conditions.
 await frame.waitForFunction(()=>{
  const absolute=chapters.slice(0,currentChapter).reduce((sum,c)=>sum+c.pages.length,0)+currentPage+1;
  return absolute===60||pdlProgressStats().errors.length>0;
 },null,{timeout:20000});
 const report=await frame.evaluate(()=>{
  const integrity=chapters.map((ch,ci)=>{
   const original=PDL_SOURCE[ci].blocks.map(b=>pdlPlain(b.text||'')).join('');
   const output=ch.pages.flat().map(b=>pdlPlain(b.text||'')).join('');
   const structural=['divider','telos','table','image'];
   const expected=PDL_SOURCE[ci].blocks.filter(b=>structural.includes(b.type)).map(b=>b.type);
   const actual=ch.pages.flat().filter(b=>structural.includes(b.type)).map(b=>b.type);
   return {ci,equal:original===output&&JSON.stringify(expected)===JSON.stringify(actual),original:original.length,output:output.length,structural:actual.length};
  });
  const total=chapters.reduce((sum,c)=>sum+c.pages.length,0);
  const absolute=chapters.slice(0,currentChapter).reduce((sum,c)=>sum+c.pages.length,0)+currentPage+1;
  return {stats:pdlProgressStats(),integrity,total,absolute};
 });
 assert.ok(!report.stats.errors.length,'No progressive errors');
 assert.ok(report.integrity.every(item=>item.equal),'Text must be preserved byte-for-byte as Unicode content');
 assert.ok(report.stats.chapters.every(ch=>ch.done),'All chapter batches must complete');
 assert.equal(report.absolute,60,'A requested absolute page 60 must resolve exactly');
 assert.ok(!errors.length,'Browser JS errors: '+errors.join(';'));
 // A font change during a long book must not leave an obsolete page index
 // or silently lose the exact text anchor from which reflow began.
 const before=await frame.evaluate(()=>({generation:pdlProgressStats().generation,anchor:pdlPageAnchor(currentChapter,currentPage)}));
 await frame.evaluate(()=>pdlSetFont('Barnebok Pontian'));
 await frame.waitForFunction(g=>pdlProgressStats().generation>g,before.generation,{timeout:30000});
 await frame.waitForFunction(()=>{const s=pdlProgressStats();return s.chapters[currentChapter]?.done||s.errors.length>0;},null,{timeout:180000});
 assert.ok(!(await frame.evaluate(()=>pdlProgressStats())).errors.length,'Font reflow stopped before completion');
 const reflow=await frame.evaluate(()=>{
  const start=pdlPageAnchor(currentChapter,currentPage);
  const next=pdlPageAnchor(currentChapter,currentPage+1);
  return {start,next,progress:pdlProgressStats(),page:currentPage,ch:currentChapter};
 });
 const cmp=(a,b)=>a.index-b.index||(a.offset||0)-(b.offset||0);
 assert.ok(cmp(reflow.start,before.anchor)<=0,'Reflow must not skip past the saved text anchor');
 if(reflow.page+1<reflow.progress.chapters[reflow.ch].pages)assert.ok(cmp(reflow.next,before.anchor)>0,'Reflow must retain the saved anchor on the restored page');
 assert.ok(!reflow.progress.errors.length,'Font change must not fail progressive pagination');
 assert.ok(!errors.length,'Browser JS errors after font change: '+errors.join(';'));
 await page.close();
 console.log('PASS progressive book: first six pages, exact page-60 jump, all six chapters and complete text integrity');
}catch(e){
 console.error('Progressive browser test diagnostics:',JSON.stringify(await diagnostics(),null,2));
 if(errors.length)console.error('JavaScript errors:',errors.join(' | '));
 if(warnings.length)console.error('Browser console:',warnings.slice(-8).join(' | '));
 throw e;
}finally{
 if(browser)await browser.close().catch(()=>{});
 await new Promise(resolve=>server.close(resolve));
}
