
(function(){
  const bookId=PDL_IMPORTED_BOOK_ID;
  const initial=(function(){try{return PDL_INITIAL_POSITION;}catch(e){return null;}})();
  let initialRestored=!initial,restoredSource=null;
  // Keep the requested source point through legacy/font/WASM startup layouts.
  // Taking the containing page's earlier start at each reflow accumulates drift.
  // Ordinary navigation off that page releases the retained point.
  window.pdlReadingAnchor=function(ch,pg){
    if(restoredSource){
      if(restoredSource.ch===ch&&pdlPositionPage(ch,restoredSource.anchor)===pg)return restoredSource.anchor;
      const pending=pdlProgress.desired;
      if(!pending||pending.ch!==restoredSource.ch||pending.anchor?.index!==restoredSource.anchor.index||
         pending.anchor?.offset!==restoredSource.anchor.offset)restoredSource=null;
    }
    return pdlPageAnchor(ch,pg);
  };
  function sendProgress(){
    // Never replace saved progress with startup placeholders or an unresolved
    // progressive navigation target. The target page publishes after render.
    if(!initialRestored||pdlHyphenStartupWaiting)return;
    if(pdlProgress.chapters.length&&(!pdlProgressChapterReady(currentChapter)||
       pdlProgress.desired||pdlProgress.absolute!==null))return;
    const anchor=pdlReadingAnchor(currentChapter,currentPage);
    try{parent.postMessage({kind:'pdl-reader-progress',bookId:bookId,ch:currentChapter,pg:currentPage,
      anchor:{index:anchor.index,offset:anchor.offset},chapterCount:chapters.length},'*');}catch(e){}
  }
  const beforeRender=window.render;
  if(typeof beforeRender==='function')window.render=function(){const r=beforeRender.apply(this,arguments);sendProgress();return r;};
  function go(){
    if(pdlHyphenStartupWaiting){setTimeout(go,150);return;}
    if(!initial || !Array.isArray(chapters) || !chapters.length) {initialRestored=true;sendProgress();return;}
    const ch=Math.min(Math.max(0,Number(initial.ch)||0),chapters.length-1);
    const saved=initial.anchor;
    const block=Number.isSafeInteger(saved?.index)&&saved.index>=0?PDL_SOURCE[ch]?.blocks[saved.index]:null;
    const anchor=block&&Number.isSafeInteger(saved.offset)&&saved.offset>=0&&
      saved.offset<=(pdlBlockNode(block,false).textContent||'').length
      ?{index:saved.index,offset:saved.offset}:null;
    restoredSource=anchor?{ch,anchor}:null;
    if(typeof pdlProgressGo==='function'&&pdlProgress.chapters.length){
      initialRestored=true;
      if(anchor)pdlProgressGo(ch,0,anchor);
      else pdlProgressGo(ch,Math.max(0,Number(initial.pg)||0));
      return;
    }
    if(!chapters[ch]?.pages?.length){setTimeout(go,150);return;}
    currentChapter=ch;
    currentPage=anchor?pdlPositionPage(ch,anchor):Math.min(Math.max(0,Number(initial.pg)||0),chapters[ch].pages.length-1);
    initialRestored=true;render();
  }
  setTimeout(go,850);
})();
