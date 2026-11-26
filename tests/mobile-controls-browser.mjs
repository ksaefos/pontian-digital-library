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
 let data=await readFile(file);
 if(/\/reader\/template\.[a-f0-9]+\.html$/.test(file)){
  const source=data.toString(),shell={template:source};
  // Pause after the controls are parsed, before the main Reader script can
  // initialize. This exposes a genuine opportunity to paint the initial UI.
  const marker='<script>\nconst glossary = PDL_IMPORTED_GLOSSARY;';assert.ok(shell.template.includes(marker));
  shell.template=shell.template.replace(marker,'<script src="./__pdl_initial_ui_gate.js"></script>\n'+marker);
  data=Buffer.from(shell.template);
 }
 res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});res.end(data);
}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
const allDocks=new Set();
const quiet=f=>f.waitForFunction(()=>{const d=pdlOpenPageFlipDebug();return d.state==='read'&&!d.failed&&!d.buildQueued},null,{timeout:30000});
const location=f=>f.evaluate(()=>({chapter:currentChapter,page:currentPage,anchor:pdlPageAnchor(currentChapter,currentPage),generation:pdlProgressStats().generation}));
async function touch(client,type,x,y){await client.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'||type==='touchCancel'?[]:[{x,y,id:1}]});}
try{
 browser=await chromium.launch({headless:true,...(process.env.PDL_CHROMIUM_EXECUTABLE?{executablePath:process.env.PDL_CHROMIUM_EXECUTABLE}:{})});
 for(const width of [390,320]){
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width,height:844},hasTouch:true,isMobile:true});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
  let releaseStartup;const startupGate=new Promise(resolve=>releaseStartup=resolve);
  await page.route('**/__pdl_initial_ui_gate.js',async route=>{await startupGate;await route.fulfill({contentType:'text/javascript',body:''}).catch(()=>{});});
  await page.addInitScript(()=>{
   if(window===window.top)return;
   const probe=window.__pdlBootControls={samples:0,flashes:[],stop:false};
   function sample(){
    if(document.getElementById('pdl-mobile-bottom')&&innerWidth<=768){
     probe.samples++;
     for(const el of document.querySelectorAll('#pdl-mobile-top,#pdl-mobile-bottom,.pdl-rail,.topbar,.bottombar')){
      const rect=el.getBoundingClientRect();
      if(el.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})&&rect.width>0&&rect.height>0&&rect.bottom>0&&rect.top<innerHeight){
       const label=el.id||el.className;if(!probe.flashes.includes(label))probe.flashes.push(label);
      }
     }
    }
    if(!probe.stop)requestAnimationFrame(sample);
   }
   requestAnimationFrame(sample);
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await page.waitForFunction(()=>libraryState.books.length===4);
  await page.evaluate(()=>openBook(libraryState.books.find(b=>b.title==='Η Σωνίτσα').id));
  await page.waitForFunction(()=>!!document.getElementById('reader-frame')?.contentDocument?.getElementById('pdl-mobile-bottom'));
  const openingFrame=page.frames().find(f=>f.url()==='about:srcdoc');
  await openingFrame.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const initialUI=await openingFrame.evaluate(()=>window.__pdlBootControls);
  releaseStartup();
  assert.ok(initialUI.samples>0,'Initial parsed controls must be sampled before Reader initialization');
  assert.deepEqual(initialUI.flashes,[],'Mobile controls must stay hidden before the main Reader script runs');
  await page.waitForFunction(()=>typeof document.getElementById('reader-frame')?.contentWindow?.pdlProgressStats==='function');
  const f=page.frames().find(f=>f.url()==='about:srcdoc');
  await f.waitForFunction(()=>pdlProgressStats().complete,null,{timeout:180000});await page.waitForTimeout(1000);await quiet(f);
  const openingUI=await f.evaluate(()=>{window.__pdlBootControls.stop=true;return window.__pdlBootControls;});
  assert.deepEqual(openingUI.flashes,[],'No toolbar may flash between initial parsing and verified rendering');
  const before=await location(f);
  const bounds=await f.locator('#pdl-opf-host').boundingBox();
  await page.touchscreen.tap(bounds.x+bounds.width/2,bounds.y+bounds.height*.35);
  await page.waitForTimeout(80);
  await page.touchscreen.tap(bounds.x+bounds.width/2,bounds.y+bounds.height*.35);
  await f.locator('#pdl-mobile-top').waitFor({state:'visible'});await page.waitForTimeout(300);
  assert.deepEqual(await location(f),before,'Double tap must show controls without re-pagination or a position shift');
  const top=f.locator('#pdl-mobile-top');
  assert.equal(await top.locator('button').count(),3);
  assert.deepEqual(await top.locator('button').evaluateAll(ns=>ns.map(n=>n.getAttribute('aria-label'))),['Γραμματοσειρά','Επιστροφή στη βιβλιοθήκη','Φωτισμός']);
  assert.equal(await top.locator('.pdl-mobile-book-title').count(),0);
  assert.deepEqual(await f.locator('#pdl-mobile-bottom .pdl-trial-actions > button > span').allTextContents(),['Κεφάλαια','Αναζήτηση','Σελιδοδείκτες']);
  await f.locator('#pdl-mobile-font-action').click();
  assert.equal(await f.locator('#pdl-appearance-title').textContent(),'Γραμματοσειρά');
  assert.equal(await f.locator('#pdl-appearance-text').isVisible(),true);assert.equal(await f.locator('#pdl-appearance-light').isVisible(),false);
  await f.locator('.pdl-appearance-close').click();
  await f.locator('#pdl-mobile-light-action').click();
  assert.equal(await f.locator('#pdl-appearance-title').textContent(),'Φωτισμός');
  assert.equal(await f.locator('#pdl-appearance-text').isVisible(),false);assert.equal(await f.locator('#pdl-appearance-light').isVisible(),true);
  await f.locator('[data-mobile-theme="sepia"]').click();assert.equal(await f.evaluate(()=>pdlTheme),'sepia');
  await f.locator('.pdl-appearance-close').click();await f.waitForFunction(()=>pdlProgressStats().complete,null,{timeout:180000});await quiet(f);
  await f.locator('#pdl-mobile-bottom button').filter({hasText:'Κεφάλαια'}).click();
  assert.equal(await f.locator('#pdl-contents-book-title').textContent(),'Η Σωνίτσα');
  assert.equal(await f.locator('#pdl-chapters-heading').textContent(),'Περιεχόμενα');
  await f.locator('#pdl-chapters-list button').nth(1).click();
  await f.waitForFunction(()=>currentChapter===1&&pdlOpenPageFlipDebug().activeChapter===1);await quiet(f);
  const bookmark=f.locator('#pdl-mobile-bookmark-toggle');
  await bookmark.tap();assert.equal(await bookmark.getAttribute('aria-pressed'),'true');assert.equal(await f.evaluate(()=>loadBookmarks().length),1);
  const client=await context.newCDPSession(page);const b=await bookmark.boundingBox();
  await touch(client,'touchStart',b.x+b.width/2,b.y+b.height/2);await page.waitForTimeout(650);
  await f.locator('#pdl-mobile-bookmarks').waitFor({state:'visible'});
  await touch(client,'touchEnd');await page.waitForTimeout(100);
  assert.equal(await f.evaluate(()=>loadBookmarks().length),1,'Long press must open the list without toggling the bookmark');
  assert.equal(await bookmark.getAttribute('aria-expanded'),'true');
  await f.locator('#pdl-mobile-bookmarks .pdl-mobile-bookmarks-heading button').click();
  await touch(client,'touchStart',b.x+b.width/2,b.y+b.height/2);
  await touch(client,'touchMove',b.x+b.width/2-25,b.y+b.height/2);await touch(client,'touchCancel');await page.waitForTimeout(650);
  assert.equal(await f.locator('#pdl-mobile-bookmarks').isVisible(),false,'Cancelled gesture must not open the bookmark list');
  assert.equal(await f.evaluate(()=>loadBookmarks().length),1);
  await bookmark.tap();assert.equal(await f.evaluate(()=>loadBookmarks().length),0,'A subsequent short tap must still toggle normally');
  await bookmark.focus();await bookmark.press('Shift+F10');await f.locator('#pdl-mobile-bookmarks').waitFor({state:'visible'});
  await f.locator('#pdl-mobile-bookmarks .pdl-mobile-bookmarks-heading button').click();
  await bookmark.press('Enter');assert.equal(await f.evaluate(()=>loadBookmarks().length),1,'Keyboard activation must work after closing the bookmark list');
  await bookmark.press('Enter');assert.equal(await f.evaluate(()=>loadBookmarks().length),0);
  await client.detach();
  await f.locator('#pdl-mobile-search-action').tap();
  const input=f.locator('#text-search-input');
  assert.equal(await input.evaluate(n=>document.activeElement===n),true,'One tap must open and focus the compact mobile search');
  assert.equal(await f.locator('#sidebar').isVisible(),false,'Text search must not open a desktop-style sidebar');
  await input.fill('Σωνίτσα');
  await f.waitForFunction(()=>tsResults.length>5);
  await input.press('Enter');await quiet(f);
  assert.equal(await f.locator('#text-search-bar').getAttribute('data-search-mode'),'browse');
  assert.equal(await input.isVisible(),false);
  assert.equal(await f.locator('#text-search-input').evaluate(n=>document.activeElement===n),false,'Browsing must release the keyboard');
  const generation=await f.evaluate(()=>pdlProgressStats().generation);
  const docks=new Set();
  // Exercise actual matches at different heights, including pages outside
  // the initially mounted OPF window. The active visible mark must survive.
  const indices=await f.evaluate(()=>{
   const pages=new Map();for(let i=0;i<tsResults.length;i++){
    const r=tsResults[i],key=r.ch+':'+r.pg;
    if(!pages.has(key))pages.set(key,{first:i,last:i});else pages.get(key).last=i;
   }
   return [...new Set([...pages.values()].slice(0,8).flatMap(p=>[p.first,p.last]).concat(tsResults.length-1))];
  });
  for(const index of indices){
   await f.evaluate(i=>goToTsResult(i),index);await quiet(f);await page.waitForTimeout(80);
   const result=await f.evaluate(()=>{
    const bar=document.getElementById('text-search-bar'),b=bar.getBoundingClientRect();
    const leaf=document.querySelector('#pdl-opf-host .pdl-opf-page[data-page="'+currentPage+'"]');
    const rects=[...(leaf?.querySelectorAll('mark.text-hit.current')||[])].flatMap(n=>[...n.getClientRects()]);
    const header=document.getElementById('pdl-mobile-top').getBoundingClientRect(),footer=document.getElementById('pdl-mobile-bottom').getBoundingClientRect();
    return {width:b.width,height:b.height,left:b.left,right:b.right,top:b.top,bottom:b.bottom,dock:bar.dataset.dock,
     marks:rects.length,chromeOverlap:rects.some(r=>r.top<header.bottom||r.bottom>footer.top),overlap:rects.some(r=>r.top<b.bottom&&r.bottom>b.top&&r.left<b.right&&r.right>b.left)};
   });
   assert.ok(result.marks>0,'Visible OPF page must contain the active search highlight');
   assert.ok(!result.overlap,'Search dock must not cover the current match: '+JSON.stringify(result));
   assert.ok(!result.chromeOverlap,'Toolbars must not cover the current match: '+JSON.stringify(result));
   assert.ok(result.height<=60&&result.left>=0&&result.right<=width,'Search must stay compact and fit the mobile viewport');
   if(!docks.has(result.dock)&&process.env.PDL_CAPTURE_DIR)await page.screenshot({path:path.join(process.env.PDL_CAPTURE_DIR,`reader-search-${width}-${result.dock}.png`)});
   docks.add(result.dock);allDocks.add(result.dock);
  }
  assert.equal(await f.evaluate(()=>pdlProgressStats().generation),generation,'Search dock movement must not re-paginate the book');
  // The reserved direct-navigation strip can leave every sampled frequent-word
  // match above the bottom dock. Exercise the top alternative with an actual
  // match and a modelled on-screen keyboard, preserving the same page mapping.
  let keyboardMatch=null;
  for(const index of indices){
   await f.evaluate(i=>goToTsResult(i),index);await quiet(f);await page.waitForTimeout(80);
   const candidate=await f.evaluate(()=>{
    const mark=document.querySelector('#pdl-opf-host .pdl-opf-page[data-page="'+currentPage+'"] mark.text-hit.current');
    const r=mark?.getBoundingClientRect(),bar=document.getElementById('text-search-bar').getBoundingClientRect();
    const header=document.getElementById('pdl-mobile-top').getBoundingClientRect();
    return r&&r.top>header.bottom+bar.height+30&&r.bottom<innerHeight-80?{height:r.bottom+bar.height/2+8}:null;
   });
   if(candidate){keyboardMatch=candidate;break;}
  }
  assert.ok(keyboardMatch,'Fixture must contain a real match clear of the upper dock');
  await page.evaluate(height=>{
   const proto=Object.getPrototypeOf(visualViewport);
   window.__searchDockHeightDescriptor=Object.getOwnPropertyDescriptor(proto,'height');
   Object.defineProperty(proto,'height',{configurable:true,get:()=>height});
   visualViewport.dispatchEvent(new Event('resize'));
  },keyboardMatch.height);
  await page.waitForTimeout(80);
  const keyboardSearch=await f.evaluate(()=>{
   const b=document.getElementById('text-search-bar'),r=b.getBoundingClientRect();
   const marks=[...document.querySelectorAll('#pdl-opf-host .pdl-opf-page[data-page="'+currentPage+'"] mark.text-hit.current')];
   return {dock:b.dataset.dock,overlap:marks.some(n=>[...n.getClientRects()].some(m=>m.top<r.bottom&&m.bottom>r.top&&m.left<r.right&&m.right>r.left))};
  });
  assert.equal(keyboardSearch.dock,'top','The keyboard must move the dock away from the real result');
  assert.equal(keyboardSearch.overlap,false,'The upper dock must leave the actual match uncovered');
  docks.add(keyboardSearch.dock);allDocks.add(keyboardSearch.dock);
  await page.evaluate(()=>{
   Object.defineProperty(Object.getPrototypeOf(visualViewport),'height',window.__searchDockHeightDescriptor);
   visualViewport.dispatchEvent(new Event('resize'));
  });
  assert.equal(await f.evaluate(()=>pdlProgressStats().generation),generation,'Keyboard dock placement must not re-paginate the book');
  // Also search the last word on a full page, rather than only a frequent
  // name that may happen to occur above the footer in every sampled page.
  await f.evaluate(()=>pdlProgressGo(0,4));await quiet(f);
  const tailWord=await f.evaluate(()=>[...document.querySelectorAll('#page-content p')].at(-1).textContent.replaceAll('\u00AD','').match(/[\p{L}\p{M}]+/gu).at(-1));
  await f.locator('#pdl-search-query').click();await input.fill(tailWord);
  const tailIndex=await f.evaluate(()=>tsResults.map((r,i)=>({r,i})).filter(({r})=>r.ch===0&&r.pg===4).at(-1)?.i);
  assert.ok(Number.isInteger(tailIndex));await f.evaluate(i=>goToTsResult(i),tailIndex);await quiet(f);await page.waitForTimeout(80);
  assert.equal(await f.evaluate(()=>{
   const header=document.getElementById('pdl-mobile-top').getBoundingClientRect(),footer=document.getElementById('pdl-mobile-bottom').getBoundingClientRect();
   const mark=document.querySelector('#pdl-opf-host .pdl-opf-page[data-page="'+currentPage+'"] mark.text-hit.current');
   return [...mark.getClientRects()].some(r=>r.top<header.bottom||r.bottom>footer.top);
  }),false,'The bottom line search match must remain clear of both toolbars');
  await f.locator('#pdl-search-query').click();await input.fill('ανύπαρκτηλέξηδοκιμής');
  assert.equal(await f.locator('#ts-count').textContent(),'Καμία');
  // BFCache-style teardown/resume must reconnect parent viewport listeners.
  await f.evaluate(()=>{
   window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));
   window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));
  });
  // Model the top-level visual viewport shrinking for an on-screen keyboard.
  // The iframe viewport stays unchanged; the dock must use parent metrics.
  await page.evaluate(()=>{
   const proto=Object.getPrototypeOf(visualViewport);
   window.__viewportHeightDescriptor=Object.getOwnPropertyDescriptor(proto,'height');
   Object.defineProperty(proto,'height',{configurable:true,get:()=>300});
   visualViewport.dispatchEvent(new Event('resize'));
  });
  await page.waitForTimeout(80);
  const keyboardDock=await f.locator('#text-search-bar').boundingBox();
  assert.ok(keyboardDock.y>=0&&keyboardDock.y+keyboardDock.height<=300,'Search field must stay above the modelled keyboard');
  await page.evaluate(()=>{
   Object.defineProperty(Object.getPrototypeOf(visualViewport),'height',window.__viewportHeightDescriptor);
   visualViewport.dispatchEvent(new Event('resize'));
  });
  await f.locator('#ts-clear').click();assert.equal(await input.inputValue(),'');
  await f.locator('.text-search-close').click();
  assert.equal(await f.locator('#text-search-bar').isVisible(),false);
  const overflow=await f.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  assert.equal(overflow,false,'Mobile controls must not overflow horizontally');
  if(process.env.PDL_CAPTURE_DIR)await page.screenshot({path:path.join(process.env.PDL_CAPTURE_DIR,`reader-mobile-${width}.png`)});
  await f.locator('#pdl-mobile-top .pdl-home-mobile').click();await page.waitForFunction(()=>activeBook===null);
  assert.deepEqual(errors,[]);
  console.log(`PASS mobile ${width}px: no initial toolbar flash, settings, contents, bookmark gestures, compact search, visible results and keyboard viewport; docks: ${[...docks].join(', ')}`);
  await context.close();
 }
 assert.deepEqual([...allDocks].sort(),['bottom','top'],'Real matches must exercise both dock positions');
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
