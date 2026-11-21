import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
const root=path.resolve(import.meta.dirname,'..'),html=readFileSync(path.join(root,'admin.html'),'utf8');
const first=html.slice(html.indexOf('function norm(s){'),html.indexOf('function activeBook(){'));
const references=html.slice(html.indexOf('function preserveReferences('),html.indexOf('function updateGlossaryReferences('));
const direct=html.slice(html.indexOf('function parseGlossaryTxt('),html.indexOf('async function importGlossaryFiles('));
let serial=0;
const ctx={state:{entries:[]},uid:()=>`new-${++serial}`};
vm.createContext(ctx);vm.runInContext(first+references+direct+';globalThis.api={pdlSplitHeadwordEtymology,pdlParseGlossaryLine,pdlLexLine,parseTxt,parseGlossaryTxt,mergeEntries,pdlMergeEtymology};',ctx);
const api=ctx.api,plain=v=>JSON.parse(JSON.stringify(v));
const samples=[
 ['ακαΐρευτα (τουρκ. kayırmak): απροστάτευτα, χωρίς υποστήριξη','ακαΐρευτα','τουρκ. kayırmak','απροστάτευτα, χωρίς υποστήριξη'],
 ['ὰμα (τουρκ./αραβ. ama/ammā): αλλά','ὰμα','τουρκ./αραβ. ama/ammā','αλλά'],
 ['απίδι͜α (αρχ.ελλ. ἄπιον): αχλάδια','απίδι͜α','αρχ.ελλ. ἄπιον','αχλάδια'],
 ['μανουσ̌άκια (αρμεν./περσ. մանուշակ (manušak)<manafšak): μενεξέδες','μανουσ̌άκια','αρμεν./περσ. մանուշակ (manušak)<manafšak','μενεξέδες'],
 ['σαλαχανεύ’ (τουρκ./αραβ./περσ. τουρκ. salahana < salhane < αραβ.-περσ. selh-hâne, «salhane köpekleri: όπως τα σκυλιά»): τεμπελιάζει','σαλαχανεύ’','τουρκ./αραβ./περσ. τουρκ. salahana < salhane < αραβ.-περσ. selh-hâne, «salhane köpekleri: όπως τα σκυλιά»','τεμπελιάζει'],
 ['τεγμέ ( αγν. ετυμολ.): χάρισμα','τεγμέ','αγν. ετυμολ.','χάρισμα'],
 ['λέξη (πληθ.) (ρωσ. корень)： σημασία: με δεύτερη άνω-κάτω τελεία','λέξη (πληθ.)','ρωσ. корень','σημασία: με δεύτερη άνω-κάτω τελεία'],
 ['ας σα ( ασό σα (από τα)): απ’ τα','ας σα ( ασό σα (από τα))','','απ’ τα'],
 ['καλαμάρ’ ( κάλαμος): μελανοδοχείο','καλαμάρ’ ( κάλαμος)','','μελανοδοχείο'],
 ['λέξεις (πληθ.): σημασία','λέξεις (πληθ.)','','σημασία'],
 ['λέξη (τουρκ. kök: σημασία','λέξη (τουρκ. kök','','σημασία'],
 ['λέξη (τουρκ. kök) επιπλέον: σημασία','λέξη (τουρκ. kök) επιπλέον','','σημασία']
];
for(const [line,term,etymology,definition] of samples){
 const direct=api.parseGlossaryTxt('\uFEFF'+line+'\r\n','Song_6002.txt');
 assert.equal(direct.ignored.length,0);assert.equal(direct.entries.length,1);
 const e=direct.entries[0];assert.equal(e.term,term);assert.equal(e.etymology||'',etymology);assert.equal(e.definition,definition);
 assert.deepEqual(plain(e.sources),['Song_6002']);
 const structured=api.pdlLexLine(line,'word','Βιβλίο');
 assert.ok(structured,'Etymology length must not disqualify a real headword');
 assert.equal(structured.term,term);assert.equal(structured.etymology||'',etymology);assert.equal(structured.definition,definition);
}
const narrative='Παράγραφος με πολυτονικά: τ͜σ, ὰ, ἅμα.\n\nΤο πρωτότυπο διατηρείται.';
const structured=api.parseTxt('=== ΤΙΤΛΟΣ ===\nΒιβλίο\n=== ΚΕΦΑΛΑΙΟ 1 ===\n'+narrative+'\n=== ΓΛΩΣΣΑΡΙ ===\n'+samples[0][0]+'\n'+samples[4][0],'Book.txt');
assert.equal(structured.book.chapters[0].text,narrative);assert.equal(structured.entries.length,2);assert.equal(structured.entries[1].etymology,samples[4][2]);
const implicit=api.parseTxt(narrative+'\n\n'+samples.slice(0,8).map(s=>s[0]).join('\n'),'Book.txt');
assert.equal(implicit.glossaryMode,'implicit');assert.equal(implicit.book.chapters[0].text,narrative);assert.equal(implicit.entries.length,8);
// Reimport upgrades only the matched draft row and preserves its immutable ID,
// citations, sources, private metadata, meanings and an existing etymology.
const legacy={id:'stable',term:'ὰμα (τουρκ./αραβ. ama/ammā)',definition:'αλλά',category:'word',etymology:'άλλη τεκμηρίωση',sources:['Παλιά πηγή'],references:[{bookId:'b',chapterId:'c'}],privateNote:'keep'};
ctx.state={entries:[structuredClone(legacy)]};
const parsed=api.parseGlossaryTxt(samples[1][0],'Song_6002.txt').entries;
assert.equal(api.mergeEntries(parsed).added,0);assert.equal(ctx.state.entries.length,1);
const e=ctx.state.entries[0];assert.equal(e.id,'stable');assert.equal(e.term,'ὰμα');assert.equal(e.definition,'αλλά');assert.equal(e.privateNote,'keep');
assert.deepEqual(plain(e.references),legacy.references);assert.deepEqual(plain(e.sources),['Παλιά πηγή','Song_6002']);
assert.ok(e.etymology.includes('άλλη τεκμηρίωση'));assert.ok(e.etymology.includes('τουρκ./αραβ. ama/ammā'));
const snapshot=JSON.stringify(ctx.state);assert.equal(api.mergeEntries(parsed).added,0);assert.equal(JSON.stringify(ctx.state),snapshot,'Repeated import must be idempotent');
assert.equal(api.pdlMergeEtymology('τουρκ. ama < αραβ. ammā','τουρκ./αραβ. ama/ammā'),'τουρκ. ama < αραβ. ammā');
ctx.state={entries:[]};assert.equal(api.mergeEntries(api.parseGlossaryTxt(samples[0][0]+'\nακαΐρευτα (τουρκ. kayırmak): άλλη σημασία','s.txt').entries).added,2);
assert.equal(ctx.state.entries.length,2,'Distinct meanings must not be discarded');
const footer=api.parseGlossaryTxt(samples[0][0]+'\n#Η_Σωνίτσα #Συγγραφέας\nhttp://example.org/source.html','s.txt');assert.equal(footer.entries.length,1);assert.deepEqual(plain(footer.ignored),[2,3]);
console.log('PASS TXT etymology: nested chains, inner colons, Unicode, usage notes, both import routes, preserved narrative, legacy IDs and idempotent merge');
if(process.argv[2]){
 const file=process.argv[2],raw=readFileSync(file,'utf8'),result=api.parseGlossaryTxt(raw,path.basename(file));
 const etymologies=result.entries.filter(e=>e.etymology);
 const untouched=result.entries.filter(e=>e.term.includes('('));
 const unexpected=result.ignored.filter(n=>!/^\s*(?:(?:#[^\s#]+\s*)+|https?:\/\/\S+)\s*$/iu.test(raw.split(/\r?\n/)[n-1]));
 assert.equal(unexpected.length,0,'Actual glossary lines must all be recognized: '+JSON.stringify(unexpected));
 ctx.state={entries:[]};const first=api.mergeEntries(result.entries),state=JSON.stringify(ctx.state);const again=api.mergeEntries(result.entries);
 assert.equal(again.added,0);assert.equal(JSON.stringify(ctx.state),state);assert.equal(readFileSync(file,'utf8'),raw);
 for(const source of result.entries){
  const stored=ctx.state.entries.find(e=>e.term===source.term&&e.definition===source.definition);
  assert.ok(stored,'Original headword/definition changed: '+source.term);
  if(source.etymology)assert.equal(stored.etymology,source.etymology,'Original chain changed: '+source.term);
 }

 console.log(JSON.stringify({file:path.basename(file),lines:raw.split(/\r?\n/).filter(s=>s.trim()).length,entries:result.entries.length,etymologies:etymologies.length,ignored:result.ignored.length,keptParentheticalHeadwords:untouched.map(e=>e.term),uniqueEntries:first.added,reimportAdded:again.added,inputUnchanged:true}));
}
