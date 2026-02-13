import React from 'react';
import { Audio, Sequence, staticFile } from 'remotion';
import type { NarrationEvent } from '../timeline/types.js';

interface Props {
  narrations: NarrationEvent[];
  fps: number;
}

export const NarrationTrack: React.FC<Props> = ({ narrations, fps }) => {
  return (
    <>
      {narrations
        .filter(n => n.audioFile)
        .map((n, i) => (
          <Sequence key={n.id} from={Math.round((n.timestampMs / 1000) * fps)}>
            <Audio src={n.audioFile!} />
          </Sequence>
        ))}
    </>
  );
};
