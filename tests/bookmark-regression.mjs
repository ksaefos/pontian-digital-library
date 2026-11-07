import {readFileSync} from 'node:fs';
import {strict as assert} from 'node:assert';
import vm from 'node:vm';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const html=readFileSync(path.join(root,'index.html'),'utf8');
const match=html.match(/<script id="pdl-reader-shell" type="application\/json">([\s\S]*?)<\/script>/);
assert.ok(match,'Embedded reader is present');
const shell=JSON.parse(match[1]).template;
assert.match(html,/id:String\(c\.id\|\|`legacy-\$\{i\}`\)/);
assert.match(html,/return \{id:c\.id,number:c\.title,pages:/);
const from=shell.indexOf('function pdlBMPlain(');
const to=shell.indexOf('function saveBookmarks(',from);
assert.ok(from>0&&to>from);
const js=shell.slice(from,to);
const blocks=['Ξεκινά εδώ το παλιό κεφάλαιο με μία ιδιαίτερη φράση για δοκιμή.','Διαφορετικό κείμενο στο επόμενο κεφάλαιο.'];
const chapters=[{id:'chapter-new',pages:[[{text:blocks[1],_pdlAnchor:{index:0,offset:0}}]]},{id:'chapter-old',pages:[[{text:blocks[0],_pdlAnchor:{index:0,offset:0}}]]}];
const PDL_SOURCE=chapters.map(c=>({blocks:c.pages[0]}));
const storage=new Map();
const localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v))};
const ctx={chapters,PDL_SOURCE,localStorage,BM_KEY:'test-bookmarks',currentChapter:1,currentPage:0,console};
vm.createContext(ctx);vm.runInContext(js,ctx);
const bm=(x)=>JSON.parse(JSON.stringify(x));
// New bookmark follows chapter ID rather than the stale numeric index.
localStorage.setItem('test-bookmarks',JSON.stringify([{chapterId:'chapter-old',ch:0,pg:0,snippet:'old'}]));
assert.equal(ctx.loadBookmarks()[0].ch,1);
// Pre-ID bookmark after reorder resolves only from a UNIQUE text excerpt.
localStorage.setItem('test-bookmarks',JSON.stringify([{ch:0,pg:0,snippet:'Ξεκινά εδώ το παλιό κεφάλαιο με μία ιδιαίτερη φράση'}]));
const migrated=ctx.loadBookmarks()[0];assert.equal(migrated.ch,1);assert.equal(migrated.chapterId,'chapter-old');
assert.equal(JSON.parse(localStorage.getItem('test-bookmarks'))[0].chapterId,'chapter-old');
// An ambiguous legacy bookmark remains intact and cannot silently jump to the wrong text.
localStorage.setItem('test-bookmarks',JSON.stringify([{ch:0,pg:0,snippet:'Μη αναγνωρίσιμη ιστορική θέση'}]));
assert.equal(ctx.loadBookmarks()[0].unresolved,true);
assert.equal(JSON.parse(localStorage.getItem('test-bookmarks'))[0].chapterId,undefined);
// If chapter deleted, existing bookmark must not be redirected elsewhere.
localStorage.setItem('test-bookmarks',JSON.stringify([{chapterId:'deleted-chapter',ch:0,pg:0,snippet:'deleted'}]));
assert.equal(ctx.loadBookmarks()[0].unresolved,true);
console.log('PASS chapter IDs reach reader; new, legacy, missing and reordered bookmarks');
