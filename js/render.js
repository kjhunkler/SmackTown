// Canvas renderer: draws the stage, fighters, projectiles and juice
// (particles, screen shake, KO bursts) from interpolated view state.

import { STAGE } from './game.js';

const F_W = 46, F_H = 64;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cam = { x: 0, y: -120, zoom: 0.8 };
    this.shake = 0;
    this.particles = [];
    this.stars = Array.from({ length: 70 }, () => ({
      x: Math.random() * 2000 - 1000,
      y: Math.random() * 900 - 700,
      s: Math.random() * 1.6 + 0.4,
      tw: Math.random() * Math.PI * 2,
    }));
    this._resize();
    addEventListener('resize', () => this._resize());
  }

  _resize() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    this.canvas.width = innerWidth * dpr;
    this.canvas.height = innerHeight * dpr;
    this.dpr = dpr;
  }

  onEvents(events) {
    for (const ev of events || []) {
      switch (ev.e) {
        case 'hit':
          this.burst(ev.x, ev.y, ev.heavy ? 18 : 8, ev.heavy ? '#ffdd55' : '#ffffff', ev.heavy ? 420 : 220);
          this.shake = Math.max(this.shake, ev.heavy ? 14 : 5);
          break;
        case 'ko':
          this.burst(ev.x, ev.y, 40, '#ff5470', 700);
          this.burst(ev.x, ev.y, 20, '#ffffff', 500);
          this.shake = 22;
          break;
        case 'shockwave':
          this.burst(ev.x, ev.y, 26, '#ffb02e', 520);
          this.shake = Math.max(this.shake, 10);
          break;
        case 'counter':
          this.burst(ev.x, ev.y, 14, '#38b6ff', 300);
          break;
        case 'secondwind':
          this.burst(ev.x, ev.y, 16, '#3ddc84', 260);
          break;
        case 'land':
          this.burst(ev.x, ev.y, 4, '#8899cc', 90);
          break;
        case 'jump':
          this.burst(ev.x, ev.y, 5, '#aabbee', 120);
          break;
      }
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
      const tz = Math.max(0.42 * this.dpr, Math.min(1.05 * this.dpr, Math.min(zx, zy)));
      const k = 1 - Math.pow(0.001, dt);
      this.cam.x += (tx - this.cam.x) * k;
      this.cam.y += (ty - this.cam.y) * k;
      this.cam.zoom += (tz - this.cam.zoom) * k;
    }
    this.shake = Math.max(0, this.shake - dt * 60);
    const shx = (Math.random() - 0.5) * this.shake * this.dpr;
    const shy = (Math.random() - 0.5) * this.shake * this.dpr;

    // --- background ---
    const grd = ctx.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, '#141a38');
    grd.addColorStop(0.6, '#1c1430');
    grd.addColorStop(1, '#090a14');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);

    const t = performance.now() / 1000;
    ctx.fillStyle = '#ffffff';
    for (const s of this.stars) {
      const px = W / 2 + (s.x - this.cam.x * 0.15) * this.dpr * 0.5;
      const py = H / 2 + (s.y - this.cam.y * 0.15) * this.dpr * 0.5;
      if (px < 0 || px > W || py < 0 || py > H) continue;
      ctx.globalAlpha = 0.3 + 0.3 * Math.sin(t * 2 + s.tw);
      ctx.fillRect(px, py, s.s * this.dpr, s.s * this.dpr);
    }
    ctx.globalAlpha = 1;

    ctx.save();
    ctx.translate(W / 2 + shx, H / 2 + shy);
    ctx.scale(this.cam.zoom, this.cam.zoom);
    ctx.translate(-this.cam.x, -this.cam.y);

    this._stage(ctx);

    // projectiles
    for (const p of view.projectiles || []) {
      ctx.save();
      ctx.translate(p.x, p.y);
      const flick = 1 + Math.sin(t * 30 + p.eid) * 0.2;
      ctx.fillStyle = '#ff8a2e';
      ctx.beginPath(); ctx.arc(0, 0, 13 * flick, 0, 7); ctx.fill();
      ctx.fillStyle = '#ffd23e';
      ctx.beginPath(); ctx.arc(0, 0, 7 * flick, 0, 7); ctx.fill();
      ctx.restore();
    }

    for (const f of view.fighters) if (!f.dead) this._fighter(ctx, f, f.id === myId, t);

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

    ctx.restore();
  }

  _stage(ctx) {
    const m = STAGE.main;
    // main platform with grass-ish top
    ctx.fillStyle = '#2a3154';
    roundRect(ctx, m.x, m.y, m.w, m.h + 30, 12); ctx.fill();
    ctx.fillStyle = '#3b4573';
    roundRect(ctx, m.x, m.y, m.w, 12, 6); ctx.fill();
    ctx.fillStyle = '#ffb02e';
    ctx.fillRect(m.x + 8, m.y + 1, m.w - 16, 3);

    for (const p of STAGE.plats) {
      ctx.fillStyle = '#3b4573';
      roundRect(ctx, p.x, p.y, p.w, 12, 6); ctx.fill();
      ctx.fillStyle = '#556099';
      ctx.fillRect(p.x + 6, p.y + 1, p.w - 12, 3);
    }
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

    // squash & stretch by vertical speed
    const stretch = clamp(1 + Math.abs(f.vy) / 3500, 1, 1.25);
    ctx.scale(1 / Math.sqrt(stretch), stretch);

    const hurt = f.state === 'hitstun';
    const attacking = f.state === 'attack' || f.atk;

    // body
    ctx.fillStyle = f.color;
    roundRect(ctx, -F_W / 2, -F_H / 2, F_W, F_H, 14);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.35)';
    ctx.lineWidth = 3;
    ctx.stroke();

    // belly shade
    ctx.fillStyle = 'rgba(255,255,255,.14)';
    roundRect(ctx, -F_W / 2 + 5, -F_H / 2 + 5, F_W - 10, F_H / 2, 10);
    ctx.fill();

    // face
    const ex = f.facing * 8;
    ctx.fillStyle = '#10122a';
    if (hurt) {
      ctx.lineWidth = 3; ctx.strokeStyle = '#10122a';
      cross(ctx, ex - 6, -F_H / 6, 4); cross(ctx, ex + 6, -F_H / 6, 4);
    } else {
      ctx.beginPath(); ctx.arc(ex - 6, -F_H / 6, 3.4, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(ex + 6, -F_H / 6, 3.4, 0, 7); ctx.fill();
      if (attacking) { // gritted mouth
        ctx.fillRect(ex - 6, -F_H / 6 + 10, 12, 3);
      }
    }

    // attack swoosh
    if (attacking && f.atk) {
      ctx.strokeStyle = 'rgba(255,255,255,.8)';
      ctx.lineWidth = 5;
      ctx.beginPath();
      if (f.atk === 'usmash') ctx.arc(0, -F_H / 2 - 12, 30, Math.PI * 1.15, Math.PI * 1.85);
      else if (f.atk === 'dsmash' || f.atk === 'dair') ctx.arc(0, F_H / 2 + 10, 30, Math.PI * 0.15, Math.PI * 0.85);
      else ctx.arc(f.facing * (F_W / 2 + 16), -6, 26, f.facing > 0 ? -1.2 : Math.PI - 1.2, f.facing > 0 ? 1.2 : Math.PI + 1.2);
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
function cross(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x - s, y - s); ctx.lineTo(x + s, y + s);
  ctx.moveTo(x + s, y - s); ctx.lineTo(x - s, y + s);
  ctx.stroke();
}
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
