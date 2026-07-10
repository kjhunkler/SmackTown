// Canvas renderer: draws the stage, fighters, projectiles and juice
// (particles, screen shake, KO bursts) from interpolated view state.

import { MAPS, DEFAULT_MAP, platsAt, hazardsAt, expansePlats, expanseBiomeAt, ENEMY_TYPES, HEART_LIFE, EXPANSE_CAM_RETREAT } from './game.js';
import { hatImage } from './ui.js';
import { BOX_X as HAT_X, BOX_Y as HAT_Y, BOX_W as HAT_BW, BOX_H as HAT_BH } from './hat.js';
import { SFX } from './sfx.js';

const F_W = 46, F_H = 64;

// Per-map look: background gradient, celestial motif, star behavior, stage
// palette, and optional ambient weather. Geometry comes from MAPS in
// game.js; looks live here.
const THEMES = {
  battlefield: {
    sky: ['#191a4e', '#3c2a6a', '#7c4468'],
    motif: 'ringworld',
    stars: 0.9,
    ambient: 'cloudwisp',
    deck: '#3a3d6b', lip: '#585d9e', trim: '#e6c26a',
    plat: '#585d9e', platTop: '#7d82c4',
  },
  flatlands: {
    sky: ['#5fb0dc', '#a5d2e4', '#e8cf9a'],
    motif: 'noon',
    stars: 0,
    ambient: 'dust',
    deck: '#b5854f', lip: '#8f6238', trim: '#c0452e',
    plat: '#8f6238', platTop: '#a8794a',
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
    sky: ['#0d0508', '#38100e', '#1c0906'],
    motif: 'forgesun',
    stars: 0.1,
    ambient: 'ashspark',
    deck: '#33272b', lip: '#544047', trim: '#ff6a2a',
    plat: '#4a3a40', platTop: '#6d565c',
  },
  garden: {
    sky: ['#1a1440', '#3c2b5c', '#0e2418'],
    motif: 'duskmoth',
    stars: 0.8,
    ambient: 'fireflies',
    deck: '#2e4a2c', lip: '#476b40', trim: '#ffd7f0',
    plat: '#5c4632', platTop: '#7a5f44',
  },
  training: {
    sky: ['#0d1126', '#1a2142', '#0e1524'],
    motif: 'moon',
    stars: 0.55,
    deck: '#2a3150', lip: '#3c466f', trim: '#5ee1b0',
    plat: '#3c466f', platTop: '#5a67a0',
  },
  expanse: {
    sky: ['#141d3a', '#2a2a5c', '#6a3b6e'],
    motif: 'moon',
    stars: 0.7,
    deck: '#2c2f4d', lip: '#464b78', trim: '#ffcf6a',
    plat: '#464b78', platTop: '#6a71ad',
  },
};

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cam = { x: 0, y: -120, zoom: 0.8 };
    this.expanseSeed = 0;            // run seed for the endless-map generator
    this.shake = 0;
    this.particles = [];
    this.dmgPops = [];               // floating damage numbers
    this.flash = new Map();          // fighter id -> hit-flash time left
    this.auras = new Map();          // fighter id -> {kind, t} bubble/counter overlays
    this.rings = [];                 // expanding shock rings {x,y,r0,r1,t,life,color,w}
    this.ambient = [];               // ambient weather: embers & ash (ruins), rain (neon heights)
    this.enemySprites = new Map();   // cached static common-creep silhouettes
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
    this.expanseCamMax = null;    // fresh expedition, fresh forward-progress watermark
    this.city = this.mapId === 'ruins' ? buildCityScape('ruins')
      : this.mapId === 'skyline' ? buildCityScape('neon')
      : null;
    this.mesas = this.mapId === 'flatlands' ? buildMesas() : null;
    this.flora = this.mapId === 'garden' ? buildFlora() : null;
    this.isles = this.mapId === 'battlefield' ? buildSkyIsles() : null;
    this.works = this.mapId === 'foundry' ? buildWorks() : null;
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
        case 'patrol':
          this.dmgPops.push({ x: ev.x || 0, y: ev.y || -180, txt: `${ev.name} PATROL`, t: 0, life: 1.5, heavy: true, color: '#ffcf6a' });
          break;
        case 'recovery':
          this.dmgPops.push({ x: ev.x, y: ev.y - 70, txt: 'RECOVERY CACHE', t: 0, life: 1.3, heavy: false, color: '#3ddc84' });
          break;
        case 'ko':
          this.burst(ev.x, ev.y, 40, '#ff5470', 700);
          this.burst(ev.x, ev.y, 20, '#ffffff', 500);
          this.shake = 22;
          break;
        case 'enemyko':
          this.burst(ev.x, ev.y, 12, '#ffcf6a', 280);
          this.dmgPops.push({ x: ev.x + 52, y: ev.y - 34, txt: `+${ev.cr || 5} CR`, t: 0, life: 0.9, heavy: false, color: '#ffcf6a' });
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
        case 'spikebounce':
          this.burst(ev.x, ev.y, 10, '#ffdd55', 260);
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
        case 'fizzle':
          // magic cast with an empty tank: a sad little puff
          this.burst(ev.x, ev.y, 6, '#8b7bb0', 120);
          this.dmgPops.push({
            x: ev.x, y: ev.y - F_H / 2 - 16,
            txt: 'NO MANA', t: 0, life: 0.6, heavy: false, color: '#b388ff',
          });
          break;
        case 'burn':
          this.burst(ev.x, ev.y, 20, '#ff8a2e', 520);
          this.burst(ev.x, ev.y, 10, '#ffd23e', 340);
          this.flash.set(ev.vic, 0.16);
          this.shake = Math.max(this.shake, 8);
          this.dmgPops.push({
            x: ev.x + (Math.random() - 0.5) * 16, y: ev.y - F_H / 2 - 10,
            txt: String(ev.dmg), t: 0, life: 0.7, heavy: false, color: '#ff8a2e',
          });
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
      case 'dashstrike': {
        // speed streaks trailing the lunge — angled when it rides skyward
        const dx = Math.sign(ev.dir || 1), dy = ev.up ? 0.67 : 0;
        for (let i = 0; i < 12; i++) {
          const v = 200 + Math.random() * 300;
          this.particles.push({
            x: ev.x - (Math.random() - 0.2) * 40 * dx, y: ev.y + (Math.random() - 0.5) * 40,
            vx: -v * dx, vy: v * dy + (Math.random() - 0.5) * 60,
            life: 0.3 + Math.random() * 0.2, t: 0, color: '#ffb02e',
            r: 2 + Math.random() * 3,
          });
        }
        break;
      }
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
      case 'enemyko': {
        const col = (ENEMY_TYPES[ev.kind] || ENEMY_TYPES.grunt).color;
        this.burst(ev.x, ev.y, ev.kind === 'brute' ? 26 : 18, col, ev.kind === 'brute' ? 440 : 320);
        this.rings.push({ x: ev.x, y: ev.y, r0: 8, r1: 60, t: 0, life: 0.3, color: '#ff7a92', w: 5 });
        this.shake = Math.max(this.shake, ev.kind === 'brute' ? 8 : 4);
        break;
      }
      case 'foefire':
        this.burst(ev.x, ev.y, 6, '#d94fb0', 200);
        break;
      case 'telegraph':
        // a warning flare where a ranged creep is winding up
        this.rings.push({ x: ev.x, y: ev.y, r0: 40, r1: 12, t: 0, life: 0.55, color: '#ffcf4d', w: 4 });
        break;
      case 'heart':
        this.burst(ev.x, ev.y, 16, '#ff9db3', 240);
        this.rings.push({ x: ev.x, y: ev.y, r0: 10, r1: 90, t: 0, life: 0.45, color: '#ff5470', w: 5 });
        this.dmgPops.push({ x: ev.x, y: ev.y - 26, txt: '+HP', t: 0, life: 0.7, heavy: false, color: '#7dffa8' });
        break;
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
      let tx = (minX + maxX) / 2;
      if (this.mapId === 'expanse') {
        // The road presses forward: retreating eases the view back only a
        // short way from the party's best progress, then the camera holds so
        // a backtracking fighter walks toward the left screen edge instead
        // of dragging the whole run backwards.
        this.expanseCamMax = Math.max(this.expanseCamMax ?? tx, tx);
        tx = Math.max(tx, this.expanseCamMax - EXPANSE_CAM_RETREAT);
      }
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
    const biomeTheme = this.mapId === 'expanse' ? expanseBiomeAt(this.expanseSeed, this.cam.x) : null;
    const th = biomeTheme?.blend ? blendTheme(THEMES[biomeTheme.id], THEMES[biomeTheme.next], biomeTheme.blend)
      : biomeTheme ? THEMES[biomeTheme.id] : this.theme;
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
    if (this.mesas) this._mesaBackdrop(ctx, t);
    if (this.flora) this._floraBackdrop(ctx, t);
    if (this.isles) this._isleBackdrop(ctx, t);
    if (this.works) this._worksBackdrop(ctx, t);
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
      } else if (p.kind === 'burst') {
        // arcane orb: white-hot core in a violet halo, throbbing as it
        // flies — its size is the actual hit radius from the sim
        const r = p.r || 14;
        const throb = 1 + Math.sin(t * 22 + p.eid) * 0.15;
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 1.9 * throb);
        g.addColorStop(0, 'rgba(255,255,255,.95)');
        g.addColorStop(0.35, 'rgba(179,136,255,.85)');
        g.addColorStop(1, 'rgba(56,182,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(0, 0, r * 1.9 * throb, 0, 7); ctx.fill();
        ctx.fillStyle = '#f0e8ff';
        ctx.beginPath(); ctx.arc(0, 0, r * 0.55 * throb, 0, 7); ctx.fill();
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
      } else if (p.kind === 'foeshot') {
        // creep spitball: a sickly violet orb with a little trailing wisp
        const throb = 1 + Math.sin(t * 24 + p.eid) * 0.18;
        ctx.rotate(Math.atan2(p.vy || 0, p.vx || 1));
        ctx.fillStyle = 'rgba(217,79,176,.35)';
        ctx.beginPath(); ctx.ellipse(-8, 0, 14, 6, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#d94fb0';
        ctx.beginPath(); ctx.arc(0, 0, 11 * throb, 0, 7); ctx.fill();
        ctx.fillStyle = '#ffdff4';
        ctx.beginPath(); ctx.arc(0, 0, 5 * throb, 0, 7); ctx.fill();
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

    // co-op creeps + heart drops, under the fighters
    const halfW = W / (this.cam.zoom * 2) + 80;
    const halfH = H / (this.cam.zoom * 2) + 80;
    const left = this.cam.x - halfW, right = this.cam.x + halfW;
    const top = this.cam.y - halfH, bottom = this.cam.y + halfH;
    for (const e of view.enemies || []) {
      const ty = ENEMY_TYPES[e.kind] || ENEMY_TYPES.grunt;
      if (e.x + ty.w / 2 < left || e.x - ty.w / 2 > right || e.y + ty.h / 2 < top || e.y - ty.h / 2 > bottom) continue;
      this._enemy(ctx, e, t);
    }
    for (const h of view.hearts || []) {
      if (h.x < left || h.x > right || h.y < top || h.y > bottom) continue;
      this._heart(ctx, h, t);
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
    if (this.theme.motif === 'ringworld') {
      // vast ringed gas giant looming over the cloud sea, twin moons circling
      const gy = H * 0.3 - this.cam.y * 0.05 * this.dpr;
      const R = r * 2.3;
      const g = ctx.createRadialGradient(px, gy, R * 0.3, px, gy, R * 2.6);
      g.addColorStop(0, 'rgba(255, 190, 150, .22)');
      g.addColorStop(1, 'rgba(255, 190, 150, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(px - R * 2.6, gy - R * 2.6, R * 5.2, R * 5.2);
      const body = ctx.createLinearGradient(px, gy - R, px, gy + R);
      body.addColorStop(0, '#f2b98e');
      body.addColorStop(0.45, '#d98a70');
      body.addColorStop(0.75, '#9c5e78');
      body.addColorStop(1, '#6b4a7c');
      ctx.fillStyle = body;
      ctx.globalAlpha = 0.95;
      ctx.beginPath(); ctx.arc(px, gy, R, 0, 7); ctx.fill();
      ctx.globalAlpha = 0.35;                          // banded weather stripes
      ctx.strokeStyle = '#7c4458';
      ctx.lineWidth = R * 0.09;
      for (const [dy, sw] of [[-0.42, 0.85], [-0.1, 0.98], [0.28, 0.92]]) {
        ctx.beginPath();
        ctx.ellipse(px, gy + R * dy, R * sw, R * 0.13, 0, 0, 7);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.save();                                      // ring plane, tilted
      ctx.translate(px, gy);
      ctx.rotate(-0.22);
      ctx.strokeStyle = 'rgba(240, 214, 170, .55)';
      ctx.lineWidth = R * 0.1;
      ctx.beginPath(); ctx.ellipse(0, 0, R * 1.75, R * 0.42, 0, 0, 7); ctx.stroke();
      ctx.strokeStyle = 'rgba(240, 214, 170, .25)';
      ctx.lineWidth = R * 0.05;
      ctx.beginPath(); ctx.ellipse(0, 0, R * 2.05, R * 0.5, 0, 0, 7); ctx.stroke();
      ctx.fillStyle = body;                            // planet hides the far ring arc
      ctx.beginPath(); ctx.arc(0, 0, R * 0.99, Math.PI, 0); ctx.fill();
      ctx.restore();
      for (let i = 0; i < 2; i++) {                    // twin moons on slow orbits
        const a = t * (0.1 + i * 0.06) + i * 2.6;
        const mx = px + Math.cos(a) * R * (2.3 + i * 0.5);
        const my = gy + Math.sin(a) * R * 0.35;
        ctx.fillStyle = i ? '#cfd6f2' : '#f2e6cf';
        ctx.globalAlpha = 0.9;
        ctx.beginPath(); ctx.arc(mx, my, r * (0.16 - i * 0.05), 0, 7); ctx.fill();
      }
      ctx.globalAlpha = 1;
    } else if (this.theme.motif === 'moon') {
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
    } else if (this.theme.motif === 'forgesun') {
      // a smoke-smothered sun sunk low behind the works, more furnace-glow
      // than daylight, its bloom pulsing like a breathing bellows
      const sx = W * 0.3 - this.cam.x * 0.04 * this.dpr;
      const sy = H * 0.42 - this.cam.y * 0.04 * this.dpr;
      const breathe = 1 + Math.sin(t * 0.8) * 0.06;
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 3.4 * breathe);
      g.addColorStop(0, 'rgba(255, 120, 40, .8)');
      g.addColorStop(0.4, 'rgba(200, 60, 24, .32)');
      g.addColorStop(1, 'rgba(200, 60, 24, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(sx - r * 3.4, sy - r * 3.4, r * 6.8, r * 6.8);
      ctx.fillStyle = '#ff7a30';
      ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.arc(sx, sy, r * 0.95, 0, 7); ctx.fill();
      ctx.globalAlpha = 0.5;                           // smoke bands slicing the disc
      ctx.fillStyle = '#1c0906';
      for (const [dy, hh] of [[-0.25, 0.16], [0.15, 0.12], [0.45, 0.2]]) {
        ctx.fillRect(sx - r * 1.4, sy + r * dy - r * hh / 2
          + Math.sin(t * 0.3 + dy * 9) * r * 0.05, r * 2.8, r * hh);
      }
      ctx.globalAlpha = 1;
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
    } else if (this.theme.motif === 'noon') {
      // white-hot noon sun, high and merciless, buzzards riding the thermals
      const sx = W * 0.62 - this.cam.x * 0.04 * this.dpr;
      const sy = H * 0.13 - this.cam.y * 0.04 * this.dpr;
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 4);
      g.addColorStop(0, 'rgba(255, 252, 235, .95)');
      g.addColorStop(0.25, 'rgba(255, 244, 200, .45)');
      g.addColorStop(1, 'rgba(255, 244, 200, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(sx - r * 4, sy - r * 4, r * 8, r * 8);
      ctx.fillStyle = '#fffdf2';
      ctx.beginPath(); ctx.arc(sx, sy, r * 0.85, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(255, 250, 220, .5)';   // glare ring
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sx, sy, r * 1.5 + Math.sin(t * 0.9) * r * 0.08, 0, 7); ctx.stroke();
      // buzzards: lazy dark chevrons wheeling under the glare
      ctx.strokeStyle = 'rgba(40, 30, 24, .75)';
      ctx.lineWidth = Math.max(2, r * 0.045);
      ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        const a = t * (0.14 + i * 0.05) + i * 2.4;
        const bx = sx + Math.cos(a) * r * (2.6 + i * 0.8);
        const by = sy + r * (1.7 + i * 0.5) + Math.sin(a) * r * 0.5;
        const flap = Math.sin(t * (2.2 + i * 0.5) + i) * 0.35;
        const s = r * (0.16 - i * 0.03);
        ctx.beginPath();
        ctx.moveTo(bx - s, by - s * (0.3 - flap));
        ctx.quadraticCurveTo(bx, by + s * flap, bx + s, by - s * (0.3 - flap));
        ctx.stroke();
      }
    } else if (this.theme.motif === 'duskmoth') {
      // low honeyed dusk moon behind the flora, giant moths drifting past
      const my = H * 0.34 - this.cam.y * 0.05 * this.dpr;
      const R = r * 1.5;
      const g = ctx.createRadialGradient(px, my, R * 0.5, px, my, R * 3);
      g.addColorStop(0, 'rgba(255, 226, 170, .4)');
      g.addColorStop(0.5, 'rgba(255, 200, 150, .14)');
      g.addColorStop(1, 'rgba(255, 200, 150, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(px - R * 3, my - R * 3, R * 6, R * 6);
      ctx.fillStyle = '#ffe9c4';
      ctx.globalAlpha = 0.95;
      ctx.beginPath(); ctx.arc(px, my, R, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(220, 174, 130, .5)';     // maria
      ctx.beginPath(); ctx.arc(px - R * 0.25, my - R * 0.1, R * 0.26, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(px + R * 0.3, my + R * 0.26, R * 0.17, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
      // moths: pale wings beating slow ellipses through the moonlight
      for (let i = 0; i < 2; i++) {
        const a = t * (0.22 + i * 0.09) + i * 3.1;
        const mx = px + Math.cos(a) * R * (2.1 + i * 0.7);
        const myy = my + Math.sin(a * 1.7) * R * 0.8 + i * R * 0.5;
        const beat = Math.abs(Math.sin(t * (6 - i * 1.5) + i * 2));
        const s = R * (0.14 - i * 0.03);
        ctx.fillStyle = `rgba(240, 226, 200, ${0.5 + 0.3 * beat})`;
        ctx.beginPath();                             // two wing lobes
        ctx.ellipse(mx - s * 0.6, myy, s * (0.4 + 0.5 * beat), s, -0.5, 0, 7);
        ctx.ellipse(mx + s * 0.6, myy, s * (0.4 + 0.5 * beat), s, 0.5, 0, 7);
        ctx.fill();
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
    if (this.mapId === 'battlefield') { this._bastionStage(ctx, plats, t); return; }
    if (this.mapId === 'ruins') { this._ruinsStage(ctx, plats, t); return; }
    if (this.mapId === 'skyline') { this._skylineStage(ctx, plats, tickF, t); return; }
    if (this.mapId === 'flatlands') { this._flatlandsStage(ctx, t); return; }
    if (this.mapId === 'garden') { this._gardenStage(ctx, plats, t); return; }
    if (this.mapId === 'foundry') { this._crucibleStage(ctx, plats, tickF, t); return; }
    if (this.mapId === 'training') { this._trainingStage(ctx, plats, t); return; }
    if (this.mapId === 'expanse') { this._expanseStage(ctx, t); return; }
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

  // Training Room: a quiet holo-dojo — drifting grid panels, pulsing target
  // rings off each wing, and a padded mat with range ticks every 100 units
  // so knockback distances read at a glance.
  _trainingStage(ctx, plats, t) {
    const th = this.theme;
    const m = this.stage.main;

    // holo grid backdrop on a light parallax
    const ox = this.cam.x * 0.25, oy = this.cam.y * 0.2;
    ctx.strokeStyle = 'rgba(94, 225, 176, .07)';
    ctx.lineWidth = 2;
    for (let gx = -1200; gx <= 1200; gx += 120) {
      ctx.beginPath(); ctx.moveTo(gx + ox, -900 + oy); ctx.lineTo(gx + ox, 260 + oy); ctx.stroke();
    }
    for (let gy = -840; gy <= 240; gy += 120) {
      ctx.beginPath(); ctx.moveTo(-1200 + ox, gy + oy); ctx.lineTo(1200 + ox, gy + oy); ctx.stroke();
    }

    // practice targets hovering off each wing, breathing slowly
    for (const [tx, ty, ph] of [[-560, -300, 0], [560, -240, 2.1]]) {
      const px = tx + ox * 0.6, py = ty + oy * 0.6;
      const pulse = 0.5 + 0.25 * Math.sin(t * 1.6 + ph);
      ctx.lineWidth = 3;
      for (let i = 3; i >= 1; i--) {
        ctx.strokeStyle = `rgba(94, 225, 176, ${(pulse * 0.05 * i).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(px, py, i * 26, 0, 7); ctx.stroke();
      }
      ctx.fillStyle = `rgba(94, 225, 176, ${(pulse * 0.7).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(px, py, 7, 0, 7); ctx.fill();
    }

    // padded mat deck
    ctx.fillStyle = th.deck;
    roundRect(ctx, m.x, m.y, m.w, m.h + 30, 12); ctx.fill();
    ctx.fillStyle = th.lip;
    roundRect(ctx, m.x, m.y, m.w, 12, 6); ctx.fill();
    ctx.fillStyle = th.trim;
    ctx.fillRect(m.x + 8, m.y + 1, m.w - 16, 3);

    // mat seams
    ctx.fillStyle = 'rgba(0, 0, 0, .18)';
    for (let x = m.x + 120; x < m.x + m.w - 20; x += 120) ctx.fillRect(x, m.y + 20, 4, m.h + 6);

    // range ticks out from the center line
    ctx.fillStyle = 'rgba(234, 247, 255, .5)';
    ctx.fillRect(-2, m.y + 5, 4, 14);
    ctx.fillStyle = 'rgba(234, 247, 255, .26)';
    for (let d = 100; d <= m.w / 2 - 30; d += 100) {
      ctx.fillRect(d - 1.5, m.y + 7, 3, 10);
      ctx.fillRect(-d - 1.5, m.y + 7, 3, 10);
    }

    // practice perch
    for (const p of plats) {
      ctx.fillStyle = th.plat;
      roundRect(ctx, p.x, p.y, p.w, 12, 6); ctx.fill();
      ctx.fillStyle = th.platTop;
      ctx.fillRect(p.x + 6, p.y + 1, p.w - 12, 3);
    }
  }

  // Expedition: an endless road drawn only where the camera can see it. The
  // continuous ground fills the visible span; the floating platforms come
  // from the same deterministic generator the sim collides against, windowed
  // to the view so the world can run forever.
  _expanseStage(ctx, t) {
    const halfW = (this.canvas.width / 2) / this.cam.zoom + 240;
    const left = this.cam.x - halfW, right = this.cam.x + halfW;
    const gy = this.stage.main.y;
    const biome = expanseBiomeAt(this.expanseSeed, this.cam.x);
    const from = THEMES[biome.id], to = THEMES[biome.next];
    const th = biome.blend ? blendTheme(from, to, biome.blend) : from;

    // distant parallax dunes rolling by
    ctx.fillStyle = biome.id === 'foundry' ? 'rgba(255, 110, 50, .20)'
      : biome.id === 'garden' ? 'rgba(80, 190, 110, .18)'
        : biome.id === 'skyline' ? 'rgba(60, 120, 255, .20)' : 'rgba(120, 96, 150, .22)';
    const ox = this.cam.x * 0.4;
    ctx.beginPath();
    ctx.moveTo(left, gy);
    for (let x = left; x <= right; x += 40) {
      const wx = x + ox;
      ctx.lineTo(x, gy - 90 - 60 * Math.sin(wx * 0.0016) - 30 * Math.sin(wx * 0.0051));
    }
    ctx.lineTo(right, gy); ctx.closePath(); ctx.fill();

    // continuous ground
    ctx.fillStyle = th.deck;
    ctx.fillRect(left, gy, right - left, 600);
    ctx.fillStyle = th.lip;
    ctx.fillRect(left, gy, right - left, 12);
    ctx.fillStyle = th.trim;
    ctx.fillRect(left, gy + 1, right - left, 3);

    // ground seams every 120 units, aligned to world space
    ctx.fillStyle = 'rgba(0, 0, 0, .16)';
    for (let x = Math.floor(left / 120) * 120; x < right; x += 120) {
      ctx.fillRect(x, gy + 22, 4, 44);
    }

    // floating platforms, straight from the world generator
    for (const p of expansePlats(this.expanseSeed >>> 0, left, right)) {
      ctx.fillStyle = th.plat;
      roundRect(ctx, p.x, p.y, p.w, 12, 6); ctx.fill();
      ctx.fillStyle = th.platTop;
      ctx.fillRect(p.x + 6, p.y + 1, p.w - 12, 3);
      if (biome.id === 'garden') {
        ctx.strokeStyle = 'rgba(120, 235, 135, .55)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(p.x + 14, p.y + 12); ctx.quadraticCurveTo(p.x + p.w / 2, p.y + 25, p.x + p.w - 14, p.y + 12); ctx.stroke();
      } else if (biome.id === 'skyline') {
        ctx.fillStyle = 'rgba(0, 229, 255, .5)'; ctx.fillRect(p.x + 12, p.y + 8, p.w - 24, 2);
      } else if (biome.id === 'foundry') {
        ctx.fillStyle = 'rgba(255, 106, 42, .55)'; ctx.fillRect(p.x + 8, p.y + 9, p.w - 16, 2);
      }
    }

    this._expanseBiomeWeather(ctx, biome, left, right, gy, t);
    if (biome.local < 520) {
      const a = Math.min(1, biome.local / 90, (520 - biome.local) / 130);
      ctx.globalAlpha = Math.max(0, a) * .8;
      ctx.fillStyle = '#fff'; ctx.font = 'italic 900 30px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(MAPS[biome.id].name, this.cam.x, gy - 410);
      ctx.globalAlpha = 1;
    }
  }

  _expanseBiomeWeather(ctx, biome, left, right, gy, t) {
    const color = biome.id === 'foundry' ? 'rgba(255, 120, 55, .45)'
      : biome.id === 'skyline' ? 'rgba(120, 190, 255, .38)'
        : biome.id === 'garden' ? 'rgba(160, 255, 120, .40)'
          : biome.id === 'flatlands' ? 'rgba(230, 190, 120, .32)' : null;
    if (!color) return;
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2;
    for (let i = 0; i < 18; i++) {
      const x = left + ((i * 137 + this.expanseSeed * 17 + t * (biome.id === 'skyline' ? 180 : 40)) % (right - left));
      const y = gy - 80 - ((i * 83 + t * 45) % 430);
      if (biome.id === 'skyline') { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 8, y + 24); ctx.stroke(); }
      else { ctx.beginPath(); ctx.arc(x, y, biome.id === 'garden' ? 2.5 : 1.7, 0, 7); ctx.fill(); }
    }
  }

  // Co-op creep. Each type gets its own silhouette off the shared stat table:
  // size, color, and a behavior tell (flyer wings, hopper legs, brute bulk,
  // slinger's telegraph glow). Flashes white when struck, shows a health pip
  // once hurt, and pulses a wind-up ring while charging a ranged shot.
  _enemy(ctx, e, t) {
    const ty = ENEMY_TYPES[e.kind] || ENEMY_TYPES.grunt;
    const w = ty.w, h = ty.h;
    const flash = e.hurt;
    const fly = !!ty.fly;
    const bob = Math.sin(t * (fly ? 9 : 7) + e.eid) * (fly ? 4 : 2);
    const base = flash ? '#ffffff' : ty.color;
    const dark = flash ? '#ffe3ea' : this._shade(ty.color, -0.32);

    ctx.save();
    ctx.translate(e.x, e.y + bob);
    if (e.elite) {
      ctx.strokeStyle = '#ffcf6a'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, Math.max(w, h) * .72, 0, 7); ctx.stroke();
    }
    const temperamentColor = { bold: '#ff6a7a', cautious: '#bfe3ff', vengeful: '#ffcf6a', pack: '#b388ff' }[e.temperament];
    if (temperamentColor) { ctx.fillStyle = temperamentColor; ctx.beginPath(); ctx.arc(0, -h / 2 - 8, 3.5, 0, 7); ctx.fill(); }

    const sprite = !flash && !e.windup && !fly && e.kind !== 'brute' && e.kind !== 'slinger'
      ? this._enemySprite(e.kind, ty) : null;
    if (sprite) {
      ctx.scale(e.facing || 1, 1);
      ctx.drawImage(sprite.canvas, -w / 2 - sprite.pad, -h / 2 - sprite.pad);
      ctx.restore();
      if (e.hp < e.maxHp) this._enemyHealth(ctx, e, w, h);
      return;
    }

    // wind-up telegraph: a swelling ring that fills as the shot nears
    if (e.windup > 0) {
      const k = 1 - Math.min(1, e.windup / (ty.windup || 0.85));
      ctx.strokeStyle = `rgba(255,${Math.round(90 - 60 * k)},${Math.round(90 - 40 * k)},${(0.5 + 0.4 * k).toFixed(2)})`;
      ctx.lineWidth = 3 + 3 * k;
      ctx.beginPath(); ctx.arc(0, 0, w * 0.7 + 10 * (1 - k), 0, 7); ctx.stroke();
    }

    // flyer wings flapping behind the body
    if (fly) {
      const flap = Math.sin(t * 18 + e.eid) * 0.5 + 0.7;
      ctx.fillStyle = flash ? '#ffe3ea' : this._shade(ty.color, 0.2);
      for (const s of [-1, 1]) {
        ctx.save(); ctx.scale(s, 1);
        ctx.beginPath();
        ctx.moveTo(w * 0.32, -4);
        ctx.quadraticCurveTo(w * 0.9, -10 - 12 * flap, w * 0.62, 8 + 6 * flap);
        ctx.quadraticCurveTo(w * 0.5, 2, w * 0.32, -4);
        ctx.fill();
        ctx.restore();
      }
    }

    // body
    ctx.fillStyle = base;
    roundRect(ctx, -w / 2, -h / 2, w, h, Math.min(16, w * 0.32)); ctx.fill();
    ctx.fillStyle = dark;
    roundRect(ctx, -w / 2 + 5, 3, w - 10, h / 2 - 5, 8); ctx.fill();

    // legs: hoppers get springy stalks, ground types little feet, flyers none
    if (!fly) {
      ctx.fillStyle = dark;
      const legH = ty.jump ? 12 : 8;
      roundRect(ctx, -w / 2 + 4, h / 2 - legH + 2, w * 0.24, legH, 4); ctx.fill();
      roundRect(ctx, w / 2 - w * 0.24 - 4, h / 2 - legH + 2, w * 0.24, legH, 4); ctx.fill();
    }

    // brute: a couple of horns to read as the heavy
    if (e.kind === 'brute') {
      ctx.fillStyle = dark;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * (w * 0.28), -h / 2 + 4);
        ctx.lineTo(s * (w * 0.4), -h / 2 - 12);
        ctx.lineTo(s * (w * 0.16), -h / 2 + 2);
        ctx.fill();
      }
    }

    // eyes toward its facing (a single angry eye for the slinger)
    const ex = (e.facing || 1) * (w * 0.08);
    const eyeR = Math.max(4, w * 0.12);
    ctx.fillStyle = '#150a10';
    if (e.kind === 'slinger') {
      ctx.beginPath(); ctx.arc(ex, -h * 0.14, eyeR + 1, 0, 7); ctx.fill();
      ctx.fillStyle = e.windup > 0 ? '#ffe14d' : '#ffd0da';
      ctx.beginPath(); ctx.arc(ex + (e.facing || 1) * 1.5, -h * 0.14, eyeR * 0.45, 0, 7); ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(-w * 0.2 + ex, -h * 0.14, eyeR, 0, 7);
      ctx.arc(w * 0.24 + ex, -h * 0.14, eyeR, 0, 7);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(-w * 0.2 + ex + (e.facing || 1) * 1.6, -h * 0.14 - 1, eyeR * 0.36, 0, 7);
      ctx.arc(w * 0.24 + ex + (e.facing || 1) * 1.6, -h * 0.14 - 1, eyeR * 0.36, 0, 7);
      ctx.fill();
    }
    ctx.restore();

    if (e.hp < e.maxHp) this._enemyHealth(ctx, e, w, h);
  }

  _enemyHealth(ctx, e, w, h) {
    const bw = Math.max(30, w), frac = Math.max(0, e.hp / e.maxHp);
    ctx.fillStyle = 'rgba(0,0,0,.5)';
    roundRect(ctx, e.x - bw / 2, e.y - h / 2 - 13, bw, 5, 2); ctx.fill();
    ctx.fillStyle = '#ff5470';
    roundRect(ctx, e.x - bw / 2, e.y - h / 2 - 13, bw * frac, 5, 2); ctx.fill();
  }

  _enemySprite(kind, ty) {
    let sprite = this.enemySprites.get(kind);
    if (sprite) return sprite;
    const pad = 8, canvas = document.createElement('canvas');
    canvas.width = ty.w + pad * 2; canvas.height = ty.h + pad * 2;
    const ctx = canvas.getContext('2d');
    ctx.translate(pad + ty.w / 2, pad + ty.h / 2);
    const w = ty.w, h = ty.h, dark = this._shade(ty.color, -0.32);
    ctx.fillStyle = ty.color;
    roundRect(ctx, -w / 2, -h / 2, w, h, Math.min(16, w * 0.32)); ctx.fill();
    ctx.fillStyle = dark;
    roundRect(ctx, -w / 2 + 5, 3, w - 10, h / 2 - 5, 8); ctx.fill();
    const legH = ty.jump ? 12 : 8;
    roundRect(ctx, -w / 2 + 4, h / 2 - legH + 2, w * 0.24, legH, 4); ctx.fill();
    roundRect(ctx, w / 2 - w * 0.24 - 4, h / 2 - legH + 2, w * 0.24, legH, 4); ctx.fill();
    const eyeR = Math.max(4, w * 0.12);
    ctx.fillStyle = '#150a10';
    ctx.beginPath(); ctx.arc(-w * 0.2 + w * 0.08, -h * 0.14, eyeR, 0, 7); ctx.arc(w * 0.24 + w * 0.08, -h * 0.14, eyeR, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(-w * 0.2 + w * 0.08 + 1.6, -h * 0.14 - 1, eyeR * 0.36, 0, 7); ctx.arc(w * 0.24 + w * 0.08 + 1.6, -h * 0.14 - 1, eyeR * 0.36, 0, 7); ctx.fill();
    sprite = { canvas, pad };
    this.enemySprites.set(kind, sprite);
    return sprite;
  }

  // Dropped heart: a pulsing pickup that blinks faster as it's about to fade.
  _heart(ctx, h, t) {
    const fading = h.tLeft < 2.2;
    if (fading && Math.sin(t * 16) < -0.1) return;   // blink out near the end
    const pulse = 1 + Math.sin(t * 5 + h.hid) * 0.12;
    const s = 11 * pulse;
    ctx.save();
    ctx.translate(h.x, h.y + Math.sin(t * 3 + h.hid) * 2);
    ctx.scale(s / 11, s / 11);
    // soft glow
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 26);
    g.addColorStop(0, 'rgba(255,90,130,.5)');
    g.addColorStop(1, 'rgba(255,90,130,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, 26, 0, 7); ctx.fill();
    // heart shape
    ctx.fillStyle = '#ff5470';
    ctx.beginPath();
    ctx.moveTo(0, 9);
    ctx.bezierCurveTo(-13, -3, -8, -14, 0, -5);
    ctx.bezierCurveTo(8, -14, 13, -3, 0, 9);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.7)';
    ctx.beginPath(); ctx.arc(-4, -4, 2.4, 0, 7); ctx.fill();
    ctx.restore();
  }

  // Lighten (>0) or darken (<0) a #rrggbb color by a fraction.
  _shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const cl = v => Math.max(0, Math.min(255, Math.round(v)));
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    if (f >= 0) { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
    else { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
    return `rgb(${cl(r)},${cl(g)},${cl(b)})`;
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

  // Dust Divide: hazy parallax buttes receding into the noon glare, a
  // lonely ghost-town windmill, and heat shimmer crawling the horizon.
  _mesaBackdrop(ctx, t) {
    const ms = this.mesas;
    for (const layer of ms.layers) {
      const ox = this.cam.x * layer.lag, oy = this.cam.y * layer.lag * 0.85;
      ctx.fillStyle = layer.fill;
      for (const b of layer.buttes) {
        const x = b.x + ox, yb = ms.baseY + oy, yt = yb - b.h;
        ctx.beginPath();                       // flat-top butte with talus skirts
        ctx.moveTo(x - b.skirt, yb);
        ctx.lineTo(x + b.w * 0.08, yt + 6);
        ctx.lineTo(x + b.w * 0.16, yt);
        ctx.lineTo(x + b.w * 0.84, yt);
        ctx.lineTo(x + b.w * 0.92, yt + 6);
        ctx.lineTo(x + b.w + b.skirt, yb);
        ctx.closePath(); ctx.fill();
        if (layer.strata) {                    // banded rock strata
          ctx.strokeStyle = layer.strata;
          ctx.lineWidth = 2;
          ctx.beginPath();
          for (let i = 1; i <= 2; i++) {
            const sy = yt + b.h * 0.22 * i;
            const inset = b.h * 0.05 * i;
            ctx.moveTo(x + b.w * 0.12 - inset, sy);
            ctx.lineTo(x + b.w * 0.88 + inset, sy);
          }
          ctx.stroke();
        }
      }
      if (!layer.props) continue;
      for (const c of layer.cacti) {           // saguaro silhouettes
        const x = c.x + ox, yb = ms.baseY + oy;
        ctx.strokeStyle = layer.propFill;
        ctx.lineWidth = c.w;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x, yb); ctx.lineTo(x, yb - c.h);
        ctx.moveTo(x - c.h * 0.3, yb - c.h * 0.62);
        ctx.lineTo(x - c.h * 0.3, yb - c.h * 0.8); ctx.lineTo(x, yb - c.h * 0.72);
        ctx.moveTo(x + c.h * 0.26, yb - c.h * 0.5);
        ctx.lineTo(x + c.h * 0.26, yb - c.h * 0.66); ctx.lineTo(x, yb - c.h * 0.58);
        ctx.stroke();
      }
      // ghost-town windmill: lattice tower, spinning fan, kicking vane
      const w = ms.mill, wx = w.x + ox, wy = ms.baseY + oy;
      ctx.strokeStyle = layer.propFill;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(wx - 16, wy); ctx.lineTo(wx, wy - w.h);
      ctx.moveTo(wx + 16, wy); ctx.lineTo(wx, wy - w.h);
      ctx.moveTo(wx - 10, wy - w.h * 0.4); ctx.lineTo(wx + 10, wy - w.h * 0.4);
      ctx.stroke();
      const hub = { x: wx, y: wy - w.h };
      const spin = t * 1.1;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = spin + i * Math.PI / 3;
        ctx.moveTo(hub.x, hub.y);
        ctx.lineTo(hub.x + Math.cos(a) * 22, hub.y + Math.sin(a) * 22);
      }
      ctx.stroke();
      ctx.beginPath();                          // tail vane wags in the gusts
      ctx.moveTo(hub.x, hub.y);
      ctx.lineTo(hub.x + 30, hub.y + Math.sin(t * 0.7) * 6);
      ctx.stroke();
    }
    // heat shimmer: translucent ripple bands crawling above the horizon
    ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
      const oy = this.cam.y * 0.5 * 0.85;
      const y = ms.baseY + oy - 40 - i * 26;
      ctx.strokeStyle = `rgba(255, 248, 224, ${0.05 + 0.03 * Math.sin(t * 2.2 + i * 2)})`;
      ctx.beginPath();
      for (let s = 0; s <= 16; s++) {
        const x = this.cam.x + (s / 16 - 0.5) * 2600;
        const yy = y + Math.sin(t * (3 + i) + s * 1.7 + i * 3) * 3.5;
        s ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy);
      }
      ctx.stroke();
    }
  }

  // Sky Bastion: an archipelago of floating islands drifting over a sea of
  // moonlit cloud — rocky keels trailing waterfalls that mist away into the
  // void, distant banner spires, and slow cloud banks rolling beneath.
  _isleBackdrop(ctx, t) {
    const sk = this.isles;
    // rolling cloud sea below the fight, three banks deep
    for (const bank of sk.banks) {
      const ox = this.cam.x * bank.lag, oy = this.cam.y * bank.lag * 0.85;
      ctx.fillStyle = bank.fill;
      for (const c of bank.puffs) {
        const x = c.x + ox + Math.sin(t * c.spd + c.ph) * c.drift;
        const y = sk.seaY + c.dy + oy + Math.sin(t * c.spd * 0.6 + c.ph * 2) * 6;
        ctx.beginPath();
        ctx.ellipse(x, y, c.w, c.h, 0, 0, 7);
        ctx.fill();
      }
    }
    // floating islands, far to near
    for (const layer of sk.layers) {
      const ox = this.cam.x * layer.lag, oy = this.cam.y * layer.lag * 0.85;
      for (const isle of layer.isles) {
        const bob = Math.sin(t * isle.spd + isle.ph) * isle.bob;
        const x = isle.x + ox, y = isle.y + oy + bob;
        ctx.fillStyle = layer.rock;
        ctx.beginPath();                       // jagged keel hanging below
        ctx.moveTo(x - isle.w / 2, y);
        ctx.lineTo(x - isle.w * 0.24, y + isle.d * 0.55);
        ctx.lineTo(x - isle.w * 0.05, y + isle.d);
        ctx.lineTo(x + isle.w * 0.18, y + isle.d * 0.45);
        ctx.lineTo(x + isle.w / 2, y);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = layer.turf;            // grassy cap
        ctx.beginPath();
        ctx.ellipse(x, y, isle.w / 2, isle.h, 0, Math.PI, 0);
        ctx.fill();
        ctx.fillRect(x - isle.w / 2, y - 3, isle.w, 4);
        if (isle.spire) {                      // watch-spire with a snapping banner
          const sx = x + isle.w * 0.16;
          ctx.strokeStyle = layer.rock;
          ctx.lineWidth = 4;
          ctx.beginPath(); ctx.moveTo(sx, y - 2); ctx.lineTo(sx, y - isle.sp); ctx.stroke();
          ctx.fillStyle = layer.flag;
          ctx.beginPath();
          const fw = 16 + Math.sin(t * 3.2 + isle.ph) * 3;
          ctx.moveTo(sx, y - isle.sp);
          ctx.lineTo(sx + fw, y - isle.sp + 5 + Math.sin(t * 5 + isle.ph) * 2);
          ctx.lineTo(sx, y - isle.sp + 10);
          ctx.closePath(); ctx.fill();
        }
        if (isle.fall) {                       // waterfall misting off the rim
          const fx = x - isle.w * 0.22;
          const grad = ctx.createLinearGradient(0, y, 0, y + isle.fallLen);
          grad.addColorStop(0, 'rgba(190, 220, 255, .5)');
          grad.addColorStop(1, 'rgba(190, 220, 255, 0)');
          ctx.fillStyle = grad;
          const wob = Math.sin(t * 2 + isle.ph) * 1.5;
          ctx.fillRect(fx + wob, y, 5, isle.fallLen);
          ctx.fillRect(fx + 8 - wob, y, 3, isle.fallLen * 0.75);
        }
      }
    }
  }

  // The Crucible: parallax silhouettes of the works — blast furnaces,
  // chimneys venting smoke, cooling towers, a glowing ladle crane crawling
  // its gantry rail — over a distant melt-glow horizon.
  _worksBackdrop(ctx, t) {
    const wk = this.works;
    // melt-glow horizon line behind everything
    const gy = wk.baseY + this.cam.y * 0.85 * wk.layers[0].lag;
    const hg = ctx.createLinearGradient(0, gy - 130, 0, gy + 40);
    hg.addColorStop(0, 'rgba(255, 106, 42, 0)');
    hg.addColorStop(1, 'rgba(255, 106, 42, .3)');
    ctx.fillStyle = hg;
    ctx.fillRect(this.cam.x - 1700, gy - 130, 3400, 170);
    for (const layer of wk.layers) {
      const ox = this.cam.x * layer.lag, oy = this.cam.y * layer.lag * 0.85;
      ctx.fillStyle = layer.fill;
      for (const b of wk.bldgs) {
        if (b.layer !== layer.i) continue;
        const x = b.x + ox, yb = wk.baseY + oy;
        if (b.kind === 0) {                        // blast furnace: flared stack
          ctx.beginPath();
          ctx.moveTo(x, yb);
          ctx.lineTo(x + b.w * 0.16, yb - b.h * 0.62);
          ctx.lineTo(x, yb - b.h * 0.74);
          ctx.lineTo(x + b.w * 0.3, yb - b.h);
          ctx.lineTo(x + b.w * 0.7, yb - b.h);
          ctx.lineTo(x + b.w, yb - b.h * 0.74);
          ctx.lineTo(x + b.w * 0.84, yb - b.h * 0.62);
          ctx.lineTo(x + b.w, yb);
          ctx.closePath(); ctx.fill();
          const fl = 0.5 + 0.5 * Math.sin(t * 5 + b.ph);   // throat glow
          ctx.fillStyle = `rgba(255, 140, 50, ${(0.25 + 0.3 * fl).toFixed(3)})`;
          ctx.fillRect(x + b.w * 0.36, yb - b.h * 0.98, b.w * 0.28, b.h * 0.1);
          ctx.fillStyle = layer.fill;
        } else if (b.kind === 1) {                 // chimney trio with smoke
          for (let c = 0; c < 3; c++) {
            const cx = x + c * b.w * 0.38, chh = b.h * (1 - c * 0.14);
            ctx.fillRect(cx, yb - chh, b.w * 0.22, chh);
            for (let sPuff = 0; sPuff < 3; sPuff++) {   // drifting smoke puffs
              const k = ((t * 0.09 + b.ph + sPuff / 3 + c * 0.21) % 1);
              ctx.globalAlpha = 0.16 * (1 - k);
              ctx.beginPath();
              ctx.arc(cx + b.w * 0.11 + k * 34 + Math.sin(t * 0.5 + sPuff) * 6,
                yb - chh - 8 - k * 90, 7 + k * 16, 0, 7);
              ctx.fill();
            }
            ctx.globalAlpha = 1;
          }
        } else {                                   // cooling tower: pinched waist
          ctx.beginPath();
          ctx.moveTo(x, yb);
          ctx.quadraticCurveTo(x + b.w * 0.24, yb - b.h * 0.55, x + b.w * 0.16, yb - b.h);
          ctx.lineTo(x + b.w * 0.84, yb - b.h);
          ctx.quadraticCurveTo(x + b.w * 0.76, yb - b.h * 0.55, x + b.w, yb);
          ctx.closePath(); ctx.fill();
        }
      }
    }
    // ladle crane crawling the mid-layer gantry rail, pouring a glow trail
    const mid = wk.layers[1];
    const ox = this.cam.x * mid.lag, oy = this.cam.y * mid.lag * 0.85;
    const railY = wk.baseY + oy - 210;
    ctx.strokeStyle = mid.fill;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-1500 + ox, railY); ctx.lineTo(1500 + ox, railY);
    ctx.stroke();
    for (let px = -1400; px <= 1400; px += 350) {  // rail trestles
      ctx.beginPath();
      ctx.moveTo(px + ox, railY);
      ctx.lineTo(px + ox, wk.baseY + oy);
      ctx.stroke();
    }
    const lx = ox + Math.sin(t * 0.11) * 900;      // the ladle itself
    ctx.fillStyle = mid.fill;
    ctx.fillRect(lx - 26, railY, 52, 14);
    ctx.strokeStyle = mid.fill;
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(lx, railY + 14); ctx.lineTo(lx, railY + 44); ctx.stroke();
    ctx.beginPath();                               // bucket, brimming
    ctx.moveTo(lx - 20, railY + 44);
    ctx.lineTo(lx + 20, railY + 44);
    ctx.lineTo(lx + 13, railY + 74);
    ctx.lineTo(lx - 13, railY + 74);
    ctx.closePath(); ctx.fill();
    const brim = 0.6 + 0.4 * Math.sin(t * 3.1);
    ctx.fillStyle = `rgba(255, 150, 60, ${(0.55 + 0.3 * brim).toFixed(3)})`;
    ctx.fillRect(lx - 17, railY + 44, 34, 5);
  }

  // Overgrown Eden: parallax rows of giant flora — towering stems, huge
  // seed-head silhouettes, curling ferns — swaying on a slow breeze, with
  // hanging vines and drifting pollen motes in the moonlight.
  _floraBackdrop(ctx, t) {
    const fl = this.flora;
    for (const layer of fl.layers) {
      const ox = this.cam.x * layer.lag, oy = this.cam.y * layer.lag * 0.85;
      for (const p of layer.plants) {
        const x = p.x + ox, yb = fl.baseY + oy;
        const sway = Math.sin(t * p.spd + p.ph) * p.sway;
        const topX = x + sway, topY = yb - p.h;
        ctx.strokeStyle = layer.fill;
        ctx.lineWidth = p.stem;
        ctx.lineCap = 'round';
        ctx.beginPath();                           // bowed stem
        ctx.moveTo(x, yb);
        ctx.quadraticCurveTo(x + sway * 0.3, yb - p.h * 0.6, topX, topY);
        ctx.stroke();
        ctx.fillStyle = layer.fill;
        if (p.kind === 0) {                        // seed head: dandelion globe
          ctx.globalAlpha = 0.55;
          ctx.beginPath(); ctx.arc(topX, topY, p.head, 0, 7); ctx.fill();
          ctx.globalAlpha = 1;
          ctx.beginPath(); ctx.arc(topX, topY, p.head * 0.4, 0, 7); ctx.fill();
        } else if (p.kind === 1) {                 // drooping bell bloom
          ctx.beginPath();
          ctx.moveTo(topX, topY);
          ctx.quadraticCurveTo(topX + p.head, topY + p.head * 0.3, topX + p.head * 0.7, topY + p.head * 1.3);
          ctx.lineTo(topX - p.head * 0.7, topY + p.head * 1.3);
          ctx.quadraticCurveTo(topX - p.head, topY + p.head * 0.3, topX, topY);
          ctx.fill();
        } else {                                   // curled fern crook
          ctx.lineWidth = p.stem * 0.75;
          ctx.beginPath();
          ctx.arc(topX, topY + p.head * 0.4, p.head * 0.55, -Math.PI * 0.5, Math.PI * 0.9);
          ctx.stroke();
        }
      }
      if (!layer.vines) continue;
      for (const v of layer.vines) {               // vines swagged across the top
        const x = v.x + ox, oyv = oy - 520;
        ctx.strokeStyle = layer.fill;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x, oyv);
        ctx.quadraticCurveTo(x + v.w / 2, oyv + v.sag + Math.sin(t * 0.5 + v.ph) * 6, x + v.w, oyv);
        ctx.stroke();
        for (let i = 1; i < 4; i++) {              // dangling leaf sprigs
          const k = i / 4;
          const lx = x + v.w * k;
          const ly = oyv + v.sag * 4 * k * (1 - k) + Math.sin(t * 0.5 + v.ph) * 6 * k;
          ctx.beginPath();
          ctx.ellipse(lx, ly + 8, 3.5, 8, Math.sin(t * 0.8 + i) * 0.2, 0, 7);
          ctx.fillStyle = layer.fill;
          ctx.fill();
        }
      }
    }
    // pollen motes drifting through the moonbeams (stateless)
    for (let i = 0; i < 14; i++) {
      const k = (t * 0.03 + i / 14) % 1;
      const x = this.cam.x + ((i * 419) % 2400) - 1200 + Math.sin(t * 0.4 + i * 2.2) * 60;
      const y = this.cam.y - 500 + k * 900;
      ctx.globalAlpha = 0.22 * Math.sin(k * Math.PI);
      ctx.fillStyle = '#ffe9a8';
      ctx.beginPath(); ctx.arc(x, y, 2.2, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
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

  // Dust Divide: one huge mesa table under the noon sun — banded strata
  // flanks, a sun-cracked hardpan top with old wagon ruts, dry brush
  // hissing in the wind, and a longhorn skull bleaching by the east lip.
  _flatlandsStage(ctx, t) {
    const th = this.theme, m = this.stage.main;

    // mesa body: strata bands stepping down into the haze
    const BANDS = ['#a8794a', '#96684a', '#875b40', '#7a5138', '#6e4832'];
    let by = m.y + 14;
    for (const [i, c] of BANDS.entries()) {
      const bh = 30 + i * 26;
      const inset = i * 9;
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.moveTo(m.x + inset, by);
      ctx.lineTo(m.x + m.w - inset, by);
      ctx.lineTo(m.x + m.w - inset - 7, by + bh);
      ctx.lineTo(m.x + inset + 7, by + bh);
      ctx.closePath(); ctx.fill();
      by += bh;
    }
    ctx.strokeStyle = 'rgba(0,0,0,.28)';          // erosion gullies
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (const fx of [0.16, 0.38, 0.63, 0.86]) {
      const gx = m.x + m.w * fx;
      ctx.moveTo(gx, m.y + 20);
      ctx.quadraticCurveTo(gx + 10, m.y + 90, gx - 6, m.y + 170);
    }
    ctx.stroke();

    // hardpan top
    ctx.fillStyle = th.deck;
    roundRect(ctx, m.x, m.y, m.w, 18, 8); ctx.fill();
    ctx.fillStyle = '#c99a5f';                    // sun-bleached crust
    ctx.fillRect(m.x + 4, m.y, m.w - 8, 7);
    ctx.strokeStyle = 'rgba(122, 81, 56, .55)';   // cracked-earth web
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    for (let i = 0; i < 11; i++) {
      const cx = m.x + 50 + i * (m.w - 100) / 10 + ((i * 73) % 17) - 8;
      ctx.moveTo(cx, m.y + 1);
      ctx.lineTo(cx + ((i * 41) % 13) - 6, m.y + 8);
      if (i % 3 !== 2) ctx.lineTo(cx + ((i * 29) % 19) - 9, m.y + 16);
    }
    for (let i = 0; i < 5; i++) {                 // linking cross-cracks
      const cx = m.x + 90 + i * (m.w - 180) / 4;
      ctx.moveTo(cx, m.y + 8 + (i % 3) * 3);
      ctx.lineTo(cx + 34 + (i % 2) * 12, m.y + 6 + ((i + 1) % 3) * 3);
    }
    ctx.stroke();
    ctx.globalAlpha = 0.4;                        // old wagon ruts
    ctx.strokeStyle = '#8f6238';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(m.x + 30, m.y + 5); ctx.lineTo(m.x + m.w - 30, m.y + 3);
    ctx.moveTo(m.x + 30, m.y + 12); ctx.lineTo(m.x + m.w - 30, m.y + 10);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // dry brush tufts hissing in the wind
    for (const [fx, s] of [[0.08, 1], [0.27, 0.7], [0.52, 0.85], [0.71, 0.65], [0.93, 1.1]]) {
      const bx = m.x + m.w * fx, sway = Math.sin(t * 2.1 + fx * 20) * 2.5;
      ctx.strokeStyle = '#a8905c';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = -2; i <= 2; i++) {
        ctx.moveTo(bx, m.y + 1);
        ctx.quadraticCurveTo(bx + i * 3, m.y - 8 * s, bx + i * 4.5 + sway, m.y - 15 * s);
      }
      ctx.stroke();
    }

    // longhorn skull bleaching by the east lip
    const kx = m.x + m.w - 84, ky = m.y - 7;
    ctx.strokeStyle = '#f2ead8';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();                              // horns
    ctx.moveTo(kx - 16, ky - 2);
    ctx.quadraticCurveTo(kx - 26, ky - 12, kx - 22, ky - 16);
    ctx.moveTo(kx + 16, ky - 2);
    ctx.quadraticCurveTo(kx + 26, ky - 12, kx + 22, ky - 16);
    ctx.stroke();
    ctx.fillStyle = '#f2ead8';                    // cranium + snout
    ctx.beginPath(); ctx.arc(kx, ky - 4, 9, 0, 7); ctx.fill();
    ctx.fillRect(kx - 4.5, ky - 2, 9, 9);
    ctx.fillStyle = '#3a2c22';                    // eye sockets
    ctx.beginPath(); ctx.arc(kx - 4, ky - 5, 2, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(kx + 4, ky - 5, 2, 0, 7); ctx.fill();
  }

  // Sky Bastion: the classic triplat reimagined as a fortress isle — stone
  // block face with a rocky keel, waterfalls off both lips, lantern posts,
  // and rune-lit floating stone platforms. Geometry is untouched.
  _bastionStage(ctx, plats, t) {
    const th = this.theme, m = this.stage.main;

    // jagged rock keel under the fortress, tapering into the void
    ctx.fillStyle = '#2b2547';
    ctx.beginPath();
    ctx.moveTo(m.x + 6, m.y + m.h + 24);
    ctx.lineTo(m.x + m.w * 0.2, m.y + 190);
    ctx.lineTo(m.x + m.w * 0.42, m.y + 320);
    ctx.lineTo(m.x + m.w * 0.52, m.y + 430);
    ctx.lineTo(m.x + m.w * 0.62, m.y + 300);
    ctx.lineTo(m.x + m.w * 0.82, m.y + 160);
    ctx.lineTo(m.x + m.w - 6, m.y + m.h + 24);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(120, 110, 180, .25)';    // keel cracks
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(m.x + m.w * 0.3, m.y + 120);
    ctx.lineTo(m.x + m.w * 0.44, m.y + 260);
    ctx.moveTo(m.x + m.w * 0.68, m.y + 110);
    ctx.lineTo(m.x + m.w * 0.58, m.y + 240);
    ctx.stroke();

    // fortress deck: dressed stone blocks
    ctx.fillStyle = th.deck;
    roundRect(ctx, m.x, m.y, m.w, m.h + 30, 12); ctx.fill();
    ctx.strokeStyle = 'rgba(20, 18, 44, .5)';        // masonry joints
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let row = 0; row < 2; row++) {
      const jy = m.y + 22 + row * 26;
      ctx.moveTo(m.x + 6, jy); ctx.lineTo(m.x + m.w - 6, jy);
      const off = row % 2 ? 45 : 0;
      for (let jx = m.x + 45 + off; jx < m.x + m.w - 20; jx += 90) {
        ctx.moveTo(jx, jy - (row ? 26 : 22) + 4); ctx.lineTo(jx, jy);
      }
    }
    ctx.stroke();
    ctx.fillStyle = th.lip;                          // parapet lip
    roundRect(ctx, m.x, m.y, m.w, 12, 6); ctx.fill();
    ctx.fillStyle = th.trim;                         // gilded edge
    ctx.fillRect(m.x + 8, m.y + 1, m.w - 16, 3);

    // waterfalls spilling off both lips, misting into the cloud sea
    for (const [fx, dir] of [[m.x + 3, -1], [m.x + m.w - 3, 1]]) {
      const grad = ctx.createLinearGradient(0, m.y, 0, m.y + 300);
      grad.addColorStop(0, 'rgba(190, 220, 255, .55)');
      grad.addColorStop(1, 'rgba(190, 220, 255, 0)');
      ctx.fillStyle = grad;
      const wob = Math.sin(t * 2.4 + dir) * 2;
      ctx.fillRect(fx + wob - 3, m.y + 4, 6, 300);
      ctx.fillRect(fx + dir * 7 - wob - 2, m.y + 4, 4, 220);
      for (let i = 0; i < 3; i++) {                  // mist puffs where it fades
        const k = (t * 0.5 + i / 3) % 1;
        ctx.globalAlpha = 0.2 * (1 - k);
        ctx.fillStyle = '#cfe0ff';
        ctx.beginPath();
        ctx.arc(fx + dir * k * 26, m.y + 230 + k * 90, 8 + k * 14, 0, 7);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // lantern posts flanking the deck, flames breathing slow
    for (const lx of [m.x + 40, m.x + m.w - 40]) {
      ctx.strokeStyle = '#242043';
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(lx, m.y); ctx.lineTo(lx, m.y - 40); ctx.stroke();
      const breathe = 0.75 + 0.25 * Math.sin(t * 2.2 + lx);
      const lg = ctx.createRadialGradient(lx, m.y - 48, 1, lx, m.y - 48, 24 * breathe);
      lg.addColorStop(0, 'rgba(255, 205, 110, .5)');
      lg.addColorStop(1, 'rgba(255, 205, 110, 0)');
      ctx.fillStyle = lg;
      ctx.fillRect(lx - 24, m.y - 72, 48, 48);
      ctx.fillStyle = '#242043';                     // cage
      roundRect(ctx, lx - 7, m.y - 56, 14, 17, 4); ctx.fill();
      ctx.fillStyle = `rgba(255, 205, 110, ${0.6 + 0.4 * breathe})`;
      ctx.fillRect(lx - 3.5, m.y - 52, 7, 9);
    }

    // floating stone platforms: rune-lit slabs with small pebble keels,
    // hovering exactly where the sim says they are (visual-only shimmer)
    for (const [i, p] of plats.entries()) {
      const cx = p.x + p.w / 2;
      ctx.fillStyle = th.plat;                       // stone slab
      roundRect(ctx, p.x, p.y, p.w, 14, 5); ctx.fill();
      ctx.fillStyle = th.platTop;
      ctx.fillRect(p.x + 6, p.y + 1, p.w - 12, 3);
      ctx.fillStyle = '#2b2547';                     // pebble keel
      ctx.beginPath();
      ctx.moveTo(p.x + p.w * 0.28, p.y + 14);
      ctx.lineTo(cx, p.y + 30);
      ctx.lineTo(p.x + p.w * 0.72, p.y + 14);
      ctx.closePath(); ctx.fill();
      const pulse = 0.45 + 0.4 * Math.sin(t * 1.8 + i * 2.1);   // rune glow
      ctx.globalAlpha = pulse;
      ctx.fillStyle = '#8fd3ff';
      for (let rn = 0; rn < 3; rn++) {
        const rx = p.x + p.w * (0.25 + 0.25 * rn);
        ctx.fillRect(rx - 1.5, p.y + 6, 3, 5);
        ctx.fillRect(rx - 4, p.y + 8, 8, 2);
      }
      ctx.globalAlpha = Math.min(0.5, pulse * 0.5);  // under-glow
      const ug = ctx.createRadialGradient(cx, p.y + 20, 2, cx, p.y + 20, p.w * 0.4);
      ug.addColorStop(0, 'rgba(143, 211, 255, .5)');
      ug.addColorStop(1, 'rgba(143, 211, 255, 0)');
      ctx.fillStyle = ug;
      ctx.fillRect(cx - p.w * 0.4, p.y + 6, p.w * 0.8, p.w * 0.5);
      ctx.globalAlpha = 1;
    }
  }

  // The Crucible: a slag-crusted pour deck over a churning lava moat, two
  // riveted side perches, and the vent grates — glowing hotter through the
  // telegraph, then erupting in a column of melt exactly where the sim says.
  _crucibleStage(ctx, plats, tickF, t) {
    const th = this.theme, m = this.stage.main;

    // churning lava moat under the deck: layered waves + drifting slag crust
    const ly = m.y + 170;
    const lg = ctx.createLinearGradient(0, ly - 30, 0, ly + 260);
    lg.addColorStop(0, '#ff9a3d');
    lg.addColorStop(0.35, '#e04b1c');
    lg.addColorStop(1, '#5a1408');
    ctx.fillStyle = lg;
    ctx.beginPath();
    ctx.moveTo(m.x - 640, ly + 260);
    ctx.lineTo(m.x - 640, ly);
    for (let wx = m.x - 640; wx <= m.x + m.w + 640; wx += 40) {
      ctx.lineTo(wx, ly + Math.sin(wx * 0.013 + t * 1.1) * 9
        + Math.sin(wx * 0.031 - t * 0.7) * 5);
    }
    ctx.lineTo(m.x + m.w + 640, ly + 260);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(30, 10, 6, .55)';        // slag crust plates adrift
    for (let i = 0; i < 7; i++) {
      const sx = m.x - 500 + i * 260 + Math.sin(t * 0.12 + i * 2.2) * 70;
      const sy = ly + 26 + Math.sin(t * 0.8 + i) * 7 + (i % 3) * 24;
      ctx.beginPath();
      ctx.ellipse(sx, sy, 64 + (i % 3) * 22, 12, Math.sin(i * 5) * 0.08, 0, 7);
      ctx.fill();
    }
    for (let i = 0; i < 4; i++) {                  // lazy lava bubbles
      const k = (t * 0.5 + i * 0.77) % 1;
      const bx = m.x - 300 + ((i * 731) % (m.w + 600));
      ctx.globalAlpha = 0.5 * (1 - k);
      ctx.strokeStyle = '#ffc46a';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(bx, ly + 16 - k * 10, 4 + k * 12, 0, 7);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    const uw = ctx.createLinearGradient(0, m.y + m.h, 0, ly);   // updraft glow licking the deck
    uw.addColorStop(0, 'rgba(255, 110, 40, .16)');
    uw.addColorStop(1, 'rgba(255, 110, 40, 0)');
    ctx.fillStyle = uw;
    ctx.fillRect(m.x - 80, m.y + m.h, m.w + 160, ly - m.y - m.h);

    // pour deck: scorched plate steel on riveted box girders
    ctx.fillStyle = th.deck;
    roundRect(ctx, m.x, m.y, m.w, m.h + 30, 10); ctx.fill();
    ctx.strokeStyle = 'rgba(12, 6, 8, .6)';        // plate seams
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let px = m.x + 75; px < m.x + m.w - 20; px += 75) {
      ctx.moveTo(px, m.y + 14); ctx.lineTo(px, m.y + m.h + 26);
    }
    ctx.moveTo(m.x + 6, m.y + 40); ctx.lineTo(m.x + m.w - 6, m.y + 40);
    ctx.stroke();
    ctx.fillStyle = '#211a1e';                     // rivet lines
    for (let px = m.x + 22; px < m.x + m.w - 12; px += 37) {
      ctx.beginPath(); ctx.arc(px, m.y + 47, 2.6, 0, 7); ctx.fill();
    }
    ctx.fillStyle = th.lip;                        // worn lip + hazard chevrons
    roundRect(ctx, m.x, m.y, m.w, 12, 6); ctx.fill();
    ctx.save();
    ctx.beginPath(); ctx.rect(m.x + 4, m.y + 1, m.w - 8, 5); ctx.clip();
    for (let cx = m.x - 20; cx < m.x + m.w + 20; cx += 26) {
      ctx.fillStyle = ((cx - m.x) / 26 | 0) % 2 ? '#e8b23a' : '#242024';
      ctx.beginPath();
      ctx.moveTo(cx, m.y + 6); ctx.lineTo(cx + 13, m.y); ctx.lineTo(cx + 26, m.y + 6);
      ctx.lineTo(cx + 26, m.y + 1); ctx.lineTo(cx + 13, m.y + 6); ctx.lineTo(cx, m.y + 1);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();

    // vent grates & geysers, straight from the sim's shared clock
    for (const h of hazardsAt(this.mapId, tickF)) {
      const cx = h.x + h.w / 2;
      if (h.state === 'erupt') {
        // column of melt: core, sheath, crown splash — k eases it in/out
        const grow = Math.min(1, h.k * 6) * (1 - Math.max(0, h.k - 0.82) / 0.18);
        const hh = h.h * grow;
        if (hh > 2) {
          const jw = h.w * (0.62 + Math.sin(t * 21) * 0.05);
          const cg = ctx.createLinearGradient(0, h.y - hh, 0, h.y);
          cg.addColorStop(0, 'rgba(255, 210, 62, .1)');
          cg.addColorStop(0.4, '#ffd23e');
          cg.addColorStop(1, '#ff6a2a');
          ctx.fillStyle = cg;
          ctx.beginPath();                         // sheath, waisted by sine wobble
          ctx.moveTo(cx - jw / 2, h.y);
          ctx.quadraticCurveTo(cx - jw * 0.34 + Math.sin(t * 17) * 4, h.y - hh * 0.55,
            cx - jw * 0.16, h.y - hh);
          ctx.lineTo(cx + jw * 0.16, h.y - hh);
          ctx.quadraticCurveTo(cx + jw * 0.34 - Math.sin(t * 15) * 4, h.y - hh * 0.5,
            cx + jw / 2, h.y);
          ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#fff3c8';               // white-hot core
          ctx.fillRect(cx - jw * 0.1, h.y - hh * 0.96, jw * 0.2, hh * 0.96);
          for (let d = 0; d < 5; d++) {            // crown droplets
            const dk = (t * 2.2 + d * 0.37) % 1;
            ctx.globalAlpha = 0.9 * (1 - dk);
            ctx.fillStyle = d % 2 ? '#ffd23e' : '#ff8a2e';
            ctx.beginPath();
            ctx.arc(cx + Math.sin(d * 2.4) * jw * (0.3 + dk * 0.5),
              h.y - hh - 6 - dk * 40 + dk * dk * 70, 3.4 - dk * 1.6, 0, 7);
            ctx.fill();
          }
          ctx.globalAlpha = 1;
          const wg = ctx.createRadialGradient(cx, h.y, 4, cx, h.y, h.w * 1.4);
          wg.addColorStop(0, 'rgba(255, 170, 70, .5)');
          wg.addColorStop(1, 'rgba(255, 170, 70, 0)');
          ctx.fillStyle = wg;                      // eruption floods the deck with light
          ctx.fillRect(cx - h.w * 1.4, h.y - h.w * 1.4, h.w * 2.8, h.w * 1.4);
        }
      } else if (h.state === 'warn') {
        // telegraph: grate glows hotter, spits warning sparks, rising steam
        const heat = h.k * h.k;
        const wg = ctx.createRadialGradient(cx, h.y, 2, cx, h.y, h.w * (0.7 + heat * 0.5));
        wg.addColorStop(0, `rgba(255, 130, 46, ${(0.2 + heat * 0.6).toFixed(3)})`);
        wg.addColorStop(1, 'rgba(255, 130, 46, 0)');
        ctx.fillStyle = wg;
        ctx.fillRect(cx - h.w, h.y - h.w, h.w * 2, h.w);
        for (let sp = 0; sp < 3; sp++) {           // spark spits, quickening
          const sk = (t * (2 + heat * 3) + sp / 3) % 1;
          ctx.globalAlpha = (1 - sk) * heat;
          ctx.fillStyle = '#ffd23e';
          ctx.fillRect(cx + Math.sin(sp * 4.2 + t * 3) * h.w * 0.3 - 1.5,
            h.y - 4 - sk * 46, 3, 3);
        }
        ctx.globalAlpha = 1;
      }
      // the grate itself, always visible: recessed slot + crossbars
      const glow = h.state === 'warn' ? h.k * h.k
        : h.state === 'erupt' ? 1 : Math.max(0, 0.25 - h.k * 0.25);
      ctx.fillStyle = '#171114';
      roundRect(ctx, h.x, h.y - 5, h.w, 9, 3); ctx.fill();
      for (let gx = 0; gx < 5; gx++) {
        ctx.fillStyle = glow > 0.03
          ? `rgba(255, ${Math.round(120 + glow * 90)}, 46, ${(0.35 + glow * 0.65).toFixed(3)})`
          : '#2c2226';
        ctx.fillRect(h.x + 5 + gx * (h.w - 10) / 5 + 2, h.y - 3.5, (h.w - 10) / 5 - 4, 6);
      }
    }

    // side perches: riveted plates on angled gusset struts off the void
    for (const p of plats) {
      const inner = p.x > m.x + m.w / 2 ? p.x : p.x + p.w;   // strut anchors toward the deck
      ctx.strokeStyle = '#241c20';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(inner, p.y + 10);
      ctx.lineTo(inner + (p.x > 0 ? -46 : 46), p.y + 78);
      ctx.stroke();
      ctx.fillStyle = th.plat;
      roundRect(ctx, p.x, p.y, p.w, 14, 4); ctx.fill();
      ctx.fillStyle = th.platTop;
      ctx.fillRect(p.x + 6, p.y + 1, p.w - 12, 3);
      ctx.fillStyle = '#211a1e';                   // perch rivets
      for (let rx = p.x + 12; rx < p.x + p.w - 8; rx += 24) {
        ctx.beginPath(); ctx.arc(rx, p.y + 9, 2.2, 0, 7); ctx.fill();
      }
      const eg = ctx.createLinearGradient(0, p.y + 14, 0, p.y + 44);   // moat-glow underside
      eg.addColorStop(0, 'rgba(255, 110, 40, .28)');
      eg.addColorStop(1, 'rgba(255, 110, 40, 0)');
      ctx.fillStyle = eg;
      ctx.fillRect(p.x + 2, p.y + 14, p.w - 4, 30);
    }
  }

  // Overgrown Eden: a mossy root-shelf floor knotted with giant roots, a
  // fallen-log bridge, glowing toadstools, and two giant flower heads
  // bobbing off the lips as living platforms.
  _gardenStage(ctx, plats, t) {
    const th = this.theme, m = this.stage.main;

    // giant taproots anchoring the shelf into the dark below
    ctx.strokeStyle = '#243c22';
    ctx.lineCap = 'round';
    for (const [fx, w, lean] of [[0.14, 34, -40], [0.4, 26, 20], [0.68, 30, -15], [0.9, 24, 45]]) {
      const rx = m.x + m.w * fx;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(rx, m.y + 20);
      ctx.quadraticCurveTo(rx + lean * 0.4, m.y + 210, rx + lean, m.y + 430);
      ctx.stroke();
    }

    // mossy shelf
    ctx.fillStyle = th.deck;
    roundRect(ctx, m.x, m.y, m.w, m.h + 30, 14); ctx.fill();
    ctx.fillStyle = th.lip;                        // moss cap
    roundRect(ctx, m.x, m.y, m.w, 13, 7); ctx.fill();
    ctx.fillStyle = '#5fae4e';                     // bright moss fringe
    for (let i = 0; i < Math.floor(m.w / 38); i++) {
      const gx = m.x + 8 + i * 38 + ((i * 37) % 11);
      ctx.beginPath();
      ctx.arc(gx, m.y + 2, 4 + ((i * 13) % 3), Math.PI, 0);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(20, 34, 18, .5)';      // root veins across the face
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(m.x + m.w * 0.22, m.y + 16);
    ctx.quadraticCurveTo(m.x + m.w * 0.3, m.y + 38, m.x + m.w * 0.26, m.y + 66);
    ctx.moveTo(m.x + m.w * 0.58, m.y + 14);
    ctx.quadraticCurveTo(m.x + m.w * 0.52, m.y + 40, m.x + m.w * 0.6, m.y + 72);
    ctx.stroke();
    // glowing toadstool cluster by the west lip
    for (const [dx, s, ph] of [[52, 1, 0], [72, 0.7, 2], [38, 0.55, 4]]) {
      const tx = m.x + dx, glow = 0.5 + 0.35 * Math.sin(t * 1.6 + ph);
      const g = ctx.createRadialGradient(tx, m.y - 8 * s, 1, tx, m.y - 8 * s, 26 * s);
      g.addColorStop(0, `rgba(120, 240, 200, ${(0.35 * glow).toFixed(3)})`);
      g.addColorStop(1, 'rgba(120, 240, 200, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(tx - 26 * s, m.y - 8 * s - 26 * s, 52 * s, 52 * s);
      ctx.fillStyle = '#d8e8dc';                   // stalk
      ctx.fillRect(tx - 2.5 * s, m.y - 10 * s, 5 * s, 10 * s);
      ctx.fillStyle = '#63d8b0';                   // cap
      ctx.beginPath(); ctx.arc(tx, m.y - 10 * s, 8 * s, Math.PI, 0); ctx.fill();
    }

    for (const [i, p] of plats.entries()) {
      const spec = this.stage.plats[i];
      if (spec.move?.dy) {
        // giant flower platform: stem rooted far below, petals cupping the pad
        const cx = p.x + p.w / 2;
        const sway = Math.sin(t * 0.7 + i * 3) * 8;
        ctx.strokeStyle = '#3a5c34';               // stem down into the void
        ctx.lineWidth = 9;
        ctx.beginPath();
        ctx.moveTo(cx, p.y + 12);
        ctx.quadraticCurveTo(cx + sway, p.y + 220, cx + sway * 2, p.y + 480);
        ctx.stroke();
        ctx.lineWidth = 4;                         // leaf pair on the stem
        ctx.beginPath();
        ctx.moveTo(cx + sway * 0.5, p.y + 90);
        ctx.quadraticCurveTo(cx + sway * 0.5 + 30, p.y + 74, cx + sway * 0.5 + 46, p.y + 86);
        ctx.moveTo(cx + sway * 0.7, p.y + 150);
        ctx.quadraticCurveTo(cx + sway * 0.7 - 30, p.y + 134, cx + sway * 0.7 - 44, p.y + 148);
        ctx.stroke();
        const bloom = ['#ff9ecf', '#b388ff'][i % 2];   // petal skirt under the pad
        ctx.fillStyle = bloom;
        for (let pe = 0; pe < 6; pe++) {
          const a = Math.PI * (0.12 + 0.152 * pe) + Math.sin(t * 0.9 + pe) * 0.03;
          ctx.beginPath();
          ctx.ellipse(cx + Math.cos(a) * p.w * 0.34, p.y + 13 + Math.sin(a) * 13,
            p.w * 0.2, 9, a * 0.5, 0, 7);
          ctx.fill();
        }
        ctx.fillStyle = '#ffd76a';                 // pollen disc = the pad
        roundRect(ctx, p.x, p.y, p.w, 12, 6); ctx.fill();
        ctx.fillStyle = '#ffe9a8';
        ctx.fillRect(p.x + 5, p.y + 1, p.w - 10, 3);
        ctx.globalAlpha = 0.5;                     // pollen freckles
        ctx.fillStyle = '#c98f2e';
        for (let d = 0; d < 5; d++) {
          ctx.beginPath();
          ctx.arc(p.x + 12 + d * (p.w - 24) / 4, p.y + 7, 1.6, 0, 7);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      } else {
        // fallen log bridge: bark shell, growth-ring ends, moss topside
        ctx.fillStyle = th.plat;
        roundRect(ctx, p.x, p.y, p.w, 16, 8); ctx.fill();
        ctx.strokeStyle = 'rgba(30, 20, 12, .45)'; // bark grain
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        for (const gy of [5, 9, 13]) {
          ctx.moveTo(p.x + 10, p.y + gy);
          ctx.quadraticCurveTo(p.x + p.w / 2, p.y + gy + 2, p.x + p.w - 10, p.y + gy);
        }
        ctx.stroke();
        for (const ex of [p.x + 4, p.x + p.w - 4]) {   // growth-ring end caps
          ctx.fillStyle = '#8a6f4d';
          ctx.beginPath(); ctx.ellipse(ex, p.y + 8, 5, 8, 0, 0, 7); ctx.fill();
          ctx.strokeStyle = 'rgba(60, 44, 26, .6)';
          ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.ellipse(ex, p.y + 8, 2.5, 4.5, 0, 0, 7); ctx.stroke();
        }
        ctx.fillStyle = '#5fae4e';                 // moss topside
        for (let gx = p.x + 12; gx < p.x + p.w - 12; gx += 26) {
          ctx.beginPath(); ctx.arc(gx, p.y + 1, 4, Math.PI, 0); ctx.fill();
        }
      }
    }
  }

  // Ambient weather, per theme: embers & ash rising off the burning ruins,
  // or neon-lit rain sheeting down over the heights.
  _ambient(ctx, dt, t) {
    if (this.theme.ambient === 'ashspark') {
      // sparks climbing off the moat on the updraft; soot flakes sifting down
      while (this.ambient.length < 40) {
        const soot = Math.random() < 0.3;
        this.ambient.push({
          soot,
          x: this.cam.x + (Math.random() - 0.5) * 2200,
          y: soot ? this.cam.y - 650 - Math.random() * 300 : this.cam.y + 380 + Math.random() * 300,
          vy: soot ? 30 + Math.random() * 26 : -(60 + Math.random() * 90),
          sway: 12 + Math.random() * 26, ph: Math.random() * 7,
          life: 4 + Math.random() * 4, t: 0, r: soot ? 1.8 : 2.4,
        });
      }
      for (const e of this.ambient) {
        e.t += dt;
        e.y += e.vy * dt;
        if (!e.soot) e.vy *= 1 - dt * 0.25;        // sparks ease off as they climb
        const k = e.t / e.life;
        if (k >= 1) continue;
        const x = e.x + Math.sin(t * 1.1 + e.ph) * e.sway;
        const glow = e.soot ? 0.3 : 0.5 + 0.5 * Math.sin(t * 8 + e.ph);
        ctx.globalAlpha = (1 - k) * (e.soot ? 0.45 : 0.9) * Math.max(0.2, glow);
        ctx.fillStyle = e.soot ? '#6d6068' : (glow > 0.75 ? '#ffd23e' : '#ff8a2e');
        ctx.fillRect(x, e.y, e.r + (e.soot ? 0 : glow), e.r + (e.soot ? 0 : glow));
      }
      ctx.globalAlpha = 1;
      this.ambient = this.ambient.filter(e => e.t < e.life);
      return;
    }
    if (this.theme.ambient === 'cloudwisp') {
      // thin wisps of cloud streaming past the bastion at fight height
      while (this.ambient.length < 10) {
        this.ambient.push({
          x: this.cam.x + (Math.random() < 0.5 ? -1 : 1) * (700 + Math.random() * 500),
          y: this.cam.y + (Math.random() - 0.55) * 700,
          vx: 26 + Math.random() * 40,
          w: 70 + Math.random() * 130, h: 7 + Math.random() * 9,
          a: 0.05 + Math.random() * 0.08,
          life: 16 + Math.random() * 10, t: 0,
        });
      }
      for (const c of this.ambient) {
        c.t += dt;
        c.x += c.vx * dt;
        const k = c.t / c.life;
        if (k >= 1) continue;
        ctx.globalAlpha = Math.sin(k * Math.PI) * c.a * 3;
        ctx.fillStyle = '#d8dcf2';
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, c.w, c.h, 0, 0, 7);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(c.x - c.w * 0.4, c.y + c.h * 0.6, c.w * 0.5, c.h * 0.6, 0, 0, 7);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      this.ambient = this.ambient.filter(c => c.t < c.life);
      return;
    }
    if (this.theme.ambient === 'fireflies') {
      // fireflies wandering the gloom, pulsing green-gold as they drift
      while (this.ambient.length < 26) {
        this.ambient.push({
          x: this.cam.x + (Math.random() - 0.5) * 2200,
          y: this.cam.y + (Math.random() - 0.4) * 800,
          wx: Math.random() * 7, wy: Math.random() * 7,
          sx: 30 + Math.random() * 50, sy: 20 + Math.random() * 34,
          ph: Math.random() * 7, blink: 0.5 + Math.random() * 1.4,
          life: 7 + Math.random() * 6, t: 0,
        });
      }
      for (const f of this.ambient) {
        f.t += dt;
        const k = f.t / f.life;
        if (k >= 1) continue;
        const x = f.x + Math.sin(t * 0.55 + f.wx) * f.sx;
        const y = f.y + Math.sin(t * 0.4 + f.wy) * f.sy;
        const pulse = Math.max(0, Math.sin(t * f.blink + f.ph));
        const a = Math.sin(k * Math.PI) * (0.15 + 0.75 * pulse * pulse);
        const g = ctx.createRadialGradient(x, y, 0, x, y, 9);
        g.addColorStop(0, `rgba(190, 255, 130, ${(a).toFixed(3)})`);
        g.addColorStop(1, 'rgba(190, 255, 130, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - 9, y - 9, 18, 18);
        ctx.globalAlpha = Math.min(1, a * 1.6);
        ctx.fillStyle = '#eaffbe';
        ctx.fillRect(x - 1.2, y - 1.2, 2.4, 2.4);
      }
      ctx.globalAlpha = 1;
      this.ambient = this.ambient.filter(f => f.t < f.life);
      return;
    }
    if (this.theme.ambient === 'dust') {
      // tumbleweeds bounding across the mesa, dropping off the west lip,
      // plus sun-lit grit streaming on the wind
      const m = this.stage.main;
      while (this.ambient.length < 26) {
        const weed = this.ambient.filter(a => a.weed).length < 2 && Math.random() < 0.15;
        this.ambient.push(weed
          ? {
            weed: true, x: m.x + m.w + 60 + Math.random() * 500, y: m.y - 14,
            vx: -(150 + Math.random() * 90), vy: 0, r: 11 + Math.random() * 7,
            rot: Math.random() * 7, life: 14, t: 0,
          }
          : {
            x: this.cam.x + (Math.random() - 0.5) * 2600,
            y: this.cam.y + (Math.random() - 0.7) * 900,
            vx: -(60 + Math.random() * 70), vy: 0,
            sway: 6 + Math.random() * 12, ph: Math.random() * 7,
            life: 4 + Math.random() * 4, t: 0, r: 1.3 + Math.random() * 1.2,
          });
      }
      for (const a of this.ambient) {
        a.t += dt;
        const k = a.t / a.life;
        if (k >= 1) continue;
        if (a.weed) {
          a.x += a.vx * dt;
          const onMesa = a.x > m.x && a.x < m.x + m.w;
          if (onMesa && a.y >= m.y - a.r - 3 && a.vy >= 0) {
            a.vy = -(120 + Math.random() * 130);   // bounce off the hardpan
          } else {
            a.vy += 900 * dt;                      // off the lip: tumble away
          }
          a.y = Math.min(a.y + a.vy * dt, onMesa ? m.y - a.r : 1e9);
          a.rot -= dt * 6;
          if (a.y > m.y + 900) { a.t = a.life; continue; }
          ctx.save();
          ctx.translate(a.x, a.y);
          ctx.rotate(a.rot);
          ctx.strokeStyle = 'rgba(150, 112, 58, .8)';
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.arc(0, 0, a.r, 0, 7);
          for (let i = 0; i < 4; i++) {
            const ang = i * Math.PI / 4;
            ctx.moveTo(Math.cos(ang) * a.r, Math.sin(ang) * a.r);
            ctx.lineTo(-Math.cos(ang) * a.r, -Math.sin(ang) * a.r);
          }
          ctx.stroke();
          ctx.restore();
        } else {
          a.x += a.vx * dt;
          const y = a.y + Math.sin(t * 1.4 + a.ph) * a.sway;
          ctx.globalAlpha = 0.28 * Math.sin(k * Math.PI);
          ctx.fillStyle = '#f4dfb0';
          ctx.fillRect(a.x, y, a.r * 2.2, a.r);
        }
      }
      ctx.globalAlpha = 1;
      this.ambient = this.ambient.filter(a => a.t < a.life);
      return;
    }
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

    // parked (player stepped out): steady ghosting + drifting z's instead
    // of the invuln flicker — reads as "asleep, untouchable"
    if (f.parked) {
      ctx.fillStyle = '#eaf0ff';
      ctx.textAlign = 'center';
      for (let i = 0; i < 3; i++) {
        const ph = (t * 0.5 + i / 3) % 1;
        ctx.globalAlpha = 0.8 * (1 - ph);
        ctx.font = `bold ${11 + i * 3 + ph * 8}px system-ui, sans-serif`;
        ctx.fillText('z', 20 + i * 10 + ph * 10, -F_H / 2 - 10 - i * 10 - ph * 16);
      }
      ctx.globalAlpha = 0.7;
    } else if (f.invuln && Math.sin(t * 30) > 0) ctx.globalAlpha = 0.45;

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

    // worn blade: a hilt over the back shoulder marks sword users at rest;
    // it disappears while the blade itself is out (charging or slashing)
    if (f.weapon === 'sword' && f.atk !== 'slash') {
      ctx.save();
      ctx.scale(f.facing || 1, 1);
      ctx.translate(-bw / 2 + 9, bTop + 6);
      ctx.rotate(-0.55);
      ctx.fillStyle = '#cfd8ea';                       // blade stub
      ctx.fillRect(-2, -14, 4, 16);
      ctx.fillStyle = '#ffd23e';                       // crossguard
      ctx.fillRect(-6.5, -16, 13, 3.5);
      ctx.fillStyle = '#8a6a48';                       // grip
      ctx.fillRect(-1.8, -26, 3.6, 10);
      ctx.fillStyle = '#ffd23e';                       // pommel
      ctx.beginPath(); ctx.arc(0, -27.5, 2.8, 0, 7); ctx.fill();
      ctx.restore();
    }

    // worn spear: a shaft angled across the back shoulder at rest; it
    // disappears while the thrust itself is out
    if (f.weapon === 'spear' && f.atk !== 'thrust') {
      ctx.save();
      ctx.scale(f.facing || 1, 1);
      ctx.translate(-bw / 2 + 8, bTop + 4);
      ctx.rotate(-0.62);
      ctx.strokeStyle = '#8a6a48';                     // wood shaft
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(0, 30); ctx.stroke();
      ctx.fillStyle = '#cfd8ea';                       // leaf-shaped head
      ctx.beginPath();
      ctx.moveTo(0, -18); ctx.lineTo(-3.4, -9); ctx.lineTo(3.4, -9);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }

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

    // mana meter: magic users wear their fuel gauge under their feet.
    // Violet while there's a cast in the tank, dimming when too dry to fire.
    if (f.weapon === 'magic' && f.mana != null) {
      const w = 44, h = 4;
      const k = clamp(f.mana / 100, 0, 1);
      const x = f.x - w / 2, y = f.y + F_H / 2 + 8;
      ctx.fillStyle = 'rgba(10,12,30,.6)';
      roundRect(ctx, x, y, w, h, 2); ctx.fill();
      if (k > 0) {
        ctx.fillStyle = k >= 0.35 ? '#b388ff' : '#6b5a96';  // 35 = one cast
        roundRect(ctx, x, y, Math.max(3, w * k), h, 2); ctx.fill();
      }
    }
  }

  // Attack hitbox: dashed outline while winding up (telegraph), then a hot
  // translucent fill during active frames. Mirrors game.js meleeHitbox.
  _hitbox(ctx, f, t) {
    if (f.hb.blade) return this._blade(ctx, f, t);
    if (f.hb.spear) return this._spear(ctx, f, t);
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

  // Sword slash: the hitbox IS the blade — a long tapered steel shape run
  // out along the aim from the wrist, with a gold crossguard at its base.
  // Ghost silhouette while winding up; flashing steel with a white-hot
  // cutting edge during active frames. Spans exactly the box the sim tests.
  _blade(ctx, f, t) {
    const { dx, dy, hw, hh, active } = f.hb;
    const n = Math.hypot(dx, dy) || 1;
    const ux = dx / n, uy = dy / n;
    const half = Math.abs(ux) * hw + Math.abs(uy) * hh;  // half-length along the aim
    const len = half * 2;
    const bt = Math.min(15, hw, hh);   // blade half-thickness (~slash.ry in game.js)
    ctx.save();
    ctx.translate(f.x + dx - ux * half, f.y + dy - uy * half);  // blade base
    ctx.rotate(Math.atan2(uy, ux));
    // blade silhouette: straight edges tapering to a point
    const shape = () => {
      ctx.beginPath();
      ctx.moveTo(2, -bt);
      ctx.lineTo(len * 0.74, -bt);
      ctx.lineTo(len, 0);                    // the point
      ctx.lineTo(len * 0.74, bt);
      ctx.lineTo(2, bt);
      ctx.closePath();
    };
    if (active) {
      const g = ctx.createLinearGradient(0, -bt, 0, bt);
      g.addColorStop(0, 'rgba(244,250,255,.95)');
      g.addColorStop(0.5, 'rgba(158,180,214,.8)');
      g.addColorStop(1, 'rgba(244,250,255,.95)');
      ctx.fillStyle = g;
      shape(); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.95)';
      ctx.lineWidth = 2.5;
      shape(); ctx.stroke();
      // fuller line down the middle
      ctx.strokeStyle = 'rgba(90,110,150,.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(len * 0.8, 0); ctx.stroke();
      // crossguard
      ctx.fillStyle = '#ffd23e';
      roundRect(ctx, -2, -bt - 7, 7, bt * 2 + 14, 3);
      ctx.fill();
    } else {
      // charging: a ghost of the blade, pulsing brighter as the charge builds
      const chg = f.hb.chg || 0;
      const pulse = chg ? (0.5 + 0.5 * Math.sin(t * (2 + 9 * chg) * 2 * Math.PI)) * chg : 0;
      if (pulse > 0.02) {
        ctx.fillStyle = `rgba(205, 228, 255, ${(0.30 * pulse).toFixed(3)})`;
        shape(); ctx.fill();
      }
      ctx.strokeStyle = `rgba(215, 236, 255, ${(0.6 + 0.4 * pulse).toFixed(3)})`;
      ctx.lineWidth = 2 + 2 * chg;
      ctx.setLineDash([7, 6]);
      ctx.lineDashOffset = -t * 60;
      shape(); ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = `rgba(255, 210, 62, ${(0.5 + 0.5 * pulse).toFixed(3)})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(0, -bt - 7); ctx.lineTo(0, bt + 7);   // crossguard hint
      ctx.stroke();
    }
    ctx.restore();
  }

  // Spear thrust: the live head runs out from where the dead zone ends —
  // exactly the box the sim tests — but a dulled wood shaft is drawn
  // bridging body to head so the whole weapon (and the gap up close) reads
  // at a glance. Only the leaf-shaped head lights up as live steel.
  _spear(ctx, f, t) {
    const { dx, dy, hw, hh, active } = f.hb;
    const n = Math.hypot(dx, dy) || 1;
    const ux = dx / n, uy = dy / n;
    const half = Math.abs(ux) * hw + Math.abs(uy) * hh;  // half-length of the live head
    const headLen = half * 2;
    const bt = Math.min(6, hw, hh);                       // thin shaft/head
    const rear = Math.max(0, n - half);                   // body edge through the dead zone
    ctx.save();
    ctx.translate(f.x + dx - ux * half, f.y + dy - uy * half);  // head base (dead-zone end)
    ctx.rotate(Math.atan2(uy, ux));
    ctx.strokeStyle = active ? 'rgba(150,110,70,.9)' : 'rgba(150,110,70,.5)';
    ctx.lineWidth = bt * 0.7;
    ctx.beginPath(); ctx.moveTo(-rear, 0); ctx.lineTo(2, 0); ctx.stroke();
    // leaf-shaped head: a narrow diamond point
    const shape = () => {
      ctx.beginPath();
      ctx.moveTo(2, 0);
      ctx.lineTo(headLen * 0.6, -bt);
      ctx.lineTo(headLen, 0);
      ctx.lineTo(headLen * 0.6, bt);
      ctx.closePath();
    };
    if (active) {
      const g = ctx.createLinearGradient(0, -bt, 0, bt);
      g.addColorStop(0, 'rgba(244,250,255,.95)');
      g.addColorStop(0.5, 'rgba(158,180,214,.8)');
      g.addColorStop(1, 'rgba(244,250,255,.95)');
      ctx.fillStyle = g;
      shape(); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.95)';
      ctx.lineWidth = 2;
      shape(); ctx.stroke();
    } else {
      const chg = f.hb.chg || 0;
      const pulse = chg ? (0.5 + 0.5 * Math.sin(t * (2 + 9 * chg) * 2 * Math.PI)) * chg : 0;
      if (pulse > 0.02) {
        ctx.fillStyle = `rgba(205, 228, 255, ${(0.30 * pulse).toFixed(3)})`;
        shape(); ctx.fill();
      }
      ctx.strokeStyle = `rgba(215, 236, 255, ${(0.6 + 0.4 * pulse).toFixed(3)})`;
      ctx.lineWidth = 1.5 + 2 * chg;
      ctx.setLineDash([6, 5]);
      ctx.lineDashOffset = -t * 60;
      shape(); ctx.stroke();
      ctx.setLineDash([]);
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
// Deterministic badlands: three parallax rows of flat-top buttes fading
// into the noon haze, saguaros and a windmill in the near row. Same seed
// every time, so all players squint at the same desert.
function buildMesas() {
  let s = 8451;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const baseY = 430;
  const layers = [
    { lag: 0.85, fill: '#cbb896', strata: null, props: false, buttes: [], cacti: [] },
    { lag: 0.68, fill: '#bd9a70', strata: 'rgba(122, 81, 56, .25)', props: false, buttes: [], cacti: [] },
    { lag: 0.5,  fill: '#a97e54', strata: 'rgba(90, 58, 38, .35)', props: true, propFill: '#6e4a30', buttes: [], cacti: [] },
  ];
  for (const [li, layer] of layers.entries()) {
    let x = -1600 + rnd() * 120;
    while (x < 1600) {
      const w = 280 + rnd() * 420;
      const h = 90 + rnd() * (150 + li * 60);
      layer.buttes.push({ x, w, h, skirt: 40 + rnd() * 70 });
      x += w + 140 + rnd() * 320;
    }
    if (layer.props) {
      for (let i = 0; i < 7; i++) {
        layer.cacti.push({ x: -1500 + rnd() * 3000, h: 40 + rnd() * 46, w: 5 + rnd() * 3 });
      }
    }
  }
  return { baseY, layers, mill: { x: -900 + Math.floor(8451 % 7) * 260, h: 130 } };
}

// Deterministic foundry works: two parallax layers of blast furnaces,
// chimney banks and cooling towers. Same seed every time, so all players
// share the same skyline.
function buildWorks() {
  let s = 88007;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const layers = [
    { i: 0, lag: 0.8,  fill: '#1c0f12' },
    { i: 1, lag: 0.62, fill: '#120a0d' },
  ];
  const bldgs = [];
  for (const layer of layers) {
    let x = -1500 + rnd() * 150;
    while (x < 1500) {
      const w = 130 + rnd() * 170;
      bldgs.push({
        layer: layer.i, x, w,
        h: 200 + rnd() * (200 + layer.i * 120),
        kind: (rnd() * 3) | 0,
        ph: rnd() * 7,
      });
      x += w + 60 + rnd() * 160;
    }
  }
  return { baseY: 330, layers, bldgs };
}

// Deterministic floating archipelago: three parallax layers of drifting
// islands (rock keels, turf caps, spires, waterfalls) over a three-bank
// rolling cloud sea. Same seed every time, so all players share the sky.
function buildSkyIsles() {
  let s = 77003;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const layers = [
    { lag: 0.82, rock: '#221d40', turf: '#2c2a58', flag: '#54517e', isles: [] },   // far haze
    { lag: 0.66, rock: '#2a2450', turf: '#37346e', flag: '#6f68a8', isles: [] },
    { lag: 0.5,  rock: '#332b60', turf: '#434083', flag: '#8f86c9', isles: [] },   // near
  ];
  for (const [li, layer] of layers.entries()) {
    let x = -1500 + rnd() * 200;
    while (x < 1500) {
      const w = 130 + rnd() * (150 + li * 90);
      layer.isles.push({
        x, w,
        y: -420 + rnd() * 520 - li * 40,
        h: 10 + rnd() * 8,
        d: w * (0.5 + rnd() * 0.45),
        bob: 4 + rnd() * (5 + li * 4),
        spd: 0.18 + rnd() * 0.22,
        ph: rnd() * 7,
        spire: rnd() < 0.4,
        sp: 40 + rnd() * 36,
        fall: rnd() < 0.45,
        fallLen: 90 + rnd() * 110,
      });
      x += w + 190 + rnd() * (260 + li * 120);
    }
  }
  const banks = [
    { lag: 0.75, fill: 'rgba(90, 82, 150, .35)',  puffs: [] },
    { lag: 0.58, fill: 'rgba(120, 108, 190, .3)', puffs: [] },
    { lag: 0.42, fill: 'rgba(165, 150, 225, .25)', puffs: [] },
  ];
  for (const [bi, bank] of banks.entries()) {
    let x = -1600 + rnd() * 120;
    while (x < 1600) {
      bank.puffs.push({
        x,
        dy: bi * 55 + rnd() * 70,
        w: 130 + rnd() * 190, h: 26 + rnd() * 26,
        drift: 14 + rnd() * 26,
        spd: 0.1 + rnd() * 0.16,
        ph: rnd() * 7,
      });
      x += 150 + rnd() * 200;
    }
  }
  return { seaY: 360, layers, banks };
}

// Deterministic giant flora: three parallax rows of towering stems —
// dandelion globes, bell blooms, fern crooks — plus vines swagged across
// the canopy. Same seed every time, so all players share the same garden.
function buildFlora() {
  let s = 60103;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const baseY = 450;
  const layers = [
    { lag: 0.8,  fill: '#1d1836', vines: null, plants: [] },   // far, violet dusk
    { lag: 0.62, fill: '#20303c', vines: null, plants: [] },
    { lag: 0.45, fill: '#14251a', vines: [], plants: [] },     // near, deep green
  ];
  for (const [li, layer] of layers.entries()) {
    let x = -1550 + rnd() * 100;
    while (x < 1550) {
      const h = 260 + rnd() * (240 + li * 160);
      layer.plants.push({
        x, h,
        kind: (rnd() * 3) | 0,
        head: 26 + rnd() * (20 + li * 14),
        stem: 5 + li * 3 + rnd() * 3,
        sway: 6 + rnd() * (8 + li * 6),
        spd: 0.25 + rnd() * 0.35,
        ph: rnd() * 7,
      });
      x += 120 + rnd() * (180 + li * 80);
    }
    if (layer.vines) {
      let vx = -1400 + rnd() * 200;
      while (vx < 1400) {
        const w = 380 + rnd() * 420;
        layer.vines.push({ x: vx, w, sag: 60 + rnd() * 70, ph: rnd() * 7 });
        vx += w * (0.7 + rnd() * 0.4);
      }
    }
  }
  return { baseY, layers };
}

function cross(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x - s, y - s); ctx.lineTo(x + s, y + s);
  ctx.moveTo(x + s, y - s); ctx.lineTo(x - s, y + s);
  ctx.stroke();
}
function blendTheme(a, b, k) {
  return {
    ...a,
    sky: a.sky.map((c, i) => mixHex(c, b.sky[i], k)),
    deck: mixHex(a.deck, b.deck, k), lip: mixHex(a.lip, b.lip, k), trim: mixHex(a.trim, b.trim, k),
    plat: mixHex(a.plat, b.plat, k), platTop: mixHex(a.platTop, b.platTop, k),
  };
}
function mixHex(a, b, k) {
  const n = v => parseInt(v.slice(1), 16), x = n(a), y = n(b);
  const c = s => Math.round(((x >> s & 255) + ((y >> s & 255) - (x >> s & 255)) * k)).toString(16).padStart(2, '0');
  return `#${c(16)}${c(8)}${c(0)}`;
}
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
