import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {convert} from '../scripts/migrate-glossary-parentheses.mjs';
const folder=mkdtempSync(path.join(tmpdir(),'pdl-migration-'));
try{
 const input=path.join(folder,'input.json'),backup=path.join(folder,'backup.json'),report=path.join(folder,'report.json');
 const original=JSON.stringify({books:[{id:'b',chapters:[{id:'c',text:'ὰ τ͜σ ἅμα'}]}],entries:[
 {id:'a',term:'ας σα (ασό σα (από τα))',definition:'απ’ τα',category:'word',sources:['πηγή'],references:[{bookId:'b',chapterId:'c'}],custom:'keep'},
 {id:'b',term:'ὰμα (τουρκ. ama)',definition:'αλλά',etymology:'παλιά τεκμηρίωση',category:'word'},
 {id:'c',term:'ὰμα (τουρκ. ama)',definition:'άλλη σημασία',category:'word'},
 {id:'d',term:'λέξη (πληθ.) (ρωσ. корень)',definition:'έννοια',category:'word'}]});
 writeFileSync(input,original);
 const run=(...args)=>spawnSync(process.execPath,['scripts/migrate-glossary-parentheses.mjs','--input',input,...args],{encoding:'utf8'});
 assert.equal(run('--report',report).status,0);assert.equal(readFileSync(input,'utf8'),original,'Dry run wrote input');
 assert.notEqual(run('--apply').status,0,'Apply must require a backup');assert.equal(readFileSync(input,'utf8'),original);
 assert.equal(run('--apply','--backup',backup,'--report',report).status,0);
 assert.equal(readFileSync(backup,'utf8'),original);
 const converted=readFileSync(input,'utf8'),data=JSON.parse(converted);
 assert.equal(data.entries.length,4);assert.equal(data.entries[0].definition,'(ασό σα (από τα)) — απ’ τα');
 assert.equal(data.entries[1].etymology,'παλιά τεκμηρίωση · τουρκ. ama');
 assert.equal(data.entries[3].definition,'(πληθ.) — έννοια');
 assert.equal(convert(converted).output,converted,'Second pass must leave bytes unchanged');
 assert.equal(JSON.parse(readFileSync(report,'utf8')).changed,4);
 assert.notEqual(run('--apply','--backup',backup).status,0,'Different existing backup must never be overwritten');
 assert.equal(readFileSync(input,'utf8'),converted);assert.equal(readFileSync(backup,'utf8'),original);
 const malformed=JSON.stringify({entries:[{id:'bad',term:'λέξη (ρίζα',definition:'έννοια'}]});
 assert.throws(()=>convert(malformed),/unmatched-open/);
 console.log('PASS bulk glossary migration: dry run, mandatory immutable backup, Unicode, distinct meanings/IDs, exact original definitions, metadata, idempotence and malformed-input rejection');
}finally{rmSync(folder,{recursive:true,force:true});}
