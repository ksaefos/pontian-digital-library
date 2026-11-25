
/* v1.3.10: mobile always uses dedicated immersive/chrome display; no desktop fit overlay. */
if(window.innerWidth<=768) document.body.classList.remove('pdl-fit-mode');
/* v1.3.9: Bookmarks are a mobile-only lightweight sheet; no desktop drawer. */
function pdlSyncMobileBookmark(){
 const button=document.getElementById('pdl-mobile-bookmark-toggle');
 if(!button)return;
 const active=loadBookmarks().some(pdlBMCurrent);
 button.setAttribute('aria-pressed',String(active));
 button.setAttribute('aria-label',active?'Αφαίρεση σελιδοδείκτη':'Προσθήκη σελιδοδείκτη');
 button.classList.toggle('is-bookmarked',active);
}
function pdlToggleMobileBookmark(){
 if(window.innerWidth>768)return;
 let bookmarks=loadBookmarks();
 const index=bookmarks.findIndex(pdlBMCurrent);
 const wasAdded=index<0;
 if(index>=0){bookmarks.splice(index,1);showToast('Ο σελιδοδείκτης αφαιρέθηκε');}
 else{
  if(bookmarks.length>=BM_MAX){showToast('Μέγιστο όριο: '+BM_MAX+' σελιδοδείκτες');return;}
  bookmarks.push({ch:currentChapter,chapterId:String(chapters[currentChapter].id),pg:currentPage,snippet:getPageSnippet(currentChapter,currentPage),anchor:pdlPageAnchor(currentChapter,currentPage)});
  showToast('Η σελίδα αποθηκεύτηκε');
 }
 saveBookmarks(bookmarks);renderBookmarks();updateBookmarkIcon();pdlSyncMobileBookmark();if(wasAdded)pdlSyncSatinRibbon(true);
}
function pdlCloseMobileBookmarks(){
 document.getElementById('pdl-mobile-bookmarks').hidden=true;
 document.getElementById('pdl-mobile-bookmarks-backdrop').hidden=true;
}
function pdlOpenMobileBookmarks(){
 if(window.innerWidth>768)return;
 const list=document.getElementById('pdl-mobile-bookmarks-list');
 list.replaceChildren();
 const bookmarks=loadBookmarks();
 if(!bookmarks.length){const empty=document.createElement('p');empty.textContent='Δεν έχεις αποθηκεύσει σελίδες ακόμη.';list.append(empty);}
 bookmarks.forEach((bm,i)=>{
  const row=document.createElement('div');row.className='pdl-mobile-bookmark-row';
  const goto=document.createElement('button');goto.className='pdl-bm-goto';
  const title=document.createElement('small');title.textContent=bm.unresolved?'Παλαιός σελιδοδείκτης — χρειάζεται ταυτοποίηση':`Κεφάλαιο ${bm.ch+1} · Σελίδα ${bm.pg+1}`;
  const excerpt=document.createElement('span');excerpt.textContent=bm.snippet||'Αποθηκευμένη σελίδα';
  goto.append(title,excerpt);goto.onclick=()=>{pdlCloseMobileBookmarks();gotoBookmark(i);pdlSyncMobileBookmark();};
  const del=document.createElement('button');del.textContent='✕';del.setAttribute('aria-label','Διαγραφή σελιδοδείκτη');del.onclick=()=>{deleteBookmark(i);pdlOpenMobileBookmarks();pdlSyncMobileBookmark();};
  row.append(goto,del);list.append(row);
 });
 document.getElementById('pdl-mobile-bookmarks-backdrop').hidden=false;
 document.getElementById('pdl-mobile-bookmarks').hidden=false;
}
const pdl139Render=render;
render=function(...args){const result=pdl139Render.apply(this,args);pdlSyncMobileBookmark();return result;};
const pdl139ToggleImmersive=toggleImmersive;
toggleImmersive=function(...args){pdlCloseMobileBookmarks();return pdl139ToggleImmersive.apply(this,args);};
document.addEventListener('keydown',e=>{if(e.key==='Escape')pdlCloseMobileBookmarks();});
pdlSyncMobileBookmark();
