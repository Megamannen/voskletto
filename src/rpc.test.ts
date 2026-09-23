import { describe, expect, it, vi } from 'vitest';
import { createClient, createWorkerState, dispatch, MODULE_HANDLE, type Request, type Response } from './rpc.js';

const EpMode = { ANSWER_DEFAULT: { value: 0 }, ANSWER_SHORT: { value: 1 } };

const fakeModule = () => {
  const recognizer = {
    acceptWaveform: vi.fn((audio: Float32Array) => `{"partial":"${audio.length}"}`),
    setEndpointerMode: vi.fn(),
    delete: vi.fn(),
  };
  const model = { findWord: vi.fn(() => 7), delete: vi.fn() };
  return {
    model,
    recognizer,
    module: {
      EpMode,
      createModel: vi.fn(async () => model),
      createRecognizer: vi.fn(async () => recognizer),
      setLogLevel: vi.fn(),
    },
  };
};

const req = (id: number, handle: number, method: string, ...args: unknown[]): Request => ({ id, handle, method, args });

describe('dispatch', () => {
  it('returns created objects as handles and passes handles back as the objects', async () => {
    const { module, model } = fakeModule();
    const state = createWorkerState();

    const created = await dispatch(state, module, req(1, MODULE_HANDLE, 'createModel', 'url', 'path', 'id'));
    expect(created).toEqual({ id: 1, ok: true, value: { $handle: 1 } });
    expect(state.objects.get(1)).toBe(model);

    await dispatch(state, module, req(2, MODULE_HANDLE, 'createRecognizer', { $handle: 1 }, 16000));
    expect(module.createRecognizer).toHaveBeenCalledWith(model, 16000);
  });

  it('calls methods on objects by handle and returns plain values as is', async () => {
    const { module } = fakeModule();
    const state = createWorkerState();
    await dispatch(state, module, req(1, MODULE_HANDLE, 'createModel', 'url', 'path', 'id'));

    expect(await dispatch(state, module, req(2, 1, 'findWord', 'hello'))).toEqual({ id: 2, ok: true, value: 7 });
  });

  it('maps endpointer mode names to EpMode values', async () => {
    const { module, recognizer } = fakeModule();
    const state = createWorkerState();
    await dispatch(state, module, req(1, MODULE_HANDLE, 'createRecognizer', 'model', 16000));

    await dispatch(state, module, req(2, 1, 'setEndpointerMode', 'ANSWER_SHORT'));
    expect(recognizer.setEndpointerMode).toHaveBeenCalledWith(EpMode.ANSWER_SHORT);
  });

  it('forgets the handle of a deleted object', async () => {
    const { module, recognizer } = fakeModule();
    const state = createWorkerState();
    await dispatch(state, module, req(1, MODULE_HANDLE, 'createRecognizer', 'model', 16000));

    expect(await dispatch(state, module, req(2, 1, 'delete'))).toEqual({ id: 2, ok: true, value: undefined });
    expect(recognizer.delete).toHaveBeenCalled();
    expect(state.objects.has(1)).toBe(false);
  });

  it('calls the method before its first await, so calls apply in arrival order', () => {
    const { module, recognizer } = fakeModule();
    const state = createWorkerState();
    state.objects.set(1, recognizer);

    void dispatch(state, module, req(1, 1, 'acceptWaveform', new Float32Array(1)));
    void dispatch(state, module, req(2, 1, 'acceptWaveform', new Float32Array(2)));
    expect(recognizer.acceptWaveform.mock.calls.map(([audio]) => audio.length)).toEqual([1, 2]);
  });

  it.each([
    ['an unknown handle', req(1, 42, 'reset'), 'No object with handle 42'],
    ['an unknown method', req(1, MODULE_HANDLE, 'nope'), 'nope is not a function'],
    ['an unknown handle argument', req(1, MODULE_HANDLE, 'createRecognizer', { $handle: 9 }, 16000), 'No object with handle 9'],
  ])('returns an error for %s', async (_, request, error) => {
    const { module } = fakeModule();
    expect(await dispatch(createWorkerState(), module, request)).toEqual({ id: 1, ok: false, error });
  });

  it('returns thrown errors and rejected strings as error messages', async () => {
    const { module } = fakeModule();
    module.createModel.mockRejectedValueOnce('Unable to fetch model, status: 404');
    module.setLogLevel.mockImplementationOnce(() => {
      throw new Error('boom');
    });
    const state = createWorkerState();

    expect(await dispatch(state, module, req(1, MODULE_HANDLE, 'createModel'))).toEqual({
      id: 1,
      ok: false,
      error: 'Unable to fetch model, status: 404',
    });
    expect(await dispatch(state, module, req(2, MODULE_HANDLE, 'setLogLevel', 0))).toEqual({ id: 2, ok: false, error: 'boom' });
  });
});

describe('createClient', () => {
  it('posts requests with increasing ids and settles them by response id', async () => {
    const posted: Request[] = [];
    const client = createClient(r => posted.push(r));

    const first = client.call(MODULE_HANDLE, 'createModel', ['url']);
    const second = client.call(1, 'findWord', ['hi']);
    expect(posted).toEqual([req(0, MODULE_HANDLE, 'createModel', 'url'), req(1, 1, 'findWord', 'hi')]);

    client.receive({ id: 1, ok: false, error: 'bad word' });
    client.receive({ id: 0, ok: true, value: { $handle: 1 } });
    await expect(first).resolves.toEqual({ $handle: 1 });
    await expect(second).rejects.toThrow('bad word');
  });

  it('ignores responses to unknown ids', () => {
    const client = createClient(() => {});
    expect(() => client.receive({ id: 5, ok: true, value: 1 })).not.toThrow();
  });

  it('rejects pending and later calls once closed', async () => {
    const posted: Request[] = [];
    const client = createClient(r => posted.push(r));
    const pending = client.call(1, 'reset', []);

    client.close('Module was cleaned up');
    await expect(pending).rejects.toThrow('Module was cleaned up');
    await expect(client.call(1, 'reset', [])).rejects.toThrow('Module was cleaned up');
    expect(posted).toHaveLength(1);
  });

  it('rejects the call when posting fails', async () => {
    const client = createClient(() => {
      throw new Error('could not be cloned');
    });
    await expect(client.call(1, 'acceptWaveform', [])).rejects.toThrow('could not be cloned');
  });
});

describe('client and dispatch together', () => {
  it('round-trips calls through the worker state', async () => {
    const { module } = fakeModule();
    const state = createWorkerState();
    const client = createClient(r => void dispatch(state, module, r).then((res: Response) => client.receive(res)));

    const model = await client.call(MODULE_HANDLE, 'createModel', ['url', 'path', 'id']);
    const recognizer = await client.call(MODULE_HANDLE, 'createRecognizer', [model, 16000]);
    const handle = (recognizer as { $handle: number }).$handle;
    await expect(client.call(handle, 'acceptWaveform', [new Float32Array(3)])).resolves.toBe('{"partial":"3"}');
  });
});
