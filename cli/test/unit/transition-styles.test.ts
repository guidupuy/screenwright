import { describe, it, expect } from 'vitest';
import { getTransitionStyles } from '../../src/composition/transition-styles.js';
import { transitionTypes } from '../../src/timeline/types.js';

describe('getTransitionStyles', () => {
  for (const type of transitionTypes) {
    describe(type, () => {
      it('at progress=0, exit is fully visible', () => {
        const styles = getTransitionStyles(type, 0);
        if (type === 'wipe') {
          expect(styles.exit.clipPath).toBe('inset(0 0 0 0%)');
        } else if (type === 'fade') {
          expect(styles.exit.opacity).toBe(1);
        } else if (type === 'zoom') {
          expect(styles.exit.opacity).toBe(1);
          expect(styles.exit.transform).toContain('scale(1)');
        } else if (type === 'doorway') {
          expect(styles.exit.transform).toContain('translateX(0%)');
          expect(styles.exit2).toBeDefined();
          expect(styles.exit2!.transform).toContain('translateX(0%)');
        } else if (type === 'swap') {
          expect(styles.exit.transform).toContain('translateX(0%)');
        } else if (type === 'cube') {
          expect(styles.exit.transform).toContain('translateZ(');
          expect(styles.container).toBeDefined();
        } else {
          // slide-up, slide-left: exit at origin
          expect(styles.exit.transform).toContain('0%');
        }
      });

      it('at progress=0, entrance is hidden', () => {
        const styles = getTransitionStyles(type, 0);
        if (type === 'wipe') {
          expect(styles.entrance).toBeDefined();
        } else if (type === 'fade') {
          expect(styles.entrance.opacity).toBe(0);
        } else if (type === 'zoom') {
          expect(styles.entrance.opacity).toBe(0);
        } else if (type === 'doorway') {
          // Entrance sits behind doors, fully visible from the start
          expect(styles.entrance).toBeDefined();
        } else if (type === 'swap') {
          expect(styles.entrance.transform).toContain('translateX(100%)');
        } else if (type === 'cube') {
          expect(styles.entrance.transform).toContain('rotateY(90deg)');
        } else {
          // slide-up, slide-left: entrance is offscreen
          expect(styles.entrance.transform).toContain('100%');
        }
      });

      it('at progress=1, exit is hidden', () => {
        const styles = getTransitionStyles(type, 1);
        if (type === 'wipe') {
          expect(styles.exit.clipPath).toBe('inset(0 0 0 100%)');
        } else if (type === 'fade') {
          expect(styles.exit.opacity).toBe(0);
        } else if (type === 'zoom') {
          expect(styles.exit.opacity).toBe(0);
        } else if (type === 'doorway') {
          expect(styles.exit.transform).toContain('translateX(-50%)');
          expect(styles.exit2).toBeDefined();
          expect(styles.exit2!.transform).toContain('translateX(50%)');
        } else if (type === 'swap') {
          expect(styles.exit.transform).toContain('translateX(-100%)');
        } else if (type === 'cube') {
          expect(styles.exit.transform).toContain('translateZ(');
          expect(styles.container!.transform).toContain('rotateY(-90deg)');
        } else {
          // slide-up: exit at -100%, slide-left: exit at -100%
          expect(styles.exit.transform).toContain('-100%');
        }
      });

      it('at progress=1, entrance is fully visible', () => {
        const styles = getTransitionStyles(type, 1);
        if (type === 'wipe') {
          expect(styles.entrance).toBeDefined();
        } else if (type === 'fade') {
          expect(styles.entrance.opacity).toBe(1);
        } else if (type === 'zoom') {
          expect(styles.entrance.opacity).toBe(1);
          expect(styles.entrance.transform).toContain('scale(1)');
        } else if (type === 'doorway') {
          expect(styles.entrance).toBeDefined();
        } else if (type === 'swap') {
          expect(styles.entrance.transform).toContain('translateX(0%)');
        } else if (type === 'cube') {
          expect(styles.entrance.transform).toContain('rotateY(90deg)');
          expect(styles.container!.transform).toContain('rotateY(-90deg)');
        } else {
          // slide-up, slide-left: entrance at origin
          expect(styles.entrance.transform).toContain('0%');
        }
      });

      it('at midpoint, values are intermediate', () => {
        const styles = getTransitionStyles(type, 0.5);
        // Just verify we get valid objects back
        expect(styles.exit).toBeDefined();
        expect(styles.entrance).toBeDefined();
      });
    });
  }

  it('clamps progress below 0', () => {
    const styles = getTransitionStyles('fade', -1);
    expect(styles.exit.opacity).toBe(1);
    expect(styles.entrance.opacity).toBe(0);
  });

  it('clamps progress above 1', () => {
    const styles = getTransitionStyles('fade', 2);
    expect(styles.exit.opacity).toBe(0);
    expect(styles.entrance.opacity).toBe(1);
  });
});
