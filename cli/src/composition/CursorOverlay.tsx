import React from 'react';
import { useCurrentFrame } from 'remotion';
import type { ActionEvent } from '../timeline/types.js';
import { getCursorPosition, type CursorEventWithWaypoints } from './cursor-path.js';
import { interpolate } from 'remotion';

interface Props {
  cursorEvents: CursorEventWithWaypoints[];
  clickEvents: ActionEvent[];
  fps: number;
}

export const CursorOverlay: React.FC<Props> = ({ cursorEvents, clickEvents, fps }) => {
  const frame = useCurrentFrame();
  const timeMs = (frame / fps) * 1000;

  const { x, y } = getCursorPosition(cursorEvents, timeMs);

  // Click ripple effect
  const activeClick = clickEvents.find(
    e => timeMs >= e.timestampMs && timeMs <= e.timestampMs + 300
  );

  const rippleProgress = activeClick ? timeMs - activeClick.timestampMs : 0;

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {/* Cursor */}
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        style={{
          position: 'absolute',
          left: x - 4,
          top: y - 2,
          filter: 'drop-shadow(1px 1px 2px rgba(0,0,0,0.3))',
        }}
      >
        <path
          d="M5.5 3.21V20.8a.5.5 0 0 0 .85.36l4.86-4.86h6.18a.5.5 0 0 0 .36-.86L5.86 3.21a.5.5 0 0 0-.36.0z"
          fill="white"
          stroke="black"
          strokeWidth="1.5"
        />
      </svg>

      {/* Click ripple */}
      {activeClick && (
        <div
          style={{
            position: 'absolute',
            left: x - 20,
            top: y - 20,
            width: 40,
            height: 40,
            borderRadius: '50%',
            border: '2px solid rgba(59, 130, 246, 0.6)',
            opacity: interpolate(rippleProgress, [0, 300], [1, 0]),
            transform: `scale(${interpolate(rippleProgress, [0, 300], [0.5, 1.5])})`,
          }}
        />
      )}
    </div>
  );
};
