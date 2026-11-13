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
const context={state,pdlCloudStorageDirty:false,pdlCloudSnapshot:JSON.stringify(state),
  window:{pdlStudioConnected:()=>true,addEventListener(){}},
  document:{addEventListener(){}},
  localStorage:{setItem:(...args)=>legacyWrites.push(args)},
  indexedDB:{open(){writes.push('open');throw Error('Unexpected IndexedDB access');}},
  structuredClone,console,Date,Error,Promise,setTimeout,clearTimeout};
vm.createContext(context);
vm.runInContext(js,context);
assert.equal(vm.runInContext('persist()',context),true);
assert.equal(vm.runInContext('pdlCloudStorageDirty',context),false);
vm.runInContext("state.books[0].id='edited-book';persist()",context);
assert.equal(vm.runInContext('pdlCloudStorageDirty',context),true);
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

console.log('PASS Admin cloud-only: no local dataset load/autosave, auth gate, in-memory edits, lost-connection rescue');
