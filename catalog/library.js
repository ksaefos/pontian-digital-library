
// Published-library bridge. No book text or glossary is hard-coded in this page.
const libraryState={books:[],entries:[]};
function pdlEscapeHTML(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function pdlSafeJS(value){return JSON.stringify(value).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');}
function pdlSeparateTerm(value){
 const term=String(value||'').trim(),at=term.indexOf('(');
 if(at<1)return {term,etymology:''};
 const suffix=term.slice(at).trim();let depth=0;
 for(let i=0;i<suffix.length;i++){
  if(suffix[i]==='(')depth++;else if(suffix[i]===')')depth--;
  if(depth<0||(depth===0&&suffix.slice(i+1).trim()))return {term,etymology:''};
 }
 return depth===0?{term:term.slice(0,at).trim(),etymology:suffix.slice(1,-1).trim()}:{term,etymology:''};
}
const pdlGlossaryCache=new WeakMap();
function pdlGlossaryFromEntries(entries){
 if(pdlGlossaryCache.has(entries))return pdlGlossaryCache.get(entries);
 // One library-wide dictionary. Citations describe provenance, not where a
 // headword is available. Group display values without changing source rows.
 const dictionary=Object.create(null),groups=new Map();
 for(const row of entries){
  if(!row||typeof row.term!=='string'||typeof row.definition!=='string')continue;
  const part=pdlSeparateTerm(row.term),term=part.term.trim(),def=row.definition.trim(),etymology=String(row.etymology||part.etymology||'');
  if(!term||!def)continue;
  if(!groups.has(term))groups.set(term,{definitions:new Set(),etymologies:new Set()});
  const group=groups.get(term);group.definitions.add(def);
  if(etymology)group.etymologies.add(etymology);
 }
 for(const [term,group] of groups){
  const def=[...group.definitions].join(' · ');
  dictionary[term]={term,def,definition:def,etymology:[...group.etymologies].join(' · ')};
 }
 pdlGlossaryCache.set(entries,dictionary);return dictionary;
}
function pdlParagraphs(text){
 // *** alone on a line is a section break, not a new chapter.
 // Preserve ordinary asterisks inside prose and the original paragraph boundaries.
 const blocks=String(text||'').replace(/\r\n?/g,'\n').split(/(^[ \t]*\*{3}[ \t]*$)/gm);
 const out=[];
 for(const block of blocks){
  if(/^[ \t]*\*{3}[ \t]*$/.test(block)){out.push({type:'divider'});continue;}
  for(const para of block.split(/\n[ \t]*\n/g)){
   const clean=para.trim();if(clean)out.push({type:'p',text:pdlEscapeHTML(clean)});
  }
 }
 return out;
}
// PDL 2.3: restricted editorial markup. Ignore all active HTML and attributes except alignment.
function pdlRichParagraphs(html){
 if(typeof html!=='string'||!html.trim()||html.length>2000000)return null;
 const root=new DOMParser().parseFromString('<main>'+html+'</main>','text/html').querySelector('main');
 if(!root)return null;
 const esc=s=>pdlEscapeHTML(s);
 const safeUrl=s=>{const t=String(s||'').trim();return /^https:\/\/[^\s"'<>]+$/i.test(t)?t:null;};
 function inline(node){
  if(node.nodeType===3)return esc(node.nodeValue);
  if(node.nodeType!==1)return '';
  const tag=node.tagName.toLowerCase();
  if(['script','style','svg','math','iframe','object','template','form','video','audio'].includes(tag))return '';
  if(tag==='br')return '<br>';
  const content=[...node.childNodes].map(inline).join('');
  const allowed={b:'strong',strong:'strong',i:'em',em:'em',u:'u',s:'s',strike:'s',sup:'sup',sub:'sub'};
  if(allowed[tag])return '<'+allowed[tag]+'>'+content+'</'+allowed[tag]+'>';
  if(tag==='a'){
    const link=safeUrl(node.getAttribute('href'));return link?'<a href="'+esc(link)+'" target="_blank" rel="noopener noreferrer">'+content+'</a>':content;
  }
  const st=node.getAttribute('style')||'';let value=content;
  if(/(?:^|;)\s*font-weight\s*:\s*(?:bold|[7-9]00)/i.test(st))value='<strong>'+value+'</strong>';
  if(/(?:^|;)\s*font-style\s*:\s*italic/i.test(st))value='<em>'+value+'</em>';
  if(/(?:^|;)\s*text-decoration(?:-line)?\s*:\s*underline/i.test(st))value='<u>'+value+'</u>';
  return value;
 }
 function alignment(el){
  const attr=el.getAttribute('data-align')||el.getAttribute('data-pdl-align')||'';
  const match=(el.getAttribute('style')||'').match(/(?:^|;)\s*text-align\s*:\s*(left|center|right|justify)\b/i);
  return ['left','right','center','justify'].includes(attr)?attr:(match?.[1]?.toLowerCase()||'justify');
 }
 const blocks=[];
 function paragraph(el,prefix='',quote=false){
  const tag=el.tagName.toLowerCase();
  const lev=/^h[1-6]$/.test(tag)?Number(tag.slice(1)):(el.hasAttribute('data-heading')?Number(el.getAttribute('data-heading'))||3:0);
  const value=prefix+[...el.childNodes].map(inline).join('');
  if((el.textContent||'').trim()==='***'&&!prefix){blocks.push({type:'divider'});return;}
  if((el.textContent||'').trim()||prefix||tag==='br')blocks.push({type:'p',text:value,align:alignment(el),heading:!!lev,headingLevel:lev,listKind:prefix?'list':null,quote});
 }
 function table(el){
   let markup='<table>';
   for(const tr of el.querySelectorAll('tr')){
     markup+='<tr>';
     for(const td of tr.children){const tag=td.tagName.toLowerCase();if(tag!=='td'&&tag!=='th')continue;
       const span=n=>{const x=Number(td.getAttribute(n));return Number.isInteger(x)&&x>=2&&x<=20?' '+n+'="'+x+'"':'';};
       markup+='<'+tag+span('colspan')+span('rowspan')+'>'+[...td.childNodes].map(inline).join('')+'</'+tag+'>';
     }
     markup+='</tr>';
   }
   markup+='</table>';
   blocks.push({type:'table',text:markup});
 }
 function visit(el,quote=false){
   const tag=el.tagName.toLowerCase();
   if(['script','style','svg','iframe','object','template','form'].includes(tag))return;
   if(tag==='table'){table(el);return;}
   if(tag==='img'){
     const url=safeUrl(el.getAttribute('src'));if(!url)return;
     const alt=esc(el.getAttribute('alt')||'');blocks.push({type:'image',text:'<img src="'+esc(url)+'" alt="'+alt+'" loading="lazy">'});return;
   }
   if(tag==='hr'){blocks.push({type:'divider'});return;}
   if(tag==='blockquote'){
     for(const c of el.childNodes){
       if(c.nodeType===3&&c.nodeValue.trim()){const p=document.createElement('p');p.textContent=c.nodeValue;paragraph(p,'',true);}
       else if(c.nodeType===1)visit(c,true);
     }return;
   }
   if(tag==='ul'||tag==='ol'){
     function listNodes(list,level){
       let i=0;for(const li of list.children){if(li.tagName!=='LI')continue;i++;
         const direct=li.cloneNode(true);
         for(const nested of direct.querySelectorAll('ul,ol'))nested.remove();
         const prefix='\u00a0\u00a0'.repeat(level)+(list.tagName==='UL'?'• ':String(i)+'. ');
         paragraph(direct,prefix,quote);
         for(const child of li.children)if(['UL','OL'].includes(child.tagName))listNodes(child,level+1);
       }
     }listNodes(el,0);return;
   }
   if(['p','h1','h2','h3','h4','h5','h6','li'].includes(tag)){paragraph(el,'',quote);return;}
   for(const child of el.children)visit(child,quote);
 }
 for(const node of root.childNodes){
   if(node.nodeType===3){const t=(node.nodeValue||'').trim();if(t)blocks.push({type:'p',text:esc(t),align:'justify'});}
   else if(node.nodeType===1)visit(node);
 }
 return blocks.length?blocks:null;
}
function pdlReplaceOnce(markup,needle,value){
 if(!markup.includes(needle))throw Error('Ασυμβατότητα Reader template: '+needle.slice(0,50));
 return markup.replace(needle,()=>value);
}
function buildImportedMarkup(book,position=null){
 let markup=readerShellTemplate;
 const rawChapters=book.chapters.map((c,i)=>({id:String(c.id||`legacy-${i}`),title:String(c.title||`Κεφάλαιο ${i+1}`),paragraphs:(pdlRichParagraphs(c.richHtml)||pdlParagraphs(c.text))}));
 const glossary=pdlGlossaryFromEntries(libraryState.entries);
 const payload={chapters:rawChapters,glossary,bookId:book.id,position,
  settings:{showChapterTitles:book.showChapterTitles===true,dropCap:book.dropCap!==false,hyphenation:['el-polyton','el-monoton'].includes(book.hyphenation)?book.hyphenation:'off'}};
 markup=pdlReplaceOnce(markup,'<!--PDL_BOOK_PAYLOAD-->','<script id="pdl-book-payload" type="application/json">'+pdlSafeJS(payload)+'</script>');
 markup=markup.replaceAll('__PDL_BOOK_TITLE__',()=>pdlEscapeHTML(book.title));
 const shim=`<script>const localStorage=(()=>{try{const s=window.localStorage;s.getItem('pdl-test');return s;}catch(e){const m=new Map();return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)};}})();<\/script>`;
 return markup.replace('<head>','<head>'+shim);
}
function pdlValidateImport(data){
 if(!data||data.format!=='pontian-digital-library'||!Array.isArray(data.books)||!Array.isArray(data.entries))throw Error('Μη έγκυρο JSON βιβλιοθήκης.');
 if(data.books.length>300||data.entries.length>100000)throw Error('Το JSON υπερβαίνει τα προβλεπόμενα όρια.');
 for(const b of data.books){if(!b||typeof b.id!=='string'||!b.id||typeof b.title!=='string'||!Array.isArray(b.chapters))throw Error('Μη έγκυρη εγγραφή βιβλίου.');for(const c of b.chapters){if(!c||typeof c.text!=='string')throw Error('Κεφάλαιο χωρίς κείμενο.');}}
 return data;
}
function pdlApplyLibrary(data){
 const checked=data.format==='pontian-library-catalog'?pdlValidateCatalog(data):pdlValidateImport(data);
 if(activeBook)closeBook();++pdlDatasetGeneration;pdlBookPromises.clear();pdlGlossaryPromise=null;
 if(data.format==='pontian-library-catalog')libraryState.catalog=data;else{libraryState.catalog=null;pdlBookPromises.clear();pdlGlossaryPromise=null;}
 libraryState.books=checked.books.map(b=>({...b,id:'studio:'+String(b.id).replace(/^studio:/,'')}));
 libraryState.entries=checked.entries||[];
 for(const k of Object.keys(importedBooks)){delete importedBooks[k];delete titleMap[k];}
 for(const b of libraryState.books){importedBooks[b.id]=b;titleMap[b.id]=b.title;}
 pdlRenderCatalog();
}
function pdlRenderCatalog(){
 const grid=document.querySelector('.library-grid');grid.replaceChildren();
  const sortMode=document.getElementById('pdl-catalog-sort')?.value||'title';
  const collator=new Intl.Collator('el',{sensitivity:'base',numeric:true});
  const yearOf=b=>{const y=Number(b.publicationYear);return Number.isInteger(y)&&y>0?y:null;};
  const orderedBooks=libraryState.books.map((book,index)=>({book,index})).sort((a,b)=>{
   const x=a.book,y=b.book;
   if(sortMode.startsWith('year')){
    const ya=yearOf(x),yb=yearOf(y);
    if(ya===null&&yb!==null)return 1;
    if(yb===null&&ya!==null)return -1;
    if(ya!==null&&yb!==null&&ya!==yb)return sortMode==='year-desc'?yb-ya:ya-yb;
   }
   const primary=sortMode==='author'?'author':'title';
   const byField=collator.compare(String(x[primary]||''),String(y[primary]||''));
   return byField||collator.compare(String(x.title||''),String(y.title||''))||a.index-b.index;
  });
  for(const {book:b} of orderedBooks){
  const card=document.createElement('button');card.type='button';card.className='book-card pdl-import-card';card.dataset.book=b.id;
  const cover=document.createElement('div');cover.className='cover';
  const image=document.createElement('img');
  const fallback='./assets/book-placeholder.webp';
  image.alt='Εξώφυλλο: '+b.title;
  image.loading='lazy';image.decoding='async';
  image.addEventListener('error',()=>{if(!image.dataset.fallback){image.dataset.fallback='1';image.src=fallback;}});
  image.src=(typeof b.cover==='string'&&/^data:image\/(?:png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/i.test(b.cover))?b.cover:(typeof b.cover==='string'&&/^\.\/public-data\/covers\/[A-Za-z0-9.-]+$/.test(b.cover)?b.cover:fallback);
  cover.classList.add('cover-image');cover.append(image);
  const info=document.createElement('div');info.className='book-card-copy';
  const title=document.createElement('h2');title.textContent=b.title;
  const author=document.createElement('div');author.className='meta';author.textContent=(b.author||'Χωρίς συγγραφέα')+(b.publicationYear?' · '+b.publicationYear:'');
  const progress=document.createElement('span');progress.className='continue';progress.id=b.id+'-progress';
  const action=document.createElement('div');action.className='book-action';action.textContent='Άνοιγμα βιβλίου →';
  info.append(title,author,progress,action);card.append(cover,info);card.addEventListener('click',()=>openBook(b.id));grid.append(card);
 }
 refreshCatalog();
}
async function pdlLoadPublishedLibrary(){
 const status=document.getElementById('pdl-import-status');
 try{
  status.textContent='Φόρτωση δημοσιευμένης βιβλιοθήκης…';
  const response=await fetch('./public-data/catalog.json',{cache:'no-cache'});
  if(!response.ok)throw Error('HTTP '+response.status);
  const raw=await response.text();if(raw.length>35e6)throw Error('Υπερβολικά μεγάλο JSON.');
  pdlApplyLibrary(JSON.parse(raw));
  document.body.classList.remove('pdl-public-error');
  status.textContent='Δημοσιεύτηκαν '+libraryState.books.length+' βιβλία.';
 }catch(err){
  console.error('Published JSON:',err);
  document.body.classList.add('pdl-public-error');
  status.textContent='Η δημοσιευμένη βιβλιοθήκη δεν φορτώθηκε. Μπορείς να επιλέξεις το JSON σου από εδώ.';
 }
 finally{document.body.classList.remove('pdl-public-loading');}
}
document.getElementById('pdl-import-file').addEventListener('change',async e=>{
 const file=e.target.files?.[0];e.target.value='';if(!file)return;
 try{
  const raw=await file.text();if(raw.length>35e6)throw Error('Το αρχείο είναι υπερβολικά μεγάλο.');
  pdlApplyLibrary(JSON.parse(raw));
  document.body.classList.remove('pdl-public-error');
 }catch(err){document.getElementById('pdl-import-status').textContent='Σφάλμα: '+err.message;}
});
document.getElementById('pdl-catalog-sort').addEventListener('change',pdlRenderCatalog);


// Only trusted, build-generated same-origin paths can be fetched from a catalog.
const pdlBookPromises=new Map();let pdlGlossaryPromise=null,pdlDatasetGeneration=0;
function pdlAssetURL(value){if(typeof value!=='string'||!/^\.\/(?:public-data|reader)\/[A-Za-z0-9/_.-]+$/.test(value)||value.includes('..'))throw Error('Μη έγκυρη διαδρομή βιβλίου.');return value;}
async function pdlFetchText(url){const response=await fetch(pdlAssetURL(url));if(!response.ok)throw Error('HTTP '+response.status);return response.text();}
async function pdlLoadBook(id){
 const generation=pdlDatasetGeneration,key=generation+':'+id;
 const book=importedBooks[id];if(book.chapters.every(ch=>typeof ch.text==='string'))return book;
 if(!pdlBookPromises.has(key))pdlBookPromises.set(key,pdlFetchText(book.url).then(raw=>{
  if(generation!==pdlDatasetGeneration)throw Error('Η βιβλιοθήκη άλλαξε.');
  const full=JSON.parse(raw);pdlValidateImport({format:'pontian-digital-library',books:[full],entries:[]});
  if(String(full.id).replace(/^studio:/,'')!==String(id).replace(/^studio:/,''))throw Error('Ασυμβατότητα βιβλίου.');
  const result={...book,...full,id};importedBooks[id]=result;const at=libraryState.books.findIndex(b=>b.id===id);if(at>=0)libraryState.books[at]=result;return result;
 }).catch(error=>{pdlBookPromises.delete(key);throw error;}));return pdlBookPromises.get(key);
}
function pdlLoadGlossary(){
 if(!libraryState.catalog)return Promise.resolve(libraryState.entries);
 if(!pdlGlossaryPromise){
  const generation=pdlDatasetGeneration;
  const request=pdlFetchText(libraryState.catalog.glossary).then(raw=>{
   if(generation!==pdlDatasetGeneration)throw Error('Η βιβλιοθήκη άλλαξε.');
   const entries=JSON.parse(raw);if(!Array.isArray(entries)||entries.some(e=>typeof e.term!=='string'||typeof e.definition!=='string'))throw Error('Μη έγκυρο γλωσσάρι.');libraryState.entries=entries;return entries;
  }).catch(error=>{if(pdlGlossaryPromise===request)pdlGlossaryPromise=null;throw error;});pdlGlossaryPromise=request;
 }return pdlGlossaryPromise;
}
function pdlValidateCatalog(data){
 if(data.schema!==1||!Array.isArray(data.books)||data.books.length>300||typeof data.glossary!=='string')throw Error('Μη έγκυρος κατάλογος βιβλιοθήκης.');
 pdlAssetURL(data.glossary);const ids=new Set();
 for(const book of data.books){
  if(!book||typeof book.id!=='string'||!book.id||ids.has(book.id)||typeof book.title!=='string'||!Array.isArray(book.chapters)||book.chapters.some(ch=>typeof ch.id!=='string'||typeof ch.title!=='string'))throw Error('Μη έγκυρα στοιχεία βιβλίου.');
  ids.add(book.id);pdlAssetURL(book.url);
 }return data;
}

pdlLoadPublishedLibrary();
