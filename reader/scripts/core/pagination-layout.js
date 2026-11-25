// PONTIAN DIGITAL LIBRARY READER v1.0 — fluid pagination engine.
// Source chapters remain unchanged; page layout is derived from measured DOM.
const PDL_SOURCE = chapters.map(ch => ({ ...ch, blocks: ch.pages.flat().map(p => ({ ...p })) }));
let pdlLayoutInProgress = false;
let pdlResizeTimer = null;
/* Greek discretionary breaks come from the pinned Hyphenopoly WASM patterns.
   The source stays unchanged; measured and rendered DOM use the same cuts.
   Pontic joining marks and original grapheme/UTF-16 boundaries are protected. */
// v2.2.0. Hyphenopoly WebAssembly, as in the standalone live lab.
// Both body measurements and visible pages use identical discretionary cuts.
// No arbitrary grapheme cuts: punctuation, word apostrophes and Pontic combining
// marks remain attached; each break originates from the chosen Greek pattern.
const PDL_HYPH=(function(){
 const SHY='\u00AD';
 const RUN=/[\p{Script=Greek}\p{M}]+/gu;
 const NONWORD_NEIGHBOUR=/[\p{L}\p{N}_'’‘ʼ΄´`\u00AD]/u;
 const JOINING=/[\u035C-\u0362]/u;
 const minLeft=3,minRight=3;
 const segmenter=typeof Intl.Segmenter==='function' ? new Intl.Segmenter('el',{granularity:'grapheme'}) : null;
 const hyphenators=Object.create(null), cache=new Map();
 // Keep editorial soft hyphens intact. Track only the discretionary breaks
 // added by this renderer, so repeated render() calls are idempotent.
 const renderedText=new WeakMap();
 let hasRenderedAutomatic=false;
 let selected=PDL_BOOK_EDITOR_SETTINGS.hyphenation;let loaded=false,attempted=false,failed=false;
 const modes=new Set(['el-polyton','el-monoton','off']);
 function status(message){const el=document.getElementById('pdl-hyphen-status');if(el)el.textContent=message;}
 function mode(){return selected;}
 function ready(){return loaded;}
 function pending(){return selected!=='off'&&!loaded&&!failed;}
 function setMode(value){selected=modes.has(value)?value:'el-polyton';cache.clear();

  status(selected==='off'?'Απενεργοποιημένος':loaded?'Hyphenopoly 6.1.0 · '+selected:'Αναμονή φόρτωσης Hyphenopoly');
 }
 function graphemes(word){
   if(segmenter)return [...segmenter.segment(word)].map(x=>({t:x.segment,end:x.index+x.segment.length}));
   // Preserve polytonic combining-mark clusters without Intl.Segmenter.
   let offset=0;const out=[];
   for(const part of word){offset+=part.length;
    if(/\p{M}/u.test(part)&&out.length){out[out.length-1].t+=part;out[out.length-1].end=offset;}
    else out.push({t:part,end:offset});
   }
   return out;
 }
 function tokenBreaks(raw){
  if(selected==='off'||!loaded||failed||raw.length<6)return [];
  const key=selected+'\0'+raw;
  if(cache.has(key))return cache.get(key);
  let result=[];
  try{
   if(/[\u00AD'’‘ʼ΄´`]/u.test(raw))return [];
   const gs=graphemes(raw);
   if(gs.some(g=>JOINING.test(g.t)))return [];
   const normalized=gs.map(g=>g.t.normalize('NFC')).join('');
   const h=hyphenators[selected];if(!h)return [];
   // Hyphenopoly 6.x string hyphenators default to '.hyphenate'.
   // Our configuration registers only '.pdl-hyphen-probe', so pass that
   // selector explicitly; otherwise the library cannot read minWordLength.
   const output=String(h(normalized,'.pdl-hyphen-probe'));
   if(output.split(SHY).join('')!==normalized)return [];
   const cuts=[];let at=0;
   for(const item of output.split(SHY).slice(0,-1)){at+=item.length;cuts.push(at);}
   let len=0;
   const map=new Map(),graphemeIndex=new Map();
   for(let i=0;i<gs.length;i++){
    const g=gs[i];len+=g.t.normalize('NFC').length;
    map.set(len,g.end);graphemeIndex.set(g.end,i+1);
   }
   // Polytonic combining marks can occupy several code units per letter.
   // Hyphenopoly left/right minima apply to grapheme clusters, not UTF-16.
   result=cuts.map(k=>map.get(k)).filter(k=>{
    if(!Number.isInteger(k)||k<=0||k>=raw.length)return false;
    const left=graphemeIndex.get(k);
    return left>=minLeft && gs.length-left>=minRight;
   });
  }catch(e){
   // A malformed or unavailable WASM hyphenator must not emit an error for
   // every word of a long book, potentially freezing the browser.
   if(!failed)console.warn('Hyphenopoly unavailable for this reading session; continuing without automatic breaks',e);
   failed=true;loaded=false;cache.clear();
   status('Συλλαβισμός προσωρινά μη διαθέσιμος');
  }
  if(cache.size>12000)cache.clear();
  cache.set(key,result);return result;
 }
 function positions(text){
  if(selected==='off'||!loaded)return [];
  const out=[];let m;RUN.lastIndex=0;
  while((m=RUN.exec(text))){
    const at=m.index,end=at+m[0].length;
    if(at>0&&NONWORD_NEIGHBOUR.test(text[at-1]))continue;
    if(end<text.length&&NONWORD_NEIGHBOUR.test(text[end]))continue;
    for(const k of tokenBreaks(m[0]))out.push(at+k);
  }
  return out;
 }
 // Map DOM offsets in hyphenated validation back to the untouched source.
 // The renderer inserts U+00AD only into text nodes, never into source blocks.
 function sourceOffset(node,renderedOffset){
   const record=renderedText.get(node);
   if(!record||record.rendered!==node.nodeValue)return renderedOffset;
   let src=0,rendered=0;
   const actual=record.rendered,original=record.source;
   while(rendered<renderedOffset&&rendered<actual.length){
     if(src<original.length&&actual[rendered]===original[src]){src++;rendered++;}
     else if(actual[rendered]===SHY)rendered++;
     else {src++;rendered++;}
   }
   return src;
 }
 function apply(root){
   if(!root||((selected==='off'||!loaded)&&!hasRenderedAutomatic))return;
   const paras=root.nodeName==='P'?[root]:Array.from(root.querySelectorAll('p'));
   for(const para of paras){
    const nodes=[];let full='';const walk=document.createTreeWalker(para,NodeFilter.SHOW_TEXT);let n;
    while((n=walk.nextNode())){
      const previous=renderedText.get(n);
      // If another operation changed a node, its current contents become the
      // new source; never overwrite externally edited material with old text.
      const source=previous&&previous.rendered===n.nodeValue?previous.source:n.nodeValue;
      nodes.push({node:n,start:full.length,len:source.length,source});full+=source;
    }
    const cuts=selected==='off'||!loaded?[]:positions(full);let i=0;
    for(const item of nodes){
      const end=item.start+item.len,v=item.source;let from=0,out='';
      while(i<cuts.length&&cuts[i]<=end){const off=cuts[i++]-item.start;
       if(off>from&&off<=v.length){out+=v.slice(from,off)+SHY;from=off;}
      }
      const rendered=from>0?out+v.slice(from):v;
      if(rendered!==v)hasRenderedAutomatic=true;
      if(item.node.nodeValue!==rendered)item.node.nodeValue=rendered;
      renderedText.set(item.node,{source:v,rendered});
    }
   }
 }
 async function activate(){
  if(attempted||selected==='off')return;attempted=true;
  let deadline;
  try{
   if(window.__pdlHyphenopolyLoaderError||!window.Hyphenopoly?.hyphenators)throw Error('Δεν φορτώθηκε ο Hyphenopoly_Loader.js');
   const keys=['el-polyton','el-monoton'];
   // A missing/blocked pattern must not leave an empty Reader indefinitely.
   const fns=await Promise.race([
    Promise.all(keys.map(k=>Promise.resolve(window.Hyphenopoly.hyphenators[k]))),
    new Promise((resolve,reject)=>{deadline=setTimeout(()=>reject(Error('Hyphenopoly load timeout')),3000);})
   ]);
   if(!fns.every(f=>typeof f==='function'))throw Error('Δεν βρέθηκαν τα δύο ελληνικά πρότυπα');
   keys.forEach((k,i)=>hyphenators[k]=fns[i]);loaded=true;failed=false;cache.clear();
   status(selected==='off'?'Απενεργοποιημένος':'Hyphenopoly 6.1.0 · '+selected);
   if(!pdlLayoutInProgress)pdlScheduleRelayout();else setTimeout(pdlScheduleRelayout,300);
  }catch(e){console.warn('Hyphenopoly unavailable, safe no-hyphen fallback',e);
   failed=true;loaded=false;
   status('Δεν φορτώθηκε · ασφαλής ανάγνωση χωρίς συλλαβισμό');
   pdlScheduleRelayout();
  }finally{clearTimeout(deadline);}
 }
 return {SHY,positions,apply,sourceOffset,tokenBreaks,mode,ready,pending,setMode,activate};
})();
function pdlPlain(html) { const el=document.createElement('div'); el.innerHTML=html||''; return (el.textContent||'').replace(/\u00AD/g,''); }
function pdlBlockAttributes(block){
 const align=['left','right','center','justify'].includes(block?.align)?block.align:'justify';
 const headingLevel=Math.min(3,Math.max(0,Number(block?.headingLevel)|| (block?.heading?3:0)));
 const classes=[
  headingLevel?'pdl-rich-heading pdl-rich-h'+headingLevel:'',
  block?.listKind?'pdl-rich-list-item':'',
  block?.quote?'pdl-rich-quote':''
 ].filter(Boolean).join(' ');
 return {align,headingLevel,classes};
}
// A single HTML renderer for native pages, companion leaves, OpenPageFlip and
// the strict pagination validator. Keep all rich inline tags and hard <br> marks.
function pdlBlockMarkup(block){
 if(block.type==='divider')return '<div class="section-divider" role="separator" aria-label="Αλλαγή ενότητας">* * *</div>';
 if(block.type==='telos')return '<div class="telos">Τέλος</div>';
 if(block.type==='table')return '<div class="pdl-rich-table-wrap">'+(block.text||'')+'</div>';
 if(block.type==='image')return '<div class="pdl-rich-image-wrap">'+(block.text||'')+'</div>';
 const a=pdlBlockAttributes(block);
 const classes=[block.type==='dialogue'?'dialogue':'',
  block._pdlAnchor?.offset?'pdl-continuation':'',
  block._pdlContinues?'pdl-fragment-continues':'',a.classes].filter(Boolean).join(' ');
 return '<p data-pdl-align="'+a.align+'" class="'+classes+'">'+(block.text||'')+'</p>';
}
function pdlBlockNode(block, withHyphenation=true) {
 const n=document.createElement(block.type==='p'||block.type==='dialogue'?'p':'div');
 if(block.type==='dialogue')n.className='dialogue';
 else if(block.type==='divider')n.className='section-divider';
 else if(block.type==='telos')n.className='telos';
 else if(block.type==='table')n.className='pdl-rich-table-wrap';
 else if(block.type==='image')n.className='pdl-rich-image-wrap';
 if(n.nodeName==='P'){
  const a=pdlBlockAttributes(block);n.setAttribute('data-pdl-align',a.align);
  if(a.headingLevel){n.classList.add('pdl-rich-heading','pdl-rich-h'+Math.min(3,a.headingLevel));}
  else if(block.heading)n.classList.add('pdl-rich-heading','pdl-rich-h3');
  if(block.listKind)n.classList.add('pdl-rich-list-item');
  if(block.quote)n.classList.add('pdl-rich-quote');
 }
 if(block.type==='divider')n.textContent='***';
 else if(block.type==='telos')n.textContent='Τέλος';
 else n.innerHTML=block.text||'';
 if(withHyphenation&&n.nodeName==='P')PDL_HYPH.apply(n);
 return n;
}
function pdlHeading(ch) {
  if(!PDL_BOOK_EDITOR_SETTINGS.showChapterTitles)return document.createDocumentFragment();
  const el=document.createElement('div'); el.className='chapter-heading';
  const inner=document.createElement('div'); inner.className='chapter-number'; inner.textContent=ch.number;
  el.appendChild(inner);return el;
}
function pdlMeasureBox() {
  const vp=document.getElementById('text-viewport');
  const actual=document.getElementById('page-content');
  const vpCSS=getComputedStyle(vp),pageCSS=actual?getComputedStyle(actual):null;
  const vpRect=vp.getBoundingClientRect();
  const horizontal=parseFloat(vpCSS.paddingLeft)+parseFloat(vpCSS.paddingRight);
  const vertical=parseFloat(vpCSS.paddingTop)+parseFloat(vpCSS.paddingBottom);
  const maxWidth=pageCSS?parseFloat(pageCSS.maxWidth):Infinity;
  const targetWidth=actual?.getBoundingClientRect().width || Math.min(vpRect.width-horizontal,maxWidth);
  const width=Math.max(140,targetWidth);
  const box=document.createElement('div');
  box.className='page-content pdl-measure';
  box.style.cssText=`position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none;z-index:-1;width:${width}px;min-width:${width}px;max-width:${width}px;margin:0;box-sizing:border-box;`;
  // Attach inside the same viewport so inherited font, line-height, and typography agree.
  vp.appendChild(box);
  const available=Math.max(100,vpRect.height-vertical);
  // Small measured breathing room: a last line must be completely visible, including combining marks.
  const fontPx=pageCSS?parseFloat(pageCSS.fontSize):16;
  const safe=Math.max(3,Math.min(7,fontPx*.22));
  const limit=Math.max(80,available-safe);
  return {box,limit};
}
function pdlFits(box,limit) {return Math.max(box.scrollHeight,box.getBoundingClientRect().height) <= limit;}
// Split a paragraph using DOM Range to preserve inline span annotations and diacritics.
// Offsets are calculated over Unicode text nodes, not over HTML markup.
// v2.1.6: Fit a page to the measured lower limit. Prefer real word boundaries,
// but allow a final grapheme-safe mid-word break when it uses available space.
// The original chapter text is never changed; a visual hyphen is added only
// to the rendered fragment when a word must continue on the next page.
function pdlSplitBlock(block, remaining, box, limit) {
  const source=pdlBlockNode({...block,text:remaining},false);
  const plain=source.textContent||'',total=plain.length;
  if(!total)return null;
  const nodes=[],walker=document.createTreeWalker(source,NodeFilter.SHOW_TEXT);
  let n,at=0;
  while((n=walker.nextNode())){const length=n.nodeValue.length;
   if(!length)continue;nodes.push({node:n,start:at,end:at+length});at+=length;}
  if(!nodes.length)return null;
  function pieces(cut){
    const t=nodes.find(x=>cut<=x.end)||nodes[nodes.length-1];
    const off=Math.min(t.node.nodeValue.length,Math.max(0,cut-t.start));
    const a=document.createRange();a.selectNodeContents(source);a.setEnd(t.node,off);
    const b=document.createRange();b.selectNodeContents(source);b.setStart(t.node,off);
    const first=source.cloneNode(false),second=source.cloneNode(false);
    first.appendChild(a.cloneContents());second.appendChild(b.cloneContents());
    return {first:first.innerHTML,second:second.innerHTML};
  }
  const isMidWord=cut=>/\p{L}/u.test(plain[cut-1]||'')&&/\p{L}/u.test(plain[cut]||'');
  const marker='<span class="pdl-page-break-hyphen" aria-hidden="true"></span>';
  function fits(cut){
    const split=pieces(cut),hyphen=isMidWord(cut);
    const child=pdlBlockNode({...block,text:split.first+(hyphen?marker:'')});child.classList.add('pdl-fragment-continues');
    box.append(child);const ok=pdlFits(box,limit);child.remove();
    return {ok,split,hyphen};
  }
  const wordCuts=[];const re=/\s+/gu;let m;
  while((m=re.exec(plain)))if(m.index+m[0].length<total)wordCuts.push(m.index+m[0].length);
  const hyphCuts=PDL_HYPH.positions(plain).filter(k=>isMidWord(k));
  // Only complete word boundaries and approved pattern cuts are eligible.
  // This removes the v2.1.6 "last grapheme at any cost" failure.
  const cuts=[...new Set([...wordCuts,...hyphCuts])].filter(x=>x>0&&x<total).sort((a,b)=>a-b);
  let lo=0,hi=cuts.length-1,best=-1;
  while(lo<=hi){const mid=(lo+hi)>>1;
    if(fits(cuts[mid]).ok){best=cuts[mid];lo=mid+1;}else hi=mid-1;
  }
  if(best<1)return null;
  // A paragraph continued onto a new page must not leave just one word there.
  // CSS widows/orphans cannot help: each page contains a separate P element.
  // Backtrack to an earlier *whole-word* boundary, moving the last two words
  // together when the otherwise maximal cut would strand the final word.
  const remainderWords=cut=>(plain.slice(cut).trim().match(/\S+/gu)||[]).length;
  if(remainderWords(best)<2){
    const earlier=wordCuts.filter(cut=>cut<=best&&remainderWords(cut)>=2);
    if(!earlier.length)return null; // Move the whole paragraph to the next page.
    best=earlier[earlier.length-1];
  }
  const result=fits(best);
  if(!result.ok)return null;
  return {first:result.split.first+(result.hyphen?marker:''),second:result.split.second,count:best};
}
function pdlPageAnchor(ch,pg){
  return (chapters[ch]?.pages[pg]||[]).find(b=>b._pdlAnchor)?._pdlAnchor || {index:0,offset:0};
}
function pdlPositionPage(ch,anchor){
  const pages=chapters[ch]?.pages||[];
  let best=0;
  pages.forEach((page,i)=>{const a=page.find(b=>b._pdlAnchor)?._pdlAnchor;
    if(a&&(a.index<anchor.index||(a.index===anchor.index&&a.offset<=anchor.offset)))best=i;
  });
  return best;
}
function pdlLegacyPaginate() {
  if(pdlLayoutInProgress)return;
  const vp=document.getElementById('text-viewport');if(!vp||vp.clientWidth<80||vp.clientHeight<80)return;
  pdlLayoutInProgress=true;
  const oldAnchor=typeof pdlReadingAnchor==='function'?pdlReadingAnchor(currentChapter,currentPage):pdlPageAnchor(currentChapter,currentPage);
  const {box,limit}=pdlMeasureBox();
  try{
    for(let ci=0;ci<chapters.length;ci++){
      const source=PDL_SOURCE[ci], target=chapters[ci];
      target.pages=[];let page=[],position=0;
      const reset=()=>{box.replaceChildren();if(!target.pages.length)box.appendChild(pdlHeading(source));};
      const push=()=>{if(page.length){target.pages.push(page);page=[];}reset();};
      reset();
      for(let bi=0;bi<source.blocks.length;bi++){
        const b=source.blocks[bi];let remaining=b.text||'',offset=0;
        if(b.type==='divider'||b.type==='telos'||b.type==='table'||b.type==='image'){
          const node=pdlBlockNode(b);box.appendChild(node);
          if(!pdlFits(box,limit)&&page.length){node.remove();push();box.appendChild(pdlBlockNode(b));}
          page.push({...b,_pdlAnchor:{index:bi,offset:0}});continue;
        }
        let safety=0;
        while(remaining && safety++<10000){
          const node=pdlBlockNode({...b,text:remaining});box.appendChild(node);
          if(pdlFits(box,limit)){
            page.push({...b,text:remaining,_pdlAnchor:{index:bi,offset}});remaining='';break;
          }
          node.remove();
          const split=pdlSplitBlock(b,remaining,box,limit);
          if(!split){
            if(page.length){push();continue;}
            // A long unsplittable token stays intact. Never amputate a word,
            // even if this produces an imperfect page in a tiny viewport.
            page.push({...b,text:remaining,_pdlAnchor:{index:bi,offset}});
            remaining='';break;
          }
          if(split.count===0)break;
          page.push({...b,text:split.first,_pdlContinues:true,_pdlAnchor:{index:bi,offset}});
          offset+=split.count;remaining=split.second;
          if(!pdlPlain(remaining).trim()){remaining='';break;}
          push();
        }
      }
      if(page.length)target.pages.push(page);
      if(!target.pages.length)target.pages=[[]];
    }
    currentPage=pdlPositionPage(currentChapter,oldAnchor);
    textIndex=null;
  }finally{box.remove();pdlLayoutInProgress=false;}
}

// The Grid opt-in is still used by the live progressive dispatcher.
// Keep the word/HTML slicing helpers below: progressive batches call them.
let pdlGridEnabled=localStorage.getItem('pdlGridEngine')!=='off';
function pdlGridWordify(root,hyphenated=false){
 const words=[];let offset=0;
 const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);const nodes=[];
 while(walker.nextNode())nodes.push(walker.currentNode);
 for(const n of nodes){const value=n.nodeValue||'';if(!value)continue;
  const frag=document.createDocumentFragment();const pattern=/\s+|\S+/gu;let m;
  while((m=pattern.exec(value))){
   if(/^\s+$/u.test(m[0])){frag.append(document.createTextNode(m[0]));continue;}
   const word=m[0];
   // Both source-authored soft hyphens and Hyphenopoly cuts are eligible.
   // Offsets always refer to the original source, never the added separators.
   const manual=[];for(let k=0;k<word.length;k++)if(word[k]==='\u00AD')manual.push(k+1);
   const cuts=hyphenated?[...new Set([...manual,...PDL_HYPH.positions(word)])]
    .filter(k=>k>0&&k<word.length).sort((a,b)=>a-b):[];
   let from=0;
   for(const to of [...cuts,word.length]){
    const raw=word.slice(from,to),manualTail=raw.endsWith('\u00AD');
    const part=manualTail?raw.slice(0,-1):raw;
    if(part){
     const span=document.createElement('span');span.className='pdl-grid-word';
     span.dataset.offset=String(offset+m.index+from);span.textContent=part;
     frag.append(span);words.push(span);
    }
    if(to<word.length)frag.append(document.createTextNode('\u00AD'));
    else if(manualTail)frag.append(document.createTextNode('\u00AD'));
    from=to;
   }
  }
  offset+=value.length;n.replaceWith(frag);
 }
 return {words,length:offset};
}
function pdlGridSliceBlock(block,start,end){
 const src=pdlBlockNode(block,false);const walker=document.createTreeWalker(src,NodeFilter.SHOW_TEXT);let at=0,n;
 const nodes=[];while((n=walker.nextNode())){const len=n.nodeValue.length;nodes.push({node:n,start:at,end:at+len});at+=len;}
 if(!nodes.length)return block.text||'';
 const point=v=>{const target=nodes.find(t=>v<=t.end)||nodes[nodes.length-1];return {node:target.node,offset:Math.max(0,Math.min(target.node.length,v-target.start))};};
 const range=document.createRange();const a=point(Math.max(0,start)),z=point(Math.min(at,end));
 range.setStart(a.node,a.offset);range.setEnd(z.node,z.offset);
 const container=src.cloneNode(false);container.append(range.cloneContents());return container.innerHTML;
}

