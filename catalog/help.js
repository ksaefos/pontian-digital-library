
(()=>{
 const dialog=document.getElementById('pdl-help-dialog');
 const trigger=document.getElementById('pdl-help-trigger');
 const close=document.getElementById('pdl-help-close');
 if(!dialog||!trigger||!close)return;
 const preference=document.getElementById('pdl-assistance-setting'),key='pdl:reader:assistance:v1';
 window.pdlReaderAssistancePreference=false;
 try{window.pdlReaderAssistancePreference=localStorage.getItem(key)==='on';}catch{}
 const sync=()=>{preference.checked=window.pdlReaderAssistancePreference;};
 window.pdlSetReaderAssistancePreference=value=>{
  window.pdlReaderAssistancePreference=!!value;sync();
  try{localStorage.setItem(key,value?'on':'off');}catch{}
 };
 preference.addEventListener('change',()=>pdlSetReaderAssistancePreference(preference.checked));
 window.addEventListener('storage',event=>{if(event.key===key||event.key===null){window.pdlReaderAssistancePreference=event.newValue==='on';sync();}});
 sync();
 trigger.addEventListener('click',()=>dialog.showModal());
 close.addEventListener('click',()=>dialog.close());
 dialog.addEventListener('click',e=>{
  if(e.target!==dialog)return;
  const rect=dialog.getBoundingClientRect();
  if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)dialog.close();
 });
})();
