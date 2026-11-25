
/* Mobile controls v1.3.8 */
function pdlPreviewProgress(value){const el=document.getElementById('pdl-mobile-page-info');if(el)el.textContent=`${value} / ${document.getElementById('pdl-mobile-progress').max}`;}
function pdlCommitProgress(value){let idx=Number(value)-1;for(let i=0;i<chapters.length;i++){if(idx<chapters[i].pages.length){currentChapter=i;currentPage=Math.max(0,idx);render();return;}idx-=chapters[i].pages.length;}}
let pdlAppearanceOpener=null;
function pdlOpenAppearance(which='text'){
 pdlAppearanceOpener=document.activeElement;
 document.getElementById('pdl-appearance').hidden=false;document.getElementById('pdl-appearance-backdrop').hidden=false;
 pdlAppearanceTab(which==='light'?'light':'text');pdlUpdateAppearance();
 document.querySelector('#pdl-appearance .pdl-appearance-close').focus({preventScroll:true});
}
function pdlCloseAppearance(){
 const panel=document.getElementById('pdl-appearance'),open=!panel.hidden;
 panel.hidden=true;document.getElementById('pdl-appearance-backdrop').hidden=true;
 if(open)pdlAppearanceOpener?.focus({preventScroll:true});
}
function pdlAppearanceTab(which){
 document.getElementById('pdl-appearance-title').textContent=which==='light'?'Φωτισμός':'Γραμματοσειρά';
 document.getElementById('pdl-appearance-text').hidden=which!=='text';document.getElementById('pdl-appearance-light').hidden=which!=='light';
}
function pdlUpdateAppearance(){const list=document.getElementById('pdl-mobile-fonts');if(list&&!list.children.length){for(const name of PDL_FONTS){const b=document.createElement('button');b.type='button';const disk=document.createElement('span');disk.textContent='A';disk.style.fontFamily=JSON.stringify(name);const label=document.createElement('small');label.textContent=name.replace(' Pontian','');b.append(disk,label);b.onclick=()=>{pdlSetFont(name);pdlUpdateAppearance()};b.dataset.font=name;list.append(b)}}
 document.querySelectorAll('#pdl-mobile-fonts button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.font===pdlFont)));
 document.getElementById('pdl-mobile-font-size').textContent=currentFontSize+'%';
 document.querySelectorAll('[data-mobile-theme]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mobileTheme===pdlTheme)));
 document.getElementById('pdl-line-value').textContent=Math.round(pdlMobileLineScale*100)+'%';}
let pdlMobileLineScale=Number(localStorage.getItem('pdlLineScale')||'1');
if(!Number.isFinite(pdlMobileLineScale))pdlMobileLineScale=1;
function pdlLineHeight(delta){pdlMobileLineScale=Math.max(.9,Math.min(1.4,Math.round((pdlMobileLineScale+delta*.05)*100)/100));localStorage.setItem('pdlLineScale',pdlMobileLineScale);document.documentElement.style.setProperty('--pdl-mobile-line-scale',pdlMobileLineScale);pdlUpdateAppearance();pdlScheduleRelayout();}
document.documentElement.style.setProperty('--pdl-mobile-line-scale',pdlMobileLineScale);
document.addEventListener('keydown',e=>{if(e.key==='Escape')pdlCloseAppearance();});
const pdlPrevImmersiveToggle=toggleImmersive;
toggleImmersive=function(){pdlCloseAppearance();pdlPrevImmersiveToggle();};
