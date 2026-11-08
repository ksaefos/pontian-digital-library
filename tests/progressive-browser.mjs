import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
const root=resolve(import.meta.dirname,'..');
const html=readFileSync(resolve(root,'index.html'),'utf8');
const data=JSON.parse(readFileSync(resolve(root,'library-data.json'),'utf8'));
const book=data.books.find(b=>b.title==='Η Σωνίτσα');
assert.ok(book,'Stress-test book is missing');
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.setContent(html,{waitUntil:'domcontentloaded',timeout:30000});
 await page.evaluate(payload=>{
  pdlApplyLibrary(payload);
  openBook('studio:'+payload.books[0].id);
 },{...data,books:[book]});
 await page.waitForFunction(()=>typeof document.querySelector('#reader-frame')?.contentWindow?.pdlProgressStats==='function',null,{timeout:30000});
 const frame=page.frames().find(f=>f.url()==='about:srcdoc');
 assert.ok(frame,'Reader iframe not initialized');
 await frame.waitForFunction(()=>pdlProgressStats().chapters[0]?.pages>=6,null,{timeout:45000});
 const first=await frame.evaluate(()=>pdlProgressStats());
 assert.equal(first.chapters[0].done,false,'The first six pages must arrive before the whole book is paginated');
 assert.ok(!first.errors.length,'First batch must not fail');
 await frame.evaluate(()=>pdlProgressGoAbsolute(60));
 await frame.waitForFunction(()=>pdlProgressStats().complete,null,{timeout:110000});
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
 await frame.waitForFunction(()=>pdlProgressStats().chapters[currentChapter]?.done,null,{timeout:110000});
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
}finally{await browser.close();}
