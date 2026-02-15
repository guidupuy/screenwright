import React from 'react';
import { Img, OffthreadVideo, Sequence, staticFile, useCurrentFrame } from 'remotion';
import type { CursorTargetEvent, ActionEvent, NarrationEvent, SceneEvent } from '../timeline/types.js';
import type { ValidatedTimeline } from '../timeline/schema.js';
import type { BrandingConfig } from '../config/config-schema.js';
import { CursorOverlay } from './CursorOverlay.js';
import { NarrationTrack } from './NarrationTrack.js';
import { SceneSlide } from './SceneSlide.js';
import { precomputeCursorPaths } from './cursor-path.js';
import { findClosestFrame } from './frame-lookup.js';
import { resolveSlideScenes, sourceTimeMs, computeSlideSegments, remapEvents, msToFrames } from './time-remap.js';

interface Props {
  timeline: ValidatedTimeline;
  branding?: BrandingConfig;
}

export const DemoVideo: React.FC<Props> = ({ timeline, branding }) => {
  const fps = 30;
  const frame = useCurrentFrame();
  const outputTimeMs = (frame / fps) * 1000;

  const scenes = timeline.events.filter((e): e is SceneEvent => e.type === 'scene');
  const slideScenes = resolveSlideScenes(scenes);

  const timeMs = slideScenes.length > 0
    ? sourceTimeMs(outputTimeMs, slideScenes)
    : outputTimeMs;

  const eventsToUse = slideScenes.length > 0
    ? remapEvents(timeline.events, slideScenes)
    : timeline.events;

  const cursorEvents = precomputeCursorPaths(
    eventsToUse.filter((e): e is CursorTargetEvent => e.type === 'cursor_target')
  );

  const clickEvents = eventsToUse.filter(
    (e): e is ActionEvent => e.type === 'action' && e.action === 'click'
  );

  const narrations = eventsToUse.filter(
    (e): e is NarrationEvent => e.type === 'narration'
  );

  const { frameManifest, videoFile } = timeline.metadata;

  let baseLayer: React.ReactNode;
  if (frameManifest && frameManifest.length > 0) {
    const entry = findClosestFrame(frameManifest, timeMs);
    baseLayer = (
      <Img
        src={staticFile(entry.file)}
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
    );
  } else if (videoFile) {
    baseLayer = <OffthreadVideo src={staticFile(videoFile)} />;
  } else {
    throw new Error('Timeline must have either frameManifest or videoFile');
  }

  const slideSegments = computeSlideSegments(scenes);

  return (
    <div
      style={{
        position: 'relative',
        width: timeline.metadata.viewport.width,
        height: timeline.metadata.viewport.height,
        overflow: 'hidden',
      }}
    >
      {baseLayer}
      <CursorOverlay cursorEvents={cursorEvents} clickEvents={clickEvents} fps={fps} />
      <NarrationTrack narrations={narrations} fps={fps} />

      {slideSegments.map(seg => {
        const brandColor = seg.slideConfig.brandColor ?? branding?.brandColor ?? '#000000';
        const textColor = seg.slideConfig.textColor ?? branding?.textColor ?? '#FFFFFF';
        const fontFamily = seg.slideConfig.fontFamily ?? branding?.fontFamily;
        const titleFontSize = seg.slideConfig.titleFontSize;

        return (
          <Sequence
            key={`slide-${seg.slideStartMs}`}
            from={msToFrames(seg.slideStartMs, fps)}
            durationInFrames={msToFrames(seg.slideDurationMs, fps)}
          >
            <SceneSlide
              title={seg.sceneTitle}
              description={seg.sceneDescription}
              brandColor={brandColor}
              textColor={textColor}
              fontFamily={fontFamily}
              titleFontSize={titleFontSize}
              durationInFrames={msToFrames(seg.slideDurationMs, fps)}
              fps={fps}
            />
          </Sequence>
        );
      })}
    </div>
  );
};
