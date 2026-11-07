/**
 * Conservative one-shot repair for two independently reviewed glossary entries.
 * Usage: node scripts/repair-glossary-provenance.mjs [path/to/library-data.json]
 * Produces a timestamped backup before modifying the file.
 * Never fabricates a chapter: exact spelling-normalized appearance must be unique.
 */
import fs from 'node:fs';
import path from 'node:path';
const file=path.resolve(process.argv[2]||'library-data.json');
const original=fs.readFileSync(file,'utf8');
const db=JSON.parse(original);
const canon=s=>String(s||'').normalize('NFC').replace(/[’‘ʼ`΄´']/g,'’').toLocaleLowerCase('el').replace(/\s+/g,' ').trim();
const targets=[
 {word:'σαλαχανεύ’',book:'Η Σωνίτσα'},
 {word:'Αΐκον έν’ και λέγ’ν’ ατο τεπούρ’',book:'Αέρα σ’ μαναχόν κανείται'}
];
const reports=[];
let changes=0;
for(const spec of targets){
 const entry=db.entries.find(e=>canon(e.term)===canon(spec.word));
 if(!entry){reports.push(`${spec.word}: δεν υπάρχει σε αυτό το snapshot (χωρίς αλλαγή)`);continue;}
 const book=db.books.find(b=>canon(b.title)===canon(spec.book));
 if(!book){reports.push(`${spec.word}: δεν βρέθηκε μοναδικό βιβλίο (χωρίς αλλαγή)`);continue;}
 const occurrences=book.chapters.filter(c=>canon(c.text).includes(canon(spec.word)));
 if(occurrences.length!==1){reports.push(`${spec.word}: ${occurrences.length} ακριβείς αντιστοιχίες σε κεφάλαια (χειροκίνητος έλεγχος, χωρίς αλλαγή)`);continue;}
 const chapter=occurrences[0];
 const currentRefs=Array.isArray(entry.references)?entry.references:[];
 const refKey=book.id+'|'+chapter.id;
 const known=currentRefs.some(r=>r.bookId+'|'+r.chapterId===refKey);
 if(spec.word==='σαλαχανεύ’'){
   const source=entry.sources||[];
   if(!entry.etymology&&source.length===1&&!db.books.some(b=>canon(b.title)===canon(source[0]))){
    entry.etymology=source[0];entry.sources=[book.title];changes++;
   }
 }else{
   if(JSON.stringify(entry.sources)!==JSON.stringify([book.title])){entry.sources=[book.title];changes++;}
 }
 if(!known){entry.references=[...currentRefs,{bookId:book.id,chapterId:chapter.id}];changes++;}
 reports.push(`${spec.word}: ${book.title}, «${chapter.title}», chapterId=${chapter.id}`);
}
for(const msg of reports)console.log(msg);
if(changes){
 const stamp=new Date().toISOString().replace(/[:.]/g,'-');
 const backup=file+`.backup-${stamp}`;
 fs.writeFileSync(backup,original,'utf8');
 fs.writeFileSync(file,JSON.stringify(db,null,2)+'\n','utf8');
 console.log(`Ενημερώθηκαν ${changes} πεδία. Backup: ${backup}`);
}else console.log('Δεν έγιναν αλλαγές.');
