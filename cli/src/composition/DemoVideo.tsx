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
import {
  resolveSlideScenes,
  resolveTransitions,
  sourceTimeMs,
  computeOutputSegments,
  remapEvents,
} from './time-remap.js';

const IMG_STYLE = { width: '100%' as const, height: '100%' as const, display: 'block' as const };
const JITTER_MS = 50;

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
  const resolvedTransitions = resolveTransitions(timeline.events);

  const hasInsertions = slideScenes.length > 0 || resolvedTransitions.length > 0;

  const timeMs = hasInsertions
    ? sourceTimeMs(outputTimeMs, slideScenes, resolvedTransitions)
    : outputTimeMs;

  const eventsToUse = hasInsertions
    ? remapEvents(timeline.events, slideScenes, resolvedTransitions)
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

  const { slides: slideSegments, transitions: transitionSegments } =
    computeOutputSegments(scenes, resolvedTransitions);

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

  // Fallback: snap to nearest slide within 100ms jitter
  if (!activeSlide && slideSegments.length > 0) {
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

  // Check if current time is inside a transition segment
  const activeTransition = !activeSlide
    ? transitionSegments.find(t => outputTimeMs >= t.outputStartMs && outputTimeMs < t.outputEndMs)
    : null;

  let baseLayer: React.ReactNode;
  if (activeSlide) {
    baseLayer = <SceneSlide {...resolveSlideProps(activeSlide)} />;
  } else if (activeTransition && frameManifest && frameManifest.length > 0) {
    const progress = (outputTimeMs - activeTransition.outputStartMs) / activeTransition.durationMs;
    const { width: vw } = timeline.metadata.viewport;
    const styles = getTransitionStyles(activeTransition.transition, progress, vw);
    const faceClip = styles.container ? {} : { overflow: 'hidden' as const };

    // Resolve exit content (before the transition)
    const beforeSlide = slideSegments.find(
      s => Math.abs(s.slideEndMs - activeTransition.outputStartMs) < JITTER_MS
    );
    let exitContent: React.ReactNode;
    if (!activeTransition.hasContentBefore && !beforeSlide) {
      exitContent = undefined; // scenario start edge — backdrop
    } else if (beforeSlide) {
      exitContent = <SceneSlide {...resolveSlideProps(beforeSlide)} />;
    } else {
      const beforeEntry = findClosestFrame(frameManifest, activeTransition.beforeSourceMs);
      exitContent = <Img src={staticFile(beforeEntry.file)} style={IMG_STYLE} />;
    }

    // Resolve entrance content (after the transition)
    const afterSlide = slideSegments.find(
      s => Math.abs(s.slideStartMs - activeTransition.outputEndMs) < JITTER_MS
    );
    let entranceContent: React.ReactNode;
    if (!activeTransition.hasContentAfter && !afterSlide) {
      entranceContent = undefined; // scenario end edge — backdrop
    } else if (afterSlide) {
      entranceContent = <SceneSlide {...resolveSlideProps(afterSlide)} />;
    } else {
      const afterEntry = findClosestFrame(frameManifest, activeTransition.afterSourceMs);
      entranceContent = <Img src={staticFile(afterEntry.file)} style={IMG_STYLE} />;
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
    const backdropColor = styles.backdrop ?? branding?.brandColor ?? '#000000';
    baseLayer = (
      <>
        <div style={{ position: 'absolute', inset: 0, backgroundColor: backdropColor }} />
        {wrappedFaces}
      </>
    );
  } else if (frameManifest && frameManifest.length > 0) {
    const entry = findClosestFrame(frameManifest, timeMs);
    baseLayer = (
      <Img src={staticFile(entry.file)} style={IMG_STYLE} />
    );
  } else if (videoFile) {
    const transitionEvents = timeline.events.filter(
      (e): e is TransitionEvent => e.type === 'transition'
    );
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
      {!activeSlide && !activeTransition && (
        <CursorOverlay cursorEvents={cursorEvents} clickEvents={clickEvents} fps={fps} />
      )}
      <NarrationTrack narrations={narrations} fps={fps} />
    </div>
  );
};
