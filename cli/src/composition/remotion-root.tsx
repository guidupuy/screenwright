import React from 'react';
import { Composition } from 'remotion';
import { z } from 'zod';
import { DemoVideo } from './DemoVideo.js';
import { timelineSchema } from '../timeline/schema.js';

const propsSchema = z.object({
  timeline: timelineSchema,
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
              videoFile: '',
            },
            events: [],
          },
        }}
        calculateMetadata={({ props }) => {
          const fps = 30;
          const durationInFrames = Math.max(
            30,
            Math.ceil((props.timeline.metadata.videoDurationMs / 1000) * fps)
          );
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
