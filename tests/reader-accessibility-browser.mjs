import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {chromium,firefox,webkit} from 'playwright';

const root=path.resolve(import.meta.dirname,'..'),engine=process.env.PDL_BROWSER||'chromium';
const type={chromium,firefox,webkit}[engine];assert.ok(type);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json',
 '.wasm':'application/wasm','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp'};
const server=createServer(async(req,res)=>{try{
 const file=path.resolve(root,'dist','.'+new URL(req.url,'http://localhost').pathname);
 if(!file.startsWith(path.join(root,'dist')+path.sep)||!(await stat(file)).isFile()){res.writeHead(404).end();return;}
 res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});res.end(await readFile(file));
}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser,frame;
const errors=[],results=[];
async function quiet(){
 await frame.waitForFunction(()=>{
  const d=pdlOpenPageFlipDebug(),s=pdlProgressStats();
  return s.complete&&!s.fallback&&!pdlProgress.desired&&d.state==='read'&&!d.failed&&!d.buildQueued&&!d.gestureHold;
 },null,{timeout:180000});
}
async function focused(locator){assert.equal(await locator.evaluate(n=>document.activeElement===n),true,'Keyboard focus: '+await locator.getAttribute('id'));}
async function containsAnchor(anchor){
 const position=await frame.evaluate(()=>({start:pdlPageAnchor(currentChapter,currentPage),next:currentPage+1<chapters[currentChapter].pages.length?pdlPageAnchor(currentChapter,currentPage+1):null}));
 const compare=(a,b)=>a.index-b.index||a.offset-b.offset;
 assert.ok(compare(position.start,anchor)<=0,'Mode change must not skip the source anchor');
 if(position.next)assert.ok(compare(position.next,anchor)>0,'Saved source anchor must remain in the visible page');
}
async function audit(label){
 const report=await frame.evaluate(async()=>{
  // Audit the fully shown UI, including the existing 250 ms glossary fade.
  // Keep the animation enabled; wait for finite animations instead of testing
  // a translucent intermediate frame whose contrast depends on runner speed.
  await Promise.all(document.getAnimations().filter(a=>a.playState==='running'&&a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));
  const r=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});
  return {passes:r.passes.length,incomplete:r.incomplete.map(i=>({id:i.id,targets:i.nodes.map(n=>n.target),reason:i.nodes[0]?.failureSummary})),
   violations:r.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,reason:n.failureSummary}))}))};
 });
 assert.deepEqual(report.violations,[],engine+' '+label+': automatic accessibility findings');
 results.push({label,...report});
}
try{
 browser=await type.launch({headless:true});
 for(const width of [320,390,1366]){
  const page=await browser.newPage({serviceWorkers:'block',viewport:{width,height:900}});
  page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await page.waitForFunction(()=>libraryState.books.length>0);
  const card=page.locator('.book-card').filter({hasText:'Η Σωνίτσα'});
  await card.press('Enter');
  await page.waitForFunction(()=>typeof document.getElementById('reader-frame')?.contentWindow?.pdlOpenPageFlipDebug==='function');
  frame=page.frames().find(f=>f.url()==='about:srcdoc');
  await quiet();await page.waitForTimeout(1100);await quiet();
  await frame.waitForFunction(()=>!!document.getElementById('pdl-page-announcement').textContent);
  await focused(frame.locator('#page-content'));
  assert.equal(await page.locator('#reader-frame').getAttribute('title'),'Ανάγνωση: Η Σωνίτσα');
  assert.equal(await frame.getByRole('textbox',{name:'Αναζήτηση στο γλωσσάρι',exact:true}).count(),0,'Closed offscreen sidebar is absent from the accessibility tree');
  assert.equal(await frame.locator('#pdl-opf-host').ariaSnapshot(),'','Animated page window is absent from the accessibility tree');
  const nativeSnapshot=await frame.locator('#page-content').ariaSnapshot();
  assert.ok(nativeSnapshot.length>100,'Current measured text must remain in the accessibility tree');
  await frame.addScriptTag({path:path.join(root,'node_modules/axe-core/axe.min.js')});
  await audit(width+' reading');

  if(width<769){
   assert.equal(await frame.locator('#pdl-access-nav').isVisible(),false,'Default mobile reading has no permanent toolbar');
   assert.equal(await frame.evaluate(()=>document.body.classList.contains('pdl-reader-assistance')),false);
   const fullHeight=await frame.locator('.main-area').evaluate(n=>n.clientHeight);
   assert.equal(fullHeight,900,'Default mobile reading uses the whole viewport height');
   assert.equal(await frame.locator('#pdl-first-use').isVisible(),true,'First-use hint is discoverable without a gesture');
   await frame.getByRole('button',{name:'Το είδα',exact:true}).press('Enter');
   const before=await frame.evaluate(()=>({generation:pdlProgress.generation,page:currentPage,chapter:currentChapter}));
   await page.keyboard.press('Tab');
   await focused(frame.locator('#pdl-mobile-font-action'));
   assert.deepEqual(await frame.evaluate(()=>({generation:pdlProgress.generation,page:currentPage,chapter:currentChapter})),before,
    'Revealing controls must keep the exact reading position and page mapping');
   await page.keyboard.press('Enter');
   const appearance=frame.locator('#pdl-appearance');
   await focused(appearance.locator('.pdl-appearance-close'));
   await audit(width+' appearance dialog');
   const last=appearance.locator('button:visible').last();await last.focus();await page.keyboard.press('Tab');
   await focused(appearance.locator('.pdl-appearance-close'));
   await page.keyboard.press('Shift+Tab');await focused(last);
   const pg=await frame.evaluate(()=>currentPage);
   await page.keyboard.press('ArrowRight');assert.equal(await frame.evaluate(()=>currentPage),pg,'Arrow on a dialog button must not turn the book');
   await page.keyboard.press('Escape');await focused(frame.locator('#pdl-mobile-font-action'));
   assert.equal(await appearance.isVisible(),false);

   await frame.locator('#pdl-mobile-light-action').press('Enter');
   for(const theme of ['sepia','dark','light']){
    await frame.locator('[data-mobile-theme="'+theme+'"]').press('Enter');await audit(width+' '+theme+' theme dialog');
   }
   await page.keyboard.press('Escape');await quiet();

   const searchTrigger=frame.locator('#pdl-mobile-search-action');await searchTrigger.press('Enter');
   const input=frame.locator('#text-search-input');await focused(input);await input.fill('Σωνίτσα');await input.press('Enter');
   await focused(frame.locator('#ts-next'));await quiet();
   await frame.locator('.text-search-close').press('Enter');await focused(searchTrigger);await quiet();

   const chapters=frame.getByRole('button',{name:'Περιεχόμενα και κεφάλαια',exact:true});
   await chapters.press('Enter');await audit(width+' chapter dialog');
   assert.equal(await frame.getByRole('main').count(),0,'Modal background must leave the accessibility tree');
   assert.equal(await frame.getByRole('button',{name:'Όλοι οι σελιδοδείκτες',exact:true}).count(),0,'Contents must not expose optional actions');
   await frame.getByRole('button',{name:'Οδηγίες ανάγνωσης',exact:true}).press('Enter');
   await audit(width+' default reading help');
   const preference=frame.locator('#pdl-reader-assistance-setting');
   assert.equal(await preference.isChecked(),false,'Visible assistance starts off');
   const beforeMode=await frame.evaluate(()=>({anchor:pdlPageAnchor(currentChapter,currentPage),height:document.querySelector('.main-area').clientHeight}));
   await preference.press('Space');await quiet();await containsAnchor(beforeMode.anchor);
   assert.equal(await frame.locator('.main-area').evaluate(n=>n.clientHeight),beforeMode.height-48,'Only explicit assistance reserves the 48 px strip');
   assert.equal(await page.evaluate(()=>pdlReaderAssistancePreference),true,'Reader choice must synchronize to the catalog');
   assert.equal(await page.evaluate(()=>localStorage.getItem('pdl:reader:assistance:v1')),'on');
   await audit(width+' enabled assistance help');
   await frame.getByRole('button',{name:'Όλοι οι σελιδοδείκτες',exact:true}).press('Enter');
   await frame.locator('#pdl-mobile-bookmarks').waitFor({state:'visible'});
   await audit(width+' empty bookmarks dialog');
   await page.keyboard.press('Escape');await focused(chapters);
   assert.equal(await frame.locator('#pdl-chapters-sheet').isVisible(),false,'Switching sheets must close the old sheet');

   await chapters.press('Enter');
   await frame.getByRole('button',{name:'Οδηγίες ανάγνωσης',exact:true}).press('Enter');
   await frame.getByRole('button',{name:'Αναζήτηση στο γλωσσάρι',exact:true}).press('Enter');
   const glossary=frame.getByRole('textbox',{name:'Αναζήτηση στο γλωσσάρι',exact:true});
   await focused(glossary);await glossary.fill('κουρφίζει');
   assert.ok((await frame.locator('#glossary-content').textContent()).length>10);
   const glossaryBox=await frame.locator('#sidebar').boundingBox();
   assert.ok(glossaryBox.x>=7&&glossaryBox.x+glossaryBox.width<=width-7&&glossaryBox.height<=675,'Optional glossary uses a mobile sheet');
   await audit(width+' glossary dialog');
   await page.keyboard.press('Escape');await focused(chapters);

   await frame.locator('#pdl-hide-tools').press('Enter');await focused(frame.locator('#pdl-show-tools'));
   assert.equal(await frame.locator('#pdl-access-nav').isVisible(),true);
   const text=await frame.locator('#page-content').boundingBox(),nav=await frame.locator('#pdl-access-nav').boundingBox();
   assert.ok(text.y+text.height<=nav.y+1,'Persistent controls must have reserved space, not cover the reading leaf');
   await frame.getByRole('button',{name:'Βοήθεια',exact:true}).press('Enter');
   await audit(width+' help dialog');
   const assistedAnchor=await frame.evaluate(()=>pdlPageAnchor(currentChapter,currentPage));
   await preference.press('Space');await quiet();await containsAnchor(assistedAnchor);
   assert.equal(await frame.locator('.main-area').evaluate(n=>n.clientHeight),fullHeight,'Disabling assistance returns all reserved space to text');
   assert.equal(await frame.locator('#pdl-access-nav').isVisible(),false);
   assert.equal(await page.evaluate(()=>localStorage.getItem('pdl:reader:assistance:v1')),'off');
   await page.keyboard.press('Escape');await focused(frame.locator('#page-content'));
  }else{
   const drawer=frame.locator('#pdl-drawer-toggle');await drawer.press('Enter');
   await focused(frame.locator('#pdl-tab-book'));
   const pg=await frame.evaluate(()=>currentPage);
   await page.keyboard.press('ArrowRight');await focused(frame.locator('#pdl-tab-appearance'));
   assert.equal(await frame.locator('#pdl-tab-appearance').getAttribute('aria-selected'),'true');
   assert.equal(await frame.evaluate(()=>currentPage),pg,'Tab arrows must not reach book navigation');
   await audit(width+' desktop appearance panel');
   await page.keyboard.press('Escape');await focused(drawer);
   await frame.locator('#pdl-reader-help-button').press('Enter');await audit(width+' help dialog');
   await page.keyboard.press('Escape');await focused(frame.locator('#pdl-reader-help-button'));
  }
  // A real keyboard page turn announces the new location exactly once, while
  // background batch notifications at that same location stay silent.
  await frame.locator('#page-content').focus();
  const before=await frame.evaluate(()=>({page:currentPage,turns:pdlOpenPageFlipDebug().animatedTurns}));
  await page.keyboard.press('ArrowRight');
  await frame.waitForFunction(pg=>currentPage===pg+1,before.page);await quiet();
  await frame.waitForFunction(pg=>document.getElementById('pdl-page-announcement').textContent.includes('Σελίδα '+(pg+2)+'.'),before.page);
  assert.equal(await frame.evaluate(()=>pdlOpenPageFlipDebug().animatedTurns),before.turns+1);
  const unchanged=await frame.evaluate(()=>{
   const live=document.getElementById('pdl-page-announcement');window.announcementChanges=0;
   new MutationObserver(()=>window.announcementChanges++).observe(live,{childList:true,subtree:true,characterData:true});
   for(let i=0;i<20;i++)window.dispatchEvent(new Event('pdl-progress-pages'));
   return live.textContent;
  });
  await page.waitForTimeout(300);
  assert.deepEqual(await frame.evaluate(()=>({text:document.getElementById('pdl-page-announcement').textContent,changes:announcementChanges})),
   {text:unchanged,changes:0},'Background pagination notifications must not repeat the page announcement');
  if(process.env.PDL_CAPTURE_DIR)await page.screenshot({path:path.join(process.env.PDL_CAPTURE_DIR,'accessibility-'+width+'.png')});
  await frame.evaluate(()=>pdlReturnToLibrary());await page.waitForFunction(()=>activeBook===null);await focused(card);
  await page.waitForFunction(()=>document.getElementById('reader-frame').contentDocument?.URL==='about:blank');
  await card.press('Enter');await page.waitForFunction(()=>typeof document.getElementById('reader-frame')?.contentWindow?.pdlOpenPageFlipDebug==='function');
  frame=page.frames().find(f=>f.url()==='about:srcdoc');await quiet();
  if(width<769){
   assert.equal(await frame.locator('#pdl-first-use').isVisible(),false,'Dismissed hint must not recur on reopen');
   assert.equal(await frame.locator('#pdl-access-nav').isVisible(),false,'Disabled assistance persists after reopening');
  }
  if(width===320){
   await frame.evaluate(()=>pdlReturnToLibrary());await page.waitForFunction(()=>activeBook===null);
   await page.waitForFunction(()=>document.getElementById('reader-frame').contentDocument?.URL==='about:blank');
   await page.locator('#pdl-help-trigger').press('Enter');
   const catalogPreference=page.locator('#pdl-assistance-setting');await catalogPreference.press('Space');
   assert.equal(await catalogPreference.isChecked(),true);
   await page.locator('#pdl-help-close').press('Enter');await card.press('Enter');
   await page.waitForFunction(()=>typeof document.getElementById('reader-frame')?.contentWindow?.pdlOpenPageFlipDebug==='function');
   frame=page.frames().find(f=>f.url()==='about:srcdoc');await quiet();
   assert.equal(await frame.locator('#pdl-access-nav').isVisible(),true,'Catalog instructions enable assistance before the next book opens');
  }
  await page.close();console.log('PASS '+engine+' '+width+': keyboard, focus return, menus, single text copy, page announcements and first use');
 }
 assert.deepEqual(errors,[],'No uncaught JavaScript errors');
 console.log(JSON.stringify({engine,version:browser.version(),automaticAudits:results,nativeVoiceOver:'not tested',nativeTalkBack:'not tested'}));
}catch(e){
 if(frame)console.error(await frame.evaluate(()=>({focus:document.activeElement?.outerHTML?.slice(0,300),opf:window.pdlOpenPageFlipDebug?.(),sidebar:document.getElementById('sidebar')?.outerHTML.slice(0,250)})).catch(()=>({unavailable:true})));
 throw e;
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
