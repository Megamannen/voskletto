/**
 * @fileoverview
 * @suppress {undefinedVars|checkTypes}
 */

if (ENVIRONMENT_IS_WEB) {

  // 'var' to expose this outside the if
  var objs = [];
  var events = ['status', 'partialResult', 'result'];
  let _cache = caches.open('Vosklet');
  let processorURL = URL.createObjectURL(new Blob(['(', (() => {
    registerProcessor('VoskletTransferer', class extends AudioWorkletProcessor {
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
    })
  }).toString(), ')()'], { type: 'text/javascript' }));
  class CommonModel extends EventTarget {
    constructor() {
      super();
      objs.push(this);
    }
    delete() {
      this.obj.delete();
    }
    static async mk(url, storepath, id, normalMdl) {
      let mdl = new CommonModel();
      let result = new Promise((resolve, reject) => {
        mdl.addEventListener('', ev => {
          if (!ev.detail) {
            if (normalMdl) mdl['findWord'] = word => mdl.obj['findWord'](word);
            resolve(mdl);
          }
          else reject(ev.detail);
        }, { once: true });
      });
      let cache = await caches.open('Vosklet');
      let req = (await cache.keys(storepath, { ignoreSearch: true }))[0];
      let res;
      if (typeof req == 'undefined' || req.url.split('?')[1] != id) {

        // Caching already handled explicitly 
        res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) throw 'Unable to fetch model, status: ' + res.status;
        res = new Response(res.body.pipeThrough(new DecompressionStream('gzip')));
        await cache.put(storepath + '?' + id, res.clone());
      }
      else res = await cache.match(req);
      let tar = await res.arrayBuffer();
      let tarStart = _malloc(tar.byteLength);
      HEAPU8.set(new Uint8Array(tar), tarStart);
      mdl.obj = new Module['CommonModel'](objs.indexOf(mdl), normalMdl, tarStart, tar.byteLength);
      return result;
    }
  }
  class Recognizer extends EventTarget {
    constructor() {
      super();
      objs.push(this);

      // Consumer-facing methods are assigned with quoted names so the Closure
      // Compiler preserves them. As plain (unquoted) class methods they have no
      // internal caller and get renamed/dead-code-eliminated, which strips
      // acceptWaveform/set*/reset from the built wrapper.
      this['acceptWaveform'] = audioData => {
        let start = _malloc(audioData.length * 4);
        HEAPF32.set(audioData, start / 4);
        return UTF8ToString(this.obj['acceptWaveform'](start, audioData.length));
      };
      this['setWords'] = words => this.obj['setWords'](words);
      this['setPartialWords'] = partialWords => this.obj['setPartialWords'](partialWords);
      this['setNLSML'] = nlsml => this.obj['setNLSML'](nlsml);
      this['setMaxAlternatives'] = alts => this.obj['setMaxAlternatives'](alts);
      this['setGrm'] = grm => this.obj['setGrm'](grm);
      this['setSpkModel'] = spkModel => this.obj['setSpkModel'](spkModel.obj);
      this['setEndpointerMode'] = mode => this.obj['setEndpointerMode'](mode);
      this['setEndpointerDelays'] = (tStartMax, tEnd, tMax) =>
        this.obj['setEndpointerDelays'](tStartMax, tEnd, tMax);
      this['reset'] = () => this.obj['reset']();
    }
    delete() {
      this.obj.delete();
    }
    static async mk(model, sampleRate, mode, grammar, spkModel) {
      let rec = new Recognizer();
      let result = new Promise((resolve, reject) => {
        rec.addEventListener('', ev => {
          if (!ev.detail) resolve(rec);
          else reject(ev.detail);
        }, { once: true });
      })
      switch (mode) {
        case 1:
          rec.obj = new Module['Recognizer'](objs.length - 1, sampleRate, model);
          break;
        case 2:
          rec.obj = new Module['Recognizer'](objs.length - 1, sampleRate, model, spkModel);
          break;
        default:
          rec.obj = new Module['Recognizer'](objs.length - 1, sampleRate, model, grammar, 0);
      }
      return result;
    }
  }
  Module = {
    'getModelCache': () => _cache,

    'cleanUp': async () => {
      for (let obj of objs) await obj.delete();
      URL.revokeObjectURL(processorURL);
    },

    'createTransferer': async (ctx, bufSize) => {
      await ctx.audioWorklet.addModule(processorURL);
      return new AudioWorkletNode(ctx, 'VoskletTransferer', {
        channelCountMode: 'explicit',
        numberOfInputs: 1,
        numberOfOutputs: 0,
        channelCount: 1,
        processorOptions: [bufSize]
      });
    },

    'createModel': (url, storepath, id) =>
      CommonModel.mk(url, storepath, id, true),

    'createSpkModel': (url, storepath, id) =>
      CommonModel.mk(url, storepath, id, false),

    'createRecognizer': (model, sampleRate) =>
      Recognizer.mk(model.obj, sampleRate, 1),

    'createRecognizerWithGrm': (model, sampleRate, grammar) =>
      Recognizer.mk(model.obj, sampleRate, 3, grammar, null),

    'createRecognizerWithSpkModel': (model, sampleRate, spkModel) =>
      Recognizer.mk(model.obj, sampleRate, 2, null, spkModel.obj)
  }

}