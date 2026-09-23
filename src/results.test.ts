import { describe, expect, it } from 'vitest';
import { classifyResult, handleOutcome } from './results.js';

// Records dispatched events, and optionally handles errors with preventDefault()
const target = ({ handleErrors = false } = {}) => {
  const events: { type: string; detail: unknown }[] = [];
  const t = new EventTarget();
  for (const type of ['partialResult', 'result', 'alternatives', 'nlsml', 'error']) {
    t.addEventListener(type, ev => {
      events.push({ type, detail: (ev as CustomEvent).detail });
      if (type === 'error' && handleErrors) ev.preventDefault();
    });
  }
  return { t, events };
};

describe('classifyResult', () => {
  it.each([
    ['a partial result', '{"partial":"one two"}', { type: 'partialResult', detail: { partial: 'one two' } }],
    ['a final result', '{"text":"one two"}', { type: 'result', detail: { text: 'one two' } }],
    ['alternatives', '{"alternatives" : [{"text": "", "confidence" : 1.0}] }', { type: 'alternatives', detail: [{ text: '', confidence: 1 }] }],
    ['an NLSML result', '<?xml version="1.0"?>\n<result/>', { type: 'nlsml', detail: '<?xml version="1.0"?>\n<result/>' }],
  ])('classifies %s', (_, text, expected) => {
    expect(classifyResult(text)).toEqual(expected);
  });
});

describe('handleOutcome', () => {
  it('dispatches partialResult with the parsed result and returns the JSON', () => {
    const { t, events } = target();
    expect(handleOutcome(t, { ok: true, json: '{"partial":"one"}' })).toBe('{"partial":"one"}');
    expect(events).toEqual([{ type: 'partialResult', detail: { partial: 'one' } }]);
  });

  it('dispatches result with the parsed result and returns the JSON', () => {
    const { t, events } = target();
    expect(handleOutcome(t, { ok: true, json: '{"text":"one"}' })).toBe('{"text":"one"}');
    expect(events).toEqual([{ type: 'result', detail: { text: 'one' } }]);
  });

  it('dispatches only alternatives for an n-best final result', () => {
    const { t, events } = target();
    handleOutcome(t, { ok: true, json: '{"alternatives":[{"text":"one","confidence":0.9}]}' });
    expect(events).toEqual([{ type: 'alternatives', detail: [{ text: 'one', confidence: 0.9 }] }]);
  });

  it('dispatches only nlsml for an NLSML final result', () => {
    const { t, events } = target();
    handleOutcome(t, { ok: true, json: '<result/>' });
    expect(events).toEqual([{ type: 'nlsml', detail: '<result/>' }]);
  });

  it('returns an empty string for an error handled with preventDefault()', () => {
    const { t, events } = target({ handleErrors: true });
    expect(handleOutcome(t, { ok: false, error: 'worker crashed' })).toBe('');
    expect(events).toEqual([{ type: 'error', detail: new Error('worker crashed') }]);
  });

  it('rethrows an error that no listener handled, after dispatching it', () => {
    const { t, events } = target();
    const error = new Error('boom');
    expect(() => handleOutcome(t, { ok: false, error })).toThrow(error);
    expect(events).toEqual([{ type: 'error', detail: error }]);
  });

  it('dispatches error for an empty result, which Vosk returns on failure, and returns it as is', () => {
    const { t, events } = target();
    expect(handleOutcome(t, { ok: true, json: '' })).toBe('');
    expect(events).toEqual([{ type: 'error', detail: new Error('Unable to recognize audio') }]);
  });

  it('makes the error event cancelable and the others not', () => {
    const cancelable: Record<string, boolean> = {};
    const t = new EventTarget();
    for (const type of ['result', 'error']) t.addEventListener(type, ev => (cancelable[type] = ev.cancelable));
    handleOutcome(t, { ok: true, json: '{"text":"one"}' });
    handleOutcome(t, { ok: true, json: '' });
    expect(cancelable).toEqual({ result: false, error: true });
  });
});
