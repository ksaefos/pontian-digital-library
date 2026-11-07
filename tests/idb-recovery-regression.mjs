import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../admin.html',import.meta.url),'utf8');
const start=html.indexOf('const PDL_DRAFT_DB=');
const end=html.indexOf('function norm(s){',start);
assert.ok(start>0&&end>start,'IDB implementation present');
const js=html.slice(start,end);
const records=new Map();
const opened=()=>({
 objectStoreNames:{contains:()=>true},close(){},
 transaction(){
  const tx={error:null,oncomplete:null,onerror:null,onabort:null,objectStore(){return {
   put(value,key){records.set(key,structuredClone(value));queueMicrotask(()=>tx.oncomplete?.());},
   get(key){const req={result:records.get(key),onsuccess:null,onerror:null};queueMicrotask(()=>req.onsuccess?.());return req;}
  }}};
  return tx;
 }
});
const indexedDB={open(){const req={result:opened(),onsuccess:null,onerror:null};queueMicrotask(()=>req.onsuccess?.());return req}};
const store=new Map();const notifications=[];
const context={indexedDB,window:{indexedDB},document:{addEventListener(){}},state:{books:[{id:'a'}],entries:[{id:'one'}]},
 localStorage:{setItem:(k,v)=>store.set(k,v)},STORAGE:'pdl-test',notify:m=>notifications.push(m),
 structuredClone,setTimeout:(fn)=>setTimeout(fn,0),clearTimeout,console,Promise,Date,Error};
vm.createContext(context);
vm.runInContext(js,context);
assert.equal(vm.runInContext('persist()',context),true);
await new Promise(r=>setTimeout(r,30));
let first=await vm.runInContext('pdlDraftGet()',context);
assert.equal(first.data.books[0].id,'a');
vm.runInContext('state.books[0].id="b";persist()',context);
await new Promise(r=>setTimeout(r,30));
let second=await vm.runInContext('pdlDraftGet()',context);
assert.equal(second.data.books[0].id,'b','recovery mirror keeps latest local draft');
assert.equal(store.has('pdl-test'),true,'existing localStorage contract preserved');
assert.ok(html.includes('pdlRecoverIndexedDb'),'recovery UI present');
assert.ok(html.includes('if(!confirm(msg))return'),'recovery requires confirmation');
assert.ok(html.includes('backup();\n  state=structuredClone(saved.data)'), 'manual restore exports prior state');
assert.ok(!js.includes('bridge.password'),'secret never written to backup');
console.log('PASS IndexedDB mirror saves latest state, keeps legacy localStorage, and requires explicit recovery');
