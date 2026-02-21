import React from 'react';
import { Img, staticFile, useCurrentFrame } from 'remotion';
import type { CursorTargetEvent, ActionEvent, NarrationEvent, SceneEvent } from '../timeline/types.js';
import type { ValidatedTimeline } from '../timeline/schema.js';
import type { BrandingConfig } from '../config/config-schema.js';
import { CursorOverlay } from './CursorOverlay.js';
import { NarrationTrack } from './NarrationTrack.js';
import { precomputeCursorPaths } from './cursor-path.js';
import { getTransitionStyles } from './transition-styles.js';
import { resolveOutputFrame, remapEventsForOutput } from './frame-resolve.js';

const IMG_STYLE = { width: '100%' as const, height: '100%' as const, display: 'block' as const };

interface Props {
  timeline: ValidatedTimeline;
  branding?: BrandingConfig;
}

export const DemoVideo: React.FC<Props> = ({ timeline, branding }) => {
  const fps = 30;
  const frame = useCurrentFrame();
  const { frameManifest, transitionMarkers, viewport } = timeline.metadata;

  const resolution = resolveOutputFrame(frame, frameManifest, transitionMarkers);

  const remappedEvents = remapEventsForOutput(timeline.events, frameManifest, transitionMarkers);

  const cursorEvents = precomputeCursorPaths(
    remappedEvents.filter((e): e is CursorTargetEvent => e.type === 'cursor_target')
  );

  const clickEvents = remappedEvents.filter(
    (e): e is ActionEvent => e.type === 'action' && e.action === 'click'
  );

  const narrations = remappedEvents.filter(
    (e): e is NarrationEvent => e.type === 'narration'
  );

  const rawCursorTargets = remappedEvents.filter(
    (e): e is CursorTargetEvent => e.type === 'cursor_target'
  );

  const slideScenes = remappedEvents.filter(
    (e): e is SceneEvent => e.type === 'scene' && !!e.slide
  );

  let baseLayer: React.ReactNode;
  if (resolution.type === 'transition') {
    const styles = getTransitionStyles(resolution.transition, resolution.progress, viewport.width);
    const faceClip = styles.container ? {} : { overflow: 'hidden' as const };
    const backdropColor = styles.backdrop ?? branding?.brandColor ?? '#000000';

    const exitContent = <Img src={staticFile(resolution.beforeFile)} style={IMG_STYLE} />;
    const entranceContent = <Img src={staticFile(resolution.afterFile)} style={IMG_STYLE} />;

    const faces = (
      <>
        <div style={{ position: 'absolute', inset: 0, ...faceClip, ...styles.entrance }}>
          {entranceContent}
        </div>
        <div style={{ position: 'absolute', inset: 0, ...faceClip, ...styles.exit }}>
          {exitContent}
        </div>
        {styles.exit2 && (
          <div style={{ position: 'absolute', inset: 0, ...faceClip, ...styles.exit2 }}>
            {exitContent}
          </div>
        )}
      </>
    );
    let wrappedFaces: React.ReactNode = faces;
    if (styles.container) {
      wrappedFaces = <div style={{ position: 'absolute', inset: 0, ...styles.container }}>{faces}</div>;
    }
    if (styles.perspective) {
      wrappedFaces = <div style={{ position: 'absolute', inset: 0, perspective: styles.perspective }}>{wrappedFaces}</div>;
    }

    baseLayer = (
      <>
        <div style={{ position: 'absolute', inset: 0, backgroundColor: backdropColor }} />
        {wrappedFaces}
      </>
    );
  } else {
    baseLayer = <Img src={staticFile(resolution.file)} style={IMG_STYLE} />;
  }

  const currentTimeMs = (frame / fps) * 1000;
  // Hide the cursor from each slide's start until the next cursor_target
  // event — this covers the full slide display including deferred overlay
  // removal, without relying on duration arithmetic.
  const duringSlide = slideScenes.some(s => {
    if (currentTimeMs < s.timestampMs) return false;
    const nextCursor = rawCursorTargets.find(c => c.timestampMs > s.timestampMs);
    return currentTimeMs < (nextCursor ? nextCursor.timestampMs : Infinity);
  });
  const showCursor = resolution.type !== 'transition' && !duringSlide;

  return (
    <div
      style={{
        position: 'relative',
        width: viewport.width,
        height: viewport.height,
        overflow: 'hidden',
      }}
    >
      {baseLayer}
      {showCursor && (
        <CursorOverlay cursorEvents={cursorEvents} clickEvents={clickEvents} fps={fps} />
      )}
      <NarrationTrack narrations={narrations} fps={fps} />
    </div>
  );
};
