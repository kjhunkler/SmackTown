// Touch controls tuned for one-thumb-per-side play:
//   left zone  — drag = virtual stick · flick up = jump · flick down = fast-fall/drop
//   right zone — tap = quick attack aimed by the movement stick (8-way)
//                swipe = smash attack in the swipe direction (8-way)
//   two floating buttons — equipped abilities
// Keyboard fallback (desktop testing): arrows/WASD move, space jump,
// J = tap attack, K = swipe attack (both aimed by held direction, 8-way),
// L and ; = abilities. Z/X/C/V mirror J/K/L/; for left-hand play.

const FLICK_SPEED = 0.55;    // px/ms — how fast a move must be to be a flick
const SWIPE_MIN = 24;        // px before a right-zone gesture becomes a swipe
const TAP_MAX_MS = 220;
const STICK_RADIUS = 52;

export class TouchInput {
  constructor(root) {
    this.state = { mx: 0, my: 0 };   // continuous stick
    this.queue = [];                 // edge-triggered actions
    this.enabled = false;

    this.stickZone = root.querySelector('#stick-zone');
    this.actionZone = root.querySelector('#action-zone');
    this.stickBase = root.querySelector('#stick-base');
    this.stickKnob = root.querySelector('#stick-knob');
    this.abBtns = [root.querySelector('#ability-btn-0'), root.querySelector('#ability-btn-1')];

    this.stick = null;   // active left touch {id, ox, oy, lastX, lastY, lastT, flicked}
    this.swipe = null;   // active right touch

    this._bindZone(this.stickZone, 'stick');
    this._bindZone(this.actionZone, 'swipe');
    this.abBtns.forEach((btn, i) => {
      btn.addEventListener('pointerdown', e => {
        e.preventDefault(); e.stopPropagation();
        if (this.enabled) this.queue.push({ ['ab' + i]: true });
      });
    });

    this.keys = new Set();
    addEventListener('keydown', e => this._key(e, true));
    addEventListener('keyup', e => this._key(e, false));
  }

  _bindZone(zone, which) {
    zone.addEventListener('pointerdown', e => {
      if (!this.enabled) return;
      zone.setPointerCapture(e.pointerId);
      const rec = { id: e.pointerId, ox: e.clientX, oy: e.clientY, lastX: e.clientX, lastY: e.clientY, lastT: e.timeStamp, t0: e.timeStamp, flicked: false, moved: 0 };
      if (which === 'stick') {
        this.stick = rec;
        this.stickBase.classList.remove('hidden');
        this.stickBase.style.left = e.clientX + 'px';
        this.stickBase.style.top = e.clientY + 'px';
      } else {
        this.swipe = rec;
      }
    });
    zone.addEventListener('pointermove', e => {
      const rec = which === 'stick' ? this.stick : this.swipe;
      if (!rec || rec.id !== e.pointerId) return;
      const dt = Math.max(1, e.timeStamp - rec.lastT);
      const vy = (e.clientY - rec.lastY) / dt;
      rec.moved = Math.max(rec.moved, Math.hypot(e.clientX - rec.ox, e.clientY - rec.oy));
      rec.lastX = e.clientX; rec.lastY = e.clientY; rec.lastT = e.timeStamp;

      if (which === 'stick') {
        let dx = e.clientX - rec.ox, dy = e.clientY - rec.oy;
        const len = Math.hypot(dx, dy);
        if (len > STICK_RADIUS) {
          // walk the stick origin so direction changes stay responsive
          rec.ox += dx * (1 - STICK_RADIUS / len);
          rec.oy += dy * (1 - STICK_RADIUS / len);
          dx = e.clientX - rec.ox; dy = e.clientY - rec.oy;
          this.stickBase.style.left = rec.ox + 'px';
          this.stickBase.style.top = rec.oy + 'px';
        }
        this.state.mx = dx / STICK_RADIUS;
        this.state.my = dy / STICK_RADIUS;
        this.stickKnob.style.transform =
          `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        // vertical flicks on the movement thumb = jump / fast-fall+drop
        if (!rec.flicked && vy < -FLICK_SPEED) { rec.flicked = true; this.queue.push({ jump: true }); }
        else if (!rec.flicked && vy > FLICK_SPEED) { rec.flicked = true; this.queue.push({ ff: true, drop: true }); }
        else if (rec.flicked && Math.abs(vy) < 0.12) rec.flicked = false; // re-arm
      }
    });
    const end = e => {
      const rec = which === 'stick' ? this.stick : this.swipe;
      if (!rec || rec.id !== e.pointerId) return;
      if (which === 'stick') {
        this.stick = null;
        this.state.mx = 0; this.state.my = 0;
        this.stickBase.classList.add('hidden');
        this.stickKnob.style.transform = 'translate(-50%,-50%)';
      } else {
        this.swipe = null;
        const dx = e.clientX - rec.ox, dy = e.clientY - rec.oy;
        const dist = Math.hypot(dx, dy);
        const dur = e.timeStamp - rec.t0;
        if (dist < SWIPE_MIN && dur < TAP_MAX_MS) {
          // tap: quick attack aimed by the movement stick (neutral = facing)
          this.queue.push({ atk: { kind: 'tap', ...octant(this.state.mx, this.state.my, 0.35) } });
        } else if (dist >= SWIPE_MIN) {
          // swipe: smash attack in the swipe direction
          this.queue.push({ atk: { kind: 'swipe', ...octant(dx, dy) } });
        }
      }
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
  }

  _key(e, down) {
    if (!this.enabled || e.repeat) return;
    const k = e.key.toLowerCase();
    if (down) this.keys.add(k); else this.keys.delete(k);
    const dir = this.keys.has('arrowleft') || this.keys.has('a') ? -1
      : this.keys.has('arrowright') || this.keys.has('d') ? 1 : 0;
    const up = this.keys.has('arrowup') || this.keys.has('w');
    const dn = this.keys.has('arrowdown') || this.keys.has('s');
    this.state.mx = dir;
    this.state.my = dn ? 1 : up ? -1 : 0;
    if (!down) return;
    if (k === ' ' || k === 'arrowup' || k === 'w') this.queue.push({ jump: true });
    if (k === 'arrowdown' || k === 's') this.queue.push({ ff: true, drop: true });
    const aim = { dx: dir, dy: dn ? 1 : up ? -1 : 0 };
    if (k === 'j' || k === 'z') this.queue.push({ atk: { kind: 'tap', ...aim } });
    if (k === 'k' || k === 'x') this.queue.push({ atk: { kind: 'swipe', ...aim } });
    if (k === 'l' || k === 'c') this.queue.push({ ab0: true });
    if (k === ';' || k === 'v') this.queue.push({ ab1: true });
  }

  // Drain into a single input frame for the sim/network.
  poll() {
    const out = { mx: this.state.mx, my: this.state.my };
    for (const q of this.queue) Object.assign(out, q);
    this.queue.length = 0;
    return out;
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on) {
      this.queue.length = 0;
      this.state.mx = 0; this.state.my = 0;
      this.stick = this.swipe = null;
      this.stickBase.classList.add('hidden');
    }
  }
}

// Snap a vector to one of 8 directions — {dx, dy} each in {-1, 0, 1} —
// or neutral {0, 0} inside the deadzone.
function octant(x, y, dead = 0) {
  if (Math.hypot(x, y) <= dead) return { dx: 0, dy: 0 };
  const s = Math.round(Math.atan2(y, x) / (Math.PI / 4)) * (Math.PI / 4);
  return { dx: Math.round(Math.cos(s)), dy: Math.round(Math.sin(s)) };
}
