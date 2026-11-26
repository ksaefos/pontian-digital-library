
// Set the mobile reading state before any controls can be parsed or painted.
if(window.innerWidth<=768){document.body.classList.add('immersive');}
// Visible assistance is opt-in, before any controls are parsed or painted.
window.pdlReaderAssistancePreference=false;
try{
 window.pdlReaderAssistancePreference=typeof parent.pdlReaderAssistancePreference==='boolean'
  ?parent.pdlReaderAssistancePreference:localStorage.getItem('pdl:reader:assistance:v1')==='on';
}catch{}
document.body.classList.toggle('pdl-reader-assistance',window.pdlReaderAssistancePreference);
