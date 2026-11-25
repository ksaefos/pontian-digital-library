/* One gate for Reader layout, pagination, page-window and pending-turn work.
 * Callbacks are synchronous transactions; asynchronous pagination announces
 * measured pages through the existing readiness events. No engine/DOM ownership.
 */
function createPDLReaderCoordinator({busy,now=()=>performance.now(),
 schedule=(fn,ms)=>setTimeout(fn,ms),unschedule=id=>clearTimeout(id)}){
 const order=['layout','pagination','build','turn'],pending=new Map();
 const stats={requests:0,coalesced:0,timerFires:0,executed:{layout:0,pagination:0,build:0,turn:0}};
 let timer=null,running=false,waiting=null;
 function clearTimer(){if(timer!==null)unschedule(timer);timer=null;}
 function arm(delay){
  clearTimer();
  timer=schedule(()=>{timer=null;stats.timerFires++;drain();},Math.max(1,delay));
 }
 function drain(){
  if(running)return;
  clearTimer();waiting=null;
  while(pending.size){
   const hold=busy();
   if(hold){waiting=hold.reason;arm(hold.retryAfter);return;}
   // A delayed measurement owns precedence over an earlier build deadline.
   // Never build a book only to discard it when that measurement runs.
   const kind=order.find(key=>pending.has(key)),task=pending.get(kind);
   const delay=task.due-now();
   if(delay>0){waiting=kind;arm(delay);return;}
   pending.delete(kind);running=true;stats.executed[kind]++;
   try{task.result=task.run();}finally{running=false;}
  }
 }
 return {
  request(kind,run,delay=0){
   if(!order.includes(kind))throw new TypeError('Unknown Reader task: '+kind);
   stats.requests++;
   const previous=pending.get(kind),due=now()+Math.max(0,delay);
   if(previous)stats.coalesced++;
   // Soft window notifications cannot postpone a necessary build forever.
   // Layout/pagination retain the latest value and their debounce deadline.
   const task={run,due:kind==='build'&&previous?Math.min(previous.due,due):due};
   pending.set(kind,task);drain();return task.result;
  },
  wake:drain,
  cancel(kind){
   if(kind)pending.delete(kind);else pending.clear();
   if(!running)drain();
  },
  has:kind=>pending.has(kind),
  debug:()=>({...stats,executed:{...stats.executed},pending:order.filter(key=>pending.has(key)),
   waiting,timerQueued:timer!==null,running})
 };
}
