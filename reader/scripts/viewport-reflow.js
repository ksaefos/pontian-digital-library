
(()=>{
 // Dynamic browser chrome (URL bar), rotation and screen resize can modify the
 // visual viewport without producing a conventional window resize event.
 let lastWidth=0,lastHeight=0,waiting=false;
 const tick=()=>{
   const v=document.getElementById('text-viewport');if(!v)return;
   const w=v.clientWidth,h=v.clientHeight; // stable while visual zoom transforms the viewport
   if(w===lastWidth&&h===lastHeight)return;
   lastWidth=w;lastHeight=h;
   if(waiting)return;waiting=true;
   requestAnimationFrame(()=>{waiting=false;if(typeof pdlScheduleRelayout==='function')pdlScheduleRelayout();});
 };
 if(window.ResizeObserver){const v=document.getElementById('text-viewport');if(v)new ResizeObserver(tick).observe(v);}
 window.visualViewport?.addEventListener('resize',tick,{passive:true});
 window.addEventListener('orientationchange',tick,{passive:true});
 document.fonts?.ready?.then(tick);
 setTimeout(tick,120);
})();
