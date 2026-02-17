import type { TransitionType } from '../timeline/types.js';

export interface TransitionStyles {
  exit: React.CSSProperties;
  exit2?: React.CSSProperties;
  entrance: React.CSSProperties;
  backdrop?: string;
  /** Inner wrapper: preserve-3d + cube rotation */
  container?: React.CSSProperties;
  /** Outer wrapper: shared perspective for 3D transitions */
  perspective?: number;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

function fade(p: number): TransitionStyles {
  return {
    exit: { opacity: 1 - p },
    entrance: { opacity: p },
  };
}

function wipe(p: number): TransitionStyles {
  return {
    exit: { clipPath: `inset(0 0 0 ${p * 100}%)` },
    entrance: {},
  };
}

function slideUp(p: number): TransitionStyles {
  return {
    exit: { transform: `translateY(${-p * 100}%)` },
    entrance: { transform: `translateY(${(1 - p) * 100}%)` },
  };
}

function slideLeft(p: number): TransitionStyles {
  return {
    exit: { transform: `translateX(${-p * 100}%)` },
    entrance: { transform: `translateX(${(1 - p) * 100}%)` },
  };
}

function zoom(p: number): TransitionStyles {
  return {
    exit: { transform: `scale(${1 + p * 0.5})`, opacity: 1 - p },
    entrance: { transform: `scale(${0.5 + p * 0.5})`, opacity: p },
  };
}

function doorway(p: number): TransitionStyles {
  const scale = 0.33 + p * 0.67;
  return {
    exit:  { clipPath: 'inset(0 50% 0 0)', transform: `translateX(${-p * 50}%)` },
    exit2: { clipPath: 'inset(0 0 0 50%)', transform: `translateX(${p * 50}%)` },
    entrance: { transform: `scale(${scale})` },
    backdrop: '#000000',
  };
}

function swap(p: number): TransitionStyles {
  return {
    exit: {
      transform: `perspective(1200px) translateX(${-p * 100}%) rotateY(${p * 45}deg) scale(${1 - p * 0.35})`,
    },
    entrance: {
      transform: `perspective(1200px) translateX(${(1 - p) * 100}%) rotateY(${-(1 - p) * 45}deg) scale(${0.65 + p * 0.35})`,
    },
    backdrop: '#000000',
  };
}

function cube(p: number, vw = 1920): TransitionStyles {
  const half = vw / 2;
  return {
    perspective: vw * 2,
    container: {
      transformStyle: 'preserve-3d' as React.CSSProperties['transformStyle'],
      transform: `translateZ(${-half}px) rotateY(${-p * 90}deg)`,
    },
    exit: {
      transform: `translateZ(${half}px)`,
    },
    entrance: {
      transform: `rotateY(90deg) translateZ(${half}px)`,
    },
    backdrop: '#000000',
  };
}

const strategies: Record<TransitionType, (p: number) => TransitionStyles> = {
  'fade': fade,
  'wipe': wipe,
  'slide-up': slideUp,
  'slide-left': slideLeft,
  'zoom': zoom,
  'doorway': doorway,
  'swap': swap,
  'cube': cube,
};

export function getTransitionStyles(type: TransitionType, progress: number, viewportWidth?: number): TransitionStyles {
  const p = easeInOut(Math.max(0, Math.min(1, progress)));
  if (type === 'cube' && viewportWidth) return cube(p, viewportWidth);
  return strategies[type](p);
}
