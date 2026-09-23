# voskletto

voskletto is a fork of [Vosklet](https://github.com/msqr1/Vosklet) by Rylex Phan ([msqr1](https://github.com/msqr1)), distributed under the [MIT License](LICENSE). The original copyright and permission notice are retained in [LICENSE](LICENSE).

## Changes from Vosklet
- Loading several models concurrently no longer hangs (model index race in `CommonModel.mk()`)
- `Recognizer` methods (`acceptWaveform`, `set*`, `reset`) survive Closure Compiler minification
- `acceptWaveform` synchronously returns the result JSON; typings updated to match
- Build script fixes in `src/make`

## Build outputs are not committed
`Vosklet.js` and `Vosklet.wasm` are build artifacts and have been removed from the entire history. Build them with `src/make` (outputs land in the repo root). The CDN links below point to upstream Vosklet, not this fork.

---

# Overview
- A fast, lightweight, actively maintained speech recognizer in the browser with total brotlied (used by JSDelivr) size of **under a megabyte** (614 KB)
- Live Demo (ASR in 20 languages): https://msqr1-github-io.pages.dev/Vosklet
- Inspired by vosk-browser by [ccoreilly](https://github.com/ccoreilly)

# Documentation
- See [Documentation.md](Documentation.md)

# Vosklet ...
- Is regularly maintained
- Support multiple models
- Include model cache path management
- Include model cache ID management (for updates)
- Wraps all Vosk's functionaly
- Faster and lighter than vosk-browser

# Basic usage (microphone recognition in English)
- Using JsDelivr CDN
- Result are logged to the console
- Copied from [Examples/fromMic.html](Examples/fromMic.html)
- **IMPORTANT:** Please see [Examples/README.md](Examples/README.md)
```html
<!DOCTYPE html>
<html>
  <head>
    <script src="https://cdn.jsdelivr.net/gh/msqr1/Vosklet@1.2.1/Examples/Vosklet.js" async defer></script>
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

        // Load Vosklet module, model and recognizer
        let module = await loadVosklet();
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
