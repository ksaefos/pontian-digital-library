// ── ΣΕΛΙΔΟΔΕΙΚΤΕΣ ──
const BM_KEY = PDL_IMPORTED_BOOKMARK_KEY;
const BM_MAX = 6;

// Stable bookmark identity: always prefer chapterId to positional chapter indexes.
function pdlBMPlain(value){return String(value||'').normalize('NFC').replace(/[’‘ʼ`΄´']/g,'’').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().toLocaleLowerCase('el');}
function pdlBMResolve(b){
  if(!b||typeof b!=='object')return null;
  const x={...b};
  if(x.chapterId){
    const idx=chapters.findIndex(ch=>String(ch.id)===String(x.chapterId));
    if(idx<0)return {...x,unresolved:true};
    x.ch=idx;x.unresolved=false;return x;
  }
  // Old bookmarks have no stable chapter identity. A unique text excerpt can
  // recover the intended chapter even after chapters have been reordered.
  const needle=pdlBMPlain(x.snippet).replace(/…$/,'').trim();
  if(needle.length>=12){
    const matches=PDL_SOURCE.map((chapter,i)=>({i,text:pdlBMPlain(chapter.blocks.map(b=>b.text||'').join(' '))}))
      .filter(record=>record.text.includes(needle));
    if(matches.length===1){x.ch=matches[0].i;x.chapterId=String(chapters[x.ch].id);x.unresolved=false;return x;}
  }
  // Without a unique match the old index is not safe after a reorder.
  return {...x,unresolved:true};
}
function loadBookmarks() {
  try {
    const raw=JSON.parse(localStorage.getItem(BM_KEY)||'[]');
    if(!Array.isArray(raw))return [];
    const resolved=raw.map(pdlBMResolve).filter(Boolean);
    // Persist only successful, unambiguous migrations; do not overwrite
    // the archived bookmark or guess where a legacy bookmark belongs.
    if(resolved.some((b,i)=>b.chapterId&&!raw[i]?.chapterId)){
      const merged=resolved.map((b,i)=>b.chapterId?{...raw[i],chapterId:b.chapterId,ch:b.ch}:raw[i]);
      localStorage.setItem(BM_KEY,JSON.stringify(merged));
    }
    return resolved;
  } catch(e){console.warn('Bookmark read:',e);return [];}
}
function pdlBMCurrent(b){return !b.unresolved&&b.chapterId===String(chapters[currentChapter]?.id)&&b.pg===currentPage;}
function pdlBMJump(b){
  if(b.unresolved||!Number.isInteger(b.ch)||!chapters[b.ch]){
    showToast('Παλαιός σελιδοδείκτης: δεν ταυτοποιήθηκε το κεφάλαιο.');return false;
  }
  currentChapter=b.ch;
  currentPage=b.anchor?pdlPositionPage(b.ch,b.anchor):Math.min(Math.max(0,b.pg||0),Math.max(0,chapters[b.ch].pages.length-1));
  render();
  if(window.innerWidth<=768)document.getElementById('sidebar')?.classList.remove('open');
  return true;
}
function saveBookmarks(bms) {
  localStorage.setItem(BM_KEY, JSON.stringify(bms));
}

function getPageSnippet(ch, pg) {
  const page = chapters[ch].pages[pg];
  for (const para of page) {
    if (para.type !== 'divider' && para.type !== 'telos' && para.text) {
      const plain = para.text.replace(/<[^>]*>/g, '').trim();
      return plain.slice(0, 48) + (plain.length > 48 ? '…' : '');
    }
  }
  return 'Κεφ. ' + (ch + 1) + ' · σελ. ' + (pg + 1);
}

function pdlEscapeHTML(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function renderBookmarks() {
  const bms = loadBookmarks();
  const list = document.getElementById('bookmark-list');
  if (!list) return;

  if (bms.length === 0) {
    list.innerHTML = '<li><span class="bookmark-empty">Δεν υπάρχουν σελιδοδείκτες.</span></li>';
    return;
  }

  list.innerHTML = bms.map((bm, i) => `
    <li class="bookmark-item">
      <button class="bookmark-goto" onclick="gotoBookmark(${i})" title="${pdlEscapeHTML(bm.snippet)}">
        <strong style="color:var(--md-primary);font-size:0.75rem">
          ${bm.unresolved?'Παλαιός σελιδοδείκτης — μη ταυτοποιημένος':`Κεφ. ${bm.ch + 1} · σελ. ${bm.pg + 1}`}
        </strong>
        <br><span style="font-size:0.78rem">${pdlEscapeHTML(bm.snippet)}</span>
      </button>
      <button class="bookmark-del" onclick="deleteBookmark(${i})" title="Διαγραφή">
        <span class="material-symbols-outlined">close</span>
      </button>
    </li>
  `).join('');
}

function pdlSyncSatinRibbon(animate=false){
  const ribbon=document.getElementById('pdl-satin-ribbon');
  if(!ribbon)return;
  const active=loadBookmarks().some(pdlBMCurrent);
  if(!active){ribbon.classList.remove('is-entering','is-saved');return;}
  ribbon.classList.add('is-saved');
  if(animate){
    ribbon.classList.remove('is-entering');
    void ribbon.offsetWidth; // restart only on explicit add, not during page rendering
    ribbon.classList.add('is-entering');
  }else{ribbon.classList.remove('is-entering');}
}
function updateBookmarkIcon() {
  const exists = loadBookmarks().some(pdlBMCurrent);
  const legacyIcon = document.getElementById('bookmark-icon');
  const legacyBtn = document.getElementById('bookmark-btn');
  const railBtn = document.getElementById('pdl-rail-bookmark');
  const railPath = document.querySelector('#pdl-rail-bookmark-icon path');
  if (legacyIcon) legacyIcon.classList.toggle('pdl-bookmarked', exists);
  if (legacyBtn) {
    legacyBtn.classList.toggle('active', exists);
    legacyBtn.title = exists ? 'Αφαίρεση σελιδοδείκτη' : 'Προσθήκη σελιδοδείκτη';
    legacyBtn.setAttribute('aria-label', legacyBtn.title);
    legacyBtn.setAttribute('aria-pressed', String(exists));
  }
  if (railBtn) {
    railBtn.classList.toggle('pdl-bookmarked', exists);
    railBtn.setAttribute('aria-pressed', String(exists));
    railBtn.setAttribute('aria-label', exists ? 'Αφαίρεση σελιδοδείκτη' : 'Προσθήκη σελιδοδείκτη');
    railBtn.title = railBtn.getAttribute('aria-label');
  }
  if (railPath) railPath.setAttribute('d', exists ? "M200-120v-640q0-33 23.5-56.5T280-840h400q33 0 56.5 23.5T760-760v640L480-240 200-120Z" : "M200-120v-640q0-33 23.5-56.5T280-840h240v80H280v518l200-86 200 86v-278h80v400L480-240 200-120Zm80-640h240-240Zm400 160v-80h-80v-80h80v-80h80v80h80v80h-80v80h-80Z");
  pdlSyncSatinRibbon(false);
}
function addBookmark() {
  let bms = loadBookmarks();
  const exists = bms.findIndex(pdlBMCurrent);

  if (exists !== -1) {
    // Already exists — remove it (toggle)
    bms.splice(exists, 1);
    saveBookmarks(bms);
    renderBookmarks();
    updateBookmarkIcon();
    showToast('Σελιδοδείκτης αφαιρέθηκε');
    return;
  }

  if (bms.length >= BM_MAX) {
    showToast('Μέγιστος αριθμός σελιδοδεικτών (' + BM_MAX + ')');
    return;
  }

  bms.push({
    ch: currentChapter,
    chapterId: String(chapters[currentChapter].id),
    pg: currentPage,
    anchor: pdlPageAnchor(currentChapter,currentPage),
    snippet: getPageSnippet(currentChapter, currentPage)
  });
  saveBookmarks(bms);
  renderBookmarks();
  updateBookmarkIcon();
  pdlSyncSatinRibbon(true);

  // Keep the drawer exactly as the reader left it; bookmarks are managed in the Book panel.
  showToast('Σελιδοδείκτης αποθηκεύτηκε');
}

function gotoBookmark(idx) {
  const b=loadBookmarks()[idx];if(!b)return;
  pdlBMJump(b);
}

function deleteBookmark(idx) {
  const bms = loadBookmarks();
  bms.splice(idx, 1);
  saveBookmarks(bms);
  renderBookmarks();
  updateBookmarkIcon();
}


const chapters = buildChapters();
// Dynamic contents list: never retain chapters from a previous edition.
(function pdlBuildDynamicContents(){
 const list=document.querySelector('#sidebar .toc-list');
 if(!list)return;
 list.replaceChildren();
 chapters.forEach((chapter,index)=>{
  const li=document.createElement('li');
  const button=document.createElement('button');
  button.id='toc-'+index;
  button.type='button';
  button.textContent=(chapter.number && /κεφάλ/i.test(chapter.number)) ? chapter.number : `${index+1}ο Κεφάλαιο`;
  button.onclick=()=>gotoChapter(index);
  if(index===0)button.classList.add('active');
  li.append(button);list.append(li);
 });
})();

let currentChapter = 0, currentPage = 0;

