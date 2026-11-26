/* Reader usability and accessibility. No source text or pagination decisions. */
(function(){
 'use strict';
 const byId=id=>document.getElementById(id),mobile=()=>innerWidth<=768;
 const visible=node=>!!node?.isConnected&&!node.closest('[inert],[hidden]')&&node.getClientRects().length>0&&getComputedStyle(node).visibility!=='hidden';
 const focus=node=>{if(visible(node))node.focus({preventScroll:true});};
 const items=panel=>[...panel.querySelectorAll('button,a[href],input,select,textarea,[tabindex]')].filter(n=>!n.disabled&&n.tabIndex>=0&&visible(n));
 const sidebar=byId('sidebar'),help=byId('pdl-reader-help');
 let helpOpener=null;
 const assistanceEnabled=()=>document.body.classList.contains('pdl-reader-assistance');
 const definitions={
  'pdl-chapters-sheet':['pdlShowChapters','pdlHideChapters','pdl-chapters-backdrop'],
  'pdl-mobile-bookmarks':['pdlOpenMobileBookmarks','pdlCloseMobileBookmarks','pdl-mobile-bookmarks-backdrop'],
  'pdl-appearance':['pdlOpenAppearance','pdlCloseAppearance','pdl-appearance-backdrop']
 };
 let active=null,opener=null,blocked=new Map(),sidebarOpen=false,sidebarOpener=null;
 function restore(){
  for(const [node,state] of blocked){node.inert=state.inert;if(state.hidden===null)node.removeAttribute('aria-hidden');else node.setAttribute('aria-hidden',state.hidden);}
  blocked.clear();
 }
 function isolate(panel,backdrop){
  let branch=panel;
  while(branch&&branch!==document.body){
   for(const sibling of branch.parentElement.children){
    if(sibling===branch||sibling.id===backdrop||sibling.getAttribute('role')==='status'||['SCRIPT','STYLE','LINK'].includes(sibling.tagName))continue;
    if(!blocked.has(sibling))blocked.set(sibling,{inert:sibling.inert,hidden:sibling.getAttribute('aria-hidden')});
    sibling.inert=true;sibling.setAttribute('aria-hidden','true');
   }
   branch=branch.parentElement;
  }
 }
 function returnFocus(target){focus(visible(target)?target:mobile()&&assistanceEnabled()&&document.body.classList.contains('immersive')?byId('pdl-show-tools'):byId('page-content'));}
 function release(id){
  if(active!==id)return;
  const target=opener;active=null;opener=null;restore();returnFocus(target);
 }
 function closeActive(){
  if(active==='sidebar'){sidebar.classList.remove('open');syncSidebar();}
  else if(active)window[definitions[active][1]]();
 }
 for(const [id,[openName,closeName,backdrop]] of Object.entries(definitions)){
  const open=window[openName],close=window[closeName],panel=byId(id);
  window[openName]=function(...args){
   if(help.open)pdlCloseReaderHelp();
   if(active!==id)closeActive();
   const previous=active===id?opener:document.activeElement;
   const result=open.apply(this,args);
   if(panel.hidden)return result;
   if(active!==id){active=id;opener=previous;isolate(panel,backdrop);}
   if(!panel.contains(document.activeElement))focus(items(panel)[0]);
   return result;
  };
  window[closeName]=function(...args){const result=close.apply(this,args);release(id);return result;};
 }
 function syncSidebar(){
  const open=sidebar.classList.contains('open');sidebar.inert=!open;sidebar.setAttribute('aria-hidden',String(!open));
  if(open===sidebarOpen)return;sidebarOpen=open;
  if(open){
   sidebarOpener=document.activeElement;
   if(mobile()){
    closeActive();active='sidebar';opener=sidebarOpener;sidebar.setAttribute('role','dialog');sidebar.setAttribute('aria-modal','true');isolate(sidebar);
   }
   if(!sidebar.contains(document.activeElement))focus(sidebar.querySelector('[role="tab"][aria-selected="true"]'));
  }else{
   if(active==='sidebar')release('sidebar');
   else if(sidebar.contains(document.activeElement))returnFocus(sidebarOpener);
   sidebar.removeAttribute('role');sidebar.removeAttribute('aria-modal');
  }
 }
 for(const name of ['toggleSidebar','pdlToggleDrawer','pdlOpenSettings']){
  const fn=window[name];window[name]=function(...args){const result=fn.apply(this,args);syncSidebar();return result;};
 }
 new MutationObserver(syncSidebar).observe(sidebar,{attributes:true,attributeFilter:['class']});
 window.pdlOpenGlossary=function(){
  if(mobile()&&!assistanceEnabled())return;
  closeActive();sidebar.classList.add('open');sidebar.dataset.pdlPanel='book';pdlSyncDrawer();syncSidebar();focus(byId('gloss-search'));
 };
 window.pdlOpenReaderHelp=function(){closeActive();helpOpener=document.activeElement;help.showModal();};
 window.pdlCloseReaderHelp=function(){help.close();returnFocus(helpOpener);};
 let searchOpener=null,keyboardNavigation=false;
 document.addEventListener('pointerdown',()=>{keyboardNavigation=false;},{capture:true,passive:true});
 const searchBar=byId('text-search-bar'),toggleSearch=window.toggleTextSearch,closeSearch=window.closeTextSearch,goToResult=window.goToTsResult;
 window.toggleTextSearch=function(...args){if(searchBar.classList.contains('hidden'))searchOpener=document.activeElement;return toggleSearch.apply(this,args);};
 window.closeTextSearch=function(...args){const open=!searchBar.classList.contains('hidden'),result=closeSearch.apply(this,args);if(open)returnFocus(searchOpener);return result;};
 window.goToTsResult=function(...args){const editing=document.activeElement===byId('text-search-input'),result=goToResult.apply(this,args);if(mobile()&&editing&&tsResults.length&&(assistanceEnabled()||keyboardNavigation))focus(byId('ts-next'));return result;};
 window.pdlShowReaderTools=function(){exitImmersive();syncTools();focus(byId('pdl-mobile-font-action'));};
 window.pdlHideReaderTools=function(){closeActive();enterImmersive();syncTools();returnFocus(null);};
 window.pdlDismissReaderHint=function(){const hint=byId('pdl-first-use'),hadFocus=hint.contains(document.activeElement);hint.hidden=true;try{localStorage.setItem('pdl:reader:hint:v1','seen');}catch{}if(hadFocus)focus(byId('page-content'));};
 function syncTools(){
  const immersive=mobile()&&document.body.classList.contains('immersive');
  byId('pdl-show-tools').setAttribute('aria-expanded',String(!immersive));
  byId('pdl-access-nav').inert=!immersive||!assistanceEnabled();
  byId('pdl-reader-assistance-setting').checked=assistanceEnabled();
  byId('pdl-assistance-actions').hidden=!assistanceEnabled()||!mobile();
  if(!immersive)byId('pdl-first-use').hidden=true;
 }
 window.pdlSetReaderAssistance=function(enabled,persist=true){
  enabled=!!enabled;
  const changed=enabled!==assistanceEnabled();
  if(changed&&!enabled)closeActive();
  document.body.classList.toggle('pdl-reader-assistance',enabled);
  window.pdlReaderAssistancePreference=enabled;syncTools();
  if(persist){
   try{
    if(parent!==window&&typeof parent.pdlSetReaderAssistancePreference==='function')parent.pdlSetReaderAssistancePreference(enabled);
    else localStorage.setItem('pdl:reader:assistance:v1',enabled?'on':'off');
   }catch{}
  }
  if(changed&&mobile())pdlScheduleRelayout();
  if(!visible(document.activeElement))returnFocus(null);
 };
 window.addEventListener('storage',event=>{if(event.key==='pdl:reader:assistance:v1'||event.key===null)pdlSetReaderAssistance(event.newValue==='on',false);});
 new MutationObserver(syncTools).observe(document.body,{attributes:true,attributeFilter:['class']});
 window.addEventListener('resize',syncTools,{passive:true});
 syncTools();syncSidebar();
 byId('text-viewport').addEventListener('pointerdown',()=>{
  const focused=document.activeElement;
  if(focused?.matches('a')&&(byId('page-content').contains(focused)||byId('pdl-second-page').contains(focused)))focused.blur();
 },{capture:true,passive:true});
 // Reading instructions are available from Contents; optional actions live
 // inside their clearly labelled accessibility section.
 const actions=document.createElement('div');actions.className='pdl-sheet-tools';
 for(const [label,run] of [['Οδηγίες ανάγνωσης',()=>pdlOpenReaderHelp()]]){
  const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=run;actions.append(b);
 }
 byId('pdl-chapters-sheet').querySelector('header').after(actions);
 const helpButton=document.createElement('button');helpButton.id='pdl-reader-help-button';helpButton.type='button';helpButton.textContent='?';helpButton.setAttribute('aria-label','Οδηγίες ανάγνωσης');helpButton.setAttribute('aria-haspopup','dialog');helpButton.onclick=pdlOpenReaderHelp;
 document.querySelector('.pdl-rail').append(helpButton);
 // Do not let other global Escape handlers close several sheets at once.
 document.addEventListener('keydown',event=>{
  if(event.key==='Tab')keyboardNavigation=true;
  if(event.key==='Escape'&&(active||help.open||sidebarOpen)){
   event.preventDefault();event.stopImmediatePropagation();
   if(help.open)pdlCloseReaderHelp();else if(active)closeActive();else{sidebar.classList.remove('open');syncSidebar();}
   return;
  }
  if(event.key!=='Tab')return;
  if(active){
   const panel=byId(active),nodes=items(panel),first=nodes[0],last=nodes.at(-1);
   if(!first)return;
   if(event.shiftKey&&(document.activeElement===first||!panel.contains(document.activeElement))){event.preventDefault();focus(last);}
   else if(!event.shiftKey&&(document.activeElement===last||!panel.contains(document.activeElement))){event.preventDefault();focus(first);}
  }else if(mobile()&&document.body.classList.contains('immersive')&&[document.body,byId('page-content')].includes(document.activeElement)){
   event.preventDefault();pdlShowReaderTools();
  }
 },true);
 // One semantic text copy: the 24-page animated window (including curl clones)
 // is decorative for assistive technology, with no duplicate link tab stops.
 let announcementTimer=0,lastLocation='',initialized=false;
 const announcement=byId('pdl-page-announcement');
 function updateReading(){
  const host=byId('pdl-opf-host');
  if(host){host.setAttribute('aria-hidden','true');for(const n of host.querySelectorAll('a[href],button,input,select,textarea,[tabindex]'))n.tabIndex=-1;}
  clearTimeout(announcementTimer);
  announcementTimer=setTimeout(()=>{
   if(pdlHyphenStartupWaiting||!chapters[currentChapter]?.pages?.length||pdlProgress.desired||pdlProgress.absolute!==null)return;
   if(pdlProgress.chapters.length&&!pdlProgressChapterReady(currentChapter))return;
   if(window.pdlOpenPageFlipDebug?.().state==='flipping')return;
   const key=currentChapter+':'+currentPage;
   const label=String(chapters[currentChapter].number||'Κεφάλαιο '+(currentChapter+1));
   byId('pdl-access-prev').disabled=currentChapter===0&&currentPage===0;
   byId('pdl-access-next').disabled=currentChapter===chapters.length-1&&currentPage===chapters[currentChapter].pages.length-1&&(!pdlProgress.chapters.length||pdlProgressComplete());
   document.querySelectorAll('.toc-list button').forEach((button,index)=>button.setAttribute('aria-current',String(index===currentChapter)));
   byId('page-content').setAttribute('aria-label',label+' · Σελίδα '+(currentPage+1));
   if(key!==lastLocation){announcement.textContent=label+'. Σελίδα '+(currentPage+1)+'.';lastLocation=key;}
   if(!initialized){
    initialized=true;
    if(document.activeElement===document.body)focus(byId('page-content'));
    let seen=false;try{seen=localStorage.getItem('pdl:reader:hint:v1')==='seen';}catch{}
    byId('pdl-first-use').querySelector('p').textContent=assistanceEnabled()
     ?'Τα «Χειριστήρια» ανοίγουν με ένα πάτημα. Η προαιρετική βοήθεια αλλάζει από τις Οδηγίες ανάγνωσης.'
     :'Άγγιξε δύο φορές το κείμενο για να εμφανίσεις ή να κρύψεις τα χειριστήρια. Στα Κεφάλαια θα βρεις και τις Οδηγίες ανάγνωσης.';
    byId('pdl-first-use').hidden=seen||!mobile()||!document.body.classList.contains('immersive');
   }
  },180);
 }
 const render=window.render;window.render=function(...args){const result=render.apply(this,args);updateReading();return result;};
 for(const name of ['pdl-reader-page-ready','pdl-progress-pages','pdl-grid-layout-ready'])window.addEventListener(name,updateReading);
 byId('pdl-opf-status').removeAttribute('role');byId('pdl-opf-status').removeAttribute('aria-live');
 updateReading();
 window.addEventListener('pagehide',()=>clearTimeout(announcementTimer));
})();
