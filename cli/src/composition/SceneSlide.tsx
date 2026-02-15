import React, { useEffect, useState } from 'react';
import { delayRender, continueRender, useCurrentFrame, interpolate, spring } from 'remotion';

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
  durationInFrames: number;
  fps: number;
}

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

  // In animation (first ANIM_FRAMES)
  const inProgress = spring({ frame, fps, config: { damping: 12 }, durationInFrames: ANIM_FRAMES });
  const inOpacity = interpolate(frame, [0, ANIM_FRAMES], [0, 1], { extrapolateRight: 'clamp' });

  // Out animation (last ANIM_FRAMES)
  const outStart = durationInFrames - ANIM_FRAMES;
  const outOpacity = interpolate(frame, [outStart, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const outScale = interpolate(frame, [outStart, durationInFrames], [1, 0.95], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const isInPhase = frame < ANIM_FRAMES;
  const isOutPhase = frame >= outStart;

  const bgOpacity = isOutPhase ? outOpacity : inOpacity;
  const contentScale = isInPhase
    ? interpolate(inProgress, [0, 1], [0.85, 1])
    : isOutPhase ? outScale : 1;
  const contentOpacity = isOutPhase ? outOpacity : inOpacity;
  const translateY = isInPhase ? interpolate(inProgress, [0, 1], [20, 0]) : 0;

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
        opacity: bgOpacity,
        fontFamily: resolvedFont,
      }}
    >
      <div
        style={{
          transform: `scale(${contentScale}) translateY(${translateY}px)`,
          opacity: contentOpacity,
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
                opacity: 0.85,
                lineHeight: 1.5,
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
