// Fight simulation. Host-authoritative: the host steps this at 60 Hz using
// everyone's latest inputs and broadcasts snapshots; clients interpolate.
// All tuning constants live here so host handoff resumes identical rules.

import { derivedStats } from './profile.js';

export const TICK = 1 / 60;
export const SNAP_RATE = 3;          // broadcast every 3rd tick (20 Hz)

// Maps in world units (1u ≈ 1px at zoom 1). Every map is one solid main
// floor plus optional drop-through platforms, so all mechanics (ledges,
// drop-through, blast KOs) work everywhere. Visual themes live in render.js.
export const MAPS = {
  battlefield: {
    name: 'Sky Bastion',
    main: { x: -340, y: 0, w: 680, h: 46 },              // solid ground (top at y=0)
    plats: [                                             // the classic triplat — static, sacred
      { x: -230, y: -130, w: 170 },
      { x: 60,   y: -130, w: 170 },
      { x: -85,  y: -250, w: 170 },
    ],
    blast: { l: -1150, r: 1150, t: -950, b: 500 },
    spawns: [ -240, 240, -80, 80 ],
    respawnY: -320,
  },
  flatlands: {
    name: 'Dust Divide',
    main: { x: -520, y: 0, w: 1040, h: 46 },             // wide open ground, no plats
    plats: [],
    blast: { l: -1300, r: 1300, t: -950, b: 500 },
    spawns: [ -380, 380, -130, 130 ],
    respawnY: -320,
  },
  skyline: {
    name: 'Neon Heights',
    main: { x: -250, y: 0, w: 500, h: 46 },              // mega-tower helipad, aerial towers
    plats: [
      { x: -350, y: -160, w: 150 },                      // west rooftop terrace
      { x: 200,  y: -160, w: 150 },                      // east rooftop terrace
      { x: -80,  y: -300, w: 160 },                      // billboard catwalk
      // sky-tram: a hover-shuttle gliding the high lane between the towers
      { x: -80,  y: -450, w: 160, move: { dx: 190, period: 11 } },
      // window-washer gondola: rides its drone cables off the west lip
      { x: -460, y: -210, w: 110, move: { dy: 150, period: 9 } },
    ],
    blast: { l: -1100, r: 1100, t: -1050, b: 500 },
    spawns: [ -180, 180, -60, 60 ],
    respawnY: -380,
  },
  ruins: {
    name: 'Ruined City',
    main: { x: -390, y: 0, w: 780, h: 46 },              // collapsed freeway deck
    plats: [
      { x: -330, y: -130, w: 150 },                      // gutted rooftop (left)
      { x: 180,  y: -130, w: 150 },                      // gutted rooftop (right)
      // crane girder: swept back and forth high over the deck
      { x: -85,  y: -270, w: 170, move: { dx: 250, period: 10 } },
      // wreck-lifts: hovering rubble chunks bobbing off each lip, counter-phased
      { x: -585, y: -95, w: 110, move: { dy: 105, period: 7 } },
      { x: 475,  y: -95, w: 110, move: { dy: 105, period: 7, phase: 3.5 } },
    ],
    blast: { l: -1200, r: 1200, t: -950, b: 500 },
    spawns: [ -280, 280, -100, 100 ],
    respawnY: -330,
  },
  foundry: {
    name: 'The Crucible',
    main: { x: -300, y: 0, w: 600, h: 46 },              // compact arena with side perches
    plats: [
      { x: -420, y: -150, w: 140 },
      { x: 280,  y: -150, w: 140 },
    ],
    // molten geysers: deck vents that telegraph, then erupt in a column of
    // melt. Timing is a pure function of the tick (like moving platforms)
    // so host, prediction and every client agree on every eruption.
    hazards: [
      { x: -186, w: 72, h: 250, period: 11, phase: 0,   warn: 1.5, act: 1.0 },
      { x: 114,  w: 72, h: 250, period: 11, phase: 5.5, warn: 1.5, act: 1.0 },
    ],
    blast: { l: -1120, r: 1120, t: -980, b: 500 },
    spawns: [ -210, 210, -60, 60 ],
    respawnY: -360,
  },
  garden: {
    name: 'Overgrown Eden',
    main: { x: -460, y: 0, w: 920, h: 46 },              // mossy root-shelf, one log bridge
    plats: [
      { x: -90,  y: -205, w: 180 },                      // fallen log bridge
      // giant flower heads swaying off each lip — slow, gentle bob
      { x: -640, y: -120, w: 120, move: { dy: 70, period: 12 } },
      { x: 520,  y: -120, w: 120, move: { dy: 70, period: 12, phase: 6 } },
    ],
    blast: { l: -1260, r: 1260, t: -940, b: 500 },
    spawns: [ -330, 330, -120, 120 ],
    respawnY: -320,
  },
  training: {
    name: 'Training Room',
    hidden: true,                     // never in the vote grid or random rotation
    main: { x: -430, y: 0, w: 860, h: 46 },              // one wide mat, one practice perch
    plats: [
      { x: -85, y: -150, w: 170 },
    ],
    blast: { l: -1150, r: 1150, t: -950, b: 500 },
    spawns: [ -140, 140, -300, 300 ],
    respawnY: -320,
  },
  // Expedition (PvE co-op): an endless procedurally-generated side-scroller.
  // The ground is one continuous floor stretching effectively forever; the
  // floating platforms are a deterministic function of the run's seed and
  // world x (see expansePlats), so the host and every client build the exact
  // same world without syncing geometry. 'infinite' switches the sim into
  // co-op rules: no horizontal blast KOs, the match never ends, and (later
  // phases) HP + credits replace stocks & percent.
  expanse: {
    name: 'The Long Road',
    hidden: true,
    infinite: true,
    coop: true,
    main: { x: -1e6, y: 0, w: 2e6, h: 46 },              // continuous ground
    plats: [],                                           // generated per view
    blast: { l: -1e9, r: 1e9, t: -1500, b: 1200 },       // only a soft top ceiling matters
    spawns: [ -120, 120, -40, 40, 0, 200, -200, 80 ],
    respawnY: -360,
  },
};
export const DEFAULT_MAP = 'battlefield';
// Rotation/votes skip hidden maps (training is reachable only by mode)
export const MAP_IDS = Object.keys(MAPS).filter(id => !MAPS[id].hidden);

// Moving platforms: move = {dx?, dy?, period, phase?} oscillates the platform
// around its base spot on a sine wave. Position is a pure function of the sim
// tick, so the host, prediction, and every client compute identical paths.
function platPos(p, tickF) {
  if (!p.move) return p;
  const k = Math.sin((tickF * TICK + (p.move.phase || 0)) * Math.PI * 2 / p.move.period);
  return { x: p.x + (p.move.dx || 0) * k, y: p.y + (p.move.dy || 0) * k };
}
export function platsAt(mapId, tickF) {
  const map = MAPS[mapId] || MAPS[DEFAULT_MAP];
  return map.plats.map(p => p.move ? { ...p, ...platPos(p, tickF) } : p);
}

// Expedition world generation. The endless map is carved into fixed-width
// chunks; each chunk deterministically seeds its own RNG (run seed XOR chunk
// index) and lays 0–2 floating platforms. A pure function of (seed, x) means
// the host, prediction and every client generate an identical world with no
// geometry ever crossing the wire — collision windows it to the fighters,
// the renderer windows it to the camera. Chunk 0 (spawn) is always left open.
const EXPANSE_CHUNK = 540;
export function expansePlats(seed, minX, maxX) {
  const c0 = Math.floor(minX / EXPANSE_CHUNK) - 1;
  const c1 = Math.floor(maxX / EXPANSE_CHUNK) + 1;
  const out = [];
  for (let c = c0; c <= c1; c++) {
    if (c === 0) continue;                       // keep the spawn clearing open
    const rng = mulberry32(((seed >>> 0) ^ (Math.imul(c, 2654435761) >>> 0)) >>> 0);
    const roll = rng();
    const count = roll < 0.22 ? 0 : roll < 0.72 ? 1 : 2;
    for (let i = 0; i < count; i++) {
      const w = 120 + Math.floor(rng() * 3) * 45;                 // 120 | 165 | 210
      const x = c * EXPANSE_CHUNK + 40 + rng() * (EXPANSE_CHUNK - 80 - w);
      const y = -130 - Math.floor(rng() * 3) * 115;              // -130 | -245 | -360
      out.push({ x, y, w });
    }
  }
  return out;
}

// Molten hazards: each vent cycles warn → erupt → idle on a fixed period.
// State is a pure function of the sim tick so every peer computes identical
// eruptions; k runs 0→1 within the current phase for animation.
export function hazardsAt(mapId, tickF) {
  const map = MAPS[mapId] || MAPS[DEFAULT_MAP];
  if (!map.hazards) return [];
  return map.hazards.map(hz => {
    const tm = (tickF * TICK + (hz.phase || 0)) % hz.period;
    const state = tm < hz.warn ? 'warn' : tm < hz.warn + hz.act ? 'erupt' : 'idle';
    const k = state === 'warn' ? tm / hz.warn
      : state === 'erupt' ? (tm - hz.warn) / hz.act
      : (tm - hz.warn - hz.act) / (hz.period - hz.warn - hz.act);
    return { x: hz.x, w: hz.w, h: hz.h, y: map.main.y, state, k };
  });
}

const GRAV = 2600, MAX_FALL = 1150, FASTFALL = 1750;
const RUN = 380, AIR_ACCEL = 1450, GROUND_ACCEL = 3400, FRICTION = 2400;
const JUMP_V = 860, JUMP2_V = 780;
const JUMP_FF_LOCK = 0.1;            // brief window after a jump before fast fall can trigger
const SPIKE_BOUNCE = 640;            // attacker's upward spring off a landed spike
const AIR_RISE_CD = 1.1;             // min seconds between aerial up-smash lifts
const LEDGE_JUMP_V = 1120;           // ledge super jump — spends no air jump
const LEDGE_INVULN = 0.6, LEDGE_MAX_HANG = 4.0, REGRAB_CD = 0.45;
const LEDGE_HANG_Y = 22;             // fighter center hangs this far below the lip
// Grab grace box around each lip (px from the lip, in stage coords):
// how far inside/outside the stage and above/below the lip a falling
// fighter can be and still snag the ledge.
const LEDGE_GRACE_IN = 14, LEDGE_GRACE_OUT = 60;
const LEDGE_GRACE_UP = 40, LEDGE_GRACE_DOWN = 92;
const ROLL_TIME = 0.38, ROLL_DIST = 150; // ledge getup roll onto the stage
const F_W = 46, F_H = 64;            // fighter hurtbox
const STOCKS = 4;
const COOP_DOWN_TIME = 3.0;          // seconds a co-op fighter lies downed before reviving
const RESPAWN_INVULN = 2.0;

// Co-op enemies: a deliberately simple foe — a ground-bound creep that walks
// at the nearest fighter and bumps them for contact damage. Placeholder combat
// until real enemy design lands; everything here is host-authoritative and
// streamed to clients like projectiles.
const ENEMY_W = 44, ENEMY_H = 52;    // hurtbox (half-extents are W/2, H/2)
const ENEMY_HP = 30;
const ENEMY_SPEED = 155;
const ENEMY_ACCEL = 900;
const ENEMY_SPAWN_EVERY = 3.2;       // seconds between spawns
const ENEMY_MAX = 8;                 // living creeps at once
const ENEMY_TOUCH_DMG = 8;
const ENEMY_TOUCH_CD = 0.8;          // per-creep cooldown between bumps
const ENEMY_KB = 0.6;                // creeps take trimmed knockback (no percent)
const ENEMY_DESPAWN = 2700;          // cull creeps this far from the group
const HIT_PAUSE = 0.045;
const BUFFER = 0.15;                 // edge-input buffer window (s)

// Ducking: hold down while grounded to squat behind a guard. Straight
// projectiles sail clean over a ducked head; melee that connects deals
// chip damage and a shove instead of a launch, but the guard meter
// drains while held and eats the full raw damage of every blocked hit.
// At zero the guard crushes: a crumple stun that takes bonus knockback.
// Down-aimed attacks (dair/dsmash/spikes/aimed-down) pierce the duck.
const DUCK_H = 24;                   // ducked hurtbox height (stands 64)
const DUCK_DMG_TAKEN = 0.5;          // chip damage multiplier while ducking
const DUCK_KB_TAKEN = 0.3;           // knockback multiplier while ducking
const DUCK_STANDUP = 0.07;           // delay before attacking after release
const GUARD_MAX = 100;
const GUARD_DRAIN = 12;              // per second while holding duck
const GUARD_REGEN = 20;              // per second while not ducking
const GUARD_REDUCK = 25;             // min guard needed to start a duck
const CRUSH_STUN = 1.0;              // crumple duration at guard zero
const CRUSH_KB_TAKEN = 1.3;         // knockback penalty while crushed

// attack archetypes: [damage, baseKb, kbScale, startup, active, recover, reach, angle]
const ATTACKS = {
  jab:    { dmg: 4,  kb: 130, ks: 9,  startup: .05, active: .09, rec: .12, rx: 52, ry: 26, ang: -10 },
  // dash attack: a tap thrown at run speed. Slides with your momentum and
  // launches up-forward for juggles, but carries the longest recovery of
  // any normal — whiff it and you slide past your target wide open.
  dash:   { dmg: 8,  kb: 200, ks: 15, startup: .07, active: .12, rec: .30, rx: 56, ry: 30, ang: -50 },
  fsmash: { dmg: 13, kb: 240, ks: 22, startup: .16, active: .10, rec: .26, rx: 68, ry: 34, ang: -35 },
  usmash: { dmg: 11, kb: 230, ks: 21, startup: .14, active: .11, rec: .24, rx: 46, ry: 60, ang: -85, up: true },
  dsmash: { dmg: 10, kb: 210, ks: 19, startup: .13, active: .10, rec: .24, rx: 76, ry: 26, ang: -160, both: true },
  dair:   { dmg: 11, kb: 220, ks: 20, startup: .13, active: .12, rec: .22, rx: 40, ry: 56, ang: 80, down: true, spike: true },
  // neutral-air spin: a whirl centered on the fighter that hits a tight
  // circle around the body several times. 'rehit' re-arms the hit set every
  // interval; the last window swaps in 'fin' for a launching finisher.
  nspin:  { dmg: 2.5, kb: 120, ks: 5, startup: .06, active: .42, rec: .16, rx: 46, ry: 42, ang: -80, both: true,
            rehit: .14, fin: { kb: 210, ks: 16, ang: -40 } },
  // sword strong attack: one blade arc, aimed 8-way by the swipe, released
  // with a lunge along that aim. The hit is a true blade: a long, thin box
  // run out along the aim (rx = blade length, ry = half-thickness) — reach
  // no fist can match, but a narrow band that punishes sloppy lines. Trades
  // raw damage for real launch power; the wind-up hangs in the air.
  slash:  { dmg: 12.6, kb: 120, ks: 10.5, startup: .09, active: .11, rec: .24, rx: 96, ry: 14, ang: -25, blade: true },
  // magic strong attack: the cast pose. 'cast' = no melee box ever goes
  // active — the hit is the burst projectile spawned at release.
  mcast:  { dmg: 0,  kb: 0,   ks: 0,  startup: .08, active: .02, rec: .26, rx: 30, ry: 24, ang: 0, cast: true },
  // spear strong attack: a stationary thrust, aimed 8-way. The hit is a
  // narrow spearhead run out along the aim, same as a blade — but 'gap'
  // carves a dead zone out of the near end, so the point only connects at
  // real distance (rx = tip reach, gap = blind spot, both from the body's
  // edge; ry = half-thickness of the head). Whiffs up close, rewards
  // spacing with the biggest hit in the game.
  thrust: { dmg: 17, kb: 170, ks: 16, startup: .11, active: .08, rec: .22, rx: 150, gap: 50, ry: 8, ang: -20, spear: true },
};

// Weapons: what the strong-attack control does. Bare fists keep the classic
// smash kit; the sword slashes with a lunge and winds up in a blink; magic
// casts a knockback burst that flies further (and hits harder) the longer
// it was charged, paid for from a mana pool that refills on its own; the
// spear thrusts in place at a regular wind-up, trading close-range safety
// for the longest reach and hardest hit of any weapon.
const WEAPON_DEFS = {
  unarmed: { chargeMax: 1.2 },
  sword:   { chargeMax: 0.5 },       // significantly faster wind-up
  // magic can keep charging past chargeMax (up to overcharge x) for a
  // stronger release — see _chargeCap / _castBurst.
  magic:   { chargeMax: 1.3, overcharge: 2 },
  spear:   { chargeMax: 1.2 },       // regular wind-up, same as bare fists
};
const SWORD_LUNGE = 640;             // release lunge speed along the aim
const SWORD_LUNGE_CHG = 0.75;        // +75% lunge speed at full charge
const SWORD_LUNGE_H = 0.7;           // horizontal lunge component trimmed 30%
const SWORD_LUNGE_V = 1.3;           // upward lunge boosted 30% (up & diagonals)
const SWORD_CHG_FALL = 0.3;          // charging midair: fall at 30% speed (70% slow fall)
const SWORD_DASH_T0 = 0.16, SWORD_DASH_T1 = 0.28; // lunge slide time vs charge
const MANA_MAX = 100;
const MANA_REGEN = 26;               // per second, always trickling back
const MANA_COST = 35;                // mana at a standard (k=1) burst; scales with power
const BURST_SPD0 = 520,  BURST_SPD1 = 1150;  // burst speed vs charge
const BURST_TTL0 = 0.55, BURST_TTL1 = 1.5;   // burst lifetime vs charge
const BURST_DMG0 = 3.5,  BURST_DMG1 = 8;     // burst damage vs charge
const BURST_KB0  = 420,  BURST_KB1  = 660;   // burst knockback vs charge
const BURST_R0   = 12,   BURST_R1   = 20;    // burst radius vs charge

// Charge fraction k runs 0..1 for a standard release. Weapons with an
// overcharge (magic) can keep holding past that into 1..2, where values
// keep climbing linearly so a full overcharge (k=2) doubles the k=1 value.
function chargeScale(base0, base1, k) {
  return k <= 1 ? base0 + (base1 - base0) * k : base1 * k;
}

// Charged strong attacks: holding the strong-attack control (finger kept
// down after a swipe on touch, B/Y held on a pad, K/X held on keyboard)
// winds the strike up in place, telegraph showing. Damage and knockback grow
// with hold time; at the weapon's chargeMax the attack releases on its own.
const CHARGE_DMG = 0.5;              // +50% damage at full charge
const CHARGE_KB = 0.35;              // +35% knockback at full charge

// A grounded tap converts to a dash attack above this speed (~85% of base
// run, same bar the momentum augment uses) — you need a genuine run-up.
const DASH_ATK_MIN = 320;
const DASH_ATK_FRICTION = 0.3;       // slide keeps rolling through the swing

// Dodge roll: shove the stick sideways out of a duck to tumble along the
// ground. Invulnerable through the front of the roll, punishable at the
// tail, and it bites the guard meter — regen is the spam limiter.
const ROLL_GUARD_COST = 22;
const ROLL_IFRAMES = 0.7;            // leading fraction of the roll with i-frames

// Waveland: touch down mid-fastfall with real drift and the landing keeps
// your slide — low traction for a beat, fully actionable, and attacks
// started during it skip the usual landing plant.
const WAVELAND_TIME = 0.3;
const WAVELAND_MIN_VX = 160;         // drift needed for a landing to slide

const ABILITY_DEFS = {
  fireball:  { cd: 3.0 },
  dashstrike:{ cd: 4.0 },
  shockwave: { cd: 6.0 },
  uppercut:  { cd: 4.0 },
  counter:   { cd: 5.0 },
  blink:     { cd: 4.0 },
  boomerang: { cd: 4.0 },
  volley:    { cd: 5.0 },
  gale:      { cd: 5.0 },
  bubble:    { cd: 6.0 },
  mend:      { cd: 7.0 },
  hook:      { cd: 4.5 },
  trap:      { cd: 6.0 },
};
const COUNTER_WINDOW = 0.6;          // parry stance duration (s)
const BUBBLE_INVULN = 1.5;           // bubble shield duration (s)

let nextEid = 1;

export class Game {
  // players: [{id, name, color, build, isBot}]
  constructor(players, seed = 1, mapId = DEFAULT_MAP) {
    this.map = MAPS[mapId] ? mapId : DEFAULT_MAP;
    this.stage = MAPS[this.map];
    this.seed = seed >>> 0;                 // run seed (world gen + spawns)
    this.coop = !!this.stage.coop;          // PvE co-op rules (HP, no match end)
    this.tick = 0;
    this.over = false;
    this.winner = null;
    this.events = [];               // transient: hits/kos/sfx for renderer
    this.projectiles = [];
    this.enemies = [];              // co-op creeps (host-authoritative)
    this.enemySpawnT = 2.0;        // grace before the first creep wanders in
    this.hitPause = 0;
    this.rng = mulberry32(seed);
    this.fighters = players.map((p, i) => this._spawnFighter(p, i));
    this.inputs = new Map();        // id -> latest input
    for (const f of this.fighters) this.inputs.set(f.id, blankInput());
    this.hist = [];                 // recent positions per tick (lag compensation)
    this.lagComp = new Map();       // attacker id -> ticks to rewind their victims
  }

  _spawnFighter(p, i) {
    const st = derivedStats(p.build);
    return {
      id: p.id, name: p.name, color: p.color, isBot: !!p.isBot, sandbag: !!p.sandbag, st,
      baseBuild: p.build, tryBuild: null,
      x: this.stage.spawns[i % this.stage.spawns.length], y: -F_H / 2,
      vx: 0, vy: 0, facing: i % 2 === 0 ? 1 : -1,
      grounded: true, jumps: st.maxJumps, fastfall: false,
      pct: 0, stocks: STOCKS,
      hp: st.maxHp, maxHp: st.maxHp, downT: 0,   // co-op health & downed timer
      state: 'idle',                // idle|run|air|attack|charge|hitstun|ledge|roll|dead|respawn
      stateT: 0,
      atk: null,                    // active attack name
      atkDir: null,                 // 8-way aim at attack start {x,y} or null
      atkHit: new Set(),
      atkSpd: 0,                    // speed when the swing began (momentum augment)
      chg: 0,                       // charge fraction baked into the live attack
      chgAim: null,                 // 8-way aim captured when the charge began
      invuln: 0, counterT: 0, dashT: 0, slideT: 0,
      guard: GUARD_MAX, standT: 0,  // duck guard meter & stand-up delay
      mana: MANA_MAX,               // magic weapon fuel, always recharging
      cds: [0, 0],                  // ability cooldowns (seconds remaining)
      usedSecondWind: false,
      lastHitBy: null,              // KO attribution (reaper heal)
      dropT: 0,                     // drop-through timer
      ffLockT: 0,                   // brief post-jump window before fast fall can trigger
      burnT: 0,                     // molten-hazard burn cooldown
      burn: null,                   // fireball afterburn DoT {n, every, dmg, tk, by}
      stunned: false,               // trap stun: hitstun pinned through landings
      riseT: 0,                     // cooldown on the aerial up-smash lift
      ridePlat: null,               // index of the platform we're standing on
      ledge: 0,                     // hanging: -1 left lip, 1 right lip, 0 none
      regrabT: 0,                   // cooldown before the ledge can be regrabbed
      rollDir: 0,
      parked: false,                // owner stepped out to the lobby: asleep, untouchable
      dead: false,
      lastDir: { x: 1, y: 0 },
      score: { ko: 0, fall: 0, sd: 0, dmg: 0, taken: 0, maxHit: 0 }, // podium stats
    };
  }

  // Drop a late joiner into a running fight. They enter like a respawn —
  // descending from above with spawn invulnerability — so they can't be
  // camped the instant they appear.
  addFighter(p) {
    if (this.fighters.some(f => f.id === p.id)) return null;
    const f = this._spawnFighter(p, this.fighters.length);
    f.y = this.stage.respawnY;
    f.grounded = false;
    f.state = 'respawn';
    f.stateT = 0;
    f.invuln = RESPAWN_INVULN;
    this.fighters.push(f);
    this.inputs.set(f.id, blankInput());
    return f;
  }

  // A player who left is back under a fresh peer id: hand their old fighter
  // over instead of spawning a doppelgänger. If the disconnect already
  // forfeited their stocks, re-admit them like a late joiner — but their
  // match stats ride along either way.
  rebindFighter(oldId, p) {
    const f = this.fighters.find(x => x.id === oldId);
    if (!f) return this.addFighter(p);
    f.id = p.id;
    f.name = p.name;
    f.color = p.color;
    f.st = derivedStats(p.build);        // rejoiners may bring a new character
    f.jumps = Math.min(f.jumps, f.st.maxJumps);
    f.maxHp = f.st.maxHp; f.hp = Math.min(f.hp, f.maxHp);
    this.inputs.delete(oldId);
    this.inputs.set(p.id, blankInput());
    this.lagComp.delete(oldId);
    for (const o of this.fighters) if (o.lastHitBy === oldId) o.lastHitBy = p.id;
    if (f.dead || f.stocks <= 0) {
      f.dead = false;
      f.stocks = STOCKS;
      f.pct = 0;
      f.hp = f.maxHp; f.downT = 0;
      f.guard = GUARD_MAX; f.standT = 0;
      f.usedSecondWind = false;
      f.x = this.stage.spawns[this.fighters.indexOf(f) % this.stage.spawns.length];
      f.y = this.stage.respawnY;
      f.vx = 0; f.vy = 0;
      f.grounded = false;
      f.state = 'respawn';
      f.stateT = 0;
      f.invuln = RESPAWN_INVULN;
      f.jumps = f.st.maxJumps;
      f.atk = null; f.atkDir = null; f.melee = null; f.chg = 0; f.chgAim = null;
    }
    return f;
  }

  // Swap a live fighter's kit (lobby workshop edit applied on rejoin):
  // derived stats refresh in place and anything the new kit shrinks
  // (air jumps) clamps to fit. Percent, stocks and cooldowns ride along.
  updateBuild(id, build) {
    const f = this.fighters.find(x => x.id === id);
    if (!f) return null;
    f.baseBuild = build;
    f.tryBuild = null;
    f.st = derivedStats(build);
    f.jumps = Math.min(f.jumps, f.st.maxJumps);
    // co-op: retune keeps your current HP but re-tops the ceiling; a heartier
    // Defense build gains headroom, a shrunk one clamps to fit
    if (f.maxHp !== f.st.maxHp) { f.hp = Math.min(f.hp + Math.max(0, f.st.maxHp - f.maxHp), f.st.maxHp); f.maxHp = f.st.maxHp; }
    return f;
  }

  tryBuild(id, build) {
    const f = this.fighters.find(x => x.id === id);
    if (!f || f.dead) return null;
    if (!f.baseBuild) f.baseBuild = build;
    f.tryBuild = build;
    f.st = derivedStats(build);
    f.jumps = Math.min(f.jumps, f.st.maxJumps);
    return f;
  }

  clearTryBuild(id) {
    const f = this.fighters.find(x => x.id === id);
    if (!f || !f.tryBuild) return null;
    f.tryBuild = null;
    if (f.baseBuild) {
      f.st = derivedStats(f.baseBuild);
      f.jumps = Math.min(f.jumps, f.st.maxJumps);
    }
    return f;
  }

  // Park a fighter (their player stepped out to the lobby): they sleep in
  // place, untouchable, until unparked. Waking up has a price — stocks drop
  // to match the lowest fighter still brawling, so lobby-camping can't
  // preserve a lead.
  setParked(id, on) {
    const f = this.fighters.find(x => x.id === id);
    if (!f || f.dead) return;
    if (f.parked && !on) {
      const others = this.fighters.filter(o => o.id !== id && !o.dead && !o.sandbag && !o.parked);
      if (others.length) f.stocks = Math.min(f.stocks, Math.min(...others.map(o => o.stocks)));
    }
    f.parked = !!on;
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
    if (inp.roll) { cur.roll = inp.roll; cur.bufR = BUFFER; } // dodge roll: -1 | 1
    // charge is level-triggered like the stick; re-arms on release
    cur.chg = inp.chg || null;
    if (!cur.chg) cur.chgArm = true;
    if (inp.ab0) { cur.ab0 = true; cur.buf0 = BUFFER; }
    if (inp.ab1) { cur.ab1 = true; cur.buf1 = BUFFER; }
  }

  // How far back (in ticks) this peer's victims are rewound when their
  // attacks resolve. Host sets it from measured RTT; capped at 400 ms.
  setLag(id, ticks) {
    this.lagComp.set(id, clamp(ticks | 0, 0, 24));
  }

  // Current-tick platform positions (cached per tick — collision runs per
  // fighter and again for projectiles).
  platsNow() {
    if (this._pc?.tick !== this.tick) {
      let plats;
      if (this.stage.infinite) {
        // window generation to a band around the fighters — collision only
        // ever needs the platforms anyone could be standing on
        let lo = Infinity, hi = -Infinity;
        for (const f of this.fighters) {
          if (f.dead) continue;
          if (f.x < lo) lo = f.x;
          if (f.x > hi) hi = f.x;
        }
        if (!isFinite(lo)) { lo = 0; hi = 0; }
        plats = expansePlats(this.seed, lo - 1000, hi + 1000);
      } else {
        plats = platsAt(this.map, this.tick);
      }
      this._pc = { tick: this.tick, plats };
    }
    return this._pc.plats;
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
    this._recordHistory();
    this._resolveAttacks();
    this._stepHazards();
    this._checkBlast();
    if (this.coop) { this._stepCoop(); this._stepEnemies(); }

    // Co-op runs never resolve to a winner — the expedition just keeps going.
    if (!this.coop) {
      const alive = this.fighters.filter(f => !f.dead);
      if (alive.length <= (this.fighters.length > 1 ? 1 : 0)) {
        this.over = true;
        this.winner = alive[0] || null;
        this.events.push({ e: 'gameover' });
      }
    }
  }

  // ---------- fighter physics & actions ----------

  _stepFighter(f, inp) {
    f.stateT += TICK;
    // a parked fighter sleeps untouchable until their player comes back
    if (f.parked) f.invuln = Math.max(f.invuln, 0.1);
    f.invuln = Math.max(0, f.invuln - TICK);
    f.counterT = Math.max(0, f.counterT - TICK);
    f.dashT = Math.max(0, f.dashT - TICK);
    f.slideT = f.grounded ? Math.max(0, f.slideT - TICK) : 0;
    f.dropT = Math.max(0, f.dropT - TICK);
    f.ffLockT = Math.max(0, f.ffLockT - TICK);
    f.burnT = Math.max(0, f.burnT - TICK);
    if (f.burn) this._stepBurn(f);
    f.riseT = f.grounded ? 0 : Math.max(0, f.riseT - TICK);
    f.regrabT = Math.max(0, f.regrabT - TICK);
    f.standT = Math.max(0, f.standT - TICK);
    f.mana = Math.min(MANA_MAX, f.mana + MANA_REGEN * TICK);
    f.cds[0] = Math.max(0, f.cds[0] - TICK);
    f.cds[1] = Math.max(0, f.cds[1] - TICK);

    if (f.state === 'respawn') {
      if (f.stateT > 0.8) { f.state = 'air'; }
      else { f.y = this.stage.respawnY; f.vx = 0; f.vy = 0; this._decayInput(inp); return; }
    }
    if (f.state === 'ledge') { this._stepLedge(f, inp); return; }
    if (f.state === 'roll') { this._stepRoll(f, inp); return; }

    const inHitstun = f.state === 'hitstun';
    const inAttack = f.state === 'attack';
    const inCharge = f.state === 'charge';
    const inDuck = f.state === 'duck';
    const inCrush = f.state === 'crush';
    const canAct = !inHitstun && !inAttack && !inCharge && !inCrush;

    if (Math.abs(inp.mx) > 0.15) f.lastDir = { x: Math.sign(inp.mx), y: inp.my };

    // --- dodge roll: shove the stick sideways out of a duck ---
    // Also honored through the brief stand-up window, so a hard sideways
    // slam that drops the duck a tick before the flick edge lands still
    // rolls instead of standing up into the hit.
    if (inp.roll && canAct && f.grounded
        && (f.state === 'duck' || f.standT > 0)
        && f.guard >= GUARD_REDUCK) {
      this._startRoll(f, inp.roll < 0 ? -1 : 1);
      inp.roll = 0; inp.bufR = 0;
      this._decayInput(inp);
      return;
    }

    // --- ducking (hold the stick mostly-down while grounded) ---
    const wantDuck = f.grounded && inp.my > 0.6 && inp.my >= Math.abs(inp.mx);
    const duckAttack = inDuck && (inp.atk || (inp.chg && inp.chgArm));
    if (inDuck) {
      const wear = f.st.augments.includes('bulwark') ? 0.6 : 1;  // bulwark: sturdier guard
      f.guard = Math.max(0, f.guard - GUARD_DRAIN * TICK * wear);
      if (f.guard <= 0) this._crushGuard(f);
      else if (duckAttack) {
        f.state = 'idle';
        f.stateT = 0;
        f.standT = 0;
      }
      else if (!wantDuck) {
        f.state = f.grounded ? 'idle' : 'air';
        f.stateT = 0;
        f.standT = DUCK_STANDUP;   // brief stand-up before attacks come out
      }
    } else {
      f.guard = Math.min(GUARD_MAX, f.guard + GUARD_REGEN * TICK);
      if (wantDuck && canAct && f.guard >= GUARD_REDUCK) {
        f.state = 'duck';
        f.stateT = 0;
        this.events.push({ e: 'duck', id: f.id, x: f.x, y: f.y + F_H / 2 });
      }
    }
    const ducking = f.state === 'duck';

    // --- horizontal movement ---
    if (!inHitstun && !inCrush && f.dashT <= 0) {
      const want = inp.mx * RUN * f.st.speedMult;
      if (f.grounded) {
        if (Math.abs(inp.mx) > 0.15 && canAct && !ducking) {
          f.vx = approach(f.vx, want, GROUND_ACCEL * TICK);
          f.facing = Math.sign(inp.mx) || f.facing;
          f.state = 'run';
        } else {
          // dash attacks and wavelands slide on reduced friction
          const slick = (inAttack && f.atk === 'dash') || f.slideT > 0;
          f.vx = approach(f.vx, 0, (slick ? FRICTION * DASH_ATK_FRICTION : FRICTION) * TICK);
          if (canAct && !ducking) f.state = 'idle';
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
      f.ffLockT = JUMP_FF_LOCK;
      f.state = 'air';
      f.standT = 0;
      inp.jump = false;
      this.events.push({ e: 'jump', id: f.id, x: f.x, y: f.y + F_H / 2 });
    }
    // quick fall: down mid-jump cancels the rest of the ascent on the spot.
    // Holding down before jumping also cancels on the first airborne tick.
    // Locked out for a brief window right after a jump so the leap is
    // visible even if down was already held — only when actionable, since
    // a launch's lift can't be ditched mid-hitstun (would neuter every
    // vertical KO).
    if ((inp.ff || inp.my > 0.6) && !f.grounded && f.ffLockT <= 0) {
      if (canAct && f.vy < 0) { f.vy = 0; f.fastfall = true; }
      else if (f.vy > -200) f.fastfall = true;
    }
    if (inp.drop && f.grounded) f.dropT = 0.25;    // fall through platforms
    inp.ff = inp.drop = false;

    // --- attacks & abilities (locked while ducking / standing up / crushed) ---
    const mayAct = canAct && f.state !== 'duck' && f.standT <= 0;
    if (mayAct && inp.chg && inp.chgArm) { this._startCharge(f, inp.chg); inp.chgArm = false; }
    else if (mayAct && inp.atk) { this._startAttack(f, inp.atk, duckAttack); inp.atk = null; }
    if (mayAct && inp.ab0) { this._useAbility(f, 0); inp.ab0 = false; }
    if (mayAct && inp.ab1) { this._useAbility(f, 1); inp.ab1 = false; }

    // charge state machine: fires when the control is let go (the release
    // also arrives as a buffered swipe edge — consume it) or at the cap
    if (inCharge && (!inp.chg || inp.atk || f.stateT >= this._chargeCap(f))) {
      this._releaseCharge(f);
      inp.atk = null; inp.bufA = 0;
    }

    // attack state machine (unknown names — a newer peer's move — fizzle)
    if (inAttack) {
      const a = ATTACKS[f.atk];
      const total = a ? a.startup + a.active + a.rec : 0;
      if (f.stateT >= total) { f.state = f.grounded ? 'idle' : 'air'; f.atk = null; f.atkDir = null; f.lowJab = false; f.atkHit.clear(); f.chg = 0; f.atkSpd = 0; }
    }
    if (inHitstun && f.stateT >= f.hitstunFor) { f.state = f.grounded ? 'idle' : 'air'; f.stunned = false; }
    if (inCrush && f.stateT >= CRUSH_STUN) { f.state = f.grounded ? 'idle' : 'air'; }

    // --- gravity & integration ---
    if (!f.grounded) {
      // sword charge floats: the windup falls 70% slower, hanging the
      // swordsman in the air while the aim is held
      const slow = inCharge && f.st.weapon === 'sword' ? SWORD_CHG_FALL : 1;
      const cap = (f.fastfall ? FASTFALL : MAX_FALL) * slow;
      f.vy = Math.min(cap, f.vy + GRAV * slow * TICK);
    }
    f.x += f.vx * TICK;
    f.y += f.vy * TICK;

    this._collide(f);
    this._tryLedgeGrab(f);
    this._decayInput(inp);
  }

  // Fireball afterburn: the victim smolders, taking small percent ticks on
  // a fixed cadence. Pure percent — no flinch, no knockback — so it stings
  // without combo-locking. Damage credit flows to whoever lit the fire.
  _stepBurn(f) {
    f.burn.tk -= TICK;
    if (f.burn.tk > 0) return;
    f.burn.tk += f.burn.every;
    const att = this.fighters.find(x => x.id === f.burn.by);
    const dmg = f.burn.dmg * f.st.dmgTaken;
    f.pct = Math.min(999, f.pct + dmg);
    f.score.taken += dmg;
    if (att) { att.score.dmg += dmg; f.lastHitBy = att.id; }
    this.events.push({ e: 'burn', x: f.x, y: f.y - F_H / 2, vic: f.id, dmg: Math.round(dmg) });
    if (--f.burn.n <= 0) f.burn = null;
  }

  _decayInput(inp) {
    inp.ff = inp.drop = false;
    if ((inp.bufJ -= TICK) <= 0) inp.jump = false;
    if ((inp.bufA -= TICK) <= 0) inp.atk = null;
    if ((inp.bufR -= TICK) <= 0) inp.roll = 0;
    if ((inp.buf0 -= TICK) <= 0) inp.ab0 = false;
    if ((inp.buf1 -= TICK) <= 0) inp.ab1 = false;
  }

  _collide(f) {
    const wasGrounded = f.grounded;
    f.grounded = false;
    const feet = f.y + F_H / 2;

    // solid main stage: land on top, push out of sides
    const m = this.stage.main;
    if (f.vy >= 0 && feet >= m.y && feet <= m.y + 42 && f.x > m.x - F_W / 2 && f.x < m.x + m.w + F_W / 2) {
      f.y = m.y - F_H / 2; f.vy = 0; f.grounded = true;
    } else if (f.y + F_H / 2 > m.y + 6 && f.y - F_H / 2 < m.y + m.h) {
      if (f.x > m.x - F_W / 2 && f.x < m.x + F_W / 4) { f.x = m.x - F_W / 2; if (f.vx > 0) f.vx = 0; }
      else if (f.x < m.x + m.w + F_W / 2 && f.x > m.x + m.w - F_W / 4) { f.x = m.x + m.w + F_W / 2; if (f.vx < 0) f.vx = 0; }
    }

    // drop-through platforms (only when falling, not dropping through).
    // Moving platforms carry their riders: once you land on one we track the
    // index and glue you to its top, folding its per-tick drift into your
    // position — so the crane girder sweeps you across the skyline.
    if (f.grounded || f.dropT > 0 || f.vy < 0) {
      f.ridePlat = null;             // on the floor, dropping through, or rising
    } else {
      const plats = this.platsNow();
      if (f.ridePlat != null) {
        const p = plats[f.ridePlat];
        if (p && f.x > p.x && f.x < p.x + p.w && feet >= p.y - 34 && feet <= p.y + 34) {
          // moving platforms carry their rider; static/generated ones don't
          // drift (and have no static spec to look up, on the endless map)
          const spec = this.stage.plats[f.ridePlat];
          if (spec?.move) f.x += p.x - platPos(spec, this.tick - 1).x;
          f.y = p.y - F_H / 2; f.vy = 0; f.grounded = true;
        } else f.ridePlat = null;
      }
      if (!f.grounded) {
        for (let i = 0; i < plats.length; i++) {
          const p = plats[i];
          if (feet >= p.y && feet <= p.y + 22 && f.x > p.x && f.x < p.x + p.w) {
            f.y = p.y - F_H / 2; f.vy = 0; f.grounded = true; f.ridePlat = i;
            break;
          }
        }
      }
    }

    if (f.grounded && !wasGrounded) {
      f.jumps = f.st.maxJumps;
      // waveland: a fast-fallen touchdown with drift keeps sliding
      if (f.fastfall && Math.abs(f.vx) > WAVELAND_MIN_VX) f.slideT = WAVELAND_TIME;
      f.fastfall = false;
      if (f.state === 'air' || (f.state === 'hitstun' && !f.stunned)) f.state = 'idle';
      this.events.push({ e: 'land', id: f.id, x: f.x, y: f.y + F_H / 2 });
    }
  }

  // ---------- ledge grabs (main floor lips only, never platforms) ----------

  _tryLedgeGrab(f) {
    // 'air' and 'run' are both free-fall here: walking off an edge keeps the
    // run state while airborne. Anything else (attack/hitstun/...) can't grab.
    if (f.grounded || (f.state !== 'air' && f.state !== 'run')) return;
    if (f.vy <= 0 || f.fastfall || f.regrabT > 0) return;
    const m = this.stage.main;
    for (const side of [-1, 1]) {
      const lipX = side < 0 ? m.x : m.x + m.w;
      const dx = (f.x - lipX) * side;        // >0 = outside the stage
      const dy = f.y - m.y;                  // fighter center below the lip
      if (f.vx * side > 40) continue;        // moving away from the stage: no snag
      // one grabber per lip: an occupied ledge can't be stolen
      if (this.fighters.some(o => o !== f && !o.dead && o.state === 'ledge' && o.ledge === side)) continue;
      if (dx > -LEDGE_GRACE_IN && dx < LEDGE_GRACE_OUT
          && dy > -LEDGE_GRACE_UP && dy < LEDGE_GRACE_DOWN) {
        f.state = 'ledge';
        f.stateT = 0;
        f.ledge = side;
        f.vx = 0; f.vy = 0;
        f.jumps = f.st.maxJumps;             // hanging refreshes air jumps, like landing
        f.fastfall = false;
        f.atk = null; f.atkDir = null; f.melee = null; f.chg = 0; f.chgAim = null;
        f.invuln = Math.max(f.invuln, LEDGE_INVULN);
        this.events.push({ e: 'ledge', id: f.id, x: lipX, y: m.y });
        return;
      }
    }
  }

  _stepLedge(f, inp) {
    const m = this.stage.main;
    const lipX = f.ledge < 0 ? m.x : m.x + m.w;
    f.x = lipX + f.ledge * (F_W / 2 - 6);    // hands over the lip, body outside
    f.y = m.y + LEDGE_HANG_Y;
    f.vx = 0; f.vy = 0;
    f.facing = -f.ledge;                     // face the stage
    f.grounded = false;

    if (inp.jump) {
      // super jump — stronger than a ground jump and spends no air jump
      f.state = 'air'; f.stateT = 0;
      f.vy = -LEDGE_JUMP_V * f.st.jumpMult;
      f.vx = -f.ledge * 60;
      f.regrabT = REGRAB_CD;
      f.ffLockT = JUMP_FF_LOCK;
      inp.jump = false; inp.bufJ = 0;
      this.events.push({ e: 'jump', id: f.id, x: f.x, y: f.y + F_H / 2 });
    } else if (inp.atk) {
      // getup roll: pop onto the stage and tumble inward, briefly invulnerable
      f.state = 'roll'; f.stateT = 0;
      f.rollDir = -f.ledge;
      f.facing = f.rollDir;            // face the tumble so the spin reads right
      f.ridePlat = null;               // getup rolls always ride the main floor
      f.y = m.y - F_H / 2;
      f.grounded = true;
      f.invuln = Math.max(f.invuln, ROLL_TIME + 0.1);
      f.regrabT = REGRAB_CD;
      inp.atk = null; inp.bufA = 0;
      this.events.push({ e: 'roll', id: f.id, x: f.x, y: f.y });
    } else if (inp.ff || inp.drop || inp.my > 0.6 || f.ledge * inp.mx > 0.7
        || f.stateT > LEDGE_MAX_HANG) {
      // let go: down input, push away from the stage, or hang timeout
      f.state = 'air'; f.stateT = 0;
      f.regrabT = REGRAB_CD;
      f.fastfall = false;
    }
    this._decayInput(inp);
  }

  // Duck dodge roll (ledge getups enter 'roll' from _stepLedge with full
  // invulnerability; this one leaves a punishable tail and costs guard).
  _startRoll(f, dir) {
    f.guard = Math.max(0, f.guard - ROLL_GUARD_COST);
    f.state = 'roll';
    f.stateT = 0;
    f.rollDir = dir;
    f.facing = dir;      // face the tumble so the spin animation reads right
    f.standT = 0;
    f.vx = 0; f.vy = 0;
    f.invuln = Math.max(f.invuln, ROLL_TIME * ROLL_IFRAMES);
    this.events.push({ e: 'roll', id: f.id, x: f.x, y: f.y });
  }

  _stepRoll(f, inp) {
    const step = f.rollDir * (ROLL_DIST / ROLL_TIME) * TICK;
    const p = f.ridePlat != null ? this.platsNow()[f.ridePlat] : null;
    if (p) {
      // rolling on a platform: ride its drift (moving platforms only), stop at its edges
      const spec = this.stage.plats[f.ridePlat];
      const driftX = spec?.move ? (p.x - platPos(spec, this.tick - 1).x) : 0;
      f.x = clamp(f.x + step + driftX, p.x + F_W / 4, p.x + p.w - F_W / 4);
      f.y = p.y - F_H / 2;
    } else {
      const m = this.stage.main;
      f.x = clamp(f.x + step, m.x + F_W / 2, m.x + m.w - F_W / 2);
      f.y = m.y - F_H / 2;
    }
    f.vx = 0; f.vy = 0;
    f.grounded = true;
    if (f.stateT >= ROLL_TIME) { f.state = 'idle'; f.facing = f.rollDir; }
    this._decayInput(inp);
  }

  // Guard meter hit zero: crumple stun. Pops the fighter up a touch and
  // leaves them taking bonus knockback until the stun runs out.
  _crushGuard(f) {
    f.guard = 0;
    f.state = 'crush';
    f.stateT = 0;
    f.standT = 0;
    f.vy = Math.min(f.vy, -300);
    f.grounded = false;
    f.atk = null; f.atkDir = null; f.melee = null; f.chg = 0; f.chgAim = null;
    this.events.push({ e: 'crush', id: f.id, x: f.x, y: f.y });
  }

  _startAttack(f, atk, fromDuck = false, chg = 0) {
    // Aimed commands: {kind:'tap'|'swipe', dx, dy} with dx/dy in {-1,0,1}
    // (8-way). Legacy shapes {kind:'up'|'down'|'side'} from older peers
    // still convert. Taps are quick jabs aimed by movement; swipes are
    // weapon strikes aimed by the swipe itself.
    let dx = atk.dx | 0, dy = atk.dy | 0;
    if (atk.kind === 'up') { dx = 0; dy = -1; }
    else if (atk.kind === 'down') { dx = 0; dy = 1; }
    else if (atk.kind === 'side') { dx = atk.dir || 1; dy = 0; }
    const swipe = atk.kind !== 'tap';

    let name;
    if (!swipe) {
      // neutral tap in the air: spin move — multiple hits in a close circle
      name = (!dx && !dy && !f.grounded) ? 'nspin' : 'jab';
      // grounded straight-down tap: angle it forward so it isn't in the floor
      if (dy > 0 && !dx && f.grounded) dx = f.facing;
      // tap at run speed: dash attack — the jab rides the momentum instead
      // of planting. Vertical or against-the-run aims fall through to the
      // normal jab, so aiming backward is the escape hatch to stop and poke.
      if (name === 'jab' && !fromDuck && f.grounded && !dy
          && Math.abs(f.vx) >= DASH_ATK_MIN && (!dx || dx === Math.sign(f.vx))) {
        name = 'dash';
        dx = Math.sign(f.vx);
      }
    } else {
      // no neutral strong attack: a neutral swipe is the side strike the
      // way you're facing, whatever the weapon
      if (!dx && !dy) dx = f.facing;
      name = this._weaponAttack(f, dx, dy);
    }

    if (dx) f.facing = dx;
    f.state = 'attack';
    f.stateT = 0;
    f.atk = name;
    f.atkDir = (dx || dy) ? { x: dx, y: dy } : null;
    f.chg = chg;                         // charge baked in by _releaseCharge
    f.lowJab = fromDuck && name === 'jab';
    f.atkHit.clear();
    f.atkSpd = Math.hypot(f.vx, f.vy);   // momentum: judge the run-up, not the plant
    // dash attacks keep their slide; so do attacks thrown mid-waveland
    if (f.grounded && name !== 'dash' && f.slideT <= 0) f.vx *= 0.35;
    // upward smash in the air boosts you like an air jump — and costs none.
    // The lift itself is on a short cooldown so chained up-smashes can't be
    // spammed to fly forever; the swing still comes out either way.
    if (dy < 0 && (name === 'usmash' || name === 'fsmash') && !f.grounded) {
      if (f.riseT <= 0) {
        f.vy = Math.min(f.vy, -JUMP2_V * f.st.jumpMult * (dx ? 0.75 : 1));
        f.riseT = AIR_RISE_CD;
      }
      f.fastfall = false;
    }
    if (name === 'slash') this._lunge(f, dx, dy, chg);
    if (name === 'mcast' && !this._castBurst(f, dx, dy, chg)) return; // fizzled: no swing
    this.events.push({ e: 'swing', id: f.id, atk: name, x: f.x, y: f.y, dx, dy, chg });
  }

  // Which strong attack a swipe/charge becomes: the equipped weapon's
  // strike, or the classic smash kit for bare fists.
  _weaponAttack(f, dx, dy) {
    const w = f.st.weapon;
    if (w === 'sword') return 'slash';
    if (w === 'magic') return 'mcast';
    if (w === 'spear') return 'thrust';
    if (dy < 0 && !dx) return 'usmash';
    if (dy > 0 && !dx) return f.grounded ? 'dsmash' : 'dair';
    return 'fsmash';
  }

  _chargeMax(f) {
    return (WEAPON_DEFS[f.st.weapon] || WEAPON_DEFS.unarmed).chargeMax;
  }

  // How far a weapon's charge fraction (k) is allowed to run: 1 for a
  // standard release, higher for weapons with an overcharge (magic can
  // hold to 2x for a doubled-power burst).
  _chargeKMax(f) {
    return (WEAPON_DEFS[f.st.weapon] || WEAPON_DEFS.unarmed).overcharge || 1;
  }

  // Wall-clock hold time at which a charge auto-releases.
  _chargeCap(f) {
    return this._chargeMax(f) * this._chargeKMax(f);
  }

  // Sword release: a body lunge along the 8-way aim, longer the harder it
  // was charged. The sideways component is trimmed while upward vectors
  // (straight up and the diagonals) get a boost — the blade climbs better
  // than it skates. Grounded down-aims can't dive through the floor, so
  // only their sideways component slides. Aerial upward lunges share the
  // up-smash rise cooldown so chained slashes can't climb forever.
  _lunge(f, dx, dy, k = 0) {
    const spd = SWORD_LUNGE * (1 + SWORD_LUNGE_CHG * k);
    const n = Math.hypot(dx, dy) || 1;
    const lx = (dx / n) * spd * SWORD_LUNGE_H;
    let ly = (dy / n) * spd * (dy < 0 ? SWORD_LUNGE_V : 1);
    if (f.grounded && ly > 0) ly = 0;
    if (ly < 0) {
      if (!f.grounded && f.riseT > 0) ly = 0;
      else { f.riseT = AIR_RISE_CD; f.grounded = false; f.fastfall = false; }
    }
    if (lx) { f.vx = lx; f.dashT = SWORD_DASH_T0 + (SWORD_DASH_T1 - SWORD_DASH_T0) * k; }
    if (ly) f.vy = ly;
  }

  // Magic release: a burst that flies along the aim. Charge is range and
  // muscle — speed, lifetime, damage and knockback all grow with it. Costs
  // mana; too dry to pay and the cast fizzles into nothing but recovery.
  // Returns whether a burst actually came out.
  _castBurst(f, dx, dy, k) {
    if (f.grounded && dy > 0) { dy = 0; dx = dx || f.facing; } // not into the floor
    // mana tracks the burst's actual power output (its damage), not a flat
    // tax — a weak tap is cheap, a full overcharge costs twice a standard cast
    const dmg = chargeScale(BURST_DMG0, BURST_DMG1, k);
    const cost = MANA_COST * (dmg / BURST_DMG1);
    if (f.mana < cost) {
      this.events.push({ e: 'fizzle', id: f.id, x: f.x, y: f.y });
      return false;
    }
    f.mana -= cost;
    const n = Math.hypot(dx, dy) || 1;
    const nx = dx / n, ny = dy / n;
    const spd = chargeScale(BURST_SPD0, BURST_SPD1, k);
    // launch follows the flight path (with lift when fired flat), so a
    // rising burst carries foes skyward and a dive shot slams them down
    const ang = dy ? Math.atan2(ny, Math.abs(nx)) * 180 / Math.PI : -30;
    this.projectiles.push({
      eid: nextEid++, kind: 'burst', owner: f.id,
      x: f.x + nx * 40, y: f.y - 8 + ny * 34,
      vx: nx * spd, vy: ny * spd,
      ttl: chargeScale(BURST_TTL0, BURST_TTL1, k),
      dmg, kb: chargeScale(BURST_KB0, BURST_KB1, k), ks: 9, r: chargeScale(BURST_R0, BURST_R1, k),
      ang,
    });
    return true;
  }

  // Wind up a strong attack: the fighter plants (or drifts, midair) with
  // the telegraph showing while the strong-attack control stays held. The
  // aim — and therefore which strike comes out — locks when the charge
  // begins. Each weapon winds up at its own rate.
  _startCharge(f, aim) {
    let dx = aim.dx | 0, dy = aim.dy | 0;
    // no neutral strong attack: neutral charges the side strike, as faced
    if (!dx && !dy) dx = f.facing;
    const name = this._weaponAttack(f, dx, dy);
    if (dx) f.facing = dx;
    f.state = 'charge';
    f.stateT = 0;
    f.atk = name;
    f.atkDir = { x: dx, y: dy };
    f.chgAim = { dx, dy };
    f.atkHit.clear();
    if (f.grounded && f.slideT <= 0) f.vx *= 0.35;   // charging mid-waveland glides
    this.events.push({ e: 'charge', id: f.id, x: f.x, y: f.y });
  }

  _releaseCharge(f) {
    const k = clamp(f.stateT / this._chargeMax(f), 0, this._chargeKMax(f));
    const aim = f.chgAim || { dx: 0, dy: 0 };
    f.chgAim = null;
    // charge scales damage/knockback (and burst range) when the hit resolves
    this._startAttack(f, { kind: 'swipe', dx: aim.dx, dy: aim.dy }, false, k);
  }

  _useAbility(f, slot) {
    const id = f.st.abilities[slot];
    if (!id || f.cds[slot] > 0) return;
    const def = ABILITY_DEFS[id];
    f.cds[slot] = def.cd * (f.st.cdMult || 1);
    const dir = f.lastDir;
    let evUp = false;
    switch (id) {
      case 'fireball':
        this.projectiles.push({
          eid: nextEid++, kind: 'fireball', owner: f.id,
          x: f.x + f.facing * 40, y: f.y - 8,
          vx: f.facing * 620, vy: 0, ttl: 1.4,
          dmg: 6, kb: 170, ks: 13, r: 14,
          dot: { n: 3, every: 0.5, dmg: 2 },   // afterburn: +6% over 1.5s
        });
        break;
      case 'dashstrike': {
        // hold up while casting to angle the lunge diagonally skyward
        const up = (this.inputs.get(f.id)?.my ?? 0) < -0.4;
        evUp = up;
        f.dashT = 0.22;
        f.vx = f.facing * (up ? 720 : 950);
        f.vy = up ? -640 : 0;
        if (up) { f.grounded = false; f.fastfall = false; }
        f.melee = { name: 'dash', dmg: 8, kb: 200, ks: 16, rx: 50, ry: 30, ang: up ? -55 : -20, until: this.tick + 14, hit: new Set() };
        break;
      }
      case 'shockwave':
        if (!f.grounded) { f.vy = FASTFALL; f.fastfall = true; f.pendingShock = true; }
        else this._shockwave(f);
        break;
      case 'uppercut':
        f.vy = -980;
        f.grounded = false;
        f.melee = { name: 'upper', dmg: 11, kb: 540, ks: 30, rx: 48, ry: 68, ang: -88, until: this.tick + 18, hit: new Set() };
        break;
      case 'counter':
        f.counterT = COUNTER_WINDOW;
        break;
      case 'blink': {
        const len = Math.hypot(dir.x, dir.y) > 0.3 ? 1 : 0;
        const dx = len ? dir.x : f.facing, dy = len ? dir.y : 0;
        const n = Math.hypot(dx, dy) || 1;
        f.x += (dx / n) * 150;
        f.y += (dy / n) * 150;
        f.y = Math.min(f.y, this.stage.main.y - F_H / 2); // never blink into the floor
        f.invuln = Math.max(f.invuln, 0.35);
        f.vy = Math.min(f.vy, 0);
        break;
      }
      case 'boomerang':
        this.projectiles.push({
          eid: nextEid++, kind: 'boomerang', owner: f.id,
          x: f.x + f.facing * 40, y: f.y - 8,
          vx: f.facing * 560, vy: 0, ttl: 1.5,
          ret: -f.facing * 1400,   // constant pull back toward the throw point
          dmg: 5, kb: 280, ks: 16, r: 15,
          thru: true, hit: new Set(),   // cuts through targets, out and back
        });
        break;
      case 'volley':
        for (const vy of [-150, 0, 150]) {
          this.projectiles.push({
            eid: nextEid++, kind: 'bolt', owner: f.id,
            x: f.x + f.facing * 40, y: f.y - 8,
            vx: f.facing * 580, vy, ttl: 1.1,
            dmg: 5, kb: 140, ks: 10, r: 11,
          });
        }
        break;
      case 'gale':
        // radial windbox: little damage, lots of shove; works midair
        this.events.push({ e: 'gale', id: f.id, x: f.x, y: f.y });
        this._radialHit(f, 200, { dmg: 5, kb: 420, ks: 6 },
          (dx, dy) => Math.atan2(dy, dx) * 0.25 - Math.PI / 6);
        break;
      case 'bubble':
        f.invuln = Math.max(f.invuln, BUBBLE_INVULN);
        break;
      case 'mend':
        // co-op heals real HP; PvP shaves percent
        if (this.coop) f.hp = Math.min(f.maxHp, f.hp + f.maxHp * 0.15);
        else f.pct = Math.max(0, f.pct - 15);
        this.events.push({ e: 'mend', id: f.id, x: f.x, y: f.y });
        break;
      case 'hook':
        // chain claw: reels the first foe it tags in toward you
        this.projectiles.push({
          eid: nextEid++, kind: 'hook', owner: f.id,
          x: f.x + f.facing * 40, y: f.y - 8,
          vx: f.facing * 820, vy: 0, ttl: 1.05,
          dmg: 6, kb: 600, ks: 3, r: 15, pull: true, ang: -20,
        });
        break;
      case 'trap':
        // planted jaws: drop at your feet and sit armed until someone steps
        // in — the snap locks the victim in a long stun
        this.projectiles.push({
          eid: nextEid++, kind: 'trap', owner: f.id,
          x: f.x + f.facing * 30, y: f.y + F_H / 2 - 12,
          vx: 0, vy: 0, grav: 1400, ttl: 6,
          dmg: 8, kb: 330, ks: 16, r: 16, ang: -80, pierce: true, stun: 1.5,
        });
        break;
    }
    this.events.push({ e: 'ability', id: f.id, ability: id, x: f.x, y: f.y, dir: f.facing, up: evUp });
  }

  _shockwave(f) {
    f.pendingShock = false;
    this.events.push({ e: 'shockwave', id: f.id, x: f.x, y: f.y + F_H / 2 });
    this._radialHit(f, 190, { dmg: 10, kb: 280, ks: 18 },
      (dx, dy) => Math.atan2(dy, dx) * 0.3 - Math.PI / 2.4);
  }

  // Radial AoE (shockwave, gale): in co-op it blasts the creeps and spares
  // teammates; in PvP it hits every rival in range. angleFn maps the offset
  // to a launch angle so each victim flies outward from the blast.
  _radialHit(f, radius, spec, angleFn) {
    if (this.coop) {
      for (const e of this.enemies) {
        if (e.hp <= 0) continue;
        const dx = e.x - f.x, dy = e.y - f.y;
        if (Math.hypot(dx, dy) < radius) this._hitEnemy(f, e, spec, angleFn(dx, dy), Math.sign(dx) || 1, false);
      }
      return;
    }
    for (const o of this.fighters) {
      if (o.id === f.id || o.dead || o.invuln > 0) continue;
      const pos = this._rewound(o, f.id);
      const dx = pos.x - f.x, dy = pos.y - f.y;
      if (Math.hypot(dx, dy) < radius) this._applyHit(f, o, spec, angleFn(dx, dy), Math.sign(dx) || 1);
    }
  }

  // ---------- combat resolution ----------

  // Lag compensation: the host remembers where everyone stood for the last
  // ~30 ticks. When an attack resolves, victims are tested at the position
  // the *attacker* saw (one-way latency + interpolation delay ago), so what
  // you see on your screen is what you hit.
  _recordHistory() {
    const p = new Map();
    for (const f of this.fighters) p.set(f.id, [f.x, f.y]);
    this.hist.push({ tk: this.tick, p });
    if (this.hist.length > 30) this.hist.shift();
  }

  _rewound(victim, attackerId) {
    const rw = this.lagComp.get(attackerId) | 0;
    if (rw <= 0) return victim;
    const want = this.tick - rw;
    for (let i = this.hist.length - 1; i >= 0; i--) {
      if (this.hist[i].tk <= want) {
        const p = this.hist[i].p.get(victim.id);
        return p ? { x: p[0], y: p[1] } : victim;
      }
    }
    return victim;
  }

  // Current melee hitbox for a fighter (offsets relative to its center), or
  // null when nothing threatens. active=false marks the windup telegraph
  // before the hit can actually connect. The renderer draws exactly this.
  hitboxFor(f) {
    if (f.dead) return null;
    // charging smash: telegraph with a 0..1 charge level for the renderer
    if (f.state === 'charge' && f.atk) {
      const a = ATTACKS[f.atk];
      if (!a) return null;              // move from a newer version — no box
      return { ...meleeHitbox(f, a, f.atkDir), active: false, chg: clamp(f.stateT / this._chargeMax(f), 0, 1) };
    }
    if (f.state === 'attack' && f.atk) {
      const a = ATTACKS[f.atk];
      if (a && !a.cast && f.stateT <= a.startup + a.active) {
        return { ...meleeHitbox(f, a, f.atkDir), active: f.stateT >= a.startup, round: !!a.rehit };
      }
    }
    if (f.melee && this.tick <= f.melee.until) {
      return { ...meleeHitbox(f, f.melee), active: true };
    }
    return null;
  }

  _resolveAttacks() {
    for (const f of this.fighters) {
      if (f.dead) continue;

      // landed shockwave slam
      if (f.pendingShock && f.grounded) this._shockwave(f);

      // normal attacks during active window (casts hit via their projectile)
      if (f.state === 'attack' && f.atk) {
        const a = ATTACKS[f.atk];
        if (a && !a.cast && f.stateT >= a.startup && f.stateT <= a.startup + a.active) {
          let spec = a;
          if (a.rehit) {
            // multi-hit: split the active window into rehit-sized slices and
            // re-arm the hit set at each slice boundary so victims can be
            // struck once per slice. A '__w<n>' marker (never a fighter id)
            // remembers which slice the set belongs to.
            const wins = Math.max(1, Math.ceil(a.active / a.rehit));
            const win = Math.min(wins - 1, Math.floor((f.stateT - a.startup) / a.rehit));
            const key = '__w' + win;
            if (!f.atkHit.has(key)) { f.atkHit.clear(); f.atkHit.add(key); }
            if (a.fin && win === wins - 1) spec = { ...a, ...a.fin };
          }
          if (f.chg > 0) {
            spec = { ...spec, dmg: spec.dmg * (1 + CHARGE_DMG * f.chg), kb: spec.kb * (1 + CHARGE_KB * f.chg) };
          }
          this._meleeHit(f, spec, f.atkHit, spec.ang, f.atkDir);
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
        if (this.coop) continue;   // co-op: no friendly fire between teammates
        if (pr.hit?.has(o.id)) continue;   // piercing shot already cut through them
        const pos = this._rewound(o, pr.owner);
        const ob = hurtBox(o);
        if (Math.abs(pos.x - pr.x) < F_W / 2 + pr.r && Math.abs(pos.y + ob.dy - pr.y) < ob.hh + pr.r) {
          const att = this.fighters.find(x => x.id === pr.owner);
          if (o.counterT > 0) { pr.vx *= -1; pr.owner = o.id; this.events.push({ e: 'counter', x: o.x, y: o.y }); continue; }
          if (att) {
            // hooks yank the victim toward the thrower; traps launch straight up
            const dirX = pr.pull ? (Math.sign(att.x - pos.x) || 1) : (Math.sign(pr.vx) || 1);
            this._applyHit(att, o, pr, deg(pr.ang ?? -40), dirX, false, !!pr.pierce);
          }
          if (pr.thru) pr.hit.add(o.id);   // sail on through
          else pr.ttl = 0;
        }
      }
    }

    // projectiles vs creeps (co-op)
    if (this.coop) {
      for (const pr of this.projectiles) {
        const att = this.fighters.find(x => x.id === pr.owner);
        if (!att) continue;
        for (const e of this.enemies) {
          if (e.hp <= 0 || pr.hit?.has('e' + e.eid)) continue;
          if (Math.abs(e.x - pr.x) < ENEMY_W / 2 + pr.r && Math.abs(e.y - pr.y) < ENEMY_H / 2 + pr.r) {
            this._hitEnemy(att, e, pr, deg(pr.ang ?? -40), Math.sign(pr.vx) || 1, false);
            if (pr.thru) pr.hit?.add('e' + e.eid);
            else { pr.ttl = 0; break; }
          }
        }
      }
    }
  }

  _meleeHit(f, spec, hitSet, angDeg, aim = null) {
    const hb = meleeHitbox(f, spec, aim);
    const cx = f.x + hb.dx, cy = f.y + hb.dy;
    const a = aim && (aim.x || aim.y) ? aim : null;
    for (const o of this.fighters) {
      if (o.id === f.id || o.dead || o.invuln > 0 || hitSet.has(o.id)) continue;
      if (this.coop) continue;   // co-op: teammates can't hurt each other (enemies are a separate faction)
      const pos = this._rewound(o, f.id);
      const ob = hurtBox(o);
      if (Math.abs(pos.x - cx) < hb.hw + F_W / 2 && Math.abs(pos.y + ob.dy - cy) < hb.hh + ob.hh) {
        hitSet.add(o.id);
        if (o.counterT > 0) {
          // countered: attacker eats a reversal hit — 1.3x the blocked hit,
          // with a floor so countering a jab still pays off
          this.events.push({ e: 'counter', x: o.x, y: o.y });
          this._applyHit(o, f, { dmg: Math.max(spec.dmg * 1.3, 7), kb: 260, ks: 18 }, deg(-45), Math.sign(f.x - o.x) || 1);
          continue;
        }
        // launch direction follows the aim (8-way); neutral keeps archetype
        let ang = deg(angDeg), spike = !!spec.spike;
        let dirX = spec.both ? (Math.sign(o.x - f.x) || 1) : f.facing;
        if (a) {
          dirX = a.x || Math.sign(o.x - f.x) || f.facing;
          if (a.y > 0 && !f.grounded) spike = true;          // airborne down attacks spike
          else if (a.y > 0 && a.x) ang = deg(-18);           // grounded down-diag: semi-spike
          else if (a.y < 0 && a.x) ang = deg(-45);           // up-diag: diagonal launch
        }
        // low hits pierce a duck: spikes, dair/dsmash, anything aimed down
        const pierce = spike || !!spec.down || !!spec.both || !!(a && a.y > 0);
        this._applyHit(f, o, spec, ang, dirX, spike, pierce);
      }
    }
    // co-op: the same swing also carves into any creeps it overlaps
    if (this.coop) {
      for (const e of this.enemies) {
        if (e.hp <= 0) continue;
        const key = 'e' + e.eid;
        if (hitSet.has(key)) continue;
        if (Math.abs(e.x - cx) < hb.hw + ENEMY_W / 2 && Math.abs(e.y - cy) < hb.hh + ENEMY_H / 2) {
          hitSet.add(key);
          const dirX = spec.both ? (Math.sign(e.x - f.x) || 1) : (a ? (a.x || f.facing) : f.facing);
          this._hitEnemy(f, e, spec, deg(angDeg), dirX, !!spec.spike);
        }
      }
    }
  }

  _applyHit(att, vic, spec, angRad, dirX, spike = false, pierce = false) {
    let dmg = spec.dmg * att.st.dmgMult;
    if (att.st.augments.includes('berserker') && att.pct >= 80) {
      dmg *= 1.2;
      this.events.push({ e: 'augment', aug: 'berserker', id: att.id, x: att.x, y: att.y });
    }
    if (att.st.augments.includes('sniper') && spec.r) {
      dmg *= 1.2; // projectile hit
      this.events.push({ e: 'augment', aug: 'sniper', id: att.id, x: vic.x, y: vic.y });
    }
    if (att.st.augments.includes('momentum') && !spec.r
        && (att.atkSpd > 320 || Math.hypot(att.vx, att.vy) > 320)) {
      dmg *= 1.15; // fast-moving melee hits harder
      this.events.push({ e: 'augment', aug: 'momentum', id: att.id, x: att.x, y: att.y });
    }
    dmg *= vic.st.dmgTaken;                     // defense stat shaves incoming damage
    vic.lastHitBy = att.id;                     // KO attribution (reaper heal)

    // ducked block: chip damage and a horizontal shove instead of a launch.
    // The guard eats the hit's full raw damage and crushes at zero.
    if (vic.state === 'duck' && !pierce) {
      const raw = dmg;
      dmg *= DUCK_DMG_TAKEN;
      vic.pct = Math.min(999, vic.pct + dmg);
      att.score.dmg += dmg;
      vic.score.taken += dmg;
      if (dmg > att.score.maxHit) att.score.maxHit = dmg;
      const kb = (spec.kb + spec.ks * dmg * (1 + vic.pct / 90))
        * att.st.kbMult * vic.st.kbTaken * DUCK_KB_TAKEN;
      vic.vx = Math.cos(angRad) * kb * dirX;
      if (vic.st.augments.includes('bulwark')) {
        vic.guard -= raw * 0.6;   // bulwark: the guard shrugs off more
        this.events.push({ e: 'augment', aug: 'bulwark', id: vic.id, x: vic.x, y: vic.y });
      } else {
        vic.guard -= raw;
      }
      if (vic.guard <= 0) this._crushGuard(vic);
      this.hitPause = Math.min(0.12, HIT_PAUSE + dmg * 0.004);
      this.events.push({ e: 'block', x: vic.x, y: vic.y - F_H / 2 + DUCK_H / 2, vic: vic.id });
      this.events.push({
        e: 'hit', x: vic.x, y: vic.y, dmg: Math.round(dmg),
        heavy: false, vic: vic.id, att: att.id,
      });
      this._damageHp(vic, dmg, att.id);
      return;
    }

    vic.pct = Math.min(999, vic.pct + dmg);
    att.score.dmg += dmg;
    vic.score.taken += dmg;
    if (dmg > att.score.maxHit) att.score.maxHit = dmg;

    // acrobat: connecting resets your air jumps, enabling aerial chases
    if (att.st.augments.includes('acrobat') && att.jumps < att.st.maxJumps) {
      att.jumps = att.st.maxJumps;
      this.events.push({ e: 'augment', aug: 'acrobat', id: att.id, x: att.x, y: att.y });
    }

    // vampiric heal & second wind
    if (att.st.augments.includes('vampiric')) {
      att.pct = Math.max(0, att.pct - dmg * 0.12);
      this.events.push({ e: 'augment', aug: 'vampiric', id: att.id, x: att.x, y: att.y, vic: vic.id });
    }
    if (vic.st.augments.includes('secondwind') && !vic.usedSecondWind && vic.pct >= 100) {
      vic.usedSecondWind = true;
      vic.pct = Math.max(0, vic.pct - 30);
      this.events.push({ e: 'secondwind', x: vic.x, y: vic.y });
    }
    // thorns recoil (melee only — projectiles have no body contact)
    if (vic.st.augments.includes('thorns') && !spec.r) {
      att.pct = Math.min(999, att.pct + 4);
      this.events.push({ e: 'augment', aug: 'thorns', id: vic.id, x: vic.x, y: vic.y, vic: att.id });
    }

    // smash-style knockback: grows with victim percent
    const doom = att.st.augments.includes('executioner') && vic.pct >= 100;
    if (doom) this.events.push({ e: 'augment', aug: 'executioner', id: att.id, x: vic.x, y: vic.y });
    const kb = (spec.kb + spec.ks * dmg * (1 + vic.pct / 90))
      * att.st.kbMult * vic.st.kbTaken
      * (vic.state === 'crush' ? CRUSH_KB_TAKEN : 1)
      * (doom ? 1.2 : 1);
    const ang = spike ? Math.PI / 2 : angRad;   // spikes send straight down
    vic.vx = Math.cos(ang) * kb * dirX * (spike ? 0.15 : 1);
    vic.vy = Math.sin(ang) * kb;
    vic.grounded = false;
    vic.fastfall = false;
    vic.state = 'hitstun';
    vic.stateT = 0;
    vic.hitstunFor = Math.min(1.1, 0.08 + kb / 2600);
    // stunning hits (spike trap) pin the victim in hitstun for a fixed spell
    // — landing doesn't shake it off, the timer has to run out
    vic.stunned = !!spec.stun;
    if (spec.stun) vic.hitstunFor = Math.max(vic.hitstunFor, spec.stun);
    // burning hits (fireball) set the victim ablaze: a short damage-over-time
    if (spec.dot) vic.burn = { ...spec.dot, tk: spec.dot.every, by: att.id };
    vic.atk = null;
    vic.atkDir = null;
    vic.melee = null;
    vic.atkSpd = 0;
    vic.chg = 0;
    vic.chgAim = null;

    // a landed spike springs the attacker back up with their jumps refreshed,
    // turning a deep off-stage dunk into a recoverable play
    if (spike) {
      att.vy = Math.min(att.vy, -SPIKE_BOUNCE);
      att.grounded = false;
      att.fastfall = false;
      att.jumps = att.st.maxJumps;
      this.events.push({ e: 'spikebounce', id: att.id, x: att.x, y: att.y + F_H / 2 });
    }

    this.hitPause = Math.min(0.12, HIT_PAUSE + dmg * 0.004);
    this.events.push({
      e: 'hit', x: vic.x, y: vic.y, dmg: Math.round(dmg),
      heavy: kb > 700, spike, vic: vic.id, att: att.id,
    });
    this._damageHp(vic, dmg, att.id);
  }

  _stepProjectiles() {
    for (const pr of this.projectiles) {
      if (pr.ret) {
        const was = Math.sign(pr.vx);
        pr.vx += pr.ret * TICK;    // boomerang: decelerate, then return
        // piercing rangs re-arm at the turnaround: out and back both connect
        if (pr.thru && was && Math.sign(pr.vx) !== was) pr.hit.clear();
      }
      if (pr.grav) pr.vy = Math.min(pr.vy + pr.grav * TICK, 1150);  // traps drop until they settle
      pr.x += pr.vx * TICK;
      pr.y += pr.vy * TICK;
      pr.ttl -= TICK;
      if (pr.grav) this._settleTrap(pr);
      else if (pr.plat != null) {
        // settled on a platform: ride it (traps on the crane girder sweep too)
        const pl = this.platsNow()[pr.plat];
        if (pl) { pr.x = pl.x + pr.pox; pr.y = pl.y - 12; }
      }
      const m = this.stage.main;
      if (pr.y > m.y && pr.x > m.x && pr.x < m.x + m.w) pr.ttl = 0;
    }
    this.projectiles = this.projectiles.filter(p => p.ttl > 0);
  }

  // Snap a falling trap onto the first surface under it, then stop pulling.
  _settleTrap(pr) {
    const m = this.stage.main;
    if (pr.x > m.x && pr.x < m.x + m.w && pr.y >= m.y - 12) {
      pr.y = m.y - 12; pr.vy = 0; pr.grav = 0;
      return;
    }
    const plats = this.platsNow();
    for (let i = 0; i < plats.length; i++) {
      const pl = plats[i];
      if (pr.x > pl.x && pr.x < pl.x + pl.w && pr.y >= pl.y - 12 && pr.y <= pl.y + 26) {
        pr.y = pl.y - 12; pr.vy = 0; pr.grav = 0;
        pr.plat = i; pr.pox = pr.x - pl.x;   // remember the perch — it may move
        return;
      }
    }
  }

  // Molten geysers: an erupting vent pops anyone caught in its column —
  // percent, an upward launch and hitstun. Ducking can't block floor fire,
  // but spawn/ledge invulnerability and a short per-fighter burn cooldown
  // keep it from combo-locking. lastHitBy is untouched, so smacking someone
  // into a geyser still earns you the fall it causes.
  _stepHazards() {
    if (!this.stage.hazards) return;
    for (const h of hazardsAt(this.map, this.tick)) {
      if (h.state !== 'erupt') continue;
      const cx = h.x + h.w / 2;
      for (const f of this.fighters) {
        if (f.dead || f.state === 'respawn' || f.state === 'ledge') continue;
        if (f.invuln > 0 || f.burnT > 0) continue;
        if (Math.abs(f.x - cx) > h.w / 2 + F_W / 2 - 8) continue;
        if (f.y - F_H / 2 > h.y || f.y + F_H / 2 < h.y - h.h) continue;
        const dmg = 9 * f.st.dmgTaken;
        f.pct = Math.min(999, f.pct + dmg);
        f.score.taken += dmg;
        f.burnT = 0.8;
        f.vy = -760;
        f.vx = clamp(f.vx + Math.sign(f.x - cx || 1) * 190, -420, 420);
        f.grounded = false;
        f.fastfall = false;
        f.state = 'hitstun';
        f.stateT = 0;
        f.hitstunFor = 0.34;
        f.atk = null; f.atkDir = null; f.melee = null;
        f.atkSpd = 0; f.chg = 0; f.chgAim = null;
        this.events.push({ e: 'burn', x: f.x, y: h.y - 20, vic: f.id, dmg: Math.round(dmg) });
      }
    }
  }

  _checkBlast() {
    const b = this.stage.blast;
    // training room and co-op expeditions are free play: falls respawn
    // everyone, nobody loses a stock, and the match never ends
    const freeplay = this.map === 'training' || this.coop;
    for (const f of this.fighters) {
      if (f.dead || f.state === 'respawn') continue;
      if (f.x < b.l || f.x > b.r || f.y < b.t || f.y > b.b) {
        if (!freeplay) f.stocks--;
        this.events.push({ e: 'ko', x: clamp(f.x, b.l, b.r), y: clamp(f.y, b.t, b.b), id: f.id, stocks: f.stocks });
        // podium stats: the last hitter gets the KO; nobody means an SD
        const credit = f.lastHitBy ? this.fighters.find(k => k.id === f.lastHitBy) : null;
        f.score.fall++;
        if (credit) credit.score.ko++; else f.score.sd++;
        // reaper: whoever landed the last hit drinks deep on the KO
        if (credit && !credit.dead && credit.st.augments.includes('reaper')) {
          credit.pct = Math.max(0, credit.pct - 25);
          this.events.push({ e: 'augment', aug: 'reaper', id: credit.id, x: credit.x, y: credit.y });
        }
        f.lastHitBy = null;
        const hadTryBuild = !!f.tryBuild;
        if (!freeplay && f.stocks <= 0) {
          f.dead = true;
          f.state = 'dead';
          if (hadTryBuild) this.clearTryBuild(f.id);
        } else {
          if (hadTryBuild) this.clearTryBuild(f.id);
          f.x = this.stage.spawns[this.fighters.indexOf(f) % this.stage.spawns.length];
          f.y = this.stage.respawnY;
          f.vx = 0; f.vy = 0;
          f.pct = 0;
          f.guard = GUARD_MAX; f.standT = 0;
          f.usedSecondWind = false;
          f.state = 'respawn';
          f.stateT = 0;
          f.invuln = RESPAWN_INVULN;
          f.jumps = f.st.maxJumps;
          f.melee = null;
          f.burn = null;
          f.stunned = false;
        }
      }
    }
  }

  // ---------- co-op health & respawns ----------

  // Take a chunk out of a co-op fighter's health, attributing the blow for
  // KO credit. Zero drops them: they go down and revive after a spell.
  _damageHp(vic, dmg, attId) {
    if (!this.coop || vic.dead) return;
    if (attId) vic.lastHitBy = attId;
    vic.hp -= dmg;
    if (vic.hp <= 0) this._downFighter(vic);
  }

  // Down a fighter: they crumple and lie dead until the revive timer runs out,
  // then reappear with the group. Infinite lives — the expedition rolls on.
  _downFighter(f) {
    if (f.dead) return;
    f.hp = 0;
    f.dead = true;
    f.state = 'dead';
    f.stateT = 0;
    f.downT = COOP_DOWN_TIME;
    f.vx = 0; f.vy = 0;
    f.atk = null; f.atkDir = null; f.melee = null; f.chg = 0; f.chgAim = null;
    f.burn = null; f.stunned = false;
    f.score.fall++;
    const credit = f.lastHitBy ? this.fighters.find(k => k.id === f.lastHitBy && k !== f) : null;
    if (credit) credit.score.ko++; else f.score.sd++;
    f.lastHitBy = null;
    this.events.push({ e: 'ko', x: f.x, y: f.y, id: f.id, stocks: 1 });
  }

  _stepCoop() {
    for (const f of this.fighters) {
      if (!f.dead || f.parked || f.downT <= 0) continue;
      f.downT -= TICK;
      if (f.downT <= 0) this._respawnCoop(f);
    }
  }

  // Revive a downed fighter above the surviving group (or where they fell if
  // they're alone), descending like a fresh spawn with a beat of invulnerability.
  _respawnCoop(f) {
    const live = this.fighters.filter(o => o !== f && !o.dead && !o.parked);
    const cx = live.length ? live.reduce((s, o) => s + o.x, 0) / live.length : f.x;
    f.dead = false;
    f.downT = 0;
    f.x = cx + (this.rng() * 160 - 80);
    f.y = this.stage.respawnY;
    f.vx = 0; f.vy = 0;
    f.grounded = false;
    f.hp = f.maxHp;
    f.pct = 0;
    f.guard = GUARD_MAX; f.standT = 0;
    f.usedSecondWind = false;
    f.state = 'respawn';
    f.stateT = 0;
    f.invuln = RESPAWN_INVULN;
    f.jumps = f.st.maxJumps;
    f.burn = null;
    f.stunned = false;
  }

  // ---------- co-op enemies (stub creeps) ----------

  _stepEnemies() {
    const live = this.fighters.filter(f => !f.dead && !f.parked);

    // trickle new creeps in from just off the group's edges
    this.enemySpawnT -= TICK;
    if (live.length && this.enemySpawnT <= 0 && this.enemies.length < ENEMY_MAX) {
      this.enemySpawnT = ENEMY_SPAWN_EVERY;
      this._spawnEnemy(live);
    }

    const floor = this.stage.main.y;
    for (const e of this.enemies) {
      e.vy = Math.min(MAX_FALL, e.vy + GRAV * TICK);
      // shamble toward the nearest fighter
      const tgt = this._nearestPlayer(e, live);
      const desired = tgt ? Math.sign(tgt.x - e.x) * ENEMY_SPEED : 0;
      if (tgt) e.facing = Math.sign(tgt.x - e.x) || e.facing;
      e.vx = approach(e.vx, desired, ENEMY_ACCEL * TICK);
      e.x += e.vx * TICK;
      e.y += e.vy * TICK;
      if (e.y + ENEMY_H / 2 >= floor) { e.y = floor - ENEMY_H / 2; e.vy = 0; e.grounded = true; }
      else e.grounded = false;
      if (e.touchCd > 0) e.touchCd -= TICK;
      if (e.hurt > 0) e.hurt -= TICK;
      if (e.burn) this._burnEnemy(e);

      // bump any fighter it's overlapping (its whole attack)
      if (e.touchCd <= 0) {
        for (const f of live) {
          if (f.invuln > 0) continue;
          const ob = hurtBox(f);
          if (Math.abs(f.x - e.x) < ENEMY_W / 2 + F_W / 2 && Math.abs((f.y + ob.dy) - e.y) < ENEMY_H / 2 + ob.hh) {
            e.touchCd = ENEMY_TOUCH_CD;
            const dir = Math.sign(f.x - e.x) || 1;
            f.vx += dir * 280; f.vy = Math.min(f.vy, -240); f.grounded = false;
            f.state = 'hitstun'; f.stateT = 0; f.hitstunFor = 0.28;
            f.atk = null; f.atkDir = null; f.melee = null; f.chg = 0;
            this.events.push({ e: 'hit', x: f.x, y: f.y, dmg: ENEMY_TOUCH_DMG, heavy: false, vic: f.id, att: 'e' + e.eid });
            this._damageHp(f, ENEMY_TOUCH_DMG, 'e' + e.eid);
            break;
          }
        }
      }
    }

    // cull the dead and any creep that fell too far behind the group
    const cx = live.length ? live.reduce((s, f) => s + f.x, 0) / live.length : 0;
    this.enemies = this.enemies.filter(e => e.hp > 0 && Math.abs(e.x - cx) < ENEMY_DESPAWN);
  }

  _spawnEnemy(live) {
    const cx = live.reduce((s, f) => s + f.x, 0) / live.length;
    const side = this.rng() < 0.5 ? -1 : 1;
    this.enemies.push({
      eid: nextEid++,
      x: cx + side * (720 + this.rng() * 260),
      y: this.stage.main.y - ENEMY_H / 2,
      vx: 0, vy: 0, hp: ENEMY_HP, maxHp: ENEMY_HP,
      facing: -side, grounded: true, touchCd: 0, hurt: 0,
    });
  }

  _nearestPlayer(e, live) {
    let best = null, bd = Infinity;
    for (const f of live) {
      const d = Math.abs(f.x - e.x);
      if (d < bd) { bd = d; best = f; }
    }
    return best;
  }

  // A fighter's blow lands on a creep: chip its HP, knock it back, and pay the
  // attacker in score (which is what mints expedition credits).
  _hitEnemy(att, e, spec, angRad, dirX, spike) {
    let dmg = spec.dmg * att.st.dmgMult;
    if (spec.r && att.st.augments.includes('sniper')) dmg *= 1.2;
    e.hp -= dmg;
    e.hurt = 0.14;
    att.score.dmg += dmg;
    if (dmg > att.score.maxHit) att.score.maxHit = dmg;
    // fireball and friends set creeps alight: a short damage-over-time
    if (spec.dot && e.hp > 0) e.burn = { ...spec.dot, tk: spec.dot.every, by: att.id };
    const kb = (spec.kb + spec.ks * dmg) * att.st.kbMult * ENEMY_KB;
    const ang = spike ? Math.PI / 2 : angRad;
    e.vx = Math.cos(ang) * kb * dirX * (spike ? 0.3 : 1);
    e.vy = Math.sin(ang) * kb;
    if (e.vy < 0) e.grounded = false;
    // vampiric bites heal the striker — the only sustain out on the road
    if (att.st.augments.includes('vampiric')) att.hp = Math.min(att.maxHp, att.hp + dmg * 0.12);
    this.hitPause = Math.min(0.12, HIT_PAUSE + dmg * 0.004);
    this.events.push({ e: 'hit', x: e.x, y: e.y, dmg: Math.round(dmg), heavy: kb > 700, vic: 'e' + e.eid, att: att.id });
    if (e.hp <= 0) this._killEnemy(e, att);
  }

  // Afterburn tick on a creep — small damage on an interval, credited to
  // whoever lit it (so the burn still mints credits, and can land the kill).
  _burnEnemy(e) {
    e.burn.tk -= TICK;
    if (e.burn.tk > 0) return;
    e.burn.tk += e.burn.every;
    const att = this.fighters.find(x => x.id === e.burn.by);
    const dmg = e.burn.dmg;
    e.hp -= dmg;
    e.hurt = 0.1;
    if (att) { att.score.dmg += dmg; }
    this.events.push({ e: 'burn', x: e.x, y: e.y - ENEMY_H / 2 - 6, vic: 'e' + e.eid, dmg: Math.round(dmg) });
    if (--e.burn.n <= 0) e.burn = null;
    if (e.hp <= 0 && att) this._killEnemy(e, att);
    else if (e.hp <= 0) { e.hp = 0; this.events.push({ e: 'enemyko', x: e.x, y: e.y, id: 'e' + e.eid }); }
  }

  _killEnemy(e, att) {
    e.hp = 0;
    att.score.ko++;
    if (att.st.augments.includes('reaper')) att.hp = Math.min(att.maxHp, att.hp + att.maxHp * 0.12);
    this.events.push({ e: 'enemyko', x: e.x, y: e.y, id: 'e' + e.eid });
  }

  // ---------- practice bot ----------

  _botThink(f) {
    const inp = this.inputs.get(f.id);
    const target = this.fighters.find(o => o.id !== f.id && !o.dead);
    if (!target) return;
    if (f.state === 'ledge') {
      // hang a beat, then climb: usually the super jump, sometimes the roll
      if (f.stateT > 0.5) {
        if (this.rng() < 0.10) inp.jump = true;
        else if (this.rng() < 0.06) inp.atk = { kind: 'tap' };
      }
      return;
    }
    const dx = target.x - f.x, dy = target.y - f.y;
    const offstage = f.x < this.stage.main.x || f.x > this.stage.main.x + this.stage.main.w;

    inp.mx = 0; inp.my = 0;
    if (offstage) {
      // recover toward stage center
      inp.mx = f.x < 0 ? 1 : -1;
      if (f.vy > 100 && f.jumps > 0 && this.rng() < 0.25) inp.jump = true;
    } else {
      if (Math.abs(dx) > 60) inp.mx = Math.sign(dx) * (0.6 + 0.4 * this.rng());
      if (dy < -90 && f.grounded && this.rng() < 0.06) inp.jump = true;
      if (Math.abs(dx) < 85 && Math.abs(dy) < 70 && this.rng() < 0.10) {
        inp.atk = this.rng() < 0.55 ? { kind: 'tap', dx: 0, dy: 0 }
          : this.rng() < 0.5 ? { kind: 'swipe', dx: Math.sign(dx) || 1, dy: 0 }
          : { kind: 'swipe', dx: 0, dy: dy < -30 ? -1 : 1 };
      }
      if (f.pct > 70 && this.rng() < 0.02) inp.ab0 = true;
      // duck under a nearby swing; keep holding until the threat passes
      const threat = target.state === 'attack' && Math.abs(dx) < 140 && Math.abs(dy) < 60;
      if (f.grounded && threat
          && (f.state === 'duck' || (f.guard > 40 && this.rng() < 0.25))) {
        inp.mx = 0; inp.my = 1;
        inp.atk = null; inp.jump = false;
      }
    }
    // a vent telegraphing underfoot outranks everything: clear the grate
    if (f.grounded) {
      for (const h of hazardsAt(this.map, this.tick)) {
        if (h.state === 'idle') continue;
        const cx = h.x + h.w / 2;
        if (Math.abs(f.x - cx) < h.w / 2 + 60) { inp.mx = f.x < cx ? -1 : 1; inp.my = 0; }
      }
    }
  }

  // ---------- client-side prediction ----------

  // Step ONLY the given fighter — movement, ledges, attack states — with no
  // combat resolution, projectiles, or KOs. Clients run this on a local
  // mirror sim so their own fighter responds instantly; the host stays
  // authoritative and corrections arrive via snapshots + reconciliation.
  predictStep(id) {
    this.events.length = 0;
    if (this.over) return this.events;
    this.tick++;
    const f = this.fighters.find(x => x.id === id);
    if (f && !f.dead) this._stepFighter(f, this.inputs.get(id));
    return this.events;
  }

  // ---------- snapshots (host <-> clients) ----------

  snapshot() {
    return {
      tk: this.tick,
      over: this.over,
      win: this.winner ? this.winner.id : null,
      map: this.map,
      f: this.fighters.map(f => {
        const hb = this.hitboxFor(f);
        return [
          f.id, r1(f.x), r1(f.y), r1(f.vx), r1(f.vy), f.facing,
          r1(f.pct), f.stocks, f.state, f.dead ? 1 : 0,
          f.invuln > 0 ? 1 : 0, f.atk || '', r1(f.cds[0]), r1(f.cds[1]),
          hb ? [r1(hb.dx), r1(hb.dy), hb.hw, hb.hh, hb.active ? 1 : 0, r2(hb.chg || 0)] : 0,
          // Appended for client prediction/reconciliation + host handoff:
          f.grounded ? 1 : 0, f.jumps, r2(f.stateT), f.ledge,
          r2(f.regrabT), f.rollDir, r2(f.invuln), r2(f.dropT),
          f.fastfall ? 1 : 0, r2(f.dashT), r2(f.counterT),
          f.atkDir ? f.atkDir.x : 0, f.atkDir ? f.atkDir.y : 0,
          r1(f.guard), r2(f.standT), r2(f.chg), r2(f.riseT), f.lastHitBy || 0,
          f.ridePlat == null ? -1 : f.ridePlat,
          [f.score.ko, f.score.fall, f.score.sd, r1(f.score.dmg), r1(f.score.taken), r1(f.score.maxHit)],
          r2(f.burnT),
          r2(f.slideT),
          f.parked ? 1 : 0,
          r1(f.mana),
          r2(f.hitstunFor || 0),
          f.stunned ? 1 : 0,
          r2(f.ffLockT),
          r1(f.hp), f.maxHp, r2(f.downT),   // co-op health (indices 42,43,44)
        ];
      }),
      p: this.projectiles.map(p => [p.eid, p.kind, r1(p.x), r1(p.y), r1(p.vx), r1(p.r || 0)]),
      en: this.enemies.map(e => [e.eid, r1(e.x), r1(e.y), r1(e.hp), e.maxHp, e.facing, e.hurt > 0 ? 1 : 0]),
      ev: this.events.slice(),
    };
  }
}

// Rebuild a live sim from the last snapshot a peer saw — used when the host
// drops mid-fight and the elected successor takes over the simulation.
export function gameFromSnapshot(players, snap, seed = 2) {
  const g = new Game(players, seed, snap?.map || DEFAULT_MAP);
  if (!snap) return g;
  g.tick = snap.tk || 0;
  for (const row of snap.f || []) {
    const f = g.fighters.find(x => x.id === row[0]);
    if (!f) continue;
    restoreFighter(f, row);
  }
  // carry the creeps over so a host handoff doesn't blink the swarm away
  g.enemies = (snap.en || []).map(r => ({
    eid: r[0], x: r[1], y: r[2], vx: 0, vy: 0, hp: r[3], maxHp: r[4] || ENEMY_HP,
    facing: r[5] || 1, grounded: true, touchCd: 0, hurt: 0,
  }));
  return g;
}

// Overwrite a fighter with an authoritative snapshot row. Used by clients
// before replaying unacked inputs (reconciliation) and by host handoff.
export function restoreFighter(f, row) {
  [, f.x, f.y, f.vx, f.vy, f.facing] = row;
  f.pct = row[6]; f.stocks = row[7];
  f.dead = !!row[9];
  f.atk = row[11] || null;
  f.cds = [row[12] || 0, row[13] || 0];
  if (row.length > 15) {
    f.state = row[8];
    f.grounded = !!row[15]; f.jumps = row[16] | 0;
    f.stateT = row[17] || 0; f.ledge = row[18] || 0;
    f.regrabT = row[19] || 0; f.rollDir = row[20] || 0;
    f.invuln = row[21] || 0; f.dropT = row[22] || 0;
    f.fastfall = !!row[23]; f.dashT = row[24] || 0; f.counterT = row[25] || 0;
    f.atkDir = (row[26] || row[27]) ? { x: row[26] | 0, y: row[27] | 0 } : null;
    if (row.length > 28) { f.guard = row[28]; f.standT = row[29] || 0; }
    f.chg = row[30] || 0;
    f.riseT = row[31] || 0;
    f.lastHitBy = row[32] || null;
    f.ridePlat = (row[33] ?? -1) >= 0 ? row[33] : null;
    f.chgAim = f.state === 'charge' ? { dx: row[26] | 0, dy: row[27] | 0 } : null;
    const sc = row[34];
    if (sc) f.score = { ko: sc[0] | 0, fall: sc[1] | 0, sd: sc[2] | 0, dmg: +sc[3] || 0, taken: +sc[4] || 0, maxHit: +sc[5] || 0 };
    f.burnT = +row[35] || 0;
    f.slideT = +row[36] || 0;
    f.parked = !!row[37];
    if (row.length > 38) f.mana = +row[38] || 0;
    if (row.length > 39) f.hitstunFor = +row[39] || 0;
    if (row.length > 40) f.stunned = !!row[40];
    if (row.length > 41) f.ffLockT = +row[41] || 0;
    if (row.length > 43) { f.hp = +row[42] || 0; f.maxHp = +row[43] || f.maxHp; f.downT = +row[44] || 0; }
  } else {
    // Old-format row: mid-swing/hitstun details aren't included; resuming
    // in a neutral state costs at most a dropped attack frame.
    f.state = f.dead ? 'dead' : 'air';
    f.grounded = false;
  }
  if (f.atk && f.state !== 'attack' && f.state !== 'charge') f.atk = null;
  // a move this build doesn't know (newer peer): drop to neutral, not crash
  if (f.atk && !ATTACKS[f.atk]) {
    f.atk = null;
    f.state = f.grounded ? 'idle' : 'air';
  }
  if (!f.atk) { f.atkDir = null; f.lowJab = false; f.chg = 0; f.chgAim = null; }
}

export function blankInput() {
  return {
    mx: 0, my: 0, jump: false, ff: false, drop: false, atk: null, roll: 0,
    ab0: false, ab1: false, bufJ: 0, bufA: 0, buf0: 0, buf1: 0, bufR: 0,
    chg: null,      // {dx,dy} while the strong-attack control is held
    chgArm: true,   // must see a release before the next charge can start
  };
}

// ---------- helpers ----------

// Axis-aligned melee hitbox for a spec, as offsets from the fighter's center
// plus half-extents. Shared by combat resolution and the renderer so the
// hitbox players see is exactly the one the sim tests. An 8-way aim places
// the box along that direction; 'both' boxes stay centered on the fighter.
export function meleeHitbox(f, spec, aim = null) {
  if (f.lowJab) {
    return {
      dx: f.facing * (F_W / 2 + spec.rx / 2 + 10),
      dy: (F_H - DUCK_H) / 2,
      hw: spec.rx / 2 + 14,
      hh: spec.ry,
    };
  }
  // blade weapons: the box is the blade itself — long and thin, run out
  // along the aim from the body's edge (rx = blade length, ry = half-
  // thickness). Axis-aligned like every other box, so a diagonal cut
  // approximates as a square laid along the diagonal.
  if (spec.blade) {
    const dir = aim && (aim.x || aim.y) ? aim : { x: f.facing || 1, y: 0 };
    const n = Math.hypot(dir.x, dir.y);
    const nx = dir.x / n, ny = dir.y / n;
    const hl = spec.rx / 2;                    // half the blade's length
    return {
      dx: nx * (F_W / 2 + hl),
      dy: ny * (F_H / 2 + hl),
      hw: Math.abs(nx) * hl + spec.ry,
      hh: Math.abs(ny) * hl + spec.ry,
      blade: true,
    };
  }
  // spear: the same long-thin-box-along-the-aim as a blade, but with a
  // dead zone carved out of the near end (gap) — the box runs from
  // gap..rx out from the body's edge instead of 0..rx, so a target
  // standing inside the gap simply isn't there yet.
  if (spec.spear) {
    const dir = aim && (aim.x || aim.y) ? aim : { x: f.facing || 1, y: 0 };
    const n = Math.hypot(dir.x, dir.y);
    const nx = dir.x / n, ny = dir.y / n;
    const mid = (spec.gap + spec.rx) / 2;      // center of the live segment
    const hl = (spec.rx - spec.gap) / 2;       // half-length of the live segment
    return {
      dx: nx * (F_W / 2 + mid),
      dy: ny * (F_H / 2 + mid),
      hw: Math.abs(nx) * hl + spec.ry,
      hh: Math.abs(ny) * hl + spec.ry,
      spear: true,
    };
  }
  const a = !spec.both && aim && (aim.x || aim.y) ? aim : null;
  if (a) {
    const n = Math.hypot(a.x, a.y);
    return {
      dx: (a.x / n) * (F_W / 2 + spec.rx / 2),
      dy: (a.y / n) * (F_H / 2 + spec.ry / 2),
      hw: spec.rx / 2 + 14,
      hh: spec.ry,
    };
  }
  return {
    dx: spec.both || spec.up || spec.down ? 0 : f.facing * (F_W / 2 + spec.rx / 2),
    dy: spec.up ? -F_H / 2 - spec.ry / 2 : spec.down ? F_H / 2 + spec.ry / 2 : 0,
    hw: spec.both ? spec.rx : spec.rx / 2 + 14,
    hh: spec.ry,
  };
}

// Ducking tucks the fighter into a shorter box that stays planted on the
// ground: half-height shrinks and the center shifts down so jabs and
// forward smashes whiff over a ducked head. Standing boxes are unchanged.
function hurtBox(f) {
  if (f.state === 'duck') return { dy: (F_H - DUCK_H) / 2, hh: DUCK_H / 2 };
  return { dy: 0, hh: F_H / 2 };
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function approach(v, target, amt) {
  return v < target ? Math.min(target, v + amt) : Math.max(target, v - amt);
}
function deg(d) { return d * Math.PI / 180; }
function r1(v) { return Math.round(v * 10) / 10; }
function r2(v) { return Math.round(v * 100) / 100; }
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
