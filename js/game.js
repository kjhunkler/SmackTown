// Fight simulation. Host-authoritative: the host steps this at 60 Hz using
// everyone's latest inputs and broadcasts snapshots; clients interpolate.
// All tuning constants live here so host handoff resumes identical rules.

import { derivedStats } from './profile.js';

export const TICK = 1 / 60;
export const SNAP_RATE = 3;          // broadcast every 3rd tick (20 Hz)

// Stage in world units (1u ≈ 1px at zoom 1). Battlefield-style layout.
export const STAGE = {
  main: { x: -340, y: 0, w: 680, h: 46 },              // solid ground (top at y=0)
  plats: [                                             // drop-through platforms
    { x: -230, y: -130, w: 170 },
    { x: 60,   y: -130, w: 170 },
    { x: -85,  y: -250, w: 170 },
  ],
  blast: { l: -760, r: 760, t: -560, b: 420 },
  spawns: [ -240, 240, -80, 80 ],
  respawnY: -320,
};

const GRAV = 2600, MAX_FALL = 1150, FASTFALL = 1750;
const RUN = 380, AIR_ACCEL = 1450, GROUND_ACCEL = 3400, FRICTION = 2400;
const JUMP_V = 860, JUMP2_V = 780;
const F_W = 46, F_H = 64;            // fighter hurtbox
const STOCKS = 3;
const RESPAWN_INVULN = 2.0;
const HIT_PAUSE = 0.045;
const BUFFER = 0.15;                 // edge-input buffer window (s)

// attack archetypes: [damage, baseKb, kbScale, startup, active, recover, reach, angle]
const ATTACKS = {
  jab:    { dmg: 4,  kb: 130, ks: 9,  startup: .05, active: .09, rec: .12, rx: 52, ry: 26, ang: -10 },
  fsmash: { dmg: 13, kb: 240, ks: 22, startup: .16, active: .10, rec: .26, rx: 68, ry: 34, ang: -35 },
  usmash: { dmg: 11, kb: 230, ks: 21, startup: .14, active: .11, rec: .24, rx: 46, ry: 60, ang: -85, up: true },
  dsmash: { dmg: 10, kb: 210, ks: 19, startup: .13, active: .10, rec: .24, rx: 76, ry: 26, ang: -160, both: true },
  dair:   { dmg: 11, kb: 220, ks: 20, startup: .13, active: .12, rec: .22, rx: 40, ry: 56, ang: 80, down: true, spike: true },
};

const ABILITY_DEFS = {
  fireball:  { cd: 3.0 },
  dashstrike:{ cd: 4.0 },
  shockwave: { cd: 6.0 },
  uppercut:  { cd: 5.0 },
  counter:   { cd: 5.0 },
  blink:     { cd: 4.0 },
};

let nextEid = 1;

export class Game {
  // players: [{id, name, color, build, isBot}]
  constructor(players, seed = 1) {
    this.tick = 0;
    this.over = false;
    this.winner = null;
    this.events = [];               // transient: hits/kos/sfx for renderer
    this.projectiles = [];
    this.hitPause = 0;
    this.rng = mulberry32(seed);
    this.fighters = players.map((p, i) => this._spawnFighter(p, i));
    this.inputs = new Map();        // id -> latest input
    for (const f of this.fighters) this.inputs.set(f.id, blankInput());
  }

  _spawnFighter(p, i) {
    const st = derivedStats(p.build);
    return {
      id: p.id, name: p.name, color: p.color, isBot: !!p.isBot, st,
      x: STAGE.spawns[i % STAGE.spawns.length], y: -F_H / 2,
      vx: 0, vy: 0, facing: i % 2 === 0 ? 1 : -1,
      grounded: true, jumps: st.maxJumps, fastfall: false,
      pct: 0, stocks: STOCKS,
      state: 'idle',                // idle|run|air|attack|hitstun|dead|respawn
      stateT: 0,
      atk: null,                    // active attack name
      atkHit: new Set(),
      invuln: 0, counterT: 0, dashT: 0,
      cds: [0, 0],                  // ability cooldowns (seconds remaining)
      usedSecondWind: false,
      dropT: 0,                     // drop-through timer
      dead: false,
      lastDir: { x: 1, y: 0 },
    };
  }

  setInput(id, inp) {
    const cur = this.inputs.get(id);
    if (!cur) return;
    // Movement is level-triggered; actions are edge-triggered and buffered
    // for a short window (like classic fighting games) so a press during
    // hitstun or an attack still comes out the moment the fighter can act.
    cur.mx = clamp(inp.mx, -1, 1);
    cur.my = clamp(inp.my, -1, 1);
    if (inp.jump) { cur.jump = true; cur.bufJ = BUFFER; }
    cur.ff ||= !!inp.ff;
    cur.drop ||= !!inp.drop;
    if (inp.atk) { cur.atk = inp.atk; cur.bufA = BUFFER; } // {kind:'tap'|'up'|'down'|'side', dir}
    if (inp.ab0) { cur.ab0 = true; cur.buf0 = BUFFER; }
    if (inp.ab1) { cur.ab1 = true; cur.buf1 = BUFFER; }
  }

  step() {
    if (this.over) return;
    this.tick++;
    this.events.length = 0;
    if (this.hitPause > 0) { this.hitPause -= TICK; return; }

    for (const f of this.fighters) {
      if (f.dead) continue;
      if (f.isBot) this._botThink(f);
      this._stepFighter(f, this.inputs.get(f.id));
    }
    this._stepProjectiles();
    this._resolveAttacks();
    this._checkBlast();

    const alive = this.fighters.filter(f => !f.dead);
    if (alive.length <= (this.fighters.length > 1 ? 1 : 0)) {
      this.over = true;
      this.winner = alive[0] || null;
      this.events.push({ e: 'gameover' });
    }
  }

  // ---------- fighter physics & actions ----------

  _stepFighter(f, inp) {
    f.stateT += TICK;
    f.invuln = Math.max(0, f.invuln - TICK);
    f.counterT = Math.max(0, f.counterT - TICK);
    f.dashT = Math.max(0, f.dashT - TICK);
    f.dropT = Math.max(0, f.dropT - TICK);
    f.cds[0] = Math.max(0, f.cds[0] - TICK);
    f.cds[1] = Math.max(0, f.cds[1] - TICK);

    if (f.state === 'respawn') {
      if (f.stateT > 0.8) { f.state = 'air'; }
      else { f.y = STAGE.respawnY; f.vx = 0; f.vy = 0; this._decayInput(inp); return; }
    }

    const inHitstun = f.state === 'hitstun';
    const inAttack = f.state === 'attack';
    const canAct = !inHitstun && !inAttack;

    if (Math.abs(inp.mx) > 0.15) f.lastDir = { x: Math.sign(inp.mx), y: inp.my };

    // --- horizontal movement ---
    if (!inHitstun && f.dashT <= 0) {
      const want = inp.mx * RUN * f.st.speedMult;
      if (f.grounded) {
        if (Math.abs(inp.mx) > 0.15 && canAct) {
          f.vx = approach(f.vx, want, GROUND_ACCEL * TICK);
          f.facing = Math.sign(inp.mx) || f.facing;
          f.state = 'run';
        } else {
          f.vx = approach(f.vx, 0, FRICTION * TICK);
          if (canAct) f.state = 'idle';
        }
      } else {
        if (Math.abs(inp.mx) > 0.15) {
          f.vx = approach(f.vx, want, AIR_ACCEL * f.st.airMult * TICK);
          if (canAct) f.facing = Math.sign(inp.mx) || f.facing;
        }
      }
    }

    // --- jumping / fast fall / drop-through ---
    if (canAct && inp.jump && f.jumps > 0) {
      f.vy = -(f.grounded || f.jumps === f.st.maxJumps ? JUMP_V : JUMP2_V) * f.st.jumpMult;
      f.jumps--;
      f.grounded = false;
      f.fastfall = false;
      f.state = 'air';
      inp.jump = false;
      this.events.push({ e: 'jump', x: f.x, y: f.y + F_H / 2 });
    }
    if (inp.ff && !f.grounded && f.vy > -200) f.fastfall = true;
    if (inp.drop && f.grounded) f.dropT = 0.25;    // fall through platforms
    inp.ff = inp.drop = false;

    // --- attacks & abilities ---
    if (canAct && inp.atk) { this._startAttack(f, inp.atk); inp.atk = null; }
    if (canAct && inp.ab0) { this._useAbility(f, 0); inp.ab0 = false; }
    if (canAct && inp.ab1) { this._useAbility(f, 1); inp.ab1 = false; }

    // attack state machine
    if (inAttack) {
      const a = ATTACKS[f.atk];
      const total = a.startup + a.active + a.rec;
      if (f.stateT >= total) { f.state = f.grounded ? 'idle' : 'air'; f.atk = null; f.atkHit.clear(); }
    }
    if (inHitstun && f.stateT >= f.hitstunFor) { f.state = 'air'; }

    // --- gravity & integration ---
    if (!f.grounded) {
      const cap = f.fastfall ? FASTFALL : MAX_FALL;
      f.vy = Math.min(cap, f.vy + GRAV * TICK);
    }
    f.x += f.vx * TICK;
    f.y += f.vy * TICK;

    this._collide(f);
    this._decayInput(inp);
  }

  _decayInput(inp) {
    inp.ff = inp.drop = false;
    if ((inp.bufJ -= TICK) <= 0) inp.jump = false;
    if ((inp.bufA -= TICK) <= 0) inp.atk = null;
    if ((inp.buf0 -= TICK) <= 0) inp.ab0 = false;
    if ((inp.buf1 -= TICK) <= 0) inp.ab1 = false;
  }

  _collide(f) {
    const wasGrounded = f.grounded;
    f.grounded = false;
    const feet = f.y + F_H / 2;

    // solid main stage: land on top, push out of sides
    const m = STAGE.main;
    if (f.vy >= 0 && feet >= m.y && feet <= m.y + 42 && f.x > m.x - F_W / 2 && f.x < m.x + m.w + F_W / 2) {
      f.y = m.y - F_H / 2; f.vy = 0; f.grounded = true;
    } else if (f.y + F_H / 2 > m.y + 6 && f.y - F_H / 2 < m.y + m.h) {
      if (f.x > m.x - F_W / 2 && f.x < m.x + F_W / 4) { f.x = m.x - F_W / 2; if (f.vx > 0) f.vx = 0; }
      else if (f.x < m.x + m.w + F_W / 2 && f.x > m.x + m.w - F_W / 4) { f.x = m.x + m.w + F_W / 2; if (f.vx < 0) f.vx = 0; }
    }

    // drop-through platforms (only when falling, not dropping through)
    if (f.dropT <= 0 && f.vy >= 0) {
      for (const p of STAGE.plats) {
        if (feet >= p.y && feet <= p.y + 22 && f.x > p.x && f.x < p.x + p.w) {
          f.y = p.y - F_H / 2; f.vy = 0; f.grounded = true;
          break;
        }
      }
    }

    if (f.grounded && !wasGrounded) {
      f.jumps = f.st.maxJumps;
      f.fastfall = false;
      if (f.state === 'air' || f.state === 'hitstun') f.state = 'idle';
      this.events.push({ e: 'land', x: f.x, y: f.y + F_H / 2 });
    }
  }

  _startAttack(f, atk) {
    let name;
    if (atk.kind === 'tap') name = 'jab';
    else if (atk.kind === 'up') name = 'usmash';
    else if (atk.kind === 'down') name = f.grounded ? 'dsmash' : 'dair';
    else { name = 'fsmash'; if (atk.dir) f.facing = atk.dir; }
    f.state = 'attack';
    f.stateT = 0;
    f.atk = name;
    f.atkHit.clear();
    if (f.grounded) f.vx *= 0.35;
    this.events.push({ e: 'swing', id: f.id, atk: name, x: f.x, y: f.y });
  }

  _useAbility(f, slot) {
    const id = f.st.abilities[slot];
    if (!id || f.cds[slot] > 0) return;
    const def = ABILITY_DEFS[id];
    f.cds[slot] = def.cd;
    const dir = f.lastDir;
    switch (id) {
      case 'fireball':
        this.projectiles.push({
          eid: nextEid++, kind: 'fireball', owner: f.id,
          x: f.x + f.facing * 40, y: f.y - 8,
          vx: f.facing * 620, vy: 0, ttl: 1.4,
          dmg: 6, kb: 170, ks: 13, r: 14,
        });
        break;
      case 'dashstrike':
        f.dashT = 0.22;
        f.vx = f.facing * 950;
        f.vy = 0;
        f.melee = { name: 'dash', dmg: 8, kb: 200, ks: 16, rx: 50, ry: 30, ang: -20, until: this.tick + 14, hit: new Set() };
        break;
      case 'shockwave':
        if (!f.grounded) { f.vy = FASTFALL; f.fastfall = true; f.pendingShock = true; }
        else this._shockwave(f);
        break;
      case 'uppercut':
        f.vy = -900;
        f.grounded = false;
        f.melee = { name: 'upper', dmg: 9, kb: 260, ks: 20, rx: 44, ry: 60, ang: -88, until: this.tick + 16, hit: new Set() };
        break;
      case 'counter':
        f.counterT = 0.45;
        break;
      case 'blink': {
        const len = Math.hypot(dir.x, dir.y) > 0.3 ? 1 : 0;
        const dx = len ? dir.x : f.facing, dy = len ? dir.y : 0;
        const n = Math.hypot(dx, dy) || 1;
        f.x += (dx / n) * 150;
        f.y += (dy / n) * 150;
        f.y = Math.min(f.y, STAGE.main.y - F_H / 2); // never blink into the floor
        f.invuln = Math.max(f.invuln, 0.35);
        f.vy = Math.min(f.vy, 0);
        break;
      }
    }
    this.events.push({ e: 'ability', id: f.id, ability: id, x: f.x, y: f.y });
  }

  _shockwave(f) {
    f.pendingShock = false;
    this.events.push({ e: 'shockwave', x: f.x, y: f.y + F_H / 2 });
    for (const o of this.fighters) {
      if (o.id === f.id || o.dead || o.invuln > 0) continue;
      const d = Math.hypot(o.x - f.x, o.y - f.y);
      if (d < 190) {
        this._applyHit(f, o, { dmg: 10, kb: 280, ks: 18 },
          Math.atan2(o.y - f.y, o.x - f.x) * 0.3 - Math.PI / 2.4, Math.sign(o.x - f.x) || 1);
      }
    }
  }

  // ---------- combat resolution ----------

  _resolveAttacks() {
    for (const f of this.fighters) {
      if (f.dead) continue;

      // landed shockwave slam
      if (f.pendingShock && f.grounded) this._shockwave(f);

      // normal attacks during active window
      if (f.state === 'attack' && f.atk) {
        const a = ATTACKS[f.atk];
        if (f.stateT >= a.startup && f.stateT <= a.startup + a.active) {
          this._meleeHit(f, a, f.atkHit, a.ang);
        }
      }

      // ability melee windows (dash strike / uppercut)
      if (f.melee) {
        if (this.tick > f.melee.until) f.melee = null;
        else this._meleeHit(f, f.melee, f.melee.hit, f.melee.ang);
      }
    }

    // projectiles vs fighters
    for (const pr of this.projectiles) {
      for (const o of this.fighters) {
        if (o.dead || o.id === pr.owner || o.invuln > 0) continue;
        if (Math.abs(o.x - pr.x) < F_W / 2 + pr.r && Math.abs(o.y - pr.y) < F_H / 2 + pr.r) {
          const att = this.fighters.find(x => x.id === pr.owner);
          if (o.counterT > 0) { pr.vx *= -1; pr.owner = o.id; this.events.push({ e: 'counter', x: o.x, y: o.y }); continue; }
          if (att) this._applyHit(att, o, pr, deg(-40), Math.sign(pr.vx) || 1);
          pr.ttl = 0;
        }
      }
    }
  }

  _meleeHit(f, spec, hitSet, angDeg) {
    for (const o of this.fighters) {
      if (o.id === f.id || o.dead || o.invuln > 0 || hitSet.has(o.id)) continue;
      const cx = spec.both || spec.up || spec.down ? f.x : f.x + f.facing * (F_W / 2 + spec.rx / 2);
      const cy = spec.up ? f.y - F_H / 2 - spec.ry / 2 : spec.down ? f.y + F_H / 2 + spec.ry / 2 : f.y;
      const rx = spec.both ? spec.rx : spec.rx / 2 + 14;
      if (Math.abs(o.x - cx) < rx + F_W / 2 && Math.abs(o.y - cy) < spec.ry + F_H / 2) {
        hitSet.add(o.id);
        if (o.counterT > 0) {
          // countered: attacker eats a reversal hit
          this.events.push({ e: 'counter', x: o.x, y: o.y });
          this._applyHit(o, f, { dmg: spec.dmg * 1.2, kb: 240, ks: 16 }, deg(-45), Math.sign(f.x - o.x) || 1);
          continue;
        }
        const dirX = spec.both ? (Math.sign(o.x - f.x) || 1) : f.facing;
        this._applyHit(f, o, spec, deg(angDeg), dirX, spec.spike);
      }
    }
  }

  _applyHit(att, vic, spec, angRad, dirX, spike = false) {
    let dmg = spec.dmg * att.st.dmgMult;
    if (att.st.augments.includes('berserker') && att.pct >= 80) dmg *= 1.25;
    vic.pct = Math.min(999, vic.pct + dmg);

    // vampiric heal & second wind
    if (att.st.augments.includes('vampiric')) att.pct = Math.max(0, att.pct - dmg * 0.15);
    if (vic.st.augments.includes('secondwind') && !vic.usedSecondWind && vic.pct >= 100) {
      vic.usedSecondWind = true;
      vic.pct = Math.max(0, vic.pct - 30);
      this.events.push({ e: 'secondwind', x: vic.x, y: vic.y });
    }
    // thorns recoil (melee only — projectiles have no body contact)
    if (vic.st.augments.includes('thorns') && !spec.r) {
      att.pct = Math.min(999, att.pct + 3);
    }

    // smash-style knockback: grows with victim percent
    const kb = (spec.kb + spec.ks * dmg * (1 + vic.pct / 90))
      * att.st.kbMult * vic.st.kbTaken;
    const ang = spike ? Math.PI / 2 : angRad;   // spikes send straight down
    vic.vx = Math.cos(ang) * kb * dirX * (spike ? 0.15 : 1);
    vic.vy = Math.sin(ang) * kb;
    vic.grounded = false;
    vic.fastfall = false;
    vic.state = 'hitstun';
    vic.stateT = 0;
    vic.hitstunFor = Math.min(1.1, 0.08 + kb / 2600);
    vic.atk = null;
    vic.melee = null;

    this.hitPause = Math.min(0.12, HIT_PAUSE + dmg * 0.004);
    this.events.push({
      e: 'hit', x: vic.x, y: vic.y, dmg: Math.round(dmg),
      heavy: kb > 700, vic: vic.id, att: att.id,
    });
  }

  _stepProjectiles() {
    for (const pr of this.projectiles) {
      pr.x += pr.vx * TICK;
      pr.y += pr.vy * TICK;
      pr.ttl -= TICK;
      const m = STAGE.main;
      if (pr.y > m.y && pr.x > m.x && pr.x < m.x + m.w) pr.ttl = 0;
    }
    this.projectiles = this.projectiles.filter(p => p.ttl > 0);
  }

  _checkBlast() {
    const b = STAGE.blast;
    for (const f of this.fighters) {
      if (f.dead || f.state === 'respawn') continue;
      if (f.x < b.l || f.x > b.r || f.y < b.t || f.y > b.b) {
        f.stocks--;
        this.events.push({ e: 'ko', x: clamp(f.x, b.l, b.r), y: clamp(f.y, b.t, b.b), id: f.id, stocks: f.stocks });
        if (f.stocks <= 0) {
          f.dead = true;
          f.state = 'dead';
        } else {
          f.x = STAGE.spawns[this.fighters.indexOf(f) % STAGE.spawns.length];
          f.y = STAGE.respawnY;
          f.vx = 0; f.vy = 0;
          f.pct = 0;
          f.usedSecondWind = false;
          f.state = 'respawn';
          f.stateT = 0;
          f.invuln = RESPAWN_INVULN;
          f.jumps = f.st.maxJumps;
          f.melee = null;
        }
      }
    }
  }

  // ---------- practice bot ----------

  _botThink(f) {
    const inp = this.inputs.get(f.id);
    const target = this.fighters.find(o => o.id !== f.id && !o.dead);
    if (!target) return;
    const dx = target.x - f.x, dy = target.y - f.y;
    const offstage = f.x < STAGE.main.x || f.x > STAGE.main.x + STAGE.main.w;

    inp.mx = 0; inp.my = 0;
    if (offstage) {
      // recover toward stage center
      inp.mx = f.x < 0 ? 1 : -1;
      if (f.vy > 100 && f.jumps > 0 && this.rng() < 0.25) inp.jump = true;
    } else {
      if (Math.abs(dx) > 60) inp.mx = Math.sign(dx) * (0.6 + 0.4 * this.rng());
      if (dy < -90 && f.grounded && this.rng() < 0.06) inp.jump = true;
      if (Math.abs(dx) < 85 && Math.abs(dy) < 70 && this.rng() < 0.10) {
        inp.atk = this.rng() < 0.55 ? { kind: 'tap' }
          : this.rng() < 0.5 ? { kind: 'side', dir: Math.sign(dx) || 1 }
          : { kind: dy < -30 ? 'up' : 'down' };
      }
      if (f.pct > 70 && this.rng() < 0.02) inp.ab0 = true;
    }
  }

  // ---------- snapshots (host <-> clients) ----------

  snapshot() {
    return {
      tk: this.tick,
      over: this.over,
      win: this.winner ? this.winner.id : null,
      f: this.fighters.map(f => [
        f.id, r1(f.x), r1(f.y), r1(f.vx), r1(f.vy), f.facing,
        r1(f.pct), f.stocks, f.state, f.dead ? 1 : 0,
        f.invuln > 0 ? 1 : 0, f.atk || '', r1(f.cds[0]), r1(f.cds[1]),
      ]),
      p: this.projectiles.map(p => [p.eid, p.kind, r1(p.x), r1(p.y), r1(p.vx)]),
      ev: this.events.slice(),
    };
  }
}

// Rebuild a live sim from the last snapshot a peer saw — used when the host
// drops mid-fight and the elected successor takes over the simulation.
export function gameFromSnapshot(players, snap, seed = 2) {
  const g = new Game(players, seed);
  if (!snap) return g;
  g.tick = snap.tk || 0;
  for (const row of snap.f || []) {
    const f = g.fighters.find(x => x.id === row[0]);
    if (!f) continue;
    [, f.x, f.y, f.vx, f.vy, f.facing] = row;
    f.pct = row[6]; f.stocks = row[7];
    f.dead = !!row[9];
    // Mid-swing/hitstun details (timers, hit sets) aren't in snapshots;
    // resuming in a neutral state costs at most a dropped attack frame.
    f.state = f.dead ? 'dead' : 'air';
    f.grounded = false;
    f.cds = [row[12] || 0, row[13] || 0];
  }
  return g;
}

export function blankInput() {
  return {
    mx: 0, my: 0, jump: false, ff: false, drop: false, atk: null,
    ab0: false, ab1: false, bufJ: 0, bufA: 0, buf0: 0, buf1: 0,
  };
}

// ---------- helpers ----------
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function approach(v, target, amt) {
  return v < target ? Math.min(target, v + amt) : Math.max(target, v - amt);
}
function deg(d) { return d * Math.PI / 180; }
function r1(v) { return Math.round(v * 10) / 10; }
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
