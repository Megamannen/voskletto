// Web Worker hosting one voskletto module for voskletto-async. Must be served next to voskletto.js and voskletto.wasm

import type { LoadOptions, Module } from './voskletto.js';
import { createWorkerState, dispatch, errorMessage, type Ready, type Request } from './rpc.js';

declare function importScripts(...urls: string[]): void;
declare function loadVoskletto(options?: LoadOptions): Promise<Module>;

const post = (message: unknown) => self.postMessage(message);

importScripts('voskletto.js');

// The first message carries the load options, the rest are requests
self.onmessage = (ev: MessageEvent<LoadOptions>) => {
  self.onmessage = null;
  loadVoskletto(ev.data).then(
    module => {
      const state = createWorkerState();
      self.onmessage = async (ev: MessageEvent<Request>) => post(await dispatch(state, module, ev.data));
      post({ ready: true } satisfies Ready);
    },
    (e: unknown) => post({ ready: false, error: errorMessage(e) } satisfies Ready),
  );
};
