# API Reference

## JS ```window``` object
| Function/Object | Description |
|-|-|
| ```Promise<Module> loadVoskletto()``` | Load voskletto module interface |

## ```Module``` object
| Function/Object | Description |
|-|-|
| ```Promise<Model> createModel(url: string, path: string, id: string)```<br><br>```Promise<SpkModel> createSpkModel(url: string, path: string, id: string)``` | Create a ```Model``` or ```SpkModel```. Model files must be directly under the model root, and the compressed model must be in ```.tar.gz```/```.tgz``` format. Tar format must be USTAR. The decompressed model is stored in the model cache under ```path```, tagged with ```id```. If:<br>- the cache has an entry for ```path``` with the same ```id```, there will not be a fetch from ```url```.<br>- the cache has no entry for ```path```, or its ```id``` is different, there will be a fetch from ```url```, and the model is stored with ```id```.<br><br>Models are reusable across recognizers. |
| ```Promise<Recognizer> createRecognizer(model: Model, sampleRate: float)```<br><br>```Promise<Recognizer> createRecognizerWithSpkModel(model: Model, sampleRate: float, spkModel: SpkModel)```<br><br>```Promise<Recognizer> createRecognizerWithGrm(model: Model, sampleRate: float, grammar: string)``` | Create a ```Recognizer``` |
| ```setLogLevel(lvl: int)``` | Set log level for Kaldi messages (default: ```0```: Info) <br>```-2```: Error<br>```-1```: Warning<br>```1```: Verbose<br>```2```: More verbose<br>```3```: Debug |
| ```Promise<AudioWorkletNode> createTransferer(ctx: AudioContext, bufferSize: int)``` | Create a node that transfer its inputs back to the main thread with custom buffer size (must be multiple of 128). Its port's ```onmessage``` handler can be set to get audio data. Has 1 input with 1 channel and no output. The the higher the size, the lesser the audio breaks up, but the higher the latency. Recomended value is around ```128 * 150```. |
| ```Promise<void> cleanUp()``` | A convenience function that call ```delete()``` on all objects and revoke all URLs. **Run this when you're done!** |
| ```Promise<Cache> getModelCache()``` | Get ```Cache``` object that stores models. This allow for more granular read and writes to the model storage. |
| ```EpMode``` | Enum for endpointer modes: ```EpMode.ANSWER_DEFAULT```, ```EpMode.ANSWER_SHORT```, ```EpMode.ANSWER_LONG```, ```EpMode.ANSWER_VERY_LONG```. See Vosk's description |

## ```Model``` object
| Function/Object | Description |
|-|-|
| ```int findWord(word: string)``` | Check if a word can be recognized by the model, return the word symbol if ```word``` exists inside the model or ```-1``` otherwise. Word symbol ```0``` is for epsilon |
| ```delete()``` | Delete the model |

## ```SpkModel``` object
| Function/Object | Description |
|-|-|
| ```delete()``` | Delete the speaker model |

## ```Recognizer``` object
| Function/Object | Description |
|-|-|
| ```string acceptWaveform(audioData: Float32Array)``` | Synchronously recognize an audio block, given as a ```Float32Array``` of numbers between ```-1.0``` and ```1.0```. Returns the result as a JSON string:<br>- a partial result (```{"partial":"..."}```) while silence is not detected, ie. still speaking. Its words may be updated and change in later partial results until a final result is returned.<br>- a final result (```{"text":"...", ...}```) when silence is detected. Its words are finalized and won't ever change. |
| ```reset()``` | Reset the recognizer, discarding current results |
| ```setWords(words: bool)``` | Enables words with times in the output (default: ```false```) |
| ```setPartialWords(partialWords: bool)``` | Like above return words and confidences in partial results (default: ```false```) |
| ```setNLSML(nlsml: bool)``` | Set NLSML output (default: ```false```). Only applies with ```setMaxAlternatives(n)```, n > 0; final results are then dispatched as ```nlsml``` |
| ```setMaxAlternatives(alts: int)``` | Configures recognizer to output n-best results (default: ```0```). With n > 0, final results are dispatched as ```alternatives``` instead of ```result``` |
| ```setGrm(grm: string)``` | Reconfigures recognizer to use grammar |
| ```setSpkModel(mdl: SpkModel)``` | Adds speaker model to already initialized recognizer |
| ```setEndpointerMode(mode: EpMode)``` | Set endpointer scaling factor (default: ```EpMode.ANSWER_DEFAULT```) |
| ```setEndpointerDelays(tStartMax: float, tEnd: float, tMax: float)``` | Set endpointer delays |
| ```delete()``` | Delete the recognizer |

| Event | Description |
|-|-|
| ```partialResult``` | Dispatched by ```acceptWaveform``` with the parsed partial result in ```detail```: ```{ partial, partial_result? }```. ```partial_result``` is set with ```setPartialWords(true)``` |
| ```result``` | Dispatched by ```acceptWaveform``` with the parsed final result in ```detail```: ```{ text, result?, spk?, spk_frames? }```. ```result``` is set with ```setWords(true)```, ```spk``` with a speaker model. Not dispatched with ```setMaxAlternatives(n)```, n > 0 |
| ```alternatives``` | Final result instead of ```result``` with ```setMaxAlternatives(n)```, n > 0. ```detail``` is ```[{ text, confidence, result? }]``` |
| ```nlsml``` | Final result instead of ```alternatives``` with ```setMaxAlternatives(n)```, n > 0, and ```setNLSML(true)```. ```detail``` is the NLSML XML string |
| ```error``` | Dispatched when recognition fails, with the ```Error``` in ```detail```. Cancelable: if a listener calls ```ev.preventDefault()```, ```acceptWaveform``` returns ```''```; otherwise it throws as usual |

```acceptWaveform``` still returns the result JSON string. Listeners are removed with ```removeEventListener```, ```{ once: true }``` or ```{ signal }```:
```js
recognizer.addEventListener('partialResult', ev => console.log('Partial:', ev.detail.partial));
recognizer.addEventListener('result', ev => console.log('Result:', ev.detail.text));
recognizer.addEventListener('error', ev => {
  console.error(ev.detail);
  ev.preventDefault();
});
transferer.port.onmessage = ev => recognizer.acceptWaveform(ev.data);
```

---
# Async API (```voskletto-async.js```)
Runs a voskletto module in a Web Worker, so recognition doesn't block the main thread. Each ```loadVosklettoAsync()``` call creates its own worker with its own copy of the Wasm module and memory, so recognizers in different modules run in parallel. Recognizers in the same module take turns.
```js
import { loadVosklettoAsync } from './voskletto-async.js';
const module = await loadVosklettoAsync();
const model = await module.createModel(url, 'English', 'v1');
const recognizer = await module.createRecognizer(model, ctx.sampleRate);
const transferer = await module.createTransferer(ctx, 128 * 150);
transferer.port.onmessage = async ev => console.log(await recognizer.acceptWaveform(ev.data));
```

| Function/Object | Description |
|-|-|
| ```Promise<AsyncModule> loadVosklettoAsync(workerUrl?: string \| URL)``` | Start a worker and load a module in it. ```voskletto-worker.js```, ```voskletto.js``` and ```voskletto.wasm``` must be served from the same directory. ```workerUrl``` defaults to ```voskletto-worker.js``` next to ```voskletto-async.js```. |

```AsyncModule```, ```AsyncModel```, ```AsyncSpkModel``` and ```AsyncRecognizer``` have the same functions as ```Module```, ```Model```, ```SpkModel``` and ```Recognizer```, with these differences:
- Every function returns a ```Promise```. ```acceptWaveform``` resolves with the result JSON string.
- ```AsyncRecognizer``` dispatches the same events as ```Recognizer```. ```error``` also covers worker errors, such as calls after ```cleanUp()```. With an ```error``` listener that calls ```ev.preventDefault()```, ```acceptWaveform``` resolves ```''``` instead of rejecting, so ```transferer.port.onmessage = ev => recognizer.acceptWaveform(ev.data)``` needs no ```.catch()```.
- Models and recognizers can only be used with the ```AsyncModule``` that created them.
- ```setEndpointerMode``` takes the mode name as a string, e.g. ```'ANSWER_SHORT'```, instead of an ```EpMode``` value. ```AsyncModule``` has no ```EpMode```.
- ```cleanUp()``` terminates the worker, which frees everything created in it. Pending and later calls reject.
- The model cache is shared with ```Module```, since both use the same origin's Cache API.

---
# HTTP Remarks

## HTTPS
voskletto is available only in [secure contexts](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts) (HTTPS)
## SharedArrayBuffer
voskletto is built with Wasm workers support, so its memory is a SharedArrayBuffer, which requires these response headers:
- ```Cross-Origin-Embedder-Policy``` ⟶ ```require-corp```
- ```Cross-Origin-Opener-Policy``` ⟶ ```same-origin```

If you can't set them, you may use a hacky workaround in ```AddCOI.js```, built from [src/AddCOI.ts](src/AddCOI.ts)

## Content Security Policy (CSP)
For those who are using CSP, ```createTransferer``` loads its audio worklet module from a ```Blob``` URL, which requires the CSP ```script-src``` to include ```blob:```. The async API also needs ```worker-src``` to allow ```voskletto-worker.js```

---
# Compilation
- Requires ```git```, ```wget```, all Autotools commands in PATH, ```make```, ```pkg-config```, a native C compiler, and Node.js 23.6 or newer with ```npm```. For example, installing with ```apt``` would be:

  ```sudo apt install git wget autotools-dev autoconf libtool make pkg-config clang nodejs npm```
- ```./make``` builds ```voskletto.js``` and ```voskletto.wasm```, and runs ```npm run build```, which builds ```voskletto-async.js```, ```voskletto-worker.js```, ```AddCOI.js```, ```voskletto.d.ts``` and ```voskletto-async.d.ts``` from the TypeScript in ```src```. All are written to the repo root. After changing only TypeScript that isn't ```src/Wrapper.ts``` or what it imports, ```npm run build``` is enough
- Changing any option to non-default values requires recompilation
- To remake a specific dependency, erase its directory in the repo root and run ```./make``` again. The final JS is rebuilt on every run
```shell
git clone --depth=1 https://github.com/Megamannen/voskletto &&
cd voskletto/src &&
[Options] ./make
# Example: INITIAL_MEMORY=350mb ./make
```
| Option | Description | Default value |
|-|-|-|
| INITIAL_MEMORY | Set inital memory, valid suffixes: kb, mb, gb, tb or none (bytes) | ```315mb``` as [recommended](https://alphacephei.com/vosk/models) plus a bit of leeway. This memory will grow if usage exceeds this value. |
| JOBS | Set the number of jobs (threads) when building | ```$(nproc)```   |
| EMSDK | Set EMSDK's path (will install EMSDK there if it's the default path and missing) | ```<repo root>/emsdk``` |
| HOSTCC | Native C compiler used to build OpenBLAS | ```clang```, or ```cc``` if ```clang``` isn't found |

## Tests
- ```npm test``` runs the unit tests (```src/**/*.test.ts```)
- ```npm run test:integration``` runs the async API in headless Chromium against the built files. It needs ```VOSK_MODEL``` set to a model ```.tar.gz```, and ```CHROMIUM_PATH``` if Playwright's own Chromium isn't installed:

  ```VOSK_MODEL=path/to/vosk-model-small-en-us-0.15.tar.gz CHROMIUM_PATH=/usr/bin/chromium npm run test:integration```
