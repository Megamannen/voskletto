// Turns acceptWaveform outcomes into a recognizer's result and error events

import type { RecognizerEventMap } from './voskletto.js';

export type Outcome = { ok: true; json: string } | { ok: false; error: unknown };

type ResultDetails = { [K in Exclude<keyof RecognizerEventMap, 'error'>]: RecognizerEventMap[K]['detail'] };

/** A result event's type with its detail */
export type ResultEvent = { [K in keyof ResultDetails]: { type: K; detail: ResultDetails[K] } }[keyof ResultDetails];

/** Partial results are always JSON. Final results are NLSML (XML) when enabled with alternatives */
export const classifyResult = (text: string): ResultEvent => {
  if (text.startsWith('<')) return { type: 'nlsml', detail: text };
  const json = JSON.parse(text);
  if ('partial' in json) return { type: 'partialResult', detail: json };
  // Quoted: this is bundled into voskletto.js, where Closure would rename the property of the parsed JSON
  if ('alternatives' in json) return { type: 'alternatives', detail: json['alternatives'] };
  return { type: 'result', detail: json };
};

const toError = (e: unknown) => (e instanceof Error ? e : new Error(String(e)));

/**
 * Dispatches the matching event and returns what acceptWaveform should return. Vosk signals a failed
 * recognition with an empty result. An error listener that calls preventDefault() handles the error,
 * so '' is returned instead of throwing.
 */
export const handleOutcome = (target: EventTarget, outcome: Outcome): string => {
  if (!outcome.ok || outcome.json === '') {
    const error = outcome.ok ? new Error('Unable to recognize audio') : toError(outcome.error);
    const handled = !target.dispatchEvent(new CustomEvent('error', { detail: error, cancelable: true }));
    if (handled || outcome.ok) return '';
    throw outcome.error;
  }
  const { type, detail } = classifyResult(outcome.json);
  target.dispatchEvent(new CustomEvent(type, { detail }));
  return outcome.json;
};
