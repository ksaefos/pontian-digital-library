
(function(){
 const mobile=()=>innerWidth<=768;
 const bookmark=document.getElementById('pdl-mobile-bookmark-toggle');
 let press=null,pressTimer=0,ignoreClick=false;
 const clearPress=()=>{clearTimeout(pressTimer);pressTimer=0;press=null;};
 bookmark.addEventListener('pointerdown',e=>{
  if(!mobile()||e.button!==0||!e.isPrimary)return;
  clearPress();ignoreClick=false;press={id:e.pointerId,x:e.clientX,y:e.clientY};
  bookmark.setPointerCapture(e.pointerId);
  pressTimer=setTimeout(()=>{if(!press)return;ignoreClick=true;pdlOpenMobileBookmarks();},550);
 });
 bookmark.addEventListener('pointermove',e=>{
  if(press&&press.id===e.pointerId&&Math.hypot(e.clientX-press.x,e.clientY-press.y)>10){ignoreClick=true;clearPress();}
 });
 bookmark.addEventListener('pointerup',clearPress);
 bookmark.addEventListener('pointercancel',()=>{ignoreClick=true;clearPress();});
 bookmark.addEventListener('lostpointercapture',clearPress);
 // Suppress the pointer click following a hold, while retaining keyboard
 // and assistive-technology activation (detail=0) after the list is closed.
 bookmark.addEventListener('click',e=>{if(ignoreClick){ignoreClick=false;if(e.detail!==0){e.preventDefault();e.stopImmediatePropagation();}}},true);
 bookmark.addEventListener('contextmenu',e=>{if(!mobile())return;e.preventDefault();ignoreClick=true;clearPress();pdlOpenMobileBookmarks();});
 const openBookmarks=pdlOpenMobileBookmarks,closeBookmarks=pdlCloseMobileBookmarks;
 window.pdlOpenMobileBookmarks=function(){
  const out=openBookmarks.apply(this,arguments);if(!mobile())return out;
  bookmark.setAttribute('aria-expanded','true');
  document.querySelector('#pdl-mobile-bookmarks .pdl-bm-goto,#pdl-mobile-bookmarks .pdl-mobile-bookmarks-heading button')?.focus({preventScroll:true});
  return out;
 };
 window.pdlCloseMobileBookmarks=function(){
  const open=!document.getElementById('pdl-mobile-bookmarks').hidden;
  const out=closeBookmarks.apply(this,arguments);bookmark.setAttribute('aria-expanded','false');
  if(open)bookmark.focus({preventScroll:true});return out;
 };
 // Keep keyboard focus inside the active mobile sheet and return via its
 // existing close handler. Long press also has a Shift+F10 alternative.
 document.addEventListener('keydown',e=>{
  if(!mobile()||e.key!=='Tab')return;
  const panel=['pdl-chapters-sheet','pdl-mobile-bookmarks','pdl-appearance'].map(id=>document.getElementById(id)).find(n=>!n.hidden);
  if(!panel)return;
  const items=[...panel.querySelectorAll('button,input,select,[tabindex="0"]')].filter(n=>!n.disabled&&n.getClientRects().length);
  if(!items.length)return;
  const first=items[0],last=items.at(-1);
  if(e.shiftKey&&(document.activeElement===first||!panel.contains(document.activeElement))){e.preventDefault();last.focus();}
  else if(!e.shiftKey&&(document.activeElement===last||!panel.contains(document.activeElement))){e.preventDefault();first.focus();}
 });
 const bar=document.getElementById('text-search-bar'),input=document.getElementById('text-search-input');
 // A srcdoc iframe's own visual viewport may stay full-height when the
 // phone keyboard shrinks the top-level viewport. Use the parent's metrics
 // when accessible, translated into the frame's coordinate space.
 const visual=(()=>{try{return parent.visualViewport||window.visualViewport;}catch{return window.visualViewport;}})();
 let placementFrame=0;
 function place(){
  placementFrame=0;if(!mobile()||bar.classList.contains('hidden'))return;
  const frameTop=window.frameElement?.getBoundingClientRect().top||0;
  const top=Math.max(0,(visual?.offsetTop||0)-frameTop),bottom=Math.min(innerHeight,(visual?.offsetTop||0)+(visual?.height||innerHeight)-frameTop);
  const header=document.getElementById('pdl-mobile-top').getBoundingClientRect(),footer=document.getElementById('pdl-mobile-bottom').getBoundingClientRect();
  const height=bar.getBoundingClientRect().height;
  const upper=Math.max(top+8,Math.min(header.bottom>top?header.bottom+8:top+8,bottom-height-8));
  const lower=Math.max(top+8,Math.min(bottom-8,footer.height&&footer.top<bottom&&footer.bottom>top?footer.top-8:bottom-8)-height);
  // The hidden native leaf and visible OPF leaf share geometry. Prefer the
  // visible marks; use native marks while a fresh OPF window is being built.
  const visible=document.querySelector('#pdl-opf-host .pdl-opf-page[data-page="'+currentPage+'"] mark.text-hit.current');
  const marks=visible?[...document.querySelectorAll('#pdl-opf-host .pdl-opf-page[data-page="'+currentPage+'"] mark.text-hit.current')]:[...document.querySelectorAll('#page-content mark.text-hit.current')];
  const rects=marks.flatMap(n=>[...n.getClientRects()]);
  const overlap=y=>rects.reduce((sum,r)=>sum+Math.max(0,Math.min(y+height+8,r.bottom)-Math.max(y-8,r.top)),0);
  const y=overlap(lower)<=overlap(upper)?lower:upper;
  bar.style.setProperty('--pdl-search-top',y+'px');
  bar.dataset.dock=y===lower?'bottom':'top';
 }
 function schedule(){if(placementFrame)cancelAnimationFrame(placementFrame);placementFrame=requestAnimationFrame(place);}
 window.pdlEditMobileSearch=function(){
  bar.dataset.searchMode='edit';input.focus({preventScroll:true});input.select();schedule();
 };
 const toggle=window.toggleTextSearch;
 window.toggleTextSearch=function(){
  if(bar.classList.contains('hidden'))bar.dataset.searchMode='edit';
  const out=toggle.apply(this,arguments);schedule();return out;
 };
 const counter=window.pdlUpdateSearchCounter;
 window.pdlUpdateSearchCounter=function(){
  const out=counter.apply(this,arguments);
  const query=typeof tsQuery==='string'?tsQuery:'';
  bar.dataset.hasQuery=String(!!query);
  document.getElementById('pdl-search-query-text').textContent=query||'Αναζήτηση';
  document.getElementById('pdl-search-query').setAttribute('aria-label','Αλλαγή αναζήτησης: '+query);
  schedule();return out;
 };
 const go=window.goToTsResult;
 window.goToTsResult=function(){
  const out=go.apply(this,arguments);
  if(mobile()&&tsResults.length&&!bar.classList.contains('hidden')){
   bar.dataset.searchMode='browse';input.blur();schedule();
  }
  return out;
 };
 const highlight=window.pdlHighlightVisible;
 window.pdlHighlightVisible=function(){const out=highlight.apply(this,arguments);schedule();return out;};
 // OPF window replacement and asynchronous highlighting can finish after a
 // navigation call. Observe child changes only; changing dock position cannot
 // trigger this observer or resize/re-paginate the reading surface.
 const observer=new MutationObserver(()=>{if(!bar.classList.contains('hidden'))schedule();});
 function connect(){
  observer.observe(document.getElementById('text-viewport'),{childList:true,subtree:true});
  visual?.addEventListener('resize',schedule,{passive:true});
  visual?.addEventListener('scroll',schedule,{passive:true});
 }
 function disconnect(){
  // The parent visual viewport outlives this iframe. Its callbacks would
  // otherwise retain the entire old Reader document after closeBook().
  visual?.removeEventListener('resize',schedule);
  visual?.removeEventListener('scroll',schedule);
  observer.disconnect();clearPress();
  if(placementFrame)cancelAnimationFrame(placementFrame);placementFrame=0;
 }
 connect();
 window.addEventListener('pagehide',disconnect);
 window.addEventListener('pageshow',event=>{if(event.persisted){connect();schedule();}});
 window.addEventListener('resize',schedule,{passive:true});
 document.getElementById('text-viewport').addEventListener('transitionend',schedule);
 bar.dataset.searchMode='edit';bar.dataset.hasQuery='false';
})();

