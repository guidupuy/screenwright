import React from 'react';
import { Img, OffthreadVideo, staticFile, useCurrentFrame } from 'remotion';
import type { CursorTargetEvent, ActionEvent, NarrationEvent } from '../timeline/types.js';
import type { ValidatedTimeline } from '../timeline/schema.js';
import { CursorOverlay } from './CursorOverlay.js';
import { NarrationTrack } from './NarrationTrack.js';
import { precomputeCursorPaths } from './cursor-path.js';
import { findClosestFrame } from './frame-lookup.js';

interface Props {
  timeline: ValidatedTimeline;
}

export const DemoVideo: React.FC<Props> = ({ timeline }) => {
  const fps = 30;
  const frame = useCurrentFrame();
  const timeMs = (frame / fps) * 1000;

  const cursorEvents = precomputeCursorPaths(
    timeline.events.filter((e): e is CursorTargetEvent => e.type === 'cursor_target')
  );

  const clickEvents = timeline.events.filter(
    (e): e is ActionEvent => e.type === 'action' && e.action === 'click'
  );

  const narrations = timeline.events.filter(
    (e): e is NarrationEvent => e.type === 'narration'
  );

  const { frameManifest, videoFile } = timeline.metadata;

  let baseLayer: React.ReactNode;
  if (frameManifest && frameManifest.length > 0) {
    const entry = findClosestFrame(frameManifest, timeMs);
    baseLayer = <Img src={staticFile(entry.file)} />;
  } else if (videoFile) {
    baseLayer = <OffthreadVideo src={staticFile(videoFile)} />;
  } else {
    throw new Error('Timeline must have either frameManifest or videoFile');
  }

  return (
    <div
      style={{
        position: 'relative',
        width: timeline.metadata.viewport.width,
        height: timeline.metadata.viewport.height,
        overflow: 'hidden',
      }}
    >
      {/* Layer 1: Base from screenshots or video */}
      {baseLayer}

      {/* Layer 2: Cursor overlay */}
      <CursorOverlay cursorEvents={cursorEvents} clickEvents={clickEvents} fps={fps} />

      {/* Layer 3: Narration audio */}
      <NarrationTrack narrations={narrations} fps={fps} />
    </div>
  );
};
