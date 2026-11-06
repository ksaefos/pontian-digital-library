import {build} from 'esbuild';
import {copyFileSync,mkdirSync,existsSync,readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..');
const tip=path.join(root,'vendor','tiptap');mkdirSync(tip,{recursive:true});
await build({entryPoints:[path.join(tip,'src','entry.mjs')],outfile:path.join(tip,'tiptap.bundle.js'),bundle:true,format:'esm',platform:'browser',target:['es2022'],minify:true,sourcemap:false,logLevel:'info',legalComments:'inline'});
const hySrc=path.join(root,'node_modules','hyphenopoly');
const hyTarget=path.join(root,'vendor','hyphenopoly','6.1.0');mkdirSync(path.join(hyTarget,'patterns'),{recursive:true});
const required=['Hyphenopoly_Loader.js','Hyphenopoly.js','hyphenEngine.wasm','hyphenEngine.asm.js','patterns/el-polyton.hpb','patterns/el-monoton.hpb','LICENSE'];
for(const file of required){const a=path.join(hySrc,file),b=path.join(hyTarget,file);if(!existsSync(a))throw Error('Missing Hyphenopoly asset: '+file);copyFileSync(a,b)}
const stamp=createHash('sha256');
for(const asset of [path.join(tip,'tiptap.bundle.js'),...required.map(file=>path.join(hyTarget,file))])stamp.update(readFileSync(asset));
const swFile=path.join(root,'sw.js'),swText=readFileSync(swFile,'utf8');
const id='pontian-digital-library-v2.4.0-rc1-'+stamp.digest('hex').slice(0,12);
writeFileSync(swFile,swText.replace(/const CACHE='[^']+';/,`const CACHE='${id}';`));
console.log('TipTap + Greek Hyphenopoly local assets assembled; SW cache '+id);
