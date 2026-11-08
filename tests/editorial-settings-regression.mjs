import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const index=readFileSync(resolve(root,'index.html'),'utf8');
const admin=readFileSync(resolve(root,'admin.html'),'utf8');
const books=JSON.parse(readFileSync(resolve(root,'library-data.json'),'utf8')).books;
const match=index.match(/<script id="pdl-reader-shell" type="application\/json">([\s\S]*?)<\/script>/);
assert.ok(match,'Missing embedded Reader shell');
const shell=JSON.parse(match[1]).template;
// Editorial settings must be published per book and keep safe defaults for older entries.
assert.ok(index.includes('const PDL_BOOK_EDITOR_SETTINGS = '),'Reader book settings are not injected');
assert.ok(index.includes('book.showChapterTitles===true') && index.includes('book.dropCap!==false'), 'Missing legacy-safe editorial defaults');
assert.ok(index.includes("['el-polyton','el-monoton'].includes(book.hyphenation)"),'Missing mode whitelist');
assert.ok(admin.includes('id="editShowChapterTitles"') && admin.includes('id="editDropCap"') && admin.includes('id="editHyphenation"'),'Studio controls missing');
for(const key of ['b.showChapterTitles=','b.dropCap=','b.hyphenation='])assert.ok(admin.includes(key),'Studio must persist '+key);
assert.ok(shell.includes("let selected=PDL_BOOK_EDITOR_SETTINGS.hyphenation"),'Reader should consume the published hyphenation mode');
assert.ok(!shell.includes("localStorage.getItem('pdlHyphenation')"),'Public reader must not override the editor mode');
assert.ok(!shell.includes('id="pdl-hyphen-select"'),'Public hyphenation menu must be removed');
// Chapter headings should be conditional in all rendering paths, and drop caps must be measured too.
assert.ok(shell.includes('if(!PDL_BOOK_EDITOR_SETTINGS.showChapterTitles)return document.createDocumentFragment()'));
assert.ok(shell.includes('currentPage === 0 && PDL_BOOK_EDITOR_SETTINGS.showChapterTitles'));
assert.ok(shell.includes('pg===0&&PDL_BOOK_EDITOR_SETTINGS.showChapterTitles'));
assert.ok(shell.includes('measurer.append(pdlHeading(source))'));
assert.ok(shell.includes("node.classList.add('pdl-chapter-opening');openingNotAssigned=false"));
// Search panel follows the reader leaf and its mobile control belongs to the lower toolbar.
const start=shell.indexOf('<div id="text-viewport"'); // some layouts include a class before id
const viewport=shell.indexOf('id="text-viewport"');
const search=shell.indexOf('id="text-search-bar"');
const footer=shell.indexOf('id="pdl-mobile-bottom"');
assert.ok(viewport!==-1&&search>viewport&&footer>search,'Search must follow the reading surface and precede the bottom toolbar');
const button=shell.indexOf('id="pdl-mobile-search-action"');
assert.ok(button>footer,'Mobile search action must be in the bottom toolbar');
assert.ok(shell.includes('id="ts-clear"')&&shell.includes('function pdlClearSearchQuery()'));
assert.ok(shell.includes('id="pdl-v31-reader-editorial"'),'New reader layout stylesheet missing');
assert.equal(books.length,4,'Existing production book set must remain unchanged');
console.log('PASS v3.1 editorial settings, search dock, and drop caps');
