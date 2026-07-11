import { describe, it, expect } from 'vitest';
import { buildFilename, splitClusters } from './noteImage.js';
import { BREAK_TILE } from './tiles.js';

describe('buildFilename', () => {
  it('builds a safe per-round filename', () => {
    expect(buildFilename('4821', 3)).toBe('quipnotes-round-3-4821.png');
  });

  it('strips unsafe characters from the code and defaults round to 0', () => {
    expect(buildFilename('a b/c', undefined)).toBe('quipnotes-round-0-abc.png');
  });

  it('falls back to "game" when the code is empty', () => {
    expect(buildFilename('', 1)).toBe('quipnotes-round-1-game.png');
  });
});

describe('splitClusters', () => {
  it('parses tile words and drops the id prefix', () => {
    expect(splitClusters(['42|banana', '57|banana'])).toEqual([
      ['banana', 'banana'],
    ]);
  });

  it('splits on break tokens into separate clusters', () => {
    const tokens = ['1|the', '2|cat', BREAK_TILE, '3|sat'];
    expect(splitClusters(tokens)).toEqual([['the', 'cat'], ['sat']]);
  });

  it('ignores leading, trailing, and doubled breaks', () => {
    const tokens = [BREAK_TILE, '1|a', BREAK_TILE, BREAK_TILE, '2|b', BREAK_TILE];
    expect(splitClusters(tokens)).toEqual([['a'], ['b']]);
  });

  it('returns an empty list for no tokens', () => {
    expect(splitClusters([])).toEqual([]);
    expect(splitClusters(undefined)).toEqual([]);
  });
});
