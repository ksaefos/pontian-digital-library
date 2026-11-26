
// Single source of truth for the public application's visible version.
const PDL_APP_VERSION='4.0.0-beta.1';
const PDL_LIBRARY_TITLE='Pontian Digital Library — Βιβλιοθήκη v'+PDL_APP_VERSION.replace(/\.0(?=-|$)/,'').replace(/-beta\.(\d+)$/,' beta $1');
document.title=PDL_LIBRARY_TITLE;
const pdlRuntime=JSON.parse(document.getElementById('pdl-runtime-config').textContent);
let readerShellTemplate='',pdlReaderPromise=null,pdlOpenGeneration=0,pdlOfflineBookReady=Promise.resolve(false);
function pdlLoadReaderTemplate(){if(!pdlReaderPromise)pdlReaderPromise=pdlFetchText(pdlRuntime.template).then(text=>readerShellTemplate=text).catch(error=>{pdlReaderPromise=null;throw error;});return pdlReaderPromise;}
const importedBooks=Object.create(null);
const titleMap=Object.create(null);
let activeBook=null;
let pdlReaderOpener=null;
const safeRead=k=>{try{return localStorage.getItem(k);}catch(e){return null;}};
const safeWrite=(k,v)=>{try{localStorage.setItem(k,v);}catch(e){console.warn('Progress save:',e);}};
function progressOf(id){try{
 const p=JSON.parse(safeRead('pdl:v140:position:'+id)||'null');if(!p)return null;
 const chapters=importedBooks[id]?.chapters||[];
 if(p.chapterId){const idx=chapters.findIndex(ch=>String(ch.id)===String(p.chapterId));if(idx>=0)p.ch=idx;}
 return p;
 }catch(e){return null;}}
function refreshCatalog(){
 for(const id of Object.keys(titleMap)){
  const el=document.getElementById(id+'-progress'),p=progressOf(id);
  if(el)el.textContent=p?('Συνέχεια · Κεφάλαιο '+(Number(p.ch)+1)+', σελίδα '+(Number(p.pg)+1)):'';
 }
}
// Backward-compatible bookmark/position migration. Original keys are never deleted.
function pdlMigrateProgress(id){
 const b=importedBooks[id];if(!b)return null;
 try{
  const canonical='pdl:bookmarks:'+id,incorrect='pdl:bookmarks:'+String(id).replace(/^studio:/,'');
  const oldSaved=localStorage.getItem(incorrect);
  if(oldSaved&&!localStorage.getItem(canonical))localStorage.setItem(canonical,oldSaved);
 }catch(e){}
 const title=String(b.title||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('el');
 const old=title.includes('σωνιτσα')?'sonitsa':title.includes('ψωμιν')?'psomin':null;
 if(!old)return null;
 const existing=progressOf(id),prior=progressOf(old);
 if(!existing&&prior)safeWrite('pdl:v140:position:'+id,JSON.stringify(prior));
 try{const legacy=localStorage.getItem('pdl:bookmarks:'+old);if(legacy&&!localStorage.getItem('pdl:bookmarks:'+id))localStorage.setItem('pdl:bookmarks:'+id,legacy);}catch(e){}
 return existing||prior;
}
async function openBook(id){
 if(!importedBooks[id])return;
 pdlReaderOpener=[...document.querySelectorAll('.book-card')].find(node=>node.dataset.book===id)||document.activeElement;
 const generation=++pdlOpenGeneration;activeBook=id;
 document.body.classList.add('reading');
 document.title=(titleMap[id]||'Βιβλίο')+' — Pontian Digital Library';
 document.getElementById('pdl-book-loading').hidden=false;
 try{
  const [book]=await Promise.all([pdlLoadBook(id),pdlLoadReaderTemplate(),pdlLoadGlossary()]);
  if(generation!==pdlOpenGeneration||activeBook!==id)return;
  const migrated=pdlMigrateProgress(id),position=progressOf(id)||migrated;
  document.getElementById('reader-frame').title='Ανάγνωση: '+String(book.title||'Βιβλίο');
  document.getElementById('reader-frame').srcdoc=buildImportedMarkup(book,position);
  document.getElementById('pdl-book-loading').hidden=true;
  if(libraryState.catalog)pdlOfflineBookReady=pdlCacheAssets(pdlBookOfflineAssets(book)).then(()=>true).catch(error=>{console.warn('Offline book preparation:',error);return false;});
  safeWrite('pdl:v140:lastbook',id);
 }catch(err){if(generation!==pdlOpenGeneration)return;console.error(err);closeBook();document.getElementById('pdl-import-status').textContent='Δεν άνοιξε το βιβλίο. Έλεγξε τη σύνδεση ή ανανέωσε τη βιβλιοθήκη. Για ανάγνωση χωρίς δίκτυο, ολοκλήρωσε πρώτα τη λήψη offline. '+err.message;document.body.classList.add('pdl-public-error');}
}
function closeBook(){
 ++pdlOpenGeneration;document.getElementById('pdl-book-loading').hidden=true;
 const frame=document.getElementById('reader-frame');
 try{if(frame.contentDocument?.fullscreenElement)frame.contentDocument.exitFullscreen();}catch(e){}
 frame.removeAttribute('srcdoc');frame.src='about:blank';activeBook=null;
 document.body.classList.remove('reading');document.title=PDL_LIBRARY_TITLE;refreshCatalog();
 if(pdlReaderOpener?.isConnected)pdlReaderOpener.focus({preventScroll:true});
}
window.addEventListener('message',event=>{
 if(event.source!==document.getElementById('reader-frame').contentWindow)return;
 const d=event.data;
 if(d?.kind==='pdl-return-library'){closeBook();return;}
 if(!d||d.kind!=='pdl-reader-progress'||d.bookId!==activeBook)return;
 if(!Number.isInteger(d.ch)||!Number.isInteger(d.pg)||d.ch<0||d.pg<0)return;
 const chapter=importedBooks[activeBook]?.chapters?.[d.ch];if(!chapter)return;
 const anchor=Number.isSafeInteger(d.anchor?.index)&&d.anchor.index>=0&&
  Number.isSafeInteger(d.anchor.offset)&&d.anchor.offset>=0
  ?{index:d.anchor.index,offset:d.anchor.offset}:null;
 safeWrite('pdl:v140:position:'+activeBook,JSON.stringify({ch:d.ch,chapterId:chapter.id??null,pg:d.pg,...(anchor?{anchor}:{})}));
});
