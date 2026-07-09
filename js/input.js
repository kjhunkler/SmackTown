// Touch controls tuned for one-thumb-per-side play:
//   left zone  — drag = virtual stick · flick up = jump · flick down = fast-fall/drop
//                flick sideways while ducked (stick pinned down) = dodge roll
//   right zone — tap = quick attack aimed by the movement stick (8-way)
//                swipe = smash attack in the swipe direction (8-way);
//                detected the moment the drag crosses the swipe threshold —
//                keeping the finger down charges the smash, lifting fires it
//   two floating buttons — equipped abilities
// Keyboard fallback (desktop testing): arrows/WASD move, space jump,
// J = tap attack, K = smash (hold to charge, release to fire; aimed by held
// direction at press, 8-way), L and ; = abilities. Z/X/C/V mirror J/K/L/;.
// Hold down + press a direction = dodge roll.
// Mouse (keyboard players move on the keys, so the mouse is a pure attack
// stick): left click anywhere = quick attack · left click-drag = smash in
// the drag direction (hold to charge, release to fire) · right click =
// smash aimed by the held movement keys (hold to charge). Both screen
// halves attack under the mouse — only touch keeps the left half as the
// movement stick. Side button (browser 'back', button 3) = ability 1 ·
// middle click (wheel button) = ability 2 · scroll wheel down = ability 1,
// scroll wheel up = ability 2.
// Gamepad (standard layout, polled each frame alongside touch/keys):
// left stick / dpad move — hold down to duck, tilt sideways while
// ducked = dodge roll, flick
// down = fast-fall/drop · A = quick attack · B = smash (hold to charge,
// release to fire; aimed by the stick at press, 8-way) · Y = jump ·
// X / LB / RB = ability 1 · LT / RT = ability 2 · right stick = instant
// smash in the tilt direction (no charging — hold B for that).
//
// Charging is reported to the sim as a level field (`chg`, the locked 8-way
// aim while the control is held); the release ALSO queues the classic swipe
// attack edge so a press-and-release faster than one poll still attacks.

import { settings } from './settings.js';

const FLICK_SPEED = 0.55;    // px/ms — how fast a move must be to be a flick
const SWIPE_MIN = 24;        // px before a right-zone gesture becomes a swipe
const TAP_MAX_MS = 220;
const STICK_RADIUS = 52;
const PAD_DEAD = 0.25;       // gamepad stick deadzone
const PAD_AIM_DEAD = 0.35;   // stick tilt before an attack aims off-neutral
const PAD_FLICK = 0.6;       // stick tilt that counts as a vertical flick
const PAD_SCAN = 16;         // buttons scanned for bound actions each frame

// Keyboard keys and gamepad buttons are user-rebindable (see settings.js).
// Touch gestures are not — they're continuous drags/flicks, not discrete
// inputs — so nothing here reads a touch binding.

export class TouchInput {
  constructor(root) {
    this.state = { mx: 0, my: 0, chg: null };  // continuous stick + held charge aim
    this.queue = [];                 // edge-triggered actions
    this.enabled = false;
    this.keyChg = null;              // charge aim held via keyboard (K/X)
    this.mouseChg = null;            // charge aim held via right mouse button
    this.wheelT = 0;                 // last scroll-wheel ability trigger (debounce)
    this.padChg = null;              // charge aim held via gamepad (B)
    this.padRHeld = false;           // right stick currently tilted (re-arm)
    this.padRolled = false;          // ducked sideways tilt fired (re-arm)

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

    // right mouse button (desktop) = heavy/smash attack, aimed by the held
    // movement keys — hold to charge, release to fire, mirroring the K key.
    // Side button (back) = ability 1; middle click (wheel button) = ability 2.
    addEventListener('mousedown', e => this._mouse(e, true));
    addEventListener('mouseup', e => this._mouse(e, false));
    // scroll wheel: down = ability 1, up = ability 2 — a quick alternative
    // to the side/middle buttons for mice without them
    addEventListener('wheel', e => this._wheel(e), { passive: false });

    // gamepads are polled (in poll()), only connection changes are events
    this.onPad = null;               // optional (connected, id) callback
    this.padPrev = [];               // last-frame button states (edge detect)
    this.padFlicked = false;         // vertical stick flick armed/fired
    addEventListener('gamepadconnected', e => this.onPad?.(true, e.gamepad.id));
    addEventListener('gamepaddisconnected', e => this.onPad?.(false, e.gamepad.id));
  }

  _bindZone(zone, which) {
    zone.addEventListener('pointerdown', e => {
      if (!this.enabled || e.button > 0) return;   // right/middle mouse = heavy attack, not a gesture
      // Touch keeps the split — left half is the movement stick, right half
      // attacks. A mouse has no thumb to park on a stick (PC players move on
      // the keys), so mouse clicks are ALWAYS attacks, on either half.
      const role = e.pointerType === 'mouse' ? 'swipe' : which;
      zone.setPointerCapture(e.pointerId);
      const rec = { id: e.pointerId, role, ox: e.clientX, oy: e.clientY, lastX: e.clientX, lastY: e.clientY, lastT: e.timeStamp, t0: e.timeStamp, flicked: false, moved: 0 };
      if (role === 'stick') {
        this.stick = rec;
        this.stickBase.classList.remove('hidden');
        this.stickBase.style.left = e.clientX + 'px';
        this.stickBase.style.top = e.clientY + 'px';
      } else {
        this.swipe = rec;
      }
    });
    zone.addEventListener('pointermove', e => {
      // locate the gesture this pointer belongs to (its role may differ from
      // the zone it started in — a mouse on the left half is a swipe)
      const rec = this.stick?.id === e.pointerId ? this.stick
        : this.swipe?.id === e.pointerId ? this.swipe : null;
      if (!rec) return;
      const dt = Math.max(1, e.timeStamp - rec.lastT);
      const vx = (e.clientX - rec.lastX) / dt;
      const vy = (e.clientY - rec.lastY) / dt;
      rec.moved = Math.max(rec.moved, Math.hypot(e.clientX - rec.ox, e.clientY - rec.oy));
      rec.lastX = e.clientX; rec.lastY = e.clientY; rec.lastT = e.timeStamp;

      // smash detected mid-gesture: lock the aim and charge until the
      // finger lifts — no need to wait for pointerup to start the attack
      if (rec.role === 'swipe' && !rec.chgAim && rec.moved >= SWIPE_MIN) {
        rec.chgAim = octant(e.clientX - rec.ox, e.clientY - rec.oy);
        this.state.chg = rec.chgAim;
      }

      if (rec.role === 'stick') {
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
        // vertical flicks on the movement thumb = jump / fast-fall+drop;
        // a sideways flick while the stick is pinned down = dodge roll
        if (!rec.flicked && this.state.my > 0.6
            && Math.abs(vx) > FLICK_SPEED && Math.abs(vx) > Math.abs(vy)) {
          rec.flicked = true; this.queue.push({ roll: Math.sign(vx) });
        }
        else if (!rec.flicked && vy < -FLICK_SPEED) { rec.flicked = true; this.queue.push({ jump: true }); }
        else if (!rec.flicked && vy > FLICK_SPEED) { rec.flicked = true; this.queue.push({ ff: true, drop: true }); }
        else if (rec.flicked && Math.abs(vy) < 0.12 && Math.abs(vx) < 0.12) rec.flicked = false; // re-arm
      }
    });
    const end = e => {
      const rec = this.stick?.id === e.pointerId ? this.stick
        : this.swipe?.id === e.pointerId ? this.swipe : null;
      if (!rec) return;
      if (rec.role === 'stick') {
        this.stick = null;
        this.state.mx = 0; this.state.my = 0;
        this.stickBase.classList.add('hidden');
        this.stickKnob.style.transform = 'translate(-50%,-50%)';
      } else {
        this.swipe = null;
        const dx = e.clientX - rec.ox, dy = e.clientY - rec.oy;
        const dist = Math.hypot(dx, dy);
        const dur = e.timeStamp - rec.t0;
        if (rec.chgAim) {
          // finger lifted: release the charged smash in the locked direction
          this.state.chg = null;
          this.queue.push({ atk: { kind: 'swipe', ...rec.chgAim } });
        } else if (dist < SWIPE_MIN && dur < TAP_MAX_MS) {
          // tap: quick attack aimed by the movement stick (neutral = facing)
          this.queue.push({ atk: { kind: 'tap', ...octant(this.state.mx, this.state.my, 0.35) } });
        } else if (dist >= SWIPE_MIN) {
          // swipe finished before any move event crossed the threshold
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
    // Which logical action this key drives, and which movement actions are
    // currently held — both read from the user's (re)bindable keymap.
    const act = settings.keyAction(k);
    const held = id => settings.keysFor(id).some(key => this.keys.has(key));
    const left = held('left'), right = held('right');
    const dir = (right ? 1 : 0) - (left ? 1 : 0);
    this.state.mx = dir;
    this.state.my = (held('down') ? 1 : 0) - (held('up') ? 1 : 0);
    if (!down) {
      // smash key released: fire the charged attack in the aim locked at press
      if (act === 'smash' && this.keyChg && !held('smash')) {
        this.queue.push({ atk: { kind: 'swipe', dx: this.keyChg.dx, dy: this.keyChg.dy } });
        this.keyChg = null;
      }
      return;
    }
    if (act === 'jump') this.queue.push({ jump: true });
    if (act === 'down') this.queue.push({ ff: true, drop: true });
    // a fresh sideways press while holding duck (down) = dodge roll
    if ((act === 'left' || act === 'right') && this.state.my > 0.6) {
      this.queue.push({ roll: act === 'right' ? 1 : -1 });
    }
    const aim = { dx: dir, dy: this.state.my };
    if (act === 'tap') this.queue.push({ atk: { kind: 'tap', ...aim } });
    if (act === 'smash') this.keyChg = aim;   // hold to charge the smash
    if (act === 'ab0') this.queue.push({ ab0: true });
    if (act === 'ab1') this.queue.push({ ab1: true });
  }

  // Right mouse button = heavy (smash) attack, aimed by the held movement
  // keys. Press locks the aim and starts charging; release fires the smash
  // in that aim — a quick click is an uncharged heavy, a hold charges it,
  // exactly like the K key. The side (back) button fires ability 1; middle
  // click (the wheel button) fires ability 2 — simple presses, no charging.
  _mouse(e, down) {
    if (!this.enabled) return;
    if (e.button === 2) {
      e.preventDefault();
      if (down) {
        this.mouseChg = { dx: Math.sign(this.state.mx), dy: Math.round(this.state.my) };
      } else if (this.mouseChg) {
        this.queue.push({ atk: { kind: 'swipe', dx: this.mouseChg.dx, dy: this.mouseChg.dy } });
        this.mouseChg = null;
      }
      return;
    }
    if (!down) return;   // remaining buttons are simple presses
    if (e.button === 3) { e.preventDefault(); this.queue.push({ ab0: true }); }        // side/back button
    else if (e.button === 1) { e.preventDefault(); this.queue.push({ ab1: true }); }   // middle click
  }

  // Scroll wheel as an alternative to the side/middle buttons: down for
  // ability 1, up for ability 2. Debounced so one physical notch (which can
  // dispatch several wheel events, especially on trackpads) fires once.
  _wheel(e) {
    if (!this.enabled || !e.deltaY) return;
    const now = performance.now();
    if (now - this.wheelT < 120) return;
    this.wheelT = now;
    e.preventDefault();
    this.queue.push(e.deltaY > 0 ? { ab0: true } : { ab1: true });
  }

  // Read the first connected gamepad: level movement merges with the touch/
  // keyboard stick (dominant axis wins), buttons and stick flicks queue the
  // same edge actions the other sources produce.
  _pollGamepad() {
    const pad = [...(navigator.getGamepads?.() || [])].find(p => p && p.connected);
    if (!pad) { this.padPrev = []; this.padFlicked = false; this.padChg = null; this.padRHeld = false; this.padRolled = false; return null; }

    let mx = pad.axes[0] || 0, my = pad.axes[1] || 0;
    if (Math.hypot(mx, my) < PAD_DEAD) { mx = 0; my = 0; }
    if (pad.buttons[14]?.pressed) mx = -1;      // dpad overrides the stick
    if (pad.buttons[15]?.pressed) mx = 1;
    if (pad.buttons[12]?.pressed) my = -1;
    if (pad.buttons[13]?.pressed) my = 1;
    const rx = pad.axes[2] || 0, ry = pad.axes[3] || 0;
    const rTilt = Math.hypot(rx, ry) > PAD_FLICK;

    if (this.enabled) {
      // down flicks mirror the touch stick: fast-fall/drop (up no longer jumps)
      if (!this.padFlicked && my > PAD_FLICK) { this.padFlicked = true; this.queue.push({ ff: true, drop: true }); }
      else if (this.padFlicked && Math.abs(my) < PAD_AIM_DEAD) this.padFlicked = false;
      // sideways tilt while ducked (stick or dpad pinned down) = dodge roll;
      // re-arms once the stick returns toward center
      if (!this.padRolled && my > PAD_FLICK && Math.abs(mx) > PAD_FLICK) {
        this.padRolled = true; this.queue.push({ roll: Math.sign(mx) });
      } else if (this.padRolled && Math.abs(mx) < PAD_AIM_DEAD) this.padRolled = false;

      for (let i = 0; i < PAD_SCAN; i++) {
        const act = settings.padAction(i);
        const down = !!pad.buttons[i]?.pressed;
        if (act && down && !this.padPrev[i]) {
          if (act === 'jump') this.queue.push({ jump: true });
          else if (act === 'tap') this.queue.push({ atk: { kind: 'tap', ...octant(mx, my, PAD_AIM_DEAD) } });
          else if (act === 'swipe') this.padChg = octant(mx, my, PAD_AIM_DEAD); // hold to charge
          else if (act === 'ab0') this.queue.push({ ab0: true });
          else if (act === 'ab1') this.queue.push({ ab1: true });
        }
        this.padPrev[i] = down;
      }
      // smash button released: fire the charged attack in the aim from press
      const swipeHeld = settings.padButtonsFor('swipe').some(i => pad.buttons[i]?.pressed);
      if (this.padChg && !swipeHeld) {
        this.queue.push({ atk: { kind: 'swipe', dx: this.padChg.dx, dy: this.padChg.dy } });
        this.padChg = null;
      }
      // right stick = instant smash in the tilt direction (uncharged);
      // re-arms once the stick returns to neutral
      if (rTilt && !this.padRHeld) {
        this.padRHeld = true;
        this.queue.push({ atk: { kind: 'swipe', ...octant(rx, ry) } });
      } else if (!rTilt && this.padRHeld) {
        this.padRHeld = false;
      }
    } else {
      for (let i = 0; i < PAD_SCAN; i++) this.padPrev[i] = !!pad.buttons[i]?.pressed;
      this.padFlicked = Math.abs(my) > PAD_FLICK;
      this.padChg = null;
      this.padRHeld = rTilt;
      this.padRolled = my > PAD_FLICK && Math.abs(mx) > PAD_FLICK;
    }
    return { mx, my };
  }

  // Drain into a single input frame for the sim/network.
  poll() {
    const g = this._pollGamepad();
    const out = {
      mx: this.state.mx, my: this.state.my,
      chg: this.state.chg || this.keyChg || this.mouseChg || this.padChg || null,
    };
    if (g) {
      if (Math.abs(g.mx) > Math.abs(out.mx)) out.mx = g.mx;
      if (Math.abs(g.my) > Math.abs(out.my)) out.my = g.my;
    }
    for (const q of this.queue) Object.assign(out, q);
    this.queue.length = 0;
    return out;
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on) {
      this.queue.length = 0;
      this.state.mx = 0; this.state.my = 0;
      this.state.chg = this.keyChg = this.mouseChg = this.padChg = null;
      this.padRHeld = false;
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
