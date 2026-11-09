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
// Browser regression fixtures must be independent of editorial settings on
// publicly published books. A book with Hyphenopoly enabled intentionally uses
// the legacy paginator in v3.1.2, so it cannot exercise the progressive engine.
// Override settings ONLY in the in-memory HTTP response; never alter the real
// library-data.json. Test Hyphenopoly explicitly as a separate scenario below.
const fixtureLibrary=structuredClone(data);
const progressiveBook=fixtureLibrary.books.find(b=>b.id===book.id);
progressiveBook.hyphenation='off';
const hyphenBook=fixtureLibrary.books.find(b=>b.title==='Το ψωμίν');
assert.ok(hyphenBook,'Hyphenopoly browser fixture book is missing');
hyphenBook.hyphenation='el-polyton';
// Enough text for several real pages with the *legacy* paginator. Earlier
// versions only tested tokenBreaks and failed to notice that OPF never mounted.
hyphenBook.chapters=[{...hyphenBook.chapters[0],
 text:Array.from({length:42},()=>
  'Η παραδοσιακή βιβλιοθήκη είναι καταπληκτική. Καλημέρα στην παραδοσιακή βιβλιοθήκη.').join('\n\n'),
 richHtml:''}];
const fixtureJSON=Buffer.from(JSON.stringify(fixtureLibrary),'utf8');

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
  if(pathname==='/library-data.json'){
   res.writeHead(200,{'Content-Type':'application/json; charset=utf-8',
    'Content-Length':String(fixtureJSON.length),'Cache-Control':'no-store'});
   res.end(fixtureJSON);return;
  }
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
   location:reader?.pdlProgressLocation?.(),
   pageFlip:reader?.pdlOpenPageFlipDebug?.(),
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
 // A previously saved public 'off' switch must not disable page turning in
 // every book after the toggle has been retired.
 await page.evaluate(()=>localStorage.setItem('pdlOpenPageFlip','off'));
 await page.evaluate(id=>openBook('studio:'+id),book.id);
 await page.waitForFunction(()=>typeof document.querySelector('#reader-frame')?.contentWindow?.pdlProgressStats==='function',null,{timeout:30000});
 frame=page.frames().find(f=>f.url()==='about:srcdoc');
 assert.ok(frame,'Reader iframe not initialized');
 const mode=await frame.evaluate(()=>({hyphenation:PDL_HYPH.mode(),grid:pdlGridEnabled}));
 assert.equal(mode.hyphenation,'off','Progressive fixture must exercise the grid, not editorial Hyphenopoly');
 assert.ok(mode.grid,'Progressive grid must be enabled');
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
 // A live OpenPageFlip book must be present after a progressive long-distance
 // jump, and turning an already published page must animate without rebuilding
 // the engine mid-turn. This prevents the invisible/static-turn regression.
 await frame.waitForFunction(()=>{
  const d=pdlOpenPageFlipDebug();return d.enabled&&!d.failed&&d.activeChapter===currentChapter&&d.state==='read';
 },null,{timeout:20000});
 const opfBefore=await frame.evaluate(()=>({
  ...pdlOpenPageFlipDebug(),ch:currentChapter,pg:currentPage,
  total:chapters[currentChapter].pages.length
 }));
 assert.ok(opfBefore.pg+1<opfBefore.total-3,'Flip fixture must start away from a chapter/window edge');
 await frame.evaluate(()=>nextPage());
 await frame.waitForFunction(before=>{
  const d=pdlOpenPageFlipDebug();return currentChapter===before.ch&&currentPage===before.pg+1&&d.state==='read';
 },{ch:opfBefore.ch,pg:opfBefore.pg},{timeout:12000});
 const opfAfter=await frame.evaluate(()=>pdlOpenPageFlipDebug());
 assert.ok(opfAfter.animatedTurns>opfBefore.animatedTurns,'OpenPageFlip must perform an animated turn');
 // An adapter refresh after the completed animation can legitimately
 // rebuild the page window. Test whether the *active turn* was interrupted.
 assert.equal(opfAfter.interruptedTurns,opfBefore.interruptedTurns,
  'OpenPageFlip must not interrupt an animated turn');
 assert.equal(opfAfter.activeChapter,opfBefore.ch,'OpenPageFlip must remain on the same chapter');
 assert.ok(!opfAfter.failed,'OpenPageFlip must not fall back to static native pages');
 // Regression: a layout refresh can momentarily destroy the OPF instance
 // between the readiness check and a real user navigation command. The turn
 // must be retained and animated after reconstruction, never handled by an
 // immediate, static fallback to the native page renderer.
 const raceBefore=await frame.evaluate(()=>({
  ch:currentChapter,pg:currentPage,turns:pdlOpenPageFlipDebug().animatedTurns
 }));
 await frame.evaluate(()=>{
  window.dispatchEvent(new Event('pdl-grid-layout-ready'));
  nextPage();
 });
 await frame.waitForFunction(before=>{
  const d=pdlOpenPageFlipDebug();
  return currentChapter===before.ch&&currentPage===before.pg+1&&
   d.animatedTurns>before.turns&&d.state==='read'&&!d.pendingTurn;
 },raceBefore,{timeout:20000});
 assert.ok(!(await frame.evaluate(()=>pdlOpenPageFlipDebug())).failed,
  'OpenPageFlip must remain active after the relayout/navigation race');
 // Trigger a pagination-ready event *while* a genuine animation is underway.
 // The next OPF build may happen after the turn, but must never cancel it.
 const refreshBefore=await frame.evaluate(()=>({chapter:currentChapter,page:currentPage,
  turns:pdlOpenPageFlipDebug().animatedTurns,interrupts:pdlOpenPageFlipDebug().interruptedTurns}));
 await frame.evaluate(()=>{nextPage();window.dispatchEvent(new Event('pdl-grid-layout-ready'));});
 await frame.waitForFunction(before=>{
  const d=pdlOpenPageFlipDebug();return currentChapter===before.chapter&&
   currentPage===before.page+1&&d.animatedTurns>before.turns&&d.state==='read';
 },refreshBefore,{timeout:20000});
 assert.equal((await frame.evaluate(()=>pdlOpenPageFlipDebug())).interruptedTurns,
  refreshBefore.interrupts,'Layout-ready event must not interrupt the turn');
 // Previous tests used nextPage() only.  Reproduce an actual edge drag: a
 // generated animation is required even when the vendored core releases the
 // pointer without completing its own gesture.
 const edge=await frame.locator('#pdl-opf-host').boundingBox();
 assert.ok(edge&&edge.width>200,'OpenPageFlip must expose a visible gesture surface');
 const preDrag=await frame.evaluate(()=>({page:currentPage,chapter:currentChapter,turns:pdlOpenPageFlipDebug().animatedTurns}));
 const y=edge.y+edge.height*0.5;
 await page.mouse.move(edge.x+edge.width-9,y);
 await page.mouse.down();
 await page.mouse.move(edge.x+15,y,{steps:22});
 await page.mouse.up();
 await frame.waitForFunction(v=>{
  const d=pdlOpenPageFlipDebug();
  return d.animatedTurns>v.turns&&d.state==='read'&&currentChapter===v.chapter&&currentPage===v.page+1;
 },preDrag,{timeout:15000});
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
 console.log('PASS progressive book: first six pages, exact page-60 jump, all six chapters and complete text integrity');
 // The second fixture exercises both Greek WASM hyphenators and the explicitly
 // configured selector. This catches the former minWordLength TypeError.
 await page.evaluate(id=>openBook('studio:'+id),hyphenBook.id);
 await page.waitForFunction(()=>document.querySelector('#reader-frame')?.contentDocument?.title?.includes('Το ψωμίν')&&
  typeof document.querySelector('#reader-frame')?.contentWindow?.pdlProgressStats==='function',null,{timeout:30000});
 const hyphFrame=page.frames().find(f=>f.url()==='about:srcdoc');
 assert.ok(hyphFrame,'Hyphenopoly Reader iframe not initialized');
 await hyphFrame.waitForFunction(()=>PDL_HYPH.ready()||document.getElementById('pdl-hyphen-status')?.textContent?.includes('Δεν φορτώθηκε'),null,{timeout:45000});
 // A hyphenated book intentionally has no progressive chapter state.
 // Its legacy pages MUST still mount OpenPageFlip and support an actual edge drag.
 await hyphFrame.waitForFunction(()=>{
  const d=pdlOpenPageFlipDebug();
  return PDL_HYPH.mode()==='el-polyton'&&pdlProgressStats().chapters.length===0&&
   d.enabled&&!d.failed&&d.builds>0&&d.activeChapter===currentChapter&&d.state==='read';
 },null,{timeout:30000});
 const hyphOPF=await hyphFrame.evaluate(()=>({
  ...pdlOpenPageFlipDebug(),chapter:currentChapter,page:currentPage,
  pages:chapters[currentChapter].pages.length,
  computedHyphens:getComputedStyle(document.querySelector('#page-content p')).hyphens
 }));
 assert.ok(hyphOPF.pages>=2,'Hyphenated book fixture must have multiple pages');
 const hyphEdge=await hyphFrame.locator('#pdl-opf-host').boundingBox();
 assert.ok(hyphEdge&&hyphEdge.width>=200,'Hyphenated OpenPageFlip surface must exist');
 const hyphY=hyphEdge.y+hyphEdge.height*0.5;
 await page.mouse.move(hyphEdge.x+hyphEdge.width-9,hyphY);
 await page.mouse.down();
 await page.mouse.move(hyphEdge.x+15,hyphY,{steps:22});
 await page.mouse.up();
 await hyphFrame.waitForFunction(before=>{
  const d=pdlOpenPageFlipDebug();
  return d.enabled&&!d.failed&&d.animatedTurns>before.animatedTurns&&
   d.state==='read'&&currentChapter===before.chapter&&currentPage===before.page+1;
 },hyphOPF,{timeout:15000});
 assert.ok(!errors.length,'Hyphenated OpenPageFlip JS errors: '+errors.join(';'));
 console.log('PASS OpenPageFlip with active editorial el-polyton: legacy pages mount and real mouse drag animates');
 const hyphReport=await hyphFrame.evaluate(()=>{
  const polyton={mode:PDL_HYPH.mode(),ready:PDL_HYPH.ready(),breaks:PDL_HYPH.tokenBreaks('παραδοσιακός')};
  PDL_HYPH.setMode('el-monoton');
  const monoton={mode:PDL_HYPH.mode(),breaks:PDL_HYPH.tokenBreaks('παραδοσιακός')};
  return {polyton,monoton};
 });
 assert.equal(hyphReport.polyton.mode,'el-polyton');
 assert.ok(hyphReport.polyton.ready,'Hyphenopoly WASM must load');
 assert.ok(hyphReport.polyton.breaks.length>0,'Polytonic pattern must provide valid word breaks');
 assert.ok(hyphReport.monoton.breaks.length>0,'Monotonic pattern must provide valid word breaks');
 assert.ok(!warnings.some(w=>w.includes('Hyphenopoly token')||w.includes('Hyphenopoly unavailable for this reading session')||w.includes('minWordLength')),
  'No Hyphenopoly token error, including minWordLength, is allowed');
 assert.ok(!errors.length,'Hyphenopoly browser errors: '+errors.join(';'));
 console.log('PASS Hyphenopoly 6.1.0: polytonic/monotonic selectors and word breaks');
 await page.close();
}catch(e){
 console.error('Progressive browser test diagnostics:',JSON.stringify(await diagnostics(),null,2));
 if(errors.length)console.error('JavaScript errors:',errors.join(' | '));
 if(warnings.length)console.error('Browser console:',warnings.slice(-8).join(' | '));
 throw e;
}finally{
 if(browser)await browser.close().catch(()=>{});
 await new Promise(resolve=>server.close(resolve));
}
