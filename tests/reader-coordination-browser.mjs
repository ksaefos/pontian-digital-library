import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {chromium,firefox,webkit} from 'playwright';

const root=path.resolve(import.meta.dirname,'..');
const name=process.env.PDL_BROWSER||'chromium',type={chromium,firefox,webkit}[name];
assert.ok(type,'Unknown browser');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css',
 '.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml',
 '.png':'image/png','.webp':'image/webp'};
const server=createServer(async(req,res)=>{try{
 const file=path.resolve(root,'dist','.'+new URL(req.url,'http://localhost').pathname);
 if(!file.startsWith(path.join(root,'dist')+path.sep)||!(await stat(file)).isFile()){
  res.writeHead(404).end();return;
 }
 res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});
 res.end(await readFile(file));
}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser,frame;
const errors=[],measurements=[];
const compare=(a,b)=>a.index-b.index||a.offset-b.offset;
async function stable(){
 await frame.waitForFunction(()=>{
  const s=pdlProgressStats(),d=pdlOpenPageFlipDebug();
  return s.complete&&!s.fallback&&!pdlProgress.desired&&d.state==='read'&&!d.failed&&!d.buildQueued&&!d.gestureHold;
 },null,{timeout:180000});
}
async function contains(anchor){
 const p=await frame.evaluate(()=>({start:pdlPageAnchor(currentChapter,currentPage),
  next:currentPage+1<chapters[currentChapter].pages.length?pdlPageAnchor(currentChapter,currentPage+1):null}));
 assert.ok(compare(p.start,anchor)<=0,'Reflow must not skip the completed turn source anchor');
 if(p.next)assert.ok(compare(p.next,anchor)>0,'The completed turn anchor must remain in the visible page');
}
try{
 browser=await type.launch({headless:true});
 const page=await browser.newPage({serviceWorkers:'block',viewport:{width:1366,height:900}});
 page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
 await page.waitForFunction(()=>libraryState.books.length>0);
 await page.evaluate(()=>{localStorage.setItem('pdlLayout','single');openBook(libraryState.books.find(b=>b.title==='Η Σωνίτσα').id);});
 await page.waitForFunction(()=>typeof document.getElementById('reader-frame')?.contentWindow?.pdlProgressStats==='function');
 frame=page.frames().find(f=>f.url()==='about:srcdoc');
 await stable();await page.waitForTimeout(1100);await stable();
 await frame.evaluate(()=>pdlProgressGo(0,3));await stable();
 // Same real-browser fixture also supplies a before/after measurement. Count
 // executions of the legacy adapter's exact polling delays, not all app timers.
 const before=await frame.evaluate(()=>{
  const set=window.setTimeout.bind(window);
  window.coordinationPolls=0;
  window.setTimeout=function(fn,delay,...args){
   if((delay===75||delay===130)&&typeof fn==='function'){
    return set(()=>{window.coordinationPolls++;fn(...args);},delay);
   }
   return set(fn,delay,...args);
  };
  const d=pdlOpenPageFlipDebug(),anchor=pdlPageAnchor(0,4);
  nextPage();assertTurning();
  function assertTurning(){if(pdlOpenPageFlipDebug().state!=='flipping')throw Error('Fixture must overlap an actual animation');}
  for(let i=0;i<20;i++){
   pdlSetLayout(i%2?'single':'double');pdlPaginate();
   window.dispatchEvent(new Event('pdl-grid-layout-ready'));
   window.dispatchEvent(new Event('pdl-progress-opf-extend'));
  }
  pdlSetLayout('double');
  return {d,anchor,started:performance.now()};
 });
 await frame.waitForFunction(()=>pdlLayout==='double');await stable();
 // Include any legacy relayout timer that is invisible to its debug object.
 await page.waitForTimeout(350);await stable();await contains(before.anchor);
 const after=await frame.evaluate(()=>({d:pdlOpenPageFlipDebug(),polls:coordinationPolls,ended:performance.now()}));
 assert.ok(after.d.coordinator,'The tested artifact must contain the shared coordinator');
 assert.deepEqual(after.d.coordinator.pending,[],'All coalesced work must settle');
 assert.equal(after.polls,0,'Legacy 75/130 ms polling loops must be removed');
 assert.equal(after.d.interruptedTurns,before.d.interruptedTurns);
 assert.equal(after.d.animatedTurns,before.d.animatedTurns+1,'A storm must retain exactly one genuine animated turn');
 measurements.push({scenario:'animation-and-81-requests',builds:after.d.builds-before.d.builds,
  interruptedTurns:after.d.interruptedTurns-before.d.interruptedTurns,
  legacyPollCallbacks:after.polls,settledMs:Math.round(after.ended-before.started),
  coalesced:after.d.coordinator.coalesced-before.d.coordinator.coalesced,
  coordinatorTimerCallbacks:after.d.coordinator.timerFires-before.d.coordinator.timerFires});
 console.log('PASS '+name+': animation + competing layout/pagination/window requests preserve the completed source anchor');

 // pdlRelayout includes search reindexing and render as well as measurement.
 // Deferring only its nested pdlPaginate would search an obsolete page mapping
 // during the animation and can navigate away before that turn finishes.
 await frame.evaluate(()=>pdlSetLayout('single'));await stable();
 await frame.evaluate(()=>pdlProgressGo(0,3));await stable();
 const transaction=await frame.evaluate(()=>{
  const search=window.onTextSearch;window.coordinationSearchStates=[];
  window.onTextSearch=function(...args){coordinationSearchStates.push(pdlOpenPageFlipDebug().state);return search.apply(this,args);};
  tsQuery='Σωνίτσα';nextPage();
  const turning=pdlOpenPageFlipDebug().state;pdlRelayout();
  return {turning,calls:coordinationSearchStates.length};
 });
 assert.equal(transaction.turning,'flipping');
 assert.equal(transaction.calls,0,'The complete relayout transaction must wait for the animation');
 await frame.waitForFunction(()=>coordinationSearchStates.length>0);await stable();
 const search=await frame.evaluate(()=>({states:coordinationSearchStates,hits:tsResults.length}));
 assert.ok(search.hits>0,'Real search must still find results after deferred measurement');
 assert.ok(search.states.every(state=>state!=='flipping'),'Search must run after measurement at rest');
 await frame.evaluate(()=>clearTextSearch());
 console.log('PASS '+name+': deferred relayout keeps measurement, render and real search reindexing together');

 const box=await frame.locator('#pdl-opf-host').boundingBox();
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
 const held=await frame.evaluate(()=>{
  window.heldHost=document.getElementById('pdl-opf-host');
  const d=pdlOpenPageFlipDebug();
  for(let i=0;i<20;i++){
   pdlSetLayout(i%2?'single':'double');pdlPaginate();
   window.dispatchEvent(new Event('pdl-progress-opf-extend'));
  }
  pdlSetLayout('double');return d;
 });
 await page.waitForTimeout(550);
 assert.deepEqual(await frame.evaluate(()=>({same:heldHost===document.getElementById('pdl-opf-host'),layout:pdlLayout,
  builds:pdlOpenPageFlipDebug().builds})),{same:true,layout:'single',builds:held.builds},
  'An actual held pointer must retain its host, page mapping and layout');
 await page.mouse.up();await frame.waitForFunction(()=>pdlLayout==='double');await stable();
 const released=await frame.evaluate(()=>pdlOpenPageFlipDebug());
 assert.equal(released.interruptedTurns,held.interruptedTurns);
 measurements.push({scenario:'held-pointer-and-61-requests',builds:released.builds-held.builds,
  interruptedTurns:released.interruptedTurns-held.interruptedTurns});
 console.log('PASS '+name+': held real pointer keeps its host until release; latest layout wins');

 // Progressively extending an unchanged middle window must keep its DOM.
 await frame.evaluate(()=>pdlProgressGo(0,10));await stable();
 const noChange=await frame.evaluate(()=>{
  const d=pdlOpenPageFlipDebug();window.unchangedHost=document.getElementById('pdl-opf-host');
  for(let i=0;i<50;i++)window.dispatchEvent(new Event('pdl-progress-opf-extend'));
  return d;
 });
 await stable();
 const unchanged=await frame.evaluate(()=>({same:unchangedHost===document.getElementById('pdl-opf-host'),d:pdlOpenPageFlipDebug()}));
 assert.equal(unchanged.same,true);assert.equal(unchanged.d.builds,noChange.builds);
 console.log('PASS '+name+': redundant progressive-window notifications retain the mounted DOM');

 // A programmatic render must pass through the same gate as a rebuild. The
 // unchanged-window turnTo path used to bypass the pointer protection.
 const surface=await frame.locator('#pdl-opf-host').boundingBox();
 await page.mouse.move(surface.x+surface.width/2,surface.y+surface.height/2);await page.mouse.down();
 const jump=await frame.evaluate(()=>{
  const d=pdlOpenPageFlipDebug();window.jumpHost=document.getElementById('pdl-opf-host');
  currentPage-=2;render();window.dispatchEvent(new Event('pdl-grid-layout-ready'));
  return {local:d.page,target:currentPage};
 });
 await page.waitForTimeout(200);
 assert.deepEqual(await frame.evaluate(()=>({local:pdlOpenPageFlipDebug().page,
  same:jumpHost===document.getElementById('pdl-opf-host')})),{local:jump.local,same:true},
  'Even window reuse must not snap a leaf under a held pointer');
 await page.mouse.up();await stable();
 const jumped=await frame.evaluate(()=>({page:currentPage,local:pdlOpenPageFlipDebug().page,start:pdlOpenPageFlipDebug().windowStart}));
 assert.equal(jumped.page,jump.target);assert.equal(jumped.start+jumped.local,jump.target);
 console.log('PASS '+name+': programmatic page synchronization also waits for a held pointer');
 assert.deepEqual(errors,[],'No uncaught browser errors');
 console.log(JSON.stringify({browser:name,version:browser.version(),measurements}));
}catch(e){
 if(frame)console.error(await frame.evaluate(()=>({opf:pdlOpenPageFlipDebug(),progress:pdlProgressStats()})).catch(()=>({unavailable:true})));
 throw e;
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
