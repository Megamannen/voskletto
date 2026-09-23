import { describe, expect, it } from 'vitest';
import { needsModelFetch } from './modelCache.js';

describe('needsModelFetch', () => {
  it.each([
    ['nothing is cached', undefined, 'v1', true],
    ['the cached id differs', 'https://x/English?v0', 'v1', true],
    ['the cached entry has no id', 'https://x/English', 'v1', true],
    ['the cached id matches', 'https://x/English?v1', 'v1', false],
  ])('is %s -> %s', (_, cachedUrl, id, expected) => {
    expect(needsModelFetch(cachedUrl, id)).toBe(expected);
  });
});
