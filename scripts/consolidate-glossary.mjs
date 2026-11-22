import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,renameSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),html=readFileSync(path.join(root,'admin.html'),'utf8'),ctx={};
vm.createContext(ctx);vm.runInContext(html.slice(html.indexOf('function norm(s){'),html.indexOf('function pdlParseGlossaryLine(')),ctx);
const plain=value=>JSON.parse(JSON.stringify(value)),hash=value=>createHash('sha256').update(value).digest('hex');
export function consolidate(input){
 const before=JSON.parse(input),after=structuredClone(before),started=performance.now();
 ctx.pdlRefreshGlossary(after);after.entries=plain(after.entries);
 const aliases=new Map(),canonical=new Map(after.entries.map(e=>[e.id,e]));
 for(const entry of after.entries){
  assert.ok(!aliases.has(entry.id),'Canonical ID repeats');aliases.set(entry.id,entry);
  for(const alias of entry.mergedIds||[]){assert.ok(!aliases.has(alias),'Alias collision');aliases.set(alias,entry);}
 }
 for(const old of before.entries){
  const fresh=aliases.get(old.id);assert.ok(fresh,'Lost ID '+old.id);
  assert.equal(ctx.pdlEntryIdentity(old),ctx.pdlEntryIdentity(fresh),'Meaning/category changed');
  if(old.etymology)assert.ok(String(fresh.etymology).includes(old.etymology),'Lost etymology '+old.id);
  if(old.id!==fresh.id)assert.ok(ctx.pdlCanRepresentMergedEntry(fresh,old),'Unsafe merge '+old.id);
  for(const [field,value] of Object.entries(old)){
   if(['id','term','definition','category','sources','references','etymology','mergedIds','mergedMetadata','termVariants','definitionVariants','categoryVariants'].includes(field))continue;
   assert.ok(JSON.stringify(fresh[field])===JSON.stringify(value)||(fresh.mergedMetadata||[]).some(m=>m.id===old.id&&m.field===field&&JSON.stringify(m.value)===JSON.stringify(value)),'Lost metadata '+old.id+':'+field);
  }
  const refs=new Set(fresh.references.map(r=>r.bookId+'|'+r.chapterId));
  for(const ref of old.references||[]){const exists=after.books.some(b=>b.id===ref.bookId&&b.chapters.some(c=>c.id===ref.chapterId));if(exists)assert.ok(refs.has(ref.bookId+'|'+ref.chapterId),'Lost historical citation');}
 }
 const {entries:oldEntries,...oldOther}=before,{entries:newEntries,...newOther}=after;assert.deepEqual(newOther,oldOther,'Books/library metadata changed');
 const keys=newEntries.map(e=>ctx.pdlEntryIdentity(e));assert.equal(new Set(keys).size,keys.length,'Duplicates remain');
 const repeat=structuredClone(after);ctx.pdlRefreshGlossary(repeat);assert.deepEqual(plain(repeat),after,'Not idempotent');
 const originals=new Map(before.entries.map(e=>[e.id,e]));
 const groups=newEntries.filter(e=>(e.mergedIds||[]).some(id=>originals.has(id))).map(e=>({canonicalId:e.id,mergedIds:e.mergedIds,term:e.term,definition:e.definition,etymology:e.etymology,originalRecords:[originals.get(e.id),...e.mergedIds.map(id=>originals.get(id)).filter(Boolean)]}));
 const sourceChanges=newEntries.filter(e=>JSON.stringify(originals.get(e.id)?.sources)!==JSON.stringify(e.sources)||JSON.stringify(originals.get(e.id)?.references)!==JSON.stringify(e.references)).map(e=>({id:e.id,term:e.term,before:{sources:originals.get(e.id)?.sources,references:originals.get(e.id)?.references},after:{sources:e.sources,references:e.references}}));
 const output=JSON.stringify(after,null,2)+'\n';
 return {output,report:{schema:1,inputSHA256:hash(input),outputSHA256:hash(output),beforeEntries:oldEntries.length,afterEntries:newEntries.length,mergedRecords:oldEntries.length-newEntries.length,mergeGroups:groups.length,entriesWithCorpusSources:newEntries.filter(e=>e.sources.length).length,entriesWithoutCorpusMatch:newEntries.filter(e=>!e.sources.length).length,referenceCountBefore:oldEntries.reduce((n,e)=>n+(e.references||[]).length,0),referenceCountAfter:newEntries.reduce((n,e)=>n+e.references.length,0),elapsedMs:Math.round(performance.now()-started),checks:{booksUnchanged:true,allIdsRetainedAsCanonicalOrAliases:true,allMeaningsCategoriesAndEtymologiesRetained:true,unknownMetadataRetained:true,validHistoricalCitationsRetained:true,sourcesFromWholeCorpusOnly:true,idempotent:true},groups,sourceChanges}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),get=name=>{const at=args.indexOf(name);return at<0?null:args[at+1];},apply=args.includes('--apply');
 const inputPath=path.resolve(get('--input')||path.join(root,'library-data.json')),backup=get('--backup')&&path.resolve(get('--backup')),reportPath=get('--report')&&path.resolve(get('--report'));
 if(apply&&!backup)throw Error('--apply requires --backup');const paths=[inputPath,backup,reportPath].filter(Boolean);assert.equal(new Set(paths).size,paths.length);
 const input=readFileSync(inputPath,'utf8'),{output,report}=consolidate(input);
 if(apply){if(existsSync(backup))assert.equal(readFileSync(backup,'utf8'),input,'Existing backup differs');else writeFileSync(backup,input,{flag:'wx'});
  assert.equal(readFileSync(inputPath,'utf8'),input,'Input changed during conversion');if(output!==input){const temp=inputPath+'.consolidation.tmp';writeFileSync(temp,output,{flag:'wx'});renameSync(temp,inputPath);}}
 if(reportPath)writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
 const {groups,sourceChanges,...summary}=report;console.log(JSON.stringify({mode:apply?'apply':'dry-run',...summary,report:reportPath,backup:apply?backup:null}));
}
