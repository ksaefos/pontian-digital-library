
(function(){
'use strict';
// Fixed v0.7.0 vendored core. The baseline Reader owns pagination and bookmarks.
// OpenPageFlip owns only the display and turn gestures of measured HTML pages.
let engine=null,host=null,activeChapter=-1,windowStart=0,windowCount=0;
let rebuilding=false,needsBuild=true,buildTimer=0,inFlip=false,failed=false;
let pdlProgressTurnInFlight=false;
let pdlOpfLayoutTimer=0;
// A layout-refresh can temporarily remove the OPF instance. Keep a turn
// requested during that interval instead of silently falling back to a
// static native page advance.
let pdlOpfPendingTurn=null;
let pdlOpfBuilds=0,pdlOpfAnimatedTurns=0,pdlOpfInterruptedTurns=0,pdlOpfRelayoutTimer=0;
// v3.1.3: a pointer gesture must never be orphaned by an unrelated rebuild.
// pdlOpfGesture lives outside doBuild() so it survives a replaced host; the
// hold timestamps defer rebuilds while a finger/mouse is down and briefly after
// release (the fallback turn below waits 120 ms). The built-signature lets a
// soft event (layout-ready, resize, extend) skip rebuilding an unchanged window.
let pdlOpfGesture=null,pdlOpfPointerDownAt=0,pdlOpfHoldUntil=0;
let pdlOpfBuiltSignature='',pdlOpfSkippedBuilds=0;
// The public reader always uses OpenPageFlip.  Older releases exposed a
// persistent switch: one accidental 'off' disabled page turning in every book.
// Migrate that obsolete preference once; retain the native view only as a
// genuine runtime fallback if the animation library cannot initialize.
let enabled=true;
try{localStorage.removeItem('pdlOpenPageFlip');}catch(_e){}
const PAGE_WINDOW=24,REBUILD_MARGIN=4;
const vp=document.getElementById('text-viewport');
const left=document.getElementById('page-content');
const right=document.getElementById('pdl-second-page');
const status=document.getElementById('pdl-opf-status');

// v2.1.6: OpenPageFlip only has pages for the active chapter. At its first/last
// leaf, native OPF has nothing more to flip. An intentional horizontal gesture
// at that edge must advance to the adjacent chapter.
let pdlBoundaryTouch=null;
vp.addEventListener('touchstart',event=>{
 if(!enabled||failed||!vp.classList.contains('pdl-opf-active')||event.touches.length!==1){pdlBoundaryTouch=null;return;}
 const t=event.touches[0];
 pdlBoundaryTouch={x:t.clientX,y:t.clientY,ch:currentChapter,pg:currentPage};
},{passive:true,capture:true});
vp.addEventListener('touchend',event=>{
 const start=pdlBoundaryTouch;pdlBoundaryTouch=null;
 if(!start||!enabled||failed||!vp.classList.contains('pdl-opf-active')||event.changedTouches.length!==1)return;
 const t=event.changedTouches[0],dx=t.clientX-start.x,dy=t.clientY-start.y;
 if(Math.abs(dx)<22||Math.abs(dx)<Math.abs(dy)*1.3)return;
 if(start.x<18||start.x>window.innerWidth-18)return;
 if(currentChapter!==start.ch||currentPage!==start.pg)return;
 const next=dx<0?1:-1;
 if(next>0&&!(currentPage===chapters[currentChapter].pages.length-1&&currentChapter<chapters.length-1))return;
 if(next<0&&!(currentPage===0&&currentChapter>0))return;
 // The OPF touch handler finishes first; then the normal reader navigation
 // updates bookmarks/progress and the adapter rebuilds for the new chapter.
 setTimeout(()=>{
   if(currentChapter===start.ch&&currentPage===start.pg){
     if(next>0)window.nextPage();else window.prevPage();
   }
 },0);
},{passive:true,capture:true});
vp.addEventListener('touchcancel',()=>{pdlBoundaryTouch=null;},{passive:true,capture:true});
vp.addEventListener('pointerdown',event=>{
 if(event.target instanceof Element&&event.target.closest('#pdl-opf-host'))pdlOpfPointerDownAt=performance.now();
},{capture:true,passive:true});
function pdlOpfPointerEnd(){
 if(!pdlOpfPointerDownAt)return;
 pdlOpfPointerDownAt=0;pdlOpfHoldUntil=performance.now()+450;
}
window.addEventListener('pointerup',pdlOpfPointerEnd,{capture:true,passive:true});
window.addEventListener('pointercancel',pdlOpfPointerEnd,{capture:true,passive:true});
// Milliseconds a rebuild must still wait because of a pointer gesture (0 = free).
function pdlOpfGestureHold(){
 const now=performance.now();
 if(pdlOpfPointerDownAt){
   if(now-pdlOpfPointerDownAt<4000)return 100;
   pdlOpfPointerDownAt=0; // a lost pointerup must never block rebuilds forever
 }
 return Math.max(0,Math.ceil(pdlOpfHoldUntil-now));
}
function pdlOpfBusy(){
 return !!(engine&&(engine.state==='flipping'||pdlProgressTurnInFlight||pdlOpfGestureHold()>0));
}

function setStatus(message){if(status)status.textContent=message||'';}
function destroy(){
 clearTimeout(buildTimer);buildTimer=0;clearTimeout(pdlOpfRelayoutTimer);pdlOpfRelayoutTimer=0;
 // Count *actual* animation interruption. Rebuilding after a completed turn
 // is allowed when a different page window or a new layout is needed.
 if(engine&&(engine.state==='flipping'||pdlProgressTurnInFlight))pdlOpfInterruptedTurns++;
 const previous=engine;engine=null;
 if(previous){try{previous.destroy();}catch(err){console.warn('OpenPageFlip destroy',err);}}
 if(host){host.remove();host=null;}
 vp.classList.remove('pdl-opf-active');
 activeChapter=-1;windowCount=0;pdlOpfBuiltSignature='';
}
function fallback(error){
 console.warn('OpenPageFlip fallback — native pagination remains usable',error);
 pdlOpfPendingTurn=null;
 destroy();failed=true;setStatus('Απλή σελιδοποιημένη ανάγνωση (εφεδρεία).');
}
function queueBuild(delay=55){
 if(!enabled||failed)return;
 clearTimeout(buildTimer);
 buildTimer=setTimeout(build,delay);
}
function pdlOpfWindowSignature(g){
 const pages=chapters[currentChapter]?.pages||[];
 const prog=(typeof pdlProgress!=='undefined'&&pdlProgress)?[pdlProgress.signature||'',pdlProgress.generation||0]:['',0];
 const cs=getComputedStyle(left);
 return [g.dual?1:0,Math.round(g.width),Math.round(g.height),Math.round(g.hostWidth),Math.round(g.x),Math.round(g.y),
   currentChapter,windowStart,Math.min(pages.length,windowStart+PAGE_WINDOW),prog[0],prog[1],
   cs.fontFamily,cs.fontSize,cs.lineHeight,cs.color,cs.backgroundColor,
   (typeof PDL_HYPH!=='undefined'&&PDL_HYPH.mode)?PDL_HYPH.mode():''].join('|');
}
// True when the mounted window still shows exactly what a fresh build would show.
function pdlOpfWindowStillGood(){
 if(!enabled||failed||!engine||rebuilding||!pdlOpfBuiltSignature||activeChapter!==currentChapter)return false;
 const pages=chapters[currentChapter]?.pages;if(!pages||!pages.length)return false;
 const local=currentPage-windowStart;
 if(local<0||local>=windowCount)return false;
 // Near a window edge the window must shift, unless it already reaches the chapter boundary.
 if(local<=REBUILD_MARGIN-2&&windowStart>0)return false;
 if(local>=windowCount-REBUILD_MARGIN&&windowStart+windowCount<pages.length)return false;
 const g=geometry();if(!g)return false;
 return pdlOpfWindowSignature(g)===pdlOpfBuiltSignature;
}
function geometry(){
 // v2.0.2: getBoundingClientRect() reports 86% dimensions during mobile
 // controls zoom, and reports intermediate widths during its transition.
 // OpenPageFlip must ALWAYS be built in the unscaled CSS layout coordinate space.
 const v=vp.getBoundingClientRect(), l=left.getBoundingClientRect(), r=right.getBoundingClientRect();
 const dual=innerWidth>768&&document.body.classList.contains('pdl-double');
 const width=left.offsetWidth, height=left.offsetHeight;
 // Convert viewport coordinates back to *untransformed* CSS coordinates.
 // Ratios also handle a transition in progress (e.g. scale .94).
 const scaleX=v.width&&vp.offsetWidth?v.width/vp.offsetWidth:1;
 const scaleY=v.height&&vp.offsetHeight?v.height/vp.offsetHeight:1;
 if(!Number.isFinite(scaleX)||!Number.isFinite(scaleY)||scaleX<=0||scaleY<=0)return null;
 const hostWidth=dual?Math.round((r.right-l.left)/scaleX):width;
 const x=(l.left-v.left)/scaleX, y=(l.top-v.top)/scaleY;
 if(width<150||height<150||hostWidth<150||!v.width)return null;
 return {dual,width,height,hostWidth,x,y,scaleX,scaleY};
}
function syncLocation(pg){
 // Delayed flip events from the previous chapter/window must not overwrite a
 // programmatic jump to a new chapter while the replacement is being built.
 if(rebuilding||!engine||activeChapter!==currentChapter)return;
 const val=Math.min(Math.max(0,windowStart+pg),chapters[currentChapter].pages.length-1);
 if(val===currentPage)return;
 inFlip=true;
 currentPage=val;
 // Native render updates all progress, popup/lookup and bookmark state.
 nativeRender();
 inFlip=false;
 const local=val-windowStart;
 if(local>=windowCount-REBUILD_MARGIN||local<=REBUILD_MARGIN-2){
   needsBuild=true;queueBuild(210);
 }
}
function doBuild(){
 if(!enabled||failed||pdlHyphenStartupWaiting)return;
 const ctor=window.OpenPageFlip?.createBook;
 if(typeof ctor!=='function')throw new Error('OpenPageFlip library has not loaded');
 const g=geometry();if(!g){setStatus('Αναμονή μετρήσεων σελίδας');return;}
 const pages=chapters[currentChapter]?.pages;
 // Use progressive readiness only when the progressive engine is active.
 // A genuine legacy fallback fills chapters[].pages while the progressive
 // state is empty. Those measured pages must still work with OpenPageFlip.
 const progressiveActive=typeof pdlProgress!=='undefined'&&Array.isArray(pdlProgress.chapters)&&pdlProgress.chapters.length>0;
 if(!pages||!pages.length||(progressiveActive&&!pdlProgressChapterReady(currentChapter)))return;
 let first=0;
 if(pages.length>PAGE_WINDOW){
   first=Math.max(0,currentPage-8);
   if(g.dual)first-=first%2;
   first=Math.min(first,Math.max(0,pages.length-PAGE_WINDOW));
   if(g.dual)first-=first%2;
 }
 const last=Math.min(pages.length,first+PAGE_WINDOW);
 destroy();rebuilding=true;
 const mount=document.createElement('div');mount.id='pdl-opf-host';
 mount.style.left=g.x+'px';mount.style.top=g.y+'px';
 mount.style.width=g.hostWidth+'px';mount.style.height=g.height+'px';
 const mainStyle=getComputedStyle(left);
 const p=left.querySelector('p');const sample=p?getComputedStyle(p):null;
 const defaults={top:mainStyle.paddingTop,right:mainStyle.paddingRight,bottom:mainStyle.paddingBottom,left:mainStyle.paddingLeft};
 for(const [k,v]of Object.entries(defaults))mount.style.setProperty('--pdl-opf-pad-'+k,v);
 const paraValues={
   'font-size':sample?.fontSize||getComputedStyle(left).fontSize,
   'line-height':sample?.lineHeight||'1.69',
   'font-weight':sample?.fontWeight||'400',
   'letter-spacing':sample?.letterSpacing||'normal',
   'margin-bottom':sample?.marginBottom||'0.65em'
 };
 for(const [k,v]of Object.entries(paraValues))mount.style.setProperty('--pdl-opf-'+k,v);
 const sheet=[];
 for(let pg=first;pg<last;pg++){
   const node=document.createElement('article');node.className='pdl-opf-page';node.dataset.page=String(pg);
   node.innerHTML=pdlPositionMarkup(currentChapter,pg);
   if(typeof PDL_HYPH!=='undefined')PDL_HYPH.apply(node);
   sheet.push(node);mount.append(node);
 }
 if(g.dual && last===pages.length && pages.length%2===1){
   const blank=document.createElement('article');blank.className='pdl-opf-page pdl-opf-blank';
   blank.setAttribute('aria-label','Κενή σελίδα');mount.append(blank);sheet.push(blank);
 }
 // Desktop: reserve only the outer grip for page turning; interior
 // text stays selectable. Mobile: allow a deliberate horizontal swipe.
 // The vendored OPF core can accept pointerdown but then release a gesture
 // without turning (especially during the progressive page-window lifecycle).
 // Remember that gesture and, ONLY if OPF did not start its own flip, replay
 // the intention through its genuine animated flipNext/flipPrev API.
 mount.addEventListener('pointerdown',event=>{
   if(event.pointerType==='mouse'&&event.button!==0)return;
   const bounds=mount.getBoundingClientRect();
   const x=event.clientX-bounds.left;
   const grip=42;
   if(event.pointerType==='mouse'&&x>grip&&x<bounds.width-grip){
     event.stopImmediatePropagation();
     pdlOpfGesture=null;
     return;
   }
   if(event.target instanceof Element&&event.target.closest('a,button,input,textarea,select,[data-opf-no-flip]')){
     pdlOpfGesture=null;return;
   }
   pdlOpfGesture={id:event.pointerId,x:event.clientX,y:event.clientY,
     chapter:currentChapter,page:currentPage,turns:pdlOpfAnimatedTurns};
 },true);
 mount.addEventListener('pointerup',event=>{
   const p=pdlOpfGesture;pdlOpfGesture=null;
   if(!p||p.id!==event.pointerId)return;
   const dx=event.clientX-p.x,dy=event.clientY-p.y;
   const threshold=event.pointerType==='mouse'?48:26;
   let direction=0;
   if(Math.abs(dx)>=threshold&&Math.abs(dx)>Math.abs(dy)*1.3){
     direction=dx<0?1:-1;
   }else if(Math.abs(dx)<=9&&Math.abs(dy)<=9){
     // An edge tap/click also turns the physical page. Interior taps retain
     // their original text-selection, glossary and toolbar behavior.
     const b=mount.getBoundingClientRect();
     const tapBand=Math.min(56,Math.max(36,b.width*0.12));
     if(p.x>=b.right-tapBand)direction=1;
     else if(p.x<=b.left+tapBand)direction=-1;
   }
   if(!direction)return;
   // The existing chapter-edge handler owns boundary transitions.
   if(direction>0&&p.page>=chapters[p.chapter].pages.length-1)return;
   if(direction<0&&p.page===0)return;
   setTimeout(()=>{
     // The engine/host may have been replaced since pointerdown. navigate()
     // keeps such a turn pending and animates it on the new instance.
     if(!enabled||failed||currentChapter!==p.chapter||currentPage!==p.page||
       pdlOpfAnimatedTurns!==p.turns||engine?.state==='flipping')return;
     navigate(direction);
   },120);
 },false);
 mount.addEventListener('pointercancel',()=>{pdlOpfGesture=null;},false);
 vp.append(mount);host=mount;activeChapter=currentChapter;windowStart=first;windowCount=last-first;
 const start=Math.max(0,currentPage-first);
 try{
   engine=ctor(mount,{
     width:g.width,height:g.height,size:'fixed',layout:g.dual?'spread':'single',
     // Mobile: swipe-release animates a stable page. Continuous live folding
     // under the finger produced severe warping in the observed mobile video.
     // Desktop keeps physical page dragging at the outer grip.
     cover:false,startPage:start,autoSize:false,click:'off',drag:innerWidth>768,swipe:true,
     flipDuration:innerWidth<=768?480:650,swipeDistance:innerWidth<=768?15:30,shadows:true,shadowOpacity:.33,hover:false,
     pages:sheet
   });
   const boundEngine=engine;
   engine.on('flip',ev=>{if(engine===boundEngine)syncLocation(ev.page);});
   engine.on('changeState',ev=>{if(engine===boundEngine&&ev.state==='flipping')pdlOpfAnimatedTurns++;});
   pdlOpfBuilds++;
   vp.classList.add('pdl-opf-active');setStatus('OpenPageFlip 0.7.0 · '+(g.dual?'Διπλή':'Μονή')+' σελίδα');
 }catch(e){rebuilding=false;fallback(e);return;}
 rebuilding=false;needsBuild=false;
 pdlOpfBuiltSignature=pdlOpfWindowSignature(g);
 if(typeof tsQuery==='string'&&tsQuery)pdlHighlightVisible(tsCurrent);
 // A navigation request may have arrived while this fresh OPF instance was
 // being constructed. Animate the requested turn on the new instance.
 if(pdlOpfPendingTurn)queueMicrotask(pdlOpfFlushPendingTurn);
}
function build(){
 buildTimer=0;
 // Ignore an obsolete timer after the window has already been built.
 // The old code rebuilt an unchanged book whenever any delayed timer fired.
 if(!needsBuild&&engine&&activeChapter===currentChapter&&
   currentPage>=windowStart&&currentPage<windowStart+windowCount)return;
 // During swipes, OpenPageFlip drives its own state machine (without passing
 // through navigate()). Rebuilding while it reports `flipping` cancels the
 // page curl, leaving the reader looking like a static page switch.
 if(rebuilding||inFlip||pdlProgressTurnInFlight||engine?.state==='flipping'){
  queueBuild(130);return;
 }
 // An unchanged window is never rebuilt: a rebuild replaces the host, which
 // used to swallow a gesture started right after a completed turn.
 if(pdlOpfWindowStillGood()){
   needsBuild=false;pdlOpfSkippedBuilds++;
   const desired=currentPage-windowStart;
   if(engine.page!==desired){try{engine.turnTo(desired);}catch(e){fallback(e);}}
   return;
 }
 const hold=pdlOpfGestureHold();
 if(hold>0){queueBuild(Math.min(250,Math.max(60,hold)));return;}
 try{doBuild();}catch(e){fallback(e);}
}
function pdlOpfFlushPendingTurn(){
 const turn=pdlOpfPendingTurn;
 if(!turn||failed||!enabled)return;
 // A newer position (bookmark, chapter jump, reflow) supersedes the gesture.
 if(currentChapter!==turn.chapter||currentPage!==turn.page){pdlOpfPendingTurn=null;return;}
 if(!engine||rebuilding||inFlip||pdlProgressTurnInFlight||engine.state==='flipping')return;
 pdlOpfPendingTurn=null;
 navigate(turn.delta,turn.retry===true);
}
function navigate(delta,retry=false){
 if(!enabled||failed)return false;
 const step=(innerWidth>768&&document.body.classList.contains('pdl-double'))?2:1;
 const total=chapters[currentChapter]?.pages?.length||0;
 const target=currentPage+delta*step;
 if(target<0||target>=total)return false;
 // The book can be briefly destroyed by a relayout just after its readiness
 // check. Never use the native immediate-turn path for an otherwise valid
 // same-chapter turn: rebuild, then animate it using OpenPageFlip.
 if(!engine||rebuilding||inFlip||pdlProgressTurnInFlight||engine.state==='flipping'){
   pdlOpfPendingTurn={delta,chapter:currentChapter,page:currentPage,retry};
   if(!engine&&!rebuilding)queueBuild(20);
   return true;
 }
 const local=target-windowStart;
 if(local<0||local>=windowCount){
   // The next leaf is beyond the mounted 24-page window: do not jump to it
   // statically. Recenter the window on the *current* page, then animate.
   pdlOpfPendingTurn={delta,chapter:currentChapter,page:currentPage,retry};
   needsBuild=true;queueBuild(40);return true;
 }
 const fn=delta>0?engine.flipNext:engine.flipPrev;
 const origin={chapter:currentChapter,page:currentPage};
 pdlProgressTurnInFlight=true;
 fn.call(engine).then(ok=>{
   if(ok){ // 'flip' event normally has already set the reader state.
     if(currentChapter===origin.chapter&&currentPage===origin.page){currentPage=target;nativeRender();}
   }else if(currentChapter===origin.chapter&&currentPage===origin.page){
     if(!retry){
       // A rejected animation must not masquerade as a successful static turn.
       // Retry once, after building a fresh page window.
       pdlOpfPendingTurn={delta,chapter:origin.chapter,page:origin.page,retry:true};
       pdlOpfBuiltSignature='';needsBuild=true;queueBuild(35);
     }else {
       console.warn('OpenPageFlip refused the animated turn after one rebuild');
       setStatus('Η αλλαγή σελίδας δεν ολοκληρώθηκε. Δοκιμάστε ξανά.');
     }
   }
 }).catch(fallback).finally(()=>{
   pdlProgressTurnInFlight=false;
   if(needsBuild)queueBuild(90);
   else if(pdlOpfPendingTurn)queueMicrotask(pdlOpfFlushPendingTurn);
 });
 return true;
}
const oldRender=window.render;
function nativeRender(){return oldRender();}
window.render=function(){
 const out=oldRender();
 if(inFlip||rebuilding)return out;
 if(!enabled||failed){destroy();return out;}
 if(!engine||activeChapter!==currentChapter||needsBuild){queueBuild();return out;}
 const desired=currentPage-windowStart;
 if(desired<0||desired>=windowCount){needsBuild=true;queueBuild();return out;}
 // Never snap the visible leaf while an animated turn is in progress.
 if(engine.page!==desired&&!pdlProgressTurnInFlight&&engine.state!=='flipping')engine.turnTo(desired);
 return out;
};
// Preserve text search highlighting inside the displayed page, not merely the hidden baseline.
function copyHighlightedPage(){
 if(!engine||!host||activeChapter!==currentChapter)return;
 const visible=host.querySelector('.pdl-opf-page[data-page="'+currentPage+'"]');
 if(visible)visible.innerHTML=left.innerHTML;
}
const prevHighlight=window.pdlHighlightVisible;
if(typeof prevHighlight==='function')window.pdlHighlightVisible=function(...args){const result=prevHighlight.apply(this,args);copyHighlightedPage();return result;};
const prevReset=window.pdlResetPageMarks;
if(typeof prevReset==='function')window.pdlResetPageMarks=function(...args){const result=prevReset.apply(this,args);copyHighlightedPage();return result;};
const oldPaginate=window.pdlPaginate;
window.pdlPaginate=function(...args){
 // Resizing while a page is turning can trigger typography reflow. Let OPF
 // complete the animation before measuring new page geometry and replacing
 // its DOM. Do not silently cancel the user's page turn.
 const run=()=>{
   if(pdlOpfBusy()){
     pdlOpfRelayoutTimer=setTimeout(run,75);return;
   }
   pdlOpfRelayoutTimer=0;destroy();needsBuild=true;
   return oldPaginate.apply(this,args);
 };
 if(pdlOpfBusy()){
   clearTimeout(pdlOpfRelayoutTimer);
   pdlOpfRelayoutTimer=setTimeout(run,75);
   return;
 }
 return run();
};
const oldNext=window.nextPage,oldPrev=window.prevPage;
window.nextPage=function(){if(navigate(1))return;return oldNext.apply(this,arguments);};
window.prevPage=function(){if(navigate(-1))return;return oldPrev.apply(this,arguments);};
// Switching layout/typography must measure native pages before rebuilding the book.
const oldSetLayout=window.pdlSetLayout;
window.pdlSetLayout=function(value){
 if(!['single','double'].includes(value))return;
 clearTimeout(pdlOpfLayoutTimer);pdlOpfLayoutTimer=0;
 const apply=()=>{
   // Defer the CSS geometry change too: destroying only after the animation
   // would still stretch the live book underneath a pointer or turning page.
   if(pdlOpfBusy()){pdlOpfLayoutTimer=setTimeout(apply,75);return;}
   pdlOpfLayoutTimer=0;
   const layout=innerWidth<=768?'single':value;
   if(layout===pdlLayout)return;
   destroy();needsBuild=true;return oldSetLayout.call(this,layout);
 };
 return apply();
};

window.addEventListener('resize',()=>{needsBuild=true;queueBuild(320);},{passive:true});
window.addEventListener('pdl-grid-layout-ready',()=>{needsBuild=true;queueBuild(110);});
window.addEventListener('pdl-progress-opf-extend',()=>{needsBuild=true;queueBuild(240);});
if(enabled)queueBuild(120);
window.pdlOpenPageFlipDebug=()=>({enabled,failed,activeChapter,windowStart,windowCount,page:engine?.page,count:engine?.pageCount,layout:engine?.orientation,state:engine?.state,builds:pdlOpfBuilds,animatedTurns:pdlOpfAnimatedTurns,interruptedTurns:pdlOpfInterruptedTurns,pendingTurn:!!pdlOpfPendingTurn,buildQueued:!!(buildTimer||rebuilding||pdlOpfRelayoutTimer||pdlOpfLayoutTimer||pdlOpfPendingTurn),gestureHold:pdlOpfGestureHold(),skippedBuilds:pdlOpfSkippedBuilds,hostWidth:host?.offsetWidth,hostHeight:host?.offsetHeight,measuredWidth:left.offsetWidth,viewportZoom:vp.getBoundingClientRect().width/(vp.offsetWidth||1)});
})();
