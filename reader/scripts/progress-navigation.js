
/* Progress-aware navigation. The original OpenPageFlip adapter is preserved. */
(function(){
 const prevGoto=window.gotoChapter,prevNext=window.nextPage,prevPrev=window.prevPage;
 window.gotoChapter=function(index){
  const ci=Number(index);if(!Number.isInteger(ci)||ci<0||ci>=chapters.length)return;
  if(pdlHyphenStartupWaiting){pdlProgressGo(ci);return;}
  if(!pdlProgress.chapters.length||pdlProgressChapterReady(ci))return prevGoto.apply(this,arguments);
  pdlProgressGo(ci);return;
 };
 window.nextPage=function(){
  if(pdlHyphenStartupWaiting)return;
  if(pdlProgress.chapters.length){
   const state=pdlProgress.chapters[currentChapter],double=innerWidth>768&&document.body.classList.contains('pdl-double');
   const step=double?2:1,target=currentPage+step;
   if(state&&!state.done&&target>=state.pages.length){
    pdlProgressGo(currentChapter,target);return;
   }
   if(state?.done&&target>=state.pages.length&&currentChapter+1<chapters.length&&!pdlProgressChapterReady(currentChapter+1)){
    pdlProgressGo(currentChapter+1);return;
   }
  }
  return prevNext.apply(this,arguments);
 };
 window.prevPage=function(){
  if(pdlHyphenStartupWaiting)return;
  if(pdlProgress.chapters.length&&currentPage===0&&currentChapter>0&&!pdlProgress.chapters[currentChapter-1]?.done){
   pdlProgressGo(currentChapter-1,Number.MAX_SAFE_INTEGER);return;
  }
  return prevPrev.apply(this,arguments);
 };
 const prevBookmark=window.pdlBMJump;
 window.pdlBMJump=function(b){
  if(!b?.unresolved&&Number.isInteger(b?.ch)&&pdlProgress.chapters.length&&!pdlProgress.chapters[b.ch]?.done){
   pdlProgressGo(b.ch,Math.max(0,Number(b.pg)||0),b.anchor||null);return true;
  }
  return prevBookmark.apply(this,arguments);
 };
 const prevSearch=window.onTextSearch;
 window.onTextSearch=function(val){
  const q=String(val||'').trim();
  if(q&&!pdlProgressComplete()&&pdlProgress.chapters.length){
   pdlProgress.searchPending=q;tsQuery=q;tsResults=[];tsCurrent=-1;
   const counter=document.getElementById('ts-count');if(counter)counter.textContent='Προετοιμασία…';
   pdlProgressPump();return;
  }
  pdlProgress.searchPending=null;return prevSearch.apply(this,arguments);
 };
 const oldCommit=window.pdlCommitProgress;
 window.pdlCommitProgress=function(value){
  if(pdlProgress.chapters.length&&!pdlProgressComplete())return pdlProgressGoAbsolute(Number(value));
  return oldCommit.apply(this,arguments);
 };
 const oldPreview=window.pdlPreviewProgress;
 window.pdlPreviewProgress=function(value){
  if(pdlProgress.chapters.length&&!pdlProgressComplete()){
   const el=document.getElementById('pdl-mobile-page-info');if(el)el.textContent=`Σελίδα ${value} (υπολογισμός)`;
   return;
  }
  return oldPreview.apply(this,arguments);
 };
 // The iframe reader may be restored on an unprepared chapter: retain exact target.
 const oldRender=window.render;
 window.render=function(){
  const out=oldRender.apply(this,arguments);
  if(pdlProgress.chapters.length)pdlProgressSyncUI();
  return out;
 };
 // An OPF window cannot show pages that were not built when the engine started.
 // Update it only near the edge of the available native window, not during a flip.
 window.addEventListener('pdl-progress-pages',()=>{
  const debug=window.pdlOpenPageFlipDebug?.();
  const state=pdlProgress.chapters[currentChapter];
  if(!state||!debug?.enabled||debug.failed)return;
  // render() already queues the initial OpenPageFlip book once the first
  // pages exist. Do not keep resetting that short timer on every new batch.
  if(debug.activeChapter===-1)return;
  if(debug.activeChapter!==currentChapter)return;
  if(debug.windowStart+debug.windowCount>=state.pages.length)return;
  if(currentPage+5>=debug.windowStart+debug.windowCount){
   window.dispatchEvent(new Event('pdl-progress-opf-extend'));
  }
 });
})();

