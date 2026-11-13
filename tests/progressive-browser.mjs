import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {readFile, stat} from 'node:fs/promises';
import path, {resolve} from 'node:path';
import {chromium} from 'playwright';

// OpenPageFlip is rebuilt by the adapter after layout/progress events. A real
// pointer gesture started while such a rebuild is pending would be orphaned
// (the host element is replaced), which is the failure this helper prevents:
// wait until the adapter is idle and its build counter has stopped changing.
async function waitForOpfQuiet(target,{quietMs=600,timeout=20000}={}){
 await target.waitForFunction(({quietMs})=>{
  const d=pdlOpenPageFlipDebug();
  const sig=[d.builds,d.animatedTurns,d.page,d.state,d.buildQueued,d.pendingTurn,d.gestureHold].join('|');
  const now=performance.now();
  if(window.__pdlOpfQuiet?.sig!==sig){window.__pdlOpfQuiet={sig,since:now};return false;}
  return d.enabled&&!d.failed&&d.state==='read'&&!d.buildQueued&&!d.pendingTurn&&
   d.gestureHold===0&&now-window.__pdlOpfQuiet.since>=quietMs;
 },{quietMs},{timeout,polling:100});
}

const root=resolve(import.meta.dirname,'..');
const data=JSON.parse(readFileSync(resolve(root,'library-data.json'),'utf8'));
const book=data.books.find(b=>b.title==='Η Σωνίτσα');
assert.ok(book,'Stress-test book is missing');
// Never rewrite published book settings just to fit a test. The in-memory
// response exercises both the nonhyphenated and the WASM-hyphenated progressive
// paths, preserving the source data on disk.
const fixtureLibrary=structuredClone(data);
const progressiveBook=fixtureLibrary.books.find(b=>b.id===book.id);
progressiveBook.hyphenation='off';
const hyphenBook=fixtureLibrary.books.find(b=>b.title==='Το ψωμίν');
assert.ok(hyphenBook,'Hyphenopoly browser fixture book is missing');
hyphenBook.hyphenation='el-polyton';
// Enough text for multiple progressive batches with real Greek WASM patterns.
// Earlier versions tested tokenBreaks without testing the actual page layout.
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
 // Idle first; then prove that a layout-ready event for an UNCHANGED window no
 // longer replaces the OpenPageFlip host (the cause of orphaned gestures).
 await waitForOpfQuiet(frame);
 const unchangedBefore=await frame.evaluate(()=>pdlOpenPageFlipDebug());
 await frame.evaluate(()=>window.dispatchEvent(new Event('pdl-grid-layout-ready')));
 await waitForOpfQuiet(frame,{quietMs:500});
 const unchangedAfter=await frame.evaluate(()=>pdlOpenPageFlipDebug());
 assert.equal(unchangedAfter.builds,unchangedBefore.builds,
  'An unchanged layout-ready event must not rebuild OpenPageFlip');
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
 // The initial safe legacy pages are replaced by progressive batches only
 // after the actual Greek Hyphenopoly WASM has loaded successfully.
 await hyphFrame.waitForFunction(()=>{
  const s=pdlProgressStats();return s.complete||s.errors.length>0||s.fallback;
 },null,{timeout:180000});
 const hyphStats=await hyphFrame.evaluate(()=>pdlProgressStats());
 assert.equal(hyphStats.mode,'progressive-hyphenated-batches',
  'Loaded el-polyton MUST use the unified progressive paginator');
 assert.ok(!hyphStats.fallback&&!hyphStats.errors.length,
  'Hyphenation must not silently fall back after a failed progressive layout: '+hyphStats.errors.join(' | '));
 assert.ok(hyphStats.complete&&hyphStats.chapters.every(ch=>ch.done),
  'Every hyphenated chapter must complete its progressive batches');
 const hyphIntegrity=await hyphFrame.evaluate(()=>chapters.map((chapter,ci)=>{
  const original=PDL_SOURCE[ci].blocks.map(b=>pdlPlain(b.text||'')).join('');
  const rendered=chapter.pages.flat().map(b=>pdlPlain(b.text||'')).join('');
  const structural=['divider','telos','table','image'];
  const before=PDL_SOURCE[ci].blocks.filter(b=>structural.includes(b.type)).map(b=>b.type);
  const after=chapter.pages.flat().filter(b=>structural.includes(b.type)).map(b=>b.type);
  return {ci,bytesEqual:original===rendered,structuresEqual:JSON.stringify(before)===JSON.stringify(after)};
 }));
 assert.ok(hyphIntegrity.every(ch=>ch.bytesEqual&&ch.structuresEqual),
  'Hyphenated progressive pages must preserve every source character and structural element');
 // Real WASM word cuts must generate individual measurable segments with
 // source-based offsets, not SHY-inflated positions or arbitrary graphemes.
 const segments=await hyphFrame.evaluate(()=>{
  const word='παραδοσιακός';const node=document.createElement('p');node.textContent=word;
  const result=pdlGridWordify(node,true);
  return {word,rendered:node.textContent.replaceAll('\u00AD',''),
   offsets:result.words.map(el=>Number(el.dataset.offset)),
   cuts:PDL_HYPH.tokenBreaks(word)};
 });
 assert.equal(segments.rendered,segments.word,'Measurement separators must not alter source letters');
 assert.ok(segments.cuts.length>0&&segments.offsets.length>1,
  'WASM word breaks must create measurable progressive fragments');
 assert.deepEqual(segments.offsets.slice(1),segments.cuts,
  'Every hyphenation fragment must retain its original source offset');
 await hyphFrame.waitForFunction(()=>{
  const d=pdlOpenPageFlipDebug();
  return d.enabled&&!d.failed&&d.builds>0&&d.activeChapter===currentChapter&&d.state==='read';
 },null,{timeout:30000});
 const hyphOPF=await hyphFrame.evaluate(()=>({
  ...pdlOpenPageFlipDebug(),chapter:currentChapter,page:currentPage,
  pages:chapters[currentChapter].pages.length,
  computedHyphens:getComputedStyle(document.querySelector('#page-content p')).hyphens
 }));
 assert.ok(hyphOPF.pages>=2,'Hyphenated book fixture must have multiple pages');
 await waitForOpfQuiet(hyphFrame);
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
 console.log('PASS OpenPageFlip with progressive el-polyton: complete pages, source integrity and real mouse drag');
 // Reflow must restore the exact source anchor even when WASM hyphenation
 // changes the page count. This is a separate navigation regression from drag.
 const hyphBeforeReflow=await hyphFrame.evaluate(()=>({
  generation:pdlProgressStats().generation,
  anchor:pdlPageAnchor(currentChapter,currentPage),
  font:pdlFont,
  computedFont:getComputedStyle(document.getElementById('page-content')).fontFamily
 }));
 // The previous book already selected Barnebok and the Reader persists that
 // preference in localStorage. Setting Barnebok again is not a font change:
 // the progress signature remains unchanged and no new generation is expected.
 // Select the OTHER font to test actual reflow, regardless of saved settings.
 const hyphNextFont=hyphBeforeReflow.font==='Barnebok Pontian'
  ?'GFS Galatea Pontian':'Barnebok Pontian';
 assert.notEqual(hyphNextFont,hyphBeforeReflow.font,
  'The hyphenated reflow test must request a real font change');
 await hyphFrame.evaluate(font=>pdlSetFont(font),hyphNextFont);
 await hyphFrame.waitForFunction(({generation,font})=>
  pdlFont===font&&pdlProgressStats().generation>generation,
  {generation:hyphBeforeReflow.generation,font:hyphNextFont},{timeout:30000});
 const hyphAppliedFont=await hyphFrame.evaluate(()=>getComputedStyle(document.getElementById('page-content')).fontFamily);
 assert.notEqual(hyphAppliedFont,hyphBeforeReflow.computedFont,
  'The Reader must apply a different computed font before verifying reflow');
 await hyphFrame.waitForFunction(()=>{
  const s=pdlProgressStats();return s.complete||s.errors.length>0||s.fallback;
 },null,{timeout:180000});
 const hyphReflow=await hyphFrame.evaluate(()=>({
  stats:pdlProgressStats(),start:pdlPageAnchor(currentChapter,currentPage),
  next:pdlPageAnchor(currentChapter,currentPage+1),
  last:currentPage+1>=chapters[currentChapter].pages.length,
  integrity:chapters.every((c,i)=>PDL_SOURCE[i].blocks.map(b=>pdlPlain(b.text||'')).join('')===
    c.pages.flat().map(b=>pdlPlain(b.text||'')).join(''))
 }));
 const compareAnchor=(a,b)=>a.index-b.index||(a.offset||0)-(b.offset||0);
 assert.ok(hyphReflow.stats.complete&&!hyphReflow.stats.fallback&&!hyphReflow.stats.errors.length,
  'Hyphenated font reflow must complete without silent legacy fallback');
 assert.ok(hyphReflow.integrity,'Hyphenated font reflow must retain all chapter text');
 assert.ok(compareAnchor(hyphReflow.start,hyphBeforeReflow.anchor)<=0,
  'Hyphenated reflow must never skip the previously visible source anchor');
 if(!hyphReflow.last)assert.ok(compareAnchor(hyphReflow.next,hyphBeforeReflow.anchor)>0,
  'Hyphenated reflow must keep the saved anchor on the restored page');
 console.log(`PASS hyphenated font reflow: ${hyphBeforeReflow.font} → ${hyphNextFont}; complete pages and source anchor retained`);
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
