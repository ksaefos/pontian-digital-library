import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
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
assert.ok(shell.includes('pdlProgressStart();'),'Grid dispatcher must start progressive scheduling');
assert.ok(shell.includes('pdlProgressNotify('),'Status must be reported');
assert.ok(shell.includes('pdlProgressPump();'),'Reader must schedule progressive work');
assert.ok(shell.includes('function pdlPositionMarkup('),'Page renderer must remain present');
assert.ok(shell.includes('pdl-openpageflip-adapter-v1940'),'Native OpenPageFlip must remain installed');
assert.ok(!shell.includes('eval('),'Reader must not use eval');
const buildScript=readFileSync(resolve(root,'scripts/build-assets.mjs'),'utf8');
assert.ok(buildScript.includes('`pontian-digital-library-v${version}-${hash.digest'), 'Build must generate SW cache names matching the version test');
console.log('PASS v3.1.2 progressive pagination, navigation, cancellation, cache, CI build and OPF boundaries');
