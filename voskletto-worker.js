"use strict";
(() => {
  // src/rpc.ts
  var MODULE_HANDLE = 0;
  var isHandleRef = (value) => typeof value === "object" && value !== null && typeof value.$handle === "number";
  var errorMessage = (e) => e instanceof Error ? e.message : String(e);
  var creators = /* @__PURE__ */ new Set([
    "createModel",
    "createSpkModel",
    "createRecognizer",
    "createRecognizerWithSpkModel",
    "createRecognizerWithGrm"
  ]);
  var createWorkerState = () => ({ objects: /* @__PURE__ */ new Map(), nextHandle: MODULE_HANDLE + 1 });
  var lookup = (state, handle) => {
    const obj = state.objects.get(handle);
    if (obj === void 0) throw new Error(`No object with handle ${handle}`);
    return obj;
  };
  var register = (state, obj) => {
    const handle = state.nextHandle++;
    state.objects.set(handle, obj);
    return { $handle: handle };
  };
  var dispatch = async (state, module, req) => {
    try {
      const target = req.handle === MODULE_HANDLE ? module : lookup(state, req.handle);
      const fn = target[req.method];
      if (typeof fn !== "function") throw new Error(`${req.method} is not a function`);
      const args = req.args.map((arg) => isHandleRef(arg) ? lookup(state, arg.$handle) : arg);
      if (req.method === "setEndpointerMode") args[0] = module.EpMode[args[0]];
      const value = await fn.apply(target, args);
      if (req.method === "delete") state.objects.delete(req.handle);
      return { id: req.id, ok: true, value: creators.has(req.method) ? register(state, value) : value };
    } catch (e) {
      return { id: req.id, ok: false, error: errorMessage(e) };
    }
  };

  // src/voskletto-worker.ts
  var post = (message) => self.postMessage(message);
  importScripts("voskletto.js");
  self.onmessage = (ev) => {
    self.onmessage = null;
    loadVoskletto(ev.data).then(
      (module) => {
        const state = createWorkerState();
        self.onmessage = async (ev2) => post(await dispatch(state, module, ev2.data));
        post({ ready: true });
      },
      (e) => post({ ready: false, error: errorMessage(e) })
    );
  };
})();
