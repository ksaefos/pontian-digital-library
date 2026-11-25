
(()=>{
 const dialog=document.getElementById('pdl-help-dialog');
 const trigger=document.getElementById('pdl-help-trigger');
 const close=document.getElementById('pdl-help-close');
 if(!dialog||!trigger||!close)return;
 trigger.addEventListener('click',()=>dialog.showModal());
 close.addEventListener('click',()=>dialog.close());
 dialog.addEventListener('click',e=>{
  if(e.target!==dialog)return;
  const rect=dialog.getBoundingClientRect();
  if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)dialog.close();
 });
})();
