import {strict as assert} from 'node:assert';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const source=readFileSync(resolve(import.meta.dirname,'..','cloudflare-worker.js'),'utf8');
const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const env={ADMIN_PASSWORD:'test-secret',GITHUB_TOKEN:'github-secret',GITHUB_OWNER:'demo',GITHUB_REPO:'test',GITHUB_BRANCH:'main',ALLOWED_ORIGIN:'https://demo.github.io'};
const sample={format:'pontian-digital-library',books:[{id:'b1',title:'Σωνίτσα',chapters:[{id:'c1',text:'Ποντιακόν'}]}],entries:[]};
let mockFetch;
const oldFetch=globalThis.fetch;
globalThis.fetch=(url,opts)=>mockFetch(String(url),opts);
const reply=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
const request=(method='GET',data,headers={})=>new Request('https://worker.example/api/library',{method,headers:{Origin:env.ALLOWED_ORIGIN,Authorization:'Bearer test-secret',...(data?{'Content-Type':'application/json'}:{}),...headers},body:data?JSON.stringify(data):undefined});
const expect=(label,ok)=>{assert.ok(ok,label);console.log('PASS '+label)};
try {
  const raw=JSON.stringify(sample);
  const githubBlob={sha:'a'.repeat(40),encoding:'base64',content:Buffer.from(raw).toString('base64')};
  mockFetch=(url)=>url.includes('/git/blobs/')?reply(githubBlob):reply({sha:'a'.repeat(40)});
  let r=await worker.fetch(request(),env);
  expect('Worker GET returns compatible {sha,data}',r.status===200 && (await r.json()).data.books[0].chapters[0].text==='Ποντιακόν');
  r=await worker.fetch(request('GET',undefined,{Authorization:'Bearer wrong'}),env);
  expect('Worker rejects invalid credentials',r.status===401);
  r=await worker.fetch(request('GET',undefined,{Origin:'https://untrusted.invalid'}),env);
  expect('Worker rejects cross-origin browser calls',r.status===403);
  mockFetch=(url)=>url.includes('/git/blobs/')?reply({...githubBlob,content:Buffer.from('not json').toString('base64')}):reply({sha:'a'.repeat(40)});
  r=await worker.fetch(request(),env);
  expect('Worker rejects malformed GitHub library without leaking data',r.status===502);
  mockFetch=(url)=>reply({sha:'b'.repeat(40)});
  r=await worker.fetch(request('PUT',{sha:'a'.repeat(40),data:sample}),env);
  expect('Worker preserves 409 conflict protection',r.status===409);
  mockFetch=(url,opts)=>opts?.method==='PUT'?reply({content:{sha:'c'.repeat(40)}}):reply({sha:'a'.repeat(40)});
  r=await worker.fetch(request('PUT',{sha:'a'.repeat(40),data:sample}),env);
  expect('Worker PUT preserves SHA-based publish response',r.status===200 && (await r.json()).sha==='c'.repeat(40));
  r=await worker.fetch(request('PUT',{sha:'a'.repeat(40),data:sample}),{...env,GITHUB_BRANCH:'main'});
  expect('Worker still accepts valid payloads',r.status===200);
  // Preserve the exact payload contract for a realistic multi-megabyte library.
  const fullData=readFileSync(resolve(import.meta.dirname,'..','library-data.json'),'utf8');
  const fullBlob={sha:'f'.repeat(40),encoding:'base64',content:Buffer.from(fullData).toString('base64')};
  mockFetch=(url)=>url.includes('/git/blobs/')?reply(fullBlob):reply({sha:'f'.repeat(40)});
  r=await worker.fetch(request(),env);
  const fullResult=await r.json();
  const original=JSON.parse(fullData);
  expect('Worker GET preserves real library contents',r.status===200 && fullResult.data.books.length===original.books.length && fullResult.data.entries.length===original.entries.length && JSON.stringify(fullResult.data)===JSON.stringify(original));
  console.log('All Worker contract regression tests passed.');
} finally {globalThis.fetch=oldFetch;}
