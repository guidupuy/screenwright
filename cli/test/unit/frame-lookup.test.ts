import { describe, it, expect } from 'vitest';
import { findClosestFrame } from '../../src/composition/frame-lookup.js';

const manifest = [
  { timestampMs: 0, file: 'frames/frame-000001.jpg' },
  { timestampMs: 500, file: 'frames/frame-000002.jpg' },
  { timestampMs: 1000, file: 'frames/frame-000003.jpg' },
  { timestampMs: 2000, file: 'frames/frame-000004.jpg' },
];

describe('findClosestFrame', () => {
  it('returns exact match', () => {
    expect(findClosestFrame(manifest, 500).file).toBe('frames/frame-000002.jpg');
  });

  it('returns first frame when timeMs is before all entries', () => {
    expect(findClosestFrame(manifest, -100).file).toBe('frames/frame-000001.jpg');
  });

  it('returns last frame when timeMs is after all entries', () => {
    expect(findClosestFrame(manifest, 9999).file).toBe('frames/frame-000004.jpg');
  });

  it('returns the frame just before timeMs when between entries', () => {
    expect(findClosestFrame(manifest, 750).file).toBe('frames/frame-000002.jpg');
    expect(findClosestFrame(manifest, 1500).file).toBe('frames/frame-000003.jpg');
  });

  it('works with a single entry', () => {
    const single = [{ timestampMs: 100, file: 'only.jpg' }];
    expect(findClosestFrame(single, 0).file).toBe('only.jpg');
    expect(findClosestFrame(single, 100).file).toBe('only.jpg');
    expect(findClosestFrame(single, 999).file).toBe('only.jpg');
  });

  it('throws on empty manifest', () => {
    expect(() => findClosestFrame([], 0)).toThrow('Empty frame manifest');
  });
});
