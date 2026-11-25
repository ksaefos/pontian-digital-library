
const glossary = PDL_IMPORTED_GLOSSARY;

// ── GLOSSARY LOOKUP ──
function stripCombining(s) {
  return s.normalize('NFD').replace(/\p{Mn}/gu, '');
}

function pdlKey(s){return String(s||'').normalize('NFC').replace(/[’‘ʼ`΄´]/g,"'").replace(/[\u00ad\u200b-\u200d\u2060]/g,'').toLocaleLowerCase('el-GR').trim();}
function pdlLooseKey(s){return pdlKey(s).normalize('NFD').replace(/\p{M}/gu,'').replace(/ς/g,'σ').replace(/'/g,'');}
let pdlDictionaryIndex=null;
function pdlBuildDictionary(){
 const exact=new Map(),loose=new Map(),seen=new Set();
 for(const [key,entry] of Object.entries(glossary)){
  if(!entry)continue;
  const term=String(entry.term||key).trim();
  const identity=term+'\u0000'+String(entry.def||entry.definition||'')+'\u0000'+String(entry.etymology||'');
  if(seen.has(identity))continue;seen.add(identity);
  const keyExact=pdlKey(term),keyLoose=pdlLooseKey(term);
  if(!exact.has(keyExact))exact.set(keyExact,[]);
  exact.get(keyExact).push(entry);
  if(!loose.has(keyLoose))loose.set(keyLoose,[]);
  loose.get(keyLoose).push(entry);
 }
 pdlDictionaryIndex={exact,loose};
 return pdlDictionaryIndex;
}
function pdlCandidates(rawKey){
 if(!rawKey)return [];
 const idx=pdlDictionaryIndex||pdlBuildDictionary();
 const word=String(rawKey).trim();
 // Preserve a real leading/trailing apostrophe. Try punctuation-trimmed alternatives
 // only if the untrimmed form does not match an actual headword.
 const clean=word.replace(/^[^\p{L}\p{N}'’‘ʼ]+|[^\p{L}\p{N}'’‘ʼ]+$/gu,'');
 for(const k of [word,clean]){
  const v=idx.exact.get(pdlKey(k));if(v?.length)return v;
 }
 const bare=clean.replace(/^'+|'+$/g,'');
 const proposed=[...new Set([pdlLooseKey(clean),pdlLooseKey(bare)])];
 const found=new Map();
 for(const k of proposed)for(const e of idx.loose.get(k)||[])found.set(e.term+'\u0000'+e.def+'\u0000'+(e.etymology||''),e);
 return [...found.values()];
}
function lookupGloss(key){const options=pdlCandidates(key);return options.length===1?options[0]:null;}

// Search is deliberately diacritic-insensitive. Exact forms are still preferred
// for double-click lookups, where Pontic diacritics distinguish real headwords.
let pdlGlossarySearchRows = null;
function pdlPrepareGlossarySearch(){
 if(pdlGlossarySearchRows)return pdlGlossarySearchRows;
 const rows=[],seen=new Set();
 for(const [key,v] of Object.entries(glossary)){
  if(!v)continue;
  const unique=String(v.term||key)+'\0'+String(v.def||'')+'\0'+String(v.etymology||'');
  if(seen.has(unique))continue;
  seen.add(unique);
  const exact=[v.term||key,key,v.def||'',v.etymology||''].map(pdlKey).join(' ');
  rows.push({entry:v,exact,loose:pdlLooseKey(exact)});
 }
 return pdlGlossarySearchRows=rows;
}
function searchGlossary(rawQuery){
 const el=document.getElementById('glossary-content');if(!el)return;
 const strict=pdlKey(rawQuery),loose=pdlLooseKey(rawQuery);
 if(!strict){const p=document.createElement('p');p.className='glossary-empty';p.textContent='Διπλό κλικ σε λέξη για αναζήτηση στο γλωσσάρι.';el.replaceChildren(p);return;}
 el.replaceChildren();
 const results=pdlPrepareGlossarySearch().filter(row=>row.exact.includes(strict)||(loose&&row.loose.includes(loose)));
 // Exact-spelling matches first, followed by the wider diacritic-insensitive matches.
 results.sort((a,b)=>Number(b.exact.includes(strict))-Number(a.exact.includes(strict)));
 for(const {entry:v} of results.slice(0,30)){
  const card=document.createElement('div');card.className='gloss-entry';
  const h=document.createElement('div');h.className='gloss-term';h.textContent=v.term;
  const d=document.createElement('div');d.className='gloss-def';d.textContent=v.def;
  const et=document.createElement('div');et.className='gloss-etymology';et.textContent=v.etymology?'Ετυμολογία: '+v.etymology:'';
  card.append(h);if(v.etymology)card.append(et);card.append(d);el.append(card);
 }
 if(!results.length){const p=document.createElement('p');p.className='glossary-empty';p.textContent='Δεν βρέθηκε αποτέλεσμα.';el.append(p);}
}

// ── CHAPTERS ──
function buildChapters(){return PDL_IMPORTED_CHAPTERS.map(c=>{const pages=[];for(let i=0;i<c.paragraphs.length;i+=5)pages.push(c.paragraphs.slice(i,i+5));return {id:c.id,number:c.title,pages:pages.length?pages:[[]]};});}

