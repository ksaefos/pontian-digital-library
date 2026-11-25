import {readFileSync,writeFileSync,mkdirSync,rmSync,cpSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {readerSource,root} from './reader-source.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex').slice(0,20);
export function publicDataset(data){
 const files=new Map(),put=(prefix,value,extension='json')=>{const content=extension==='json'?JSON.stringify(value):value;const file=`public-data/${prefix}.${hash(content)}.${extension}`;files.set(file,content);return './'+file;};
 const books=data.books.map(book=>{
  let cover='./assets/book-placeholder.webp';
  const image=typeof book.cover==='string'&&book.cover.match(/^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=]+)$/);
  if(image)cover=put('covers/cover',Buffer.from(image[2],'base64'),image[1].replace('jpeg','jpg'));
  const {chapters,cover:originalCover,...metadata}=book;
  const url=put('books/book',{...book,cover});
  return {...metadata,cover,chapters:chapters.map(({id,title})=>({id,title})),url};
 });
 // Reader receives the complete shared dictionary, without Studio-only provenance.
 const glossary=put('glossary',data.entries.map(({term,definition,etymology})=>({term,definition,...(etymology?{etymology}:{})})));
 const catalog={format:'pontian-library-catalog',schema:1,books,glossary};
 return {files,catalog};
}
export function buildPublic(){
 const dist=path.join(root,'dist');rmSync(dist,{recursive:true,force:true});mkdirSync(dist,{recursive:true});
 const write=(file,content)=>{const dest=path.join(dist,file);mkdirSync(path.dirname(dest),{recursive:true});writeFileSync(dest,content);};
 for(const file of ['admin.html','library-data.json','manifest.webmanifest','PontianDL_Logo.svg','assets','icons','vendor','catalog'])cpSync(path.join(root,file),path.join(dist,file),{recursive:true});
 const template=readerSource(),templatePath=`reader/template.${hash(template)}.html`;
 write(templatePath,template);cpSync(path.join(root,'reader/media'),path.join(dist,'reader/media'),{recursive:true});
 const readerAssets=['./vendor/openpageflip/0.7.0/index.iife.js','./vendor/openpageflip/0.7.0/styles.css','./vendor/hyphenopoly/6.1.0/Hyphenopoly_Loader.js','./vendor/hyphenopoly/6.1.0/Hyphenopoly.js','./vendor/hyphenopoly/6.1.0/patterns/el-polyton.wasm','./vendor/hyphenopoly/6.1.0/patterns/el-monoton.wasm','./'+templatePath,...readdirSync(path.join(root,'reader/media')).map(file=>'./reader/media/'+file)];
 const {files,catalog}=publicDataset(JSON.parse(readFileSync(path.join(root,'library-data.json'),'utf8')));
 for(const [file,content] of files)write(file,content);
 write('public-data/catalog.json',JSON.stringify(catalog));
 write('index.html',readFileSync(path.join(root,'index.html'),'utf8').replace('__PDL_RUNTIME_CONFIG__',JSON.stringify({template:'./'+templatePath,readerAssets}).replaceAll('<','\\u003c')));
 // Cache identity follows application code AND data. Immutable data URLs remain
 // revision-specific; an offline catalog cannot silently load another revision.
 const revision=hash(readFileSync(path.join(dist,'index.html'))+template+JSON.stringify(catalog)+readFileSync(path.join(root,'sw.js'),'utf8')+['reader-session','library','offline','help'].map(n=>readFileSync(path.join(root,'catalog',n+'.js'),'utf8')).join(''));
 write('sw.js',readFileSync(path.join(root,'sw.js'),'utf8').replace("'./catalog/help.js'","'./catalog/help.js',"+readdirSync(path.join(root,'catalog/media')).map(file=>JSON.stringify('./catalog/media/'+file)).join(',' )).replace(/const CACHE='[^']+';/,`const CACHE='pontian-digital-library-v${JSON.parse(readFileSync(path.join(root,'package.json'))).version}-${revision}';`));
 console.log(`Public build: ${Buffer.byteLength(readFileSync(path.join(dist,'index.html')))} B index, ${Buffer.byteLength(JSON.stringify(catalog))} B catalog; ${booksLength(catalog)} books loaded on demand.`);
 return {dist,catalog,readerAssets};
}
function booksLength(catalog){return catalog.books.length;}
if(process.argv[1]===new URL(import.meta.url).pathname)buildPublic();
