
/* Double tap toggles the initial mobile reading state. */
const pdlOldToggleImmersive=toggleImmersive;
toggleImmersive=function(){
 if(window.innerWidth>768)return;
 const sidebar=document.getElementById('sidebar');
 if(sidebar.classList.contains('open'))sidebar.classList.remove('open');
 pdlOldToggleImmersive();
 if(document.body.classList.contains('immersive')){
   const bar=document.getElementById('text-search-bar');
   if(bar && !bar.classList.contains('hidden') && typeof closeTextSearch==='function')closeTextSearch();
 }
 // The controls are overlay-only: no re-pagination or position shift.
};
/* v1.3.6 mobile drawer coordination: no permanent top/bottom UI. */
function pdlMobileSyncMenu(){
 const open=document.getElementById('sidebar').classList.contains('open');
 document.body.classList.toggle('pdl-mobile-drawer-open',open);
 const btn=document.getElementById('pdl-mobile-menu-button');
 if(btn){btn.setAttribute('aria-expanded',String(open));btn.setAttribute('aria-label',open?'Κλείσιμο μενού ανάγνωσης':'Άνοιγμα μενού ανάγνωσης');}
}
function pdlMobileToggleMenu(){document.getElementById('sidebar').classList.toggle('open');pdlMobileSyncMenu();}
function pdlMobilePage(direction){pdlMobileToggleMenu();if(direction===1)nextPage();else prevPage();}
function pdlMobileSearch(){document.getElementById('sidebar').classList.remove('open');pdlMobileSyncMenu();toggleTextSearch();}
const pdlMobileObserver=new MutationObserver(()=>pdlMobileSyncMenu());
pdlMobileObserver.observe(document.getElementById('sidebar'),{attributes:true,attributeFilter:['class']});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&document.getElementById('sidebar').classList.contains('open')){document.getElementById('sidebar').classList.remove('open');pdlMobileSyncMenu();}});
