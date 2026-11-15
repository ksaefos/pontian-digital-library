import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {runInNewContext} from 'node:vm';
const root=resolve(import.meta.dirname,'..');
const index=readFileSync(resolve(root,'index.html'),'utf8');
const packageData=JSON.parse(readFileSync(resolve(root,'package.json'),'utf8'));
const match=index.match(/<script id="pdl-reader-shell" type="application\/json">([\s\S]*?)<\/script>/);
assert.ok(match,'Embedded Reader shell must exist');
const shell=JSON.parse(match[1]).template;
assert.equal(packageData.version,'3.1.2');
assert.ok(shell.includes('const PDL_PROGRESS_BATCH=6;'),'Bounded batch size must be defined');
for(const marker of [
 'async function pdlProgressBatch(',
 'async function pdlProgressRepair(',
 'function pdlProgressGoAbsolute(',
 'function pdlProgressGo(',
 'function pdlProgressChoose(',
 'function pdlProgressResolveTarget(',
 'function pdlProgressSyncUI(',
 'pdlProgress.cache.set(',
 'pdlProgressContentKey()',
 '(!anchor&&pg<state.pages.length)',
 'if(generation!==pdlProgress.generation)',
 "window.addEventListener('pdl-progress-opf-extend'",
 'const PDL_SOURCE = chapters.map(',
 'pdlGridSliceBlock(source,',
 'pdlProgressGo(ch,Math.max(0,Number(initial.pg)||0))'
 ])assert.ok(shell.includes(marker),'Missing progressive invariant: '+marker);
assert.ok(shell.includes("h(normalized,'.pdl-hyphen-probe')"),'Hyphenopoly string hyphenator must use the configured selector');
assert.ok(shell.includes('pdlProgressStart();'),'Grid dispatcher must start progressive scheduling');
// The abandoned CSS-column paginator is unreachable and must not return.
// Its shared text/HTML slicing helpers, however, are required by live batches.
assert.ok(shell.includes('function pdlGridWordify('),'Shared word measurement helper must remain');
assert.ok(shell.includes('function pdlGridSliceBlock('),'Shared HTML slicing helper must remain');
assert.ok(shell.includes('function pdlLegacyPaginate()'),'Legacy Hyphenopoly-compatible paginator must remain');
for(const retired of ['function pdlGridPaginate(', 'function pdlGridRepairPages(',
 'pdlGridSignature(', 'pdlGridCache', 'pdlGridStats', 'if(false)']){
 assert.ok(!shell.includes(retired),'Abandoned Grid paginator code remains: '+retired);
}
assert.ok(shell.includes("return pdlLegacyPaginate();"),'Legacy fallback must remain available while Hyphenopoly loads or if progressive validation fails');
assert.ok(shell.includes('pdl-progress-hyphenated'),'Progressive measurer must support discretionary cut points');
assert.ok(shell.includes('PDL_HYPH.sourceOffset(textNode'),'Validator must map inserted SHY to original source anchors');
assert.ok(shell.includes('pdlProgressHyphenationFailed=true'),'Failed progressive hyphenation must fall back to legacy');
// Stylesheet cleanup must not reintroduce conflicting native auto-hyphenation
// or the old arbitrary word-wrapping override that was neutralized in v2.2.0.
assert.ok(!shell.includes('id="pdl-v216-pagination-css"'),
 'Retired arbitrary wrapping stylesheet must remain removed');
const bookTypography=shell.match(/<style id="pdl-v154-typography">([\s\S]*?)<\/style>/)?.[1];
assert.ok(bookTypography,'Book typography stylesheet must remain available');
assert.ok(!/-webkit-hyphens\s*:\s*auto|(?:^|[;\s])hyphens\s*:\s*auto/.test(bookTypography),
 'Book typography must not reinstate superseded native auto hyphenation');
const hyphenationCSS=shell.match(/<style id="pdl-220-hyphenation">([\s\S]*?)<\/style>/)?.[1];
assert.ok(hyphenationCSS,'Manual Hyphenopoly stylesheet must remain available');
assert.ok(hyphenationCSS.includes('overflow-wrap:normal!important') &&
 hyphenationCSS.includes('hyphens:manual!important'),
 'Manual hyphenation must protect words from arbitrary splitting');
assert.ok(hyphenationCSS.includes('display:inline;'),
 'Decorative page-break hyphen must keep its inline display');

// Execute the actual dispatcher with isolated stubs, rather than relying only
// on string markers. Both live pagination routes must remain reachable.
const dispatcher=shell.match(/function pdlPaginate\(\)\{[\s\S]*?\n\}/)?.[0];
assert.ok(dispatcher,'Active dispatcher must be available');
const calls=[];
const ctx={pdlGridEnabled:true,pdlProgressHyphenationFailed:false,
 PDL_HYPH:{mode:()=>ctx.mode,ready:()=>ctx.ready},mode:'off',ready:false,
 pdlProgressStart:()=>calls.push('progressive'),pdlLegacyPaginate:()=>calls.push('legacy')};
runInNewContext(dispatcher+'; pdlPaginate();',ctx);
assert.deepEqual(calls,['progressive'],'Hyphenation off must reach the progressive paginator');
ctx.mode='el-polyton';runInNewContext('pdlPaginate();',ctx);
assert.deepEqual(calls,['progressive','legacy'],'Hyphenated books must use legacy until WASM is ready');
ctx.ready=true;runInNewContext('pdlPaginate();',ctx);
assert.deepEqual(calls,['progressive','legacy','progressive'],'Loaded polytonic patterns must reach progressive pagination');
ctx.mode='el-monoton';runInNewContext('pdlPaginate();',ctx);
assert.deepEqual(calls,['progressive','legacy','progressive','progressive'],'Monotonic patterns must also reach progressive pagination');
ctx.pdlProgressHyphenationFailed=true;runInNewContext('pdlPaginate();',ctx);
assert.equal(calls.at(-1),'legacy','A failed progressive validation must retain the safe legacy route');
ctx.mode='off';ctx.pdlProgressHyphenationFailed=false;ctx.pdlGridEnabled=false;
runInNewContext('pdlPaginate();',ctx);
assert.equal(calls.at(-1),'legacy','Explicitly disabled Grid must still reach the legacy paginator');

// Exercise the actual editorial hyphenator logic without using a network or
// relying on a browser layout mock. A WASM result is replaced with fixed cuts,
// while the original normalization, grapheme mapping and DOM insertion run.
const hyphSrc=shell.match(/const PDL_HYPH=\(function\(\)\{[\s\S]*?\}\)\(\);/)?.[0];
assert.ok(hyphSrc,'Editorial hyphenator implementation must be available');
const shy='\u00ad';
const sampleWord='βιβλιοθήκη';
const polytonic='α\u0301β\u0301γ\u0301δεζηθ';
const polytonicNfc=polytonic.normalize('NFC');
const hyphenator=(word)=>{
 if(word===sampleWord)return 'βιβλιο'+shy+'θήκη';
 if(word===polytonicNfc){
  const g=Array.from(new Intl.Segmenter('el',{granularity:'grapheme'}).segment(word),x=>x.segment);
  return g.slice(0,2).join('')+shy+g[2]+shy+g.slice(3).join('');
 }
 return word;
};
const mockWalker=(root)=>{
 const nodes=root.textNodes;
 let i=0;
 return {nextNode:()=>nodes[i++]||null};
};
const hyphContext={PDL_BOOK_EDITOR_SETTINGS:{hyphenation:'el-polyton'},
 window:{Hyphenopoly:{hyphenators:{'el-polyton':hyphenator,'el-monoton':hyphenator}}},
 document:{getElementById:()=>null,createTreeWalker:mockWalker},
 NodeFilter:{SHOW_TEXT:4},pdlLayoutInProgress:false,pdlScheduleRelayout:()=>{},
 setTimeout:()=>0,console};
runInNewContext(hyphSrc+';globalThis.hyph=PDL_HYPH;',hyphContext);
const hyph=hyphContext.hyph;
await hyph.activate();
assert.equal(hyph.ready(),true,'Pattern-based hyphenator must activate');
assert.deepEqual(Array.from(hyph.tokenBreaks(polytonic)),[6],
 'Polytonic left minimum must count graphemes: reject a cut after only two accented letters');
assert.deepEqual(Array.from(hyph.tokenBreaks(sampleWord)),[6],
 'Monotonic positions must retain their original UTF-16 offsets');
const originalManual='αυτο'+shy+'συλλαβή ';
const textNodes=[{nodeValue:originalManual},{nodeValue:sampleWord}];
const paragraph={nodeName:'P',textNodes};
hyph.apply(paragraph);
assert.equal(textNodes[0].nodeValue,originalManual,
 'Explicitly authored soft hyphens must not disappear during rendering');
assert.equal(textNodes[1].nodeValue,'βιβλιο'+shy+'θήκη',
 'Automatic pattern breaks must appear in the live DOM');
hyph.apply(paragraph);
assert.equal(textNodes[1].nodeValue,'βιβλιο'+shy+'θήκη',
 'Repeated render calls must not accumulate automatic soft hyphens');
hyph.setMode('off');hyph.apply(paragraph);
assert.equal(textNodes[0].nodeValue,originalManual,
 'Turning off automatic hyphenation must not discard the editorial markers');
assert.equal(textNodes[1].nodeValue,sampleWord,
 'Turning off automatic hyphenation must remove only automatically inserted breaks');
hyph.setMode('el-polyton');hyph.apply(paragraph);
assert.equal(textNodes[1].nodeValue,'βιβλιο'+shy+'θήκη',
 'Re-enabling hyphenation must preserve a single set of automatic breaks');
textNodes[1].nodeValue='Ενημερωμένο '+sampleWord;
hyph.apply(paragraph);
assert.equal(textNodes[1].nodeValue,'Ενημερωμένο βιβλιο'+shy+'θήκη',
 'Changes made outside the renderer must never be replaced with an older snapshot');
// A book with editorial hyphenation disabled must not walk text nodes on
// every page turn. A legacy browser without Segmenter still handles accents.
const offCtx={...hyphContext,PDL_BOOK_EDITOR_SETTINGS:{hyphenation:'off'},
 document:{...hyphContext.document,createTreeWalker:()=>{throw Error('Unexpected DOM scan for an off book');}}};
runInNewContext(hyphSrc+';globalThis.hyphOff=PDL_HYPH;',offCtx);
offCtx.hyphOff.apply(paragraph);
assert.deepEqual(Array.from(offCtx.hyphOff.tokenBreaks(polytonic)),[]);
const oldBrowserCtx={...hyphContext,Intl:{},pdlLayoutInProgress:false};
runInNewContext(hyphSrc+';globalThis.hyphFallback=PDL_HYPH;',oldBrowserCtx);
await oldBrowserCtx.hyphFallback.activate();
assert.deepEqual(Array.from(oldBrowserCtx.hyphFallback.tokenBreaks(polytonic)),[6],
 'Without Intl.Segmenter combining marks must still count as one grapheme');
console.log('PASS editorial Hyphenopoly: NFC graphemes, manual soft hyphens, repeated render, mode switch');

assert.ok(shell.includes('pdlProgressNotify('),'Status must be reported');
assert.ok(shell.includes('pdlProgressPump();'),'Reader must schedule progressive work');
assert.ok(shell.includes('function pdlPositionMarkup('),'Page renderer must remain present');
assert.ok(shell.includes('pdl-openpageflip-adapter-v1940'),'Native OpenPageFlip must remain installed');
assert.ok(!shell.includes('eval('),'Reader must not use eval');
const buildScript=readFileSync(resolve(root,'scripts/build-assets.mjs'),'utf8');
assert.ok(buildScript.includes('`pontian-digital-library-v${version}-${hash.digest'), 'Build must generate SW cache names matching the version test');
console.log('PASS v3.1.2 progressive pagination, navigation, cancellation, cache, CI build and OPF boundaries');

// Mobile navigation trial: presentation-only reuse of the existing controls.
// Keep IDs/handlers stable: the progressive slider and chapter/bookmark/search
// mechanisms remain owned by the baseline Reader.
const mobileFooter=shell.match(/<div class="pdl-mobile-chrome bottom" id="pdl-mobile-bottom">([\s\S]*?)<div class="bottombar">/)?.[1];
assert.ok(mobileFooter,'Mobile navigation footer must remain available');
for(const marker of [
 'id="pdl-mobile-progress"', 'onchange="pdlCommitProgress(this.value)"',
 'oninput="pdlPreviewProgress(this.value)"', 'id="pdl-mobile-page-info"',
 'onclick="pdlShowChapters()"', 'onclick="pdlToggleMobileBookmark()"',
 'id="pdl-mobile-bookmark-toggle"', 'aria-describedby="pdl-bookmark-help"',
 'id="pdl-mobile-search-action"', 'onclick="pdlMobileSearch()"'
])assert.ok(mobileFooter.includes(marker),'Mobile trial must preserve the live control: '+marker);
assert.ok(shell.includes("bookmark.addEventListener('pointercancel'"),'Bookmark hold must support gesture cancellation');
assert.ok(shell.includes("bookmark.addEventListener('contextmenu'"),'Bookmark list must remain accessible without a touch hold');
for(const id of ['pdl-mobile-progress','pdl-mobile-page-info','pdl-mobile-search-action']){
 assert.equal(shell.split('id="'+id+'"').length-1,1,'Mobile UI control must have exactly one unique ID: '+id);
}
assert.ok(shell.includes('id="pdl-v312-navigation-trial"'),'Trial styles must be isolated and reversible');
assert.ok(shell.includes('body:not(.immersive) #pdl-mobile-top,body:not(.immersive) #pdl-mobile-bottom{display:flex!important;}'),
 'Mobile navigation must respect the existing immersive/controls display model');
console.log('PASS mobile navigation trial: stable slider, chapter/bookmark/search actions, unique IDs, immersive model');

// OpenPageFlip navigation regression: execute the actual adapter function with
// controlled engine outcomes. Browser effects are covered separately by
// progressive-browser.mjs; these checks prevent silent native-page jumps.
const opfAdapter=shell.match(/<script id="pdl-openpageflip-adapter-v1940">([\s\S]*?)<\/script>/)?.[1];
assert.ok(opfAdapter,'OpenPageFlip adapter must remain available');
const navigateSrc=opfAdapter.match(/function navigate\(delta,retry=false\)\{[\s\S]*?\n\}/)?.[0];
assert.ok(navigateSrc,'OpenPageFlip navigation must support a bounded retry');
assert.ok(opfAdapter.includes('drag:innerWidth>768,swipe:true'),
 'Mobile must animate on release instead of distorting a live dragged fold');
assert.ok(opfAdapter.includes('hover:false'),
 'Mobile fold hover must remain disabled');
function opfNavigationHarness(flipResult){
 const actions=[];
 const engine={state:'read',flipNext:()=>{actions.push('flipNext');return Promise.resolve(flipResult);},
   flipPrev:()=>{actions.push('flipPrev');return Promise.resolve(flipResult);}};
 const ctx={enabled:true,failed:false,currentChapter:0,currentPage:10,
   chapters:[{pages:Array.from({length:60},()=>[])}],innerWidth:390,
   document:{body:{classList:{contains:()=>false}}},
   engine,rebuilding:false,inFlip:false,pdlProgressTurnInFlight:false,
   pdlOpfPendingTurn:null,needsBuild:false,pdlOpfBuiltSignature:'built',
   windowStart:0,windowCount:24,
   queueBuild:delay=>actions.push(['rebuild',delay]),
   nativeRender:()=>actions.push('nativeRender'),
   setStatus:message=>actions.push(['status',message]),fallback:error=>{throw error},
   queueMicrotask:cb=>queueMicrotask(cb),console:{warn:message=>actions.push(['warn',message])}
 };
 runInNewContext(navigateSrc+';globalThis.navigateTest=navigate;',ctx);
 return {ctx,actions};
}
{
 const {ctx,actions}=opfNavigationHarness(true);
 ctx.currentPage=23;
 assert.equal(ctx.navigateTest(1),true);
 assert.equal(ctx.currentPage,23,'Cross-window navigation must not advance instantly');
 assert.ok(ctx.pdlOpfPendingTurn&&ctx.pdlOpfPendingTurn.delta===1,
   'A page-window boundary must retain the requested animated turn');
 assert.equal(ctx.needsBuild,true,'Cross-window navigation must rebuild the window');
 assert.ok(actions.some(x=>Array.isArray(x)&&x[0]==='rebuild'));
 assert.ok(!actions.includes('nativeRender'));
}
{
 const {ctx,actions}=opfNavigationHarness(false);
 assert.equal(ctx.navigateTest(1),true);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(ctx.currentPage,10,'A failed animation must not silently jump to the next page');
 assert.equal(ctx.pdlOpfPendingTurn?.retry,true,'A failed turn should be retried only once after rebuilding');
 assert.equal(ctx.pdlOpfBuiltSignature,'','A rejected turn must force a fresh page window');
 assert.ok(!actions.includes('nativeRender'));
 ctx.pdlOpfPendingTurn=null;
 ctx.needsBuild=false;
 ctx.navigateTest(1,true);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(ctx.currentPage,10,'A second rejected turn must still leave the page unchanged');
 assert.equal(ctx.pdlOpfPendingTurn,null,'A second rejection must not loop forever');
 assert.ok(actions.some(x=>Array.isArray(x)&&x[0]==='status'),
   'A second rejected turn must expose a user-readable status');
}
{
 const {ctx,actions}=opfNavigationHarness(true);
 ctx.navigateTest(1);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(ctx.currentPage,11,'A completed animated turn may update the reading position');
 assert.ok(actions.includes('nativeRender'));
}
console.log('PASS OpenPageFlip adapter: mobile release animation, window boundaries, bounded retry, no static fallback');



// Real pdlProgressConfig() geometry, isolated from the browser-only layout.
// In v3.1.2 the CSS-column measurer is on BODY, not inside #text-viewport.
// Both grid scopes must update together on EVERY font-size / line-scale change.
const progressConfigSrc=shell.match(/function pdlProgressConfig\(\)\{[\s\S]*?\n\}/)?.[0];
assert.ok(progressConfigSrc,'Progressive line geometry must be available');
const styleWrites=[];
const gridContext={
 innerWidth:1200,pdlMobileLineScale:1,PDL_BOOK_EDITOR_SETTINGS:{hyphenation:'el-polyton'},
 document:{
  documentElement:{style:{setProperty:(name,value)=>styleWrites.push(['root',name,value])}},
  body:{},
  getElementById:id=>id==='page-content'?gridContext.leaf:
   id==='text-viewport'?gridContext.viewport:null,
  createElement:()=>({textContent:'',remove(){}})
 },
 leaf:{clientWidth:720,clientHeight:800,append(){ }},
 viewport:{style:{setProperty:(name,value)=>styleWrites.push(['viewport',name,value])}},
 getComputedStyle:el=>el===gridContext.leaf?{
  paddingLeft:'40px',paddingRight:'40px',paddingTop:'24px',paddingBottom:'24px',fontFamily:'Barnebok Pontian'
 }:{fontSize:gridContext.sampleSize+'px'},
 sampleSize:22,localStorage:{getItem:()=>null}
};
runInNewContext(progressConfigSrc+';globalThis.getConfig=pdlProgressConfig;',gridContext);
let gridConfig=gridContext.getConfig();
assert.equal(gridConfig.line,37.18);
assert.deepEqual(styleWrites.slice(-2),[['root','--pdl-grid-line','37.18px'],['viewport','--pdl-grid-line','37.18px']],
 'Progressive desktop font changes must sync both CSS grid scopes');
gridContext.innerWidth=390;gridContext.pdlMobileLineScale=1.2;gridContext.sampleSize=26;
gridConfig=gridContext.getConfig();
assert.equal(gridConfig.line,52.728);
assert.deepEqual(styleWrites.slice(-2),[['root','--pdl-grid-line','52.728px'],['viewport','--pdl-grid-line','52.728px']],
 'Progressive 130% mobile font and line-scale changes must sync both scopes');
console.log('PASS progressive CSS line grid: body measurer, visible pages and OPF respond to font-size changes');
