export interface FrameEntry {
  timestampMs: number;
  file: string;
}

export interface Timeline {
  version: 1;
  metadata: TimelineMetadata;
  events: TimelineEvent[];
}

export interface TimelineMetadata {
  testFile: string;
  scenarioFile: string;
  recordedAt: string;
  viewport: { width: number; height: number };
  videoDurationMs: number;
  videoFile?: string;
  frameManifest?: FrameEntry[];
}

export type TimelineEvent =
  | SceneEvent
  | ActionEvent
  | CursorTargetEvent
  | NarrationEvent
  | WaitEvent
  | TransitionEvent;

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

export type ActionType = 'click' | 'fill' | 'hover' | 'select' | 'press' | 'navigate';

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

export interface TransitionEvent {
  type: 'transition';
  id: string;
  timestampMs: number;
  transition: TransitionType;
  durationMs: number;
}
