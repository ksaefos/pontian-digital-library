import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, stat} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';

const root=path.resolve(import.meta.dirname,'..');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript',
 '.css':'text/css','.json':'application/json','.wasm':'application/wasm',
 '.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp'};
const server=createServer(async(req,res)=>{
 try{
  const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
  if(!file.startsWith(root+path.sep)||!(await stat(file)).isFile()){
   res.writeHead(404).end();return;
  }
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});
  res.end(await readFile(file));
 }catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=`http://127.0.0.1:${server.address().port}/index.html`;
let browser;
const errors=[];
async function open(page,id){
 await page.evaluate(id=>openBook(id),id);
 await page.waitForFunction(()=>typeof document.getElementById('reader-frame')?.contentWindow?.pdlProgressStats==='function');
 const frame=page.frames().find(f=>f.url()==='about:srcdoc');
 await frame.waitForFunction(()=>pdlProgressStats().complete&&!pdlProgress.desired&&pdlProgress.absolute===null,null,{timeout:180000});
 // The library bridge restores saved progress after its initial 850 ms delay.
 await page.waitForTimeout(1000);
 await frame.waitForFunction(()=>pdlProgressStats().complete&&!pdlProgress.desired&&pdlProgress.absolute===null,null,{timeout:180000});
 await quiet(frame);
 return frame;
}
async function quiet(frame){
 await frame.waitForFunction(()=>{
  const d=pdlOpenPageFlipDebug();
  return d.state==='read'&&!d.failed&&!d.buildQueued&&d.gestureHold===0;
 },null,{timeout:30000});
}
const location=frame=>frame.evaluate(()=>({chapter:currentChapter,page:currentPage,
 start:pdlPageAnchor(currentChapter,currentPage),
 next:currentPage+1<chapters[currentChapter].pages.length?pdlPageAnchor(currentChapter,currentPage+1):null}));
const compare=(a,b)=>a.index-b.index||a.offset-b.offset;
function contains(position,anchor){
 assert.ok(compare(position.start,anchor)<=0,'Restored page must not skip the saved source anchor');
 if(position.next)assert.ok(compare(position.next,anchor)>0,'Saved anchor must be inside the restored page');
}
try{
 browser=await chromium.launch({headless:true,
  ...(process.env.PDL_CHROMIUM_EXECUTABLE?{executablePath:process.env.PDL_CHROMIUM_EXECUTABLE}:{})});
 const page=await browser.newPage({viewport:{width:390,height:844}});
 page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(url);
 await page.waitForFunction(()=>libraryState.books.length>0);
 const id=await page.evaluate(()=>libraryState.books.find(b=>b.title==='Η Σωνίτσα').id);
 let frame=await open(page,id);
 if(process.env.PDL_READER_CASE!=='layout'){
  await frame.evaluate(()=>pdlProgressGo(0,10));
  const before=await location(frame);
  assert.ok(before.start.index>0,'Resume test must start well into the source');
  await page.waitForFunction(({id,pg})=>JSON.parse(localStorage.getItem('pdl:v140:position:'+id))?.pg===pg,{id,pg:before.page});
  await page.evaluate(()=>closeBook());
  await page.setViewportSize({width:1366,height:900});
  frame=await open(page,id);
  contains(await location(frame),before.start);
  const saved=await page.evaluate(id=>JSON.parse(localStorage.getItem('pdl:v140:position:'+id)),id);
  assert.ok(Number.isSafeInteger(saved.anchor?.index)&&Number.isSafeInteger(saved.anchor?.offset),
   'Saved progress must include a source anchor');
  console.log('PASS reading position survives close/reopen across mobile and desktop viewports');

  // Existing page-only records remain valid, including their chapter IDs.
  await page.evaluate(id=>{
   closeBook();localStorage.setItem('pdl:v140:position:'+id,JSON.stringify({ch:0,pg:3}));
  },id);
  frame=await open(page,id);
  assert.equal((await location(frame)).page,3,'Legacy page-only progress must still restore');
  // An invalid anchor must fall back to the legacy page rather than stall.
  await page.evaluate(id=>{
   closeBook();localStorage.setItem('pdl:v140:position:'+id,JSON.stringify({ch:0,pg:3,anchor:{index:-1,offset:0}}));
  },id);
  frame=await open(page,id);
  assert.equal((await location(frame)).page,3,'Malformed source anchor must retain page-only fallback');
  console.log('PASS page-only progress and malformed-anchor fallback remain compatible');

  // Closing during startup must not erase the saved target with page zero.
  const persisted=await page.evaluate(id=>localStorage.getItem('pdl:v140:position:'+id),id);
  await page.evaluate(()=>closeBook());
  await page.evaluate(id=>openBook(id),id);
  await page.waitForFunction(()=>typeof document.getElementById('reader-frame')?.contentWindow?.pdlProgressStats==='function');
  await page.evaluate(()=>closeBook());
  assert.equal(await page.evaluate(id=>localStorage.getItem('pdl:v140:position:'+id),id),persisted,
   'Startup placeholder must not overwrite saved progress before restoration');
  frame=await open(page,id);
  console.log('PASS closing during startup preserves the saved reading target');
 }
 if(process.env.PDL_READER_CASE!=='position'){
  await page.setViewportSize({width:1366,height:900});
  await frame.evaluate(()=>pdlSetLayout('single'));
  await frame.waitForFunction(()=>pdlProgressStats().complete,null,{timeout:180000});
  await quiet(frame);
  await frame.evaluate(()=>pdlProgressGo(0,3));
  await quiet(frame);
  const before=await frame.evaluate(()=>({debug:pdlOpenPageFlipDebug(),page:currentPage}));
  const during=await frame.evaluate(()=>{
   nextPage();
   const turning=pdlOpenPageFlipDebug();
   pdlSetLayout('double');
   return {turning,after:pdlOpenPageFlipDebug(),layout:pdlLayout};
  });
  assert.equal(during.turning.state,'flipping','Test must actually overlap an animation');
  assert.equal(during.after.interruptedTurns,before.debug.interruptedTurns,
   'Layout request must not destroy the engine during an animation');
  assert.equal(during.layout,'single','Layout geometry must stay stable while the page is turning');
  await frame.waitForFunction(pg=>currentPage===pg&&pdlOpenPageFlipDebug().state==='read',before.page+1,{timeout:15000});
  const turned=await location(frame);
  await frame.waitForFunction(()=>pdlLayout==='double'&&pdlProgressStats().complete,null,{timeout:180000});
  await quiet(frame);
  contains(await location(frame),turned.start);
  assert.equal((await frame.evaluate(()=>pdlOpenPageFlipDebug())).interruptedTurns,before.debug.interruptedTurns);
  console.log('PASS layout switch waits for animation and preserves the completed turn source anchor');

  // A newer request cancels a queued layout change, including a return to
  // the current layout. It must not apply an obsolete switch after release.
  await frame.evaluate(()=>pdlSetLayout('single'));
  await frame.waitForFunction(()=>pdlLayout==='single'&&pdlProgressStats().complete,null,{timeout:180000});
  await quiet(frame);
  const superseded=await frame.evaluate(()=>{
   const before=pdlOpenPageFlipDebug();nextPage();pdlSetLayout('double');pdlSetLayout('single');
   return before;
  });
  await quiet(frame);
  assert.equal(await frame.evaluate(()=>pdlLayout),'single');
  assert.equal((await frame.evaluate(()=>pdlOpenPageFlipDebug())).interruptedTurns,superseded.interruptedTurns);
  console.log('PASS latest layout request supersedes a queued change without interrupting the turn');

  // A held real pointer also owns the engine before a flip has started.
  const box=await frame.locator('#pdl-opf-host').boundingBox();
  await page.mouse.move(box.x+box.width-10,box.y+box.height/2);
  await page.mouse.down();
  const held=await frame.evaluate(()=>{
   const before=pdlOpenPageFlipDebug();pdlSetLayout('double');
   return {before,after:pdlOpenPageFlipDebug(),layout:pdlLayout};
  });
  assert.equal(held.layout,'single','Layout must remain unchanged while pointer is down');
  assert.equal(held.after.builds,held.before.builds);
  assert.equal(held.after.activeChapter,held.before.activeChapter,'Held pointer must retain its engine');
  await page.mouse.move(box.x+box.width-28,box.y+box.height/2,{steps:3});
  await page.mouse.up();
  await frame.waitForFunction(()=>pdlLayout==='double'&&pdlProgressStats().complete,null,{timeout:180000});
  await quiet(frame);
  assert.equal((await frame.evaluate(()=>pdlOpenPageFlipDebug())).interruptedTurns,held.before.interruptedTurns);
  console.log('PASS layout switch waits for a held real pointer and release');
 }
 if(process.env.PDL_READER_CASE!=='layout'){
  const polytonId=await page.evaluate(()=>libraryState.books.find(b=>b.hyphenation==='el-polyton').id);
  frame=await open(page,polytonId);
  await frame.evaluate(()=>pdlProgressGo(1,3));
  await frame.waitForFunction(()=>currentChapter===1&&currentPage===3&&!pdlProgress.desired,null,{timeout:30000});
  const before=await location(frame);
  await page.waitForFunction(({id,position})=>{
   const saved=JSON.parse(localStorage.getItem('pdl:v140:position:'+id));
   return saved?.ch===position.chapter&&saved.pg===position.page&&
    saved.anchor?.index===position.start.index&&saved.anchor?.offset===position.start.offset;
  },{id:polytonId,position:before});
  await page.evaluate(()=>{closeBook();localStorage.setItem('fontSize','130');});
  await page.setViewportSize({width:390,height:844});
  frame=await open(page,polytonId);
  contains(await location(frame),before.start);
  assert.equal(await frame.evaluate(()=>currentFontSize),130);
  assert.equal(await frame.evaluate(()=>pdlProgressStats().fallback),false);
  console.log('PASS real polytonic book resumes at its source anchor after viewport and 130% typography change');
  // Startup can pass through multiple legacy/WASM layouts. Retain the exact
  // requested source point, not the earlier start of each containing page.
  await quiet(frame);
  await frame.evaluate(()=>{pdlGridEnabled=false;pdlPaginate();render();});
  await quiet(frame);contains(await location(frame),before.start);
  await frame.evaluate(()=>{pdlGridEnabled=true;pdlPaginate();render();});
  await frame.waitForFunction(()=>pdlProgressStats().complete&&!pdlProgress.desired,null,{timeout:180000});
  await quiet(frame);contains(await location(frame),before.start);
  await page.waitForFunction(({id,anchor})=>{
   const p=JSON.parse(localStorage.getItem('pdl:v140:position:'+id));
   return p?.anchor?.index===anchor.index&&p.anchor.offset===anchor.offset;
  },{id:polytonId,anchor:before.start});
  const current=await location(frame);
  await frame.evaluate(()=>nextPage());
  await frame.waitForFunction(pg=>currentPage===pg,current.page+1);await quiet(frame);
  const advanced=await location(frame);
  await page.waitForFunction(({id,anchor})=>{
   const p=JSON.parse(localStorage.getItem('pdl:v140:position:'+id));
   return p?.anchor?.index===anchor.index&&p.anchor.offset===anchor.offset;
  },{id:polytonId,anchor:advanced.start});
  console.log('PASS repeated legacy/progressive startup preserves the requested anchor; navigation releases it');
 }
 assert.deepEqual(errors,[],'Reader must not emit JavaScript errors');
 await page.close();
}finally{
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
