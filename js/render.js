// Canvas renderer: draws the stage, fighters, projectiles and juice
// (particles, screen shake, KO bursts) from interpolated view state.

import { MAPS, DEFAULT_MAP, platsAt } from './game.js';
import { hatImage } from './ui.js';
import { BOX_X as HAT_X, BOX_Y as HAT_Y, BOX_W as HAT_BW, BOX_H as HAT_BH } from './hat.js';
import { SFX } from './sfx.js';

const F_W = 46, F_H = 64;

// Per-map look: background gradient, celestial motif, star behavior, stage
// palette, and optional ambient weather. Geometry comes from MAPS in
// game.js; looks live here.
const THEMES = {
  battlefield: {
    sky: ['#141a38', '#1c1430', '#090a14'],
    motif: 'moon',
    stars: 1,
    deck: '#2a3154', lip: '#3b4573', trim: '#ffb02e',
    plat: '#3b4573', platTop: '#556099',
  },
  flatlands: {
    sky: ['#2c1a3e', '#83303c', '#e8703a'],
    motif: 'sun',
    stars: 0.25,
    deck: '#4a2b33', lip: '#6b3a40', trim: '#ffd23e',
    plat: '#6b3a40', platTop: '#8a4f52',
  },
  skyline: {
    sky: ['#060a1c', '#101540', '#1c0e38'],
    motif: 'neonmoon',
    stars: 0.35,
    ambient: 'rain',
    deck: '#20263f', lip: '#303a63', trim: '#00e5ff',
    plat: '#303a63', platTop: '#48548c',
  },
  ruins: {
    sky: ['#241521', '#54222a', '#120c10'],
    motif: 'eclipse',
    stars: 0.45,
    ambient: 'embers',
    deck: '#3f3a42', lip: '#5a525c', trim: '#d0a35a',
    plat: '#5a525c', platTop: '#7a6f78',
  },
  foundry: {
    sky: ['#180b10', '#3a1218', '#070507'],
    motif: 'sun',
    stars: 0.15,
    deck: '#3a2f33', lip: '#5b4245', trim: '#ff6a2a',
    plat: '#5b4245', platTop: '#7c5a5c',
  },
  garden: {
    sky: ['#0b1f24', '#174034', '#071013'],
    motif: 'aurora',
    stars: 0.7,
    deck: '#254033', lip: '#38644e', trim: '#b4e06f',
    plat: '#38644e', platTop: '#4f896c',
  },
};

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cam = { x: 0, y: -120, zoom: 0.8 };
    this.shake = 0;
    this.particles = [];
    this.dmgPops = [];               // floating damage numbers
    this.flash = new Map();          // fighter id -> hit-flash time left
    this.auras = new Map();          // fighter id -> {kind, t} bubble/counter overlays
    this.rings = [];                 // expanding shock rings {x,y,r0,r1,t,life,color,w}
    this.ambient = [];               // ambient weather: embers & ash (ruins), rain (neon heights)
    this.setMap(DEFAULT_MAP);
    this.stars = Array.from({ length: 90 }, () => ({
      x: Math.random() * 2900 - 1450,
      y: Math.random() * 1300 - 1050,
      s: Math.random() * 1.6 + 0.4,
      tw: Math.random() * Math.PI * 2,
    }));
    this._resize();
    addEventListener('resize', () => this._resize());
  }

  setMap(id) {
    this.mapId = MAPS[id] ? id : DEFAULT_MAP;
    this.stage = MAPS[this.mapId];
    this.theme = THEMES[this.mapId] || THEMES[DEFAULT_MAP];
    this.ambient = [];
    this.city = this.mapId === 'ruins' ? buildCityScape('ruins')
      : this.mapId === 'skyline' ? buildCityScape('neon')
      : null;
  }

  _resize() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    this.canvas.width = innerWidth * dpr;
    this.canvas.height = innerHeight * dpr;
    this.dpr = dpr;
  }

  onEvents(events) {
    for (const ev of events || []) {
      SFX.event(ev);   // every cosmetic event makes its sound exactly once
      switch (ev.e) {
        case 'hit':
          this.burst(ev.x, ev.y, ev.heavy ? 18 : 8, ev.heavy ? '#ffdd55' : '#ffffff', ev.heavy ? 420 : 220);
          this.shake = Math.max(this.shake, ev.heavy ? 14 : 5);
          this.flash.set(ev.vic, 0.16);
          this.dmgPops.push({
            x: ev.x + (Math.random() - 0.5) * 16, y: ev.y - F_H / 2 - 10,
            txt: String(ev.dmg), t: 0, life: ev.heavy ? 0.85 : 0.65,
            heavy: !!ev.heavy,
          });
          break;
        case 'ko':
          this.burst(ev.x, ev.y, 40, '#ff5470', 700);
          this.burst(ev.x, ev.y, 20, '#ffffff', 500);
          this.shake = 22;
          break;
        case 'shockwave':
          this.burst(ev.x, ev.y, 26, '#ffb02e', 520);
          this.rings.push({ x: ev.x, y: ev.y, r0: 30, r1: 190, t: 0, life: 0.4, color: '#ffb02e', w: 7 });
          this.shake = Math.max(this.shake, 10);
          break;
        case 'ability':
          this._abilityFx(ev);
          break;
        case 'augment':
          this._augmentFx(ev);
          break;
        case 'counter':
          this.burst(ev.x, ev.y, 14, '#38b6ff', 300);
          break;
        case 'secondwind':
          this.burst(ev.x, ev.y, 16, '#3ddc84', 260);
          break;
        case 'gale':
          this.burst(ev.x, ev.y, 24, '#bfe3ff', 560);
          // show the actual windbox: an expanding gust ring out to its range
          this.rings.push({ x: ev.x, y: ev.y, r0: 30, r1: 200, t: 0, life: 0.45, color: '#bfe3ff', w: 8 });
          this.rings.push({ x: ev.x, y: ev.y, r0: 10, r1: 160, t: 0, life: 0.35, color: '#eaf7ff', w: 4 });
          this.shake = Math.max(this.shake, 7);
          break;
        case 'mend':
          this.burst(ev.x, ev.y, 14, '#3ddc84', 220);
          break;
        case 'land':
          this.burst(ev.x, ev.y, 4, '#8899cc', 90);
          break;
        case 'jump':
          this.burst(ev.x, ev.y, 5, '#aabbee', 120);
          break;
        case 'ledge':
          this.burst(ev.x, ev.y, 6, '#8fd3ff', 150);
          break;
        case 'roll':
          this.burst(ev.x, ev.y, 5, '#aabbee', 110);
          break;
        case 'duck':
          this.burst(ev.x, ev.y, 4, '#8899cc', 90);
          break;
        case 'block':
          this.burst(ev.x, ev.y, 10, '#8fd3ff', 260);
          this.shake = Math.max(this.shake, 3);
          break;
        case 'crush':
          this.burst(ev.x, ev.y, 26, '#ffd23e', 480);
          this.burst(ev.x, ev.y, 12, '#ffffff', 320);
          this.shake = Math.max(this.shake, 12);
          break;
      }
    }
  }

  // Cast flair per ability, so every ability visibly announces itself.
  // Bubble and counter get persistent auras (drawn each frame while their
  // sim effect lasts); the rest get bursts, rings, or directional streaks.
  _abilityFx(ev) {
    switch (ev.ability) {
      case 'bubble':
        this.auras.set(ev.id, { kind: 'bubble', t: 1.5 });   // matches sim invuln
        this.burst(ev.x, ev.y, 14, '#7fe9ff', 240);
        break;
      case 'counter':
        this.auras.set(ev.id, { kind: 'counter', t: 0.6 });  // matches parry window
        this.burst(ev.x, ev.y, 8, '#38b6ff', 150);
        break;
      case 'uppercut':
        // column of rising sparks
        for (let i = 0; i < 16; i++) {
          this.particles.push({
            x: ev.x + (Math.random() - 0.5) * 34, y: ev.y + Math.random() * 26,
            vx: (Math.random() - 0.5) * 140, vy: -420 - Math.random() * 520,
            life: 0.4 + Math.random() * 0.25, t: 0, color: '#ffd23e',
            r: 2 + Math.random() * 3.5,
          });
        }
        this.shake = Math.max(this.shake, 6);
        break;
      case 'dashstrike':
        // horizontal speed streaks trailing the lunge
        for (let i = 0; i < 12; i++) {
          this.particles.push({
            x: ev.x - (Math.random() - 0.2) * 40, y: ev.y + (Math.random() - 0.5) * 40,
            vx: -(200 + Math.random() * 300) * Math.sign(ev.dir || 1), vy: (Math.random() - 0.5) * 60,
            life: 0.3 + Math.random() * 0.2, t: 0, color: '#ffb02e',
            r: 2 + Math.random() * 3,
          });
        }
        break;
      case 'blink':
        this.burst(ev.x, ev.y, 16, '#c59cff', 320);
        this.rings.push({ x: ev.x, y: ev.y, r0: 8, r1: 70, t: 0, life: 0.3, color: '#c59cff', w: 5 });
        break;
      case 'fireball':  this.burst(ev.x, ev.y, 8, '#ff8a2e', 220); break;
      case 'boomerang': this.burst(ev.x, ev.y, 8, '#8fd3ff', 200); break;
      case 'volley':    this.burst(ev.x, ev.y, 12, '#ffd23e', 260); break;
      case 'hook':      this.burst(ev.x, ev.y, 8, '#c9d4e8', 200); break;
      case 'trap':      this.burst(ev.x, ev.y, 8, '#9aa3c7', 160); break;
      case 'mend':      break;   // the 'mend' event already sparkles green
      case 'shockwave': this.burst(ev.x, ev.y, 8, '#ffb02e', 180); break; // cast; slam booms later
      case 'gale':      break;   // the 'gale' event draws the gust rings
    }
  }

  _augmentFx(ev) {
    switch (ev.aug) {
      case 'vampiric':
        this.burst(ev.x, ev.y - 12, 8, '#ff5470', 180);
        this.dmgPops.push({ x: ev.x, y: ev.y - F_H / 2 - 24, txt: 'LEECH', t: 0, life: 0.55, heavy: false, color: '#ff5470' });
        break;
      case 'thorns':
        this.burst(ev.x, ev.y, 10, '#8dde59', 220);
        this.rings.push({ x: ev.x, y: ev.y, r0: 18, r1: 56, t: 0, life: 0.28, color: '#8dde59', w: 5 });
        break;
      case 'berserker':
        this.burst(ev.x, ev.y - F_H / 2, 6, '#ff3d3d', 170);
        this.rings.push({ x: ev.x, y: ev.y, r0: 30, r1: 62, t: 0, life: 0.22, color: '#ff3d3d', w: 4 });
        break;
      case 'acrobat':
        this.burst(ev.x, ev.y, 10, '#b388ff', 240);
        this.dmgPops.push({ x: ev.x, y: ev.y - F_H / 2 - 20, txt: 'JUMPS', t: 0, life: 0.5, heavy: false, color: '#b388ff' });
        break;
      case 'sniper':
        this.burst(ev.x, ev.y, 8, '#ffd23e', 260);
        this.rings.push({ x: ev.x, y: ev.y, r0: 8, r1: 44, t: 0, life: 0.24, color: '#ffd23e', w: 3 });
        break;
      case 'momentum':
        this.burst(ev.x, ev.y, 8, '#ff8a5c', 230);
        this.dmgPops.push({ x: ev.x, y: ev.y - F_H / 2 - 20, txt: 'RUSH', t: 0, life: 0.5, heavy: false, color: '#ff8a5c' });
        break;
      case 'bulwark':
        this.rings.push({ x: ev.x, y: ev.y, r0: 20, r1: 50, t: 0, life: 0.26, color: '#8fd3ff', w: 5 });
        break;
      case 'executioner':
        this.burst(ev.x, ev.y, 12, '#ff2e63', 300);
        this.dmgPops.push({ x: ev.x, y: ev.y - F_H / 2 - 24, txt: 'DOOM', t: 0, life: 0.6, heavy: true, color: '#ff2e63' });
        break;
      case 'reaper':
        this.burst(ev.x, ev.y - 12, 12, '#b388ff', 240);
        this.dmgPops.push({ x: ev.x, y: ev.y - F_H / 2 - 24, txt: 'REAP', t: 0, life: 0.6, heavy: false, color: '#b388ff' });
        break;
    }
  }

  burst(x, y, n, color, speed) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.35 + Math.random() * 0.65);
      this.particles.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.2,
        life: 0.35 + Math.random() * 0.4, t: 0, color,
        r: 2 + Math.random() * 3.5,
      });
    }
  }

  draw(view, dt, myId) {
    const { ctx, canvas } = this;
    const W = canvas.width, H = canvas.height;

    // --- camera: frame all live fighters ---
    const live = view.fighters.filter(f => !f.dead);
    if (live.length) {
      let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
      for (const f of live) {
        minX = Math.min(minX, f.x); maxX = Math.max(maxX, f.x);
        minY = Math.min(minY, f.y); maxY = Math.max(maxY, f.y);
      }
      const pad = 260;
      const tx = (minX + maxX) / 2;
      const ty = (minY + maxY) / 2 - 40;
      const zx = W / (maxX - minX + pad * 2);
      const zy = H / (maxY - minY + pad * 2);
      const tz = Math.max(0.30 * this.dpr, Math.min(1.05 * this.dpr, Math.min(zx, zy)));
      const k = 1 - Math.pow(0.001, dt);
      this.cam.x += (tx - this.cam.x) * k;
      this.cam.y += (ty - this.cam.y) * k;
      this.cam.zoom += (tz - this.cam.zoom) * k;
    }
    this.shake = Math.max(0, this.shake - dt * 60);
    const shx = (Math.random() - 0.5) * this.shake * this.dpr;
    const shy = (Math.random() - 0.5) * this.shake * this.dpr;

    // --- background (themed per map) ---
    const th = this.theme;
    const grd = ctx.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, th.sky[0]);
    grd.addColorStop(0.6, th.sky[1]);
    grd.addColorStop(1, th.sky[2]);
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);

    const t = performance.now() / 1000;
    this._motif(ctx, W, H, t);

    ctx.fillStyle = '#ffffff';
    for (const s of this.stars) {
      const px = W / 2 + (s.x - this.cam.x * 0.15) * this.dpr * 0.5;
      const py = H / 2 + (s.y - this.cam.y * 0.15) * this.dpr * 0.5;
      if (px < 0 || px > W || py < 0 || py > H) continue;
      ctx.globalAlpha = (0.3 + 0.3 * Math.sin(t * 2 + s.tw)) * th.stars;
      ctx.fillRect(px, py, s.s * this.dpr, s.s * this.dpr);
    }
    ctx.globalAlpha = 1;

    ctx.save();
    ctx.translate(W / 2 + shx, H / 2 + shy);
    ctx.scale(this.cam.zoom, this.cam.zoom);
    ctx.translate(-this.cam.x, -this.cam.y);

    if (this.city) this._cityBackdrop(ctx, t);
    this._stage(ctx, view.tick ?? 0, t);
    if (this.theme.ambient) this._ambient(ctx, dt, t);

    // tick down hit flashes
    for (const [id, v] of this.flash) {
      if (v - dt <= 0) this.flash.delete(id);
      else this.flash.set(id, v - dt);
    }

    // projectiles
    for (const p of view.projectiles || []) {
      ctx.save();
      ctx.translate(p.x, p.y);
      if (p.kind === 'boomerang') {
        ctx.rotate(t * 18 + p.eid);
        ctx.fillStyle = '#8fd3ff';
        roundRect(ctx, -17, -5, 34, 10, 5); ctx.fill();
        roundRect(ctx, -5, -17, 10, 34, 5); ctx.fill();
        ctx.fillStyle = '#eaf7ff';
        ctx.beginPath(); ctx.arc(0, 0, 4.5, 0, 7); ctx.fill();
      } else if (p.kind === 'hook') {
        // spinning three-prong claw
        ctx.rotate(t * 14 + p.eid);
        ctx.strokeStyle = '#c9d4e8';
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        for (const a of [0, 2.1, 4.2]) {
          ctx.beginPath();
          ctx.arc(0, 0, 11, a, a + 1.6);
          ctx.stroke();
        }
        ctx.fillStyle = '#eaf7ff';
        ctx.beginPath(); ctx.arc(0, 0, 3.5, 0, 7); ctx.fill();
      } else if (p.kind === 'trap') {
        // armed jaws, teeth glinting while it waits
        const glint = 0.6 + Math.abs(Math.sin(t * 6 + p.eid)) * 0.4;
        ctx.fillStyle = '#9aa3c7';
        roundRect(ctx, -16, 4, 32, 7, 3); ctx.fill();   // base plate
        ctx.globalAlpha = glint;
        ctx.fillStyle = '#eaf7ff';
        for (const dx of [-12, -4, 4]) {                 // teeth
          ctx.beginPath();
          ctx.moveTo(dx, 5); ctx.lineTo(dx + 4, -9); ctx.lineTo(dx + 8, 5);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      } else {
        const bolt = p.kind === 'bolt';
        const flick = 1 + Math.sin(t * 30 + p.eid) * 0.2;
        ctx.fillStyle = '#ff8a2e';
        ctx.beginPath(); ctx.arc(0, 0, (bolt ? 9 : 13) * flick, 0, 7); ctx.fill();
        ctx.fillStyle = '#ffd23e';
        ctx.beginPath(); ctx.arc(0, 0, (bolt ? 4.5 : 7) * flick, 0, 7); ctx.fill();
      }
      ctx.restore();
    }

    for (const f of view.fighters) if (!f.dead) this._fighter(ctx, f, f.id === myId, t);

    // attack hitboxes — the exact rects the sim tests, drawn in world space
    // so squash & stretch never distorts them
    for (const f of view.fighters) if (!f.dead && f.hb) this._hitbox(ctx, f, t);

    // expanding shock rings (gale gusts, shockwave blasts, blink pops)
    for (const ring of this.rings) {
      ring.t += dt;
      const k = Math.min(1, ring.t / ring.life);
      if (k >= 1) continue;
      const ease = 1 - (1 - k) * (1 - k);      // fast out, soft landing
      ctx.globalAlpha = (1 - k) * 0.9;
      ctx.strokeStyle = ring.color;
      ctx.lineWidth = ring.w * (1 - k * 0.6);
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, ring.r0 + (ring.r1 - ring.r0) * ease, 0, 7);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    this.rings = this.rings.filter(r => r.t < r.life);

    // timed fighter auras: bubble shield dome & counter parry stance.
    // Timers tick for every entry (even fighters missing from this frame's
    // view) so auras can't outlive their owner; drawing is per-fighter.
    for (const [id, a] of this.auras) {
      if ((a.t -= dt) <= 0) this.auras.delete(id);
    }
    for (const f of view.fighters) {
      const a = this.auras.get(f.id);
      if (!a || f.dead) continue;
      ctx.save();
      ctx.translate(f.x, f.y);
      if (a.kind === 'bubble') {
        // shimmering soap-bubble dome, straining (flickering) as it expires
        const wob = 1 + Math.sin(t * 9) * 0.04;
        const dying = a.t < 0.4 ? 0.4 + 0.6 * Math.abs(Math.sin(t * 25)) : 1;
        const r = 52 * wob;
        const g = ctx.createRadialGradient(0, 0, r * 0.4, 0, 0, r);
        g.addColorStop(0, 'rgba(127, 233, 255, 0)');
        g.addColorStop(0.8, 'rgba(127, 233, 255, .10)');
        g.addColorStop(1, 'rgba(127, 233, 255, .38)');
        ctx.globalAlpha = dying;
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
        ctx.strokeStyle = 'rgba(210, 248, 255, .85)';
        ctx.lineWidth = 2.5;
        ctx.stroke();
        // gliding highlight arc
        ctx.strokeStyle = 'rgba(255,255,255,.9)';
        ctx.lineWidth = 3.5;
        ctx.beginPath(); ctx.arc(0, 0, r - 6, t * 2.2, t * 2.2 + 0.9); ctx.stroke();
      } else if (a.kind === 'counter') {
        // spinning parry brackets that tighten as the window closes
        const r = 44 + a.t * 26;
        ctx.strokeStyle = '#38b6ff';
        ctx.lineWidth = 5;
        ctx.globalAlpha = 0.55 + 0.45 * Math.sin(t * 22);
        for (const off of [0, Math.PI]) {
          ctx.beginPath(); ctx.arc(0, 0, r, t * 7 + off, t * 7 + off + 1.15); ctx.stroke();
        }
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = '#8fd3ff';
        ctx.font = 'italic 900 17px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('!', 0, -F_H / 2 - 20);
      }
      ctx.restore();
    }

    // particles
    for (const p of this.particles) {
      p.t += dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vy += 900 * dt;
      const a = 1 - p.t / p.life;
      if (a <= 0) continue;
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * a + 0.5, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
    this.particles = this.particles.filter(p => p.t < p.life);

    // floating damage numbers
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const d of this.dmgPops) {
      d.t += dt;
      const k = d.t / d.life;
      if (k >= 1) continue;
      const pop = Math.min(1, d.t * 9);          // quick scale-in punch
      const size = (d.heavy ? 32 : 22) * (0.5 + 0.5 * pop);
      ctx.globalAlpha = 1 - k * k;
      ctx.font = `italic 900 ${size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(10, 12, 25, .75)';
      ctx.fillStyle = d.color || (d.heavy ? '#ffdd55' : '#ffffff');
      const y = d.y - 46 * k;
      ctx.strokeText(d.txt, d.x, y);
      ctx.fillText(d.txt, d.x, y);
    }
    ctx.globalAlpha = 1;
    this.dmgPops = this.dmgPops.filter(d => d.t < d.life);

    ctx.restore();
  }

  // Sky centerpiece per theme: parallaxes gently with the camera.
  _motif(ctx, W, H, t) {
    const px = W * 0.72 - this.cam.x * 0.05 * this.dpr;
    const py = H * 0.26 - this.cam.y * 0.05 * this.dpr;
    const r = Math.min(W, H) * 0.09;
    if (this.theme.motif === 'moon') {
      ctx.fillStyle = '#e8ecff';
      ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.arc(px, py, r, 0, 7); ctx.fill();
      ctx.fillStyle = this.theme.sky[0];               // bite = crescent
      ctx.beginPath(); ctx.arc(px + r * 0.45, py - r * 0.18, r * 0.85, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
    } else if (this.theme.motif === 'sun') {
      const sy = H * 0.52 - this.cam.y * 0.05 * this.dpr;
      const g = ctx.createRadialGradient(px, sy, 0, px, sy, r * 3);
      g.addColorStop(0, 'rgba(255, 210, 62, .95)');
      g.addColorStop(0.35, 'rgba(255, 138, 46, .55)');
      g.addColorStop(1, 'rgba(255, 138, 46, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(px - r * 3, sy - r * 3, r * 6, r * 6);
      ctx.fillStyle = '#ffd23e';
      ctx.beginPath(); ctx.arc(px, sy, r * 1.15, 0, 7); ctx.fill();
    } else if (this.theme.motif === 'aurora') {
      ctx.lineWidth = Math.max(8, H * 0.045);
      ctx.lineCap = 'round';
      for (let b = 0; b < 3; b++) {
        ctx.strokeStyle = b === 1 ? 'rgba(61, 220, 164, .16)' : 'rgba(56, 182, 255, .12)';
        ctx.beginPath();
        for (let i = 0; i <= 8; i++) {
          const x = (W / 8) * i;
          const y = H * (0.16 + b * 0.07)
            + Math.sin(t * 0.35 + i * 0.9 + b * 2.1) * H * 0.05
            - this.cam.y * 0.04 * this.dpr;
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.stroke();
      }
    } else if (this.theme.motif === 'neonmoon') {
      // oversized rain-haloed moon hanging over the metropolis
      const R = r * 1.9;
      const g = ctx.createRadialGradient(px, py, R * 0.5, px, py, R * 2.6);
      g.addColorStop(0, 'rgba(150, 200, 255, .30)');
      g.addColorStop(0.5, 'rgba(120, 150, 255, .10)');
      g.addColorStop(1, 'rgba(120, 150, 255, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(px - R * 2.6, py - R * 2.6, R * 5.2, R * 5.2);
      ctx.fillStyle = '#cfe0ff';
      ctx.globalAlpha = 0.95;
      ctx.beginPath(); ctx.arc(px, py, R, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(140, 160, 210, .5)';       // maria
      ctx.beginPath(); ctx.arc(px - R * 0.3, py - R * 0.15, R * 0.3, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(px + R * 0.25, py + R * 0.3, R * 0.2, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(px + R * 0.1, py - R * 0.42, R * 0.13, 0, 7); ctx.fill();
      // cloud shreds dragging across the face
      ctx.fillStyle = this.theme.sky[1];
      ctx.globalAlpha = 0.75;
      for (let i = 0; i < 3; i++) {
        const cx = px + (((t * (14 + i * 5) + i * 300) % (R * 6)) - R * 3);
        const cy = py - R * 0.4 + i * R * 0.42;
        ctx.beginPath();
        ctx.ellipse(cx, cy, R * (0.7 - i * 0.12), R * 0.11, 0, 0, 7);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    } else if (this.theme.motif === 'eclipse') {
      // eclipsed sun: searing corona bleeding around a black disc
      const breathe = 1 + Math.sin(t * 0.8) * 0.05;
      const g = ctx.createRadialGradient(px, py, r * 0.7, px, py, r * 3.1 * breathe);
      g.addColorStop(0, 'rgba(255, 150, 70, .55)');
      g.addColorStop(0.4, 'rgba(255, 110, 60, .22)');
      g.addColorStop(1, 'rgba(255, 110, 60, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(px - r * 3.2, py - r * 3.2, r * 6.4, r * 6.4);
      ctx.fillStyle = '#0d0a10';
      ctx.beginPath(); ctx.arc(px, py, r * 1.02, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(255, 205, 140, .9)';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(px, py, r * 1.04, 0, 7); ctx.stroke();
      // diamond-ring glint crawling along the limb
      const ga = t * 0.11;
      const gx = px + Math.cos(ga) * r * 1.04, gy = py + Math.sin(ga) * r * 1.04;
      const dg = ctx.createRadialGradient(gx, gy, 0, gx, gy, r * 0.55);
      dg.addColorStop(0, 'rgba(255, 240, 210, .95)');
      dg.addColorStop(1, 'rgba(255, 240, 210, 0)');
      ctx.fillStyle = dg;
      ctx.fillRect(gx - r * 0.55, gy - r * 0.55, r * 1.1, r * 1.1);
    }
  }

  _stage(ctx, tickF = 0, t = 0) {
    const plats = platsAt(this.mapId, tickF);
    if (this.mapId === 'ruins') { this._ruinsStage(ctx, plats, t); return; }
    if (this.mapId === 'skyline') { this._skylineStage(ctx, plats, tickF, t); return; }
    const th = this.theme;
    const m = this.stage.main;
    // main platform with themed deck & lip
    ctx.fillStyle = th.deck;
    roundRect(ctx, m.x, m.y, m.w, m.h + 30, 12); ctx.fill();
    ctx.fillStyle = th.lip;
    roundRect(ctx, m.x, m.y, m.w, 12, 6); ctx.fill();
    ctx.fillStyle = th.trim;
    ctx.fillRect(m.x + 8, m.y + 1, m.w - 16, 3);

    for (const p of plats) {
      ctx.fillStyle = th.plat;
      roundRect(ctx, p.x, p.y, p.w, 12, 6); ctx.fill();
      ctx.fillStyle = th.platTop;
      ctx.fillRect(p.x + 6, p.y + 1, p.w - 12, 3);
    }
  }

  // Ruined City: parallax skyline of collapsed towers behind a broken
  // freeway deck, a lattice crane sweeping its girder over the fight, and
  // rubble chunks bobbing on failing grav-thrusters off each lip.
  _cityBackdrop(ctx, t) {
    const c = this.city;
    if (c.style === 'neon') { this._neonBackdrop(ctx, c, t); return; }
    for (const layer of c.layers) {
      const ox = this.cam.x * layer.lag, oy = this.cam.y * layer.lag * 0.85;
      ctx.fillStyle = layer.fill;
      for (const b of layer.bldgs) {
        const x = b.x + ox, yb = c.baseY + oy, yt = b.yTop + oy;
        ctx.beginPath();                       // silhouette with a collapsed top
        ctx.moveTo(x, yb);
        ctx.lineTo(x, yt + b.lgap);
        ctx.lineTo(x + b.w * b.brk, yt);
        ctx.lineTo(x + b.w, yt + b.rgap);
        ctx.lineTo(x + b.w, yb);
        ctx.closePath(); ctx.fill();
        if (b.spire) {                         // bent antenna mast
          ctx.strokeStyle = layer.fill;
          ctx.lineWidth = 3.5;
          ctx.beginPath();
          ctx.moveTo(x + b.w * b.brk, yt);
          ctx.lineTo(x + b.w * b.brk + 8, yt - 44);
          ctx.stroke();
        }
      }
      if (!layer.windows) continue;
      for (const b of layer.bldgs) {           // survivors' lights & fires
        const x = b.x + ox, yt = b.yTop + oy;
        for (const w of b.wins) {
          const fl = w.fire
            ? 0.35 + 0.65 * Math.abs(Math.sin(t * 6 + w.ph))
            : 0.45 + 0.4 * Math.sin(t * w.spd + w.ph);
          if (fl <= 0.14) continue;
          ctx.globalAlpha = Math.min(0.85, fl);
          ctx.fillStyle = w.fire ? '#ff6a3a' : '#ffc46a';
          ctx.fillRect(x + w.dx, yt + w.dy, 9, 13);
        }
        ctx.globalAlpha = 1;
      }
    }
    // burning floors: flickering glow + a lazy smoke column (stateless)
    for (const f of c.fires) {
      const fx = f.x + this.cam.x * f.lag, fy = f.y + this.cam.y * f.lag * 0.85;
      const flick = 0.7 + 0.3 * Math.sin(t * 11) * Math.sin(t * 5.3 + 1);
      const g = ctx.createRadialGradient(fx, fy, 0, fx, fy, 110);
      g.addColorStop(0, `rgba(255, 130, 50, ${(0.5 * flick).toFixed(3)})`);
      g.addColorStop(1, 'rgba(255, 130, 50, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(fx - 110, fy - 110, 220, 220);
      for (let i = 0; i < 9; i++) {
        const k = (t * 0.11 + i / 9) % 1;
        const sx = fx + Math.sin(t * 0.5 + i * 1.9 + k * 5) * (14 + k * 44);
        const sy = fy - 8 - k * 300;
        ctx.globalAlpha = (1 - k) * 0.2;
        ctx.fillStyle = '#4a3f4a';
        ctx.beginPath(); ctx.arc(sx, sy, 9 + k * 30, 0, 7); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  // Neon Heights: intact mega-towers in three parallax rows — windows
  // burning through the rain, neon edge strips, holo-billboards, beacons,
  // and air traffic threading the lanes between the spires.
  _neonBackdrop(ctx, c, t) {
    for (const layer of c.layers) {
      const ox = this.cam.x * layer.lag, oy = this.cam.y * layer.lag * 0.85;
      ctx.fillStyle = layer.fill;
      for (const b of layer.bldgs) {
        const x = b.x + ox, yb = c.baseY + oy, yt = b.yTop + oy;
        ctx.fillRect(x, yt, b.w, yb - yt);
        if (b.spire) {                             // antenna + warning beacon
          ctx.strokeStyle = layer.fill;
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(x + b.w / 2, yt); ctx.lineTo(x + b.w / 2, yt - 52);
          ctx.stroke();
          if (Math.sin(t * 2.4 + b.x) > 0.4) {
            ctx.fillStyle = '#ff3d5e';
            ctx.beginPath(); ctx.arc(x + b.w / 2, yt - 56, 3.5, 0, 7); ctx.fill();
            ctx.fillStyle = layer.fill;
          }
        }
      }
      if (!layer.windows) continue;
      for (const b of layer.bldgs) {
        const x = b.x + ox, yt = b.yTop + oy, yb = c.baseY + oy;
        for (const w of b.wins) {
          const fl = 0.55 + 0.45 * Math.sin(t * w.spd + w.ph);
          ctx.globalAlpha = Math.min(0.8, Math.max(0.12, fl));
          ctx.fillStyle = w.c;
          ctx.fillRect(x + w.dx, yt + w.dy, 8, 12);
        }
        ctx.globalAlpha = 1;
        if (b.strip) {                             // neon edge strip + spill
          const sx = x + (b.strip.side > 0 ? b.w - 4 : 1);
          ctx.globalAlpha = 0.25;
          ctx.fillStyle = b.strip.color;
          ctx.fillRect(sx - 2, yt + 6, 8, yb - yt - 12);
          ctx.globalAlpha = 0.9;
          ctx.fillRect(sx, yt + 6, 2.5, yb - yt - 12);
          ctx.globalAlpha = 1;
        }
        if (b.board) {                             // holo-billboard
          const bx = x + b.board.dx, by = yt + b.board.dy;
          const pulse = 0.55 + 0.45 * Math.sin(t * 1.1 + b.board.ph);
          ctx.globalAlpha = 0.14 * pulse;
          ctx.fillStyle = b.board.c1;
          ctx.fillRect(bx - 8, by - 8, b.board.w + 16, b.board.h + 16);
          ctx.globalAlpha = 0.55 + 0.3 * pulse;
          const g = ctx.createLinearGradient(bx, by, bx, by + b.board.h);
          g.addColorStop(0, b.board.c1);
          g.addColorStop(1, b.board.c2);
          ctx.fillStyle = g;
          ctx.fillRect(bx, by, b.board.w, b.board.h);
          ctx.globalAlpha = 0.25;                  // scanlines
          ctx.fillStyle = '#061020';
          for (let sy = by + 3; sy < by + b.board.h; sy += 7) ctx.fillRect(bx, sy, b.board.w, 2);
          ctx.globalAlpha = 1;
        }
      }
    }
    // air traffic: running lights sliding the lanes between the spires
    for (let i = 0; i < 6; i++) {
      const dir = i % 2 ? 1 : -1;
      const lag = 0.5 + (i % 3) * 0.1;
      const span = 3400;
      const prog = ((t * (60 + (i % 3) * 38) + i * 700) % span) - span / 2;
      const x = dir * prog + this.cam.x * lag;
      const y = -420 + i * 64 + Math.sin(t * 0.5 + i * 2.2) * 16 + this.cam.y * lag * 0.85;
      ctx.globalAlpha = 0.45;                      // light trail
      ctx.strokeStyle = i % 2 ? '#ff9ecf' : '#8fd3ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y); ctx.lineTo(x - dir * 46, y);
      ctx.stroke();
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(x, y, 2.6, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  _ruinsStage(ctx, plats, t) {
    const th = this.theme, m = this.stage.main;

    // cracked pillars carrying the deck down into the haze
    ctx.fillStyle = '#28222e';
    for (const px of [m.x + 120, m.x + m.w - 120]) {
      ctx.fillRect(px - 24, m.y + 40, 48, 400);
    }
    ctx.strokeStyle = 'rgba(0,0,0,.5)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(m.x + 108, m.y + 90); ctx.lineTo(m.x + 124, m.y + 150); ctx.lineTo(m.x + 114, m.y + 210);
    ctx.moveTo(m.x + m.w - 132, m.y + 120); ctx.lineTo(m.x + m.w - 116, m.y + 180);
    ctx.stroke();

    // collapsed freeway deck
    ctx.fillStyle = th.deck;
    roundRect(ctx, m.x, m.y, m.w, m.h + 30, 10); ctx.fill();
    ctx.fillStyle = '#2b2733';                    // asphalt wear course
    ctx.fillRect(m.x + 3, m.y, m.w - 6, 15);
    ctx.globalAlpha = 0.5;                        // faded lane dashes
    ctx.fillStyle = th.trim;
    for (let i = 0; i < Math.floor(m.w / 74); i++) {
      if (i % 4 === 2) continue;                  // scoured-off stretches
      ctx.fillRect(m.x + 22 + i * 74, m.y + 6, 36, 3.5);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#1c1822';                    // crumbling lip bites
    for (const [bx, bw] of [[m.x + 54, 26], [m.x + m.w * 0.42, 34], [m.x + m.w - 96, 22]]) {
      ctx.beginPath();
      ctx.moveTo(bx, m.y); ctx.lineTo(bx + bw / 2, m.y + 9); ctx.lineTo(bx + bw, m.y);
      ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(0,0,0,.45)';          // face cracks
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(m.x + m.w * 0.3, m.y + 16); ctx.lineTo(m.x + m.w * 0.33, m.y + 40); ctx.lineTo(m.x + m.w * 0.3, m.y + 62);
    ctx.moveTo(m.x + m.w * 0.72, m.y + 16); ctx.lineTo(m.x + m.w * 0.69, m.y + 44); ctx.lineTo(m.x + m.w * 0.73, m.y + 70);
    ctx.stroke();
    ctx.strokeStyle = '#7a4a3a';                  // rebar hooks off both lips
    ctx.lineWidth = 3;
    for (const [sx, dir] of [[m.x, -1], [m.x + m.w, 1]]) {
      for (const dy of [14, 30]) {
        ctx.beginPath();
        ctx.moveTo(sx, m.y + dy);
        ctx.quadraticCurveTo(sx + dir * 16, m.y + dy + 2, sx + dir * 20, m.y + dy + 14);
        ctx.stroke();
      }
    }

    // wrecking crane: lattice tower + boom that the girder trolley rides
    const boomY = -560;
    ctx.strokeStyle = '#241d28';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(-620, 430); ctx.lineTo(-620, boomY);
    ctx.moveTo(-566, 430); ctx.lineTo(-566, boomY);
    ctx.stroke();
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    for (let y = 430; y > boomY; y -= 54) {       // lattice braces
      ctx.moveTo(-620, y); ctx.lineTo(-566, y - 54);
      ctx.moveTo(-566, y); ctx.lineTo(-620, y - 54);
    }
    ctx.stroke();
    ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(-640, boomY); ctx.lineTo(560, boomY); ctx.stroke();
    ctx.lineWidth = 3;
    ctx.beginPath();                              // tie lines to the mast top
    ctx.moveTo(-593, boomY - 90); ctx.lineTo(-300, boomY);
    ctx.moveTo(-593, boomY - 90); ctx.lineTo(200, boomY);
    ctx.moveTo(-593, boomY); ctx.lineTo(-593, boomY - 90);
    ctx.stroke();

    for (const [i, p] of plats.entries()) {
      const spec = this.stage.plats[i];
      if (spec.move?.dx) {
        // trolley + cables + trussed girder swinging over the deck
        const cx = p.x + p.w / 2;
        ctx.fillStyle = '#241d28';
        roundRect(ctx, cx - 26, boomY - 8, 52, 16, 5); ctx.fill();
        if (Math.sin(t * 4.2) > 0.2) {            // blinking hazard beacon
          ctx.fillStyle = '#ff3d3d';
          ctx.beginPath(); ctx.arc(cx, boomY - 14, 4, 0, 7); ctx.fill();
        }
        ctx.strokeStyle = '#3a2f3e';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(cx - 18, boomY + 8); ctx.lineTo(p.x + 10, p.y);
        ctx.moveTo(cx + 18, boomY + 8); ctx.lineTo(p.x + p.w - 10, p.y);
        ctx.stroke();
        ctx.fillStyle = '#6e4a38';                // rusted girder body
        roundRect(ctx, p.x, p.y, p.w, 14, 3); ctx.fill();
        ctx.fillStyle = '#8a5f42';
        ctx.fillRect(p.x + 4, p.y + 1, p.w - 8, 3);
        ctx.strokeStyle = 'rgba(0,0,0,.4)';       // truss braces
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let x = p.x + 8; x < p.x + p.w - 12; x += 22) {
          ctx.moveTo(x, p.y + 12); ctx.lineTo(x + 11, p.y + 2);
          ctx.moveTo(x + 11, p.y + 2); ctx.lineTo(x + 22, p.y + 12);
        }
        ctx.stroke();
        for (const hx of [p.x, p.x + p.w - 12]) { // hazard-striped tips
          ctx.fillStyle = '#ffd23e';
          ctx.fillRect(hx, p.y, 12, 14);
          ctx.fillStyle = '#1c1822';
          ctx.fillRect(hx + 4, p.y, 4, 14);
        }
      } else if (spec.move?.dy) {
        // rubble chunk hovering on a failing grav-thruster
        const pulse = 0.75 + 0.25 * Math.sin(t * 6 + i * 2.4);
        const g = ctx.createRadialGradient(p.x + p.w / 2, p.y + 22, 4, p.x + p.w / 2, p.y + 22, 52);
        g.addColorStop(0, `rgba(77, 227, 255, ${(0.5 * pulse).toFixed(3)})`);
        g.addColorStop(1, 'rgba(77, 227, 255, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(p.x + p.w / 2 - 52, p.y - 10, 104, 84);
        ctx.fillStyle = th.plat;                  // cracked slab
        roundRect(ctx, p.x, p.y, p.w, 16, 4); ctx.fill();
        ctx.fillStyle = th.platTop;
        ctx.fillRect(p.x + 4, p.y + 1, p.w - 8, 3);
        ctx.strokeStyle = 'rgba(0,0,0,.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p.x + p.w * 0.35, p.y + 2); ctx.lineTo(p.x + p.w * 0.42, p.y + 14);
        ctx.stroke();
        ctx.strokeStyle = '#7a4a3a';              // rebar whiskers
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y + 8); ctx.lineTo(p.x - 12, p.y + 4);
        ctx.moveTo(p.x + p.w, p.y + 8); ctx.lineTo(p.x + p.w + 10, p.y + 12);
        ctx.stroke();
        ctx.strokeStyle = `rgba(77, 227, 255, ${(0.75 * pulse).toFixed(3)})`;
        ctx.lineWidth = 3;                        // thruster ring
        ctx.beginPath();
        ctx.ellipse(p.x + p.w / 2, p.y + 19, 20, 6, 0, 0, 7);
        ctx.stroke();
      } else {
        // gutted rooftop: parapet with a chipped notch and an AC husk
        ctx.fillStyle = th.plat;
        roundRect(ctx, p.x, p.y, p.w, 12, 4); ctx.fill();
        ctx.fillStyle = th.platTop;
        ctx.fillRect(p.x + 5, p.y + 1, p.w - 10, 3);
        ctx.fillStyle = '#1c1822';
        ctx.beginPath();
        ctx.moveTo(p.x + p.w * 0.7, p.y); ctx.lineTo(p.x + p.w * 0.7 + 9, p.y + 6); ctx.lineTo(p.x + p.w * 0.7 + 18, p.y);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#332a38';
        if (i === 1) ctx.fillRect(p.x + p.w - 34, p.y - 14, 24, 14);
        else ctx.fillRect(p.x + 10, p.y - 12, 20, 12);
      }
    }
  }

  // Neon Heights: a mega-tower helipad over a rain-slick metropolis.
  // Rooftop terraces flank the pad, a holo-ad catwalk hangs mid-air, a
  // sky-tram glides the high lane, and a washer gondola rides its cables.
  _skylineStage(ctx, plats, tickF, t) {
    const th = this.theme, m = this.stage.main;

    // mega-tower shaft carrying the pad down into the streets
    ctx.fillStyle = '#141830';
    ctx.fillRect(m.x + 46, m.y + 30, m.w - 92, 450);
    ctx.fillStyle = '#0d1122';                     // inset core
    ctx.fillRect(m.x + 92, m.y + 30, m.w - 184, 450);
    for (let i = 0; i < 4; i++) {                  // lit shaft floors
      const wy = m.y + 74 + i * 96;
      ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t * 0.7 + i * 2.6);
      ctx.fillStyle = '#ffc46a';
      for (let wx = m.x + 104; wx < m.x + m.w - 110; wx += 34) {
        ctx.fillRect(wx, wy, 10, 14);
      }
      ctx.globalAlpha = 1;
    }
    ctx.globalAlpha = 0.7;                         // neon corner pipes
    ctx.fillStyle = th.trim;
    ctx.fillRect(m.x + 46, m.y + 30, 3, 450);
    ctx.fillRect(m.x + m.w - 49, m.y + 30, 3, 450);
    ctx.globalAlpha = 1;

    // helipad deck
    ctx.fillStyle = th.deck;
    roundRect(ctx, m.x, m.y, m.w, m.h + 30, 12); ctx.fill();
    ctx.fillStyle = th.lip;
    roundRect(ctx, m.x, m.y, m.w, 12, 6); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.35)';           // deck panel seams
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const fx of [0.25, 0.5, 0.75]) {
      ctx.moveTo(m.x + m.w * fx, m.y + 14);
      ctx.lineTo(m.x + m.w * fx, m.y + m.h + 22);
    }
    ctx.stroke();
    // chase lights racing along the lip toward the pad center
    for (let i = 0; i < 12; i++) {
      const lx = m.x + 14 + i * (m.w - 28) / 11;
      const on = Math.sin(t * 5 - Math.abs(i - 5.5) * 0.9) > 0.2;
      ctx.globalAlpha = on ? 0.9 : 0.18;
      ctx.fillStyle = on ? '#aef4ff' : th.trim;
      ctx.fillRect(lx - 2.5, m.y + 2, 5, 3.5);
    }
    ctx.globalAlpha = 1;
    const cxH = m.x + m.w / 2;                     // glowing 'H' pad sign
    ctx.fillStyle = th.trim;
    ctx.globalAlpha = 0.14;
    ctx.fillRect(cxH - 30, m.y + 22, 60, 46);
    ctx.globalAlpha = 0.9;
    ctx.fillRect(cxH - 22, m.y + 26, 7, 38);
    ctx.fillRect(cxH + 15, m.y + 26, 7, 38);
    ctx.fillRect(cxH - 15, m.y + 42, 30, 6);
    ctx.globalAlpha = 1;

    for (const [i, p] of plats.entries()) {
      const spec = this.stage.plats[i];
      if (spec.move?.dx) {
        // sky-tram: hover shuttle skimming its light-rail lane
        const cx = p.x + p.w / 2;
        ctx.strokeStyle = 'rgba(0, 229, 255, .16)';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(spec.x - spec.move.dx - 40, p.y + 13);
        ctx.lineTo(spec.x + spec.w + spec.move.dx + 40, p.y + 13);
        ctx.stroke();
        ctx.fillStyle = '#232a4d';                  // shuttle hull
        roundRect(ctx, p.x, p.y, p.w, 26, 12); ctx.fill();
        ctx.fillStyle = '#39437a';
        ctx.fillRect(p.x + 6, p.y + 2, p.w - 12, 4);
        ctx.globalAlpha = 0.85;                     // cabin windows
        ctx.fillStyle = '#ffd76a';
        for (let wx = p.x + 14; wx < p.x + p.w - 18; wx += 24) {
          ctx.fillRect(wx, p.y + 9, 14, 8);
        }
        ctx.globalAlpha = 1;
        if (Math.sin(t * 4.6) > 0) {                // wingtip strobes
          ctx.fillStyle = '#ff3d5e';
          ctx.beginPath(); ctx.arc(p.x + 3, p.y + 13, 3, 0, 7); ctx.fill();
          ctx.fillStyle = '#3dff7c';
          ctx.beginPath(); ctx.arc(p.x + p.w - 3, p.y + 13, 3, 0, 7); ctx.fill();
        }
        const wash = 0.6 + 0.4 * Math.sin(t * 9);   // thruster wash
        const g = ctx.createRadialGradient(cx, p.y + 30, 4, cx, p.y + 30, 60);
        g.addColorStop(0, `rgba(0, 229, 255, ${(0.4 * wash).toFixed(3)})`);
        g.addColorStop(1, 'rgba(0, 229, 255, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(cx - 60, p.y + 18, 120, 70);
      } else if (spec.move?.dy) {
        // window-washer gondola riding its cables
        const topY = -700;
        ctx.strokeStyle = '#3a4468';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(p.x + 10, p.y); ctx.lineTo(p.x + 18, topY);
        ctx.moveTo(p.x + p.w - 10, p.y); ctx.lineTo(p.x + p.w - 18, topY);
        ctx.stroke();
        ctx.fillStyle = '#2a3153';                  // winch block overhead
        roundRect(ctx, p.x + p.w / 2 - 30, topY - 10, 60, 14, 5); ctx.fill();
        ctx.fillStyle = '#232a4d';                  // bucket
        roundRect(ctx, p.x, p.y, p.w, 30, 5); ctx.fill();
        ctx.fillStyle = '#39437a';
        ctx.fillRect(p.x + 4, p.y + 1, p.w - 8, 3);
        ctx.fillStyle = '#ffb02e';                  // hazard stripe
        for (let sx = p.x + 4; sx < p.x + p.w - 8; sx += 18) {
          ctx.fillRect(sx, p.y + 21, 9, 5);
        }
        const lam = 0.55 + 0.2 * Math.sin(t * 1.7); // work lamp pooling down
        const g = ctx.createRadialGradient(p.x + p.w / 2, p.y + 34, 6, p.x + p.w / 2, p.y + 34, 70);
        g.addColorStop(0, `rgba(255, 214, 106, ${(0.4 * lam).toFixed(3)})`);
        g.addColorStop(1, 'rgba(255, 214, 106, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(p.x + p.w / 2 - 70, p.y + 24, 140, 80);
      } else if (i === 2) {
        // billboard catwalk: grated walkway over a giant holo-ad
        ctx.fillStyle = th.plat;
        roundRect(ctx, p.x, p.y, p.w, 10, 4); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,.4)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let gx = p.x + 8; gx < p.x + p.w - 4; gx += 12) {
          ctx.moveTo(gx, p.y + 2); ctx.lineTo(gx - 5, p.y + 9);
        }
        ctx.stroke();
        const bx = p.x + 12, bw = p.w - 24, by = p.y + 18, bh = 52;
        ctx.strokeStyle = '#3a4468';                // hanger struts
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(bx + 8, p.y + 10); ctx.lineTo(bx + 8, by);
        ctx.moveTo(bx + bw - 8, p.y + 10); ctx.lineTo(bx + bw - 8, by);
        ctx.stroke();
        const cyc = 0.5 + 0.5 * Math.sin(t * 1.3);
        ctx.globalAlpha = 0.18 + 0.12 * cyc;        // spill glow
        ctx.fillStyle = '#ff2e8a';
        ctx.fillRect(bx - 10, by - 8, bw + 20, bh + 16);
        ctx.globalAlpha = 0.85;
        const bg = ctx.createLinearGradient(bx, by, bx + bw, by + bh);
        bg.addColorStop(0, '#ff2e8a');
        bg.addColorStop(1, '#00e5ff');
        ctx.fillStyle = bg;
        ctx.fillRect(bx, by, bw, bh);
        ctx.globalAlpha = 0.9;                      // ad copy
        ctx.fillStyle = '#eaf7ff';
        ctx.font = 'italic 900 20px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('SMACK', bx + bw / 2, by + 22);
        ctx.fillText('TOWN', bx + bw / 2, by + 43);
        ctx.globalAlpha = 0.3;                      // scanlines
        ctx.fillStyle = '#061020';
        for (let sy = by + 3; sy < by + bh; sy += 6) ctx.fillRect(bx, sy, bw, 2);
        ctx.globalAlpha = 1;
      } else {
        // rooftop terrace: slab, glass railing, and a humming AC unit
        ctx.fillStyle = th.plat;
        roundRect(ctx, p.x, p.y, p.w, 12, 5); ctx.fill();
        ctx.fillStyle = th.platTop;
        ctx.fillRect(p.x + 5, p.y + 1, p.w - 10, 3);
        const out = i === 0 ? 1 : -1;               // rail hugs the outer edge
        const rx = i === 0 ? p.x + 6 : p.x + p.w - 6;
        ctx.strokeStyle = 'rgba(159, 216, 255, .5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(rx, p.y); ctx.lineTo(rx, p.y - 22);
        ctx.moveTo(rx + out * 30, p.y); ctx.lineTo(rx + out * 30, p.y - 22);
        ctx.moveTo(rx, p.y - 22); ctx.lineTo(rx + out * 34, p.y - 22);
        ctx.stroke();
        ctx.fillStyle = '#2a3153';                  // AC husk
        const ax = i === 0 ? p.x + p.w - 36 : p.x + 10;
        ctx.fillRect(ax, p.y - 13, 26, 13);
        ctx.globalAlpha = Math.sin(t * 3 + i * 2) > 0 ? 0.9 : 0.2;
        ctx.fillStyle = th.trim;                    // status LED
        ctx.fillRect(ax + 18, p.y - 9, 3, 3);
        ctx.globalAlpha = 1;
      }
    }
  }

  // Ambient weather, per theme: embers & ash rising off the burning ruins,
  // or neon-lit rain sheeting down over the heights.
  _ambient(ctx, dt, t) {
    if (this.theme.ambient === 'rain') {
      while (this.ambient.length < 64) {
        this.ambient.push({
          x: this.cam.x + (Math.random() - 0.5) * 2600,
          y: this.cam.y - 750 - Math.random() * 500,
          vx: -140, vy: 1150 + Math.random() * 350,
          life: 1.4, t: Math.random() * 0.4,
        });
      }
      ctx.lineWidth = 1.8;
      ctx.strokeStyle = '#9fd8ff';
      for (const d of this.ambient) {
        d.t += dt;
        d.x += d.vx * dt; d.y += d.vy * dt;
        const k = d.t / d.life;
        if (k >= 1) continue;
        ctx.globalAlpha = 0.08 + 0.16 * Math.sin(k * Math.PI);
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x - d.vx * 0.016, d.y - d.vy * 0.016);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      this.ambient = this.ambient.filter(d => d.t < d.life);
      return;
    }
    // embers rising off the burning city & ash sifting down
    while (this.ambient.length < 44) {
      const ash = Math.random() < 0.35;
      this.ambient.push({
        ash,
        x: this.cam.x + (Math.random() - 0.5) * 2400,
        y: ash ? this.cam.y - 700 - Math.random() * 300 : this.cam.y + 420 + Math.random() * 320,
        vy: ash ? 26 + Math.random() * 30 : -(34 + Math.random() * 46),
        sway: 14 + Math.random() * 30, ph: Math.random() * 7,
        life: 5 + Math.random() * 5, t: 0, r: ash ? 1.6 : 2.2,
      });
    }
    for (const e of this.ambient) {
      e.t += dt;
      e.y += e.vy * dt;
      const k = e.t / e.life;
      if (k >= 1) continue;
      const x = e.x + Math.sin(t * 0.8 + e.ph) * e.sway;
      const glow = e.ash ? 0.35 : 0.5 + 0.5 * Math.sin(t * 6 + e.ph);
      ctx.globalAlpha = (1 - k) * (e.ash ? 0.5 : 0.85) * Math.max(0.15, glow);
      ctx.fillStyle = e.ash ? '#8d97b8' : '#ff9a4d';
      ctx.fillRect(x, e.y, e.r + (e.ash ? 0 : glow), e.r + (e.ash ? 0 : glow));
    }
    ctx.globalAlpha = 1;
    this.ambient = this.ambient.filter(e => e.t < e.life);
  }

  _fighter(ctx, f, isMe, t) {
    ctx.save();
    ctx.translate(f.x, f.y);

    if (f.invuln && Math.sin(t * 30) > 0) ctx.globalAlpha = 0.45;

    // "you" marker
    if (isMe) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(0, -F_H / 2 - 26);
      ctx.lineTo(-7, -F_H / 2 - 38);
      ctx.lineTo(7, -F_H / 2 - 38);
      ctx.closePath(); ctx.fill();
    }

    // getup roll: tumble the whole body inward
    if (f.state === 'roll') ctx.rotate(t * 16 * f.facing);
    // guard crush: dazed wobble until the stun wears off
    if (f.state === 'crush') ctx.rotate(Math.sin(t * 22) * 0.12);

    // squash & stretch by vertical speed
    const stretch = clamp(1 + Math.abs(f.vy) / 3500, 1, 1.25);
    ctx.scale(1 / Math.sqrt(stretch), stretch);

    const hurt = f.state === 'hitstun' || f.state === 'crush';
    const attacking = f.state === 'attack' || f.atk;

    // ducking: tuck into a short, wide squat planted on the same ground
    // line (mirrors the DUCK_H hurtbox in game.js — what you see is what
    // can be hit)
    const duck = f.state === 'duck';
    const bw = duck ? F_W + 10 : F_W, bh = duck ? 24 : F_H;
    const bTop = F_H / 2 - bh;

    // body
    ctx.fillStyle = f.color;
    roundRect(ctx, -bw / 2, bTop, bw, bh, 14);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.35)';
    ctx.lineWidth = 3;
    ctx.stroke();

    // hit flash: body whites out for a blink when damage lands
    const flash = this.flash.get(f.id) || 0;
    if (flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${Math.min(1, flash / 0.16) * 0.85})`;
      roundRect(ctx, -bw / 2, bTop, bw, bh, 14);
      ctx.fill();
    }

    // belly shade
    ctx.fillStyle = 'rgba(255,255,255,.14)';
    roundRect(ctx, -bw / 2 + 5, bTop + 5, bw - 10, bh / 2, 10);
    ctx.fill();

    // face
    const ex = f.facing * 8;
    const ey = duck ? bTop + 11 : -F_H / 6;
    ctx.fillStyle = '#10122a';
    if (hurt) {
      ctx.lineWidth = 3; ctx.strokeStyle = '#10122a';
      cross(ctx, ex - 6, ey, 4); cross(ctx, ex + 6, ey, 4);
    } else {
      ctx.beginPath(); ctx.arc(ex - 6, ey, 3.4, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(ex + 6, ey, 3.4, 0, 7); ctx.fill();
      if (attacking) { // gritted mouth
        ctx.fillRect(ex - 6, ey + 10, 12, 3);
      }
    }

    // pixel hat: rides the head through squash/stretch and rolls, and
    // mirrors with the fighter's facing so it always points the right way
    if (f.hat) {
      const hat = hatImage(f.hat);
      if (hat) {
        ctx.save();
        ctx.scale(f.facing || 1, 1);
        if (duck) {
          ctx.translate(0, F_H - bh);  // hat rides the lowered head
          // smush: squash the hat vertically (anchored at its top) so the
          // face rows stop at the ground line instead of sinking into it
          const squish = (bh - F_H / 2 - HAT_Y) / HAT_BH;
          ctx.translate(0, HAT_Y);
          ctx.scale(1, squish);
          ctx.translate(0, -HAT_Y);
        }
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(hat, HAT_X, HAT_Y, HAT_BW, HAT_BH);
        ctx.restore();
      }
    }

    // hanging: fists gripping the lip (hang offset mirrors game.js LEDGE_HANG_Y)
    if (f.state === 'ledge') {
      ctx.fillStyle = f.color;
      ctx.strokeStyle = 'rgba(0,0,0,.35)';
      ctx.lineWidth = 2.5;
      for (const off of [-6, 6]) {
        ctx.beginPath();
        ctx.arc(f.facing * (F_W / 2 - 6) + off, -22, 5.5, 0, 7);
        ctx.fill(); ctx.stroke();
      }
    }

    ctx.restore();

    // guard meter: floats overhead while ducking, crushed, or refilling
    if (f.guard != null && (duck || f.state === 'crush' || f.guard < 99.5)) {
      const w = 44, h = 5;
      const k = clamp(f.guard / 100, 0, 1);
      const x = f.x - w / 2, y = f.y - F_H / 2 - 14;
      ctx.fillStyle = 'rgba(10,12,30,.6)';
      roundRect(ctx, x, y, w, h, 3); ctx.fill();
      if (k > 0) {
        ctx.fillStyle = k > 0.5 ? '#3ddc84' : k > 0.25 ? '#ffb02e' : '#ff5470';
        roundRect(ctx, x, y, Math.max(4, w * k), h, 3); ctx.fill();
      }
    }
  }

  // Attack hitbox: dashed outline while winding up (telegraph), then a hot
  // translucent fill during active frames. Mirrors game.js meleeHitbox.
  _hitbox(ctx, f, t) {
    const { dx, dy, hw, hh, active, round } = f.hb;
    const x = f.x + dx - hw, y = f.y + dy - hh;
    // spin moves show as a circle (well, ellipse) instead of a box
    const shape = () => round
      ? (ctx.beginPath(), ctx.ellipse(f.x + dx, f.y + dy, hw, hh, 0, 0, 7))
      : roundRect(ctx, x, y, hw * 2, hh * 2, 9);
    ctx.save();
    if (active) {
      ctx.fillStyle = 'rgba(255, 82, 82, .30)';
      ctx.strokeStyle = 'rgba(255, 150, 130, .95)';
      ctx.lineWidth = 3;
      shape();
      ctx.fill();
      ctx.stroke();
    } else {
      // charging smash: the telegraph flashes, pulsing faster and hotter as
      // the charge builds toward full
      const chg = f.hb.chg || 0;
      const pulse = chg ? (0.5 + 0.5 * Math.sin(t * (2 + 9 * chg) * 2 * Math.PI)) * chg : 0;
      if (pulse > 0.02) {
        ctx.fillStyle = `rgba(255, 160, 90, ${(0.32 * pulse).toFixed(3)})`;
        shape();
        ctx.fill();
      }
      ctx.strokeStyle = `rgba(255, ${214 - Math.round(90 * pulse)}, 102, ${(0.55 + 0.45 * pulse).toFixed(3)})`;
      ctx.lineWidth = 2 + 2.5 * chg;
      ctx.setLineDash([7, 6]);
      ctx.lineDashOffset = -t * 60;
      shape();
      ctx.stroke();
    }
    ctx.restore();
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Deterministic parallax cityscapes — same seed every time, so all players
// stand in the same city. 'ruins' builds two rows of collapsed towers with
// scattered survivor lights and a couple of burning floors; 'neon' builds
// three rows of intact mega-towers with dense lit windows, neon edge
// strips, holo-billboards, and antenna beacons.
function buildCityScape(style) {
  const neon = style === 'neon';
  let s = neon ? 20177 : 1337;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const baseY = 440;
  const layers = neon
    ? [
      { lag: 0.78, fill: '#0b0f24', windows: false, bldgs: [] },  // far, dark
      { lag: 0.6,  fill: '#141a3a', windows: true,  bldgs: [] },
      { lag: 0.42, fill: '#1d2450', windows: true,  bldgs: [] },  // near, blazing
    ]
    : [
      { lag: 0.72, fill: '#17101c', windows: false, bldgs: [] },  // far, dead
      { lag: 0.5,  fill: '#241a26', windows: true,  bldgs: [] },  // near, lit
    ];
  const fires = [];
  const NEON = ['#00e5ff', '#ff2e8a', '#b6ff3d', '#ffb02e'];
  const WIN = ['#ffc46a', '#9fd8ff'];
  for (const [li, layer] of layers.entries()) {
    let x = -1500 + rnd() * 80;
    while (x < 1500) {
      const w = neon ? 90 + rnd() * 130 : 130 + rnd() * (layer.windows ? 190 : 150);
      const h = neon
        ? 260 + rnd() * (300 + li * 200)
        : (layer.windows ? 300 : 420) + rnd() * (layer.windows ? 330 : 360);
      const b = { x, w, yTop: baseY - h, wins: [] };
      if (neon) {
        b.spire = rnd() < 0.4;
        b.strip = layer.windows && rnd() < 0.5
          ? { side: rnd() < 0.5 ? -1 : 1, color: NEON[(rnd() * NEON.length) | 0] } : null;
        b.board = layer.windows && rnd() < 0.3
          ? {
            dx: w * (0.15 + rnd() * 0.2), dy: h * (0.12 + rnd() * 0.3),
            w: w * 0.55, h: 34 + rnd() * 30,
            c1: NEON[(rnd() * NEON.length) | 0], c2: NEON[(rnd() * NEON.length) | 0],
            ph: rnd() * 7,
          } : null;
      } else {
        b.brk = 0.25 + rnd() * 0.5;               // where the collapse peak sits
        b.lgap = rnd() * 60; b.rgap = 20 + rnd() * 90;
        b.spire = rnd() < 0.3;
      }
      if (layer.windows) {
        const cols = Math.min(6, Math.max(2, Math.floor(w / (neon ? 26 : 46))));
        const rows = Math.min(14, Math.max(3, Math.floor(h / (neon ? 46 : 64))));
        const keep = neon ? 0.34 : 0.16;          // most ruined windows are dead
        for (let cx = 0; cx < cols; cx++) {
          for (let ry = 0; ry < rows; ry++) {
            if (rnd() > keep) continue;
            b.wins.push(neon
              ? {
                dx: 8 + cx * (w - 16) / cols, dy: 20 + ry * (h - 40) / rows,
                spd: 0.2 + rnd() * 0.9, ph: rnd() * 7, c: WIN[rnd() < 0.75 ? 0 : 1],
              }
              : {
                dx: 12 + cx * (w - 24) / cols, dy: 46 + ry * (h - 70) / rows,
                spd: 0.4 + rnd() * 1.4, ph: rnd() * 7, fire: rnd() < 0.12,
              });
          }
        }
        if (!neon && fires.length < 2 && rnd() < 0.35) {
          fires.push({ x: x + w * (0.3 + rnd() * 0.4), y: baseY - h + 14, lag: layer.lag });
        }
      }
      layer.bldgs.push(b);
      x += w + (neon ? 10 + rnd() * 40 : 24 + rnd() * 90);
    }
  }
  if (!neon && !fires.length) fires.push({ x: -260, y: -420, lag: 0.5 });
  return { style, baseY, layers, fires };
}
function cross(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x - s, y - s); ctx.lineTo(x + s, y + s);
  ctx.moveTo(x + s, y - s); ctx.lineTo(x - s, y + s);
  ctx.stroke();
}
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
