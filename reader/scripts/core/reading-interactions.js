// ── ΣΥΝΘΕΤΑ ΜΕ ΠΑΥΛΑ (αγε-, κ.λπ.) → has-expr underline on desktop ──
function wrapCompounds() {
  const content = document.getElementById('page-content');
  if (!content) return;
  // Match punctuation variants without altering the source text or the dictionary headword.
  const compounds = Object.keys(glossary).filter(k => /[-‐‑–—]/u.test(k) && k.length > 3);
  if (!compounds.length) return;
  const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const variants = ch => {
    if ("'’‘ʼ`".includes(ch)) return "['’‘ʼ`]";
    if ('-‐‑–—'.includes(ch)) return '[-‐‑–—]';
    return escapeRe(ch);
  };
  const patterns = compounds.map(term => ({term, re:new RegExp(Array.from(term.normalize('NFC')).map(variants).join(''), 'gu')}));
  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      let p = node.parentNode;
      while (p && p !== content) {
        if (p.classList && (p.classList.contains('has-expr') || p.classList.contains('has-place') || p.classList.contains('has-compound'))) return NodeFilter.FILTER_REJECT;
        p = p.parentNode;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  const nodes = [];
  let node;
  while ((node = walker.nextNode())) nodes.push(node);
  for (const textNode of nodes) {
    const value = textNode.textContent;
    const hits = [];
    for (const {term,re} of patterns) {
      re.lastIndex = 0;
      let match;
      while ((match = re.exec(value)) !== null) {
        const at = match.index, last = at + match[0].length;
        const before = at ? value[at-1] : '', after = value[last] || '';
        const inWord=(i)=>{
          const c=value[i]||'',word=x=>!!x&&/[\p{L}\p{M}\p{N}'’‘ʼ]/u.test(x);
          return word(c)||(c==='-'&&word(value[i-1])&&word(value[i+1]));
        };
        if (!inWord(at-1) && !inWord(last)) hits.push({at,last,term});
        if (match[0].length === 0) re.lastIndex++;
      }
    }
    if (!hits.length) continue;
    hits.sort((a,b) => a.at - b.at || (b.last-b.at) - (a.last-a.at));
    const frag = document.createDocumentFragment();
    let offset = 0;
    for (const hit of hits) {
      if (hit.at < offset) continue;
      if (hit.at > offset) frag.appendChild(document.createTextNode(value.slice(offset,hit.at)));
      const span = document.createElement('span');
      span.className = 'has-expr has-compound';
      span.setAttribute('data-expr', hit.term + ' → γλωσσάρι');
      span.textContent = value.slice(hit.at,hit.last);
      span.addEventListener('click', function(event) {
        event.stopPropagation();
        const entry = glossary[hit.term];
        if (entry) showGloss(hit.term, entry);
      });
      frag.appendChild(span);
      offset = hit.last;
    }
    if (offset < value.length) frag.appendChild(document.createTextNode(value.slice(offset)));
    textNode.parentNode.replaceChild(frag,textNode);
  }
}

function render() {
  const ch = chapters[currentChapter];
  const page = ch.pages[currentPage];
  const totalPages = ch.pages.length;

  document.getElementById('sb-chapter-label').textContent = ch.number;
  document.getElementById('tb-chapter').textContent = ch.number;
  chapters.forEach((_, i) => document.getElementById('toc-' + i).classList.toggle('active', i === currentChapter));

  let html = '';
  if (currentPage === 0 && PDL_BOOK_EDITOR_SETTINGS.showChapterTitles) {
    html += `<div class="chapter-heading">
      <div class="chapter-number">${pdlEscapeHTML(ch.number)}</div>
    </div>`;
  }
  for (const para of page) html += pdlBlockMarkup(para);

  // PDL v1.5.5: A drop cap is a chapter ornament, never a page ornament.
  if (currentPage === 0 && PDL_BOOK_EDITOR_SETTINGS.dropCap) {
    const temp = document.createElement('div'); temp.innerHTML = html;
    const firstPara = Array.from(temp.children).find(el => el.tagName === 'P');
    if (firstPara && !firstPara.classList.contains('pdl-continuation') && !firstPara.classList.contains('pdl-rich-heading')) firstPara.classList.add('pdl-chapter-opening');
    html = temp.innerHTML;
  }
  document.getElementById('page-content').innerHTML = html;
  document.getElementById('text-viewport').scrollTop = 0;
  document.getElementById('page-info').textContent = `Σελίδα ${currentPage + 1} από ${totalPages}`;
  const pdlMobilePageInfo=document.getElementById('pdl-mobile-page-info');
  if(pdlMobilePageInfo) pdlMobilePageInfo.textContent=`Σελίδα ${currentPage + 1} από ${totalPages}`;
  if(window.innerWidth<=768){const pg=document.getElementById('pdl-mobile-progress');if(pg){const total=chapters.reduce((a,c)=>a+c.pages.length,0);const before=chapters.slice(0,currentChapter).reduce((a,c)=>a+c.pages.length,0);pg.max=Math.max(1,total);pg.value=before+currentPage+1;const counter=document.getElementById('pdl-mobile-page-info');if(counter)counter.textContent=`${pg.value} / ${total}`;}}

  const totalAll = chapters.reduce((s, c) => s + c.pages.length, 0);
  const done = chapters.slice(0, currentChapter).reduce((s, c) => s + c.pages.length, 0) + currentPage + 1;
  document.getElementById('progress').style.width = (done / totalAll * 100) + '%';

  document.getElementById('btn-prev').disabled = currentChapter === 0 && currentPage === 0;
  document.getElementById('btn-next').disabled = currentChapter === chapters.length - 1 && currentPage === totalPages - 1;



  // Expression tooltips
  document.querySelectorAll('.has-expr').forEach(el => {
    el.addEventListener('click', function(e) {
      e.stopPropagation();
      showExprTooltip(el.dataset.expr, e.clientX, e.clientY);
    });
    el.addEventListener('touchend', function(e) {
      e.preventDefault();
      const t = e.changedTouches[0];
      showExprTooltip(el.dataset.expr, t.clientX, t.clientY);
    });
  });

  wrapCompounds();
  textIndex = null; // reset so next search rebuilds fresh
  if (tsQuery) setTimeout(() => highlightPageMatches(tsCurrent), 30);
  updateBookmarkIcon();
}

// ── EXPRESSION TOOLTIP ──
let tooltipTimer = null;
function showExprTooltip(text, x, y) {
  const el = document.getElementById('expr-tooltip');
  el.textContent = text;
  el.classList.add('show');
  // Position
  const W = window.innerWidth, H = window.innerHeight;
  let left = x + 12, top = y - 40;
  if (left + 340 > W) left = x - 340;
  if (top < 0) top = y + 20;
  el.style.left = Math.max(8, left) + 'px';
  el.style.top = Math.max(8, top) + 'px';
  if (tooltipTimer) clearTimeout(tooltipTimer);
  tooltipTimer = setTimeout(() => el.classList.remove('show'), 8000);
}
document.addEventListener('click', () => document.getElementById('expr-tooltip').classList.remove('show'));

// ── FONT SIZE ──
let currentFontSize = parseInt(localStorage.getItem('fontSize') || '100');

function applyFontSize(val) {
  currentFontSize = Math.min(140, Math.max(80, val));
  document.documentElement.style.setProperty('--reader-font-size', (currentFontSize / 100 * 1.08) + 'rem');
  const label = document.getElementById('fontsize-value');
  if (label) label.textContent = currentFontSize + '%';
  localStorage.setItem('fontSize', currentFontSize);
}

function setFontSize(val) { applyFontSize(parseInt(val)); }
function changeFontSize(dir) { applyFontSize(currentFontSize + dir * 5); }

// Apply on load (after DOM ready)
document.addEventListener('DOMContentLoaded', () => applyFontSize(currentFontSize));
applyFontSize(currentFontSize);

// ── NIGHT MODE ──
function toggleNight() {
  document.body.classList.toggle('night');
  localStorage.setItem('nightMode', document.body.classList.contains('night') ? '1' : '0');
}
if (localStorage.getItem('nightMode') === '1') document.body.classList.add('night');

// ── FONT LOADER ──
function loadCustomFont(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    const fontName = 'UserFont_' + Date.now();
    const prev = document.getElementById('custom-font-style');
    if (prev) prev.remove();
    const style = document.createElement('style');
    style.id = 'custom-font-style';
    style.textContent = `@font-face { font-family: '${fontName}'; src: url('${e.target.result}'); }`;
    document.head.appendChild(style);
    document.documentElement.style.setProperty('--font-body', `'${fontName}', Calibri, sans-serif`);
    document.documentElement.style.setProperty('--font-display', `'${fontName}', Calibri, sans-serif`);
    // Update font button state
    const iconEl = document.getElementById('font-upload-icon');
    if (iconEl) iconEl.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M256-240h84l44-122h192l44 122h84L522-720h-84L256-240Zm152-192 70-198h4l70 198H408ZM160-80q-33 0-56.5-23.5T80-160v-640q0-33 23.5-56.5T160-880h640q33 0 56.5 23.5T880-800v640q0 33-23.5 56.5T800-80H160Zm0-80h640v-640H160v640Zm0-640v640-640Z"/></svg>';
    const btn = document.getElementById('font-upload-btn');
    if (btn) btn.title = 'Γραμματοσειρά φορτωμένη · κλικ για αλλαγή';
  };
  reader.readAsDataURL(file);
}
function resetFont() {
  const prev = document.getElementById('custom-font-style');
  if (prev) prev.remove();
  document.documentElement.style.setProperty('--font-body', "Calibri, 'Calibri Web', Candara, Optima, 'Segoe UI', sans-serif");
  document.documentElement.style.setProperty('--font-display', "Calibri, 'Calibri Web', Candara, Optima, 'Segoe UI', sans-serif");
  const iconEl = document.getElementById('font-upload-icon');
  if (iconEl) iconEl.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="m819-28-52-52H160q-33 0-56.5-23.5T80-160v-607l-53-53 57-57L876-85l-57 57ZM160-160h527L160-687v527Zm720-35-80-80v-525H275l-80-80h605q33 0 56.5 23.5T880-800v605ZM624-451 502-573l-20-57h-4l-9 24-54-54 23-60h84l102 269Zm-200 27Zm114-114Zm82 298-57-158 131 131 10 27h-84Zm-364 0 128-337 56 56-32 89h121l70 70H384l-44 122h-84Z"/></svg>';
  const btn = document.getElementById('font-upload-btn');
  if (btn) btn.title = 'Φόρτωση γραμματοσειράς';
  document.getElementById('font-file-input').value = '';
}

// ── TOAST ──
let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

// ── DOUBLE-CLICK GLOSSARY LOOKUP ──
function normalizeWord(w) {
  w = w.split('\u00AD').join('').trim();
  // Strip leading punctuation/quotes
  w = w.replace(/^[\s!-/:-@[-`{-~·«»‘’“”…—–«»()[\]\-.,;:!?]+/, '');
  // Strip trailing punctuation but be careful with U+2019 inside words
  w = w.replace(/[\s!-.:-?[-`{-~·»”…—–»()[\]\-.,;:!?]+$/, '');
  return w;
}

function lookupFromSelection() {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) return null;
  const raw = sel.toString();
  const word = normalizeWord(raw);
  if (!word || word.length < 2) return null;

  // Also try stripCombining variants for words with Pontic diacritics
  const norm = stripCombining(word);
  const variants = [
    word,
    word.toLowerCase(),
    '’' + word,
    '’' + word.toLowerCase(),
    '’' + word + '’',
    '’' + word.toLowerCase() + '’',
    word + '’',
    word.replace(/’$/, ''),
    word.toLowerCase().replace(/’$/, ''),
    norm,
    norm.toLowerCase(),
    '’' + norm,
    '’' + norm + '’',
    norm + '’',
    norm.replace(/’$/, ''),
  ];
  for (const v of variants) {
    if (v && glossary[v]) return { key: v, entry: glossary[v] };
  }
  return null;
}

// ── MOBILE TAP (Strategy A: caretRangeFromPoint) ──
function getWordAtPoint(x, y) {
  let range;
  if (document.caretRangeFromPoint) {
    range = document.caretRangeFromPoint(x, y);
  } else if (document.caretPositionFromPoint) {
    const pos = document.caretPositionFromPoint(x, y);
    if (!pos) return null;
    range = document.createRange();
    range.setStart(pos.offsetNode, pos.offset);
    range.setEnd(pos.offsetNode, pos.offset);
  } else {
    return null;
  }

  if (!range || range.startContainer.nodeType !== Node.TEXT_NODE) return null;

  const node = range.startContainer;
  const text = node.textContent;
  let start = range.startOffset;
  let end = range.startOffset;

  // Expand left — include leading U+2019 (e.g. ‘βάλλ’ναν)
  while (start > 0 && !isWordBoundaryAt(text,start - 1)) start--;
  // Expand right to word boundary
  while (end < text.length && !isWordBoundaryAt(text,end)) end++;

  let word = text.slice(start, end);

  // If word ends in U+2019 and the next sibling text node starts with
  // non-boundary chars, the text node was split by wrapCompounds/wrapPlaces.
  // Extend across the boundary to get the full word.
  if (word.endsWith('’')) {
    let next = node.nextSibling;
    while (next && next.nodeType === Node.ELEMENT_NODE) next = next.nextSibling;
    if (next && next.nodeType === Node.TEXT_NODE) {
      const rest = next.textContent;
      let ext = 0;
      while (ext < rest.length && !isWordBoundaryAt(rest,ext)) ext++;
      if (ext > 0) word = word + rest.slice(0, ext);
    }
  }

  return word.length > 0 ? word : null;
}

function isWordBoundary(ch) {
  // Space and punctuation — NOT U+2019 (inside words) and NOT hyphen (compound words)
  return /[\s\u0020\u00A0.,;:!?()\[\]\u00AB\u00BB\u201C\u201D\u2018\u2014\u2013\u00B7·]/.test(ch);
}
function isWordBoundaryAt(text,i){
 const c=text[i]||'',word=x=>!!x&&/[\p{L}\p{M}\p{N}'’‘ʼ]/u.test(x);
 if(/[-‐‑‒–—−]/u.test(c))return !(word(text[i-1])&&word(text[i+1]));
 return isWordBoundary(c);
}
// Track touch movement to avoid triggering on scroll
// ── TOUCH STATE ──
let touchStartY = 0, touchStartX = 0, touchMoved = false;
let touchEndX = 0, touchEndY = 0;
let navBlocked = false;
let longPressTimer = null;
let longPressReady = false; // vibrated & ready to fire on touchend

const LONG_PRESS_MS = 350; // mobile glossary only on an intentional hold
const SWIPE_MIN_PX  = 27;  // easier native pagination swipe, still distinguishes vertical movement

// ── IMMERSIVE MODE ──
let immersiveTimer = null;
const IMMERSIVE_DELAY = 5000;

function enterImmersive() {
  if (window.innerWidth > 768) return;
  document.body.classList.add('immersive');
}
function exitImmersive() {
  document.body.classList.remove('immersive');
}
function toggleImmersive() {
  document.body.classList.contains('immersive') ? exitImmersive() : enterImmersive();
}

// Immersive exits only via double-tap or timer — not on outside touch

// ── GLOSSARY LOOKUP HELPER ──
function lookupWordAtPoint(x,y){
 const phrase=window.pdlPhraseAtPoint?.(x,y);
 const word=phrase?.word||(typeof pdlWordAtPoint==='function'?pdlWordAtPoint(x,y):getWordAtPoint(x,y));
 const matches=phrase?.candidates||pdlCandidates(word);if(!matches.length)return;
 if(matches.length===1)showGloss(matches[0].term,matches[0],{x,y});
 else if(typeof pdlShowGlossChoices==='function')pdlShowGlossChoices(matches,{x,y});
}

// ── MAIN TOUCH HANDLERS ──
document.addEventListener('touchstart', function(e) {
  if (!e.target.closest('#text-viewport')) return;
  if (e.target.closest('.has-expr') || e.target.closest('.has-place')) return;

  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
  touchMoved = false;
  longPressReady = false;

  // Start long-press timer for glossary
  if (window.innerWidth <= 768) {
    longPressTimer = setTimeout(function() {
      if (!touchMoved) {
        longPressReady = true;
        // Haptic feedback — vibrate briefly as "ready" signal
        if (navigator.vibrate) navigator.vibrate(25);
      }
    }, LONG_PRESS_MS);
  }
}, { passive: true });

document.addEventListener('touchmove', function(e) {
  if (!e.target.closest('#text-viewport')) return;
  const dx = Math.abs(e.touches[0].clientX - touchStartX);
  const dy = Math.abs(e.touches[0].clientY - touchStartY);
  if (dx > 10 || dy > 10) {
    touchMoved = true;
    // Cancel long press if finger moves
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
  }
  touchEndX = e.touches[0].clientX;
  touchEndY = e.touches[0].clientY;
}, { passive: true });

document.addEventListener('touchend', function(e) {
  if (!e.target.closest('#text-viewport')) return;
  if (e.target.closest('.has-expr') || e.target.closest('.has-place')) return;

  if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }

  const t = e.changedTouches[0];
  touchEndX = t.clientX;
  touchEndY = t.clientY;

  const dx = touchEndX - touchStartX;
  const dy = touchEndY - touchStartY;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  // ── 1. SWIPE → page navigation ──
  // Ignore swipes starting within 22px of screen edge (iOS Safari back gesture)
  const EDGE_GUARD = 18;
  const edgeSwipe = touchStartX < EDGE_GUARD || touchStartX > window.innerWidth - EDGE_GUARD;
  if (touchMoved && absDx > SWIPE_MIN_PX && absDx > absDy * 1.35 && !edgeSwipe) {
    if (document.getElementById('text-viewport')?.classList.contains('pdl-opf-active')) return;
    if (dx < 0) nextPage();
    else prevPage();
    return;
  }

  // Ignore other moves
  if (touchMoved) return;
  if (navBlocked) return;

  // ── 2. LONG PRESS → glossary ──
  if (longPressReady) {
    longPressReady = false;
    lookupWordAtPoint(t.clientX, t.clientY);
    return;
  }

  // ── 3. DOUBLE TAP → immersive toggle (mobile) ──
  if (window.innerWidth <= 768) {
    const now = Date.now();
    const dt = now - (window._lastTap || 0);
    const tapX = t.clientX, tapY = t.clientY;
    const ddx = Math.abs(tapX - (window._lastTapX || 0));
    const ddy = Math.abs(tapY - (window._lastTapY || 0));

    if (dt < 320 && ddx < 60 && ddy < 60) {
      // Double tap confirmed
      window._lastTap = 0;
      toggleImmersive();
    } else {
      // First tap — record it
      window._lastTap = now;
      window._lastTapX = tapX;
      window._lastTapY = tapY;
    }
  }
}, { passive: true });

// v2.0.4: adjustable auto-close for glossary popups; interaction pauses the clock.
// Minimum 6 s for glossary popups; long definitions get up to 25 s, with interaction pausing the clock.
function pdlGlossAutoClose(popup,close){
 if(!popup)return;
 let state=popup.__pdlGlossClock;
 if(!state){
  state={timer:null,remaining:0,started:0,paused:false,close:null};
  popup.__pdlGlossClock=state;
  state.pause=()=>{
   if(state.paused)return;
   state.paused=true;
   if(state.timer!==null){clearTimeout(state.timer);state.timer=null;
    state.remaining=Math.max(0,state.remaining-(performance.now()-state.started));}
   popup.classList.add('pdl-gloss-clock-paused');
  };
  state.resume=()=>{
   if(!state.paused||state.remaining<=0)return;
   state.paused=false;
   popup.classList.remove('pdl-gloss-clock-paused');
   state.started=performance.now();
   state.timer=setTimeout(()=>{state.timer=null;state.close?.();},state.remaining);
  };
  popup.addEventListener('pointerenter',state.pause);
  popup.addEventListener('pointerleave',state.resume);
  popup.addEventListener('focusin',state.pause);
  popup.addEventListener('focusout',e=>{if(!popup.contains(e.relatedTarget))state.resume();});
 }
 if(state.timer!==null)clearTimeout(state.timer);
 state.timer=null;
 state.remaining=Math.max(6000,Math.min(25000,Math.round((popup.textContent||'').length*65)));
 state.close=close;
 popup.style.setProperty('--pdl-gloss-duration',state.remaining+'ms');
 popup.classList.remove('pdl-gloss-clock-active','pdl-gloss-clock-paused');
 // Restart the visual countdown when a new word reuses the same popup.
 void popup.offsetWidth;
 popup.classList.add('pdl-gloss-clock-active');
 state.paused=true;
 state.resume();
 if(popup.matches(':hover')||popup.contains(document.activeElement))state.pause();
}
function pdlGlossCancelClock(popup){
 const state=popup?.__pdlGlossClock;
 if(!state)return;
 if(state.timer!==null)clearTimeout(state.timer);
 state.timer=null;state.remaining=0;state.close=null;
 popup.classList.remove('pdl-gloss-clock-active','pdl-gloss-clock-paused');
}

// ── SHOW GLOSS IN SIDEBAR ──
function showGloss(key,entry,point){
 if(!entry)entry=lookupGloss(key);if(!entry)return;
 const el=document.getElementById('glossary-content');
 if(el){
  const existing=[...el.querySelectorAll('.gloss-entry')].find(x=>x.dataset.gkey===String(entry.term));
  if(existing)existing.remove();
  if(el.querySelector('.glossary-empty'))el.replaceChildren();
  const item=document.createElement('div');item.className='gloss-entry';item.dataset.gkey=String(entry.term);
  const title=document.createElement('div');title.className='gloss-term';title.textContent=entry.term;
  const meaning=document.createElement('div');meaning.className='gloss-def';meaning.textContent=entry.def||entry.definition||'';
  item.append(title);
  if(entry.etymology){const et=document.createElement('div');et.className='gloss-etymology';et.textContent='Ετυμολογία: '+entry.etymology;item.append(et);}
  item.append(meaning);el.prepend(item);
 }
 let popup=document.getElementById('pdl-inline-gloss');
 if(!popup){popup=document.createElement('aside');popup.id='pdl-inline-gloss';popup.setAttribute('role','status');
  popup.style.cssText='position:fixed;z-index:99999;max-width:min(90vw,420px);width:max-content;background:var(--paper,#fffaf0);color:var(--md-on-surface,#222);border:1px solid #b4aaa0;border-radius:12px;box-shadow:0 5px 24px #0004;padding:14px 40px 14px 16px;font-size:16px;line-height:1.5';document.body.append(popup);}
 popup.replaceChildren();
 const close=document.createElement('button');close.type='button';close.textContent='×';close.setAttribute('aria-label','Κλείσιμο επεξήγησης');close.style.cssText='position:absolute;right:8px;top:4px;background:none;border:0;font-size:25px;cursor:pointer';close.onclick=()=>popup.remove();
 const title=document.createElement('strong');title.textContent=entry.term;
 popup.append(close,title);
 if(entry.etymology){const et=document.createElement('div');et.style.cssText='font-size:.82em;opacity:.78';et.textContent='Ετυμολογία: '+entry.etymology;popup.append(et);}
 const meaning=document.createElement('div');meaning.textContent=entry.def||entry.definition||'';popup.append(meaning);
 popup.style.left='12px';popup.style.top='12px';popup.style.bottom='auto';popup.style.transform='none';
 const rect=popup.getBoundingClientRect();
 const x=point?.x??Math.round(innerWidth/2),y=point?.y??Math.round(innerHeight/2);
 const left=Math.max(10,Math.min(x+12,innerWidth-rect.width-10));
 let top=y+18;if(top+rect.height>innerHeight-10)top=Math.max(10,y-rect.height-14);
 popup.style.left=left+'px';popup.style.top=top+'px';
 pdlGlossAutoClose(popup,()=>popup.remove());
}

// ── MOBILE GLOSS POPUP ──
function showMobileGloss(entry) {
  document.getElementById('mgp-term').textContent = entry.term;
  document.getElementById('mgp-def').textContent = entry.def;
  const popup = document.getElementById('mobile-gloss-popup');
  popup.classList.add('show');
  pdlGlossAutoClose(popup,closeMobileGloss);
}
function closeMobileGloss() {
  const popup=document.getElementById('mobile-gloss-popup');
  pdlGlossCancelClock(popup);
  popup.classList.remove('show');
}
// Close popup on tap outside
document.addEventListener('touchstart', function(e) {
  const popup = document.getElementById('mobile-gloss-popup');
  if (popup.classList.contains('show') && !popup.contains(e.target)) {
    closeMobileGloss();
  }
}, { passive: true });

// ── NAVIGATION ──
function flipPage(direction, callback){callback();}
document.addEventListener('DOMContentLoaded',()=>{document.documentElement.dataset.flipEngine='none';});

function nextPage() {
  const ch = chapters[currentChapter];
  const canGo = currentPage < ch.pages.length - 1 ||
                currentChapter < chapters.length - 1;
  if (!canGo) return;
  flipPage('next', () => {
    if (currentPage < ch.pages.length - 1) currentPage++;
    else { currentChapter++; currentPage = 0; }
    render();
  });
}
function prevPage() {
  const canGo = currentPage > 0 || currentChapter > 0;
  if (!canGo) return;
  flipPage('prev', () => {
    if (currentPage > 0) currentPage--;
    else { currentChapter--; currentPage = chapters[currentChapter].pages.length - 1; }
    render();
  });
}
function gotoChapter(idx) { currentChapter = idx; currentPage = 0; render(); }
function toggleSidebar() { document.getElementById('sidebar').classList.toggle('open'); }

document.addEventListener('keydown', e => {
  if (e.target.closest('input, textarea, select, [contenteditable]') || e.altKey || e.ctrlKey || e.metaKey) return;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') nextPage();
  if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   prevPage();
});

document.getElementById('text-viewport').addEventListener('click', () => {
  if (window.innerWidth <= 768) document.getElementById('sidebar').classList.remove('open');
});

// ── TOUCH DETECTION ──
// Add is-touch class only on actual touch devices
function detectTouch() {
  if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
    document.body.classList.add('is-touch');
  }
}
detectTouch();

// Update glossary hint based on device
(function() {
  const hint = document.getElementById('glossary-hint');
  if (hint && ('ontouchstart' in window || navigator.maxTouchPoints > 0)) {
    hint.textContent = 'Παρατεταμένο πάτημα σε οποιαδήποτε λέξη για αναζήτηση στο γλωσσάρι.';
  }
})();


