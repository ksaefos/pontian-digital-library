import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// v3.1.2 Admin is cloud-first. IndexedDB recovery functions may remain for
// deliberately requested rescue, but NO local dataset is loaded or written
// automatically while the Studio starts or edits an authenticated workspace.
const html=readFileSync(new URL('../admin.html',import.meta.url),'utf8');
const start=html.indexOf('const PDL_DRAFT_DB=');
const end=html.indexOf('function norm(s){',start);
assert.ok(start>0&&end>start,'Legacy manual rescue functions present');
const js=html.slice(start,end);
assert.ok(html.includes('let state={books:[],entries:[]};'),'No book is preloaded before GitHub authentication');
assert.ok(html.includes('id="initial-data">{"books":[],"entries":[]}'),'Embedded demo content is not preloaded');
assert.ok(!html.includes('localStorage.getItem(STORAGE)'),'Never read old localStorage dataset at startup');
assert.ok(!html.includes('pdl_studio_worker_url'),'Never load an old full worker URL');
assert.ok(!js.includes('pdlDraftSchedule();'),'No automatic IndexedDB writes');
assert.ok(html.includes('pdlStudioConnected')&&html.includes('pdlCloudGate'),'Editing requires authentication');
assert.ok(html.includes('pdlHandleConnectionLoss')&&html.includes('Θέλεις να αποθηκεύσεις'),'Explicit rescue only when connection is lost');
const writes=[],legacyWrites=[];
const state={books:[{id:'github-book',chapters:[]}],entries:[]};
const baseline=JSON.stringify(state);
let serializations=0,nextTimer=0;
const queued=new Map();
const jsonInstrument={stringify(...args){serializations++;return JSON.stringify(...args)}};
const context={state,pdlCloudStorageDirty:false,pdlCloudSnapshot:baseline,
  window:{pdlStudioConnected:()=>true,addEventListener(){}},
  document:{addEventListener(){}},
  localStorage:{setItem:(...args)=>legacyWrites.push(args)},
  indexedDB:{open(){writes.push('open');throw Error('Unexpected IndexedDB access');}},
  JSON:jsonInstrument,structuredClone,console,Date,Error,Promise,
  setTimeout(fn,ms){const id=++nextTimer;queued.set(id,{fn,ms});return id;},
  clearTimeout(id){queued.delete(id);}};
function flushTimers(){
 for(const [id,t] of [...queued]){queued.delete(id);t.fn();}
}
vm.createContext(context);
vm.runInContext(js,context);
for(let i=0;i<150;i++)assert.equal(vm.runInContext('persist()',context),true);
assert.equal(serializations,0,'Frequent persist calls must NOT serialize the full library');
assert.equal(queued.size,1,'Only one deferred exact check should remain queued');
assert.equal(vm.runInContext('pdlCloudStorageDirty',context),true,
 'Conservative dirty flag protects a close before the idle comparison');
flushTimers();
assert.equal(serializations,1,'The idle check should serialize once, not per persist');
assert.equal(vm.runInContext('pdlCloudStorageDirty',context),false,
 'A navigation-only persist must clear the temporary dirty flag after idle');
vm.runInContext("state.books[0].id='edited-book';persist()",context);
assert.equal(vm.runInContext('pdlCloudStorageDirty',context),true);
flushTimers();
assert.equal(vm.runInContext('pdlCloudStorageDirty',context),true,
 'A data change must remain dirty after exact reconciliation');
// Reverting back to the published content must clear false positives at idle.
vm.runInContext("state.books[0].id='github-book';persist()",context);
flushTimers();
assert.equal(vm.runInContext('pdlCloudStorageDirty',context),false);
// A still-unsubmitted form or rich-text edit must NEVER be cleared by a
// comparison of state alone, because the editor has not committed it yet.
for(const name of ['pdlCloudEditorDraft','pdlCloudEntryDraft','pdlCloudRichDraft']){
 vm.runInContext(`${name}=true;pdlCloudStorageDirty=true`,context);
 assert.equal(vm.runInContext('pdlCloudReconcileDirty()',context),true,
  `${name} must preserve the rescue/unload warning`);
 vm.runInContext(`${name}=false`,context);
}
assert.equal(vm.runInContext('pdlCloudReconcileDirty()',context),false);
// A network publish races with user edits. Sync to the *submitted* snapshot,
// not an updated live state, or the unsent edits would be marked as published.
vm.runInContext("state.books[0].id='new-after-PUT';pdlCloudSyncSnapshot(pdlCloudSnapshot)",context);
assert.equal(vm.runInContext('pdlCloudStorageDirty',context),true,
 'Changes made during a publish must remain dirty');
assert.equal(writes.length,0,'No background IndexedDB read/write');
assert.equal(legacyWrites.length,0,'No background localStorage write');
assert.ok(html.includes('localStorage.setItem(\'pdl_worker_nick\',nick)'),'Only the short Worker nickname is remembered');
// Manual JSON export must be reachable after authentication without reviving
// any automatic localStorage/IndexedDB persistence or offline editing.
assert.match(html,/#publishView > \.panel:not\(#pdlCloudPanel\),#publishView > \.warn\{display:none!important\}/,
 'Legacy cloud panels remain hidden without hiding the global backup control');
assert.ok(!html.includes('#publishView > .warn,#backupQuick{display:none!important}'),
 'The global manual backup control must not be hidden by legacy styles');
assert.match(html,/<button id="backupQuick" type="button" disabled[^>]*>[^<]*<svg[\s\S]*?Λήψη αντιγράφου JSON<\/button>/,
 'Backup button must be visible in the header but disabled before login');
assert.ok(html.includes("$('backupQuick').disabled=!connected;"),
 'Manual backup must follow the authenticated Worker state');
assert.ok(html.includes("$('backupQuick').onclick=()=>{if(!window.pdlStudioConnected?.())return;keepEditorChanges();persist();backup();};"),
 'Export must capture unsaved editor fields before saving an explicit JSON backup');

console.log('PASS Admin cloud-only and deferred exact dirty check: no background saves or unsafe clean state');
