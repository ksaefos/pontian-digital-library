import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {chromium,firefox,webkit} from 'playwright';
const root=path.resolve(import.meta.dirname,'..');
const engine=process.env.PDL_BROWSER||'chromium',type={chromium,firefox,webkit}[engine];
assert.ok(type,'PDL_BROWSER must be chromium, firefox or webkit');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png'};
const server=createServer(async(req,res)=>{try{
 const file=path.resolve(root,'dist','.'+new URL(req.url,'http://localhost').pathname);
 if(!file.startsWith(path.join(root,'dist')+path.sep)||!(await stat(file)).isFile()){res.writeHead(404).end();return;}
 res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});res.end(await readFile(file));
}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser,page,frame;
const errors=[];
const compare=(a,b)=>a.index-b.index||a.offset-b.offset;
async function stable(){
 await frame.waitForFunction(()=>{const s=pdlProgressStats();return s.complete||s.fallback||s.errors.length},null,{timeout:180000});
 const s=await frame.evaluate(()=>pdlProgressStats());
 assert.ok(s.complete&&!s.fallback&&!s.errors.length,engine+': progressive pagination must finish: '+JSON.stringify(s));
 await frame.waitForFunction(()=>{const d=pdlOpenPageFlipDebug();return d.enabled&&!d.failed&&d.state==='read'&&!d.buildQueued},null,{timeout:30000});
}
async function sourceIntegrity(){
 const issues=await frame.evaluate(()=>{
  const text=b=>{const n=document.createElement('div');n.innerHTML=b.text||'';return n.textContent||'';};
  const issues=[];const segmenter=new Intl.Segmenter('el',{granularity:'grapheme'});
  chapters.forEach((ch,ci)=>{
   const source=PDL_SOURCE[ci].blocks,output=ch.pages.flat();
   source.forEach((b,bi)=>{
    const fragments=output.filter(f=>f._pdlAnchor?.index===bi),raw=text(b),cuts=new Set([...segmenter.segment(raw)].map(g=>g.index));
    if(fragments.map(text).join('')!==raw)issues.push({ci,bi,text:true});
    if(fragments.some(f=>f._pdlAnchor.offset&&!cuts.has(f._pdlAnchor.offset)))issues.push({ci,bi,grapheme:true});
   });
   const structures=a=>a.filter(b=>!['p','dialogue'].includes(b.type)).map(b=>b.type);
   if(JSON.stringify(structures(source))!==JSON.stringify(structures(output)))issues.push({ci,structures:true});
  });return issues;
 });assert.deepEqual(issues,[],engine+': source text, editorial SHY, structures and graphemes');
}
async function anchor(){return frame.evaluate(()=>pdlPageAnchor(currentChapter,currentPage));}
async function contains(saved){
 const p=await frame.evaluate(()=>({start:pdlPageAnchor(currentChapter,currentPage),next:currentPage+1<chapters[currentChapter].pages.length?pdlPageAnchor(currentChapter,currentPage+1):null}));
 assert.ok(compare(p.start,saved)<=0,engine+': reflow must not skip saved text');
 if(p.next)assert.ok(compare(p.next,saved)>0,engine+': saved text must remain inside the visible page');
}
async function search(query){
 await frame.evaluate(q=>{onTextSearch(q);if(!tsResults.length)throw Error('No search results');goToTsResult(0);},query);
 await stable();
 await frame.waitForFunction(()=>!!document.querySelector('#pdl-opf-host .pdl-opf-page[data-page="'+currentPage+'"] mark.text-hit.current'));
 const highlighted=await frame.evaluate(()=>[...document.querySelectorAll('#pdl-opf-host .pdl-opf-page[data-page="'+currentPage+'"] mark.text-hit.current')].map(n=>n.textContent).join(''));
 const fold=s=>s.replaceAll('\u00AD','').replaceAll("'",'’').toLocaleLowerCase('el').normalize('NFD').replace(/\p{M}/gu,'');
 assert.equal(fold(highlighted),fold(query),engine+': highlight must correspond exactly to the normalized phrase');
}
try{
 browser=await type.launch({headless:true,timeout:30000});
 page=await browser.newPage({serviceWorkers:'block',viewport:{width:390,height:844}});page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);await page.waitForFunction(()=>libraryState.books.length===4);
 await page.evaluate(()=>openBook(libraryState.books.find(b=>b.title==='Η Σωνίτσα').id));
 await page.waitForFunction(()=>typeof document.getElementById('reader-frame')?.contentWindow?.pdlProgressStats==='function');
 frame=page.frames().find(f=>f.url()==='about:srcdoc');await stable();await sourceIntegrity();
 await search('Σωνίτσα'.normalize('NFD'));
 const phrase=await frame.evaluate(()=>{
  for(const ch of PDL_SOURCE)for(const block of ch.blocks){const found=pdlPlain(block.text||'').match(/[\p{L}\p{M}]+[’']\s+[\p{L}\p{M}]+/u);if(found)return found[0].replaceAll('’',"'").normalize('NFD');}
 });assert.ok(phrase,'A real apostrophe phrase must exist in the fixture');await search(phrase);
 console.log('PASS '+engine+': complete source, graphemes, NFD Greek and apostrophe-phrase highlights');
 // Firefox can still expose the old srcdoc globals until the close navigation
 // commits. Wait for about:blank before recognizing the next Reader.
 await page.evaluate(()=>closeBook());
 await page.waitForFunction(()=>document.getElementById('reader-frame').contentDocument?.URL==='about:blank');
 await page.evaluate(()=>openBook(libraryState.books.find(b=>b.hyphenation==='el-polyton').id));
 await page.waitForFunction(()=>typeof document.getElementById('reader-frame')?.contentWindow?.pdlProgressStats==='function');
 frame=page.frames().find(f=>f.url()==='about:srcdoc');await stable();await page.waitForTimeout(1000);await stable();
 assert.ok(await frame.evaluate(()=>PDL_HYPH.ready()),engine+': real Greek WASM must load');
 await frame.evaluate(()=>pdlProgressGo(17,3));await stable();const before=await anchor();
 const generation=await frame.evaluate(()=>pdlProgressStats().generation);
 await frame.evaluate(()=>{pdlSetFont('Calibri');applyFontSize(130);});
 await frame.waitForFunction(g=>pdlProgressStats().generation>g,generation,{timeout:30000});await stable();await contains(before);await sourceIntegrity();
 const font=await frame.evaluate(()=>({font:pdlFont,size:currentFontSize,css:getComputedStyle(document.getElementById('page-content')).fontFamily,carlito:[...document.fonts].some(f=>f.family.includes('PDL Carlito')&&f.status==='loaded')}));
 assert.equal(font.font,'Calibri');assert.equal(font.size,130);assert.ok(font.css.includes('PDL Carlito')&&font.carlito,engine+': bundled Carlito fallback must actually load');
 const rotation=await anchor(),oldGeneration=await frame.evaluate(()=>pdlProgressStats().generation);
 await page.setViewportSize({width:844,height:390});
 await frame.waitForFunction(g=>pdlProgressStats().generation>g,oldGeneration,{timeout:30000});await stable();await contains(rotation);await sourceIntegrity();
 const turn=await frame.evaluate(()=>({page:currentPage,turns:pdlOpenPageFlipDebug().animatedTurns,interruptions:pdlOpenPageFlipDebug().interruptedTurns}));
 await frame.evaluate(()=>nextPage());
 await frame.waitForFunction(p=>currentPage===p+1,turn.page,{timeout:15000});await stable();
 const after=await frame.evaluate(()=>pdlOpenPageFlipDebug());assert.ok(after.animatedTurns>turn.turns);assert.equal(after.interruptedTurns,turn.interruptions);
 assert.deepEqual(errors,[],engine+': uncaught JavaScript errors');
 console.log(JSON.stringify({engine,version:browser.version(),polytonic:true,font,orientation:'844x390',sourceIntegrity:true,animatedTurn:true}));
}catch(e){
 if(frame)console.error('Compatibility diagnostics',await frame.evaluate(()=>({stats:pdlProgressStats(),location:pdlProgressLocation(),opf:pdlOpenPageFlipDebug()})).catch(()=>({unavailable:true})));
 throw e;
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
