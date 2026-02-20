export type ManifestEntry =
  | { type: 'frame'; file: string }
  | { type: 'hold'; file: string; count: number };

export interface TransitionMarker {
  afterEntryIndex: number;
  transition: TransitionType;
  durationFrames: number;
  /** Explicit image for the "before" side of the transition. */
  beforeFile?: string;
  /** Explicit image for the "after" side of the transition. */
  afterFile?: string;
  /**
   * Number of source frames consumed (skipped) by the transition.
   * Defaults to 1 when not set. Slide-to-slide transitions set this
   * higher to skip junk frames captured between overlay removal and
   * the next overlay injection.
   */
  consumedFrames?: number;
}

export interface Timeline {
  version: 2;
  metadata: TimelineMetadata;
  events: TimelineEvent[];
}

export interface TimelineMetadata {
  testFile: string;
  scenarioFile: string;
  recordedAt: string;
  viewport: { width: number; height: number };
  frameManifest: ManifestEntry[];
  transitionMarkers: TransitionMarker[];
}

export type TimelineEvent =
  | SceneEvent
  | ActionEvent
  | CursorTargetEvent
  | NarrationEvent
  | WaitEvent;

export const transitionTypes = [
  'fade', 'wipe', 'slide-up', 'slide-left', 'zoom',
  'doorway', 'swap', 'cube',
] as const;

export type TransitionType = (typeof transitionTypes)[number];

export interface SceneSlideConfig {
  duration?: number;
  brandColor?: string;
  textColor?: string;
  fontFamily?: string;
  titleFontSize?: number;
}

export interface SceneEvent {
  type: 'scene';
  id: string;
  timestampMs: number;
  title: string;
  description?: string;
  slide?: SceneSlideConfig;
}

export type ActionType = 'click' | 'dblclick' | 'fill' | 'hover' | 'press' | 'navigate';

export interface ActionEvent {
  type: 'action';
  id: string;
  timestampMs: number;
  action: ActionType;
  selector: string;
  value?: string;
  durationMs: number;
  boundingBox: { x: number; y: number; width: number; height: number } | null;
  settledAtMs?: number;
}

export interface CursorTargetEvent {
  type: 'cursor_target';
  id: string;
  timestampMs: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  moveDurationMs: number;
  easing: 'bezier';
}

export interface NarrationEvent {
  type: 'narration';
  id: string;
  timestampMs: number;
  text: string;
  audioDurationMs?: number;
  audioFile?: string;
}

export interface WaitEvent {
  type: 'wait';
  id: string;
  timestampMs: number;
  durationMs: number;
  reason: 'pacing' | 'narration_sync' | 'page_load';
}
