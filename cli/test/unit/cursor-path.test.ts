import { describe, it, expect } from 'vitest';
import { computeWaypoints, precomputeCursorPaths, getCursorPosition } from '../../src/composition/cursor-path.js';
import type { CursorTargetEvent } from '../../src/timeline/types.js';

describe('computeWaypoints', () => {
  it('starts at from and ends at to', () => {
    const waypoints = computeWaypoints({ x: 100, y: 200 }, { x: 500, y: 400 });
    expect(waypoints[0].x).toBeCloseTo(100, 0);
    expect(waypoints[0].y).toBeCloseTo(200, 0);
    const last = waypoints[waypoints.length - 1];
    expect(last.x).toBeCloseTo(500, 0);
    expect(last.y).toBeCloseTo(400, 0);
  });

  it('produces more than 2 waypoints', () => {
    const waypoints = computeWaypoints({ x: 0, y: 0 }, { x: 100, y: 100 });
    expect(waypoints.length).toBeGreaterThan(2);
  });

  it('contains no NaN values', () => {
    const waypoints = computeWaypoints({ x: 0, y: 0 }, { x: 1000, y: 500 });
    for (const wp of waypoints) {
      expect(Number.isNaN(wp.x)).toBe(false);
      expect(Number.isNaN(wp.y)).toBe(false);
      expect(Number.isNaN(wp.t)).toBe(false);
    }
  });

  it('t values range from 0 to 1', () => {
    const waypoints = computeWaypoints({ x: 50, y: 50 }, { x: 300, y: 700 });
    expect(waypoints[0].t).toBe(0);
    expect(waypoints[waypoints.length - 1].t).toBe(1);
  });

  it('handles same from and to (zero distance)', () => {
    const waypoints = computeWaypoints({ x: 100, y: 100 }, { x: 100, y: 100 });
    expect(waypoints.length).toBeGreaterThan(0);
    for (const wp of waypoints) {
      expect(Number.isNaN(wp.x)).toBe(false);
      expect(Number.isNaN(wp.y)).toBe(false);
    }
  });

  it('respects custom step count', () => {
    const waypoints = computeWaypoints({ x: 0, y: 0 }, { x: 100, y: 100 }, 10);
    expect(waypoints).toHaveLength(11); // 0..10 inclusive
  });

  it('is deterministic — same input always produces same waypoints', () => {
    const from = { x: 100, y: 200 };
    const to = { x: 500, y: 400 };
    const a = computeWaypoints(from, to);
    const b = computeWaypoints(from, to);
    expect(a).toEqual(b);
  });

  it('produces a clean arc (no S-curve)', () => {
    const waypoints = computeWaypoints({ x: 0, y: 0 }, { x: 400, y: 0 }, 40);
    // All mid-waypoint y-values should be on the same side of the line
    const midYs = waypoints.slice(1, -1).map(w => w.y);
    const allNonNeg = midYs.every(y => y >= -0.001);
    const allNonPos = midYs.every(y => y <= 0.001);
    expect(allNonNeg || allNonPos).toBe(true);
  });
});

describe('precomputeCursorPaths', () => {
  it('adds waypoints to each event', () => {
    const events: CursorTargetEvent[] = [
      { type: 'cursor_target', id: 'ev-1', timestampMs: 0, fromX: 0, fromY: 0, toX: 100, toY: 100, moveDurationMs: 500, easing: 'bezier' },
      { type: 'cursor_target', id: 'ev-2', timestampMs: 500, fromX: 100, fromY: 100, toX: 300, toY: 200, moveDurationMs: 800, easing: 'bezier' },
    ];

    const result = precomputeCursorPaths(events);
    expect(result).toHaveLength(2);
    expect(result[0].waypoints.length).toBeGreaterThan(2);
    expect(result[1].waypoints.length).toBeGreaterThan(2);
  });
});

describe('getCursorPosition', () => {
  it('returns position during active movement', () => {
    const events: CursorTargetEvent[] = [
      { type: 'cursor_target', id: 'ev-1', timestampMs: 0, fromX: 0, fromY: 0, toX: 200, toY: 200, moveDurationMs: 1000, easing: 'bezier' },
    ];
    const withWaypoints = precomputeCursorPaths(events);

    const pos = getCursorPosition(withWaypoints, 500);
    // Should be roughly halfway
    expect(pos.x).toBeGreaterThan(0);
    expect(pos.x).toBeLessThan(200);
  });

  it('holds at last position after movement completes', () => {
    const events: CursorTargetEvent[] = [
      { type: 'cursor_target', id: 'ev-1', timestampMs: 0, fromX: 0, fromY: 0, toX: 200, toY: 200, moveDurationMs: 500, easing: 'bezier' },
    ];
    const withWaypoints = precomputeCursorPaths(events);

    const pos = getCursorPosition(withWaypoints, 1000);
    expect(pos.x).toBe(200);
    expect(pos.y).toBe(200);
  });

  it('returns default center with no events', () => {
    const pos = getCursorPosition([], 500);
    expect(pos.x).toBe(640);
    expect(pos.y).toBe(360);
  });
});
