
(function(){
 let lastFocused=null;
 window.pdlShowChapters=function(){
  if(!Array.isArray(chapters)||!chapters.length)return;
  const list=document.getElementById('pdl-chapters-list');list.replaceChildren();
  chapters.forEach((ch,i)=>{
   const item=document.createElement('button');item.type='button';
   item.textContent=String(ch.number||'Κεφάλαιο '+(i+1));
   item.setAttribute('aria-current',String(i===currentChapter));
   item.onclick=function(){window.gotoChapter(i);pdlHideChapters();};
   list.appendChild(item);
  });
  lastFocused=document.activeElement;
  document.getElementById('pdl-chapters-backdrop').hidden=false;
  document.getElementById('pdl-chapters-sheet').hidden=false;
  (list.querySelector('[aria-current="true"]')||list.querySelector('button'))?.focus({preventScroll:true});
 };
 window.pdlHideChapters=function(){
  document.getElementById('pdl-chapters-backdrop').hidden=true;
  document.getElementById('pdl-chapters-sheet').hidden=true;
  try{lastFocused?.focus({preventScroll:true});}catch(e){}
 };
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!document.getElementById('pdl-chapters-sheet').hidden){e.preventDefault();pdlHideChapters();}},true);
})();
