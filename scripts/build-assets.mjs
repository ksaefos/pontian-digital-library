import {build} from 'esbuild';
import {copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const root = path.resolve(import.meta.dirname, '..');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = pkg.version;
if (typeof version !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  throw Error('Invalid package.json version');
}

// Fail before modifying generated assets if the three app version sources drift.
const lock = JSON.parse(readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
if (lock.version !== version || lock.packages?.['']?.version !== version) {
  throw Error(`Version mismatch: package.json=${version}, package-lock.json=${lock.version}, lock root=${lock.packages?.['']?.version}. Regenerate the npm lockfile.`);
}
const reader = readFileSync(path.join(root, 'index.html'), 'utf8');
const readerVersion = reader.match(/\bPDL_APP_VERSION\s*=\s*['"]([^'"]+)['"]/);
if (!readerVersion || readerVersion[1] !== version) {
  throw Error(`Version mismatch: package.json=${version}, Reader=${readerVersion?.[1] ?? 'not found'}`);
}

// Hyphenopoly 4+ ships a WASM engine for EACH language under patterns/.
// The old hyphenEngine.wasm/.asm.js and *.hpb assets do not exist in v6.1.0.
const hyVersion = pkg.dependencies?.hyphenopoly;
if (hyVersion !== '6.1.0') {
  throw Error(`This asset manifest targets Hyphenopoly 6.1.0; found ${hyVersion ?? 'no dependency'}`);
}
const hySrc = path.join(root, 'node_modules', 'hyphenopoly');
const hyTarget = path.join(root, 'vendor', 'hyphenopoly', hyVersion);
const hyAssets = [
  'Hyphenopoly_Loader.js',
  'Hyphenopoly.js',
  'patterns/el-polyton.wasm',
  'patterns/el-monoton.wasm',
  'LICENSE'
];

// Validate ALL installed sources before creating or changing generated files.
for (const file of hyAssets) {
  const src = path.join(hySrc, file);
  if (!existsSync(src)) {
    throw Error(`Missing Hyphenopoly ${hyVersion} asset: ${file}. Check npm install and package-lock.json.`);
  }
  if (file.endsWith('.wasm')) {
    const wasm = readFileSync(src);
    if (wasm.length < 8 || !wasm.subarray(0, 4).equals(Buffer.from([0x00, 0x61, 0x73, 0x6d]))) {
      throw Error(`Invalid Hyphenopoly WASM file: ${file}`);
    }
  }
}

const swFile = path.join(root, 'sw.js');
const swText = readFileSync(swFile, 'utf8');
const cachePattern = /const CACHE='[^']+';/;
const optionalPattern = /const OPTIONAL=\[[^\]]*\];/;
if (!cachePattern.test(swText) || !optionalPattern.test(swText)) {
  throw Error('Unrecognized sw.js cache/optional asset declarations; refusing incomplete build');
}

const tip = path.join(root, 'vendor', 'tiptap');
mkdirSync(tip, {recursive: true});
await build({
  entryPoints: [path.join(tip, 'src', 'entry.mjs')],
  outfile: path.join(tip, 'tiptap.bundle.js'),
  bundle: true, format: 'esm', platform: 'browser', target: ['es2022'],
  minify: true, sourcemap: false, logLevel: 'info', legalComments: 'inline'
});

for (const file of hyAssets) {
  const dest = path.join(hyTarget, file);
  mkdirSync(path.dirname(dest), {recursive: true});
  copyFileSync(path.join(hySrc, file), dest);
}
// Remove only files belonging to the obsolete pre-v4 asset layout.
for (const oldFile of ['hyphenEngine.wasm', 'hyphenEngine.asm.js', 'patterns/el-polyton.hpb', 'patterns/el-monoton.hpb']) {
  rmSync(path.join(hyTarget, oldFile), {force: true});
}

const hash = createHash('sha256');
for (const file of [path.join(tip, 'tiptap.bundle.js'), ...hyAssets.map(x => path.join(hyTarget, x))]) {
  hash.update(readFileSync(file));
}
const cacheId = `pontian-digital-library-v${version}-${hash.digest('hex').slice(0, 12)}`;
// Keep the actual pre-cached files synchronized with what this build ships.
const optionalFiles = [
  './vendor/tiptap/tiptap.bundle.js',
  ...hyAssets.filter(x => x !== 'LICENSE').map(x => `./vendor/hyphenopoly/${hyVersion}/${x}`)
];
const updatedSw = swText
  .replace(cachePattern, `const CACHE='${cacheId}';`)
  .replace(optionalPattern, `const OPTIONAL=${JSON.stringify(optionalFiles)};`);
writeFileSync(swFile, updatedSw);
console.log(`Built TipTap + Hyphenopoly ${hyVersion} (two Greek WASM patterns); SW cache ${cacheId}`);
