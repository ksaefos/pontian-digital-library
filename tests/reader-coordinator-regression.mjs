import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../reader/scripts/reader-coordinator.js',import.meta.url),'utf8');
function fixture(){
 let time=100,id=0,hold=null;
 const timers=new Map(),calls=[];
 const context={};runInNewContext(source,context);
 const c=context.createPDLReaderCoordinator({now:()=>time,busy:()=>typeof hold==='function'?hold(time):hold,
  schedule:(fn,ms)=>{timers.set(++id,{fn,at:time+ms});return id;},unschedule:id=>timers.delete(id)});
 return {c,calls,timers,setHold:value=>{hold=value;},advance(ms){
  const end=time+ms;let steps=0;
  while(true){
   const next=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];
   if(!next||next[1].at>end)break;
   assert.ok(++steps<1000,'Scheduler must not spin');
   time=next[1].at;timers.delete(next[0]);next[1].fn();
  }
  time=end;
 }};
}
{
 const {c,calls,timers,setHold,advance}=fixture();
 setHold({reason:'animation',retryAfter:1000});
 c.request('build',()=>calls.push('obsolete build'),5);
 c.request('pagination',()=>calls.push('obsolete pagination'));
 c.request('layout',()=>{
  calls.push('latest layout');
  c.request('pagination',()=>calls.push('measured after layout'),160);
 });
 c.request('turn',()=>calls.push('animated turn'));
 for(let i=0;i<80;i++)c.request('build',()=>calls.push('one build'),240);
 assert.equal(timers.size,1,'All busy work shares one watchdog');
 advance(650);assert.deepEqual(calls,[]);assert.equal(c.debug().timerFires,0);
 setHold(null);c.wake();
 assert.deepEqual(calls,['latest layout']);
 advance(159);assert.deepEqual(calls,['latest layout'],'A build must not overtake delayed measurement');
 advance(1);
 assert.deepEqual(calls,['latest layout','measured after layout','one build','animated turn']);
 assert.equal(timers.size,0);assert.equal(c.debug().timerFires,1);
 console.log('PASS Reader coordinator: one wait, event wake, latest callbacks, layout → measurement → build → turn');
}
{
 const {c,calls,timers,advance}=fixture();
 for(let i=0;i<100;i++){c.request('build',()=>calls.push(i),240);advance(1);}
 advance(140);assert.deepEqual(calls,[99],'Repeated soft notifications must not starve a build');
 assert.equal(timers.size,0);
 const result=c.request('layout',()=>42);assert.equal(result,42,'Idle APIs retain synchronous results');
 c.request('pagination',()=>calls.push('old'),160);advance(100);
 c.request('pagination',()=>calls.push('latest'),160);advance(159);
 assert.deepEqual(calls,[99]);advance(1);assert.deepEqual(calls,[99,'latest']);
 console.log('PASS Reader coordinator: bounded window deadline, debounced measurement, synchronous idle calls');
}
{
 const {c,calls,timers,setHold,advance}=fixture();
 setHold(time=>time<4100?{reason:'pointer',retryAfter:4100-time}:null);
 c.request('build',()=>calls.push('recovered'));advance(3999);
 assert.deepEqual(calls,[]);assert.equal(c.debug().timerFires,0);
 advance(1);assert.deepEqual(calls,['recovered']);
 setHold({reason:'animation',retryAfter:1000});
 c.request('build',()=>calls.push('cancelled'));c.cancel();
 assert.equal(timers.size,0);advance(10000);assert.deepEqual(calls,['recovered']);
 console.log('PASS Reader coordinator: lost-pointer deadline, cancellation and no orphaned timers');
}
