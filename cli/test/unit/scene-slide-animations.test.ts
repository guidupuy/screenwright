import { describe, it, expect } from 'vitest';
import { animationStrategies } from '../../src/composition/SceneSlide.js';
import type { AnimationValues } from '../../src/composition/SceneSlide.js';
import { slideAnimations } from '../../src/timeline/types.js';

const FPS = 30;
const DURATION = 60; // 2 seconds at 30fps
const ANIM_FRAMES = 12;

function vals(name: string, frame: number): AnimationValues {
  return animationStrategies[name as keyof typeof animationStrategies](frame, DURATION, FPS, ANIM_FRAMES);
}

describe('animation strategies', () => {
  for (const name of slideAnimations) {
    describe(name, () => {
      it('starts with 0 bgOpacity at frame 0', () => {
        const v = vals(name, 0);
        // wipe uses clipPath instead of bgOpacity for reveal
        if (name === 'wipe') {
          expect(v.bgOpacity).toBe(1);
          expect(v.clipPath).toContain('100');
        } else {
          expect(v.bgOpacity).toBe(0);
        }
      });

      it('is fully visible at midpoint', () => {
        const v = vals(name, DURATION / 2);
        if (name === 'wipe') {
          expect(v.bgOpacity).toBe(1);
        } else {
          expect(v.bgOpacity).toBeCloseTo(1, 1);
        }
        expect(v.contentScale).toBeCloseTo(1, 1);
      });

      it('ends with 0 visibility at last frame', () => {
        const v = vals(name, DURATION);
        if (name === 'wipe') {
          expect(v.clipPath).toContain('100');
          expect(v.contentOpacity).toBeCloseTo(0, 1);
        } else {
          expect(v.bgOpacity).toBeCloseTo(0, 1);
        }
      });

      it('returns valid numeric values at all phases', () => {
        for (const frame of [0, ANIM_FRAMES / 2, ANIM_FRAMES, DURATION / 2, DURATION - ANIM_FRAMES, DURATION]) {
          const v = vals(name, frame);
          expect(typeof v.bgOpacity).toBe('number');
          expect(typeof v.contentOpacity).toBe('number');
          expect(typeof v.contentScale).toBe('number');
          expect(typeof v.translateX).toBe('number');
          expect(typeof v.translateY).toBe('number');
          expect(Number.isFinite(v.bgOpacity)).toBe(true);
          expect(Number.isFinite(v.contentScale)).toBe(true);
        }
      });
    });
  }

  describe('cinematic', () => {
    it('returns staggered title/desc values', () => {
      const v = vals('cinematic', 1);
      expect(v.titleOpacity).toBeDefined();
      expect(v.titleTranslateY).toBeDefined();
      expect(v.descOpacity).toBeDefined();
      expect(v.descTranslateY).toBeDefined();
    });

    it('title appears before description', () => {
      // At a very early frame, title should have more opacity than desc
      const v = vals('cinematic', 3);
      expect(v.titleOpacity!).toBeGreaterThan(v.descOpacity!);
    });
  });

  describe('wipe', () => {
    it('returns clipPath values', () => {
      const v = vals('wipe', 0);
      expect(v.clipPath).toBeDefined();
      expect(v.clipPath).toMatch(/^inset\(/);
    });

    it('clip-path opens fully at midpoint', () => {
      const v = vals('wipe', DURATION / 2);
      expect(v.clipPath).toBe('inset(0 0% 0 0)');
    });
  });

  describe('non-cinematic animations have no title/desc stagger', () => {
    for (const name of slideAnimations.filter(n => n !== 'cinematic')) {
      it(`${name} does not set titleOpacity`, () => {
        const v = vals(name, ANIM_FRAMES / 2);
        expect(v.titleOpacity).toBeUndefined();
        expect(v.descOpacity).toBeUndefined();
      });
    }
  });

  describe('non-wipe animations have no clipPath', () => {
    for (const name of slideAnimations.filter(n => n !== 'wipe')) {
      it(`${name} does not set clipPath`, () => {
        const v = vals(name, ANIM_FRAMES / 2);
        expect(v.clipPath).toBeUndefined();
      });
    }
  });
});
