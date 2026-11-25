// Pontian Digital Library v3.1.2 — progressive, verified, chapter-local page batches.
// The source chapter blocks remain immutable. Only fully checked pages are published.
// Hyphenopoly and non-hyphenated books use the same progressive page engine
// when the selected pattern is loaded. Legacy remains the failure fallback.
const PDL_PROGRESS_VERSION='3.1.2';
const PDL_PROGRESS_BATCH=6;
const PDL_PROGRESS_GAP=42;
const pdlProgress={generation:0,chapters:[],signature:'',run:false,readyFonts:false,
 priority:0,desired:null,absolute:null,searchPending:null,waiters:[],stats:{},
 cache:new Map(),lastRendered:null,lastPaint:null,renderTimer:null,errors:[]};
function pdlProgressPause(){return new Promise(resolve=>setTimeout(resolve,0));}
function pdlProgressIdle(){return new Promise(resolve=>setTimeout(resolve,16));}
function pdlProgressComplete(){return pdlProgress.chapters.length===chapters.length&&pdlProgress.chapters.every(s=>s.done);}
function pdlProgressPageLength(html){const d=document.createElement('div');d.innerHTML=html||'';return (d.textContent||'').length;}
// Invalidate finished-page caches whenever the underlying chapter content changes.
function pdlProgressContentKey(){
 let hash=2166136261;
 for(const ch of PDL_SOURCE){
  for(const b of ch.blocks){
   const raw=String(b.type||'')+'\u0000'+String(b.text||'');
   for(let i=0;i<raw.length;i++){hash^=raw.charCodeAt(i);hash=Math.imul(hash,16777619);}
  }
 }
 return (hash>>>0).toString(16)+'-'+PDL_SOURCE.length;
}
function pdlProgressTextLength(ci,bi){const b=PDL_SOURCE[ci].blocks[bi];
 if(!Object.hasOwn(b,'_pdlProgressLength'))Object.defineProperty(b,'_pdlProgressLength',{value:pdlProgressPageLength(b.text),configurable:true});
 return b._pdlProgressLength;}
function pdlProgressConfig(){
 const leaf=document.getElementById('page-content');
 if(!leaf||leaf.clientWidth<140||leaf.clientHeight<100)return null;
 const cs=getComputedStyle(leaf),paddingX=(parseFloat(cs.paddingLeft)||0)+(parseFloat(cs.paddingRight)||0),
 paddingY=(parseFloat(cs.paddingTop)||0)+(parseFloat(cs.paddingBottom)||0);
 const sample=document.createElement('p');sample.textContent='Ποντιακό κείμενο';leaf.append(sample);
 const pCSS=getComputedStyle(sample),size=parseFloat(pCSS.fontSize)||parseFloat(cs.fontSize)||19;sample.remove();
 const width=Math.max(100,leaf.clientWidth-paddingX),height=Math.max(80,leaf.clientHeight-paddingY);
 const scale=innerWidth<=768?(typeof pdlMobileLineScale==='number'?pdlMobileLineScale:Number(localStorage.getItem('pdlLineScale'))||1):1;
 const line=Math.round(size*1.69*scale*1000)/1000,rows=Math.max(2,Math.floor((height-2)/line));
 // The progressive column measurer is mounted on BODY, while the visible
 // pages and OPF host live inside #text-viewport. Keep the actual CSS line
 // grid in BOTH scopes in lockstep with the rows used to paginate. Otherwise
 // a 130% font can be measured as 130% yet displayed at an obsolete 100%
 // line-height, leaving the page largely empty and misaligning validation.
 const gridLine=line+'px';
 document.documentElement.style.setProperty('--pdl-grid-line',gridLine);
 document.getElementById('text-viewport').style.setProperty('--pdl-grid-line',gridLine);
 const font=cs.fontFamily||getComputedStyle(document.body).fontFamily;
 return {leaf,width,height,line,rows,used:rows*line+1,font,size,bookSetting:JSON.stringify(PDL_BOOK_EDITOR_SETTINGS)};
}
function pdlProgressMarkup(ci,page,firstPage){
 let html=(firstPage&&PDL_BOOK_EDITOR_SETTINGS.showChapterTitles)?'<div class="chapter-heading"><div class="chapter-number">'+pdlEscapeHTML(chapters[ci].number)+'</div></div>':'';
 for(const b of page)html+=pdlBlockMarkup(b);
 if(firstPage&&PDL_BOOK_EDITOR_SETTINGS.dropCap){
  const tmp=document.createElement('div');tmp.innerHTML=html;
  const first=Array.from(tmp.children).find(n=>n.tagName==='P');
  if(first&&!first.classList.contains('pdl-continuation')&&!first.classList.contains('pdl-rich-heading'))first.classList.add('pdl-chapter-opening');
  html=tmp.innerHTML;
 }
 return html;
}
function pdlProgressValidator(leaf){
 const vp=document.getElementById('text-viewport');const probe=leaf.cloneNode(false);
 probe.className=(leaf.className||'')+' pdl-grid-final-probe';
 const style={position:'fixed',left:'-100000px',top:'0px',width:leaf.offsetWidth+'px',
 'min-width':leaf.offsetWidth+'px','max-width':leaf.offsetWidth+'px',height:leaf.offsetHeight+'px',
 'min-height':leaf.offsetHeight+'px','max-height':leaf.offsetHeight+'px',margin:'0',flex:'none',
 transform:'none',overflow:'visible',visibility:'hidden','pointer-events':'none','z-index':'-100'};
 for(const [k,v]of Object.entries(style))probe.style.setProperty(k,v,'important');
 vp.append(probe);return probe;
}
async function pdlProgressRepair(ci,pages,base,leaf,generation){
 const probe=pdlProgressValidator(leaf),textLengthCache=new Map(),plainCache=new Map();
 const hyphenated=PDL_HYPH.mode()!=='off'&&PDL_HYPH.ready();
 const fragLength=b=>{if(!textLengthCache.has(b.text))textLengthCache.set(b.text,pdlProgressPageLength(b.text));return textLengthCache.get(b.text);};
 const plain=bi=>{if(!plainCache.has(bi))plainCache.set(bi,pdlBlockNode(PDL_SOURCE[ci].blocks[bi],false).textContent||'');return plainCache.get(bi);};
 let verified=0,adjusted=0,moved=0;
 try{
  for(let pi=0;pi<pages.length;pi++){
   if(generation!==pdlProgress.generation)throw Error('PDL_PROGRESS_CANCELLED');
   if(pi>PDL_PROGRESS_BATCH+8)throw Error('Too many batch validation pages');
   let attempts=0,changed=false;
   while(true){
    if(++attempts>9)throw Error('Unable to fit page '+ci+':'+(base+pi));
    probe.innerHTML=pdlProgressMarkup(ci,pages[pi],base+pi===0);
    // Validate the rendered discretionary line breaks, not an unsyllabified
    // approximation. The sourceOffset map excludes added U+00AD markers.
    if(hyphenated)PDL_HYPH.apply(probe);
    const css=getComputedStyle(probe),rect=probe.getBoundingClientRect();
    const safe=Math.max(2,Math.min(5,(parseFloat(css.fontSize)||18)*.14));
    const bottomLimit=rect.bottom-(parseFloat(css.paddingBottom)||0)-safe;
    const children=Array.from(probe.children);
    const titleOffset=(base+pi===0&&PDL_BOOK_EDITOR_SETTINGS.showChapterTitles)?1:0;
    let offending=-1;
    for(let k=0;k<children.length;k++)if(children[k].getBoundingClientRect().bottom>bottomLimit+.5){offending=k;break;}
    if(offending<0){verified++;if(changed)adjusted++;break;}
    const page=pages[pi],blockIndex=offending-titleOffset;
    if(blockIndex<0)throw Error('Chapter title exceeds page');
    const frag=page[blockIndex],node=children[offending];
    if(!frag)throw Error('Invalid source-to-DOM mapping');
    const bi=frag._pdlAnchor?.index,from=Number(frag._pdlAnchor?.offset)||0;
    if(!Number.isInteger(bi)||!PDL_SOURCE[ci].blocks[bi])throw Error('Missing source anchor');
    const source=PDL_SOURCE[ci].blocks[bi],end=from+fragLength(frag);
    let cut=null;
    if(node?.tagName==='P'&&['p','dialogue'].includes(source.type)){
     const walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT);let textNode,offsetInFragment=0,overflowAt=null;
     const range=document.createRange();
     // Range text rectangles omit line-box leading, but the validator checks
     // paragraph line boxes. Include the final line's trailing space in word
     // tests too; otherwise every word can appear to fit while its line box
     // overflows, and cut=null moves the entire paragraph to the next page.
     range.selectNodeContents(node);
     let textBottom=-Infinity;
     for(const r of range.getClientRects())textBottom=Math.max(textBottom,r.bottom);
     const lineTail=Number.isFinite(textBottom)?Math.max(0,node.getBoundingClientRect().bottom-textBottom):0;
     scan:while((textNode=walker.nextNode())){
      const text=textNode.nodeValue||'',pattern=/\S+/gu;let word;
      while((word=pattern.exec(text))!==null){
       range.setStart(textNode,word.index);range.setEnd(textNode,word.index+word[0].length);
       for(const r of range.getClientRects())if(r.bottom+lineTail>bottomLimit+.5){
        overflowAt=from+offsetInFragment+(hyphenated?PDL_HYPH.sourceOffset(textNode,word.index):word.index);break scan;}
      }
      offsetInFragment+=hyphenated?PDL_HYPH.sourceOffset(textNode,text.length):text.length;
     }
     if(overflowAt!==null){const raw=plain(bi);
      while(overflowAt>from&&!/\s/u.test(raw[overflowAt-1]||''))overflowAt--;
      if(overflowAt>from&&overflowAt<end)cut=overflowAt;
     }
    }
    if(cut===null&&blockIndex===0){
     const inkReserve=Math.max(4,Math.min(7,(parseFloat(getComputedStyle(node).lineHeight)||28)*.23));
     if(node.getBoundingClientRect().bottom<=bottomLimit+inkReserve){verified++;if(changed)adjusted++;break;}
     throw Error('Unsplittable overheight fragment '+ci+':'+bi);
    }
    const suffix=cut===null?page.splice(blockIndex):page.splice(blockIndex+1);
    if(cut!==null){
     page[blockIndex]={...frag,text:pdlGridSliceBlock(source,from,cut),_pdlContinues:true};
     suffix.unshift({...frag,text:pdlGridSliceBlock(source,cut,end),
      _pdlAnchor:{index:bi,offset:cut},_pdlContinues:!!frag._pdlContinues});
    }
    const following=pages[pi+1]||(pages[pi+1]=[]);
    const last=suffix.at(-1),head=following[0];
    if(last?._pdlAnchor&&head?._pdlAnchor&&last._pdlAnchor.index===head._pdlAnchor.index){
     const lastIndex=last._pdlAnchor.index,startOffset=Number(last._pdlAnchor.offset)||0;
     const nextEnd=(Number(head._pdlAnchor.offset)||0)+fragLength(head);
     suffix[suffix.length-1]={...last,text:pdlGridSliceBlock(PDL_SOURCE[ci].blocks[lastIndex],startOffset,nextEnd),_pdlContinues:!!head._pdlContinues};
     following.shift();
    }
    following.unshift(...suffix);moved+=suffix.length;changed=true;
   }
   if(pi%2===1)await pdlProgressPause();
  }
 }finally{probe.remove();}
 return {verified,adjusted,moved};
}
async function pdlProgressBatch(ci,config,generation){
 const state=pdlProgress.chapters[ci];if(!state||state.done)return;
 const source=PDL_SOURCE[ci],start=state.cursor,measurer=document.createElement('div');
 const hyphenated=PDL_HYPH.mode()!=='off'&&PDL_HYPH.ready();
 measurer.id='pdl-grid-column-measurer';
 if(hyphenated)measurer.classList.add('pdl-progress-hyphenated');
 for(const [name,val]of Object.entries({width:config.width+'px',height:config.used+'px',
  'column-width':config.width+'px','column-gap':PDL_PROGRESS_GAP+'px',
  'font-family':config.font,'font-size':config.size+'px','line-height':config.line+'px'}))measurer.style.setProperty(name,val,'important');
 document.body.append(measurer);
 const all=[],columnWidth=config.width+PDL_PROGRESS_GAP;
 let appended=0,endBi=start.bi;
 try{
  if(start.bi===0&&start.offset===0&&state.pages.length===0)measurer.append(pdlHeading(source));
  let openingNotAssigned=PDL_BOOK_EDITOR_SETTINGS.dropCap&&start.bi===0&&start.offset===0;
  for(let bi=start.bi;bi<source.blocks.length;bi++){
   if(generation!==pdlProgress.generation)throw Error('PDL_PROGRESS_CANCELLED');
   const block=source.blocks[bi],offset=bi===start.bi?start.offset:0;
   const total=pdlProgressTextLength(ci,bi);
   if(offset>0&&offset>=total){endBi=bi+1;continue;}
   if(total===0&&['p','dialogue'].includes(block.type)){endBi=bi+1;continue;}
   const fragment=offset?pdlGridSliceBlock(block,offset,total):block.text;
   const node=pdlBlockNode({...block,text:fragment},false);
   if(offset)node.classList.add('pdl-continuation');
   if(openingNotAssigned&&node.nodeName==='P'&&!node.classList.contains('pdl-rich-heading')){node.classList.add('pdl-chapter-opening');openingNotAssigned=false;}
   const data=node.nodeName==='P'?pdlGridWordify(node,hyphenated):{words:[],length:0};
   measurer.append(node);all.push({bi,block,node,offset,fragment,...data});endBi=bi+1;appended++;
   if(appended%5===0){
    const count=Math.max(1,Math.round((measurer.scrollWidth+PDL_PROGRESS_GAP)/columnWidth));
    if(count>=PDL_PROGRESS_BATCH+1)break;
    await pdlProgressPause();
   }
  }
  if(generation!==pdlProgress.generation)throw Error('PDL_PROGRESS_CANCELLED');
  const numberOfColumns=Math.max(1,Math.round((measurer.scrollWidth+PDL_PROGRESS_GAP)/columnWidth));
  if(numberOfColumns>2500)throw Error('Invalid batch column count');
  const pages=Array.from({length:numberOfColumns},()=>[]),flowLeft=measurer.getBoundingClientRect().left;
  const colOf=el=>Math.max(0,Math.min(numberOfColumns-1,Math.floor((el.getBoundingClientRect().left-flowLeft+2)/columnWidth)));
  let scannedWords=0;
  for(const {bi,block,node,words,length,offset} of all){
   if(generation!==pdlProgress.generation)throw Error('PDL_PROGRESS_CANCELLED');
   if(!words.length){pages[colOf(node)].push({...block,_pdlAnchor:{index:bi,offset}});continue;}
   const transitions=[];let last=-1;
   for(const word of words){const page=colOf(word);if(page<last)throw Error('Non-monotonic CSS column');
    if(page!==last){transitions.push({page,offset:Number(word.dataset.offset)});last=page;}}
   for(let j=0;j<transitions.length;j++){
    const t=transitions[j],from=j===0?0:t.offset,to=j+1<transitions.length?transitions[j+1].offset:length;
    let fragmentText=j===0&&to===length&&!offset?block.text:pdlGridSliceBlock(block,offset+from,offset+to);
    // A physical page ending at an approved intra-word cut needs its visible
    // hyphen even though the source text/anchor must remain byte-for-byte.
    if(hyphenated&&j+1<transitions.length){
     const plain=pdlBlockNode(block,false).textContent||'',cut=offset+to;
     const midWord=/\p{L}/u.test(plain[cut-1]||'')&&/\p{L}/u.test(plain[cut]||'');
     if(midWord&&(PDL_HYPH.positions(plain).includes(cut)||plain[cut-1]==='\u00AD'))
      fragmentText+='<span class="pdl-page-break-hyphen" aria-hidden="true"></span>';
    }
    pages[t.page].push({...block,text:fragmentText,_pdlContinues:j+1<transitions.length,
     _pdlAnchor:{index:bi,offset:offset+from}});
   }
   scannedWords+=words.length;
   if(scannedWords%900<words.length)await pdlProgressPause();
  }
  while(pages.length>1&&!pages.at(-1).length)pages.pop();
  const sourceConsumed=endBi>=source.blocks.length;
  const maxCommit=Math.min(PDL_PROGRESS_BATCH,pages.length);
  // Retain at least one fully measurable spill page for repair at the batch seam.
  const working=pages.slice(0,sourceConsumed&&pages.length<=PDL_PROGRESS_BATCH?pages.length:maxCommit+1);
  const validation=await pdlProgressRepair(ci,working,state.pages.length,config.leaf,generation);
  if(generation!==pdlProgress.generation)throw Error('PDL_PROGRESS_CANCELLED');
  const finished=sourceConsumed&&pages.length<=PDL_PROGRESS_BATCH&&working.length<=PDL_PROGRESS_BATCH+1;
  const commitCount=finished?working.length:Math.min(PDL_PROGRESS_BATCH,working.length-1);
  if(commitCount<1)throw Error('No complete batch page available '+JSON.stringify({ci,start,sourceConsumed,endBi,sourceLength:source.blocks.length,numberOfColumns,pages:pages.length,working:working.length,firstBlock:working[0]?.[0]?._pdlAnchor,remaining:state.cursor}));
  const committed=working.slice(0,commitCount);
  const nextPage=working[commitCount];
  let cursor;
  if(finished)cursor={bi:source.blocks.length,offset:0};
  else if(nextPage?.length&&nextPage[0]._pdlAnchor){cursor={bi:nextPage[0]._pdlAnchor.index,offset:nextPage[0]._pdlAnchor.offset};}
  else throw Error('Missing next batch anchor');
  if(!finished&&(cursor.bi<start.bi||(cursor.bi===start.bi&&cursor.offset<=start.offset)))throw Error('Batch cursor did not advance');
  state.pages.push(...committed);state.cursor=cursor;state.done=finished;
  state.batches++;state.wordCount+=scannedWords;state.verified+=validation.verified;state.adjusted+=validation.adjusted;
  state.committedChars=(state.committedChars||0)+committed.reduce((sum,page)=>sum+page.reduce((a,b)=>a+pdlProgressPageLength(b.text||''),0),0);
  chapters[ci].pages=state.pages;
  return {count:committed.length,done:finished,validation};
 }finally{measurer.remove();}
}
function pdlProgressNotify(message,active){
 const el=document.getElementById('pdl-progress-status');if(!el)return;
 if(active){el.textContent=message;el.hidden=false;el.setAttribute('aria-hidden','false');}
 else {el.hidden=true;el.textContent='';el.style.pointerEvents='none';el.setAttribute('aria-hidden','true');}
}
function pdlProgressSyncUI(){
 const all=pdlProgressComplete(),pg=document.getElementById('pdl-mobile-progress');
 if(pg){
  if(!all){
   const committed=pdlProgress.chapters.reduce((a,s)=>a+s.pages.length,0);
   const totalSource=pdlProgress.totalSourceChars||1;
   const committedChars=pdlProgress.chapters.reduce((sum,s)=>sum+(s.committedChars||0),0);
   const estimate=Math.max(committed+15,Math.ceil((totalSource/(committedChars||1))*Math.max(1,committed)),80);
   pg.max=String(Math.min(10000,estimate));
   const before=pdlProgress.chapters.slice(0,currentChapter).reduce((a,s)=>a+s.pages.length,0);
   pg.value=String(Math.max(1,before+currentPage+1));
   pg.title='Εκτίμηση συνολικού μήκους. Η μετάβαση υπολογίζει την πραγματική σελίδα.';
   const count=document.getElementById('pdl-mobile-page-info');if(count)count.textContent=`${pg.value} / ~${pg.max}`;
  }else{pg.title='Μετάβαση σε σελίδα';}
 }
 if(!all){const info=document.getElementById('page-info');if(info)info.textContent=info.textContent.replace(/ από \d+$/, ' · προετοιμασία');}
}
function pdlProgressRender(){
 if(!pdlProgress.chapters[currentChapter]?.pages?.length)return;
 currentPage=Math.max(0,Math.min(currentPage,chapters[currentChapter].pages.length-1));
 // A newly committed batch does not change the HTML of an already published
 // page. Redrawing it unnecessarily interrupts the OpenPageFlip gesture and
 // reschedules its entire page window. Repaint only on an actual navigation,
 // a new typography generation, or completion of the book (final counters).
 const paint=[pdlProgress.generation,currentChapter,currentPage,pdlProgressComplete()?1:0].join(':');
 if(pdlProgress.lastPaint!==paint){pdlProgress.lastPaint=paint;render();}
 pdlProgressSyncUI();
}
function pdlProgressResolveWaiters(){
 const rest=[];for(const w of pdlProgress.waiters){if(pdlProgress.chapters[w.ch]?.done){w.resolve(true);}else rest.push(w);}
 pdlProgress.waiters=rest;
}
function pdlProgressChapterReady(ch){return !!pdlProgress.chapters[ch]?.pages?.length;}
function pdlProgressGo(ch,pg=0,anchor=null){
 if(!chapters[ch])return;
 pdlProgress.priority=ch;
 const state=pdlProgress.chapters[ch];
 if(pdlProgressChapterReady(ch)&&(state.done||(!anchor&&pg<state.pages.length))){
  currentChapter=ch;currentPage=anchor?pdlPositionPage(ch,anchor):Math.min(pg,chapters[ch].pages.length-1);
  pdlProgress.desired=null;pdlProgressRender();return;
 }
 pdlProgress.desired={ch,pg,anchor};pdlProgressNotify('Προετοιμασία της ζητούμενης σελίδας…',true);
 pdlProgressPump();
}
function pdlProgressGoAbsolute(target){
 if(!Number.isFinite(target)||target<1)return;
 pdlProgress.absolute=Math.floor(target);pdlProgress.desired=null;
 pdlProgressNotify('Υπολογισμός σελίδας '+Math.floor(target)+'…',true);
 pdlProgressPump();
}
function pdlProgressResolveTarget(){
 if(pdlProgress.absolute!==null){
  let remaining=pdlProgress.absolute;
  for(let ci=0;ci<pdlProgress.chapters.length;ci++){
   const s=pdlProgress.chapters[ci];
   if(remaining<=s.pages.length){pdlProgress.absolute=null;pdlProgressGo(ci,remaining-1);return;}
   if(!s.done)return;
   remaining-=s.pages.length;
  }
  if(pdlProgressComplete()){
   pdlProgress.absolute=null;const last=chapters.length-1;pdlProgressGo(last,Math.max(0,chapters[last].pages.length-1));
  }
 }
 const w=pdlProgress.desired;
 if(w&&pdlProgressChapterReady(w.ch)){
  const s=pdlProgress.chapters[w.ch];
  if(w.anchor&&!s.done){
   const end=s.pages.at(-1)?.at(-1)?._pdlAnchor;
   if(end&&(end.index<w.anchor.index||(end.index===w.anchor.index&&end.offset<w.anchor.offset)))return;
  }
  if(w.pg>=s.pages.length&&!s.done)return;
  pdlProgress.desired=null;pdlProgressGo(w.ch,w.pg,w.anchor);
 }
}
function pdlProgressChoose(){
 if(pdlProgress.absolute!==null){for(let ci=0;ci<pdlProgress.chapters.length;ci++)if(!pdlProgress.chapters[ci].done)return ci;}
 if(pdlProgress.desired&&!pdlProgress.chapters[pdlProgress.desired.ch].done)return pdlProgress.desired.ch;
 if(!pdlProgress.chapters[pdlProgress.priority]?.done)return pdlProgress.priority;
 for(let ci=0;ci<pdlProgress.chapters.length;ci++)if(!pdlProgress.chapters[ci].done)return ci;
 return -1;
}
async function pdlProgressPump(){
 if(pdlProgress.run||!pdlProgress.chapters.length)return;
 pdlProgress.run=true;const generation=pdlProgress.generation;
 try{
  const config=pdlProgressConfig();if(!config)return;
  await document.fonts.load('400 '+config.size+'px '+config.font);
  await document.fonts.ready;
  if(generation!==pdlProgress.generation)return;
  document.documentElement.style.setProperty('--pdl-grid-line',config.line+'px');
  document.documentElement.style.setProperty('--pdl-grid-used',config.used+'px');
  pdlProgress.readyFonts=true;
  while(generation===pdlProgress.generation){
   const ci=pdlProgressChoose();if(ci<0)break;
   const s=pdlProgress.chapters[ci];
   if(s.done)continue;
   const started=performance.now();
   await pdlProgressBatch(ci,config,generation);
   if(generation!==pdlProgress.generation)return;
   pdlProgress.stats.batches++;
   pdlProgress.stats.measureMs+=performance.now()-started;
   if(ci===currentChapter){
    if(!pdlProgress.lastRendered||pdlProgress.lastRendered.generation!==generation){
     const old=pdlProgress.lastRendered;
     if(old?.anchor)currentPage=pdlPositionPage(ci,old.anchor);
     pdlProgress.lastRendered={generation};
    }
    pdlProgressRender();
    window.dispatchEvent(new Event('pdl-progress-pages'));
   }
   pdlProgressResolveTarget();pdlProgressResolveWaiters();
   if(ci===currentChapter&&pdlProgressChapterReady(ci)&&!pdlProgress.desired&&pdlProgress.absolute===null)pdlProgressNotify('',false);
   if(typeof tsQuery==='string'&&tsQuery&&pdlProgressComplete()){
    textIndex=null;onTextSearch(tsQuery);
   }
   await pdlProgressIdle();
  }
  if(generation===pdlProgress.generation){
   if(pdlProgressComplete()){
    pdlProgress.cache.delete(pdlProgress.signature);
    pdlProgress.cache.set(pdlProgress.signature,pdlProgress.chapters.map(s=>({...s,pages:s.pages.slice()})));
    while(pdlProgress.cache.size>4)pdlProgress.cache.delete(pdlProgress.cache.keys().next().value);
   }
   pdlProgressResolveTarget();pdlProgressResolveWaiters();
   if(pdlProgress.searchPending){const q=pdlProgress.searchPending;pdlProgress.searchPending=null;onTextSearch(q);}
   pdlProgressNotify('',false);pdlProgressRender();
   window.dispatchEvent(new Event('pdl-grid-layout-ready'));
  }
 }catch(e){
  if(String(e?.message)==='PDL_PROGRESS_CANCELLED')return;
  pdlProgress.errors.push(String(e?.stack||e));console.error('Progressive pagination stopped',e);
  // Editorial hyphenation must never leave a book unreadable after a layout
  // exception. Return to the already-supported fully measured legacy engine.
  if(PDL_HYPH.mode()!=='off'){
   pdlProgressHyphenationFailed=true;pdlProgress.generation++;
   pdlProgress.chapters=[];pdlProgress.signature='';pdlProgress.desired=null;pdlProgress.absolute=null;
   pdlLegacyPaginate();pdlProgressNotify('',false);
   const status=document.getElementById('pdl-hyphen-status');
   if(status)status.textContent='Ασφαλής εναλλακτική σελιδοποίηση (χωρίς προοδευτική φόρτωση)';
   render();window.dispatchEvent(new Event('pdl-grid-layout-ready'));
   return;
  }
  pdlProgressNotify('Σφάλμα σελιδοποίησης. Οι ήδη έτοιμες σελίδες διατηρούνται.',true);
  const banner=document.getElementById('pdl-progress-status');
  if(banner){banner.style.pointerEvents='auto';const retry=document.createElement('button');
   retry.type='button';retry.textContent='Επανάληψη';retry.className='pdl-progress-retry';
   retry.onclick=()=>{banner.style.pointerEvents='none';pdlProgressNotify('Νέα προσπάθεια σελιδοποίησης…',true);pdlProgressPump();};
   banner.append(retry);
  }
 }finally{
  pdlProgress.run=false;
  if(generation!==pdlProgress.generation)queueMicrotask(pdlProgressPump);
 }
}
let pdlProgressHyphenationFailed=false;
let pdlHyphenStartupWaiting=false;
function pdlWaitForHyphenation(){
 // Initial buildChapters() chunks are source placeholders, not measured pages.
 // Keep them inert while loading instead of synchronously paginating the
 // whole book only to discard that layout when the patterns become ready.
 if(!pdlHyphenStartupWaiting){
  pdlHyphenStartupWaiting=true;currentPage=0;
  for(const chapter of chapters)chapter.pages=[[]];
 }
 pdlProgressNotify('Προετοιμασία συλλαβισμού…',true);
}
function pdlProgressStart(){
 if(PDL_HYPH.mode()!=='off'&&!PDL_HYPH.ready())return pdlLegacyPaginate();
 const config=pdlProgressConfig();if(!config)return;
 const signature=[PDL_PROGRESS_VERSION,pdlProgressContentKey(),config.width,config.height,config.line,config.font,config.bookSetting].join('|');
 if(pdlProgress.signature===signature&&pdlProgress.chapters.length){pdlProgressPump();return;}
 // A font-loading event may start a new layout after the reader has asked
 // for page 60 or a bookmark in an unprepared chapter. Preserve that request
 // across pagination generations rather than silently discarding it.
 const pendingAbsolute=pdlProgress.absolute;
 const pendingDesired=pdlProgress.desired;
 const oldAnchor=typeof pdlReadingAnchor==='function'?pdlReadingAnchor(currentChapter,currentPage):pdlPageAnchor(currentChapter,currentPage);
 pdlProgress.generation++;pdlProgress.signature=signature;pdlProgress.errors=[];pdlProgress.lastPaint=null;
 pdlProgress.totalSourceChars=PDL_SOURCE.reduce((sum,ch,ci)=>sum+ch.blocks.reduce((n,b,bi)=>n+pdlProgressTextLength(ci,bi),0),0);
 const cached=pdlProgress.cache.get(signature);
 if(cached){
  pdlProgress.chapters=cached.map(s=>({...s,pages:s.pages.slice()}));
  for(let ci=0;ci<chapters.length;ci++)chapters[ci].pages=pdlProgress.chapters[ci].pages.length?pdlProgress.chapters[ci].pages:[[]];
 }else{
  pdlProgress.chapters=chapters.map(()=>({pages:[],cursor:{bi:0,offset:0},done:false,batches:0,wordCount:0,verified:0,adjusted:0}));
  for(const chapter of chapters)chapter.pages=[[]];
 }
 // A relayout immediately calls render(). Do not render a stale page index
 // against the temporary first-page placeholder while fonts are loading.
 currentPage=cached?pdlPositionPage(currentChapter,oldAnchor):0;
 pdlProgress.priority=pendingDesired?.ch??currentChapter;
 pdlProgress.lastRendered={anchor:oldAnchor,generation:-1};
 pdlProgress.readyFonts=false;
 pdlProgress.desired=pendingAbsolute!==null?null:(pendingDesired||(
  oldAnchor&&(oldAnchor.index>0||oldAnchor.offset>0)
   ?{ch:currentChapter,pg:currentPage,anchor:oldAnchor}:null));
 pdlProgress.absolute=pendingAbsolute;textIndex=null;
 pdlProgress.stats={batches:0,measureMs:0,started:performance.now(),cacheHit:!!cached};
 pdlProgressNotify('Προετοιμασία των πρώτων σελίδων…',true);
 pdlProgressPump();
}
window.pdlProgressLocation=()=>({chapter:currentChapter,page:currentPage,
 absolute:chapters.slice(0,currentChapter).reduce((sum,ch)=>sum+ch.pages.length,0)+currentPage+1,
 pendingAbsolute:pdlProgress.absolute,pendingChapter:pdlProgress.desired?.ch??null});
window.pdlProgressStats=()=>({generation:pdlProgress.generation,
 mode:pdlHyphenStartupWaiting?'hyphenation-loading':pdlProgress.chapters.length?(PDL_HYPH.mode()==='off'?'progressive-chapter-batches':'progressive-hyphenated-batches'):'legacy',
 waitingForHyphenation:pdlHyphenStartupWaiting,
 hyphenation:PDL_HYPH.mode(),hyphenatorReady:PDL_HYPH.ready(),fallback:pdlProgressHyphenationFailed,
 chapters:pdlProgress.chapters.map((s,i)=>({chapter:i,pages:s.pages.length,done:s.done,batches:s.batches,verified:s.verified,adjusted:s.adjusted})),
 ...pdlProgress.stats,complete:pdlProgressComplete(),errors:pdlProgress.errors.slice(-2)});

document.body.classList.toggle('pdl-editor-hyphenation',PDL_HYPH.mode()!=='off');
function pdlPaginate(){
 if(pdlGridEnabled&&!pdlProgressHyphenationFailed&&PDL_HYPH.pending())return pdlWaitForHyphenation();
 const wasWaiting=pdlHyphenStartupWaiting;pdlHyphenStartupWaiting=false;
 if(pdlGridEnabled&&!pdlProgressHyphenationFailed&&
    (PDL_HYPH.mode()==='off'||PDL_HYPH.ready()))return pdlProgressStart();
 const result=pdlLegacyPaginate();
 if(wasWaiting){
  const target=pdlProgress.desired;pdlProgress.desired=null;
  if(target&&chapters[target.ch]){
   currentChapter=target.ch;
   currentPage=target.anchor?pdlPositionPage(target.ch,target.anchor):Math.min(target.pg,chapters[target.ch].pages.length-1);
  }
  pdlProgressNotify('',false);
 }
 return result;
}
function pdlRelayout(){
  if(pdlLayoutInProgress)return;
  pdlPaginate();render();
  if(document.fonts?.status==='loaded')window.dispatchEvent(new Event('pdl-grid-layout-ready'));
  // Re-evaluate search locations, which depend on the generated page boundaries.
  if(typeof tsQuery==='string'&&tsQuery)onTextSearch(tsQuery);
}
function pdlScheduleRelayout(){
 if(window.pdlRequestReaderRelayout)return window.pdlRequestReaderRelayout();
 clearTimeout(pdlResizeTimer);pdlResizeTimer=setTimeout(pdlRelayout,160);
}
window.addEventListener('resize',pdlScheduleRelayout);
// A controls-only transition must not alter the book's page mapping.
// Reflow on layout-affecting classes only; font/line/viewport changes have their own hooks.
let pdlLayoutClassSignature=()=>[document.body.classList.contains('pdl-double'),document.body.classList.contains('pdl-height-max')].join(':');
let pdlLastLayoutClassSignature=pdlLayoutClassSignature();
new MutationObserver(()=>{
 const next=pdlLayoutClassSignature();
 if(next!==pdlLastLayoutClassSignature){pdlLastLayoutClassSignature=next;pdlScheduleRelayout();}
}).observe(document.body,{attributes:true,attributeFilter:['class']});
if(document.fonts?.ready)document.fonts.ready.then(pdlScheduleRelayout);
if(document.fonts?.addEventListener)document.fonts.addEventListener('loadingdone',pdlScheduleRelayout);
const pdlOriginalFontApply=applyFontSize;
applyFontSize=function(value){pdlOriginalFontApply(value);pdlScheduleRelayout();};
// Bookmark anchors are already recorded when creating the bookmark.
// pdlBMResolve handles chapter-ID migration before page-anchor resolution.
// Apply screen-specific text layout once, before the first visible render.

// ---- PDL v1.3 editorial desktop reader ----
const PDL_FONTS=['Barnebok Pontian','GFS Galatea Pontian','Miasma Pontian','Nobilis Text Pontian','Calibri'];
let pdlFont=localStorage.getItem('pdlFont')||'GFS Galatea Pontian';
let pdlTheme=localStorage.getItem('pdlTheme')||(document.body.classList.contains('night')?'dark':'light');
let pdlLayout=window.innerWidth<=768?'single':(localStorage.getItem('pdlLayout')||'single');

function pdlSetFont(name){if(!PDL_FONTS.includes(name))return;pdlFont=name;document.documentElement.style.setProperty('--pdl-font',name==='Calibri'?'"Calibri","PDL Carlito","GFS Galatea Pontian",Arial,sans-serif':JSON.stringify(name));localStorage.setItem('pdlFont',name);document.getElementById('pdl-font-select').value=name;pdlScheduleRelayout();}
function pdlSetTheme(value){if(!['light','sepia','dark'].includes(value))return;pdlTheme=value;document.body.classList.toggle('night',value==='dark');document.body.classList.toggle('sepia',value==='sepia');localStorage.setItem('pdlTheme',value);document.querySelectorAll('[data-pdl-theme]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.pdlTheme===value)));pdlScheduleRelayout();}
toggleNight=function(){pdlSetTheme(pdlTheme==='dark'?'light':'dark');};
function pdlSetLayout(value){if(!['single','double'].includes(value))return;if(window.innerWidth<=768)value='single';pdlLayout=value;document.body.classList.toggle('pdl-double',value==='double');localStorage.setItem('pdlLayout',value);document.querySelectorAll('[data-pdl-layout]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.pdlLayout===value)));document.getElementById('pdl-spread-rail')?.classList.toggle('pdl-selected',value==='double');pdlScheduleRelayout();}
function pdlOpenSettings(){document.getElementById('sidebar').classList.add('open');document.getElementById('pdl-font-select')?.focus({preventScroll:true});}
document.addEventListener('keydown',e=>{if(e.altKey&&!e.ctrlKey&&!e.metaKey&&e.code==='Digit1'){e.preventDefault();document.getElementById('font-file-input')?.click();}},true);
// Render a companion leaf with the SAME text pipeline, while keeping navigation state unchanged.
function pdlNextPosition(ch,pg){if(pg<chapters[ch].pages.length-1)return {ch,pg:pg+1};if(ch<chapters.length-1)return {ch:ch+1,pg:0};return null;}
function pdlPrevPosition(ch,pg){if(pg>0)return {ch,pg:pg-1};if(ch>0)return {ch:ch-1,pg:chapters[ch-1].pages.length-1};return null;}
function pdlPositionMarkup(ch,pg){
 const c=chapters[ch],page=c.pages[pg]||[];
 let html=pg===0&&PDL_BOOK_EDITOR_SETTINGS.showChapterTitles?'<div class="chapter-heading"><div class="chapter-number">'+pdlEscapeHTML(c.number)+'</div></div>':'';
 for(const block of page)html+=pdlBlockMarkup(block);
 if(pg===0&&PDL_BOOK_EDITOR_SETTINGS.dropCap){
  const t=document.createElement('div');t.innerHTML=html;
  const first=Array.from(t.children).find(e=>e.tagName==='P');
  if(first&&!first.classList.contains('pdl-continuation')&&!first.classList.contains('pdl-rich-heading'))first.classList.add('pdl-chapter-opening');
  html=t.innerHTML;
 }
 return html;
}
const pdlOldRender=render;
render=function(){pdlOldRender();const right=document.getElementById('pdl-second-page');if(!right)return;
 const enabled=document.body.classList.contains('pdl-double')&&window.innerWidth>768;
 const n=enabled && currentPage+1<chapters[currentChapter].pages.length?{ch:currentChapter,pg:currentPage+1}:null;
 right.innerHTML=n?pdlPositionMarkup(n.ch,n.pg):'';
 const a=document.getElementById('page-info');if(enabled){const c=chapters[currentChapter];a.textContent=n&&n.ch===currentChapter?`Σελίδες ${currentPage+1}–${n.pg+1} από ${c.pages.length}`:`Σελίδα ${currentPage+1} από ${c.pages.length}`;}
 const b=document.getElementById('btn-next');if(enabled)b.disabled=!(currentPage+2<chapters[currentChapter].pages.length||currentChapter<chapters.length-1);
};
const pdlOriginalNextPage=nextPage,pdlOriginalPrevPage=prevPage;
nextPage=function(){if(!(document.body.classList.contains('pdl-double')&&window.innerWidth>768)){pdlOriginalNextPage();return;}
 const len=chapters[currentChapter].pages.length;
 if(currentPage+2<len){currentPage+=2;render();return;}
 if(currentChapter+1<chapters.length){currentChapter++;currentPage=0;render();}
};
prevPage=function(){if(!(document.body.classList.contains('pdl-double')&&window.innerWidth>768)){pdlOriginalPrevPage();return;}
 if(currentPage>1){currentPage=Math.max(0,currentPage-2);render();return;}
 if(currentChapter>0){currentChapter--;currentPage=Math.floor((chapters[currentChapter].pages.length-1)/2)*2;render();}
};
// In dual spread, the measurement column is the width of one leaf, not the combined book.
pdlMeasureBox=function(){
  const viewport=document.getElementById('text-viewport');
  const leaf=document.getElementById('page-content');
  if(!viewport||!leaf)throw new Error('Cannot measure without reader viewport');
  const cs=getComputedStyle(leaf);
  const width=Math.max(100,leaf.clientWidth-(parseFloat(cs.paddingLeft)||0)-(parseFloat(cs.paddingRight)||0));
  const height=Math.max(60,leaf.clientHeight-(parseFloat(cs.paddingTop)||0)-(parseFloat(cs.paddingBottom)||0));
  const box=document.createElement('div');
  box.className='page-content pdl-measure';
  box.style.cssText=[
    'position:fixed','left:-100000px','top:0','visibility:hidden','pointer-events:none','z-index:-1',
    'display:flow-root','flex:none','box-sizing:border-box',
    'width:'+width+'px','min-width:'+width+'px','max-width:'+width+'px',
    'height:auto','min-height:0','max-height:none','padding:0','margin:0','overflow:hidden',
    'transform:none','transition:none'
  ].join(';');
  // Override existing mobile `.page-content{width:100%!important}` which used
  // to stretch the hidden measurer wider than the visible text column.
  box.style.setProperty('width',width+'px','important');
  box.style.setProperty('min-width',width+'px','important');
  box.style.setProperty('max-width',width+'px','important');
  viewport.appendChild(box);
  // Actual line boxes include descenders/combining marks. Just a few pixels of reserve,
  // rather than the former blanket line-and-a-half that caused premature page endings.
  const first=leaf.querySelector('p');
  const lineCS=getComputedStyle(first||leaf);
  const linePx=parseFloat(lineCS.lineHeight)||parseFloat(lineCS.fontSize)*1.7||30;
  const line=Math.max(12,linePx);
  viewport.style.setProperty('--pdl-grid-line',line+'px');
  const rows=Math.max(2,Math.floor((height-2)/line));
  return {box,limit:rows*line};
};
const pdlHyphPrevRender=render;
render=function(){pdlHyphPrevRender();PDL_HYPH.apply(document.getElementById('page-content'));PDL_HYPH.apply(document.getElementById('pdl-second-page'));};
pdlSetFont(pdlFont);pdlSetTheme(pdlTheme);pdlSetLayout(pdlLayout);

// Hyphenation is an editorial setting injected from the published book, never localStorage.
pdlPaginate();
PDL_HYPH.activate();

renderBookmarks();
render();

// PDL v1.3.3 desktop ergonomics
function pdlSyncDrawer(){
 const open=document.getElementById('sidebar')?.classList.contains('open')||false;
 document.body.classList.toggle('pdl-drawer-open',open);
 const btn=document.getElementById('pdl-drawer-toggle');
 if(btn){btn.setAttribute('aria-expanded',String(open));btn.setAttribute('aria-label',open?'Κλείσιμο περιεχομένων και γλωσσαρίου':'Άνοιγμα περιεχομένων και γλωσσαρίου');btn.title=open?'Κλείσιμο περιεχομένων και γλωσσαρίου':'Άνοιγμα περιεχομένων και γλωσσαρίου';}
}
function pdlToggleDrawer(){toggleSidebar();pdlSyncDrawer();if(document.getElementById('sidebar').classList.contains('open'))document.getElementById('gloss-search')?.setAttribute('autocomplete','off');}
const pdlOldOpenSettings=pdlOpenSettings;
pdlOpenSettings=function(){pdlOldOpenSettings();pdlSyncDrawer();};
const pdlOldToggleSidebar=toggleSidebar;
toggleSidebar=function(){pdlOldToggleSidebar();pdlSyncDrawer();};
function pdlToggleHeight(){
 const on=document.body.classList.toggle('pdl-height-max');
 document.getElementById('pdl-height-toggle')?.setAttribute('aria-pressed',String(on));
 localStorage.setItem('pdlHeightMax',String(on));pdlScheduleRelayout();
}


if(localStorage.getItem('pdlHeightMax')==='true'){document.body.classList.add('pdl-height-max');document.getElementById('pdl-height-toggle')?.setAttribute('aria-pressed','true');}
pdlSyncDrawer();

// PDL v1.3.5: wheel navigation for paginated reading, desktop only.
// Accumulate trackpad deltas, act once per gesture, never intercept editable or sidebar scrolling.
(() => {
  let accumulated=0, lastEvent=0, lastTurn=0;
  const RESET_MS=230, TURN_GUARD_MS=470;
  document.addEventListener('wheel', (event) => {
    if (window.innerWidth <= 768 || event.ctrlKey || event.metaKey || event.altKey) return;
    const target=event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('input, textarea, select, [contenteditable="true"], .sidebar, .text-search-bar, .mobile-gloss-popup, .pdl-rail, button, [role="dialog"]')) return;
    if (!target.closest('.main-area')) return;
    // The document itself stays paginated; prevent unintended background scrolling.
    if (event.cancelable) event.preventDefault();
    const now=performance.now();
    if(now-lastEvent>RESET_MS) accumulated=0;
    lastEvent=now;
    if(now-lastTurn<TURN_GUARD_MS) return;
    let delta=event.deltaY;
    if(event.deltaMode===1) delta*=16;
    else if(event.deltaMode===2) delta*=window.innerHeight;
    if(!Number.isFinite(delta)) return;
    accumulated+=delta;
    if(Math.abs(accumulated)<68) return;
    const forward=accumulated>0;
    accumulated=0;lastTurn=now;
    if(forward) nextPage(); else prevPage();
  }, {passive:false});
})();
