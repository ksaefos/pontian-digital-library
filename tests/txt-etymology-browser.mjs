import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {chromium,firefox,webkit} from 'playwright';
const root=path.resolve(import.meta.dirname,'..'),engine=process.env.PDL_BROWSER||'chromium',type={chromium,firefox,webkit}[engine];
assert.ok(type,'Unknown browser');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.wasm':'application/wasm','.webp':'image/webp','.png':'image/png'};
const server=createServer(async(req,res)=>{try{
 const name=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
 if(!name.startsWith(root+path.sep)||!(await stat(name)).isFile()){res.writeHead(404).end();return;}
 res.writeHead(200,{'Content-Type':types[path.extname(name)]||'application/octet-stream'});res.end(await readFile(name));
}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
const sample=[
 'ακαΐρευτα (τουρκ. kayırmak): απροστάτευτα, χωρίς υποστήριξη',
 'ὰμα (τουρκ./αραβ. ama/ammā): αλλά',
 'μανουσ̌άκια (αρμεν./περσ. մանուշակ (manušak)<manafšak): μενεξέδες',
 'σαλαχανεύ’ (τουρκ. salahana, «παράδειγμα: με άνω-κάτω τελεία»): τεμπελιάζει',
 'ας σα ( ασό σα (από τα)): απ’ τα',
 'καλαμάρ’ ( κάλαμος): μελανοδοχείο',
 'τεγμέ ( αγν. ετυμολ.): χάρισμα',
 '#Δοκιμή #Πηγή','https://example.org/source.html'
].join('\n');
const input=process.env.PDL_TXT_SOURCE,buffer=input?await readFile(input):Buffer.from(sample),filename=input?path.basename(input):'Etymology_import.txt';
const data={format:'pontian-digital-library',books:[{id:'b',title:'Δοκιμή',chapters:[{id:'c',title:'Κεφάλαιο',text:'Οι λέξεις ακαΐρευτα και ὰμα.'}]}],entries:[{
 id:'stable',term:'ακαΐρευτα (τουρκ. kayırmak)',definition:'απροστάτευτα, χωρίς υποστήριξη',category:'word',etymology:'παλιότερη τεκμηρίωση',sources:['Παλιά πηγή'],references:[{bookId:'b',chapterId:'c'}],privateNote:'keep'
}]};
data.entries.push({...structuredClone(data.entries[0]),id:'legacy-duplicate',sources:['wrong_filename.txt']});
let browser;
try{
 browser=await type.launch({headless:true});const page=await browser.newPage({viewport:{width:1200,height:900}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 const password='ci-test-only',worker='https://pontian-library-sync.ksaefos.workers.dev/api/library';let requests=0;const publications=[];
 await page.route(worker,async route=>{
  const req=route.request(),headers={'Access-Control-Allow-Origin':base,'Access-Control-Allow-Headers':'authorization,content-type','Access-Control-Allow-Methods':'GET, PUT, OPTIONS','Cache-Control':'no-store'};
  if(req.method()==='OPTIONS'){await route.fulfill({status:204,headers});return;}
  if(req.method()==='PUT'){
   const body=req.postDataJSON();assert.equal(body.sha,'import-fixture');
   publications.push(body);await route.fulfill({status:200,headers,contentType:'application/json',body:JSON.stringify({sha:'mock-published-sha'})});return;
  }
  assert.equal(req.method(),'GET','All Worker requests are intercepted; no production writes');
  assert.equal(req.headers()['authorization'],'Bearer '+password);requests++;
  await route.fulfill({status:200,headers,contentType:'application/json',body:JSON.stringify({sha:'import-fixture',data})});
 });
 await page.goto(base+'/admin.html');await page.locator('#pdlLoginDialog').waitFor({state:'visible'});
 await page.locator('#pdlWorkerNick').fill('ksaefos');await page.locator('#pdlPassword').fill(password);await page.locator('#pdlLoginSubmit').click();
 await page.waitForFunction(()=>window.pdlStudioConnected?.()===true);await page.locator('#pdlLoginDialog').waitFor({state:'hidden'});
 await page.locator('aside button[data-view="lexicon"]').click();
 const before=await page.evaluate(()=>JSON.stringify(state.entries));
 await page.locator('#lexList button').first().click();await page.locator('#entryDialog').waitFor({state:'visible'});
 assert.equal(await page.locator('#dlgTerm').inputValue(),'ακαΐρευτα');
 assert.equal(await page.locator('#dlgEtymology').inputValue(),'παλιότερη τεκμηρίωση · τουρκ. kayırmak');
 assert.equal(await page.evaluate(()=>JSON.stringify(state.entries)),before,'Opening legacy editor must not mutate the saved row');
 await page.locator('#dlgCancel').click();assert.equal(await page.evaluate(()=>JSON.stringify(state.entries)),before);
 const upload=()=>page.locator('#fileLexImport').setInputFiles({name:filename,mimeType:'text/plain',buffer});
 await upload();await page.waitForFunction(()=>document.getElementById('lexImportReport').textContent.includes('ετυμολογίες σε ξεχωριστό πεδίο'));
 const result=await page.evaluate(()=>({entries:state.entries,report:document.getElementById('lexImportReport').textContent}));
 const expected=input?683:7,etymologies=input?173:6;
 assert.equal(result.entries.length,expected);assert.ok(result.report.includes(etymologies+' ετυμολογίες σε ξεχωριστό πεδίο'));
 const legacy=result.entries.find(e=>e.id==='stable');assert.equal(legacy.term,'ακαΐρευτα');assert.equal(legacy.privateNote,'keep');
 assert.equal(legacy.definition,data.entries[0].definition);assert.deepEqual(legacy.references,data.entries[0].references);assert.ok(legacy.sources.includes('Δοκιμή §1'));assert.ok(legacy.sources.every(source=>!source.includes(filename.replace(/\.txt$/i,''))));assert.ok(legacy.etymology.includes('τουρκ. kayırmak'));assert.ok(legacy.etymology.includes('παλιότερη τεκμηρίωση'));
 assert.ok(result.entries.some(e=>e.term==='ὰμα'&&e.etymology==='τουρκ./αραβ. ama/ammā'));
 assert.ok(result.entries.some(e=>e.term==='μανουσ̌άκια'&&e.etymology==='αρμεν./περσ. մանուշակ (manušak)<manafšak'));
 assert.ok(result.entries.some(e=>e.term==='ας σα'&&!e.etymology&&e.definition.startsWith('( ασό σα (από τα)) — ')));
 assert.ok(result.entries.some(e=>e.term==='καλαμάρ’'&&e.etymology==='κάλαμος'));
 assert.ok(result.entries.every(e=>!/[()]/u.test(e.term)));
 assert.ok(!result.entries.some(e=>e.term==='http'||e.term==='https'));
 const snapshot=JSON.stringify(result.entries);await upload();await page.waitForFunction(()=>document.getElementById('lexImportReport').textContent.startsWith('Γλωσσάριο: 0 νέες'));
 assert.equal(await page.evaluate(()=>JSON.stringify(state.entries)),snapshot,'Reimport must preserve IDs and metadata without duplication');
 await page.locator('#lexSearch').fill('ακαΐρευτα');await page.locator('#lexList button').first().click();
 await page.locator('#dlgTerm').fill('ακαΐρευτα (τουρκ. kayırmak)');await page.locator('#dlgSave').click();await page.locator('#entryDialog').waitFor({state:'hidden'});
 assert.equal(await page.evaluate(()=>JSON.stringify(state.entries)),snapshot,'Saving a recognized annotation must keep one clean headword and preserve metadata');
 await page.locator('#lexSearch').fill('ας σα');await page.locator('#lexList button').first().click();
 assert.equal(await page.locator('#dlgTerm').inputValue(),'ας σα');
 assert.ok((await page.locator('#dlgDefinition').inputValue()).startsWith('( ασό σα (από τα)) — '));
 await page.locator('#dlgTerm').fill('ας σα ( ασό σα (από τα))');await page.locator('#dlgSave').click();await page.locator('#entryDialog').waitFor({state:'hidden'});
 assert.equal(await page.evaluate(()=>JSON.stringify(state.entries)),snapshot,'Editing explanatory annotations must preserve the note exactly once and keep the ID');
 const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#backupQuick').click()]);
 const exported=JSON.parse(await readFile(await download.path(),'utf8'));
 assert.deepEqual(exported.data.entries,result.entries,'Actual JSON export must contain separate headword and etymology fields');
 assert.equal(requests,1,'Import, edit and backup must not call remote publication');assert.deepEqual(errors,[]);
 if(input)assert.ok((await readFile(input)).equals(buffer),'Original uploaded TXT must remain byte-identical');
 assert.ok(legacy.mergedIds.includes('legacy-duplicate'),'Existing duplicates must really merge on login');
 assert.equal(await page.locator('#dlgSources').getAttribute('readonly'),'');
 const accept=dialog=>dialog.accept();page.on('dialog',accept);
 await page.locator('aside button[data-view="publish"]').click();
 const beforePublication=await page.evaluate(()=>JSON.stringify(state));
 await page.evaluate(()=>{state.entries.find(e=>e.id==='stable').mergedIds=[];});
 await page.locator('#pdlPublish').click();await page.waitForFunction(()=>document.getElementById('pdlStatus').textContent.includes('διαγραφή λήμματος legacy-duplicate'));
 assert.equal(publications.length,0,'Removing an alias must block publication rather than silently delete an original ID');
 await page.evaluate(snapshot=>{state=JSON.parse(snapshot);},beforePublication);
 await page.locator('#pdlPublish').click();await page.waitForFunction(()=>document.getElementById('pdlStatus').textContent.includes('δημοσιεύτηκαν επιτυχώς'));
 page.off('dialog',accept);assert.equal(publications.length,1);
 assert.equal(publications[0].data.entries.length,expected);
 assert.ok(publications[0].data.entries.find(e=>e.id==='stable').mergedIds.includes('legacy-duplicate'));
 assert.ok(publications[0].data.entries.every(e=>(e.sources||[]).every(source=>!source.includes('wrong_filename')&&!source.includes(filename.replace(/\.txt$/i,'')))));
 console.log(JSON.stringify({result:'PASS',engine,realDuplicatesMerged:true,aliasesPublished:true,mockedPublicationOnly:true,filenameNeverASource:true}));
 await page.locator('aside button[data-view="lexicon"]').click();
 // Reproduce the reported Studio duplicates using the actual published corpus.
 const corpus=JSON.parse(await readFile(path.join(root,'library-data.json'),'utf8'));
 const grouped=await page.evaluate(library=>{
  state.entries=library.entries;state.books=library.books;migrateEntries();const before=JSON.stringify(state.entries);
  selectedLetter='';lexPage=1;document.getElementById('lexFilter').value='';document.getElementById('lexSearch').value='';renderLex();
  return {before,groups:pdlGroupGlossaryRows(state.entries).length,entries:state.entries.length};
 },corpus);
 assert.equal(grouped.groups,new Set(corpus.entries.map(e=>e.term.normalize('NFC').trim().replace(/\s+/g,' ').toLocaleLowerCase('el'))).size);
 const repeated=corpus.entries.filter(e=>e.term==='κεμεντζ̌έν');assert.ok(repeated.length>=1);
 await page.locator('#lexSearch').fill('κεμεντζ̌έν');
 const exact=page.locator('#lexList > tr').filter({has:page.locator('td:first-child',{hasText:/^κεμεντζ̌έν$/})});
 assert.equal(await exact.count(),1,'Repeated headwords must have one visible row');
 if(repeated.length>1)await exact.locator('summary').click();
 assert.equal(await exact.locator('button').count(),repeated.length);
 if(repeated.length===1){await exact.locator('button').click();assert.equal(await page.locator('#dlgTerm').inputValue(),repeated[0].term);await page.locator('#dlgCancel').click();}
 const ids=repeated.length===1?[repeated[0].id]:await exact.locator('.lex-record').evaluateAll(rows=>rows.map(row=>row.dataset.entryId));
 assert.deepEqual(ids,repeated.map(e=>e.id));
 const citedBooks=new Set(repeated.flatMap(e=>(e.references||[]).map(r=>r.bookId)));
 for(const bookId of citedBooks){const book=corpus.books.find(b=>b.id===bookId);assert.ok((await exact.locator('td').nth(3).textContent()).includes(book.title),'Grouped citation must include each original book');}

 for(const e of repeated.length>1?repeated:[]){
  const record=exact.locator('.lex-record').filter({has:page.locator('button')}).nth(repeated.indexOf(e));
  await record.locator('button').click();assert.equal(await page.locator('#dlgTerm').inputValue(),e.term);
  assert.equal(await page.locator('#dlgEtymology').inputValue(),e.etymology||'');await page.locator('#dlgCancel').click();
 }
 assert.equal(await page.evaluate(()=>JSON.stringify(state.entries)),grouped.before,'Grouping, filtering, expansion and editor cancel must preserve every original record');
 await page.locator('#lexSearch').fill('');
 const firstPage=await page.locator('#lexList > tr').evaluateAll(rows=>rows.map(row=>row.dataset.headword));
 assert.equal(new Set(firstPage).size,firstPage.length);assert.equal(firstPage.length,50);
 await page.locator('#lexNext').click();
 const secondPage=await page.locator('#lexList > tr').evaluateAll(rows=>rows.map(row=>row.dataset.headword));assert.ok(secondPage.every(term=>!firstPage.includes(term)),'Groups must not repeat across pages');
 assert.deepEqual(errors,[]);assert.equal(requests,1);
 console.log(JSON.stringify({result:'PASS',engine,studioGroupedHeadwords:grouped.groups,preservedRecords:grouped.entries,individualEditors:true,paginationWithoutDuplicates:true,sourceDataUnchanged:true}));
 if(process.env.PDL_CAPTURE_DIR){
  await page.locator('#lexSearch').fill('κεμεντζ̌έν');if(await page.locator('#lexList summary').count())await page.locator('#lexList summary').first().click();
  await page.screenshot({path:path.join(process.env.PDL_CAPTURE_DIR,`studio-grouped-glossary-${engine}.png`)});
  await page.evaluate(()=>openEntry(state.entries.find(e=>e.term==='ὰμα').id));
  await page.screenshot({path:path.join(process.env.PDL_CAPTURE_DIR,`txt-etymology-${engine}.png`)});
 }

 console.log(JSON.stringify({result:'PASS',engine,file:filename,entries:expected,etymologies,legacyIdPreserved:true,reimportAdded:0,originalTxtUnchanged:true,remoteWrites:0,jsonExport:true}));
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
