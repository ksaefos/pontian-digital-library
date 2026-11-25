
// Install/upgrade offline app shell only in supported secure contexts.
let pdlServiceWorkerReady;
if ('serviceWorker' in navigator && window.isSecureContext) {
 pdlServiceWorkerReady=new Promise((resolve,reject)=>{
  const start=()=>navigator.serviceWorker.register('./sw.js',{scope:'./'}).then(()=>navigator.serviceWorker.ready).then(resolve,reject);
  if(document.readyState==='complete')start();else window.addEventListener('load',start,{once:true});
 });
} else pdlServiceWorkerReady=Promise.reject(Error('Η offline λειτουργία απαιτεί ασφαλή σύνδεση.'));
pdlServiceWorkerReady.catch(error=>console.warn('PWA offline cache:',error));
let pdlInstallPrompt;
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault(); pdlInstallPrompt=event;
  const b=document.getElementById('pdl-install-app');if(b)b.hidden=false;
});
window.addEventListener('appinstalled',()=>{pdlInstallPrompt=null;const b=document.getElementById('pdl-install-app');if(b)b.hidden=true;});
async function pdlInstallApp(){
  if(!pdlInstallPrompt)return;
  const p=pdlInstallPrompt;pdlInstallPrompt=null;await p.prompt();
  const b=document.getElementById('pdl-install-app');if(b)b.hidden=true;
}
// The catalog stays light. Opened books cache on demand; the reader can choose
// an explicit complete download instead of spending mobile data implicitly.
async function pdlCacheAssets(urls,onProgress){
 if(!('serviceWorker' in navigator))throw Error('Η offline αποθήκευση δεν υποστηρίζεται εδώ.');
 let readinessTimer;
 const registration=await Promise.race([pdlServiceWorkerReady,new Promise((_,reject)=>{readinessTimer=setTimeout(()=>reject(Error('Η offline λειτουργία δεν είναι έτοιμη. Δοκίμασε ξανά.')),15000);})]).finally(()=>clearTimeout(readinessTimer));
 const worker=navigator.serviceWorker.controller||registration.active;
 if(!worker)throw Error('Η offline λειτουργία ετοιμάζεται. Δοκίμασε ξανά.');
 return new Promise((resolve,reject)=>{
  const channel=new MessageChannel(),timer=setTimeout(()=>{channel.port1.close();reject(Error('Η λήψη καθυστέρησε. Δοκίμασε ξανά με σύνδεση.'));},180000);
  channel.port1.onmessage=event=>{const data=event.data;if(data.done)onProgress?.(data.done);if(data.complete||data.error){clearTimeout(timer);channel.port1.close();data.error?reject(Error(data.error)):resolve();}};
  worker.postMessage({kind:'pdl-cache-assets',urls},[channel.port2]);
 });
}
function pdlBookOfflineAssets(book){return [...pdlRuntime.readerAssets,book.url,libraryState.catalog?.glossary,book.cover].filter(Boolean);}
document.getElementById('pdl-offline-download').onclick=async()=>{
 const button=document.getElementById('pdl-offline-download'),status=document.getElementById('pdl-offline-status');
 if(!libraryState.catalog){status.textContent='Η λήψη αφορά τη δημοσιευμένη βιβλιοθήκη.';return;}
 button.disabled=true;
 const urls=[...new Set(libraryState.catalog.books.flatMap(pdlBookOfflineAssets))];
 try{await pdlCacheAssets(urls,done=>status.textContent=`Λήψη για offline: ${done}/${urls.length}`);status.textContent='Η βιβλιοθήκη είναι διαθέσιμη εκτός σύνδεσης.';}
 catch(error){status.textContent=error.message;}finally{button.disabled=false;}
};
