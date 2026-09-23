// vosklet.d.ts

declare global {
  interface Window {
    loadVosklet(): Promise<Module>;
  }
}

export type EpMode =
  | "ANSWER_DEFAULT"
  | "DISABLED"
  | "FAST"
  | "MEDIUM"
  | "SLOW";

export interface Module {
  createModel(url: string, path: string, id: string): Promise<Model>;
  createSpkModel(url: string, path: string, id: string): Promise<SpkModel>;
  createRecognizer(model: Model, sampleRate: number): Promise<Recognizer>;
  createRecognizerWithSpkModel(
    model: Model,
    sampleRate: number,
    spkModel: SpkModel
  ): Promise<Recognizer>;
  createRecognizerWithGrm(
    model: Model,
    sampleRate: number,
    grammar: string
  ): Promise<Recognizer>;
  setLogLevel(level: number): void;
  createTransferer(
    ctx: AudioContext,
    bufferSize: number
  ): Promise<AudioWorkletNode>;
  cleanUp(): Promise<void>;
  getModelCache(): Promise<Cache>;
  EpMode: EpMode;
}

export interface Model {
  findWord(word: string): number;
  delete(): void;
}

export interface SpkModel {
  delete(): void;
}

export interface Recognizer extends EventTarget {
  /**
   * Synchronously recognizes an audio block and returns the result as a JSON string:
   * a partial result (`{"partial":"..."}`) while speech continues, or a final result
   * (`{"text":"...","result":[...]}`) once an endpoint (silence) is detected.
   */
  acceptWaveform(audioData: Float32Array): string;
  reset(): void;
  setWords(words: boolean): void;
  setPartialWords(partialWords: boolean): void;
  setNLSML(nlsml: boolean): void;
  setMaxAlternatives(alts: number): void;
  setGrm(grammar: string): void;
  setSpkModel(model: SpkModel): void;
  setEndpointerMode(mode: EpMode): void;
  setEndpointerDelays(
    tStartMax: number,
    tEnd: number,
    tMax: number
  ): void;

  /** Deletes the recognizer and frees its resources. */
  delete(): void;
}

