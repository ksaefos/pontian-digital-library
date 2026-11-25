
(function(){
  const isDesktop = ()=>window.innerWidth>768;
  function ensureCloseButton(){
    const row=document.querySelector('.sidebar-header-row');
    if(!row || document.getElementById('pdl-sidebar-close')) return;
    const btn=document.createElement('button');
    btn.id='pdl-sidebar-close';
    btn.type='button';
    btn.className='font-upload-btn';
    btn.title='Κλείσιμο πάνελ';
    btn.setAttribute('aria-label','Κλείσιμο πάνελ');
    btn.innerHTML='✕';
    btn.onclick=function(){document.getElementById('sidebar')?.classList.remove('open');document.body.classList.remove('pdl-drawer-open');document.getElementById('pdl-drawer-toggle')?.setAttribute('aria-expanded','false');pdlV1315SyncStates();};
    row.appendChild(btn);
  }
  function ensureChapterPill(){
    if(document.getElementById('pdl-chapter-pill')) return;
    const pill=document.createElement('div');
    pill.id='pdl-chapter-pill';
    pill.className='pdl-chapter-pill';
    document.body.appendChild(pill);
  }
  function chapterLabel(){
    try{
      const c=chapters[currentChapter];
      if(!c) return '';
      return (c.number && String(c.number).trim()) ? String(c.number).trim() : `${currentChapter+1}ο Κεφάλαιο`;
    }catch(e){return '';}
  }
  function updateChapterChrome(){
    const label=chapterLabel();
    const tb=document.getElementById('tb-chapter'); if(tb && label) tb.textContent=label;
    const sb=document.getElementById('sb-chapter-label'); if(sb && label) sb.textContent=label;
    const pill=document.getElementById('pdl-chapter-pill'); if(pill && label) pill.textContent=label;
    const list=[...document.querySelectorAll('.toc-list button')];
    list.forEach((btn,idx)=>btn.classList.toggle('active', idx===currentChapter));
    const info=document.getElementById('page-info');
    if(info && label){
      let pageText='';
      if(document.body.classList.contains('pdl-double') && window.innerWidth>768){
        const n=(typeof pdlNextPosition==='function')?pdlNextPosition(currentChapter,currentPage):null;
        pageText=n&&n.ch===currentChapter?`Σελίδες ${currentPage+1}–${n.pg+1} από ${chapters[currentChapter].pages.length}`:`Σελίδα ${currentPage+1} από ${chapters[currentChapter].pages.length}`;
      } else {
        pageText=`Σελίδα ${currentPage+1} από ${chapters[currentChapter].pages.length}`;
      }
      info.textContent=`${label} · ${pageText}`;
    }
  }
  function pdlV1315SyncStates(){
    const drawer=document.getElementById('pdl-drawer-toggle');
    const sidebar=document.getElementById('sidebar');
    if(drawer && sidebar){
      const open=sidebar.classList.contains('open');
      drawer.classList.toggle('pdl-selected', open);
      drawer.setAttribute('aria-expanded', String(open));
    }
    const searchBtn=document.getElementById('pdl-rail-search');
    const searchBar=document.getElementById('text-search-bar');
    if(searchBtn && searchBar) searchBtn.classList.toggle('pdl-selected', !searchBar.classList.contains('hidden'));
    const fitBtn=null;
    if(fitBtn){
      const on=document.body.classList.contains('pdl-fit-mode');
      fitBtn.classList.toggle('pdl-selected', on);
      fitBtn.setAttribute('aria-pressed', String(on));
    }
  }
  window.pdlV1315SyncStates=pdlV1315SyncStates;

  const origRender=window.render;
  if(typeof origRender==='function'){
    window.render=function(){const out=origRender.apply(this,arguments); updateChapterChrome(); pdlV1315SyncStates(); return out;};
  }
  ['toggleTextSearch','closeTextSearch','pdlToggleFullscreen','pdlExitFullscreen','pdlToggleDrawer','toggleSidebar','gotoChapter','nextPage','prevPage'].forEach(name=>{
    const fn=window[name];
    if(typeof fn==='function'){
      window[name]=function(){const out=fn.apply(this,arguments); setTimeout(()=>{updateChapterChrome(); pdlV1315SyncStates();},0); return out;};
    }
  });
  document.addEventListener('click', function(e){
    if(!isDesktop()) return;
    const sidebar=document.getElementById('sidebar');
    if(!sidebar || !sidebar.classList.contains('open')) return;
    if(e.target.closest('#sidebar') || e.target.closest('.pdl-rail')) return;
    if(e.target.closest('#text-viewport')) return;
    sidebar.classList.remove('open');
    document.body.classList.remove('pdl-drawer-open');
    pdlV1315SyncStates();
  });
  ensureCloseButton();
  ensureChapterPill();
  setTimeout(()=>{updateChapterChrome(); pdlV1315SyncStates();},0);
})();
