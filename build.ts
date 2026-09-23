import { build, type BuildOptions } from 'esbuild';

const shared: BuildOptions = { bundle: true, target: 'es2020', logLevel: 'warning' };

// Closure runs over voskletto.js with the pre-js inside it and needs this annotation to accept the Emscripten globals
const closureBanner = '/**\n * @fileoverview\n * @suppress {undefinedVars|checkTypes}\n */';

await Promise.all([
  // Emscripten --pre-js, consumed by src/make
  build({ ...shared, entryPoints: ['src/Wrapper.ts'], format: 'esm', banner: { js: closureBanner }, outfile: 'build/Wrapper.js' }),
  build({ ...shared, entryPoints: ['src/voskletto-async.ts'], format: 'esm', outfile: 'voskletto-async.js' }),
  // Classic scripts: the worker uses importScripts, AddCOI is loaded with a script tag and as a service worker
  build({ ...shared, entryPoints: ['src/voskletto-worker.ts', 'src/AddCOI.ts'], format: 'iife', outdir: '.' }),
]);
