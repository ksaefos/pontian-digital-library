import {strict as assert} from 'node:assert';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const code=readFileSync(resolve(import.meta.dirname,'..','cloudflare-worker.js'),'utf8');
const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const base={ADMIN_PASSWORD:'correct-password',GITHUB_TOKEN:'token',GITHUB_OWNER:'x',GITHUB_REPO:'y',ALLOWED_ORIGIN:'https://example.github.io'};
let checks=[];
const env={...base,AUTH_RATE_LIMITER:{async limit({key}){checks.push(key);return {success:checks.length<=2}}}};
const make=(auth,ip='198.51.100.7',origin=base.ALLOWED_ORIGIN)=>new Request('https://worker.example/api/library',{headers:{Origin:origin,Authorization:auth,'CF-Connecting-IP':ip}});
const assertPass=(condition,label)=>{assert.ok(condition,label);console.log('PASS '+label)};
const originalFetch=globalThis.fetch;
let calls=0;
globalThis.fetch=async url=>{calls++;if(String(url).includes('/git/blobs/'))return new Response(JSON.stringify({encoding:'base64',content:Buffer.from(JSON.stringify({format:'pontian-digital-library',books:[],entries:[]})).toString('base64')}));return new Response(JSON.stringify({sha:'a'.repeat(40)}))};
try{
  let res=await worker.fetch(make('Bearer wrong'),env);assertPass(res.status===401,'first bad credential is 401');
  res=await worker.fetch(make('Bearer wrong'),env);assertPass(res.status===401,'second bad credential is 401');
  res=await worker.fetch(make('Bearer wrong'),env);assertPass(res.status===429&&res.headers.get('Retry-After')==='60','failed-auth throttle sends 429');
  assertPass(checks.length===3&&checks.every(k=>k==='failed-auth:198.51.100.7'),'counter scoped by client IP');
  res=await worker.fetch(make('Bearer correct-password'),env);
  assertPass(res.status===200&&checks.length===3,'valid password bypasses failed-auth limiter');
  res=await worker.fetch(make('Bearer wrong','203.0.113.8'),env);
  assertPass(res.status===429&&checks.at(-1)==='failed-auth:203.0.113.8','different client gets distinct key (mock global rejection)');
  const previous=checks.length;
  res=await worker.fetch(make('Bearer wrong','198.51.100.7','https://evil.invalid'),env);
  assertPass(res.status===403&&checks.length===previous,'cross origin blocked before limiter');
  res=await worker.fetch(make('Bearer wrong'),base);
  assertPass(res.status===401,'missing binding retains safe invalid-password response');
  assertPass(calls===2,'invalid password never fetches GitHub');
  console.log('All failed-auth limiter tests passed.');
}finally{globalThis.fetch=originalFetch}
