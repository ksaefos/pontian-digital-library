import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {publicDataset} from '../scripts/build-public.mjs';
import {readerSource,root} from '../scripts/reader-source.mjs';
const original=readFileSync(path.join(root,'library-data.json'),'utf8'),data=JSON.parse(original),snapshot=JSON.stringify(data);
const {catalog,files}=publicDataset(data);assert.equal(JSON.stringify(data),snapshot);
const metadataBudget=2048+data.books.length*1024+data.books.reduce((n,b)=>n+b.chapters.length,0)*128;
assert.ok(Buffer.byteLength(JSON.stringify(catalog))<metadataBudget,'Catalog must remain proportional to metadata, not book text');
assert.equal(catalog.books.length,data.books.length);
for(let i=0;i<data.books.length;i++){
 const actual=data.books[i],meta=catalog.books[i],book=JSON.parse(files.get(meta.url.slice(2)));
 assert.ok(meta.chapters.every(c=>!('text'in c)&&!('richHtml'in c)));
 assert.deepEqual({...book,cover:actual.cover},actual,'Every chapter, ID, editorial field and unknown metadata must survive');
 assert.deepEqual(meta.chapters,actual.chapters.map(({id,title})=>({id,title})));
 if(actual.cover){const content=files.get(meta.cover.slice(2));assert.ok(content.equals(Buffer.from(actual.cover.split(',')[1],'base64')));}
}
const glossary=JSON.parse(files.get(catalog.glossary.slice(2)));
assert.deepEqual(glossary,data.entries.map(({term,definition,etymology})=>({term,definition,...(etymology?{etymology}:{})})));
assert.ok(glossary.every(e=>!('references'in e)&&!('sources'in e)),'Global lookup must not depend on Studio provenance');
const html=readFileSync(path.join(root,'dist/index.html'),'utf8');assert.ok(Buffer.byteLength(html)<40000);
assert.ok(!html.includes('pdl-reader-shell')&&!html.includes('data:font'));
assert.equal([...html.matchAll(/<script[^>]+src="/g)].length,1,'Catalog code must load in one request');
for(const match of html.matchAll(/<script[^>]+src="\.\/(catalog\/[^"]+)"/g)){assert.match(match[1],/\.[a-f0-9]{20}\.js$/);assert.ok(readFileSync(path.join(root,'dist',match[1])).length);}
const config=JSON.parse(html.match(/<script id="pdl-runtime-config" type="application\/json">([\s\S]*?)<\/script>/)[1]);
assert.equal(readFileSync(path.join(root,'dist',config.template.slice(2)),'utf8'),readerSource());
assert.ok(!readerSource().includes('data:font'));
for(const asset of config.readerAssets)assert.ok(readFileSync(path.join(root,'dist',asset.slice(2))).length);
console.log(JSON.stringify({result:'PASS',canonicalDataUnchanged:true,allBooksIdsTextAndGlossaryPreserved:true,indexBytes:Buffer.byteLength(html),catalogBytes:Buffer.byteLength(JSON.stringify(catalog)),readerBytes:Buffer.byteLength(readerSource()),books:catalog.books.length,glossary:glossary.length}));
const updated=structuredClone(data);updated.books[0].chapters[0].text+='\nΔοκιμή ενημέρωσης';updated.entries[0].definition+=' δοκιμή';
const next=publicDataset(updated);
assert.notEqual(next.catalog.books[0].url,catalog.books[0].url);assert.notEqual(next.catalog.glossary,catalog.glossary);
assert.equal(next.catalog.books[1].url,catalog.books[1].url,'Unchanged books retain their cacheable URL');
assert.equal(next.catalog.books[0].id,catalog.books[0].id);
console.log('PASS data-only publication regenerates changed shards while preserving IDs and unchanged asset hashes');

const legacy=publicDataset({books:[{id:'old-book',title:'Παλιό',chapters:[{text:'Πολυτονικό ὰ τ͜σ'}]}],entries:[]});
assert.deepEqual(legacy.catalog.books[0].chapters,[{id:'legacy-0',title:'Κεφάλαιο 1'}]);
assert.deepEqual(JSON.parse(legacy.files.get(legacy.catalog.books[0].url.slice(2))).chapters,[{text:'Πολυτονικό ὰ τ͜σ'}]);
console.log('PASS legacy chapter metadata uses the existing Reader fallback without rewriting original chapter data');
