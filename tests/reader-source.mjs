import {readerSource,publicSource} from '../scripts/reader-source.mjs';
export {readerSource};
export function inspectionSource(){return publicSource()+'<script id="pdl-reader-shell" type="application/json">'+JSON.stringify({template:readerSource()}).replaceAll('<','\\u003c')+'</script>';}
