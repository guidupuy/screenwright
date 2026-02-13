import type { CursorTargetEvent } from '../timeline/types.js';

interface Point {
  x: number;
  y: number;
}

/**
 * Generate bezier control points for natural cursor movement.
 * Produces a slightly curved path with randomized control points
 * to avoid perfectly straight lines.
 */
function bezierControlPoints(from: Point, to: Point): [Point, Point] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;

  // Perpendicular offset for curve (5-15% of distance)
  const dist = Math.sqrt(dx * dx + dy * dy);
  const offset = dist * (0.05 + Math.random() * 0.1);

  // Normal vector
  const nx = -dy / (dist || 1);
  const ny = dx / (dist || 1);

  // Place control points at 1/3 and 2/3 along the path with perpendicular offset
  const sign = Math.random() > 0.5 ? 1 : -1;
  return [
    { x: from.x + dx * 0.33 + nx * offset * sign, y: from.y + dy * 0.33 + ny * offset * sign },
    { x: from.x + dx * 0.66 - nx * offset * sign * 0.5, y: from.y + dy * 0.66 - ny * offset * sign * 0.5 },
  ];
}

/**
 * Evaluate cubic bezier at parameter t (0..1).
 */
function cubicBezier(t: number, p0: number, p1: number, p2: number, p3: number): number {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

export interface CursorWaypoint {
  x: number;
  y: number;
  t: number; // normalized 0..1
}

/**
 * Pre-compute waypoints along a bezier curve for a cursor movement event.
 * Returns N waypoints (default 20) for smooth interpolation.
 */
export function computeWaypoints(from: Point, to: Point, steps = 20): CursorWaypoint[] {
  const [cp1, cp2] = bezierControlPoints(from, to);
  const waypoints: CursorWaypoint[] = [];

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    waypoints.push({
      x: cubicBezier(t, from.x, cp1.x, cp2.x, to.x),
      y: cubicBezier(t, from.y, cp1.y, cp2.y, to.y),
      t,
    });
  }

  return waypoints;
}

export interface CursorEventWithWaypoints extends CursorTargetEvent {
  waypoints: CursorWaypoint[];
}

/**
 * Pre-compute waypoints for all cursor events in a timeline.
 * Called once before rendering — Remotion components index into
 * the waypoints array by progress.
 */
export function precomputeCursorPaths(events: CursorTargetEvent[]): CursorEventWithWaypoints[] {
  return events.map(event => ({
    ...event,
    waypoints: computeWaypoints(
      { x: event.fromX, y: event.fromY },
      { x: event.toX, y: event.toY },
    ),
  }));
}

/**
 * Find cursor position at a given time in milliseconds.
 * Searches through cursor events with precomputed waypoints.
 */
export function getCursorPosition(
  events: CursorEventWithWaypoints[],
  timeMs: number,
): Point {
  // Find active movement
  const active = events.find(
    e => timeMs >= e.timestampMs && timeMs <= e.timestampMs + e.moveDurationMs
  );

  if (active) {
    const progress = (timeMs - active.timestampMs) / active.moveDurationMs;
    const idx = Math.min(
      active.waypoints.length - 1,
      Math.floor(progress * (active.waypoints.length - 1))
    );
    return active.waypoints[idx];
  }

  // Hold at last known position
  const past = events.filter(e => e.timestampMs + e.moveDurationMs <= timeMs);
  const last = past[past.length - 1];
  if (last) {
    return { x: last.toX, y: last.toY };
  }

  // Default: center of viewport
  return { x: 640, y: 360 };
}
