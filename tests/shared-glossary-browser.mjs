import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {chromium,firefox,webkit} from 'playwright';
const root=path.resolve(import.meta.dirname,'..');
const engine=process.env.PDL_BROWSER||'chromium',type={chromium,firefox,webkit}[engine];
assert.ok(type,'Unknown browser engine');
const original=await readFile(path.join(root,'library-data.json')),data=JSON.parse(original);
const index=await readFile(path.join(root,'index.html'),'utf8');
const functions=index.slice(index.indexOf('function pdlSeparateTerm(value){'),index.indexOf('function pdlParagraphs(text){'));
const {pdlSeparateTerm,pdlGlossaryFromEntries}=vm.runInNewContext(functions+';({pdlSeparateTerm,pdlGlossaryFromEntries})',{}, {timeout:3000});
const expected=Object.keys(pdlGlossaryFromEntries(data.entries)).length;
// Complete automatic indexing now links nearly all rows. Strip provenance only
// in the served fixture to keep proving that global lookup never needs a link.
const unlinkedFixture={...data,entries:data.entries.map(e=>({...e,sources:[],references:[]}))};
const word='αγιάζ’',entry=data.entries.find(e=>pdlSeparateTerm(e.term).term===word);
assert.ok(entry,'Real shared headword must exist');
// Corpus indexing removes TXT filenames; entries with no occurrence still belong to the global dictionary.
const external=unlinkedFixture.entries.filter(e=>!e.references?.length).map(e=>({id:e.id,term:pdlSeparateTerm(e.term).term,definition:e.definition.trim()}));
assert.ok(external.length>0,'Exercise all real entries without chapter occurrences or book references');
const phrase=data.entries.find(e=>/\s/.test(pdlSeparateTerm(e.term).term));
assert.ok(phrase,'A real shared expression must exist');
const phraseTerm=pdlSeparateTerm(phrase.term).term;
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp'};
const server=createServer(async(req,res)=>{try{
 const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
 if(!file.startsWith(root+path.sep)||!(await stat(file)).isFile()){res.writeHead(404).end();return;}
 res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});res.end(path.basename(file)==='library-data.json'?JSON.stringify(unlinkedFixture):await readFile(file));
}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
async function ready(frame){
 await frame.waitForFunction(()=>{const s=pdlProgressStats();return s.complete||s.fallback||s.errors.length;},null,{timeout:180000});
 const s=await frame.evaluate(()=>pdlProgressStats());assert.ok(s.complete&&!s.fallback&&!s.errors.length,JSON.stringify(s));
 await frame.waitForFunction(()=>{const d=pdlOpenPageFlipDebug();return d.enabled&&!d.failed&&d.state==='read'&&!d.buildQueued;},null,{timeout:30000});
}
async function point(frame,word){
 return frame.evaluate(word=>{
  const norm=s=>s.toLocaleLowerCase('el').replaceAll("'",'’');
  for(const p of document.querySelectorAll('#pdl-opf-host .pdl-opf-page[data-page="'+currentPage+'"] p')){
   if(getComputedStyle(p).visibility==='hidden')continue;
   const walker=document.createTreeWalker(p,NodeFilter.SHOW_TEXT),map=[];let node,text='';
   while(node=walker.nextNode())for(let i=0;i<node.nodeValue.length;i++){
    if(node.nodeValue[i]==='\u00ad')continue;
    text+=node.nodeValue[i];map.push({node,offset:i});
   }
   const at=norm(text).indexOf(norm(word));if(at<0)continue;
   const focus=map[at+Math.floor(word.length/2)],range=document.createRange();
   range.setStart(focus.node,focus.offset);range.setEnd(focus.node,focus.offset+1);
   const r=[...range.getClientRects()].find(r=>r.width>0&&r.height>0);
   if(r)return {x:r.x+r.width/2,y:r.y+r.height/2};
  }
  return null;
 },word);
}
try{
 browser=await type.launch({headless:true});
 const cases=[{id:'48715ee4-83f2-40b9-85cd-468e9b67a948',mobile:false},{id:'99a52ef1-f5a7-4894-826c-577ea0d2148e',mobile:false}];
 if(engine==='chromium')cases.push({id:cases[0].id,mobile:true},{id:cases[1].id,mobile:true});
 for(const scenario of cases){
  const context=await browser.newContext(scenario.mobile?{viewport:{width:390,height:844},hasTouch:true,isMobile:true}:{viewport:{width:1100,height:900}});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);await page.waitForFunction(()=>libraryState.books.length>0);
  await page.evaluate(id=>{const book=libraryState.books.find(b=>String(b.id).replace(/^studio:/,'')===id);if(!book)throw Error('Book not found');openBook(book.id);},scenario.id);
  await page.waitForFunction(()=>typeof document.getElementById('reader-frame')?.contentWindow?.pdlProgressStats==='function');
  const frame=page.frames().find(f=>f.url()==='about:srcdoc');await ready(frame);
  assert.equal(await frame.evaluate(()=>Object.keys(glossary).length),expected);
  const rowsToVerify=data.entries.map(e=>({id:e.id,term:pdlSeparateTerm(e.term).term,definition:e.definition.trim()}));
  const missing=await frame.evaluate(rows=>rows.filter(row=>!pdlLookupDiagnostic(row.term).candidates.some(c=>c.definition.includes(row.definition))).map(row=>row.id),rowsToVerify);
  assert.deepEqual(missing,[],'Every canonical entry, including all imported and unlinked records, must be available in every book');
  const diagnostics=await frame.evaluate(({word,phraseTerm})=>{
   const start=performance.now(),lookup=pdlLookupDiagnostic(word.normalize('NFD').replaceAll('’',"'"));
   const elapsed=performance.now()-start;
   const phrase=pdlPhraseDiagnostic('Πριν '+phraseTerm+' μετά',7);
   return {lookup,elapsed,phrase:phrase?.candidates.map(e=>e.def)||[]};
  },{word,phraseTerm});
  assert.ok(diagnostics.lookup.candidates.some(c=>c.definition.includes(entry.definition)));
  assert.ok(diagnostics.phrase.some(def=>def.includes(phrase.definition.trim())),'Shared multiword expression must be recognized');
  const target=await frame.evaluate(word=>{
   for(let ch=0;ch<chapters.length;ch++)for(let pg=0;pg<chapters[ch].pages.length;pg++){
    if(chapters[ch].pages[pg].some(b=>pdlPlain(b.text||'').toLocaleLowerCase('el').includes(word)))return {ch,pg};
   }
  },word);
  assert.ok(target,'Headword must occur in actual published book text');
  await frame.evaluate(({ch,pg})=>pdlProgressGo(ch,pg),target);await ready(frame);
  const before=await frame.evaluate(()=>({ch:currentChapter,pg:currentPage,anchor:pdlPageAnchor(currentChapter,currentPage)}));
  const p=await point(frame,word);assert.ok(p,'Visible headword must have real text coordinates');
  const bounds=await page.locator('#reader-frame').boundingBox(),x=bounds.x+p.x,y=bounds.y+p.y;
  if(scenario.mobile){
   const client=await context.newCDPSession(page);
   await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
   await page.waitForTimeout(450);
   await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await client.detach();
  }else await page.mouse.dblclick(x,y,{delay:60});
  const popup=frame.locator('#pdl-inline-gloss');await popup.waitFor({state:'visible'});
  if(await popup.getAttribute('role')==='dialog')await popup.getByRole('button',{name:word,exact:true}).click();
  assert.ok((await popup.innerText()).includes(entry.definition),'Real gesture must open the shared definition');
  assert.deepEqual(await frame.evaluate(()=>({ch:currentChapter,pg:currentPage,anchor:pdlPageAnchor(currentChapter,currentPage)})),before,'Glossary lookup must not turn a page or alter its anchor');
  if(scenario.id==='99a52ef1-f5a7-4894-826c-577ea0d2148e'){
   await page.keyboard.press('Escape');
   const synizesisWord='κουρφίζει',synizesisEntry=data.entries.find(e=>e.term===synizesisWord);
   const location=await frame.evaluate(()=>{
    for(let ch=0;ch<chapters.length;ch++)for(let pg=0;pg<chapters[ch].pages.length;pg++)if(chapters[ch].pages[pg].some(b=>pdlPlain(b.text||'').includes('κουρφίζει͜ ατο')))return {ch,pg};
   });assert.ok(location,'The exact author-supplied synizesis example must remain in the book');
   await frame.evaluate(({ch,pg})=>pdlProgressGo(ch,pg),location);await ready(frame);
   const hit=await point(frame,synizesisWord);assert.ok(hit);
   const diagnostic=await frame.evaluate(({x,y})=>{const raw=pdlWordAtPoint(x,y);return {raw,lookup:pdlLookupDiagnostic(raw)};},hit);
   assert.ok(diagnostic.lookup.candidates.some(c=>c.term===synizesisWord),'A real pointer must recognize the headword with its trailing tie');
   const anchor=await frame.evaluate(()=>pdlPageAnchor(currentChapter,currentPage));
   const box=await page.locator('#reader-frame').boundingBox(),sx=box.x+hit.x,sy=box.y+hit.y;
   if(scenario.mobile){const client=await context.newCDPSession(page);await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:sx,y:sy,id:1}]});await page.waitForTimeout(450);await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await client.detach();}
   else await page.mouse.dblclick(sx,sy,{delay:60});
   const definition=frame.locator('#pdl-inline-gloss');await definition.waitFor({state:'visible'});
   if(await definition.getAttribute('role')==='dialog')await definition.getByRole('button',{name:synizesisWord,exact:true}).click();
   assert.ok((await definition.innerText()).includes(synizesisEntry.definition));
   assert.deepEqual(await frame.evaluate(()=>pdlPageAnchor(currentChapter,currentPage)),anchor);
   console.log(JSON.stringify({result:'PASS',engine,gesture:scenario.mobile?'long press':'double click',synizesis:'κουρφίζει͜ ατο',rawPointerWord:diagnostic.raw,headword:synizesisWord,sourceAnchorPreserved:true}));
  }
  assert.deepEqual(errors,[]);
  if(process.env.PDL_CAPTURE_DIR)await page.screenshot({path:path.join(process.env.PDL_CAPTURE_DIR,`shared-glossary-${engine}-${scenario.mobile?'mobile':scenario.id.slice(0,8)}.png`)});
  console.log(JSON.stringify({result:'PASS',engine,gesture:scenario.mobile?'long press':'double click',bookId:scenario.id,globalHeadwords:expected,externalEntriesAvailable:external.length,warmLookupMs:Math.round(diagnostics.elapsed*100)/100}));
  await context.close();
 }
 assert.ok((await readFile(path.join(root,'library-data.json'))).equals(original),'Published data must remain byte-identical');
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
