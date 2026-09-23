// Async facade: runs a voskletto module in a Web Worker (voskletto-worker.js) and forwards calls to it

import type { AsyncModel, AsyncModule, AsyncRecognizer, AsyncSpkModel } from './voskletto.js';
import { MODEL_CACHE } from './modelCache.js';
import { handleOutcome, type Outcome } from './results.js';
import { createClient, isHandleRef, MODULE_HANDLE, type HandleRef, type Ready, type Response } from './rpc.js';
import { createProcessorUrl, createTransferer } from './transferer.js';

const waitForReady = (worker: Worker) =>
  new Promise<void>((resolve, reject) => {
    worker.addEventListener('message', (ev: MessageEvent<Ready>) => (ev.data.ready ? resolve() : reject(new Error(ev.data.error))), { once: true });
    worker.addEventListener('error', ev => reject(new Error(ev.message)), { once: true });
  });

/**
 * Loads a voskletto module in a new Web Worker. Each call creates its own worker, so recognizers from
 * different modules run in parallel. `voskletto-worker.js`, `voskletto.js` and `voskletto.wasm` must be
 * served from the same directory.
 */
export const loadVosklettoAsync = async (workerUrl: string | URL = new URL('./voskletto-worker.js', import.meta.url)): Promise<AsyncModule> => {
  const worker = new Worker(workerUrl);
  try {
    await waitForReady(worker);
  } catch (e) {
    worker.terminate();
    throw e;
  }
  const client = createClient(req => worker.postMessage(req));
  worker.addEventListener('message', (ev: MessageEvent<Response>) => client.receive(ev.data));
  worker.addEventListener('error', ev => client.close(ev.message));
  const processorUrl = createProcessorUrl();

  const call = <T>(handle: number, method: string, ...args: unknown[]) => client.call(handle, method, args) as Promise<T>;

  // Worker-side handles of the objects this module created
  const handles = new WeakMap<object, number>();
  const ref = (obj: object): HandleRef => {
    const handle = handles.get(obj);
    if (handle === undefined) throw new Error('Object was not created by this module');
    return { $handle: handle };
  };
  const adopt = <T extends object>(make: (handle: number) => T) => (value: unknown): T => {
    if (!isHandleRef(value)) throw new Error('Expected an object handle from the worker');
    const obj = make(value.$handle);
    handles.set(obj, value.$handle);
    return obj;
  };

  const model = (h: number): AsyncModel => ({
    findWord: word => call(h, 'findWord', word),
    delete: () => call(h, 'delete'),
  });
  const spkModel = (h: number): AsyncSpkModel => ({
    delete: () => call(h, 'delete'),
  });
  const recognizer = (h: number): AsyncRecognizer => {
    const rec: AsyncRecognizer = Object.assign(new EventTarget(), {
      acceptWaveform: audioData =>
        call<string>(h, 'acceptWaveform', audioData).then(
          (json): Outcome => ({ ok: true, json }),
          (error: unknown): Outcome => ({ ok: false, error }),
        ).then(outcome => handleOutcome(rec, outcome)),
      reset: () => call(h, 'reset'),
      setWords: words => call(h, 'setWords', words),
      setPartialWords: partialWords => call(h, 'setPartialWords', partialWords),
      setNLSML: nlsml => call(h, 'setNLSML', nlsml),
      setMaxAlternatives: alts => call(h, 'setMaxAlternatives', alts),
      setGrm: grammar => call(h, 'setGrm', grammar),
      setSpkModel: async mdl => call(h, 'setSpkModel', ref(mdl)),
      setEndpointerMode: mode => call(h, 'setEndpointerMode', mode),
      setEndpointerDelays: (tStartMax, tEnd, tMax) => call(h, 'setEndpointerDelays', tStartMax, tEnd, tMax),
      delete: () => call(h, 'delete'),
    } satisfies Omit<AsyncRecognizer, keyof EventTarget>);
    return rec;
  };

  return {
    createModel: (url, path, id) => call(MODULE_HANDLE, 'createModel', url, path, id).then(adopt(model)),
    createSpkModel: (url, path, id) => call(MODULE_HANDLE, 'createSpkModel', url, path, id).then(adopt(spkModel)),
    createRecognizer: async (mdl, sampleRate) =>
      call(MODULE_HANDLE, 'createRecognizer', ref(mdl), sampleRate).then(adopt(recognizer)),
    createRecognizerWithSpkModel: async (mdl, sampleRate, spk) =>
      call(MODULE_HANDLE, 'createRecognizerWithSpkModel', ref(mdl), sampleRate, ref(spk)).then(adopt(recognizer)),
    createRecognizerWithGrm: async (mdl, sampleRate, grammar) =>
      call(MODULE_HANDLE, 'createRecognizerWithGrm', ref(mdl), sampleRate, grammar).then(adopt(recognizer)),
    setLogLevel: level => call(MODULE_HANDLE, 'setLogLevel', level),
    createTransferer: (ctx, bufferSize) => createTransferer(ctx, processorUrl, bufferSize),
    getModelCache: () => caches.open(MODEL_CACHE),
    cleanUp: async () => {
      client.close('Module was cleaned up');
      worker.terminate();
      URL.revokeObjectURL(processorUrl);
    },
  };
};
