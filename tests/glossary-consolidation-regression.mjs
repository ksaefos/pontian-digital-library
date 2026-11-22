import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {spawnSync} from 'node:child_process';
import {consolidate} from '../scripts/consolidate-glossary.mjs';
const html=readFileSync(new URL('../admin.html',import.meta.url),'utf8'),ctx={};vm.createContext(ctx);
vm.runInContext(html.slice(html.indexOf('function norm(s){'),html.indexOf('function pdlParseGlossaryLine(')),ctx);
const plain=v=>JSON.parse(JSON.stringify(v));
const fixture={books:[
 {id:'b1',title:'Πρώτο',chapters:[{id:'c1',text:'Η λέξη κι είναι εδώ. Η λέξη επαναλαμβάνεται. κι κ̆ι τ͜σ.'},{id:'c2',text:'μόνο παραλέξη'}]},
 {id:'b2',title:'Δεύτερο',chapters:[{id:'c3',text:'ΛΕΞΗ· αγιάζ\' τσ. ὰμα και άμα.'}]}],entries:[
 {id:'a',term:'λέξη',definition:'έννοια',category:'word',etymology:'ρίζα Α',sources:['Song_1234'],references:[{bookId:'b1',chapterId:'c2'}],privateNote:'keep'},
 {id:'b',term:'λέξη',definition:'έννοια',category:'word',etymology:'ρίζα Β',sources:['another.txt'],references:[],privateNote:'other'},
 {id:'c',term:'λέξη',definition:'διαφορετική σημασία',category:'word',sources:[],references:[]},
 {id:'d',term:'κι',definition:'απλό',category:'word',sources:[]},{id:'e',term:'κ̆ι',definition:'ποντιακό',category:'word',sources:[]},
 {id:'f',term:'τ͜σ',definition:'σύνδεση',category:'word',sources:[]},{id:'g',term:'τσ',definition:'άλλο',category:'word',sources:[]},
 {id:'h',term:'αγιάζ’',definition:'παγωνιά',category:'word',sources:[]},
 {id:'i',term:'δενυπάρχει',definition:'απουσία',category:'word',sources:['fakefile'],references:[]}]};
const original=JSON.stringify(fixture),{output,report}=consolidate(original),after=JSON.parse(output),a=after.entries.find(e=>e.id==='a');
assert.equal(after.entries.length,8);assert.deepEqual(a.mergedIds,['b']);assert.equal(a.etymology,'ρίζα Α · ρίζα Β');
assert.deepEqual(a.sources,['Πρώτο §1','Δεύτερο §1'],'Index must search all books independent of filename or old sources');
assert.ok(a.references.some(r=>r.chapterId==='c2'),'Keep historical citations without inventing a textual match');
assert.ok(!a.sources.some(s=>s.includes('§2')),'Historical citation without an occurrence must not be reported as an automatically found source');
assert.equal(a.privateNote,'keep');assert.deepEqual(a.mergedMetadata,[{id:'b',field:'privateNote',value:'other'}]);
assert.ok(after.entries.some(e=>e.id==='c'),'Distinct meanings remain separate');
assert.deepEqual(after.entries.find(e=>e.id==='i').sources,[],'No occurrence must never generate a source');
assert.deepEqual(after.entries.find(e=>e.id==='e').sources,['Πρώτο §1'],'Pontic mark must distinguish its own occurrence');
assert.deepEqual(after.entries.find(e=>e.id==='g').sources,['Δεύτερο §1'],'Do not strip the Pontic tie mark');
assert.deepEqual(after.entries.find(e=>e.id==='h').sources,['Δεύτερο §1'],'Recognize authored apostrophe variants');
const categories=plain(ctx.pdlConsolidateEntries([{id:'cat-a',term:'χαΐρ-χαπέρ’',definition:'τι νέα;',category:'expression'},{id:'cat-b',term:'χαΐρ-χαπέρ’',definition:'τι νέα;',category:'word'}]));
assert.equal(categories.length,1);assert.equal(categories[0].category,'expression');assert.deepEqual(categories[0].categoryVariants,['word']);
assert.ok(ctx.pdlCanRepresentMergedEntry(categories[0],{id:'cat-b',term:'χαΐρ-χαπέρ’',definition:'τι νέα;',category:'word'}));
assert.equal(consolidate(output).output,output,'Second conversion must preserve bytes');
assert.equal(JSON.stringify(fixture),original);assert.equal(report.mergedRecords,1);
assert.ok(ctx.pdlCanRepresentMergedEntry(a,fixture.entries[1]));
for(const fake of [{...a,definition:'άλλη'},{...a,category:'place'},{...a,etymology:'ρίζα Α'},{...a,mergedIds:[]},{...a,mergedMetadata:[]}])assert.equal(ctx.pdlCanRepresentMergedEntry(fake,fixture.entries[1]),false,'Publisher must reject a lossy or fabricated alias');
const terms=['κι','κ̆ι','τ͜σ','τσ','λέξη','λέξη κι','αγιάζ’'].map(ctx.pdlCitationKey),chapters=fixture.books.flatMap(b=>b.chapters.map(ch=>({...ch,text:ctx.pdlCitationKey(ch.text)})));
const trie=ctx.pdlCorpusMatches(terms,chapters);
for(const term of terms)assert.deepEqual(plain(trie.get(term).map(ch=>ch.id)),chapters.filter(ch=>ctx.pdlCitationContains(ch.text,term)).map(ch=>ch.id),'Trie must match the independent boundary matcher');
assert.equal(ctx.pdlCitationKey('κουρφίζει͜ ατο'),ctx.pdlCitationKey('κουρφίζει ατο'),'Inter-word U+035C must not hide a headword');
assert.equal(ctx.pdlCitationKey('γομαρι͜άζει͜ ατα'),ctx.pdlCitationKey('γομαρι͜άζει ατα'),'Only the final synizesis mark is ignored');
assert.notEqual(ctx.pdlCitationKey('γομαρι͜άζει'),ctx.pdlCitationKey('γομαριάζει'),'The internal tie remains significant');
assert.notEqual(ctx.pdlCitationKey('τ͜σ'),ctx.pdlCitationKey('τσ'));
assert.equal(ctx.pdlCitationContains(ctx.pdlCitationKey('κουρφίζει͜ ατο'),ctx.pdlCitationKey('κουρφίζει')),true);
assert.equal(ctx.pdlCitationContains(ctx.pdlCitationKey('κουρφίζει͜ατο'),ctx.pdlCitationKey('κουρφίζει')),false,'Without a word boundary, do not invent a separate word');
assert.equal(ctx.pdlCitationContains(ctx.pdlCitationKey('κ̆ι'),ctx.pdlCitationKey('κι')),false);
assert.equal(ctx.pdlCitationContains(ctx.pdlCitationKey('τ͜σ'),ctx.pdlCitationKey('τσ')),false);
assert.equal(ctx.pdlCitationContains(ctx.pdlCitationKey('παραλέξη'),ctx.pdlCitationKey('λέξη')),false);
const folder=mkdtempSync(path.join(tmpdir(),'pdl-consolidate-'));try{
 const input=path.join(folder,'input.json'),backup=path.join(folder,'backup.json'),audit=path.join(folder,'report.json');writeFileSync(input,original);
 const run=(...args)=>spawnSync(process.execPath,['scripts/consolidate-glossary.mjs','--input',input,...args],{encoding:'utf8'});
 assert.equal(run('--report',audit).status,0);assert.equal(readFileSync(input,'utf8'),original);
 assert.notEqual(run('--apply').status,0);assert.equal(run('--apply','--backup',backup,'--report',audit).status,0);
 assert.equal(readFileSync(backup,'utf8'),original);assert.equal(readFileSync(input,'utf8'),output);
 assert.notEqual(run('--apply','--backup',backup).status,0,'Backup cannot be overwritten');
}finally{rmSync(folder,{recursive:true,force:true});}
console.log('PASS real glossary consolidation, preserved aliases/metadata/etymologies, protected publisher aliases, whole-corpus sources, unmatched entries, word/grapheme boundaries, trie oracle, dry run/backup and idempotence');
