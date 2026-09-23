// src/modelCache.ts
var MODEL_CACHE = "voskletto";

// src/results.ts
var classifyResult = (text) => {
  if (text.startsWith("<")) return { type: "nlsml", detail: text };
  const json = JSON.parse(text);
  if ("partial" in json) return { type: "partialResult", detail: json };
  if ("alternatives" in json) return { type: "alternatives", detail: json["alternatives"] };
  return { type: "result", detail: json };
};
var toError = (e) => e instanceof Error ? e : new Error(String(e));
var handleOutcome = (target, outcome) => {
  if (!outcome.ok || outcome.json === "") {
    const error = outcome.ok ? new Error("Unable to recognize audio") : toError(outcome.error);
    const handled = !target.dispatchEvent(new CustomEvent("error", { detail: error, cancelable: true }));
    if (handled || outcome.ok) return "";
    throw outcome.error;
  }
  const { type, detail } = classifyResult(outcome.json);
  target.dispatchEvent(new CustomEvent(type, { detail }));
  return outcome.json;
};

// src/rpc.ts
var MODULE_HANDLE = 0;
var isHandleRef = (value) => typeof value === "object" && value !== null && typeof value.$handle === "number";
var createClient = (post) => {
  const pending = /* @__PURE__ */ new Map();
  let nextId = 0;
  let closedReason;
  return {
    call: (handle, method, args) => new Promise((resolve, reject) => {
      if (closedReason !== void 0) throw new Error(closedReason);
      const id = nextId++;
      post({ id, handle, method, args });
      pending.set(id, { resolve, reject });
    }),
    receive: (res) => {
      const p = pending.get(res.id);
      if (p === void 0) return;
      pending.delete(res.id);
      if (res.ok) p.resolve(res.value);
      else p.reject(new Error(res.error));
    },
    close: (reason) => {
      closedReason = reason;
      for (const p of pending.values()) p.reject(new Error(reason));
      pending.clear();
    }
  };
};

// src/transferer.ts
var processor = () => {
  registerProcessor("voskletto-transferer", class extends AudioWorkletProcessor {
    constructor(opts) {
      super();
      this.filled = 0;
      this.bufSize = opts.processorOptions[0];
      this.buf = new Float32Array(this.bufSize);
    }
    process(inputs) {
      if (inputs[0][0]) {
        this.buf.set(inputs[0][0], this.filled);
        this.filled += 128;
        if (this.filled >= this.bufSize) {
          this.filled = 0;
          this.port.postMessage(this.buf, [this.buf.buffer]);
          this.buf = new Float32Array(this.bufSize);
        }
      }
      return true;
    }
  });
};
var createProcessorUrl = () => URL.createObjectURL(new Blob(["(", processor.toString(), ")()"], { type: "text/javascript" }));
var createTransferer = async (ctx, processorUrl, bufSize) => {
  await ctx.audioWorklet.addModule(processorUrl);
  return new AudioWorkletNode(ctx, "voskletto-transferer", {
    channelCountMode: "explicit",
    numberOfInputs: 1,
    numberOfOutputs: 0,
    channelCount: 1,
    processorOptions: [bufSize]
  });
};

// src/voskletto-async.ts
var waitForReady = (worker) => new Promise((resolve, reject) => {
  worker.addEventListener("message", (ev) => ev.data.ready ? resolve() : reject(new Error(ev.data.error)), { once: true });
  worker.addEventListener("error", (ev) => reject(new Error(ev.message)), { once: true });
});
var loadVosklettoAsync = async ({
  workerUrl = new URL("./voskletto-worker.js", import.meta.url),
  cacheName = MODEL_CACHE
} = {}) => {
  const worker = new Worker(workerUrl);
  worker.postMessage({ cacheName });
  try {
    await waitForReady(worker);
  } catch (e) {
    worker.terminate();
    throw e;
  }
  const client = createClient((req) => worker.postMessage(req));
  worker.addEventListener("message", (ev) => client.receive(ev.data));
  worker.addEventListener("error", (ev) => client.close(ev.message));
  const processorUrl = createProcessorUrl();
  const call = (handle, method, ...args) => client.call(handle, method, args);
  const handles = /* @__PURE__ */ new WeakMap();
  const ref = (obj) => {
    const handle = handles.get(obj);
    if (handle === void 0) throw new Error("Object was not created by this module");
    return { $handle: handle };
  };
  const adopt = (make) => (value) => {
    if (!isHandleRef(value)) throw new Error("Expected an object handle from the worker");
    const obj = make(value.$handle);
    handles.set(obj, value.$handle);
    return obj;
  };
  const model = (h) => ({
    findWord: (word) => call(h, "findWord", word),
    delete: () => call(h, "delete")
  });
  const spkModel = (h) => ({
    delete: () => call(h, "delete")
  });
  const recognizer = (h) => {
    const rec = Object.assign(new EventTarget(), {
      acceptWaveform: (audioData) => call(h, "acceptWaveform", audioData).then(
        (json) => ({ ok: true, json }),
        (error) => ({ ok: false, error })
      ).then((outcome) => handleOutcome(rec, outcome)),
      reset: () => call(h, "reset"),
      setWords: (words) => call(h, "setWords", words),
      setPartialWords: (partialWords) => call(h, "setPartialWords", partialWords),
      setNLSML: (nlsml) => call(h, "setNLSML", nlsml),
      setMaxAlternatives: (alts) => call(h, "setMaxAlternatives", alts),
      setGrm: (grammar) => call(h, "setGrm", grammar),
      setSpkModel: async (mdl) => call(h, "setSpkModel", ref(mdl)),
      setEndpointerMode: (mode) => call(h, "setEndpointerMode", mode),
      setEndpointerDelays: (tStartMax, tEnd, tMax) => call(h, "setEndpointerDelays", tStartMax, tEnd, tMax),
      delete: () => call(h, "delete")
    });
    return rec;
  };
  return {
    createModel: (url, path, id) => call(MODULE_HANDLE, "createModel", url, path, id).then(adopt(model)),
    createSpkModel: (url, path, id) => call(MODULE_HANDLE, "createSpkModel", url, path, id).then(adopt(spkModel)),
    createRecognizer: async (mdl, sampleRate) => call(MODULE_HANDLE, "createRecognizer", ref(mdl), sampleRate).then(adopt(recognizer)),
    createRecognizerWithSpkModel: async (mdl, sampleRate, spk) => call(MODULE_HANDLE, "createRecognizerWithSpkModel", ref(mdl), sampleRate, ref(spk)).then(adopt(recognizer)),
    createRecognizerWithGrm: async (mdl, sampleRate, grammar) => call(MODULE_HANDLE, "createRecognizerWithGrm", ref(mdl), sampleRate, grammar).then(adopt(recognizer)),
    setLogLevel: (level) => call(MODULE_HANDLE, "setLogLevel", level),
    createTransferer: (ctx, bufferSize) => createTransferer(ctx, processorUrl, bufferSize),
    getModelCache: () => caches.open(cacheName),
    cleanUp: async () => {
      client.close("Module was cleaned up");
      worker.terminate();
      URL.revokeObjectURL(processorUrl);
    }
  };
};
export {
  loadVosklettoAsync
};
