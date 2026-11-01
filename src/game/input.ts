/** Keyboard + touch input, buffered between fixed simulation steps. */
import type { Input } from './session';

class InputBuffer {
  left = 0;
  right = 0;
  jump = false;
  hedge = false;
  alpha = false;

  consume(): Input {
    const i: Input = { left: this.left, right: this.right, jump: this.jump, hedge: this.hedge, alpha: this.alpha };
    this.left = this.right = 0;
    this.jump = this.hedge = this.alpha = false;
    return i;
  }
  clear() {
    this.consume();
  }
}

export const input = new InputBuffer();
export const NO_INPUT: Input = { left: 0, right: 0, jump: false, hedge: false, alpha: false };

type Handlers = { onPause: () => void; isPlaying: () => boolean; onCamera: () => void };

export function attachInput(h: Handlers) {
  const onKey = (e: KeyboardEvent) => {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    if (k === 'p' || k === 'escape') {
      h.onPause();
      return;
    }
    if (!h.isPlaying()) return;
    if (k === 'a' || k === 'arrowleft') input.left++;
    else if (k === 'd' || k === 'arrowright') input.right++;
    else if (k === 'w' || k === 'arrowup') input.jump = true;
    else if (k === ' ' || k === 'spacebar') input.hedge = true;
    else if (k === 'shift' || k === 'e' || k === 'arrowdown' || k === 's') input.alpha = true;
    else if (k === 'c') h.onCamera();
    else return;
    e.preventDefault();
  };

  let sx = 0, sy = 0, st = 0, tracking = false, fired = false, swiped = false;
  const onStart = (e: TouchEvent) => {
    const t = e.touches[0];
    if (!t || (e.target as HTMLElement)?.closest?.('button')) return;
    sx = t.clientX;
    sy = t.clientY;
    st = performance.now();
    tracking = true;
    fired = false;
    swiped = false;
  };
  const onMove = (e: TouchEvent) => {
    if (!tracking || fired || !h.isPlaying()) return;
    const t = e.touches[0];
    const dx = t.clientX - sx;
    const dy = t.clientY - sy;
    const th = Math.min(40, window.innerWidth * 0.06);
    if (Math.abs(dx) > th && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) input.left++;
      else input.right++;
      fired = true;
    } else if (dy < -th && Math.abs(dy) > Math.abs(dx)) {
      input.jump = true;
      fired = true;
    } else if (dy > th * 1.5 && Math.abs(dy) > Math.abs(dx)) {
      input.alpha = true;
      fired = true;
    }
    if (fired) {
      e.preventDefault();
      // allow chained swipes in one touch (e.g. left-left): restart from here
      sx = t.clientX;
      sy = t.clientY;
      fired = false;
      swiped = true;
    }
  };
  const onEnd = () => {
    // quick tap without a swipe: tap left/right third of the screen also steers
    if (tracking && !swiped && h.isPlaying() && performance.now() - st < 250) {
      const w = window.innerWidth;
      if (sx < w * 0.28) input.left++;
      else if (sx > w * 0.72) input.right++;
    }
    tracking = false;
  };
  window.addEventListener('keydown', onKey);
  window.addEventListener('touchstart', onStart, { passive: true });
  window.addEventListener('touchmove', onMove, { passive: false });
  window.addEventListener('touchend', onEnd);
  return () => {
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('touchstart', onStart);
    window.removeEventListener('touchmove', onMove);
    window.removeEventListener('touchend', onEnd);
  };
}
