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
let browser;
try{
 browser=await type.launch({headless:true});const page=await browser.newPage({viewport:{width:1200,height:900}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 const password='ci-test-only',worker='https://pontian-library-sync.ksaefos.workers.dev/api/library';let requests=0;
 await page.route(worker,async route=>{
  const req=route.request(),headers={'Access-Control-Allow-Origin':base,'Access-Control-Allow-Headers':'authorization,content-type','Access-Control-Allow-Methods':'GET, OPTIONS','Cache-Control':'no-store'};
  if(req.method()==='OPTIONS'){await route.fulfill({status:204,headers});return;}
  assert.equal(req.method(),'GET','Import QA must never publish to the real Worker');
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
 const expected=input?683:7,etymologies=input?172:5;
 assert.equal(result.entries.length,expected);assert.ok(result.report.includes(etymologies+' ετυμολογίες σε ξεχωριστό πεδίο'));
 const legacy=result.entries.find(e=>e.id==='stable');assert.equal(legacy.term,'ακαΐρευτα');assert.equal(legacy.privateNote,'keep');
 assert.equal(legacy.definition,data.entries[0].definition);assert.deepEqual(legacy.references,data.entries[0].references);assert.ok(legacy.sources.includes('Παλιά πηγή'));assert.ok(legacy.etymology.includes('τουρκ. kayırmak'));assert.ok(legacy.etymology.includes('παλιότερη τεκμηρίωση'));
 assert.ok(result.entries.some(e=>e.term==='ὰμα'&&e.etymology==='τουρκ./αραβ. ama/ammā'));
 assert.ok(result.entries.some(e=>e.term==='μανουσ̌άκια'&&e.etymology==='αρμεν./περσ. մանուշակ (manušak)<manafšak'));
 assert.ok(result.entries.some(e=>e.term==='ας σα ( ασό σα (από τα))'&&!e.etymology));
 assert.ok(result.entries.some(e=>e.term==='καλαμάρ’ ( κάλαμος)'&&!e.etymology));
 assert.ok(!result.entries.some(e=>e.term==='http'||e.term==='https'));
 const snapshot=JSON.stringify(result.entries);await upload();await page.waitForFunction(()=>document.getElementById('lexImportReport').textContent.startsWith('Γλωσσάριο: 0 νέες'));
 assert.equal(await page.evaluate(()=>JSON.stringify(state.entries)),snapshot,'Reimport must preserve IDs and metadata without duplication');
 await page.locator('#lexSearch').fill('ακαΐρευτα');await page.locator('#lexList button').first().click();
 await page.locator('#dlgTerm').fill('ακαΐρευτα (τουρκ. kayırmak)');await page.locator('#dlgSave').click();await page.locator('#entryDialog').waitFor({state:'hidden'});
 assert.equal(await page.evaluate(()=>JSON.stringify(state.entries)),snapshot,'Saving a recognized annotation must keep one clean headword and preserve metadata');
 const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#backupQuick').click()]);
 const exported=JSON.parse(await readFile(await download.path(),'utf8'));
 assert.deepEqual(exported.data.entries,result.entries,'Actual JSON export must contain separate headword and etymology fields');
 assert.equal(requests,1,'Import, edit and backup must not call remote publication');assert.deepEqual(errors,[]);
 if(input)assert.ok((await readFile(input)).equals(buffer),'Original uploaded TXT must remain byte-identical');
 if(process.env.PDL_CAPTURE_DIR){
  await page.evaluate(()=>openEntry(state.entries.find(e=>e.term==='ὰμα').id));
  await page.screenshot({path:path.join(process.env.PDL_CAPTURE_DIR,`txt-etymology-${engine}.png`)});
 }

 console.log(JSON.stringify({result:'PASS',engine,file:filename,entries:expected,etymologies,legacyIdPreserved:true,reimportAdded:0,originalTxtUnchanged:true,remoteWrites:0,jsonExport:true}));
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
