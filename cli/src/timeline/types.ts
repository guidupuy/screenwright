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
  videoFile: string;
}

export type TimelineEvent =
  | SceneEvent
  | ActionEvent
  | CursorTargetEvent
  | NarrationEvent
  | WaitEvent;

export interface SceneEvent {
  type: 'scene';
  id: string;
  timestampMs: number;
  title: string;
  description?: string;
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
