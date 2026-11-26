
/* Pontian Digital Library v1.3.13: desktop-exclusive navigation model */
(function(){
 const aside=document.getElementById('sidebar');
 const header=aside?.querySelector('.sidebar-header');
 if(!aside||!header)return;
 const nav=document.createElement('div');nav.className='pdl-panel-tabs';nav.setAttribute('role','tablist');nav.setAttribute('aria-label','Ενότητες πλευρικής καρτέλας');
 nav.innerHTML='<button id="pdl-tab-book" type="button" role="tab" aria-selected="true">Βιβλίο</button><button id="pdl-tab-appearance" type="button" role="tab" aria-selected="false">Εμφάνιση</button>';
 header.after(nav);
 
 function setMode(mode){
   aside.dataset.pdlPanel=mode;
   nav.querySelectorAll('button').forEach(b=>{const on=b.id==='pdl-tab-'+mode;b.classList.toggle('active',on);b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1;});
 }
 nav.addEventListener('keydown',event=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  event.preventDefault();
  const mode=event.key==='Home'?'book':event.key==='End'?'appearance':aside.dataset.pdlPanel==='book'?'appearance':'book';
  setMode(mode);document.getElementById('pdl-tab-'+mode).focus();
 });
 setMode('book');
 nav.querySelector('#pdl-tab-book').onclick=()=>setMode('book');
 nav.querySelector('#pdl-tab-appearance').onclick=()=>setMode('appearance');
 const b=document.getElementById('pdl-drawer-toggle');
 if(b){b.title='Ρυθμίσεις βιβλίου και εμφάνισης';b.setAttribute('aria-label',b.title);
   b.addEventListener('click',()=>{if(window.innerWidth>768)setMode('book');});}
 const oldSettings=window.pdlOpenSettings;
 window.pdlOpenSettings=function(){
   if(window.innerWidth>768){setMode('appearance');aside.classList.add('open');window.pdlSyncDrawer?.();document.getElementById('pdl-font-select')?.focus({preventScroll:true});}
   else oldSettings();
 };
 const oldDrawer=window.pdlToggleDrawer;
 window.pdlToggleDrawer=function(){
   if(window.innerWidth>768 && aside.classList.contains('open') && aside.dataset.pdlPanel!=='book'){
    setMode('book');window.pdlSyncDrawer?.();return;
   }
   oldDrawer();if(window.innerWidth>768)setMode('book');
 };
 // The top search rail remains a quick action; bookmarks are managed inside the Book tab.
 const railSettings=document.querySelector('.pdl-rail button[onclick="pdlOpenSettings()"]');
 if(railSettings)railSettings.setAttribute('title','Εμφάνιση: γραμματοσειρά, θέμα, διάταξη, μέγεθος');
})();
