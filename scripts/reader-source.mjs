import {readFileSync} from 'node:fs';
import path from 'node:path';
export const root=path.resolve(import.meta.dirname,'..');
// Preserve cascade, script order and the original shared classic-script scopes.
// Functions within reading-core are assembled into ONE script to preserve hoisting.
export function readerSource(){
 return readFileSync(path.join(root,'reader/template.html'),'utf8').replace(/<(script|style)\b([^>]*?)\sdata-sources?="([^"]+)"([^>]*)><\/\1>/g,(_,tag,before,files,after)=>`<${tag}${before}${after}>${files.split(',').map(file=>readFileSync(path.join(root,'reader',file),'utf8')).join('')}</${tag}>`);
}
export function publicSource(){return readFileSync(path.join(root,'index.html'),'utf8').replace(/<script\b([^>]*?)\ssrc="\.\/(catalog\/[^"]+)"([^>]*)><\/script>/g,(_,before,file,after)=>`<script${before}${after}>${readFileSync(path.join(root,file),'utf8')}</script>`);}
