// Messages between the main-thread facade (voskletto-async) and the worker (voskletto-worker)

/** Handle of the module itself. Objects created in the worker get handles from 1 */
export const MODULE_HANDLE = 0;

/** A worker-side object, as referred to in messages */
export interface HandleRef {
  $handle: number;
}

export interface Request {
  id: number;
  handle: number;
  method: string;
  args: unknown[];
}

export type Response =
  | { id: number; ok: true; value: unknown }
  | { id: number; ok: false; error: string };

export type Ready = { ready: true } | { ready: false; error: string };

export const isHandleRef = (value: unknown): value is HandleRef =>
  typeof value === 'object' && value !== null && typeof (value as HandleRef).$handle === 'number';

export const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e));

// Methods whose result stays in the worker and is returned as a handle
const creators = new Set([
  'createModel',
  'createSpkModel',
  'createRecognizer',
  'createRecognizerWithSpkModel',
  'createRecognizerWithGrm',
]);

export interface WorkerState {
  objects: Map<number, object>;
  nextHandle: number;
}

export const createWorkerState = (): WorkerState => ({ objects: new Map(), nextHandle: MODULE_HANDLE + 1 });

export interface DispatchModule {
  EpMode: Record<string, unknown>;
}

type Callable = Record<string, unknown>;

const lookup = (state: WorkerState, handle: number): object => {
  const obj = state.objects.get(handle);
  if (obj === undefined) throw new Error(`No object with handle ${handle}`);
  return obj;
};

const register = (state: WorkerState, obj: object): HandleRef => {
  const handle = state.nextHandle++;
  state.objects.set(handle, obj);
  return { $handle: handle };
};

/**
 * Runs a request against the module or one of its objects. The method is called before the first
 * await, so requests are applied in the order they arrive.
 */
export const dispatch = async (state: WorkerState, module: DispatchModule, req: Request): Promise<Response> => {
  try {
    const target = (req.handle === MODULE_HANDLE ? module : lookup(state, req.handle)) as Callable;
    const fn = target[req.method];
    if (typeof fn !== 'function') throw new Error(`${req.method} is not a function`);
    const args = req.args.map(arg => (isHandleRef(arg) ? lookup(state, arg.$handle) : arg));

    // EpMode values are Embind objects that can't be posted, so their names are sent instead
    if (req.method === 'setEndpointerMode') args[0] = module.EpMode[args[0] as string];
    const value: unknown = await fn.apply(target, args);
    if (req.method === 'delete') state.objects.delete(req.handle);
    return { id: req.id, ok: true, value: creators.has(req.method) ? register(state, value as object) : value };
  } catch (e) {
    return { id: req.id, ok: false, error: errorMessage(e) };
  }
};

export interface Client {
  call(handle: number, method: string, args: unknown[]): Promise<unknown>;
  receive(res: Response): void;

  /** Rejects pending and later calls with `reason` */
  close(reason: string): void;
}

export const createClient = (post: (req: Request) => void): Client => {
  const pending = new Map<number, { resolve(value: unknown): void; reject(e: Error): void }>();
  let nextId = 0;
  let closedReason: string | undefined;
  return {
    call: (handle, method, args) =>
      new Promise((resolve, reject) => {
        if (closedReason !== undefined) throw new Error(closedReason);
        const id = nextId++;
        post({ id, handle, method, args });
        pending.set(id, { resolve, reject });
      }),
    receive: res => {
      const p = pending.get(res.id);
      if (p === undefined) return;
      pending.delete(res.id);
      if (res.ok) p.resolve(res.value);
      else p.reject(new Error(res.error));
    },
    close: reason => {
      closedReason = reason;
      for (const p of pending.values()) p.reject(new Error(reason));
      pending.clear();
    },
  };
};
