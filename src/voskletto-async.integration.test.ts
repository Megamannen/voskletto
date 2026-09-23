// Runs the built voskletto-async.js + voskletto-worker.js + voskletto.js/.wasm in headless Chromium.
// Requires `src/make` to have run and VOSK_MODEL to point at a model .tar.gz, e.g.
//   VOSK_MODEL=path/to/vosk-model-small-en-us-0.15.tar.gz npm run test:integration
// Set CHROMIUM_PATH to use a system Chromium instead of Playwright's own.

import { createReadStream } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, resolve } from 'node:path';
import { chromium, type Browser } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const modelPath = process.env.VOSK_MODEL;
const types: Record<string, string> = { '.js': 'text/javascript', '.wasm': 'application/wasm', '.html': 'text/html' };

// Everything the page loads, with the headers voskletto needs for SharedArrayBuffer
const files: Record<string, string> = {
  '/index.html': join(root, 'src/integration.html'),
  '/voskletto-async.js': join(root, 'voskletto-async.js'),
  '/voskletto-worker.js': join(root, 'voskletto-worker.js'),
  '/voskletto.js': join(root, 'voskletto.js'),
  '/voskletto.wasm': join(root, 'voskletto.wasm'),
  '/test.wav': join(root, 'vosk/python/example/test.wav'),
  '/model.tar.gz': modelPath ?? '',
};

const serve = () =>
  new Promise<Server>(done => {
    const server = createServer((req, res) => {
      const file = files[new URL(req.url ?? '/', 'http://x').pathname];
      if (!file) return res.writeHead(404).end();
      res.writeHead(200, {
        'Content-Type': types[extname(file)] ?? 'application/octet-stream',
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cross-Origin-Opener-Policy': 'same-origin',
      });
      createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => done(server));
  });

describe.skipIf(!modelPath)('voskletto-async in Chromium', () => {
  let server: Server;
  let browser: Browser;
  let origin: string;

  beforeAll(async () => {
    server = await serve();
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
  });
  afterAll(async () => {
    await browser?.close();
    server?.close();
  });

  it('recognizes the same audio in two async modules at once and in the sync module, with events', async () => {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${origin}/index.html`);

    const result = await page.evaluate(() => window.runIntegration());

    expect(errors).toEqual([]);
    expect(result.crossOriginIsolated).toBe(true);
    const [first, second] = result.async;
    expect(first.text).toContain('zero');
    expect(second.text).toBe(first.text);
    expect(result.sync.text).toBe(first.text);
    for (const run of [first, second, result.sync]) {
      expect(run.finals.length).toBeGreaterThan(0);
      expect(run.eventFinals).toEqual(run.finals);
      expect(run.eventPartials).toBeGreaterThan(0);
    }
    expect(result.afterCleanUp).toBe('Module was cleaned up');
    expect(result.nbest.result).toBe(0);
    expect(result.nbest.alternatives).toBe(first.finals.length);
    expect(result.nbest.firstText).toBe(first.finals[0]);
    expect(result.errorAfterCleanUp).toEqual({ returned: '', error: 'Module was cleaned up', unhandled: 'Module was cleaned up' });
  }, 180_000);
});

interface Run {
  text: string;
  finals: string[];
  eventFinals: string[];
  eventPartials: number;
}

declare global {
  interface Window {
    runIntegration(): Promise<{
      crossOriginIsolated: boolean;
      async: Run[];
      sync: Run;
      afterCleanUp: string;
      nbest: { result: number; alternatives: number; firstText: string };
      errorAfterCleanUp: { returned: string; error: string; unhandled: string };
    }>;
  }
}
