import React from 'react';
import { Composition, registerRoot } from 'remotion';
import { z } from 'zod';
import { DemoVideo } from './DemoVideo.js';
import type { SceneEvent } from '../timeline/types.js';
import { timelineSchema } from '../timeline/schema.js';
import { brandingSchema } from '../config/config-schema.js';
import { resolveSlideScenes, resolveTransitions, totalSlideDurationMs, totalTransitionDurationMs, msToFrames } from './time-remap.js';

const propsSchema = z.object({
  timeline: timelineSchema,
  branding: brandingSchema.optional(),
});

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="DemoVideo"
        lazyComponent={() => Promise.resolve({ default: DemoVideo as any })}
        schema={propsSchema}
        durationInFrames={300}
        fps={30}
        width={1280}
        height={720}
        defaultProps={{
          timeline: {
            version: 1 as const,
            metadata: {
              testFile: '',
              scenarioFile: '',
              recordedAt: new Date().toISOString(),
              viewport: { width: 1280, height: 720 },
              videoDurationMs: 0,
              videoFile: 'placeholder.webm',
            },
            events: [],
          },
        }}
        calculateMetadata={({ props }) => {
          const fps = 30;
          const scenes = props.timeline.events.filter((e): e is SceneEvent => e.type === 'scene');
          const slideScenes = resolveSlideScenes(scenes);
          const resolvedTransitions = resolveTransitions(props.timeline.events);
          const totalMs = props.timeline.metadata.videoDurationMs
            + totalSlideDurationMs(slideScenes)
            + totalTransitionDurationMs(resolvedTransitions);
          const durationInFrames = Math.max(30, msToFrames(totalMs, fps));
          return {
            durationInFrames,
            fps,
            width: props.timeline.metadata.viewport.width,
            height: props.timeline.metadata.viewport.height,
          };
        }}
      />
    </>
  );
};

registerRoot(RemotionRoot);
