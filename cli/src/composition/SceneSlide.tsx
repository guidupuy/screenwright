import React, { useEffect, useState } from 'react';
import { delayRender, continueRender, useCurrentFrame, interpolate, spring } from 'remotion';
import type { SlideAnimation } from '../timeline/types.js';

/* Minimal DOM types — this file only runs in Remotion's browser context. */
declare const document: {
  createElement(tag: string): HTMLLinkElement;
  head: { appendChild(el: unknown): void; removeChild(el: unknown): void };
  fonts: { ready: Promise<void>; check(font: string): boolean };
};

interface HTMLLinkElement {
  rel: string;
  href: string;
  onload: (() => void) | null;
  onerror: (() => void) | null;
}

interface Props {
  title: string;
  description?: string;
  brandColor: string;
  textColor: string;
  fontFamily?: string;
  titleFontSize?: number;
  animation?: SlideAnimation;
  durationInFrames: number;
  fps: number;
}

export interface AnimationValues {
  bgOpacity: number;
  contentOpacity: number;
  contentScale: number;
  translateX: number;
  translateY: number;
  clipPath?: string;
  titleOpacity?: number;
  titleTranslateY?: number;
  descOpacity?: number;
  descTranslateY?: number;
}

type AnimationStrategy = (
  frame: number,
  durationInFrames: number,
  fps: number,
  animFrames: number,
) => AnimationValues;

function fadeAnimation(frame: number, durationInFrames: number, fps: number, animFrames: number): AnimationValues {
  const inProgress = spring({ frame, fps, config: { damping: 12 }, durationInFrames: animFrames });
  const inOpacity = interpolate(frame, [0, animFrames], [0, 1], { extrapolateRight: 'clamp' });
  const outStart = durationInFrames - animFrames;
  const outOpacity = interpolate(frame, [outStart, durationInFrames], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const outScale = interpolate(frame, [outStart, durationInFrames], [1, 0.95], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const isIn = frame < animFrames;
  const isOut = frame >= outStart;

  return {
    bgOpacity: isOut ? outOpacity : inOpacity,
    contentOpacity: isOut ? outOpacity : inOpacity,
    contentScale: isIn ? interpolate(inProgress, [0, 1], [0.85, 1]) : isOut ? outScale : 1,
    translateX: 0,
    translateY: isIn ? interpolate(inProgress, [0, 1], [20, 0]) : 0,
  };
}

function slideUpAnimation(frame: number, durationInFrames: number, fps: number, animFrames: number): AnimationValues {
  const inProgress = spring({ frame, fps, config: { damping: 14 }, durationInFrames: animFrames });
  const inOpacity = interpolate(frame, [0, animFrames], [0, 1], { extrapolateRight: 'clamp' });
  const outStart = durationInFrames - animFrames;
  const outOpacity = interpolate(frame, [outStart, durationInFrames], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const isIn = frame < animFrames;
  const isOut = frame >= outStart;

  return {
    bgOpacity: isOut ? outOpacity : inOpacity,
    contentOpacity: isOut ? outOpacity : inOpacity,
    contentScale: 1,
    translateX: 0,
    translateY: isIn
      ? interpolate(inProgress, [0, 1], [800, 0])
      : isOut
        ? interpolate(frame, [outStart, durationInFrames], [0, 200], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
        : 0,
  };
}

function slideLeftAnimation(frame: number, durationInFrames: number, fps: number, animFrames: number): AnimationValues {
  const inProgress = spring({ frame, fps, config: { damping: 14 }, durationInFrames: animFrames });
  const inOpacity = interpolate(frame, [0, animFrames], [0, 1], { extrapolateRight: 'clamp' });
  const outStart = durationInFrames - animFrames;
  const outOpacity = interpolate(frame, [outStart, durationInFrames], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const isIn = frame < animFrames;
  const isOut = frame >= outStart;

  return {
    bgOpacity: isOut ? outOpacity : inOpacity,
    contentOpacity: isOut ? outOpacity : inOpacity,
    contentScale: 1,
    translateX: isIn
      ? interpolate(inProgress, [0, 1], [1280, 0])
      : isOut
        ? interpolate(frame, [outStart, durationInFrames], [0, -1280], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
        : 0,
    translateY: 0,
  };
}

function zoomAnimation(frame: number, durationInFrames: number, fps: number, animFrames: number): AnimationValues {
  const inProgress = spring({ frame, fps, config: { damping: 10 }, durationInFrames: animFrames });
  const inOpacity = interpolate(frame, [0, animFrames], [0, 1], { extrapolateRight: 'clamp' });
  const outStart = durationInFrames - animFrames;
  const outOpacity = interpolate(frame, [outStart, durationInFrames], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const outScale = interpolate(frame, [outStart, durationInFrames], [1, 1.5], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const isIn = frame < animFrames;
  const isOut = frame >= outStart;

  return {
    bgOpacity: isOut ? outOpacity : inOpacity,
    contentOpacity: isOut ? outOpacity : inOpacity,
    contentScale: isIn ? interpolate(inProgress, [0, 1], [0.3, 1]) : isOut ? outScale : 1,
    translateX: 0,
    translateY: 0,
  };
}

function cinematicAnimation(frame: number, durationInFrames: number, fps: number, animFrames: number): AnimationValues {
  const bgInOpacity = interpolate(frame, [0, animFrames], [0, 1], { extrapolateRight: 'clamp' });
  const titleProgress = spring({ frame, fps, config: { damping: 8, mass: 1.2 }, durationInFrames: animFrames });
  const descDelay = Math.round(animFrames * 0.5);
  const descFrame = Math.max(0, frame - descDelay);
  const descProgress = spring({ frame: descFrame, fps, config: { damping: 12 }, durationInFrames: animFrames });

  const outStart = durationInFrames - animFrames;
  const outOpacity = interpolate(frame, [outStart, durationInFrames], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const isOut = frame >= outStart;

  return {
    bgOpacity: isOut ? outOpacity : bgInOpacity,
    contentOpacity: 1,
    contentScale: 1,
    translateX: 0,
    translateY: 0,
    titleOpacity: isOut ? outOpacity : interpolate(titleProgress, [0, 1], [0, 1]),
    titleTranslateY: isOut ? 0 : interpolate(titleProgress, [0, 1], [-60, 0]),
    descOpacity: isOut ? outOpacity : interpolate(descProgress, [0, 1], [0, 1]),
    descTranslateY: isOut ? 0 : interpolate(descProgress, [0, 1], [40, 0]),
  };
}

function popAnimation(frame: number, durationInFrames: number, fps: number, animFrames: number): AnimationValues {
  const inProgress = spring({ frame, fps, config: { damping: 6, stiffness: 200 }, durationInFrames: animFrames });
  const inOpacity = interpolate(frame, [0, animFrames], [0, 1], { extrapolateRight: 'clamp' });
  const outStart = durationInFrames - animFrames;
  const outProgress = spring({ frame: Math.max(0, frame - outStart), fps, config: { damping: 10 }, durationInFrames: animFrames });
  const outOpacity = interpolate(frame, [outStart, durationInFrames], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const isIn = frame < animFrames;
  const isOut = frame >= outStart;

  return {
    bgOpacity: isOut ? outOpacity : inOpacity,
    contentOpacity: isOut ? outOpacity : inOpacity,
    contentScale: isIn
      ? interpolate(inProgress, [0, 1], [0, 1])
      : isOut
        ? interpolate(outProgress, [0, 1], [1, 0.8])
        : 1,
    translateX: 0,
    translateY: 0,
  };
}

function wipeAnimation(frame: number, durationInFrames: number, _fps: number, animFrames: number): AnimationValues {
  const wipeIn = interpolate(frame, [0, animFrames], [100, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const contentFadeIn = interpolate(frame, [animFrames * 0.5, animFrames], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const outStart = durationInFrames - animFrames;
  const wipeOut = interpolate(frame, [outStart, durationInFrames], [0, 100], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const contentFadeOut = interpolate(frame, [outStart, outStart + animFrames * 0.5], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const isOut = frame >= outStart;

  return {
    bgOpacity: 1,
    contentOpacity: isOut ? contentFadeOut : contentFadeIn,
    contentScale: 1,
    translateX: 0,
    translateY: 0,
    clipPath: `inset(0 ${isOut ? wipeOut : wipeIn}% 0 0)`,
  };
}

export const animationStrategies: Record<SlideAnimation, AnimationStrategy> = {
  'fade': fadeAnimation,
  'slide-up': slideUpAnimation,
  'slide-left': slideLeftAnimation,
  'zoom': zoomAnimation,
  'cinematic': cinematicAnimation,
  'pop': popAnimation,
  'wipe': wipeAnimation,
};

const SYSTEM_FONTS = 'system-ui, -apple-system, sans-serif';
const FONT_TIMEOUT_MS = 5000;
const ANIM_FRAMES = 12;

export const SceneSlide: React.FC<Props> = ({
  title,
  description,
  brandColor,
  textColor,
  fontFamily,
  titleFontSize = 64,
  animation = 'fade',
  durationInFrames,
  fps,
}) => {
  const frame = useCurrentFrame();
  const [handle] = useState(() => fontFamily ? delayRender('Loading font') : null);

  useEffect(() => {
    if (!fontFamily || !handle) return;

    // Skip network fetch if font is already available (system font or previously loaded)
    if (document.fonts.check(`16px "${fontFamily}"`)) {
      continueRender(handle);
      return;
    }

    const encoded = encodeURIComponent(fontFamily);
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${encoded}&display=swap`;

    const timeout = setTimeout(() => {
      console.warn(`Font "${fontFamily}" timed out after ${FONT_TIMEOUT_MS}ms, using fallback`);
      continueRender(handle);
    }, FONT_TIMEOUT_MS);

    link.onload = () => {
      document.fonts.ready.then(() => {
        clearTimeout(timeout);
        continueRender(handle);
      });
    };

    link.onerror = () => {
      console.warn(`Failed to load font "${fontFamily}", using fallback`);
      clearTimeout(timeout);
      continueRender(handle);
    };

    document.head.appendChild(link);
    return () => {
      clearTimeout(timeout);
      document.head.removeChild(link);
    };
  }, [fontFamily, handle]);

  const resolvedFont = fontFamily ? `"${fontFamily}", ${SYSTEM_FONTS}` : SYSTEM_FONTS;
  const strategy = animationStrategies[animation];
  const v = strategy(frame, durationInFrames, fps, ANIM_FRAMES);

  const isCinematic = animation === 'cinematic';

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: brandColor,
        opacity: v.bgOpacity,
        fontFamily: resolvedFont,
        ...(v.clipPath ? { clipPath: v.clipPath } : {}),
      }}
    >
      <div
        style={{
          transform: `scale(${v.contentScale}) translate(${v.translateX}px, ${v.translateY}px)`,
          opacity: isCinematic ? 1 : v.contentOpacity,
          textAlign: 'center',
          padding: '0 10%',
        }}
      >
        <h1
          style={{
            color: textColor,
            fontSize: titleFontSize,
            fontWeight: 700,
            margin: 0,
            lineHeight: 1.2,
            ...(isCinematic ? {
              opacity: v.titleOpacity ?? 1,
              transform: `translateY(${v.titleTranslateY ?? 0}px)`,
            } : {}),
          }}
        >
          {title}
        </h1>
        {description && (
          <>
            <div
              style={{
                width: 80,
                height: 4,
                backgroundColor: textColor,
                opacity: 0.4,
                margin: '24px auto',
                borderRadius: 2,
              }}
            />
            <p
              style={{
                color: textColor,
                fontSize: Math.round(titleFontSize * 0.44),
                fontWeight: 400,
                margin: 0,
                opacity: isCinematic ? (v.descOpacity ?? 0.85) : 0.85,
                lineHeight: 1.5,
                ...(isCinematic ? {
                  transform: `translateY(${v.descTranslateY ?? 0}px)`,
                } : {}),
              }}
            >
              {description}
            </p>
          </>
        )}
      </div>
    </div>
  );
};
