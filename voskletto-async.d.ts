import type { AsyncModule } from './voskletto.js';
/**
 * Loads a voskletto module in a new Web Worker. Each call creates its own worker, so recognizers from
 * different modules run in parallel. `voskletto-worker.js`, `voskletto.js` and `voskletto.wasm` must be
 * served from the same directory.
 */
export declare const loadVosklettoAsync: (workerUrl?: string | URL) => Promise<AsyncModule>;
