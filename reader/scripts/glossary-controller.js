
(function(){
 'use strict';
 // Unified glossary input: one double-click listener, one popup, one index.
 const isWordCore=c=>!!c&&/[\p{L}\p{M}\p{N}'’‘ʼ\u00ad\u200c\u200d]/u.test(c);
 const isWordPart=(t,i)=>{
   const c=t[i]||'';
   return isWordCore(c)||(/[-‐‑‒–—−]/u.test(c)&&isWordCore(t[i-1])&&isWordCore(t[i+1]));
 };
 window.pdlWordAtPoint=function(x,y){
  let r=document.caretRangeFromPoint?.(x,y);
  if(!r&&document.caretPositionFromPoint){const c=document.caretPositionFromPoint(x,y);if(c){r=document.createRange();r.setStart(c.offsetNode,c.offset);r.collapse(true);}}
  if(!r)return '';
  const node=r.startContainer,element=node.nodeType===3?node.parentElement:node;
  const container=element?.closest?.('#page-content p,#page-content div,#page-content span,#pdl-spread-rail p,#text-viewport p');
  if(!container)return '';
  const paragraph=container.closest('p')||container;
  const walker=document.createTreeWalker(paragraph,NodeFilter.SHOW_TEXT);let n,offset=-1,length=0;
  while(n=walker.nextNode()){if(n===node)offset=length+r.startOffset;length+=n.textContent.length;}
  if(offset<0)return '';
  const text=paragraph.textContent||'';
  let a=Math.min(offset,text.length-1);
  if(!isWordPart(text,a)&&a>0&&isWordPart(text,a-1))a--;
  if(!isWordPart(text,a))return '';
  let b=a+1;while(a>0&&isWordPart(text,a-1))a--;while(b<text.length&&isWordPart(text,b))b++;
  return text.slice(a,b).replace(/[\u00ad\u200b\u200c\u200d\u2060]/g,'');
 };
 // v2.0.5: identify full multiword / hyphenated headwords at the click position.
 // Match across nested text nodes (search highlighting, hyphenation, OPF leaf HTML),
 // never only the browser's automatically selected single word.
 // A hyphen joins a word ONLY when it has word characters on BOTH sides.
 // Thus -Χαΐρ-χαπέρ’ (dialogue) and χαΐρ-χαπέρ’- (trailing dash)
 // are accepted without matching inside an unrelated, longer compound.
 const pdlGlossPhraseChar=(text,index)=>{
  if(index<0||index>=text.length)return false;
  const c=text[index],word=x=>!!x&&/[\p{L}\p{M}\p{N}'’‘ʼ]/u.test(x);
  return word(c)||(c==='-'&&word(text[index-1])&&word(text[index+1]));
 };
 const pdlGlossPhraseNorm=s=>String(s).normalize('NFC')
    .replace(/[’‘ʼ`΄´]/g,"'").replace(/[‐‑‒–—−]/g,'-')
    .replace(/[\u00ad\u200b-\u200d\u2060]/g,'')
    .toLocaleLowerCase('el-GR');
 const pdlGlossEscapeRE=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 let pdlPhraseIndex=null;
 function pdlGetPhraseIndex(){
   if(pdlPhraseIndex)return pdlPhraseIndex;
   const seen=new Set(),terms=[];
   for(const [key,entry] of Object.entries(glossary)){
     if(!entry)continue;
     const term=String(entry.term||key).trim();
     if(!/[\s\-‐‑‒–—−]/u.test(term)||seen.has(term))continue;
     seen.add(term);
     const norm=pdlGlossPhraseNorm(term);
     if(!norm)continue;
     // Allow multiple spaces/newlines between terms, without skipping punctuation.
     const body=pdlGlossEscapeRE(norm).replace(/ +/g,' +');
     terms.push({term,norm,length:norm.length,exact:new RegExp(body,'gu'),
       loose:new RegExp(pdlGlossEscapeRE(norm.normalize('NFD').replace(/\p{M}/gu,'')).replace(/ +/g,' +'),'gu')});
   }
   terms.sort((a,b)=>b.length-a.length);
   return pdlPhraseIndex=terms;
 }
 function pdlMappedParagraph(text,loose){
   const map=[],parts=[];
   // Unicode grapheme-like clusters retain their original UTF-16 caret offsets,
   // even when NFC merges a base letter with a Pontic combining mark.
   const re=/\P{M}\p{M}*|\p{M}+/gu;
   for(const m of text.matchAll(re)){
     let fragment=pdlGlossPhraseNorm(m[0]);
     if(loose)fragment=fragment.normalize('NFD').replace(/\p{M}/gu,'');
     const from=m.index,to=from+m[0].length;
     for(let i=0;i<fragment.length;i++){parts.push(fragment[i]);map.push({from,to});}
   }
   return {text:parts.join(''),map};
 }
 function pdlFindPhraseAt(text,offset,loose){
   const {text:normal,map}=pdlMappedParagraph(text,loose);
   if(!normal)return null;
   for(const item of pdlGetPhraseIndex()){
     const re=loose?item.loose:item.exact;
     re.lastIndex=0;
     let m;
     while((m=re.exec(normal))){
       const start=m.index,end=start+m[0].length;
       if(start>=end)break;
       // Match whole terms, not the beginning of a longer word or compound.
       if(pdlGlossPhraseChar(normal,start-1)||pdlGlossPhraseChar(normal,end)){re.lastIndex=start+1;continue;}
       const rawStart=map[start].from,rawEnd=map[end-1].to;
       if(offset>=rawStart&&offset<=rawEnd){
         const focus=Math.min(offset,text.length-1);
         // A click inside whitespace between two terms is not a lookup.
         if(!/[\p{L}\p{M}\p{N}'’‘ʼ-]/u.test(text[focus]||'') &&
            !/[\p{L}\p{M}\p{N}'’‘ʼ-]/u.test(text[focus-1]||''))return null;
         const options=pdlCandidates(item.term);
         if(options.length)return {word:item.term,candidates:options};
       }
       re.lastIndex=start+1;
     }
   }
   return null;
 }
 window.pdlPhraseAtPoint=function(x,y){
   let range=document.caretRangeFromPoint?.(x,y);
   if(!range&&document.caretPositionFromPoint){const p=document.caretPositionFromPoint(x,y);if(p){range=document.createRange();range.setStart(p.offsetNode,p.offset);range.collapse(true);}}
   if(!range||range.startContainer.nodeType!==Node.TEXT_NODE)return null;
   const node=range.startContainer;
   const para=node.parentElement?.closest('#text-viewport p');
   if(!para)return null;
   let offset=-1,passed=0,n;
   const walker=document.createTreeWalker(para,NodeFilter.SHOW_TEXT);
   while(n=walker.nextNode()){
     if(n===node)offset=passed+range.startOffset;
     passed+=n.nodeValue.length;
   }
   if(offset<0)return null;
   const text=para.textContent||'';
   return pdlFindPhraseAt(text,offset,false)||pdlFindPhraseAt(text,offset,true);
 };
 window.pdlPhraseDiagnostic=(text,offset)=>pdlFindPhraseAt(text,offset,false)||pdlFindPhraseAt(text,offset,true);
 function popupChoices(matches,point){
  document.getElementById('pdl-inline-gloss')?.remove();
  const pop=document.createElement('aside');pop.id='pdl-inline-gloss';pop.setAttribute('role','dialog');pop.setAttribute('aria-label','Επιλογή λήμματος');
  pop.style.cssText='position:fixed;z-index:99999;background:var(--paper,#fffaf0);color:var(--md-on-surface,#222);border:1px solid #b4aaa0;border-radius:12px;box-shadow:0 5px 24px #0004;padding:12px;max-width:min(90vw,360px);';
  const heading=document.createElement('strong');heading.textContent='Πιθανά λήμματα';pop.append(heading);
  for(const entry of matches){const btn=document.createElement('button');btn.type='button';btn.textContent=entry.term;btn.style.cssText='display:block;padding:7px;margin-top:5px;width:100%;text-align:left';btn.onclick=()=>showGloss(entry.term,entry,point);pop.append(btn);}
  document.body.append(pop);const b=pop.getBoundingClientRect();pop.style.left=Math.max(8,Math.min(point.x+12,innerWidth-b.width-8))+'px';pop.style.top=Math.max(8,Math.min(point.y+12,innerHeight-b.height-8))+'px';
  pdlGlossAutoClose(pop,()=>pop.remove());
 }
 window.pdlShowGlossChoices=popupChoices;
 document.addEventListener('dblclick',event=>{
  // Mobile double-tap belongs exclusively to the immersive toolbar toggle.
  // Some browsers also synthesize dblclick from two taps: never treat it as glossary lookup.
  if(window.innerWidth<=768||window.matchMedia('(pointer: coarse)').matches)return;
  if(!event.target.closest?.('#text-viewport'))return;
  const phrase=window.pdlPhraseAtPoint(event.clientX,event.clientY);
  if(phrase?.candidates?.length){
   if(phrase.candidates.length===1)showGloss(phrase.word,phrase.candidates[0],{x:event.clientX,y:event.clientY});
   else popupChoices(phrase.candidates,{x:event.clientX,y:event.clientY});
   event.preventDefault();event.stopImmediatePropagation();return;
  }
  const selected=window.getSelection()?.toString().trim()||'';
  const fromPointer=pdlWordAtPoint(event.clientX,event.clientY);
  const opts=[fromPointer,selected].filter(Boolean);
  for(const word of opts){
   const candidates=pdlCandidates(word);
   if(!candidates.length)continue;
   if(candidates.length===1)showGloss(word,candidates[0],{x:event.clientX,y:event.clientY});
   else popupChoices(candidates,{x:event.clientX,y:event.clientY});
   event.preventDefault();event.stopImmediatePropagation();return;
  }
 },true);
 document.addEventListener('keydown',e=>{
  if(e.key!=='Escape')return;
  const popup=document.getElementById('pdl-inline-gloss');
  if(popup){popup.remove();e.preventDefault();e.stopImmediatePropagation();return;}
  const search=document.getElementById('text-search-bar');
  if(search&&!search.classList.contains('hidden')){if(typeof closeTextSearch==='function')closeTextSearch();e.preventDefault();e.stopImmediatePropagation();return;}
  const side=document.getElementById('sidebar');
  if(side?.classList.contains('open')){side.classList.remove('open');document.body.classList.remove('pdl-drawer-open');window.pdlV1315SyncStates?.();e.preventDefault();e.stopImmediatePropagation();}
 },true);
 // Desktop search navigation icons are inline SVG: no material icon font dependency.
 const iconPaths={'ts-prev':'M12 19V5m-7 7 7-7 7 7','ts-next':'M12 5v14m-7-7 7 7 7-7'};
 for(const [id,path]of Object.entries(iconPaths)){
  const btn=document.getElementById(id);if(!btn)continue;
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.style.cssText='width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;';
  const line=document.createElementNS('http://www.w3.org/2000/svg','path');line.setAttribute('d',path);svg.append(line);btn.replaceChildren(svg);
 }
 function enforceLayout(){if(window.innerWidth>768)return; if(typeof pdlLayout!=='undefined' && pdlLayout!=='single'){pdlSetLayout('single');}else document.body.classList.remove('pdl-double');}
 window.addEventListener('resize',enforceLayout,{passive:true});enforceLayout();
 window.pdlLookupDiagnostic=word=>({word,candidates:pdlCandidates(word).map(e=>({term:e.term,etymology:e.etymology,definition:e.def}))});
})();
