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
assert.ok(shell.includes("return pdlLegacyPaginate();"),'Hyphenopoly must keep the compatible paginator');
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
const ctx={pdlGridEnabled:true,PDL_HYPH:{mode:()=>ctx.mode},mode:'off',
 pdlProgressStart:()=>calls.push('progressive'),pdlLegacyPaginate:()=>calls.push('legacy')};
runInNewContext(dispatcher+'; pdlPaginate();',ctx);
assert.deepEqual(calls,['progressive'],'Hyphenation off must reach the progressive paginator');
ctx.mode='el-polyton';runInNewContext('pdlPaginate();',ctx);
assert.deepEqual(calls,['progressive','legacy'],'Polytonic books must reach the legacy paginator');
ctx.mode='off';ctx.pdlGridEnabled=false;runInNewContext('pdlPaginate();',ctx);
assert.deepEqual(calls,['progressive','legacy','legacy'],'Explicitly disabled Grid must still reach the legacy paginator');

assert.ok(shell.includes('pdlProgressNotify('),'Status must be reported');
assert.ok(shell.includes('pdlProgressPump();'),'Reader must schedule progressive work');
assert.ok(shell.includes('function pdlPositionMarkup('),'Page renderer must remain present');
assert.ok(shell.includes('pdl-openpageflip-adapter-v1940'),'Native OpenPageFlip must remain installed');
assert.ok(!shell.includes('eval('),'Reader must not use eval');
const buildScript=readFileSync(resolve(root,'scripts/build-assets.mjs'),'utf8');
assert.ok(buildScript.includes('`pontian-digital-library-v${version}-${hash.digest'), 'Build must generate SW cache names matching the version test');
console.log('PASS v3.1.2 progressive pagination, navigation, cancellation, cache, CI build and OPF boundaries');
