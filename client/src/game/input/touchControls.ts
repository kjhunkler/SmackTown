import type { InputFrame } from '@/net/protocol';

const SWIPE_DISTANCE_PX = 26;
const SWIPE_MAX_DURATION_MS = 380;
const HOLD_DURATION_MS = 220;
const HOLD_MAX_MOVE_PX = 18;
const JUMP_SWIPE_UP_PX = 55;
const FASTFALL_DRAG_PX = 45;

interface TouchState {
  id: number;
  startX: number;
  startY: number;
  startTime: number;
  lastX: number;
  lastY: number;
  zone: 'move' | 'attack';
  jumpFired: boolean;
}

export class TouchControls {
  private moveTouch: TouchState | null = null;
  private attackTouch: TouchState | null = null;
  private holdTimer: number | null = null;

  moveX = 0;
  private jumpPulse = false;
  fastFall = false;
  shieldHeld = false;
  private attackPulse: InputFrame['attack'] = 'none';
  private abilityPulse: InputFrame['ability'] = 0;
  private seq = 0;

  private root: HTMLElement;
  private abilityButtons: HTMLElement[] = [];

  constructor(root: HTMLElement) {
    this.root = root;
    root.style.touchAction = 'none';
    root.addEventListener('pointerdown', this.onPointerDown);
    root.addEventListener('pointermove', this.onPointerMove);
    root.addEventListener('pointerup', this.onPointerUp);
    root.addEventListener('pointercancel', this.onPointerUp);
  }

  registerAbilityButton(el: HTMLElement, slot: 1 | 2) {
    el.addEventListener('pointerdown', (ev) => {
      ev.stopPropagation();
      this.abilityPulse = slot;
      el.classList.add('pressed');
    });
    el.addEventListener('pointerup', () => el.classList.remove('pressed'));
    this.abilityButtons.push(el);
  }

  private zoneFor(clientX: number): 'move' | 'attack' {
    const rect = this.root.getBoundingClientRect();
    return clientX - rect.left < rect.width / 2 ? 'move' : 'attack';
  }

  private onPointerDown = (ev: PointerEvent) => {
    const zone = this.zoneFor(ev.clientX);
    const state: TouchState = {
      id: ev.pointerId,
      startX: ev.clientX,
      startY: ev.clientY,
      startTime: performance.now(),
      lastX: ev.clientX,
      lastY: ev.clientY,
      zone,
      jumpFired: false,
    };
    if (zone === 'move') {
      this.moveTouch = state;
    } else {
      this.attackTouch = state;
      this.clearHoldTimer();
      this.holdTimer = window.setTimeout(() => {
        if (this.attackTouch && this.attackTouch.id === state.id) {
          const dx = Math.abs(this.attackTouch.lastX - state.startX);
          const dy = Math.abs(this.attackTouch.lastY - state.startY);
          if (dx < HOLD_MAX_MOVE_PX && dy < HOLD_MAX_MOVE_PX) {
            this.shieldHeld = true;
          }
        }
      }, HOLD_DURATION_MS);
    }
  };

  private onPointerMove = (ev: PointerEvent) => {
    if (this.moveTouch && ev.pointerId === this.moveTouch.id) {
      this.moveTouch.lastX = ev.clientX;
      this.moveTouch.lastY = ev.clientY;
      const dx = ev.clientX - this.moveTouch.startX;
      const dy = ev.clientY - this.moveTouch.startY;
      this.moveX = clamp(dx / 55, -1, 1);
      this.fastFall = dy > FASTFALL_DRAG_PX;
      if (!this.moveTouch.jumpFired && dy < -JUMP_SWIPE_UP_PX) {
        this.moveTouch.jumpFired = true;
        this.jumpPulse = true;
      }
    } else if (this.attackTouch && ev.pointerId === this.attackTouch.id) {
      this.attackTouch.lastX = ev.clientX;
      this.attackTouch.lastY = ev.clientY;
      const dx = Math.abs(ev.clientX - this.attackTouch.startX);
      const dy = Math.abs(ev.clientY - this.attackTouch.startY);
      if (dx > HOLD_MAX_MOVE_PX || dy > HOLD_MAX_MOVE_PX) this.clearHoldTimer();
    }
  };

  private onPointerUp = (ev: PointerEvent) => {
    if (this.moveTouch && ev.pointerId === this.moveTouch.id) {
      this.moveTouch = null;
      this.moveX = 0;
      this.fastFall = false;
    }
    if (this.attackTouch && ev.pointerId === this.attackTouch.id) {
      const dx = ev.clientX - this.attackTouch.startX;
      const dy = ev.clientY - this.attackTouch.startY;
      const dist = Math.hypot(dx, dy);
      const duration = performance.now() - this.attackTouch.startTime;
      this.clearHoldTimer();
      const wasShielding = this.shieldHeld;
      this.shieldHeld = false;

      if (!wasShielding) {
        if (dist >= SWIPE_DISTANCE_PX && duration <= SWIPE_MAX_DURATION_MS) {
          if (Math.abs(dy) > Math.abs(dx)) {
            this.attackPulse = dy < 0 ? 'smash-up' : 'smash-down';
          } else {
            this.attackPulse = 'smash-side';
          }
        } else if (dist < HOLD_MAX_MOVE_PX && duration < HOLD_DURATION_MS) {
          this.attackPulse = 'jab';
        }
      }
      this.attackTouch = null;
    }
  };

  private clearHoldTimer() {
    if (this.holdTimer !== null) {
      window.clearTimeout(this.holdTimer);
      this.holdTimer = null;
    }
  }

  /** Reads current input state and clears one-shot pulses (call once per local sim tick). */
  poll(): InputFrame {
    const frame: InputFrame = {
      moveX: this.moveX,
      jump: this.jumpPulse,
      fastFall: this.fastFall,
      shield: this.shieldHeld,
      attack: this.attackPulse,
      ability: this.abilityPulse,
      seq: this.seq++,
    };
    this.jumpPulse = false;
    this.attackPulse = 'none';
    this.abilityPulse = 0;
    return frame;
  }

  destroy() {
    this.root.removeEventListener('pointerdown', this.onPointerDown);
    this.root.removeEventListener('pointermove', this.onPointerMove);
    this.root.removeEventListener('pointerup', this.onPointerUp);
    this.root.removeEventListener('pointercancel', this.onPointerUp);
    this.clearHoldTimer();
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
