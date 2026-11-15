import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, stat} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';

const root=path.resolve(import.meta.dirname,'..');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript',
 '.css':'text/css','.json':'application/json','.wasm':'application/wasm',
 '.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp'};
const server=createServer(async(req,res)=>{
 try{
  const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
  if(!file.startsWith(root+path.sep)||!(await stat(file)).isFile()){
   res.writeHead(404).end();return;
  }
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});
  res.end(await readFile(file));
 }catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
 browser=await chromium.launch({headless:true,
  ...(process.env.PDL_CHROMIUM_EXECUTABLE?{executablePath:process.env.PDL_CHROMIUM_EXECUTABLE}:{})});
 const cases=[
  {book:'Η Σωνίτσα',font:'GFS Galatea Pontian',size:100,width:390,height:844},
  {book:'Η Σωνίτσα',font:'GFS Galatea Pontian',size:130,width:390,height:844},
  {book:'Η Σωνίτσα',font:'Barnebok Pontian',size:130,width:390,height:844},
  {book:'Η Σωνίτσα',font:'Miasma Pontian',size:100,width:390,height:844},
  {book:'Η Σωνίτσα',font:'GFS Galatea Pontian',size:130,width:1366,height:900,layout:'double'},
  {book:"Αέρα σ' μαναχόν κανείται",font:'GFS Galatea Pontian',size:130,width:390,height:844},
  {book:"Αέρα σ' μαναχόν κανείται",font:'Barnebok Pontian',size:100,width:844,height:390}
 ];
 for(const c of cases){
  const context=await browser.newContext({viewport:{width:c.width,height:c.height}});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await page.waitForFunction(()=>libraryState.books.length===4);
  await page.evaluate(c=>{
   localStorage.setItem('pdlFont',c.font);localStorage.setItem('fontSize',String(c.size));
   localStorage.setItem('pdlLayout',c.layout||'single');
   openBook(libraryState.books.find(b=>b.title===c.book).id);
  },c);
  await page.waitForFunction(()=>typeof document.getElementById('reader-frame')?.contentWindow?.pdlProgressStats==='function');
  const frame=page.frames().find(f=>f.url()==='about:srcdoc');
  await frame.waitForFunction(()=>{const s=pdlProgressStats();return s.complete||s.fallback||s.errors.length},null,{timeout:180000});
  const report=await frame.evaluate(()=>{
   const probe=pdlProgressValidator(document.getElementById('page-content'));
   const issues={underfill:[],overflow:[],graphemes:[],integrity:[]};
   const segmenter=new Intl.Segmenter('el',{granularity:'grapheme'});
   const text=b=>{const el=document.createElement('div');el.innerHTML=b.text||'';return el.textContent||'';};
   const measure=(ci,pi,blocks)=>{
    probe.innerHTML=pdlProgressMarkup(ci,blocks,pi===0);PDL_HYPH.apply(probe);
    const css=getComputedStyle(probe),rect=probe.getBoundingClientRect();
    const limit=rect.bottom-(parseFloat(css.paddingBottom)||0);
    const bottom=Math.max(rect.top,...[...probe.children].map(n=>n.getBoundingClientRect().bottom));
    const p=probe.querySelector('p');const line=parseFloat(getComputedStyle(p||probe).lineHeight);
    return {limit,bottom,line,gap:limit-bottom};
   };
   try{
    for(let ci=0;ci<chapters.length;ci++){
     const source=PDL_SOURCE[ci].blocks,output=chapters[ci].pages.flat();
     // Compare each source block separately, retaining authored U+00AD too.
     source.forEach((block,bi)=>{
      if(text(block)!==output.filter(b=>b._pdlAnchor?.index===bi).map(text).join(''))issues.integrity.push({ci,bi});
     });
     const structural=blocks=>blocks.filter(b=>!['p','dialogue'].includes(b.type)).map(b=>b.type);
     if(JSON.stringify(structural(source))!==JSON.stringify(structural(output)))issues.integrity.push({ci,structural:true});
     const boundaries=source.map(b=>new Set([...segmenter.segment(text(b))].map(g=>g.index)));
     chapters[ci].pages.forEach((blocks,pi)=>{
      const m=measure(ci,pi,blocks);
      if(m.gap < -1)issues.overflow.push({ci,pi,gap:m.gap});
      for(const b of blocks){const a=b._pdlAnchor;
       if(a?.offset&&!boundaries[a.index].has(a.offset))issues.graphemes.push({ci,pi,anchor:a});
      }
      const next=chapters[ci].pages[pi+1]?.[0];
      // Final chapter pages and space before structural elements are allowed.
      // A normal following paragraph must not leave three empty lines when
      // its first whole word fits using the actual final-page typography.
      if(!(m.gap>=m.line*3&&next?.type==='p'&&!next.heading&&!next.listKind&&!next.quote))return;
      const prefix=text(next).match(/^\s*\S+\s*/u)?.[0];if(!prefix)return;
      const trial=blocks.map(b=>({...b})),a=trial.at(-1)?._pdlAnchor,z=next._pdlAnchor;
      if(a?.index===z?.index){
       trial[trial.length-1].text=pdlGridSliceBlock(source[a.index],a.offset,z.offset+prefix.length);
      }else trial.push({...next,text:pdlGridSliceBlock(next,0,prefix.length)});
      const candidate=measure(ci,pi,trial);
      if(candidate.bottom<=candidate.limit-5)issues.underfill.push({ci,pi,gap:m.gap,line:m.line});
     });
    }
   }finally{probe.remove();}
   return {stats:pdlProgressStats(),issues,pages:chapters.reduce((n,ch)=>n+ch.pages.length,0)};
  });
  const label=`${c.book}; ${c.font}; ${c.size}%; ${c.width}x${c.height}; ${c.layout||'single'}`;
  assert.ok(report.stats.complete&&!report.stats.fallback&&!report.stats.errors.length,label+': progressive layout must finish');
  for(const [kind,items] of Object.entries(report.issues))assert.deepEqual(items,[],label+': '+kind+' '+JSON.stringify(items.slice(0,5)));
  assert.deepEqual(errors,[],label+': JavaScript errors');
  console.log(`PASS page fill, overflow, source blocks and grapheme boundaries: ${label}; ${report.pages} pages`);
  await context.close();
 }
}finally{
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
