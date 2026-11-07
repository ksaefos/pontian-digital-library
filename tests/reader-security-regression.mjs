import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const page=readFileSync(resolve(root,'index.html'),'utf8');
const pkg=JSON.parse(readFileSync(resolve(root,'package.json'),'utf8'));
const sw=readFileSync(resolve(root,'sw.js'),'utf8');
const re=/<meta\s+http-equiv=["']Content-Security-Policy["']\s+content=["']([^"']+)["']\s*\/?>/gi;
const csp=[...page.matchAll(re)];
assert.equal(csp.length,1,'Reader must expose one CSP meta policy');
const policy=csp[0][1].replaceAll('&#x27;',"'").replaceAll('&#39;',"'");
for (const directive of ["object-src 'none'","base-uri 'self'","form-action 'none'","connect-src 'self'"]) {
  assert.ok(policy.includes(directive),`Missing CSP: ${directive}`);
}
assert.ok(/img-src[^;]*data:/.test(policy),'Embedded cover images must remain supported');
assert.ok(!/script-src\b/.test(policy),'Do not introduce a blocking script-src without iframe verification');
assert.ok(!/<iframe[^>]*\ssandbox=/i.test(page),'Sandbox migration requires postMessage bookmark bridge');
assert.ok(page.includes('vendor/openpageflip/0.7.0'),'Bundled OpenPageFlip asset must remain');
assert.ok(page.includes('Hyphenopoly'),'Bundled hyphenation must remain');
const app=page.match(/PDL_APP_VERSION\s*=\s*['"]([^'"]+)['"]/);
const cache=sw.match(/const\s+CACHE\s*=\s*['"]([^'"]+)['"]/);
assert.ok(app&&cache,'Missing declared app/cache version');
const version=pkg.version.replace(/-rc\.(\d+)$/,'-rc$1');
assert.equal(app[1],version,'Reader version must equal package version');
assert.ok(cache[1] === `pontian-digital-library-v${version}` || cache[1].startsWith(`pontian-digital-library-v${version}-`),'Service Worker cache version must match');
console.log('PASS reader CSP, iframe safety, bundled libraries, version compatibility');
