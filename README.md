# voskletto

voskletto is a fork of [Vosklet](https://github.com/msqr1/Vosklet) by Rylex Phan ([msqr1](https://github.com/msqr1)), distributed under the [MIT License](LICENSE). The original copyright and permission notice are retained in [LICENSE](LICENSE).

## Changes from Vosklet
- Loading several models concurrently no longer hangs (model index race in `CommonModel.mk()`)
- `Recognizer` methods (`acceptWaveform`, `set*`, `reset`) survive Closure Compiler minification
- `acceptWaveform` synchronously returns the result JSON; typings updated to match
- Build script fixes in `src/make`
- `createRecognizer*` resolves (it never did after upstream removed async), and `acceptWaveform` returns a string instead of failing on an unbound `const char*`
- `acceptWaveform` frees its audio buffer (it leaked every block)
- Async API: `loadVosklettoAsync()` in `voskletto-async.js` runs a module in a Web Worker, so several recognizers can run in parallel off the main thread
- `partialResult`/`result`/`alternatives`/`nlsml`/`error` events on both recognizer types, with typed parsed results in `detail`. `error` is cancelable: `ev.preventDefault()` makes `acceptWaveform` return `''` instead of throwing
- JS sources are TypeScript in `src`; `voskletto.d.ts` is generated
- Renamed to voskletto: `voskletto.js`/`.wasm`, `window.loadVoskletto()`, model cache `voskletto`. Models cached under upstream's `Vosklet` cache are downloaded again

## Build outputs are not committed
`voskletto.js` and `voskletto.wasm` are build artifacts. Build them with `src/make` (outputs land in the repo root). `voskletto-async.js`, `voskletto-worker.js`, `AddCOI.js`, `voskletto.d.ts` and `voskletto-async.d.ts` are built from TypeScript by `npm run build`, which `src/make` also runs. Upstream's committed `Vosklet.js` and `Vosklet.wasm` builds have been removed from this fork's entire history.

## Install
Releases are orphan commits containing only the build outputs, tagged `v<version>`:
```sh
npm install github:Megamannen/voskletto#v<version>
```
`import { loadVosklettoAsync } from 'voskletto'` loads the async API. `voskletto/voskletto.js`, `voskletto/voskletto.wasm`, `voskletto/voskletto-worker.js` and `voskletto/AddCOI.js` are served as assets next to each other.

### Vite
Bundlers don't follow `importScripts('voskletto.js')` in the worker or the `.wasm` fetch in `voskletto.js`, so copy the three files unchanged with [vite-plugin-static-copy](https://github.com/sapphi-red/vite-plugin-static-copy) and pass the worker URL explicitly:
```sh
npm install -D vite-plugin-static-copy
```
```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

// Required headers, see Documentation.md#http-remarks
const headers = {
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Opener-Policy': 'same-origin',
};

export default defineConfig({
  plugins: [
    viteStaticCopy({
      targets: [
        {
          src: [
            'node_modules/voskletto/voskletto.js',
            'node_modules/voskletto/voskletto.wasm',
            'node_modules/voskletto/voskletto-worker.js',
          ],
          dest: 'voskletto',
        },
      ],
    }),
  ],
  server: { headers },
  preview: { headers },
});
```
```ts
import { loadVosklettoAsync } from 'voskletto';

const module = await loadVosklettoAsync(`${import.meta.env.BASE_URL}voskletto/voskletto-worker.js`);
```
The default worker URL is resolved from `import.meta.url`, which points into Vite's pre-bundled deps in dev, so don't rely on it. Your production host must send the same headers (or add `AddCOI.js` to the copied files and load it with a `<script>` tag).

To release, run `./release <version>` from a clean, pushed checkout. It typechecks, tests and builds with `src/make`, then pushes the `v<version>` tag and creates a GitHub release with `gh`.

---

# Overview
- A fast, lightweight, actively maintained speech recognizer in the browser with total brotlied (used by JSDelivr) size of **under a megabyte** (614 KB)
- Upstream Vosklet's live demo (ASR in 20 languages): https://msqr1-github-io.pages.dev/Vosklet
- Inspired by vosk-browser by [ccoreilly](https://github.com/ccoreilly)

# Documentation
- See [Documentation.md](Documentation.md)

# voskletto ...
- Is regularly maintained
- Support multiple models
- Include model cache path management
- Include model cache ID management (for updates)
- Wraps all Vosk's functionaly
- Faster and lighter than vosk-browser

# Basic usage (microphone recognition in English)
- Serve the page next to the built `voskletto.js` and `voskletto.wasm`, with the headers in [Documentation.md](Documentation.md#http-remarks)
- Result are logged to the console
```html
<!DOCTYPE html>
<html>
  <head>
    <script src="voskletto.js" async defer></script>
    <script>
      async function start() {
        // All data is collected and transfered to the main thread so the AudioContext won't output anything. Set sinkId type to none to save power
        let ctx = new AudioContext({sinkId: {type: "none"}});

        // Setup microphone   
        let micNode = ctx.createMediaStreamSource(await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            channelCount: 1
          },
        }));

        // Load voskletto module, model and recognizer
        let module = await loadVoskletto();
        let model = await module.createModel("https://ccoreilly.github.io/vosk-browser/models/vosk-model-small-en-us-0.15.tar.gz","English","vosk-model-small-en-us-0.15");
        let recognizer = await module.createRecognizer(model, ctx.sampleRate);

        // Listen for result and partial result
        recognizer.addEventListener("result", ev => console.log("Result: ", ev.detail));
        recognizer.addEventListener("partialResult", ev => console.log("Partial result: ", ev.detail));

        // Create a transferer node to get audio data on the main thread
        let transferer = await module.createTransferer(ctx, 128 * 150);

        // Recognize data on arrival
        transferer.port.onmessage = ev => recognizer.acceptWaveform(ev.data);

        // Connect transferer to microphone
        micNode.connect(transferer);
      }
    </script>
    <!-- Start and create audio context only as a result of user's action -->
    <button onclick="start()">Start</button>
  </head>
</html>
```
