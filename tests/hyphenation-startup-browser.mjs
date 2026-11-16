import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
const root=path.resolve(import.meta.dirname,'..');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png'};
const server=createServer(async(req,res)=>{try{
 const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
 if(!file.startsWith(root+path.sep)||!(await stat(file)).isFile()){res.writeHead(404).end();return;}
 let data=await readFile(file);
 if(file.endsWith('/index.html')){
  const source=data.toString(),match=source.match(/<script id="pdl-reader-shell" type="application\/json">([\s\S]*?)<\/script>/),shell=JSON.parse(match[1]);
  const marker='pdlPaginate();\nPDL_HYPH.activate();';assert.ok(shell.template.includes(marker));
  shell.template=shell.template.replace(marker,`window.startupAudit={started:performance.now(),legacy:[],firstVisibleMs:null,firstVerifiedMs:null};
const measuredLegacy=pdlLegacyPaginate;
pdlLegacyPaginate=function(){const start=performance.now();try{return measuredLegacy.apply(this,arguments)}finally{startupAudit.legacy.push(performance.now()-start)}};
const measuredRender=render;
render=function(){const out=measuredRender.apply(this,arguments);if(startupAudit.firstVisibleMs===null&&document.getElementById('page-content').textContent.trim()){startupAudit.firstVisibleMs=performance.now()-startupAudit.started;startupAudit.firstVisibleHyphenated=PDL_HYPH.ready()}return out};
window.addEventListener('pdl-progress-pages',()=>{if(startupAudit.firstVerifiedMs===null)startupAudit.firstVerifiedMs=performance.now()-startupAudit.started});
${marker}`);
  data=Buffer.from(source.replace(match[1],()=>JSON.stringify(shell).replaceAll('<','\\u003c')));
 }
 res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});res.end(data);
}catch(e){res.writeHead(404).end(String(e));}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
let browser;
async function readyFrame(page){
 await page.waitForFunction(()=>typeof document.getElementById('reader-frame')?.contentWindow?.pdlProgressStats==='function',null,{timeout:30000});
 return page.frames().find(f=>f.url()==='about:srcdoc');
}
async function completed(frame){
 await frame.waitForFunction(()=>{
  const s=pdlProgressStats();return s.complete||s.errors.length||(s.mode==='legacy'&&startupAudit.legacy.length&&!s.waitingForHyphenation);
 },null,{timeout:180000});
}
async function integrity(frame){
 const result=await frame.evaluate(()=>{
  const decode=b=>{const n=document.createElement('div');n.innerHTML=b.text||'';return n.textContent||'';};
  return chapters.every((ch,ci)=>{
   const source=PDL_SOURCE[ci].blocks,output=ch.pages.flat();
   const structures=a=>a.filter(b=>!['p','dialogue'].includes(b.type)).map(b=>b.type);
   return source.every((b,bi)=>decode(b)===output.filter(f=>f._pdlAnchor?.index===bi).map(decode).join(''))&&
    JSON.stringify(structures(source))===JSON.stringify(structures(output));
  });
 });assert.ok(result,'Every source block, authored soft hyphen and structural element must survive');
}
try{
 browser=await chromium.launch({headless:true,...(process.env.PDL_CHROMIUM_EXECUTABLE?{executablePath:process.env.PDL_CHROMIUM_EXECUTABLE}:{})});
 const benchmark=process.env.PDL_STARTUP_BENCHMARK==='1';
 const scenarios=benchmark?['healthy','healthy','healthy']:['healthy','delayed','resume-pending','timeout','loader-error','grid-off'];
 for(const scenario of scenarios){
  const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  let release;const gate=new Promise(r=>release=r);
  if(['delayed','resume-pending','timeout'].includes(scenario))await page.route('**/patterns/*.wasm',async route=>{await gate;await route.continue().catch(()=>{});});
  if(scenario==='loader-error')await page.route('**/Hyphenopoly_Loader.js',route=>route.abort());
  await page.goto(base+'/index.html');await page.waitForFunction(()=>libraryState.books.length===4);
  const book=await page.evaluate(()=>libraryState.books.find(b=>b.hyphenation==='el-polyton').id);
  if(scenario==='grid-off')await page.evaluate(()=>localStorage.setItem('pdlGridEngine','off'));
  const saved=scenario==='resume-pending'?await page.evaluate(id=>{
   const value=JSON.stringify({ch:1,chapterId:importedBooks[id].chapters[1].id,pg:3});
   localStorage.setItem('pdl:v140:position:'+id,value);return value;
  },book):null;
  await page.evaluate(id=>openBook(id),book);let frame=await readyFrame(page);
  if(scenario==='resume-pending'){
   await page.waitForTimeout(1100);
   assert.equal(await frame.evaluate(()=>startupAudit.legacy.length),0);
   assert.equal(await page.evaluate(id=>localStorage.getItem('pdl:v140:position:'+id),book),saved);
   await page.evaluate(()=>closeBook());release();
   assert.equal(await page.evaluate(id=>localStorage.getItem('pdl:v140:position:'+id),book),saved);
   await page.evaluate(id=>openBook(id),book);frame=await readyFrame(page);
  }
  if(scenario==='delayed'){
   // Ensure the saved-position bridge's 850 ms timer has run while WASM is
   // still unavailable. Placeholder pages must remain inert and unsaved.
   await page.waitForTimeout(1100);
   const pending=await frame.evaluate(()=>({audit:startupAudit,stats:pdlProgressStats(),text:document.getElementById('page-content').textContent,opf:pdlOpenPageFlipDebug()}));
   assert.equal(pending.audit.legacy.length,0,'Waiting for patterns must not paginate the whole book');
   assert.equal(pending.text.trim(),'','Unverified startup chunks must not be displayed');
   assert.ok(pending.stats.waitingForHyphenation&&!pending.opf.builds,'OPF must wait for verified pages');
   await frame.evaluate(()=>{nextPage();prevPage();});assert.equal(await frame.evaluate(()=>currentChapter),0);
   assert.equal(await page.evaluate(id=>localStorage.getItem('pdl:v140:position:'+id),book),null,'Startup placeholders must not overwrite saved progress');
   await frame.evaluate(()=>gotoChapter(2));
   release();
  }
  if(scenario==='timeout'){
   await frame.evaluate(()=>gotoChapter(3));
   await frame.waitForFunction(()=>startupAudit.legacy.length>0&&!pdlProgressStats().waitingForHyphenation,null,{timeout:10000});
   release();
  }
  if(['healthy','delayed','resume-pending'].includes(scenario))await frame.waitForFunction(()=>{const s=pdlProgressStats();return s.complete||s.fallback||s.errors.length},null,{timeout:180000});
  else await completed(frame);
  await integrity(frame);
  await frame.waitForFunction(()=>{const d=pdlOpenPageFlipDebug();return d.enabled&&!d.failed&&d.state==='read'&&!d.buildQueued},null,{timeout:30000});
  const report=await frame.evaluate(()=>({audit:startupAudit,stats:pdlProgressStats(),chapter:currentChapter,opf:pdlOpenPageFlipDebug()}));
  assert.deepEqual(errors,[],scenario+': no uncaught JavaScript errors');
  if(!benchmark){
   if(['healthy','delayed','resume-pending'].includes(scenario)){
    assert.equal(report.audit.legacy.length,0,'Healthy startup must avoid redundant full-book legacy pagination');
    assert.ok(report.stats.complete&&!report.stats.fallback&&report.stats.hyphenatorReady&&!report.stats.errors.length);
    assert.ok(report.audit.firstVisibleHyphenated,'First visible text must already use the verified hyphenated layout');
    if(scenario==='delayed')assert.equal(report.chapter,2,'Chapter selection made while loading must be preserved');
    if(scenario==='resume-pending')assert.equal(await frame.evaluate(()=>currentChapter===1&&currentPage===3),true,'Page-only saved progress must survive delayed startup and early close');
   }else{
    assert.ok(report.audit.legacy.length>0,'Failure/disabled-grid fallback must remain usable');
    if(scenario!=='grid-off')assert.equal(report.stats.hyphenatorReady,false);
    if(scenario==='timeout')assert.equal(report.chapter,3,'Queued chapter selection must survive fallback too');
    assert.equal(await frame.locator('#pdl-progress-status').isVisible(),false,'Fallback must clear the startup banner');
    const before=await frame.evaluate(()=>currentPage);
    await frame.evaluate(()=>nextPage());
    await frame.waitForFunction(pg=>currentPage>pg&&pdlOpenPageFlipDebug().state==='read',before,{timeout:10000});

   }
  }
  console.log(JSON.stringify({scenario,legacyCalls:report.audit.legacy.length,legacyMs:Math.round(report.audit.legacy.reduce((a,b)=>a+b,0)),firstVisibleMs:report.audit.firstVisibleMs===null?null:Math.round(report.audit.firstVisibleMs),firstVerifiedMs:report.audit.firstVerifiedMs===null?null:Math.round(report.audit.firstVerifiedMs),mode:report.stats.mode,complete:report.stats.complete,opfBuilds:report.opf.builds}));
  await context.close();
 }
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
