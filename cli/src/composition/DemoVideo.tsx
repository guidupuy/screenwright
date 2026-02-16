import React from 'react';
import { Img, OffthreadVideo, staticFile, useCurrentFrame } from 'remotion';
import type { CursorTargetEvent, ActionEvent, NarrationEvent, SceneEvent, TransitionEvent } from '../timeline/types.js';
import type { ValidatedTimeline } from '../timeline/schema.js';
import type { BrandingConfig } from '../config/config-schema.js';
import { CursorOverlay } from './CursorOverlay.js';
import { NarrationTrack } from './NarrationTrack.js';
import { SceneSlide } from './SceneSlide.js';
import { precomputeCursorPaths } from './cursor-path.js';
import { findClosestFrame } from './frame-lookup.js';
import { getTransitionStyles } from './transition-styles.js';
import { resolveSlideScenes, sourceTimeMs, computeSlideSegments, remapEvents } from './time-remap.js';

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

  const transitionEvents = eventsToUse.filter(
    (e): e is TransitionEvent => e.type === 'transition'
  );

  const clickEvents = eventsToUse.filter(
    (e): e is ActionEvent => e.type === 'action' && e.action === 'click'
  );

  const narrations = eventsToUse.filter(
    (e): e is NarrationEvent => e.type === 'narration'
  );

  const { frameManifest, videoFile } = timeline.metadata;

  const slideSegments = computeSlideSegments(scenes);

  function resolveSlideProps(seg: typeof slideSegments[number]) {
    return {
      title: seg.sceneTitle,
      description: seg.sceneDescription,
      brandColor: seg.slideConfig.brandColor ?? branding?.brandColor ?? '#000000',
      textColor: seg.slideConfig.textColor ?? branding?.textColor ?? '#FFFFFF',
      fontFamily: seg.slideConfig.fontFamily ?? branding?.fontFamily,
      titleFontSize: seg.slideConfig.titleFontSize,
    };
  }

  // Check if current time is inside a slide
  let activeSlide = slideSegments.find(
    s => outputTimeMs >= s.slideStartMs && outputTimeMs < s.slideEndMs
  );

  // Check if current time is inside a transition involving at least one slide
  let slideTransition: {
    transition: TransitionEvent;
    before: typeof slideSegments[number] | null;
    after: typeof slideSegments[number] | null;
  } | null = null;
  if (!activeSlide) {
    for (const t of transitionEvents) {
      if (outputTimeMs < t.timestampMs || outputTimeMs >= t.timestampMs + t.durationMs) continue;
      const tEnd = t.timestampMs + t.durationMs;
      const before = slideSegments.find(s => Math.abs(s.slideEndMs - t.timestampMs) < 50) ?? null;
      const after = slideSegments.find(s => Math.abs(s.slideStartMs - tEnd) < 50) ?? null;
      if (before || after) { slideTransition = { transition: t, before, after }; break; }
    }
  }

  // Fallback: if no exact match but slides exist, snap to the nearest slide.
  // Handles timing jitter gaps (e.g. first frame at t=0 when first slide starts at t=1).
  if (!activeSlide && !slideTransition && slideSegments.length > 0) {
    let best = slideSegments[0];
    let bestDist = Infinity;
    for (const s of slideSegments) {
      const dist = outputTimeMs < s.slideStartMs
        ? s.slideStartMs - outputTimeMs
        : outputTimeMs >= s.slideEndMs
          ? outputTimeMs - s.slideEndMs
          : 0;
      if (dist < bestDist) { bestDist = dist; best = s; }
    }
    if (bestDist < 100) activeSlide = best;
  }

  // Find active transition for frame-based content
  const activeTransition = !activeSlide && !slideTransition
    ? transitionEvents.find(t => outputTimeMs >= t.timestampMs && outputTimeMs < t.timestampMs + t.durationMs)
    : null;

  let baseLayer: React.ReactNode;
  if (activeSlide) {
    // Slide IS the base layer — no frame images
    baseLayer = <SceneSlide {...resolveSlideProps(activeSlide)} />;
  } else if (slideTransition) {
    // Transition involving at least one slide (slide↔slide, frame→slide, or slide→frame)
    const { transition: t, before, after } = slideTransition;
    const progress = (outputTimeMs - t.timestampMs) / t.durationMs;
    const { width: vw } = timeline.metadata.viewport;
    const styles = getTransitionStyles(t.transition, progress, vw);
    const faceClip = styles.container ? {} : { overflow: 'hidden' as const };
    const imgStyle = { width: '100%' as const, height: '100%' as const, display: 'block' as const };

    // Resolve entrance (new content arriving)
    let entranceContent: React.ReactNode;
    if (after) {
      entranceContent = <SceneSlide {...resolveSlideProps(after)} />;
    } else if (frameManifest && frameManifest.length > 0) {
      const afterEntry = findClosestFrame(frameManifest, timeMs);
      entranceContent = <Img src={staticFile(afterEntry.file)} style={imgStyle} />;
    }

    // Resolve exit (old content departing)
    let exitContent: React.ReactNode;
    if (before) {
      exitContent = <SceneSlide {...resolveSlideProps(before)} />;
    } else if (frameManifest && frameManifest.length > 0) {
      const beforeSourceTime = slideScenes.length > 0
        ? sourceTimeMs(t.timestampMs, slideScenes)
        : t.timestampMs;
      const beforeEntry = findClosestFrame(frameManifest, beforeSourceTime);
      exitContent = <Img src={staticFile(beforeEntry.file)} style={imgStyle} />;
    }

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
    const slideSide = after ?? before;
    const backdropColor = styles.backdrop
      ?? (slideSide ? resolveSlideProps(slideSide).brandColor : '#000000');
    baseLayer = (
      <>
        <div style={{ position: 'absolute', inset: 0, backgroundColor: backdropColor }} />
        {wrappedFaces}
      </>
    );
  } else if (activeTransition && frameManifest && frameManifest.length > 0) {
    const progress = (outputTimeMs - activeTransition.timestampMs) / activeTransition.durationMs;
    const styles = getTransitionStyles(activeTransition.transition, progress, timeline.metadata.viewport.width);
    const beforeSourceTime = slideScenes.length > 0
      ? sourceTimeMs(activeTransition.timestampMs, slideScenes)
      : activeTransition.timestampMs;
    const beforeEntry = findClosestFrame(frameManifest, beforeSourceTime);
    const afterEntry = findClosestFrame(frameManifest, timeMs);
    baseLayer = (
      <>
        <Img src={staticFile(afterEntry.file)} style={{ position: 'absolute', width: '100%', height: '100%', display: 'block', ...styles.entrance }} />
        <Img src={staticFile(beforeEntry.file)} style={{ position: 'absolute', width: '100%', height: '100%', display: 'block', ...styles.exit }} />
        {styles.exit2 && (
          <Img src={staticFile(beforeEntry.file)} style={{ position: 'absolute', width: '100%', height: '100%', display: 'block', ...styles.exit2 }} />
        )}
      </>
    );
  } else if (frameManifest && frameManifest.length > 0) {
    const entry = findClosestFrame(frameManifest, timeMs);
    baseLayer = (
      <Img src={staticFile(entry.file)} style={{ width: '100%', height: '100%', display: 'block' }} />
    );
  } else if (videoFile) {
    if (transitionEvents.length > 0 && frame === 0) {
      console.warn('sw.transition() effects require frame-based capture (captureMode: "frame"). Transitions will be ignored with video-based capture.');
    }
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
      {baseLayer}
      {!activeSlide && !slideTransition && (
        <CursorOverlay cursorEvents={cursorEvents} clickEvents={clickEvents} fps={fps} />
      )}
      <NarrationTrack narrations={narrations} fps={fps} />
    </div>
  );
};
