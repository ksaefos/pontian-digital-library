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
