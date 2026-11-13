import {readFileSync,existsSync} from 'node:fs';
import {strict as assert} from 'node:assert';
import vm from 'node:vm';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const get=(name)=>readFileSync(path.join(root,name),'utf8');
const studio=get('admin.html'),reader=get('index.html'),sw=get('sw.js'),worker=get('cloudflare-worker.js');
const data=JSON.parse(get('library-data.json'));
const test=(name,fn)=>{fn();console.log('PASS '+name)};
test('all books, glossary entries and immutable ids exist',()=>{
 assert.equal(data.format,'pontian-digital-library');
 assert.ok(data.books.length>=1&&data.entries.length>=1);
 const ids=data.entries.map(e=>e.id);assert.equal(ids.length,new Set(ids).size);
 for(const b of data.books){assert.ok(b.id&&b.title);assert.ok(b.chapters.length>0);const cs=b.chapters.map(c=>c.id);assert.equal(cs.length,new Set(cs).size);}
});
test('glossary metadata unchanged on edit',()=>{
 const begin=studio.indexOf("$('dlgSave').onclick=()=>{");
 const end=studio.indexOf("$('dlgDelete').onclick",begin);
 assert.ok(begin>0&&end>begin);
 const code=studio.slice(begin,end);
 let entry={id:'test',term:'λέξη',definition:'σημασία',category:'word',sources:['βιβλίο'],etymology:'αρχ. ελλ.',references:[{bookId:'b',chapterId:'c'}],privateNote:'keep'};
 // The save dialog now validates selected book/chapter references. Supply its
 // in-memory draft and confirmation state in this isolated VM fixture.
 const state={books:[{id:'b',title:'βιβλίο',chapters:[{id:'c',text:'λέξη'}]}],entries:[entry]};
 const fields={dlgTerm:{value:'λέξη'},dlgDefinition:{value:'νέα σημασία'},dlgCat:{value:'word'},dlgEtymology:{value:'αρχ. ελλ.'},dlgSources:{value:'βιβλίο'},dlgSave:{},entryDialog:{close(){}}};
 const draftEntryRefs=[{bookId:'b',chapterId:'c'}];
 const manuallyRemovedReferenceKeys=new Set();
 const referenceKey=(entryId,ref)=>String(entryId)+'|'+String(ref.bookId)+'|'+String(ref.chapterId);
 const $=key=>fields[key];const ctx={state,editingEntry:'test',$,draftEntryRefs,manuallyRemovedReferenceKeys,referenceKey,persist(){},renderLex(){},notify(){},uid(){return 'new'},mergeEntries(){throw Error('Editing must not merge/drop metadata')}};
 vm.runInNewContext(code,ctx,{timeout:1000});
 ctx.$('dlgSave').onclick();
 const next=state.entries[0];
 assert.equal(next.definition,'νέα σημασία');assert.equal(next.etymology,'αρχ. ελλ.');assert.equal(next.privateNote,'keep');
 assert.equal(next.references[0].chapterId,'c');
});
test('rich HTML plain fallback preserves br and blockquotes',()=>{
 assert.match(studio,/if\(el\.tagName==='BR'\)return '\\n'/);
 assert.match(studio,/if\(tag==='blockquote'\)\{for\(const child of el\.children\)visit\(child\);return;\}/);
});
test('publication loss safeguards',()=>{
 assert.match(studio,/if\(old\.etymology&&!fresh\.etymology\)/);
 assert.ok(studio.includes("!manuallyRemovedReferenceKeys.has(String(id)+'|'+ref)"));
 assert.match(studio,/if\(oldChapter\.richHtml&&!next\.richHtml\)/);
 // Manual downloads remain available, but must not run on login/publish.
 assert.ok(studio.includes("$('backupQuick').onclick=()=>{if(!window.pdlStudioConnected?.())return;keepEditorChanges();persist();backup();};"),'Authenticated manual backup must capture current edits before export');
 assert.match(studio,/\$\('exportBackup'\)\.onclick=backup/);
 assert.doesNotMatch(studio,/Δημιουργήθηκε αυτόματο τοπικό backup/);
 assert.match(studio,/window\.pdlExplicitDeletedEntries\.has\(id\)/);
});
test('book/chapter removal requires explicit consent and keeps glossary metadata',()=>{
 const start=studio.indexOf('const manuallyRemovedReferenceKeys=new Set();');
 const stop=studio.indexOf('function showEntryReferences(){',start);
 assert.ok(start>0&&stop>start,'Deletion engine must be independently reviewable');
 const oldState={books:[
  {id:'b1',title:'Πρώτο βιβλίο',chapters:[{id:'c1',title:'Πρώτο',text:'α'},{id:'c2',title:'Δεύτερο',text:'β'}]},
  {id:'b2',title:'Άλλο βιβλίο',chapters:[{id:'c3',title:'Μόνο',text:'γ'}]}
 ],entries:[
  {id:'e1',term:'λέξη',definition:'σημασία',etymology:'αρχ. ελλ.',sources:['Πρώτο βιβλίο'],references:[{bookId:'b1',chapterId:'c1'},{bookId:'b1',chapterId:'c2'},{bookId:'b2',chapterId:'c3'}]},
  {id:'e2',term:'άλλη',definition:'σημασία',sources:['Πρώτο βιβλίο'],references:[{bookId:'b1',chapterId:'c1'}]}
 ]};
 const state=structuredClone(oldState),remote=structuredClone(oldState);
 let confirmation=true,typed='ΔΙΑΓΡΑΦΗ',promptCount=0,confirmCount=0,notifyCount=0;
 const window={pdlStudioConnected:()=>true,pdlExplicitDeletedEntries:new Set(),pdlPublishedBooksForDeletion:()=>remote.books};
 const ctx={state,window,structuredClone,
  searchNorm:s=>String(s).toLocaleLowerCase('el').trim(),
  keepEditorChanges(){},persist(){},view(){},notify(){notifyCount++},
  confirm(){confirmCount++;return confirmation},
  prompt(){promptCount++;return typed},
  selectedBook:'b1',selectedChapter:'c1'};
 vm.createContext(ctx);
 vm.runInContext(studio.slice(start,stop),ctx,{timeout:2500});
 const run=js=>vm.runInContext(js,ctx,{timeout:2500});
 assert.equal(run('pdlRemovalImpact("b1","c1").references'),2);
 assert.equal(run('pdlRemovalImpact("b1").sourceEntries'),2);
 confirmation=false;
 assert.equal(run('pdlRemoveContent("b1","c1")'),false);
 assert.equal(state.books[0].chapters.length,2,'Cancel must not remove content');
 confirmation=true;typed='λάθος';
 assert.equal(run('pdlRemoveContent("b1","c1")'),false);
 assert.equal(state.entries[0].references.length,3,'Bad confirmation must preserve references');
 typed='ΔΙΑΓΡΑΦΗ';
 assert.equal(run('pdlRemoveContent("b1","c1")'),true);
 assert.equal(state.books[0].chapters.length,1);
 assert.deepEqual(JSON.parse(JSON.stringify(state.entries[0].references.map(r=>r.bookId+':'+r.chapterId))),['b1:c2','b2:c3'],
  'Other books/chapters must retain their references');
 assert.equal(state.entries[0].etymology,'αρχ. ελλ.','Etymology must not be deleted');
 assert.deepEqual(state.entries[0].sources,['Πρώτο βιβλίο'],'Historic source text must remain');
 assert.equal(state.entries.length,2,'Glossary entries must never be deleted automatically');
 assert.equal(run('manuallyRemovedReferenceKeys.has("e1|b1|c1")'),true);
 assert.equal(run('pdlExplicitDeletedChapters.has("b1|c1")'),true);
 const review=()=>run('pdlReviewRemovedContent(new Map(('+JSON.stringify(remote.books)+').map(b=>[b.id,b])),new Map(state.books.map(b=>[b.id,b])),pdlExplicitDeletedBooks,pdlExplicitDeletedChapters)');
 assert.equal(review().losses.length,0,'Explicit chapter deletion must be publishable');
 assert.equal(review().deletedChapters.length,1);
 assert.ok(run('pdlReviewRemovedContent(new Map(('+JSON.stringify(remote.books)+').map(b=>[b.id,b])),new Map(state.books.map(b=>[b.id,b])),new Set(),new Set()).losses.length')>0,
  'Exactly the same omission without explicit consent must be blocked');
 assert.equal(run('pdlRemoveContent("b1","c2")'),false,'Last chapter cannot be deleted');
 assert.equal(run('pdlRemoveContent("b1")'),true,'Confirmed book deletion must be allowed');
 assert.equal(state.books.length,1);
 assert.deepEqual(JSON.parse(JSON.stringify(state.entries[0].references.map(r=>r.bookId))),['b2'],
  'Deleting a book must keep unrelated references');
 assert.equal(review().losses.length,0);
 assert.equal(review().deletedBooks.length,1);
 // A newly created, never-published book only needs the initial confirmation.
 state.books.push({id:'new',title:'Αδημοσίευτο',chapters:[{id:'newc',title:'Νέο',text:''}]});
 const beforePrompt=promptCount;
 assert.equal(run('pdlRemoveContent("new")'),true);
 assert.equal(promptCount,beforePrompt,'Unpublished book must not require GitHub deletion phrase');
 assert.equal(run('pdlExplicitDeletedBooks.has("new")'),false);
 run('pdlResetDeletionIntent()');
 assert.equal(run('pdlExplicitDeletedBooks.size'),0);
 assert.equal(run('pdlExplicitDeletedChapters.size'),0);
 assert.equal(run('manuallyRemovedReferenceKeys.size'),0);
 assert.ok(confirmCount>=3&&notifyCount>=1);
 // An already-rich chapter whose richHtml disappears remains forbidden even
 // with explicit deletion consents for different objects.
 const richOld=[{id:'rich',title:'Rich',chapters:[{id:'rc',title:'Chapter',text:'a',richHtml:'<p>a</p>'}]}];
 const richNew=[{id:'rich',title:'Rich',chapters:[{id:'rc',title:'Chapter',text:'a'}]}];
 ctx.richOld=richOld;ctx.richNew=richNew;
 const richReview=run('pdlReviewRemovedContent(new Map(richOld.map(b=>[b.id,b])),new Map(richNew.map(b=>[b.id,b])),new Set(["rich"]),new Set(["rich|rc"]))');
 assert.ok(richReview.losses.some(x=>x.includes('εμπλουτισμένου')),'Rich text loss is never authorized by deletion consent');
 assert.ok(studio.includes("losses.push('ορφανή δομημένη παραπομπή"),'Publisher must refuse dangling references');
 assert.ok(studio.includes("prompt(message)!=='ΔΙΑΓΡΑΦΗ'"),'Publishing approved deletions requires a second typed confirmation');
 assert.ok(studio.includes('window.pdlPublishedBooksForDeletion=()=>bridge.remote?.books||[]'),
  'Cloud bridge must expose only published book IDs to earlier Studio script');
});
test('rich chapter protected when rich editor unavailable',()=>{
 assert.match(studio,/field\.readOnly=!!ch\?\.richHtml/);
 assert.ok(!studio.includes("import(base+'@tiptap"));
 assert.ok(studio.includes("import('./vendor/tiptap/tiptap.bundle.js')"));
});
test('reader safe replacement uses functions',()=>{
 assert.match(reader,/markup\.replace\(needle,\(\)=>value\)/);
 assert.match(reader,/replaceAll\('__PDL_BOOK_TITLE__',\(\)=>pdlEscapeHTML\(book\.title\)\)/);
});
test('PWA does not precache administrator; no dead studio path',()=>{
 assert.ok(!sw.includes("'./admin.html'"));assert.ok(!sw.includes('studio/index.html'));
 assert.ok(!existsSync(path.join(root,'admin.js')));
});
test('Worker guards writes with SHA and byte-size check',()=>{
 assert.match(worker,/present\.sha!==payload\.sha/);
 assert.match(worker,/TextEncoder\(\)\.encode\(raw\)\.byteLength>max/);
});
test('record counts and critical metadata retained',()=>{
 console.log(`  ${data.books.length} books, ${data.entries.length} entries, ${data.entries.filter(e=>e.etymology).length} etymologies`);
});

test('JS serialization safely escapes script breakers and separators',()=>{
 const line=reader.split('\n').find(l=>l.startsWith('function pdlSafeJS(value)'));
 assert.ok(line);
 const fn=vm.runInNewContext(line+';pdlSafeJS',{},{timeout:1000});
 const out=fn('</script>\u2028\u2029');
 assert.ok(!out.includes('</script>'));
 assert.ok(out.includes('\\u2028')&&out.includes('\\u2029'));
});
test('glossary scoped to book provenance',()=>{
 const start=reader.indexOf('function pdlSeparateTerm(value){');
 const stop=reader.indexOf('function pdlParagraphs(text){',start);
 const funcs=reader.slice(start,stop);
 const esc= x=>String(x);
 const f=vm.runInNewContext(funcs+';({pdlGlossaryFromEntries})',{},{timeout:3000}).pdlGlossaryFromEntries;
 const book=data.books[0];const result=f(data.entries,book);
 assert.ok(Object.keys(result).length>0&&Object.keys(result).length<data.entries.length);
 const foreign=data.entries.find(e=>e.references?.length&&e.references.every(r=>String(r.bookId)!==String(book.id))&&!Object.hasOwn(result,e.term));
 assert.ok(foreign);
});
test('reference refresh retains textual variants but drops deleted chapters',()=>{
 const start=studio.indexOf('function updateGlossaryReferences(){');
 const stop=studio.indexOf('function renderLex(){',start);
 const fn=studio.slice(start,stop);
 const state={books:[{id:'book1',title:'Βιβλίο',chapters:[{id:'chapter1',text:'άλλη λέξη'},{id:'chapter2',text:'σπίτι'}]}],entries:[{id:'entry1',term:'σπίτι',sources:['Βιβλίο'],references:[{bookId:'book1',chapterId:'chapter1'}]}]};
 const norm=x=>String(x||'').normalize('NFC').toLocaleLowerCase('el').trim();
 const ctx={state,searchNorm:norm,headwordOnly:x=>String(x).split('(')[0].trim()};
 const run=()=>vm.runInNewContext(fn+';updateGlossaryReferences();',ctx,{timeout:1000});
 run();assert.ok(state.entries[0].references.some(r=>r.chapterId==='chapter1'));
 assert.ok(state.entries[0].references.some(r=>r.chapterId==='chapter2'));
 state.books[0].chapters[0].text='αλλαγμένο';run();
 assert.ok(state.entries[0].references.some(r=>r.chapterId==='chapter1'));
 state.books[0].chapters.shift();run();
 assert.ok(!state.entries[0].references.some(r=>r.chapterId==='chapter1'));
 assert.ok(state.entries[0].references.some(r=>r.chapterId==='chapter2'));
});
test('glossary source matching NFC apostrophes and section numbers',()=>{
 const start=reader.indexOf('function pdlSeparateTerm(value){');
 const stop=reader.indexOf('function pdlParagraphs(text){',start);
 const f=vm.runInNewContext(reader.slice(start,stop)+';pdlGlossaryFromEntries',{},{timeout:2000});
 const b={id:'b',title:"Αέρα σ' μαναχόν κανείται",chapters:[{id:'c'}]};
 const item={term:'δοκιμή',definition:'σημασία',sources:['Αέρα σ’ μαναχόν κανείται §1'],references:[]};
 assert.ok(Object.hasOwn(f([item],b),'δοκιμή'));
});
test('every glossary entry can resolve to at least one source book',()=>{
 const start=reader.indexOf('function pdlSeparateTerm(value){');
 const stop=reader.indexOf('function pdlParagraphs(text){',start);
 const f=vm.runInNewContext(reader.slice(start,stop)+';pdlGlossaryFromEntries',{},{timeout:2000});
 const unlinked=data.entries.filter(e=>!data.books.some(b=>Object.keys(f([e],b)).length));
 assert.equal(unlinked.length,0,'Unlinked: '+unlinked.slice(0,10).map(x=>x.term).join(', '));
});
test('Content Security Policy pins inline admin scripts',()=>{
 assert.match(studio,/<meta http-equiv="Content-Security-Policy"/);
 assert.ok(!/script-src[^;]*unsafe-inline/.test(studio.slice(0,2000)));
});
test('offline build asset pipeline included',()=>{
 assert.ok(existsSync(path.join(root,'scripts','build-assets.mjs')));
 assert.ok(existsSync(path.join(root,'vendor','tiptap','src','entry.mjs')));
 assert.ok(existsSync(path.join(root,'.github','workflows','verify-and-build.yml')));
});

console.log('All mandatory regression tests passed.');
