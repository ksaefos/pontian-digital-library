// ── ΑΝΑΖΗΤΗΣΗ ΕΝΤΟΣ ΚΕΙΜΕΝΟΥ ──

// Flat index of all paragraphs: [{ch, pg, type, text}, ...]
let textIndex = null;

function buildTextIndex() {
  textIndex = [];
  chapters.forEach((ch, ci) => {
    ch.pages.forEach((page, pi) => {
      page.forEach(para => {
        if (para.type !== 'divider' && para.type !== 'telos' && para.text) {
          // Strip HTML tags for searching
          const plain = para.text.replace(/<[^>]*>/g, '');
          textIndex.push({ ch: ci, pg: pi, type: para.type, text: plain });
        }
      });
    });
  });
}

let tsQuery = '';
let tsResults = []; // [{ch, pg, paraIdx (in page), matchStart, matchLen}, ...]
let tsCurrent = -1;

function onTextSearch(val) {
  // Normalize ASCII apostrophe U+0027 → right single quotation mark U+2019
  tsQuery = val.trim().replace(/'/g, '’');
  if (!tsQuery) { clearTextSearch(); return; }
  // On mobile: only update count, don't navigate (Enter/arrows do that)
  if (window.innerWidth <= 768) {
    runTextSearchCountOnly();
  } else {
    runTextSearch();
  }
}


// 1.3.14 Accent/diacritic-insensitive indexing with offsets mapped to original UTF-16 text.
// Punctuation and apostrophes are retained; only case and combining marks are ignored.
function pdlSearchMap(input){
 const origin=String(input); let folded='', starts=[], ends=[];
 for(let i=0;i<origin.length;){
  const code=origin.codePointAt(i), char=String.fromCodePoint(code), next=i+char.length;
  const transform=char.toLocaleLowerCase('el').normalize('NFD').replace(/\p{M}/gu,'');
  for(const cp of transform){folded+=cp;starts.push(i);ends.push(next);}
  // Combining marks following a letter extend the highlighted original range.
  if(!transform && ends.length)ends[ends.length-1]=next;
  i=next;
 }
 return {folded,starts,ends};
}
function pdlSearchOccurrences(text,query){
 const map=pdlSearchMap(text), needle=pdlSearchMap(query).folded;
 if(!needle)return [];
 const out=[];let at=0;
 while((at=map.folded.indexOf(needle,at))!==-1){
  const start=map.starts[at],end=map.ends[at+needle.length-1];
  if(start!==undefined&&end!==undefined)out.push({start,end});
  at+=Math.max(1,needle.length);
 }
 return out;
}
// Rendered paragraphs are the authoritative source: search positions must match visible text.
function pdlSearchPageText(ch,pg){
 const wrapper=document.createElement('div');wrapper.innerHTML=pdlPositionMarkup(ch,pg);
 return [...wrapper.querySelectorAll('p')].map(p=>p.textContent||'');
}
function pdlFindResults(){
 tsResults=[];
 const query=tsQuery;
 if(!pdlSearchMap(query).folded)return;
 for(let ci=0;ci<chapters.length;ci++)for(let pi=0;pi<chapters[ci].pages.length;pi++){
  const paragraphs=pdlSearchPageText(ci,pi);
  paragraphs.forEach((plain,paragraph)=>{
   pdlSearchOccurrences(plain,query).forEach(hit=>tsResults.push({ch:ci,pg:pi,paragraph,start:hit.start,end:hit.end}));
  });
 }
}
function pdlResetPageMarks(){
 const root=document.getElementById('page-content');if(!root)return;
 root.querySelectorAll('mark.text-hit').forEach(mark=>mark.replaceWith(document.createTextNode(mark.textContent)));
 root.normalize();
}
function pdlHighlightVisible(currentIdx){
 const root=document.getElementById('page-content');if(!root)return;
 pdlResetPageMarks();
 const pageHits=tsResults.map((result,i)=>({...result,resultIndex:i})).filter(hit=>hit.ch===currentChapter&&hit.pg===currentPage);
 const paragraphs=[...root.querySelectorAll('p')];
 paragraphs.forEach((p,paragraphIndex)=>{
  const hits=pageHits.filter(h=>h.paragraph===paragraphIndex);
  if(!hits.length)return;
  const walker=document.createTreeWalker(p,NodeFilter.SHOW_TEXT);
  const nodes=[];let node,at=0;
  while((node=walker.nextNode())){
   const value=node.nodeValue||''; const clean=value.split('\u00AD').join('').length; nodes.push({node,start:at,end:at+clean});at+=clean;
  }
  // Offsets from the search are counted without soft hyphens; map them back to raw node indices.
  const rawAt=(value,visible)=>{if(value.indexOf('\u00AD')<0)return visible;let c=0,i=0;for(;i<value.length;i++){if(c===visible)break;if(value.charCodeAt(i)!==0xAD)c++;}return i;};
  for(const part of nodes){
   const fragments=[];let cursor=part.start;const val=part.node.nodeValue;
   for(const hit of hits){
    const lo=Math.max(part.start,hit.start),hi=Math.min(part.end,hit.end);
    if(lo>=hi)continue;
    if(lo>cursor)fragments.push(document.createTextNode(val.slice(rawAt(val,cursor-part.start),rawAt(val,lo-part.start))));
    const mark=document.createElement('mark');mark.className='text-hit'+(hit.resultIndex===currentIdx?' current':'');mark.dataset.matchIdx=String(hit.resultIndex);
    mark.textContent=val.slice(rawAt(val,lo-part.start),rawAt(val,hi-part.start));fragments.push(mark);cursor=hi;
   }
   if(!fragments.length)continue;
   if(cursor<part.end)fragments.push(document.createTextNode(val.slice(rawAt(val,cursor-part.start))));
   part.node.replaceWith(...fragments);
  }
 });
 // The reader is strictly paginated; never scroll the viewport to a search match.
}
function runTextSearchCountOnly(){
 pdlFindResults();tsCurrent=tsResults.length?0:-1;pdlUpdateSearchCounter(false);
}
function runTextSearch(){
 pdlFindResults();tsCurrent=tsResults.length?0:-1;pdlUpdateSearchCounter(false);
 if(tsCurrent!==-1)goToTsResult(0);else pdlResetPageMarks();
}
function pdlUpdateSearchCounter(showPosition){
 const count=document.getElementById('ts-count'),prev=document.getElementById('ts-prev'),next=document.getElementById('ts-next');
 if(!count||!prev||!next)return;
 count.textContent=!tsResults.length?'Καμία':showPosition?`${tsCurrent+1} / ${tsResults.length}`:`${tsResults.length} αποτ.`;
 prev.disabled=next.disabled=!tsResults.length;
 document.getElementById('text-search-bar')?.classList.toggle('nav-hidden',!tsResults.length);
}
function goToTsResult(index){
 if(!tsResults.length)return;
 tsCurrent=((index%tsResults.length)+tsResults.length)%tsResults.length;
 const hit=tsResults[tsCurrent];
 if(currentChapter!==hit.ch||currentPage!==hit.pg){currentChapter=hit.ch;currentPage=hit.pg;render();}
 pdlHighlightVisible(tsCurrent);pdlUpdateSearchCounter(true);
}
function textSearchNav(dir){if(tsResults.length)goToTsResult(tsCurrent+dir);}
function highlightPageMatches(currentIdx){pdlHighlightVisible(currentIdx);}
function clearTextSearch(){
 tsResults=[];tsCurrent=-1;tsQuery='';pdlResetPageMarks();pdlUpdateSearchCounter(false);
}

function pdlSyncSearchButtons(){
 const expanded=!!document.getElementById('text-search-bar')&&!document.getElementById('text-search-bar').classList.contains('hidden');
 for(const id of ['pdl-mobile-search-action','pdl-rail-search','text-search-toggle']){
  const btn=document.getElementById(id);if(btn){btn.setAttribute('aria-expanded',String(expanded));btn.setAttribute('aria-controls','text-search-bar');}
 }
}
function toggleTextSearch() {
  const bar = document.getElementById('text-search-bar');
  const btn = document.getElementById('text-search-toggle');
  if (bar.classList.contains('hidden')) {
    bar.classList.remove('hidden');
    bar.classList.add('nav-hidden'); // nav row hidden until results
    if (btn) btn.classList.add('active');
    const inp = document.getElementById('text-search-input');
    if (inp) { inp.focus(); inp.select(); }
    if (window.innerWidth <= 768) document.getElementById('sidebar').classList.remove('open');
    pdlSyncSearchButtons();
  } else {
    closeTextSearch();
  }
}

function pdlClearSearchQuery(){
 const field=document.getElementById('text-search-input');
 if(!field)return;
 field.value='';
 onTextSearch('');
 field.focus({preventScroll:true});
}
function closeTextSearch() {
  const bar = document.getElementById('text-search-bar');
  if (bar) { bar.classList.add('hidden'); bar.classList.add('nav-hidden'); }
  const btn = document.getElementById('text-search-toggle');
  if (btn) btn.classList.remove('active');
  const inp = document.getElementById('text-search-input');
  if (inp) inp.value = '';
  clearTextSearchUI();
  pdlSyncSearchButtons();
}

function clearTextSearchUI() {
  clearTextSearch();
  render();
}

function onTextSearchKey(e) {
  if (e.key === 'Enter') {
    e.shiftKey ? textSearchNav(-1) : textSearchNav(1);
  }
  if (e.key === 'Escape') closeTextSearch();
}



