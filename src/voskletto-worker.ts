// Web Worker hosting one voskletto module for voskletto-async. Must be served next to voskletto.js and voskletto.wasm

import type { Module } from './voskletto.js';
import { createWorkerState, dispatch, errorMessage, type Ready, type Request } from './rpc.js';

declare function importScripts(...urls: string[]): void;
declare function loadVoskletto(): Promise<Module>;

const post = (message: unknown) => self.postMessage(message);

importScripts('voskletto.js');
loadVoskletto().then(
  module => {
    const state = createWorkerState();
    self.onmessage = async (ev: MessageEvent<Request>) => post(await dispatch(state, module, ev.data));
    post({ ready: true } satisfies Ready);
  },
  (e: unknown) => post({ ready: false, error: errorMessage(e) } satisfies Ready),
);
