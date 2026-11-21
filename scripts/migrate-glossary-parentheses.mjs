import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,renameSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const html=readFileSync(path.join(root,'admin.html'),'utf8');
const ctx={};vm.createContext(ctx);
vm.runInContext(html.slice(html.indexOf('function norm(s){'),html.indexOf('// An etymological/usage annotation')),ctx);
const hash=text=>createHash('sha256').update(text).digest('hex');
const plain=value=>JSON.parse(JSON.stringify(value));
const protectedEntry=entry=>Object.fromEntries(Object.entries(entry).filter(([key])=>!['term','definition','etymology'].includes(key)));
export function convert(input){
 const data=JSON.parse(input),next=structuredClone(data),changes=[];
 assert.ok(Array.isArray(data.entries),'Expected glossary entries');
 next.entries=data.entries.map(entry=>{
  const annotation=ctx.pdlSplitHeadwordEtymology(entry.term,entry.etymology);
  const clean=plain(ctx.pdlNormalizeGlossaryEntry(entry));
  assert.deepEqual(protectedEntry(clean),protectedEntry(entry),'Protected metadata changed: '+entry.id);
  assert.ok(!/[()]/u.test(clean.term),'Parenthesis remains: '+entry.id);
  assert.ok(clean.definition.endsWith(String(entry.definition||'')),'Definition lost: '+entry.id);
  if(entry.etymology)assert.ok(clean.etymology.includes(entry.etymology),'Existing etymology lost: '+entry.id);
  for(const part of annotation.annotations){
   const destination=part.destination==='definition'?part.text:part.content;
   assert.ok(String(clean[part.destination]||'').includes(destination),'Annotation lost: '+entry.id);
  }
  assert.deepEqual(plain(ctx.pdlNormalizeGlossaryEntry(clean)),clean,'Conversion is not idempotent');
  if(JSON.stringify(clean)!==JSON.stringify(entry))changes.push({id:entry.id,before:{term:entry.term,definition:entry.definition,etymology:entry.etymology},after:{term:clean.term,definition:clean.definition,etymology:clean.etymology},annotations:plain(annotation.annotations)});
  return clean;
 });
 const {entries:beforeEntries,...beforeOther}=data,{entries:afterEntries,...afterOther}=next;
 assert.deepEqual(afterOther,beforeOther,'Books or library metadata changed');
 assert.deepEqual(afterEntries.map(e=>e.id),beforeEntries.map(e=>e.id),'Entry order or IDs changed');
 const output=changes.length?JSON.stringify(next,null,2)+'\n':input;
 return {output,report:{schema:1,inputSHA256:hash(input),outputSHA256:hash(output),entries:data.entries.length,changed:changes.length,etymologyAnnotations:changes.flatMap(c=>c.annotations).filter(a=>a.destination==='etymology').length,definitionAnnotations:changes.flatMap(c=>c.annotations).filter(a=>a.destination==='definition').length,checks:{booksAndLibraryMetadataPreserved:true,idsOrderAndEntryMetadataPreserved:true,definitionsAndExistingEtymologiesPreserved:true,allAnnotationsAccountedFor:true,noParenthesesInHeadwords:true,idempotent:true},changes}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),apply=args.includes('--apply');
 const option=name=>{const at=args.indexOf(name);return at<0?null:args[at+1];};
 const inputPath=path.resolve(option('--input')||path.join(root,'library-data.json'));
 const reportPath=option('--report')&&path.resolve(option('--report'));
 const backupPath=option('--backup')&&path.resolve(option('--backup'));
 if(apply&&!backupPath)throw Error('--apply requires --backup');
 const paths=[inputPath,reportPath,backupPath].filter(Boolean);assert.equal(new Set(paths).size,paths.length,'Input, report and backup paths must differ');
 const input=readFileSync(inputPath,'utf8'),{output,report}=convert(input);
 if(apply){
  if(existsSync(backupPath))assert.equal(readFileSync(backupPath,'utf8'),input,'Backup exists with different contents');
  else writeFileSync(backupPath,input,{flag:'wx'});
  assert.equal(readFileSync(inputPath,'utf8'),input,'Input changed during conversion');
  if(output!==input){const temporary=inputPath+'.parentheses.tmp';writeFileSync(temporary,output,{flag:'wx'});renameSync(temporary,inputPath);}
 }
 if(reportPath)writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
 const {changes,...summary}=report;console.log(JSON.stringify({mode:apply?'apply':'dry-run',...summary,report:reportPath,backup:apply?backupPath:null}));
}
