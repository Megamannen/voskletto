// Public API types, emitted as voskletto.d.ts

declare global {
  interface Window {
    loadVoskletto(options?: LoadOptions): Promise<Module>;
  }
}

export interface LoadOptions {
  /** Cache Storage name that models are stored in (default: 'voskletto'). 'Vosklet' reuses models cached by Vosklet */
  cacheName?: string;
}

export interface AsyncLoadOptions extends LoadOptions {
  /** URL of voskletto-worker.js (default: voskletto-worker.js next to voskletto-async.js) */
  workerUrl?: string | URL;
}

export type EpModeName = 'ANSWER_DEFAULT' | 'ANSWER_SHORT' | 'ANSWER_LONG' | 'ANSWER_VERY_LONG';

/** Embind enum value, taken from `Module.EpMode` */
export interface EpModeValue {
  readonly value: number;
}

export interface Module {
  createModel(url: string, path: string, id: string): Promise<Model>;
  createSpkModel(url: string, path: string, id: string): Promise<SpkModel>;
  createRecognizer(model: Model, sampleRate: number): Promise<Recognizer>;
  createRecognizerWithSpkModel(model: Model, sampleRate: number, spkModel: SpkModel): Promise<Recognizer>;
  createRecognizerWithGrm(model: Model, sampleRate: number, grammar: string): Promise<Recognizer>;
  setLogLevel(level: number): void;
  createTransferer(ctx: AudioContext, bufferSize: number): Promise<AudioWorkletNode>;
  cleanUp(): Promise<void>;
  getModelCache(): Promise<Cache>;
  EpMode: Record<EpModeName, EpModeValue>;
}

export interface Model {
  findWord(word: string): number;
  delete(): void;
}

export interface SpkModel {
  delete(): void;
}

export interface WordResult {
  word: string;
  start: number;
  end: number;

  /** Missing in alternatives */
  conf?: number;
}

/** While speech continues. `partial_result` is set with `setPartialWords(true)` */
export interface PartialResult {
  partial: string;
  partial_result?: WordResult[];
}

export interface Alternative {
  text: string;
  confidence: number;
  result?: WordResult[];
}

/** Once an endpoint (silence) is detected. `result` is set with `setWords(true)`, `spk` with a speaker model */
export interface TextResult {
  text: string;
  result?: WordResult[];
  spk?: number[];
  spk_frames?: number;
}

/**
 * Events dispatched by acceptWaveform. A final result is dispatched as exactly one of
 * result, alternatives or nlsml, depending on setMaxAlternatives and setNLSML.
 */
export interface RecognizerEventMap {
  partialResult: CustomEvent<PartialResult>;

  /** Final result, by default */
  result: CustomEvent<TextResult>;

  /** Final result, n-best, with `setMaxAlternatives(n)`, n > 0 */
  alternatives: CustomEvent<Alternative[]>;

  /** Final result as NLSML XML, with `setMaxAlternatives(n)`, n > 0, and `setNLSML(true)` */
  nlsml: CustomEvent<string>;

  /** Cancelable: call preventDefault() to handle the error, so acceptWaveform returns '' instead of throwing */
  error: CustomEvent<Error>;
}

export interface RecognizerEventTarget extends EventTarget {
  addEventListener<K extends keyof RecognizerEventMap>(type: K, listener: (ev: RecognizerEventMap[K]) => void, options?: boolean | AddEventListenerOptions): void;
  addEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions): void;
  removeEventListener<K extends keyof RecognizerEventMap>(type: K, listener: (ev: RecognizerEventMap[K]) => void, options?: boolean | EventListenerOptions): void;
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | EventListenerOptions): void;
}

export interface Recognizer extends RecognizerEventTarget {
  /**
   * Synchronously recognizes an audio block and returns the result as a JSON string:
   * a partial result (`{"partial":"..."}`) while speech continues, or a final result
   * (`{"text":"...","result":[...]}`) once an endpoint (silence) is detected.
   * Also dispatches partialResult, result, alternatives or nlsml with the parsed result, or error.
   */
  acceptWaveform(audioData: Float32Array): string;
  reset(): void;
  setWords(words: boolean): void;
  setPartialWords(partialWords: boolean): void;
  /** With `setMaxAlternatives(n)`, n > 0, final results are dispatched as nlsml instead of alternatives */
  setNLSML(nlsml: boolean): void;

  /** With n > 0, final results are dispatched as alternatives (or nlsml) instead of result */
  setMaxAlternatives(alts: number): void;
  setGrm(grammar: string): void;
  setSpkModel(model: SpkModel): void;
  setEndpointerMode(mode: EpModeValue): void;
  setEndpointerDelays(tStartMax: number, tEnd: number, tMax: number): void;

  /** Deletes the recognizer and frees its resources. */
  delete(): void;
}

/**
 * Same API as `Module`, running in its own Web Worker (see `loadVosklettoAsync`).
 * Objects from one `AsyncModule` can only be used with that module.
 */
export interface AsyncModule {
  createModel(url: string, path: string, id: string): Promise<AsyncModel>;
  createSpkModel(url: string, path: string, id: string): Promise<AsyncSpkModel>;
  createRecognizer(model: AsyncModel, sampleRate: number): Promise<AsyncRecognizer>;
  createRecognizerWithSpkModel(model: AsyncModel, sampleRate: number, spkModel: AsyncSpkModel): Promise<AsyncRecognizer>;
  createRecognizerWithGrm(model: AsyncModel, sampleRate: number, grammar: string): Promise<AsyncRecognizer>;
  setLogLevel(level: number): Promise<void>;
  createTransferer(ctx: AudioContext, bufferSize: number): Promise<AudioWorkletNode>;
  getModelCache(): Promise<Cache>;

  /** Terminates the worker, freeing everything created in it. Pending and later calls reject. */
  cleanUp(): Promise<void>;
}

export interface AsyncModel {
  findWord(word: string): Promise<number>;
  delete(): Promise<void>;
}

export interface AsyncSpkModel {
  delete(): Promise<void>;
}

export interface AsyncRecognizer extends RecognizerEventTarget {
  /**
   * Recognizes an audio block in the worker and resolves with the result JSON, as `Recognizer.acceptWaveform`.
   * Also dispatches partialResult, result, alternatives or nlsml with the parsed result, or error,
   * which also covers worker errors.
   */
  acceptWaveform(audioData: Float32Array): Promise<string>;
  reset(): Promise<void>;
  setWords(words: boolean): Promise<void>;
  setPartialWords(partialWords: boolean): Promise<void>;
  /** With `setMaxAlternatives(n)`, n > 0, final results are dispatched as nlsml instead of alternatives */
  setNLSML(nlsml: boolean): Promise<void>;

  /** With n > 0, final results are dispatched as alternatives (or nlsml) instead of result */
  setMaxAlternatives(alts: number): Promise<void>;
  setGrm(grammar: string): Promise<void>;
  setSpkModel(model: AsyncSpkModel): Promise<void>;
  setEndpointerMode(mode: EpModeName): Promise<void>;
  setEndpointerDelays(tStartMax: number, tEnd: number, tMax: number): Promise<void>;
  delete(): Promise<void>;
}
