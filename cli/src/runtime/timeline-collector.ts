import type { Timeline, TimelineMetadata, TimelineEvent } from '../timeline/types.js';
import { timelineSchema } from '../timeline/schema.js';

type PartialEvent = { type: string; id?: string; timestampMs?: number; [key: string]: unknown };

export class TimelineCollector {
  private events: TimelineEvent[] = [];
  private counter = 0;
  private startTime: number | null = null;
  private virtualMode = false;
  private virtualTime = 0;

  start(): void {
    this.startTime = performance.now();
  }

  enableVirtualTime(): void {
    this.virtualMode = true;
    this.virtualTime = 0;
  }

  advance(ms: number): void {
    if (!this.virtualMode) return;
    this.virtualTime += ms;
  }

  elapsed(): number {
    if (this.startTime === null) throw new Error('TimelineCollector not started');
    if (this.virtualMode) return Math.round(this.virtualTime);
    return Math.round(performance.now() - this.startTime);
  }

  nextId(): string {
    return `ev-${String(++this.counter).padStart(3, '0')}`;
  }

  emit(event: PartialEvent): string {
    const id = event.id ?? this.nextId();
    const timestampMs = event.timestampMs ?? this.elapsed();
    const full = { ...event, id, timestampMs } as TimelineEvent;
    this.events.push(full);
    return id;
  }

  getEvents(): readonly TimelineEvent[] {
    return this.events;
  }

  finalize(metadata: TimelineMetadata): Timeline {
    const timeline: Timeline = {
      version: 1,
      metadata,
      events: [...this.events],
    };

    const result = timelineSchema.safeParse(timeline);
    if (!result.success) {
      throw new Error(`Invalid timeline: ${result.error.message}`);
    }

    return timeline;
  }
}
