import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile, stat} from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.wasm':'application/wasm','.hpb':'application/octet-stream','.webp':'image/webp','.png':'image/png'};
const server=createServer(async(req,res)=>{
 try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const filename=path.resolve(root,'.'+pathname);
 if(!filename.startsWith(root+path.sep)&&filename!==root){res.writeHead(403).end();return;}
 const s=await stat(filename);if(s.isDirectory()){res.writeHead(302,{Location:'/index.html'}).end();return;}
 res.writeHead(200,{'Content-Type':types[path.extname(filename)]||'application/octet-stream'});res.end(await readFile(filename));
 }catch(err){res.writeHead(404).end('Not Found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=`http://127.0.0.1:${server.address().port}`;
let browser;
try{
 browser=await chromium.launch({headless:true,
  ...(process.env.PDL_CHROMIUM_EXECUTABLE?{executablePath:process.env.PDL_CHROMIUM_EXECUTABLE}:{})});
 const page=await browser.newPage();const errors=[];page.on('pageerror',err=>errors.push(String(err)));
 // Studio requires an authenticated Worker GET before editing. Mock only the
 // network boundary: the actual login dialog, access gate and editor all run
 // unmodified. No GitHub write, real credential or production account involved.
 const fixture=JSON.parse(await readFile(path.join(root,'library-data.json'),'utf8'));
 const worker='https://pontian-library-sync.ksaefos.workers.dev/api/library';
 const secret='ci-smoke-password-only';
 let workerGetCount=0;
 await page.route(worker,async route=>{
  const request=route.request();
  const headers={
   'Access-Control-Allow-Origin':url,
   'Access-Control-Allow-Headers':'authorization,content-type',
   'Access-Control-Allow-Methods':'GET, OPTIONS',
   'Cache-Control':'no-store'
  };
  if(request.method()==='OPTIONS'){
   await route.fulfill({status:204,headers});return;
  }
  assert.equal(request.method(),'GET','Smoke login must never publish to the Worker');
  assert.equal(request.headers()['authorization'],'Bearer '+secret);
  workerGetCount++;
  await route.fulfill({status:200,headers,contentType:'application/json',
   body:JSON.stringify({sha:'browser-smoke-fixture-sha',data:fixture})});
 });
 await page.goto(url+'/admin.html',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.querySelector('#pdl-tiptap-editor')?.textContent?.includes('TipTap'),null,{timeout:20000});
 await page.waitForFunction(()=>[...document.querySelectorAll('[role="status"]')].some(n=>n.textContent.includes('TipTap ενεργό')),null,{timeout:25000});
 if(errors.length)throw new Error('Studio JS errors: '+errors.join('; '));
 const font=await page.locator('.pdl-tip-canvas').evaluate(el=>getComputedStyle(el).fontFamily);
 if(!/Barnebok/i.test(font))throw new Error('Barnebok is not active: '+font);
 console.log('PASS TipTap bundle initializes and Barnebok is configured');
 // The modal is a security feature. Validate the gate and log in through it
 // rather than force-clicking an inert editor behind the dialog.
 await page.locator('#pdlLoginDialog').waitFor({state:'visible'});
 assert.equal(await page.locator('.app').evaluate(el=>el.inert),true,
  'Studio editing must remain locked before authentication');
 assert.equal(await page.evaluate(()=>state.books.length),0,
  'Studio must not preload a local library before remote GET');
 const backupButton=page.locator('#backupQuick');
 assert.equal(await backupButton.isVisible(),true,'Manual backup must remain visible');
 assert.equal(await backupButton.isEnabled(),false,'Manual backup must stay disabled until login');
 await page.locator('#pdlWorkerNick').fill('ksaefos');
 await page.locator('#pdlPassword').fill(secret);
 await page.locator('#pdlLoginSubmit').click();
 await page.locator('#pdlLoginDialog').waitFor({state:'hidden',timeout:30000});
 await page.waitForFunction(()=>window.pdlStudioConnected?.()===true,null,{timeout:30000});
 assert.equal(await page.locator('.app').evaluate(el=>el.inert),false,
  'Studio editing must unlock after authenticated Worker GET');
 assert.equal(workerGetCount,1,'Exactly one authenticated Worker GET expected');
 assert.equal(await backupButton.isEnabled(),true,'Manual backup must unlock after authenticated GET');
 console.log('PASS Studio login gate: remote-only library GET unlocks editor');
 await page.locator('aside button[data-view="editor"]').click();
 const editable=page.locator('.pdl-tip-canvas .ProseMirror');
 await editable.waitFor({state:'visible'});await editable.click();
 await page.locator('.pdl-tip-toolbar select').selectOption('h1');
 if(await editable.locator('h1').count()===0)throw new Error('H1 formatting failed');
 await page.locator('.pdl-tip-toolbar select').selectOption('h2');
 if(await editable.locator('h2').count()===0)throw new Error('H2 formatting failed');
 await page.locator('.pdl-tip-toolbar select').selectOption('h3');
 if(await editable.locator('h3').count()===0)throw new Error('H3 formatting failed');
 console.log('PASS H1/H2/H3 toolbar commands');
 // A manual backup must capture a title typed but not saved/published, as well
 // as the original book data; it must never send a PUT to the Worker.
 const unsavedTitle='Δοκιμή αδημοσίευτου τίτλου CI';
 await page.locator('#editTitle').fill(unsavedTitle);
 const [backupDownload]=await Promise.all([
  page.waitForEvent('download',{timeout:15000}),backupButton.click()
 ]);
 const backupData=JSON.parse(await readFile(await backupDownload.path(),'utf8'));
 assert.equal(backupData.format,'pontian-studio-backup');
 assert.equal(backupData.data.books.length,fixture.books.length);
 assert.equal(backupData.data.books.find(b=>b.id===fixture.books[0].id)?.title,unsavedTitle,
  'Manual export must capture unsaved book changes');
 assert.equal(workerGetCount,1,'Manual backup must not call remote publish');
 console.log('PASS Studio manual JSON backup: visible, authenticated, captures unsaved edits');
 const page2=await browser.newPage({viewport:{width:390,height:844}});const errors2=[];page2.on('pageerror',err=>errors2.push(String(err)));
 await page2.goto(url+'/index.html',{waitUntil:'domcontentloaded'});
 await page2.waitForFunction(()=>document.querySelector('#pdl-import-status')?.textContent&&!document.querySelector('#pdl-import-status').textContent.includes('Φόρτωση'),null,{timeout:30000});
 if(errors2.length)throw new Error('Reader JS errors: '+errors2.join('; '));
 const width=await page2.evaluate(()=>({scroll:document.documentElement.scrollWidth,inner:innerWidth}));
 if(width.scroll>width.inner+2)throw new Error('Mobile catalog horizontal overflow: '+JSON.stringify(width));
 console.log('PASS catalog loads at mobile width, no horizontal overflow');
 await browser.close();
}catch(e){console.error(e);process.exitCode=1;}finally{if(browser)await browser.close().catch(()=>{});await new Promise(resolve=>server.close(resolve));}
