// AudioWorklet globals, only defined inside the worklet that runs processor()
declare function registerProcessor(name: string, ctor: new (options: AudioWorkletNodeOptions) => object): void;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}

// Runs inside the AudioWorklet from its source text, so it can't refer to anything outside itself
const processor = () => {
  registerProcessor('voskletto-transferer', class extends AudioWorkletProcessor {
    declare filled: number;
    declare bufSize: number;
    declare buf: Float32Array;
    constructor(opts: AudioWorkletNodeOptions) {
      super();
      this.filled = 0;
      this.bufSize = opts.processorOptions[0];
      this.buf = new Float32Array(this.bufSize);
    }
    process(inputs: Float32Array[][]) {
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

export const createProcessorUrl = (): string =>
  URL.createObjectURL(new Blob(['(', processor.toString(), ')()'], { type: 'text/javascript' }));

export const createTransferer = async (ctx: AudioContext, processorUrl: string, bufSize: number): Promise<AudioWorkletNode> => {
  await ctx.audioWorklet.addModule(processorUrl);
  return new AudioWorkletNode(ctx, 'voskletto-transferer', {
    channelCountMode: 'explicit',
    numberOfInputs: 1,
    numberOfOutputs: 0,
    channelCount: 1,
    processorOptions: [bufSize],
  });
};
