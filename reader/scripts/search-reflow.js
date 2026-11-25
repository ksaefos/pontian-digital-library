
(function(){
  // Native page measurement must follow the toolbar row opening or closing.
  for(const name of ['toggleTextSearch','closeTextSearch']){
    const previous=window[name];
    if(typeof previous!=='function')continue;
    window[name]=function(...args){
      const bar=document.getElementById('text-search-bar');
      const wasOpen=!bar?.classList.contains('hidden');
      const result=previous.apply(this,args);
      if(window.innerWidth>768&&wasOpen!==!bar?.classList.contains('hidden')){
        requestAnimationFrame(()=>pdlScheduleRelayout());
      }
      return result;
    };
  }
})();
