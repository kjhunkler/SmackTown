// Fight simulation. Host-authoritative: the host steps this at 60 Hz using
// everyone's latest inputs and broadcasts snapshots; clients interpolate.
// All tuning constants live here so host handoff resumes identical rules.

import { derivedStats, buildCost, emptyBuild, STATS, WEAPONS, ABILITIES, AUGMENTS } from './profile.js';

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
  // Homage to the sprawling Melee temple: by far the biggest arena in the
  // rotation. An asymmetric ruin — grand west terraces stacked two tiers
  // high, a broken east hall, fallen-column stepping stones, and one apex
  // sky bridge over the middle. Every step is single-jumpable from the
  // tier below it (≤150u); the columns want a double jump from the ground.
  temple: {
    name: 'Ancient Temple',
    main: { x: -920, y: 0, w: 1840, h: 46 },             // vast temple foundation
    plats: [
      { x: -840, y: -150, w: 400 },                      // west terrace
      { x: -750, y: -300, w: 290 },                      // upper-west plateau
      { x: -320, y: -230, w: 180 },                      // fallen column (west)
      { x: -430, y: -420, w: 340 },                      // apex sky bridge
      { x: 170,  y: -230, w: 180 },                      // fallen column (east)
      { x: 440,  y: -150, w: 380 },                      // east hall floor
      { x: 600,  y: -300, w: 230 },                      // upper-east ruin ledge
    ],
    blast: { l: -2050, r: 2050, t: -1250, b: 560 },
    spawns: [ -640, 640, -220, 220 ],
    respawnY: -360,
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
export const EXPANSE_BIOMES = ['battlefield', 'flatlands', 'skyline', 'ruins', 'foundry', 'garden'];
const EXPANSE_BIOME_LENGTH = 3600;
const EXPANSE_BIOME_BLEND = 700;

// Deterministic expedition regions. Each run rotates the six PvP looks from a
// seed-derived starting point, and the edge of a region blends into the next.
export function expanseBiomeAt(seed, x) {
  const region = Math.floor(x / EXPANSE_BIOME_LENGTH);
  const offset = (seed >>> 0) % EXPANSE_BIOMES.length;
  const index = ((region + offset) % EXPANSE_BIOMES.length + EXPANSE_BIOMES.length) % EXPANSE_BIOMES.length;
  const next = (index + 1) % EXPANSE_BIOMES.length;
  const local = ((x % EXPANSE_BIOME_LENGTH) + EXPANSE_BIOME_LENGTH) % EXPANSE_BIOME_LENGTH;
  const blend = local > EXPANSE_BIOME_LENGTH - EXPANSE_BIOME_BLEND
    ? (local - (EXPANSE_BIOME_LENGTH - EXPANSE_BIOME_BLEND)) / EXPANSE_BIOME_BLEND : 0;
  return { id: EXPANSE_BIOMES[index], next: EXPANSE_BIOMES[next], blend, region, local };
}

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
const FALL_GRAV = 1.35;              // gravity multiplier on descent — rise unchanged, so jump heights hold
const RUN = 380, AIR_ACCEL = 1450, GROUND_ACCEL = 3400, FRICTION = 3400;
const TURN_ACCEL = 2.2;              // ground accel multiplier while reversing a run
const CHARGE_FRICTION = 0.4;         // charging holds momentum: 40% of normal ground friction
const JUMP_V = 860, JUMP2_V = 780;
// Variable jump height: letting go of the jump control mid-rise trims the
// remaining ascent, so a tap hops and a hold soars. The release arrives as a
// level input flag (jr); anything that never sends it (bots, old peers) keeps
// full-height jumps. Near the arc's top gravity eases off for a beat of hang
// time — never in hitstun, so launch knockback keeps its exact physics.
const JUMP_CUT = 0.45;               // fraction of the remaining rise kept on release
const JUMP_CUT_GRACE = 0.08;         // liftoff seconds before a release can cut
const APEX_GRAV = 0.75;              // gravity multiplier through the apex band
const APEX_BAND = 130;               // |vy| below this counts as the apex
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
// Co-op creeps come in a handful of flavors. Gameplay stats live here and are
// shared with the renderer (for size + color); behavior lives in _stepEnemies.
// Tuned to stay approachable: modest damage, readable telegraphs, gentle ramp.
// Touching a creep is harmless — every attack is telegraphed: the creep
// plants for `windup` seconds (the renderer pulses a ring), then swings a
// `reach`-length strike ahead of its locked facing. Step out or hit it to
// cancel; only what's still in front when it swings gets hurt.
//   w/h      hurtbox size            dmg      strike damage
//   speed    chase speed             kbTaken  how far our hits fling it
//   touchKb  shove dealt by a strike   fly/jump/ranged  behavior flags
//   reach    strike range            windup/atkCd  telegraph & cooldown
export const ENEMY_TYPES = {
  grunt:   { hp: 9,  speed: 150, accel: 900,  w: 44, h: 52, dmg: 3, kbTaken: 0.60, touchKb: 280, color: '#c94f6d', reach: 54, windup: 0.42, atkCd: 1.5 },
  runner:  { hp: 5,  speed: 290, accel: 1600, w: 34, h: 38, dmg: 2, kbTaken: 0.95, touchKb: 175, color: '#e8a33d', reach: 46, windup: 0.28, atkCd: 1.1 },
  brute:   { hp: 29, speed: 90,  accel: 620,  w: 66, h: 74, dmg: 5, kbTaken: 0.26, touchKb: 470, color: '#8a56d6', reach: 84, windup: 0.70, atkCd: 2.4 },
  hopper:  { hp: 8,  speed: 155, accel: 980,  w: 42, h: 44, dmg: 3, kbTaken: 0.62, touchKb: 240, color: '#3dc98f', reach: 52, windup: 0.38, atkCd: 1.5, jump: true },
  flyer:   { hp: 6,  speed: 170, accel: 720,  w: 40, h: 38, dmg: 3, kbTaken: 0.72, touchKb: 260, color: '#4fb0e8', reach: 48, windup: 0.45, atkCd: 1.9, fly: true },
  slinger: { hp: 7,  speed: 120, accel: 820,  w: 42, h: 48, dmg: 2, kbTaken: 0.72, touchKb: 230, color: '#d94fb0',
             ranged: true, shotDmg: 3, shotSpd: 360, range: 440, windup: 0.85, atkCd: 2.6 },
  // Bosses: huge road-blocking creeps with three telegraphed attacks each
  // (picked in _bossTelegraph, resolved in _bossAttack). They shrug off
  // stagger, ignore crowd rules, and burst into hearts when they fall.
  colossus: { hp: 150, speed: 74,  accel: 520, w: 132, h: 150, dmg: 7, kbTaken: 0.08, touchKb: 560, color: '#a08d76',
              boss: true, reach: 120, windup: 0.85, atkCd: 2.6 },
  tempest:  { hp: 110, speed: 205, accel: 660, w: 118, h: 104, dmg: 5, kbTaken: 0.12, touchKb: 430, color: '#7ec4ec',
              boss: true, fly: true, reach: 100, windup: 0.75, atkCd: 2.4 },
  warlock:  { hp: 120, speed: 95,  accel: 620, w: 108, h: 138, dmg: 5, kbTaken: 0.12, touchKb: 390, color: '#e88a4f',
              boss: true, ranged: true, range: 560, shotDmg: 4, shotSpd: 430, reach: 96, windup: 0.9, atkCd: 2.8 },
};

// Expedition flavor: player hits send creeps flying at a ridiculous scale —
// smacking a grunt should genuinely mean "Town" — but the brute and every
// boss barely budge, so the roster keeps a "the big ones stand their ground"
// identity instead of everything flopping the same way. Stacks on top of
// each type's existing kbTaken. Applied only where players hit creeps
// (_hitEnemy is the single choke point every such hit funnels through).
const PVE_KB_BOOST = {
  grunt: 4.5, runner: 4.5, hopper: 4.5, flyer: 4.5, slinger: 4.5,
  brute: 1.5,
  colossus: 1.1, tempest: 1.1, warlock: 1.1,
};

// Three escalating variations per boss type. Which tier shows up follows the
// difficulty level at the encounter, so late runs meet the nastier cousins.
export const BOSS_KINDS = ['colossus', 'tempest', 'warlock'];
export const BOSS_VARIANTS = {
  colossus: [
    { name: 'Stone Colossus', color: '#a08d76', hp: 1.0,  dmg: 1.0,  spd: 1.0 },
    { name: 'Iron Colossus',  color: '#93a1c4', hp: 1.4,  dmg: 1.2,  spd: 1.12 },
    { name: 'Magma Colossus', color: '#e8663a', hp: 1.8,  dmg: 1.45, spd: 1.22 },
  ],
  tempest: [
    { name: 'Gale Tempest',  color: '#7ec4ec', hp: 1.0,  dmg: 1.0,  spd: 1.0 },
    { name: 'Storm Tempest', color: '#5b8fe8', hp: 1.4,  dmg: 1.2,  spd: 1.12 },
    { name: 'Void Tempest',  color: '#8a5fd6', hp: 1.8,  dmg: 1.45, spd: 1.22 },
  ],
  warlock: [
    { name: 'Ember Warlock', color: '#e88a4f', hp: 1.0,  dmg: 1.0,  spd: 1.0 },
    { name: 'Hex Warlock',   color: '#c44fe8', hp: 1.4,  dmg: 1.2,  spd: 1.12 },
    { name: 'Doom Warlock',  color: '#e84f6a', hp: 1.8,  dmg: 1.45, spd: 1.22 },
  ],
};
// Per-type attack telegraphs (seconds of windup per attack index). Index 3
// is each boss's signature: a rare, screen-spanning set piece (see
// _bossTelegraphSignature) — its long windup is the whole point, showing
// every strike point up front so surviving it is about reading and moving,
// not reacting.
export const BOSS_ATTACKS = {
  colossus: [0.85, 1.15, 0.9, 1.7],   // 0 slam · 1 stomp · 2 charge · 3 meteor slam
  tempest:  [0.7, 0.95, 0.9, 1.6],    // 0 talon · 1 dive · 2 volley · 3 lightning storm
  warlock:  [0.9, 1.25, 0.95, 1.8],   // 0 bolt burst · 1 eruption · 2 nova · 3 arcane laser
};
export const BOSS_SIG_NAMES = { colossus: 'Meteor Slam', tempest: 'Lightning Storm', warlock: 'Arcane Laser' };
const BOSS_SIG_CD = 13;         // minimum seconds between a boss's signature attacks
const BOSS_SIG_CHANCE = 0.4;    // odds a ready-and-off-cooldown boss opts for it
const BOSS_REGION_EVERY = 3;         // a boss bars the road every Nth biome region
const BOSS_SPAWN_SLOW = 5.0;         // trickle spawn cadence floor while a boss lives
const BOSS_HEARTS = 10;              // defeat fireworks: hearts flung in all directions
const ENEMY_HIT_MERCY = 0.55;        // post-hit invulnerability so a swarm can't chain-stun
const LOOT_HEAL_FRACTION = 0.5;      // "Patch Up" loot card: heal half of max HP
export const LOOT_CR_BONUS = 200;    // "Windfall" loot card: CR straight into the wallet
const EXPEDITION_START_CR = 160;     // co-op wallet balance at the start of a run
const ENEMY_SEP_PUSH = 300;          // max px/s creeps shoulder each other apart (beats any chase speed)
const ENEMY_SEP_GAP = 0.9;           // fraction of summed half-widths creeps keep between centers
const ENEMY_DESPAWN = 2700;          // cull creeps this far behind the group
const ENEMY_RECYCLE_BEHIND = 1200;   // recycle stragglers ahead of the forward-only party
const ENEMY_BASE_MAX = 14;           // living creeps at once at difficulty 0
const ENEMY_MAX_CAP = 36;            // hard ceiling: large swarm, still practical for browser hosts
const ENEMY_GRID_CELL = 160;         // horizontal broad-phase cell width
const ENEMY_KIND_IDS = ['grunt', 'runner', 'brute', 'hopper', 'flyer', 'slinger', 'colossus', 'tempest', 'warlock'];
const ENEMY_TEMPERAMENTS = ['bold', 'cautious', 'vengeful', 'pack'];
const BIOME_ENEMY_WEIGHTS = {
  battlefield: { flyer: 1, hopper: 1 },
  flatlands: { runner: 3, hopper: 2 },
  skyline: { flyer: 3, slinger: 3 },
  ruins: { grunt: 2, brute: 2 },
  foundry: { brute: 3, slinger: 1 },
  garden: { hopper: 3, runner: 1 },
};
const BIOME_PATROLS = {
  battlefield: ['flyer', 'hopper', 'grunt'],
  flatlands: ['runner', 'runner', 'hopper'],
  skyline: ['flyer', 'slinger', 'flyer'],
  ruins: ['brute', 'grunt', 'grunt'],
  foundry: ['brute', 'slinger', 'grunt'],
  garden: ['hopper', 'hopper', 'runner'],
};
const ENEMY_BASE_SPAWN = 1.8;        // seconds between spawns at difficulty 0
const ENEMY_MIN_SPAWN = 0.9;         // fastest spawn cadence at high difficulty
const ENEMY_SPAWN_RAMP = 0.12;       // cadence seconds shaved per difficulty tier
const ENEMY_CAP_PER_LEVEL = 2;       // additional living creeps per difficulty tier
const DIFF_STEP = 24;                // run seconds per difficulty tier
const PARK_SPAWN_GRACE = 1.5;        // spawn breather after the whole party returns from the lobby
// Percent-keyed augments have no percent to read in co-op, so they retarget
// onto HP: Berserker rages while the striker is badly hurt, Executioner
// finishes creeps that are nearly dead. Both fire at/below a third HP.
const COOP_BERSERK_HP = 0.33;        // attacker HP fraction for the rage bonus
const COOP_EXEC_HP = 0.33;           // creep HP fraction for the execute bonus

// Heart pickups: a rare drop that heals the whole nearby party a little, so
// staying grouped pays off. They flash before fading.
const HEART_DROP_CHANCE = 0.10;
const HEART_HEAL = 10;
const HEART_AOE = 180;
export const HEART_LIFE = 9;         // seconds a dropped heart lingers
const HIT_PAUSE = 0.045;
const BUFFER = 0.15;                 // edge-input buffer window (s)

// Ducking: hold down while grounded to squat behind a guard. Straight
// projectiles sail clean over a ducked head; melee that connects deals
// chip damage and a shove instead of a launch, but the guard meter
// drains while held and eats the full raw damage of every blocked hit.
// At zero the guard crushes: a crumple stun that takes bonus knockback.
// Down-aimed attacks (dair/dsmash/spikes/aimed-down) pierce the duck.
const DUCK_H = 24;                   // ducked hurtbox height (stands 64)
// Chip damage scales with the guard you have left when the hit lands: a
// fresh duck (full guard) blunts a hit far harder than one worn down near
// breaking, which barely protects at all — see the guard-proportional mix
// in _applyHit. Knockback reduction stays flat regardless of guard.
const DUCK_DMG_MIN = 0.35;           // chip multiplier at full guard (strongest mitigation)
const DUCK_DMG_MAX = 0.9;            // chip multiplier at zero guard (weakest mitigation)
const DUCK_KB_TAKEN = 0.3;           // knockback multiplier while ducking
const DUCK_STANDUP = 0.07;           // delay before attacking after release
const GUARD_MAX = 100;
const GUARD_DRAIN = 12;              // per second while holding duck
const GUARD_REGEN = 20;              // per second while not ducking
const GUARD_REDUCK = 25;             // min guard needed to start a duck
const CRUSH_STUN = 1.0;              // crumple duration at guard zero
const CRUSH_KB_TAKEN = 1.3;         // knockback penalty while crushed

// attack archetypes: [damage, baseKb, kbScale, startup, active, recover, reach, angle]
// 'tap: true' marks the bare tap kit (jab combo, dash attack, air spin) —
// the Brawler augment keys off it.
const ATTACKS = {
  jab:    { dmg: 4,  kb: 130, ks: 9,  startup: .05, active: .09, rec: .12, rx: 52, ry: 26, ang: -10, tap: true },
  // tap combo stages 2-4 (see COMBO_CHAIN): the cross reaches wider, the
  // knee pops steeply upward off a tall box, and the roundhouse is the
  // heavy sendoff — the biggest box, the slowest wind-up, smash knockback
  cross:  { dmg: 5,  kb: 155, ks: 10, startup: .05, active: .08, rec: .13, rx: 62, ry: 22, ang: -18, tap: true },
  knee:   { dmg: 6,  kb: 215, ks: 13, startup: .07, active: .09, rec: .15, rx: 44, ry: 44, ang: -72, tap: true },
  roundh: { dmg: 10, kb: 310, ks: 24, startup: .12, active: .10, rec: .28, rx: 72, ry: 36, ang: -35, tap: true },
  // dash attack: a tap thrown at run speed. Slides with your momentum and
  // launches up-forward for juggles, but carries the longest recovery of
  // any normal — whiff it and you slide past your target wide open.
  dash:   { dmg: 8,  kb: 200, ks: 15, startup: .07, active: .12, rec: .30, rx: 56, ry: 30, ang: -50, tap: true },
  fsmash: { dmg: 13, kb: 240, ks: 22, startup: .16, active: .10, rec: .26, rx: 68, ry: 34, ang: -35 },
  usmash: { dmg: 11, kb: 230, ks: 21, startup: .14, active: .11, rec: .24, rx: 46, ry: 60, ang: -85, up: true },
  dsmash: { dmg: 10, kb: 210, ks: 19, startup: .13, active: .10, rec: .24, rx: 76, ry: 26, ang: -160, both: true },
  dair:   { dmg: 11, kb: 220, ks: 20, startup: .13, active: .12, rec: .22, rx: 40, ry: 56, ang: 80, down: true, spike: true },
  // neutral-air spin: a whirl centered on the fighter that hits a tight
  // circle around the body several times. 'rehit' re-arms the hit set every
  // interval; the last window swaps in 'fin' for a launching finisher.
  nspin:  { dmg: 2.5, kb: 120, ks: 5, startup: .06, active: .28, rec: .16, rx: 46, ry: 42, ang: -80, both: true,
            tap: true, rehit: .14, fin: { kb: 210, ks: 16, ang: -40 } },
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
  // spear grounded down-smash: a haft SWEEP whirled low around the body,
  // both sides at once with no dead zone — the spear's answer to being
  // crowded. Everything hugging the wielder gets swept up and away; at
  // real range the thrust is still the better tool.
  sweep:  { dmg: 11, kb: 240, ks: 16, startup: .14, active: .11, rec: .28, rx: 100, ry: 30, ang: -50, both: true },
  // boomerang strong attack: the throw pose. Like a cast, no melee box ever
  // goes active — the hit is the returning rang spawned at release. Snappy
  // recovery: the thrower is back in control while the blade works.
  rang:   { dmg: 0, kb: 0, ks: 0, startup: .07, active: .02, rec: .16, rx: 30, ry: 24, ang: 0, cast: true },
  // shield strong attack: a battering-ram lunge. The short startup and long
  // active window let the box ride the body through the whole charge-in;
  // 'bounce' swaps the wielder into the victim's spot on clean hits. A modest
  // launcher with light damage — a slab of steel, not a blade.
  bash:   { dmg: 7, kb: 340, ks: 22, startup: .09, active: .20, rec: .30, rx: 46, ry: 42, ang: -28, bounce: true },
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
  boomerang: { chargeMax: 0.9 },     // brisk wind-up; charge buys range and bite
  shield:  { chargeMax: 1.2 },       // regular wind-up; the shield guards while held
};
const SWORD_LUNGE = 640;             // release lunge speed along the aim
const SWORD_LUNGE_CHG = 0.75;        // +75% lunge speed at full charge
const SWORD_LUNGE_H = 0.7;           // horizontal lunge component trimmed 30%
const SWORD_LUNGE_V = 1.3;           // upward lunge boosted 30% (up & diagonals)
const SWORD_CHG_FALL = 0.6;          // charging midair: fall at 60% speed (40% slow fall)
const MAGIC_CHG_FALL = 0.2;          // charging caster hovers: fall at 20% speed (80% slow fall)
const SWORD_DASH_T0 = 0.16, SWORD_DASH_T1 = 0.28; // lunge slide time vs charge
// Every weapon now carries a taste of the sword's movement: the bare-fist
// smash kit and the spear thrust ride a small lunge along their 8-way aim
// (scaled-down sword lunge), and the spear's up-thrust climbs extra hard.
const FIST_LUNGE = 0.45;             // smash-kit lunge, fraction of the sword's
const SPEAR_LUNGE = 0.5;             // thrust lunge, fraction of the sword's
const SPEAR_LUNGE_UP = 1.6;          // up-thrusts carry extra upward momentum
// Magic movement: big casts kick. A charged release shoves the caster
// slightly backward, and a charged DOWN-cast rocket-jumps them skyward.
const CAST_RECOIL_MIN = 0.45;        // charge fraction where recoil starts
const CAST_RECOIL0 = 120, CAST_RECOIL1 = 260;   // backward shove vs charge
const CAST_ROCKET_MIN = 0.3;         // charge needed for the down-cast rocket
const CAST_ROCKET0 = 620, CAST_ROCKET1 = 1500;  // upward rocket speed vs charge
const MANA_MAX = 100;
const MANA_REGEN = 26;               // per second, always trickling back
const MANA_COST = 35;                // mana at a standard (k=1) burst; scales with power
// Boomerang weapon: the release hurls a returning blade along the 8-way aim.
// Charge is range and bite. Only one rang can be out per fighter — catching
// it on the way back (or letting it come home) re-arms the next throw.
// Tuned hot on purpose: the rang is the only weapon whose kit gives zero
// recovery mobility (no lunge, no climb, no rocket jump), so the blade
// itself carries the compensation.
const RANG_SPD0 = 520, RANG_SPD1 = 920;    // launch speed vs charge
const RANG_TTL0 = 1.05, RANG_TTL1 = 1.6;   // flight time vs charge
const RANG_DMG0 = 7,   RANG_DMG1 = 13;     // damage vs charge
const RANG_KB0  = 340, RANG_KB1  = 520;    // knockback vs charge
const RANG_RET = 1400;               // return pull back along the launch axis
const RANG_CATCH_X = 34, RANG_CATCH_Y = 44;  // catch window around the thrower
// Shield weapon: the bash is a body ram — a hard lunge whose impact blasts
// the victim out of their spot and parks the wielder IN it (a position
// switch, not a rebound: an enemy camping the ledge gets swapped out, never
// used as a wall to bounce the wielder back off the stage). A blocked ram
// can't trade places — the blocker stays put — so it stops with a nudge
// back instead. While the charge is held the shield is raised, blunting
// incoming damage.
const SHIELD_LUNGE = 1.1;            // bash lunge, fraction of the sword's (a controlled ram)
const SHIELD_LUNGE_UP = 1.15;        // up-bashes still climb, but less vertically than before
const BASH_BLOCK_PUSH = 240;         // stop-nudge off a blocked (ducked) ram
const SHIELD_CHG_DMG_TAKEN = 0.5;    // damage multiplier while the shield is raised
// In co-op only, a landed (unblocked) bash turns its victim into a body-slam
// hazard for the rest of their flight: creeps they collide with while this
// window is live take a hit too. PvP victims do not gain a hitbox. Piggybacks
// on the existing ability-melee window (f.melee) — a centered, both-sided box
// that follows the victim's body every tick; no new entity or wire format.
const SLAM_TICKS = 30;               // ~0.5s of hazard while flying (at 60Hz)
const SLAM_DMG = 8, SLAM_KB = 300, SLAM_KS = 20;
const SLAM_RX = 56, SLAM_RY = 56;    // body-sized box, a little generous
// Grapple hook: the reel-in scales with flight distance — see the hook case
// in _useAbility. Even a point-blank tag yanks with real force (KB0 is the
// floor), and a snag at full stretch pulls with real violence.
const HOOK_KB0 = 650, HOOK_KB1 = 1250;
const HOOK_RANGE = 700;              // flight distance for the full-strength pull
const BURST_SPD0 = 520,  BURST_SPD1 = 1150;  // burst speed vs charge
const BURST_TTL0 = 0.55, BURST_TTL1 = 1.5;   // burst lifetime vs charge
const BURST_DMG0 = 3.5,  BURST_DMG1 = 8;     // burst damage vs charge
const BURST_KB0  = 420,  BURST_KB1  = 660;   // burst knockback vs charge
const BURST_R0   = 12,   BURST_R1   = 20;    // burst radius vs charge
// Bursts detonate when they die (impact or end of flight): an area blast
// around the pop hits everyone but the direct victim, at reduced power.
const BURST_AOE_R0 = 70, BURST_AOE_R1 = 130; // blast radius vs charge
const BURST_AOE_DMG = 0.55;          // area damage fraction of the direct hit
const BURST_AOE_KB = 0.7;            // area knockback fraction

// Charge fraction k runs 0..1 for a standard release. Weapons with an
// overcharge (magic) can keep holding past that into 1..2, where values
// keep climbing linearly so a full overcharge (k=2) doubles the k=1 value.
function chargeScale(base0, base1, k) {
  return k <= 1 ? base0 + (base1 - base0) * k : base1 * k;
}

// Compact wire format for high-volume enemy deltas. Full snapshots remain
// JSON rows for host recovery; intermediate updates avoid repeated strings and
// number formatting overhead.
export function packEnemyDelta(delta) {
  const [changed = [], removed = []] = delta || [];
  const bytes = 4 + changed.length * 50 + removed.length * 4;
  const view = new DataView(new ArrayBuffer(bytes));
  let offset = 0;
  view.setUint16(offset, changed.length, true); offset += 2;
  view.setUint16(offset, removed.length, true); offset += 2;
  for (const row of changed) {
    view.setUint32(offset, row[0], true); offset += 4;
    view.setFloat32(offset, row[1], true); offset += 4;
    view.setFloat32(offset, row[2], true); offset += 4;
    view.setFloat32(offset, row[3], true); offset += 4;
    view.setFloat32(offset, row[4], true); offset += 4;
    view.setInt8(offset, row[5]); offset++;
    view.setUint8(offset, row[6]); offset++;
    view.setUint8(offset, Math.max(0, ENEMY_KIND_IDS.indexOf(row[7]))); offset++;
    view.setFloat32(offset, row[8], true); offset += 4;
    view.setUint16(offset, row[9] || 1, true); offset += 2;
    view.setUint8(offset, Math.max(0, ENEMY_TEMPERAMENTS.indexOf(row[10]))); offset++;
    view.setUint8(offset, row[11] ? 1 : 0); offset++;
    view.setFloat32(offset, row[12] || 0, true); offset += 4;
    view.setUint8(offset, row[13] || 0); offset++;
    view.setUint8(offset, row[14] || 0); offset++;
    view.setFloat32(offset, row[15] || 0, true); offset += 4;
    view.setFloat32(offset, row[16] || 0, true); offset += 4;
    // summons: the wire carries a bare ally flag (the owner id itself only
    // rides full JSON snapshots) plus the seconds of life left
    view.setUint8(offset, row[17] ? 1 : 0); offset++;
    view.setFloat32(offset, row[18] || 0, true); offset += 4;
  }
  for (const id of removed) { view.setUint32(offset, id, true); offset += 4; }
  return view.buffer;
}

export function unpackEnemyDelta(buffer) {
  const view = new DataView(buffer);
  let offset = 0;
  const changedCount = view.getUint16(offset, true); offset += 2;
  const removedCount = view.getUint16(offset, true); offset += 2;
  const changed = new Array(changedCount);
  for (let i = 0; i < changedCount; i++) {
    const id = view.getUint32(offset, true); offset += 4;
    // Positions/timers ride the wire as float32; re-quantize to the snapshot
    // rounding so decoded rows match the host's exactly.
    const x = r1(view.getFloat32(offset, true)); offset += 4;
    const y = r1(view.getFloat32(offset, true)); offset += 4;
    const hp = r1(view.getFloat32(offset, true)); offset += 4;
    const maxHp = Math.round(view.getFloat32(offset, true)); offset += 4;
    const facing = view.getInt8(offset); offset++;
    const hurt = view.getUint8(offset); offset++;
    const kind = ENEMY_KIND_IDS[view.getUint8(offset)] || 'grunt'; offset++;
    const windup = r2(view.getFloat32(offset, true)); offset += 4;
    const cr = view.getUint16(offset, true); offset += 2;
    const temperament = ENEMY_TEMPERAMENTS[view.getUint8(offset)] || 'bold'; offset++;
    const elite = view.getUint8(offset); offset++;
    const stagger = r2(view.getFloat32(offset, true)); offset += 4;
    const variant = view.getUint8(offset); offset++;
    const atkKind = view.getUint8(offset); offset++;
    const aimX = r1(view.getFloat32(offset, true)); offset += 4;
    const aimY = r1(view.getFloat32(offset, true)); offset += 4;
    const ally = view.getUint8(offset); offset++;
    const life = r2(view.getFloat32(offset, true)); offset += 4;
    changed[i] = [id, x, y, hp, maxHp, facing, hurt, kind, windup, cr, temperament, elite, stagger, variant, atkKind, aimX, aimY, ally, life];
  }
  const removed = new Array(removedCount);
  for (let i = 0; i < removedCount; i++) { removed[i] = view.getUint32(offset, true); offset += 4; }
  return [changed, removed];
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

// Tap combo: taps chain jab → cross → knee → roundhouse as long as each tap
// lands inside the window (timed from the previous swing's start). Every
// stage lunges along the currently-held aim — harder as the chain climbs —
// so the string chases a retreating target, and re-aiming mid-chain turns
// the fighter around. A dash attack opens the chain too. Getting hit, or
// letting the window lapse, drops the combo back to the jab.
const COMBO_CHAIN = ['jab', 'cross', 'knee', 'roundh'];
const COMBO_WINDOW = 0.6;            // seconds from swing start to chain the next tap
const COMBO_LUNGE = [0.35, 0.45, 0.55, 0.7];  // per-stage lunge, fraction of the sword's
const COMBO_LUNGE_V = 0.8;           // taps climb a little less than weapon lunges

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
  volley:    { cd: 5.0 },
  gale:      { cd: 5.0 },
  bubble:    { cd: 6.0 },
  mend:      { cd: 7.0 },
  hook:      { cd: 4.5 },
  trap:      { cd: 6.0 },
  anchor:    { cd: 6.0 },
  springtrap:{ cd: 6.0 },
  troop:     { cd: 5.0 },
  bird:      { cd: 4.0 },
};
const COUNTER_WINDOW = 0.6;          // parry stance duration (s)
const BUBBLE_INVULN = 1.5;           // bubble shield duration (s)
const ANCHOR_TP_INVULN = 0.35;       // brief invuln on landing at the anchor
const ANCHOR_TTL = 4.0;              // seconds the beacon stays warpable (< the cooldown)
// Summoned allies: a creep that fights FOR its summoner for a spell —
// creeps in co-op, rival fighters (and their summons) in PvP — then fades.
// Each summoner fields up to SUMMON_CAP ground and SUMMON_CAP flying
// summons at once; summoning at a full cap dismisses the weakest of that
// layer to make room for the fresh arrival.
const SUMMON_LIFE = 60;              // seconds a summon fights before fading
const SUMMON_CAP = 5;                // per-summoner limit, per layer (ground/flying)
const SUMMON_GROUND_KINDS = ['grunt', 'runner', 'brute', 'hopper', 'slinger'];

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
    this.hearts = [];               // dropped heart pickups (host-authoritative)
    this.enemySpawnT = 2.0;        // grace before the first creep wanders in
    this.recoveryT = 0;            // heart-drop breather; spawns hold while it runs
    this.runT = 0;                 // fought seconds: the difficulty clock, paused while everyone is parked
    this.hitPause = 0;
    this.rng = mulberry32(seed);
    this.fighters = players.map((p, i) => this._spawnFighter(p, i));
    this.inputs = new Map();        // id -> latest input
    for (const f of this.fighters) this.inputs.set(f.id, blankInput());
    this._liveFighters = [];        // reusable co-op query buffer
    this._enemyGrid = new Map();    // reusable broad-phase cells for combat queries
    this._enemyGridTouched = [];
    this._enemyGridPool = [];
    this.hist = [];                 // recent positions per tick (lag compensation)
    this.lagComp = new Map();       // attacker id -> ticks to rewind their victims
  }

  _spawnFighter(p, i) {
    const st = derivedStats(p.build);
    return {
      id: p.id, name: p.name, color: p.color, isBot: !!p.isBot, sandbag: !!p.sandbag, st,
      baseBuild: p.build, tryBuild: null,
      x: this.stage.infinite ? Math.max(0, this.stage.spawns[i % this.stage.spawns.length]) : this.stage.spawns[i % this.stage.spawns.length], y: -F_H / 2,
      vx: 0, vy: 0, facing: i % 2 === 0 ? 1 : -1,
      grounded: true, jumps: st.maxJumps, fastfall: false,
      jumpT: -1,                    // seconds since liftoff while a jump cut is still possible (-1 idle)
      comboN: 0, comboT: 0,         // tap combo: next stage index + chain window left
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
      score: { ko: 0, fall: 0, sd: 0, dmg: 0, taken: 0, maxHit: 0, cr: this.coop ? EXPEDITION_START_CR : 0, elite: 0 }, // podium stats + expedition credits
    };
  }

  // Drop a late joiner into a running fight. They enter like a respawn —
  // descending from above with spawn invulnerability — so they can't be
  // camped the instant they appear.
  addFighter(p) {
    if (this.fighters.some(f => f.id === p.id)) return null;
    const f = this._spawnFighter(p, this.fighters.length);
    // co-op: drop the newcomer beside the expedition party, not back at the
    // trailhead — they descend right into the action
    if (this.coop) {
      const live = this.fighters.filter(o => !o.dead && !o.parked);
      if (live.length) f.x = live.reduce((s, o) => s + o.x, 0) / live.length + (this.rng() * 160 - 80);
    }
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
      this.projectiles = this.projectiles.filter(p => !(p.kind === 'anchor' && p.owner === f.id));
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
  updateBuild(id, build, enforce = true) {
    const f = this.fighters.find(x => x.id === id);
    if (!f) return null;
    // Co-op economy: a swap settles against the CR wallet — upgrades spend,
    // downsizes refund. A swap the wallet can't cover is refused outright.
    // (Prediction mirrors pass enforce=false: the host already settled it.)
    if (this.coop && enforce) {
      const delta = buildCost(build) - buildCost(f.baseBuild || emptyBuild());
      if (delta > (f.score.cr || 0)) return null;
      f.score.cr = (f.score.cr || 0) - delta;
    }
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

  // One-time loot-card bonuses — like setParked, a host-authoritative nudge
  // from outside the input stream. Expedition-only.
  applyLootBonus(id, kind) {
    if (!this.coop) return;
    const f = this.fighters.find(x => x.id === id);
    if (!f || f.dead) return;
    if (kind === 'heal') f.hp = Math.min(f.maxHp, f.hp + Math.ceil(f.maxHp * LOOT_HEAL_FRACTION));
    else if (kind === 'cr') f.score.cr = (f.score.cr || 0) + LOOT_CR_BONUS;
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
    cur.jr = !!inp.jr;   // level: jump control released (missing = held, keeping full jumps)
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
    this._stepAllies();   // summoned allies fight in both modes

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
    // mana trickles back half as fast while airborne, so the hover-mage
    // can't sustain the aerial loop forever without touching down
    f.mana = Math.min(MANA_MAX, f.mana + MANA_REGEN * (f.grounded ? 1 : 0.5) * TICK);
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
          // reversing gets extra accel so direction changes bite instead of skate
          const turn = f.vx !== 0 && Math.sign(want) === -Math.sign(f.vx) ? TURN_ACCEL : 1;
          f.vx = approach(f.vx, want, GROUND_ACCEL * turn * TICK);
          f.facing = Math.sign(inp.mx) || f.facing;
          f.state = 'run';
        } else {
          // dash attacks and wavelands slide on reduced friction; charging
          // keeps more momentum too, so skating into a charged swing (or
          // sliding to a stop while winding one up) carries you farther
          const slick = (inAttack && f.atk === 'dash') || f.slideT > 0;
          const frictionMult = slick ? DASH_ATK_FRICTION : inCharge ? CHARGE_FRICTION : 1;
          f.vx = approach(f.vx, 0, FRICTION * frictionMult * TICK);
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
      f.jumpT = 0;
      this.events.push({ e: 'jump', id: f.id, x: f.x, y: f.y + F_H / 2 });
    }
    // jump cut: the window closes once the rise ends or a hit interrupts it,
    // so only the jump's own ascent can ever be trimmed
    if (f.jumpT >= 0) {
      f.jumpT += TICK;
      if (f.grounded || f.vy >= 0 || inHitstun) f.jumpT = -1;
      else if (f.jumpT >= JUMP_CUT_GRACE && inp.jr) { f.vy *= JUMP_CUT; f.jumpT = -1; }
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

    // tap combo window: run out the clock, and drop the chain on a hit
    if (inHitstun || inCrush) { f.comboT = 0; f.comboN = 0; }
    else if (f.comboT > 0 && (f.comboT -= TICK) <= 0) { f.comboT = 0; f.comboN = 0; }

    // --- gravity & integration ---
    if (!f.grounded) {
      // charge floats: a winding sword falls 40% slower, a charging caster
      // hangs at 80% slow — the levitating mage lines up the big burst
      const slow = inCharge && f.st.weapon === 'sword' ? SWORD_CHG_FALL
        : inCharge && f.st.weapon === 'magic' ? MAGIC_CHG_FALL : 1;
      // apex hang: gravity eases through the top of the arc so aerials are
      // easier to place. Off in hitstun/crush (launch KOs keep their exact
      // physics) and while fast-falling.
      const apex = !inHitstun && !inCrush && !f.fastfall && Math.abs(f.vy) < APEX_BAND ? APEX_GRAV : 1;
      // heavier gravity on the way down — off in hitstun/crush so launch
      // knockback keeps its exact physics, like the apex hang above
      const fall = !inHitstun && !inCrush && f.vy > 0 ? FALL_GRAV : 1;
      const cap = (f.fastfall ? FASTFALL : MAX_FALL) * slow;
      f.vy = Math.min(cap, f.vy + GRAV * slow * apex * fall * TICK);
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
    const impact = f.vy;             // pre-landing fall speed, for touchdown feedback
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
      this.events.push({ e: 'land', id: f.id, x: f.x, y: f.y + F_H / 2, v: Math.round(Math.max(0, impact)) });
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
      // an armed combo chain claims the tap before the dash conversion,
      // so mid-string lunges can't accidentally turn into dash attacks
      if (name === 'jab' && !fromDuck && f.comboT > 0 && f.comboN > 0) {
        name = COMBO_CHAIN[Math.min(f.comboN, COMBO_CHAIN.length - 1)];
      }
      // tap at run speed: dash attack — the jab rides the momentum instead
      // of planting. Vertical or against-the-run aims fall through to the
      // normal jab, so aiming backward is the escape hatch to stop and poke.
      else if (name === 'jab' && !fromDuck && f.grounded && !dy
          && Math.abs(f.vx) >= DASH_ATK_MIN && (!dx || dx === Math.sign(f.vx))) {
        name = 'dash';
        dx = Math.sign(f.vx);
      }
    } else {
      // no neutral strong attack: a neutral swipe is the side strike the
      // way you're facing, whatever the weapon
      if (!dx && !dy) dx = f.facing;
      name = this._weaponAttack(f, dx, dy);
      // a grounded down-bash rams forward instead of into the floor
      if (name === 'bash' && f.grounded && dy > 0) { dy = 0; dx = dx || f.facing; }
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
    // dash attacks keep their slide; so do attacks thrown mid-waveland and
    // lunging tap-combo stages, whose step merges with momentum instead of
    // planting. A combo stage only lunges while a direction is held — a
    // neutral string stands its ground — except the roundhouse sendoff,
    // which always throws its weight forward.
    const comboLunge = !swipe && !fromDuck && COMBO_CHAIN.includes(name)
      && !!(dx || dy || name === 'roundh');
    if (f.grounded && name !== 'dash' && !comboLunge && f.slideT <= 0) f.vx *= 0.35;
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
    // fists and spear ride a scaled-down version of the sword's lunge
    if (name === 'fsmash' || name === 'usmash' || name === 'dsmash' || name === 'dair') this._lunge(f, dx, dy, chg, FIST_LUNGE);
    if (name === 'thrust') this._lunge(f, dx, dy, chg, SPEAR_LUNGE, SPEAR_LUNGE_UP);
    // the bash IS a lunge: the shield rams ahead harder than any blade,
    // and up-aimed rams climb extra hard (shield users fly shieldfirst)
    if (name === 'bash') this._lunge(f, dx, dy, chg, SHIELD_LUNGE, SHIELD_LUNGE_UP);
    if (name === 'sweep') this.events.push({ e: 'sweep', id: f.id, x: f.x, y: f.y + F_H / 2 });
    // tap combo bookkeeping: a stage lunges along the held aim (harder
    // deeper into the string) only while a direction is held — see
    // comboLunge — and arms the window for the next tap; the roundhouse
    // resets. A dash attack opens the chain so a run-up flows straight
    // into cross → knee → roundhouse.
    const stage = swipe ? -1 : COMBO_CHAIN.indexOf(name);
    if (stage >= 0) {
      if (comboLunge) this._lunge(f, dx || f.facing, dy, 0, COMBO_LUNGE[stage], COMBO_LUNGE_V);
      f.comboN = stage + 1 < COMBO_CHAIN.length ? stage + 1 : 0;
      f.comboT = f.comboN ? COMBO_WINDOW : 0;
    } else if (name === 'dash') {
      f.comboN = 1;
      f.comboT = COMBO_WINDOW;
    } else if (!swipe) {
      f.comboN = 0;
      f.comboT = 0;
    }
    if (name === 'mcast' && !this._castBurst(f, dx, dy, chg)) return; // fizzled: no swing
    if (name === 'rang' && !this._throwRang(f, dx, dy, chg)) return;  // rang still out: no throw
    this.events.push({ e: 'swing', id: f.id, atk: name, x: f.x, y: f.y, dx, dy, chg });
  }

  // Which strong attack a swipe/charge becomes: the equipped weapon's
  // strike, or the classic smash kit for bare fists.
  _weaponAttack(f, dx, dy) {
    const w = f.st.weapon;
    if (w === 'sword') return 'slash';
    if (w === 'magic') return 'mcast';
    if (w === 'spear') return dy > 0 && f.grounded ? 'sweep' : 'thrust';
    if (w === 'boomerang') return 'rang';
    if (w === 'shield') return 'bash';
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

  // Weapon release: a body lunge along the 8-way aim, longer the harder it
  // was charged. The sideways component is trimmed while upward vectors
  // (straight up and the diagonals) get a boost — the blade climbs better
  // than it skates. Grounded down-aims can't dive through the floor, so
  // only their sideways component slides. Aerial upward lunges share the
  // up-smash rise cooldown so chained strikes can't climb forever.
  // `scale` shrinks the whole lunge (fists/spear take a taste of the
  // sword's movement); `vBoost` multiplies the upward component on top
  // (the spear's up-thrust climbs extra hard).
  _lunge(f, dx, dy, k = 0, scale = 1, vBoost = 1) {
    const spd = SWORD_LUNGE * scale * (1 + SWORD_LUNGE_CHG * k);
    const n = Math.hypot(dx, dy) || 1;
    const lx = (dx / n) * spd * SWORD_LUNGE_H;
    let ly = (dy / n) * spd * (dy < 0 ? SWORD_LUNGE_V * vBoost : 1);
    if (f.grounded && ly > 0) ly = 0;
    if (ly < 0) {
      if (!f.grounded && f.riseT > 0) ly = 0;
      else { f.riseT = AIR_RISE_CD; f.grounded = false; f.fastfall = false; }
    }
    // merge, never weaken: a lunge in the direction you're already moving
    // keeps the faster speed (a run or waveland glide sails through the
    // swing); against your momentum it turns you around at lunge speed
    if (lx) {
      f.vx = Math.sign(lx) === Math.sign(f.vx) ? Math.sign(lx) * Math.max(Math.abs(f.vx), Math.abs(lx)) : lx;
      f.dashT = SWORD_DASH_T0 + (SWORD_DASH_T1 - SWORD_DASH_T0) * k;
    }
    // same rule vertically (an up-smash rise or a fast dive stays intact)
    if (ly < 0) f.vy = Math.min(f.vy, ly);
    else if (ly > 0) f.vy = Math.max(f.vy, ly);
  }

  // Magic release: a burst that flies along the aim. Charge is range and
  // muscle — speed, lifetime, damage and knockback all grow with it. Costs
  // mana; too dry to pay and the cast fizzles into nothing but recovery.
  // Returns whether a burst actually came out.
  _castBurst(f, dx, dy, k) {
    const aimedDown = dy > 0;
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
      aoeR: chargeScale(BURST_AOE_R0, BURST_AOE_R1, Math.min(2, k)),
    });
    // big casts kick back. A charged DOWN-cast rocket-jumps the caster
    // skyward off the blast; otherwise a charged release shoves them
    // slightly opposite the aim.
    if (aimedDown && k >= CAST_ROCKET_MIN) {
      f.vy = Math.min(f.vy, -(CAST_ROCKET0 + (CAST_ROCKET1 - CAST_ROCKET0) * Math.min(1, k)));
      f.grounded = false;
      f.fastfall = false;
    } else if (k >= CAST_RECOIL_MIN && nx) {
      f.vx -= nx * (CAST_RECOIL0 + (CAST_RECOIL1 - CAST_RECOIL0) * Math.min(1, k));
    }
    return true;
  }

  // Boomerang release: hurl the returning blade along the aim. Charge is
  // range and bite — speed, flight time, damage and knockback all grow with
  // it. Only one rang per fighter can be out; with it still in flight the
  // release fizzles into nothing but recovery. Returns whether it flew.
  _throwRang(f, dx, dy, k) {
    if (this.projectiles.some(p => p.kind === 'boomerang' && p.owner === f.id)) {
      this.events.push({ e: 'fizzle', why: 'rang', id: f.id, x: f.x, y: f.y });
      return false;
    }
    if (f.grounded && dy > 0) { dy = 0; dx = dx || f.facing; } // not into the floor
    const n = Math.hypot(dx, dy) || 1;
    const nx = dx / n, ny = dy / n;
    const spd = RANG_SPD0 + (RANG_SPD1 - RANG_SPD0) * k;
    this.projectiles.push({
      eid: nextEid++, kind: 'boomerang', owner: f.id,
      x: f.x + nx * 40, y: f.y - 8 + ny * 20,
      vx: nx * spd, vy: ny * spd,
      ttl: RANG_TTL0 + (RANG_TTL1 - RANG_TTL0) * k,
      dmg: RANG_DMG0 + (RANG_DMG1 - RANG_DMG0) * k,
      kb: RANG_KB0 + (RANG_KB1 - RANG_KB0) * k, ks: 18, r: 15,
      ret: RANG_RET, lnx: nx, lny: ny,   // constant pull back along the launch axis
      thru: true, hit: new Set(),        // cuts through targets, out and back
    });
    return true;
  }

  // Fire shells (fireball, volley bolts) detonate when they die: a flame
  // splash that chips, shoves, and sets the afterburn on everyone near the
  // pop except the direct victim, who already took the full hit + burn.
  _fireBoom(pr) {
    const att = this.fighters.find(x => x.id === pr.owner);
    if (!att) return;
    const R = pr.fireR;
    const spec = { dmg: pr.dmg * 0.5, kb: pr.kb * 0.6, ks: pr.ks, dot: pr.dot };
    this.events.push({ e: 'burstboom', x: pr.x, y: pr.y, r: R, fire: 1 });
    if (!this.coop) {
      for (const o of this.fighters) {
        if (o.id === att.id || o.id === pr.struck || o.dead || o.invuln > 0) continue;
        const ob = hurtBox(o);
        if (Math.abs(o.x - pr.x) < R + F_W / 2 && Math.abs((o.y + ob.dy) - pr.y) < R + ob.hh) {
          this._applyHit(att, o, spec, deg(-40), Math.sign(o.x - pr.x) || 1, false);
        }
      }
    }
    for (const e of this.enemies) {
      if (e.hp <= 0 || 'e' + e.eid === pr.struck) continue;
      if (e.ally && (this.coop || e.ally === att.id)) continue;
      if (Math.abs(e.x - pr.x) < R + e.hw && Math.abs(e.y - pr.y) < R + e.hh) {
        this._hitEnemy(att, e, spec, deg(-40), Math.sign(e.x - pr.x) || 1, false);
      }
    }
  }

  // A burst's death — impact or end of flight — detonates it: area damage
  // around the pop for everyone except the direct victim (already paid).
  _burstBoom(pr) {
    const att = this.fighters.find(x => x.id === pr.owner);
    if (!att) return;
    const R = pr.aoeR || BURST_AOE_R0;
    const spec = { dmg: pr.dmg * BURST_AOE_DMG, kb: pr.kb * BURST_AOE_KB, ks: pr.ks };
    this.events.push({ e: 'burstboom', x: pr.x, y: pr.y, r: R });
    if (!this.coop) {
      for (const o of this.fighters) {
        if (o.id === att.id || o.id === pr.struck || o.dead || o.invuln > 0) continue;
        const ob = hurtBox(o);
        if (Math.abs(o.x - pr.x) < R + F_W / 2 && Math.abs((o.y + ob.dy) - pr.y) < R + ob.hh) {
          this._applyHit(att, o, spec, deg(-45), Math.sign(o.x - pr.x) || 1, false);
        }
      }
    }
    for (const e of this.enemies) {
      if (e.hp <= 0 || 'e' + e.eid === pr.struck) continue;
      if (e.ally && (this.coop || e.ally === att.id)) continue;
      if (Math.abs(e.x - pr.x) < R + e.hw && Math.abs(e.y - pr.y) < R + e.hh) {
        this._hitEnemy(att, e, spec, deg(-45), Math.sign(e.x - pr.x) || 1, false);
      }
    }
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

  // 8-way ability aim from the live stick, normalized; facing when neutral.
  // Grounded down-aims flatten to the facing so shots don't fire into the floor.
  _abilityAim(f) {
    const inp = this.inputs.get(f.id);
    let ax = Math.abs(inp?.mx || 0) > 0.3 ? Math.sign(inp.mx) : 0;
    let ay = Math.abs(inp?.my || 0) > 0.3 ? Math.sign(inp.my) : 0;
    if (!ax && !ay) ax = f.facing;
    if (f.grounded && ay > 0) { ay = 0; ax = ax || f.facing; }
    const n = Math.hypot(ax, ay) || 1;
    return [ax / n, ay / n];
  }

  _useAbility(f, slot) {
    const id = f.st.abilities[slot];
    if (!id) return;
    // the anchor button stays live through its whole cooldown — pressing it
    // while cooling activates the teleport instead of being blocked like
    // every other ability, so it gets its own gate ahead of the cd check
    if (id === 'anchor') { this._useAnchor(f, slot); return; }
    if (f.cds[slot] > 0) return;
    const def = ABILITY_DEFS[id];
    f.cds[slot] = def.cd * (f.st.cdMult || 1);
    const dir = f.lastDir;
    let evUp = false;
    switch (id) {
      case 'fireball': {
        // aimed 8-way by the held stick (facing when neutral); the shell
        // detonates when it dies — flame splash + afterburn around the pop
        const [nx, ny] = this._abilityAim(f);
        this.projectiles.push({
          eid: nextEid++, kind: 'fireball', owner: f.id,
          x: f.x + nx * 40, y: f.y - 8 + ny * 20,
          vx: nx * 620, vy: ny * 620, ttl: 1.4,
          dmg: 6, kb: 170, ks: 13, r: 14,
          dot: { n: 3, every: 0.5, dmg: 2 },   // afterburn: +6% over 1.5s
          fireR: 90,
        });
        break;
      }
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
        f.melee = { name: 'upper', dmg: 14.3, kb: 702, ks: 30, rx: 48, ry: 68, ang: -88, until: this.tick + 18, hit: new Set() };
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
      case 'volley': {
        // a fan of three burning bolts around the held aim, each popping in
        // a small flame splash when it dies
        const [nx, ny] = this._abilityAim(f);
        const base = Math.atan2(ny, nx);
        for (const off of [-0.26, 0, 0.26]) {
          const ang = base + off;
          this.projectiles.push({
            eid: nextEid++, kind: 'bolt', owner: f.id,
            x: f.x + Math.cos(ang) * 40, y: f.y - 8 + Math.sin(ang) * 20,
            vx: Math.cos(ang) * 580, vy: Math.sin(ang) * 580, ttl: 1.1,
            dmg: 5, kb: 140, ks: 10, r: 11,
            dot: { n: 2, every: 0.5, dmg: 2 },   // volley bolts burn now too
            fireR: 60,
          });
        }
        break;
      }
      case 'gale':
        // radial windbox: modest damage, an enormous shove; works midair
        this.events.push({ e: 'gale', id: f.id, x: f.x, y: f.y });
        this._radialHit(f, 200, { dmg: 10, kb: 840, ks: 6 },
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
        // chain claw: reels the first foe it tags in toward you. The pull
        // scales with the hook's flight distance — a point-blank tag barely
        // tugs, a max-range snag hauls them all the way in (see HOOK_KB0/1)
        this.projectiles.push({
          eid: nextEid++, kind: 'hook', owner: f.id,
          x: f.x + f.facing * 40, y: f.y - 8,
          x0: f.x + f.facing * 40, y0: f.y - 8,
          vx: f.facing * 820, vy: 0, ttl: 1.05,
          dmg: 6, kb: HOOK_KB0, ks: 3, r: 15, pull: true, ang: -20,
        });
        break;
      case 'trap':
        // planted jaws: drop at your feet and sit armed until someone steps
        // in — the snap locks the victim in a long stun
        this.projectiles.push({
          eid: nextEid++, kind: 'trap', owner: f.id,
          x: f.x + f.facing * 30, y: f.y + F_H / 2 - 12,
          vx: 0, vy: 0, grav: 1400, ttl: 6,
          dmg: 8, kb: 330, ks: 16, r: 16, ang: -80, pierce: true, stun: 1.0,
        });
        break;
      case 'springtrap':
        // planted coil: whoever steps in gets launched EXACTLY backwards —
        // dead flat, reversing the way they were moving (or facing, if
        // they stood still). No stun; the point is the eviction.
        this.projectiles.push({
          eid: nextEid++, kind: 'spring', owner: f.id,
          x: f.x + f.facing * 30, y: f.y + F_H / 2 - 12,
          vx: 0, vy: 0, grav: 1400, ttl: 6,
          dmg: 4, kb: 560, ks: 10, r: 16, ang: 0, pierce: true, spring: true,
        });
        break;
      case 'troop':
        // a random pull from the walking roster answers the call
        this._summonAlly(f, SUMMON_GROUND_KINDS[Math.floor(this.rng() * SUMMON_GROUND_KINDS.length)]);
        break;
      case 'bird':
        this._summonAlly(f, 'flyer');
        break;
    }
    this.events.push({ e: 'ability', id: f.id, ability: id, x: f.x, y: f.y, dir: f.facing, up: evUp });
  }

  // Teleport anchor: press once to drop a beacon at your feet, armed for
  // ANCHOR_TTL seconds; press the same button again while it's down to warp
  // straight back to it instead of waiting the timer out. One anchor per
  // fighter — a live one blocks a fresh drop. The beacon expires before the
  // cooldown does, so there's a dead stretch where the warp window has
  // closed but the ability isn't back yet.
  _useAnchor(f, slot) {
    const anchor = this.projectiles.find(p => p.kind === 'anchor' && p.owner === f.id && p.ttl > 0);
    if (anchor) {
      anchor.ttl = 0;
      f.x = anchor.x;
      f.y = anchor.y;
      f.vx = 0;
      f.vy = 0;
      f.grounded = false;
      f.fastfall = false;
      f.invuln = Math.max(f.invuln, ANCHOR_TP_INVULN);
      this.events.push({ e: 'ability', id: f.id, ability: 'anchortp', x: f.x, y: f.y, dir: f.facing });
      return;
    }
    if (f.cds[slot] > 0) return;
    const cd = ABILITY_DEFS.anchor.cd * (f.st.cdMult || 1);
    f.cds[slot] = cd;
    this.projectiles.push({
      eid: nextEid++, kind: 'anchor', owner: f.id,
      x: f.x, y: f.y, vx: 0, vy: 0, ttl: Math.min(ANCHOR_TTL, cd),
    });
    this.events.push({ e: 'ability', id: f.id, ability: 'anchor', x: f.x, y: f.y, dir: f.facing });
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
        if (e.hp <= 0 || e.ally) continue;   // party summons ride out the blast
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
    // PvP: rival summons get blasted too
    for (const e of this.enemies) {
      if (e.hp <= 0 || !e.ally || e.ally === f.id) continue;
      const dx = e.x - f.x, dy = e.y - f.y;
      if (Math.hypot(dx, dy) < radius) this._hitEnemy(f, e, spec, angleFn(dx, dy), Math.sign(dx) || 1, false);
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
    if (this.coop || this.enemies.length) this._rebuildEnemyGrid();
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
      if (pr.kind === 'anchor') continue;   // a beacon, not a weapon — no hitbox
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
            // hooks yank the victim toward the thrower; traps launch straight
            // up; springs bounce the victim exactly backwards — dead flat,
            // reversing their motion (or their facing, standing still)
            const dirX = pr.pull ? (Math.sign(att.x - pos.x) || 1)
              : pr.spring ? -(Math.sign(o.vx) || o.facing || 1)
              : (Math.sign(pr.vx) || 1);
            let spec = pr;
            if (pr.pull && pr.x0 != null) {
              // grapple pull grows with how far the hook flew before tagging
              const dist = Math.hypot(pr.x - pr.x0, pr.y - pr.y0);
              spec = { ...pr, kb: HOOK_KB0 + (HOOK_KB1 - HOOK_KB0) * Math.min(1, dist / HOOK_RANGE) };
            }
            this._applyHit(att, o, spec, deg(pr.ang ?? -40), dirX, false, !!pr.pierce);
          }
          if (pr.thru) pr.hit.add(o.id);   // sail on through
          else { pr.struck = o.id; pr.ttl = 0; }   // burst AoE skips the direct victim
        }
      }
    }

    // friendly projectiles vs creeps (co-op) and vs rival summons (PvP)
    if (this.coop || this.enemies.length) {
      for (const pr of this.projectiles) {
        if (pr.foe || pr.kind === 'anchor') continue;   // creeps' own shots, and beacons, don't hit creeps
        const att = this.fighters.find(x => x.id === pr.owner);
        if (!att) continue;
        const radius = pr.r + 80;   // pad covers the widest body (bosses)
        const c0 = Math.floor((pr.x - radius) / ENEMY_GRID_CELL);
        const c1 = Math.floor((pr.x + radius) / ENEMY_GRID_CELL);
        for (let cell = c0; cell <= c1 && pr.ttl > 0; cell++) {
          const enemies = this._enemyGrid.get(cell);
          if (!enemies) continue;
          for (const e of enemies) {
            if (e.hp <= 0 || pr.hit?.has('e' + e.eid)) continue;
            // summons are friendly to the whole party in co-op; in PvP only
            // to their own summoner
            if (e.ally && (this.coop || e.ally === pr.owner)) continue;
            if (Math.abs(e.x - pr.x) < e.hw + pr.r && Math.abs(e.y - pr.y) < e.hh + pr.r) {
              const dirX = pr.spring ? -(Math.sign(e.vx) || e.facing || 1) : (Math.sign(pr.vx) || 1);
              this._hitEnemy(att, e, pr, deg(pr.ang ?? -40), dirX, false);
              if (pr.thru) pr.hit?.add('e' + e.eid);
              else { pr.struck = 'e' + e.eid; pr.ttl = 0; break; }   // burst AoE skips the direct victim
            }
          }
        }
      }
    }

    // creeps' ranged shots vs fighters (co-op). A Counter parries them back.
    if (this.coop) {
      for (const pr of this.projectiles) {
        if (!pr.foe) continue;
        for (const o of this.fighters) {
          if (o.dead || o.invuln > 0) continue;
          const ob = hurtBox(o);
          if (Math.abs(o.x - pr.x) < F_W / 2 + pr.r && Math.abs((o.y + ob.dy) - pr.y) < ob.hh + pr.r) {
            if (o.counterT > 0) {
              // parried: fling it back as the player's own shot, now hunting creeps
              pr.vx *= -1; pr.vy *= -1; pr.foe = false; pr.owner = o.id;
              this.events.push({ e: 'counter', x: o.x, y: o.y });
            } else {
              const dir = Math.sign(pr.vx) || 1;
              const dmg = this._shielded(o, pr.dmg);
              o.vx += dir * 200; o.vy = Math.min(o.vy, -200); o.grounded = false;
              o.state = 'hitstun'; o.stateT = 0; o.hitstunFor = 0.26;
              o.atk = null; o.atkDir = null; o.melee = null; o.chg = 0;
              this.events.push({ e: 'hit', x: o.x, y: o.y, dmg: Math.round(dmg), heavy: false, vic: o.id, att: pr.owner });
              this._damageHp(o, dmg, pr.owner);
              if (this.coop) o.invuln = Math.max(o.invuln, ENEMY_HIT_MERCY);
              pr.ttl = 0;
            }
            break;
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
    // co-op: the same swing also carves into any creeps it overlaps.
    // In PvP the only creeps alive are summons — a rival's is fair game.
    if (this.coop || this.enemies.length) {
      const c0 = Math.floor((cx - hb.hw - 80) / ENEMY_GRID_CELL);   // pad covers the widest body (bosses)
      const c1 = Math.floor((cx + hb.hw + 80) / ENEMY_GRID_CELL);
      for (let cell = c0; cell <= c1; cell++) {
        const enemies = this._enemyGrid.get(cell);
        if (!enemies) continue;
        for (const e of enemies) {
          if (e.hp <= 0) continue;
          if (e.ally && (this.coop || e.ally === f.id)) continue;
          const key = 'e' + e.eid;
          if (hitSet.has(key)) continue;
          if (Math.abs(e.x - cx) < hb.hw + e.hw && Math.abs(e.y - cy) < hb.hh + e.hh) {
            hitSet.add(key);
            const dirX = spec.both ? (Math.sign(e.x - f.x) || 1) : (a ? (a.x || f.facing) : f.facing);
            this._hitEnemy(f, e, spec, deg(angDeg), dirX, !!spec.spike);
          }
        }
      }
    }
  }

  _applyHit(att, vic, spec, angRad, dirX, spike = false, pierce = false) {
    let dmg = spec.dmg * att.st.dmgMult;
    // brawler: the bare tap kit (jab string, dash attack, air spin) bites harder
    if (att.st.augments.includes('brawler') && spec.tap) {
      dmg *= 1.25;
      this.events.push({ e: 'augment', aug: 'brawler', id: att.id, x: att.x, y: att.y });
    }
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
    dmg = this._shielded(vic, dmg);             // raised shield blunts the hit
    vic.lastHitBy = att.id;                     // KO attribution (reaper heal)

    // ducked block: chip damage and a horizontal shove instead of a launch.
    // The guard eats the hit's full raw damage and crushes at zero. How
    // much of that raw damage gets through is proportional to the guard
    // you're carrying INTO the hit — full guard mitigates hardest, a guard
    // worn down near zero barely helps (you're one hit from crushing anyway).
    if (vic.state === 'duck' && !pierce) {
      const raw = dmg;
      const guardFrac = clamp(vic.guard / GUARD_MAX, 0, 1);
      dmg *= DUCK_DMG_MAX - (DUCK_DMG_MAX - DUCK_DMG_MIN) * guardFrac;
      vic.pct = Math.min(999, vic.pct + dmg);
      att.score.dmg += dmg;
      vic.score.taken += dmg;
      if (dmg > att.score.maxHit) att.score.maxHit = dmg;
      const kb = (spec.kb + spec.ks * dmg * (1 + vic.pct / 90))
        * att.st.kbMult * vic.st.kbTaken * DUCK_KB_TAKEN;
      vic.vx = Math.cos(angRad) * kb * dirX;
      if (vic.st.augments.includes('bulwark')) {
        vic.guard -= raw * 0.2;   // bulwark: the guard shrugs off most of the wear
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
      if (spec.bounce) this._bashImpact(att, vic.x, vic.y, dirX, true);   // blocked: stop, no swap
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
    // thorns recoil (melee only — projectiles have no body contact)
    if (vic.st.augments.includes('thorns') && !spec.r) {
      att.pct = Math.min(999, att.pct + 8);
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
    // clear a stale duck-jab offset from an interrupted swing — otherwise a
    // fighter hit mid low-jab, then later handed a fresh f.melee window
    // (e.g. becoming a slam hazard below), would render/hit from the wrong
    // offset until their next real duck-jab attempt overwrote it
    vic.lowJab = false;

    // a landed spike springs the attacker back up with their jumps refreshed,
    // turning a deep off-stage dunk into a recoverable play
    if (spike) {
      att.vy = Math.min(att.vy, -SPIKE_BOUNCE);
      att.grounded = false;
      att.fastfall = false;
      att.jumps = att.st.maxJumps;
      this.events.push({ e: 'spikebounce', id: att.id, x: att.x, y: att.y + F_H / 2 });
    }
    // shield bash: the victim is blasted out of their spot, the wielder
    // takes it (their position was read before the launch moved anything),
    // and, in co-op only, the victim becomes a body-slam hazard for the
    // rest of their flight. PvP victims intentionally carry no hitbox after
    // impact, so a clean shield bash cannot chain through bystanders.
    if (spec.bounce) {
      this._bashImpact(att, vic.x, vic.y, dirX);
      if (this.coop) {
        vic.melee = {
          name: 'slam', dmg: SLAM_DMG, kb: SLAM_KB, ks: SLAM_KS,
          rx: SLAM_RX, ry: SLAM_RY, ang: 0, both: true,
          until: this.tick + SLAM_TICKS, hit: new Set([att.id]),
        };
      }
    }

    this.hitPause = Math.min(0.12, HIT_PAUSE + dmg * 0.004);
    this.events.push({
      e: 'hit', x: vic.x, y: vic.y, dmg: Math.round(dmg),
      heavy: kb > 700, spike, vic: vic.id, att: att.id,
    });
    this._damageHp(vic, dmg, att.id);
  }

  // Incoming damage through a raised shield: winding up a bash keeps the
  // slab up front, blunting whatever lands while the charge is held.
  _shielded(vic, dmg) {
    if (vic.state !== 'charge' || vic.atk !== 'bash') return dmg;
    this.events.push({ e: 'block', x: vic.x, y: vic.y - 12, vic: vic.id });
    return dmg * SHIELD_CHG_DMG_TAKEN;
  }

  // Shield bash impact: the ram ends where the victim stood. They're blasted
  // out of the spot and the wielder inherits it — a position switch, so the
  // lunge never carries through the target and never rebounds the wielder
  // back the way they came. A blocked ram gets no swap (the blocker holds
  // their ground): it just stops with a small shove back.
  _bashImpact(att, vicX, vicY, dirX, blocked = false) {
    att.dashT = 0;
    if (blocked) {
      att.vx = -dirX * BASH_BLOCK_PUSH;
      return;
    }
    att.x = vicX;
    att.y = vicY;
    att.vx = 0;
    this.events.push({ e: 'spikebounce', id: att.id, x: att.x, y: att.y + F_H / 2 });
  }

  _stepProjectiles() {
    for (const pr of this.projectiles) {
      if (pr.ret) {
        // boomerang: decelerate along the launch axis, then swing back home
        const was = pr.vx * pr.lnx + pr.vy * pr.lny;
        pr.vx -= pr.ret * pr.lnx * TICK;
        pr.vy -= pr.ret * pr.lny * TICK;
        // piercing rangs re-arm at the turnaround: out and back both connect
        if (pr.thru && was > 0 && pr.vx * pr.lnx + pr.vy * pr.lny <= 0) pr.hit.clear();
      }
      if (pr.grav) pr.vy = Math.min(pr.vy + pr.grav * TICK, 1150);  // traps drop until they settle
      pr.x += pr.vx * TICK;
      pr.y += pr.vy * TICK;
      pr.ttl -= TICK;
      // a returning rang that reaches its thrower is caught — gone from the
      // air, and the hand is free to wind up the next throw early
      if (pr.ret && pr.ttl > 0 && pr.vx * pr.lnx + pr.vy * pr.lny < 0) {
        const own = this.fighters.find(x => x.id === pr.owner);
        if (own && !own.dead
            && Math.abs(own.x - pr.x) < RANG_CATCH_X && Math.abs(own.y - 8 - pr.y) < RANG_CATCH_Y) {
          pr.ttl = 0;
          this.events.push({ e: 'catch', id: own.id, x: pr.x, y: pr.y });
        }
      }
      if (pr.grav) this._settleTrap(pr);
      else if (pr.plat != null) {
        // settled on a platform: ride it (traps on the crane girder sweep too)
        const pl = this.platsNow()[pr.plat];
        if (pl) { pr.x = pl.x + pr.pox; pr.y = pl.y - 12; }
      }
      const m = this.stage.main;
      if (pr.y > m.y && pr.x > m.x && pr.x < m.x + m.w) pr.ttl = 0;
    }
    // dying shells detonate exactly once, whatever killed them
    for (const pr of this.projectiles) {
      if (pr.ttl > 0 || pr.boomed) continue;
      if (pr.kind === 'burst' && pr.aoeR) { pr.boomed = true; this._burstBoom(pr); }
      else if (pr.fireR) { pr.boomed = true; this._fireBoom(pr); }
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
          credit.pct = Math.max(0, credit.pct - 50);
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
          this.projectiles = this.projectiles.filter(p => !(p.kind === 'anchor' && p.owner === f.id));
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
    // Death drops the kit: the CR sunk into it is gone — no sell-back — and
    // the wallet immediately re-buys as much of the same build as it can
    // afford, base stats first, then weapon, abilities, augments.
    const redo = this._rebuyBuild(f.baseBuild || emptyBuild(), f.score.cr || 0);
    f.score.cr = redo.cr;
    f.baseBuild = redo.build;
    f.tryBuild = null;
    f.st = derivedStats(redo.build);
    f.jumps = Math.min(f.jumps, f.st.maxJumps);
    f.maxHp = f.st.maxHp;                       // hp is 0; revive tops up to the new ceiling
    this.events.push({ e: 'rebuild', id: f.id, build: redo.build, cr: redo.cr });
  }

  // Greedily re-purchase a lost kit from a wallet: stat levels first (round-
  // robin across the four stats so partial funds spread evenly), then the
  // weapon, then abilities and augments in owned order. Unaffordable pieces
  // are skipped, not queued — whatever CR remains stays in the wallet.
  _rebuyBuild(old, wallet) {
    const build = emptyBuild();
    let cr = wallet;
    for (let lvl = 1; lvl <= 5; lvl++) {
      for (const s of STATS) {
        if ((old.stats?.[s.id] || 0) >= lvl && cr >= s.cost) { build.stats[s.id]++; cr -= s.cost; }
      }
    }
    const w = WEAPONS.find(x => x.id === old.weapon);
    if (w && w.cost <= cr) { build.weapon = w.id; cr -= w.cost; }
    for (const id of old.abilities || []) {
      const a = ABILITIES.find(x => x.id === id);
      if (a && a.cost <= cr && build.abilities.length < 2) { build.abilities.push(id); cr -= a.cost; }
    }
    for (const id of old.augments || []) {
      const a = AUGMENTS.find(x => x.id === id);
      if (a && a.cost <= cr && build.augments.length < 2) { build.augments.push(id); cr -= a.cost; }
    }
    return { build, cr };
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
    this.projectiles = this.projectiles.filter(p => !(p.kind === 'anchor' && p.owner === f.id));
    f.state = 'respawn';
    f.stateT = 0;
    f.invuln = RESPAWN_INVULN;
    f.jumps = f.st.maxJumps;
    f.burn = null;
    f.stunned = false;
  }

  // ---------- co-op enemies ----------

  // Difficulty tier from fought time: creeps come faster, in greater numbers,
  // and from a nastier mix as the tier climbs. Kept gentle so it never spikes,
  // and clocked on runT so time parked in the workshop doesn't count.
  _difficulty() { return Math.floor(this.runT / DIFF_STEP); }

  _stepEnemies() {
    const live = this._liveFighters;
    live.length = 0;
    for (const f of this.fighters) if (!f.dead && !f.parked) live.push(f);
    const level = this._difficulty();
    const plats = this.platsNow();

    let bossAlive = false;
    for (const e of this.enemies) {
      if (e.hp > 0 && (ENEMY_TYPES[e.kind] || ENEMY_TYPES.grunt).boss) { bossAlive = true; break; }
    }

    if (live.length) {
      this.runT += TICK;
      // spawn: faster and up to a bigger swarm the longer the run goes —
      // but while a boss holds the field, the trickle slows to a drip so
      // the duel stays the show
      let spawnEvery = Math.max(ENEMY_MIN_SPAWN, ENEMY_BASE_SPAWN - level * ENEMY_SPAWN_RAMP);
      if (bossAlive) spawnEvery = Math.max(spawnEvery, BOSS_SPAWN_SLOW);
      const maxEnemies = Math.min(ENEMY_MAX_CAP, ENEMY_BASE_MAX + level * ENEMY_CAP_PER_LEVEL);
      let partyX = 0;
      for (const f of live) partyX += f.x;
      partyX /= live.length;
      const biome = expanseBiomeAt(this.seed, partyX);
      if (this._biomeRegion == null) this._biomeRegion = biome.region;
      else if (biome.region !== this._biomeRegion) {
        this._biomeRegion = biome.region;
        // every third region a boss bars the road instead of the patrol
        if (Math.abs(biome.region) % BOSS_REGION_EVERY === 2 && !bossAlive) {
          this._spawnBoss(live, level);
          bossAlive = true;
        } else this._spawnBiomePatrol(live, level, maxEnemies, biome.id);
      }
      const lowParty = live.every(f => f.hp / f.maxHp < 0.38);
      if (lowParty && !this.recoveryT && this.enemies.length < maxEnemies - 2) {
        this.recoveryT = 5;
        this._spawnHeart(partyX, this.stage.main.y - 12);
        this.events.push({ e: 'recovery', x: partyX, y: this.stage.main.y - 12 });
      }
      if (this.recoveryT > 0) this.recoveryT -= TICK;
      this.enemySpawnT -= TICK;
      if (this.enemySpawnT <= 0 && this.recoveryT <= 0 && this.enemies.length < maxEnemies) {
        this.enemySpawnT = spawnEvery;
        const count = !bossAlive && level > 0 && this.rng() < 0.28 ? Math.min(3, maxEnemies - this.enemies.length) : 1;
        const side = this.rng() < 0.5 ? -1 : 1;
        for (let i = 0; i < count; i++) this._spawnEnemy(live, level, side, i, count);
      }
    } else {
      // Whole party parked (workshop edits, lobby detours): the run holds its
      // breath. The clock and spawner freeze, and the return gets a beat of
      // grace before the next creep wanders in.
      this.enemySpawnT = Math.max(this.enemySpawnT, PARK_SPAWN_GRACE);
    }

    const floor = this.stage.main.y;
    for (const e of this.enemies) {
      if (e.ally) continue;   // summons run on their own clock — see _stepAllies
      const t = ENEMY_TYPES[e.kind] || ENEMY_TYPES.grunt;
      const tgt = this._enemyTarget(e, live);
      // facing locks through a windup so a telegraphed swing can be dodged
      // by stepping around the creep
      if (tgt && e.windup <= 0) e.facing = Math.sign(tgt.x - e.x) || e.facing;

      if (e.stagger > 0) {
        e.stagger = Math.max(0, e.stagger - TICK);
        e.windup = 0;
        e.vx = approach(e.vx, 0, t.accel * TICK);
        if (!t.fly) e.vy = Math.min(MAX_FALL, e.vy + GRAV * TICK);
      } else if (e.rushT > 0) {
        // boss mid-rush (charge / dive): barrel along, clipping whoever it hits
        e.rushT -= TICK;
        if (!t.fly) e.vy = Math.min(MAX_FALL, e.vy + GRAV * TICK);
        this._bossRushContact(e, t, live);
        if (t.fly && e.y > floor - e.hh - 6) { e.y = floor - e.hh - 6; e.vy = 0; e.rushT = 0; }
        if (e.rushT <= 0) { e.vx *= 0.25; if (t.fly) e.vy = -180; e.rushHit = null; }
      } else if (e.windup > 0) {
        // telegraphing: plant in place, then loose the shot / swing the strike
        e.windup -= TICK;
        e.vx = approach(e.vx, 0, t.accel * TICK);
        if (t.fly) e.vy = approach(e.vy, 0, t.accel * TICK);
        else e.vy = Math.min(MAX_FALL, e.vy + GRAV * TICK);
        if (e.windup <= 0) {
          e.windup = 0;
          if (t.boss) this._bossAttack(e, t, live);
          else if (t.ranged) this._enemyFire(e, t, tgt);
          else this._enemyStrike(e, t, live);
        }
      } else if (e.barrage) {
        // signature set piece resolving: hold still while the locked strike
        // points fire off one by one on their own clock
        e.vx = approach(e.vx, 0, t.accel * TICK);
        if (t.fly) e.vy = approach(e.vy, 0, t.accel * TICK);
        else e.vy = Math.min(MAX_FALL, e.vy + GRAV * TICK);
        const bar = e.barrage;
        bar.timer -= TICK;
        while (bar.timer <= 0 && bar.idx < bar.pts.length) {
          this._resolveBarragePoint(e, t, bar, bar.pts[bar.idx]);
          bar.idx++;
          bar.timer += bar.every;
        }
        if (bar.idx >= bar.pts.length) e.barrage = null;
      } else if (t.fly) {
        // flyer: home straight in at altitude, ignoring gravity, holding at
        // the edge of its strike arc instead of parking inside the target
        if (tgt) {
          const speed = t.speed * (e.temperament === 'bold' ? 1.15 : 1) * (t.boss ? this._bossVar(e).spd : 1);
          const hold = Math.abs(tgt.x - e.x) < (t.reach + e.hw) * 0.85;
          let want = hold ? 0 : Math.sign(tgt.x - e.x) * speed;
          if (want !== 0 && !t.boss && this._enemyBlocked(e, t, Math.sign(want))) want = 0;
          e.vx = approach(e.vx, want, t.accel * TICK);
          e.vy = approach(e.vy, clamp(((tgt.y - 30) - e.y) * 3, -t.speed, t.speed), t.accel * TICK);
        } else { e.vx = approach(e.vx, 0, t.accel * TICK); e.vy = approach(e.vy, 0, t.accel * TICK); }
      } else {
        // ground types: chase under gravity
        e.vy = Math.min(MAX_FALL, e.vy + GRAV * TICK);
        const speed = t.speed * (e.temperament === 'bold' ? 1.15 : 1) * (t.boss ? this._bossVar(e).spd : 1);
        let desired = tgt ? Math.sign(tgt.x - e.x) * speed : 0;
        // melee creeps stop at the edge of their strike arc: the swarm forms
        // a fightable front line rather than a pile standing inside its prey
        if (!t.ranged && tgt && Math.abs(tgt.x - e.x) < (t.reach + e.hw) * 0.85) desired = 0;
        if (e.temperament === 'cautious' && tgt && !t.ranged && Math.abs(tgt.x - e.x) < 115) desired = -Math.sign(tgt.x - e.x) * speed * 0.55;
        // queue discipline: never push into a packmate directly ahead — wait
        // for the line to move instead of compressing it into a blob
        if (desired !== 0 && !t.boss && this._enemyBlocked(e, t, Math.sign(desired))) desired = 0;
        if (t.ranged && tgt) {
          const d = Math.abs(tgt.x - e.x);
          if (d < t.range * 0.65) desired = Math.sign(e.x - tgt.x) * t.speed * 0.6;  // kite back
          else if (d < t.range) desired = 0;                                          // hold at range
          if (!t.boss && e.atkCd <= 0 && d < t.range * 1.15 && Math.abs(tgt.y - e.y) < 220) {
            e.windup = t.windup; e.atkCd = t.atkCd;
            this.events.push({ e: 'telegraph', x: e.x, y: e.y, kind: e.kind });
          }
        }
        e.vx = approach(e.vx, desired, t.accel * TICK);
        // hopper: spring up to chase a target perched above it
        if (t.jump && e.grounded && tgt && tgt.y < e.y - 70 && this.rng() < 0.05) { e.vy = -1000; e.grounded = false; }
      }

      // melee types: plant and telegraph a swing once a fighter is in reach.
      // Nothing lands until the windup ends — step out of the arc (or stagger
      // the creep with a hit) and the swing whiffs.
      if (!t.ranged && !t.boss && e.stagger <= 0 && e.windup <= 0 && e.atkCd <= 0 && tgt
          && (t.fly || e.grounded)
          && Math.abs(tgt.x - e.x) < t.reach + e.hw + F_W / 2
          && Math.abs(tgt.y - e.y) < e.hh + F_H / 2 + 26) {
        e.windup = t.windup;
        e.atkCd = t.atkCd * (0.75 + this.rng() * 0.5);
        this.events.push({ e: 'telegraph', x: e.x, y: e.y, kind: e.kind });
      }

      // bosses: once in engagement range, pick one of three telegraphed attacks
      // (or, rarely, off cooldown, the signature set piece)
      if (t.boss && tgt && e.stagger <= 0 && e.windup <= 0 && e.rushT <= 0 && e.atkCd <= 0 && !e.barrage
          && (t.fly || e.grounded) && Math.abs(tgt.x - e.x) < 640) {
        this._bossTelegraph(e, t, tgt);
      }

      e.x += e.vx * TICK;
      e.y += e.vy * TICK;

      // ground contact: the main floor or any platform below the feet
      if (!t.fly) {
        e.grounded = false;
        if (e.vy >= 0) {
          const feet = e.y + e.hh;
          if (feet >= floor && feet <= floor + 46) { e.y = floor - e.hh; e.vy = 0; e.grounded = true; }
          else for (const p of plats) {
            if (feet >= p.y && feet <= p.y + 22 && e.x > p.x && e.x < p.x + p.w) { e.y = p.y - e.hh; e.vy = 0; e.grounded = true; break; }
          }
        }
      }

      if (e.atkCd > 0) e.atkCd -= TICK;
      if (e.sigCd > 0) e.sigCd -= TICK;
      if (e.hurt > 0) e.hurt -= TICK;
      if (e.burn) this._burnEnemy(e);
    }

    this._separateEnemies();

    // Recycle stragglers behind the forward-only party so the encounter keeps
    // pressure ahead instead of wasting the active swarm off-screen to the left.
    // Skipped while everyone is parked — no party position to measure against.
    if (live.length) {
      let cx = 0;
      for (const f of live) cx += f.x;
      cx /= live.length;
      let kept = 0;
      for (const e of this.enemies) {
        const t = ENEMY_TYPES[e.kind] || ENEMY_TYPES.grunt;
        // bosses never teleport-recycle (that would heal-and-ambush); a party
        // that outruns one far enough simply escapes it. Summons stick with
        // their summoner — never recycled or distance-culled.
        if (e.hp <= 0 || (!e.ally && (e.x > cx + ENEMY_DESPAWN || (t.boss && e.x < cx - ENEMY_DESPAWN)))) continue;
        if (!t.boss && !e.ally && e.x < cx - ENEMY_RECYCLE_BEHIND) this._recycleEnemy(e, cx);
        this.enemies[kept++] = e;
      }
      this.enemies.length = kept;
    }

    this._stepHearts(live, plats);
  }

  // Soft crowd separation: creeps sharing a layer (ground vs air) shoulder
  // past each other instead of compressing into one dense blob, so a swarm
  // spreads into a line that can be fought edge-first. Position-based with a
  // gentle per-tick cap — it relaxes stacks without popping anyone around.
  // Ties break by spawn id so the host and any handoff resolve identically.
  // Is a packed same-layer creep standing directly ahead in this direction?
  // Used as queue discipline: the follower waits for the line to advance
  // rather than plowing into its packmate and compressing the crowd.
  _enemyBlocked(e, t, dir) {
    for (const o of this.enemies) {
      if (o === e || o.hp <= 0) continue;
      const to = ENEMY_TYPES[o.kind] || ENEMY_TYPES.grunt;
      if (!!to.fly !== !!t.fly) continue;
      if (Math.abs(o.y - e.y) > e.hh + o.hh) continue;
      const dx = o.x - e.x;
      if (Math.sign(dx) === dir && Math.abs(dx) < e.hw + o.hw + 10) return true;
    }
    return false;
  }

  _separateEnemies() {
    const es = this.enemies;
    const step = ENEMY_SEP_PUSH * TICK;
    for (let i = 0; i < es.length; i++) {
      const a = es[i];
      if (a.hp <= 0) continue;
      const fa = !!(ENEMY_TYPES[a.kind] || ENEMY_TYPES.grunt).fly;
      for (let j = i + 1; j < es.length; j++) {
        const b = es[j];
        if (b.hp <= 0) continue;
        const fb = !!(ENEMY_TYPES[b.kind] || ENEMY_TYPES.grunt).fly;
        if (fa !== fb) continue;                         // different layers pass freely
        const minD = (a.hw + b.hw) * ENEMY_SEP_GAP;
        const dx = b.x - a.x;
        if (Math.abs(dx) >= minD || Math.abs(a.y - b.y) > a.hh + b.hh) continue;
        const dir = dx !== 0 ? Math.sign(dx) : (a.eid < b.eid ? 1 : -1);
        const push = Math.min(step, (minD - Math.abs(dx)) / 2);
        a.x -= dir * push;
        b.x += dir * push;
        if (fa) {                                        // flyers also spread vertically
          const dy = b.y - a.y;
          if (Math.abs(dy) < 34) {
            const dirY = dy !== 0 ? Math.sign(dy) : (a.eid < b.eid ? 1 : -1);
            const pushY = Math.min(step, (34 - Math.abs(dy)) / 2);
            a.y -= dirY * pushY;
            b.y += dirY * pushY;
          }
        }
      }
    }
  }

  _recycleEnemy(e, partyX) {
    const t = ENEMY_TYPES[e.kind] || ENEMY_TYPES.grunt;
    e.x = partyX + 760 + this.rng() * 280;
    e.y = t.fly ? this.stage.main.y - 190 - this.rng() * 150 : this.stage.main.y - e.hh;
    e.vx = 0; e.vy = 0; e.hp = e.maxHp;
    e.facing = -1; e.grounded = !t.fly;
    e.hurt = 0; e.windup = 0; e.stagger = 0;
    e.atkCd = (t.atkCd || 0) * (0.4 + this.rng() * 0.6);
    e.burn = null; e.focusId = null;
  }

  // Weighted pick of what wanders in next. Grunts stay common; tougher and
  // trickier types unlock as the difficulty tier climbs.
  _pickEnemyKind(level, biome = null) {
    const pool = [
      ['grunt', 5, 0], ['runner', 3, 1], ['hopper', 2, 1],
      ['flyer', 2, 2], ['slinger', 2, 2], ['brute', 1, 3],
    ].filter(([, , ml]) => level >= ml).map(([kind, weight, ml]) => [kind, weight + (BIOME_ENEMY_WEIGHTS[biome]?.[kind] || 0), ml]);
    let total = 0; for (const p of pool) total += p[1];
    let r = this.rng() * total;
    for (const [kind, w] of pool) { r -= w; if (r <= 0) return kind; }
    return 'grunt';
  }

  _spawnEnemy(live, level, side = this.rng() < 0.5 ? -1 : 1, slot = 0, count = 1, forcedKind = null, elite = false) {
    const cx = live.reduce((s, f) => s + f.x, 0) / live.length;
    const biome = expanseBiomeAt(this.seed, cx).id;
    const kind = forcedKind || this._pickEnemyKind(level, biome);
    const t = ENEMY_TYPES[kind];
    const hp = Math.round(t.hp * (1 + Math.min(1.2, level * 0.08)) * (elite ? 1.65 : 1));
    const cr = Math.floor((1 + Math.floor(level / 2) + ({ flyer: 1, slinger: 1, brute: 2 }[kind] || 0) + (elite ? 3 : 0)) * 5 / 2);
    const hh = t.h / 2, hw = t.w / 2;
    const formationOffset = (slot - (count - 1) / 2) * 72;
    this.enemies.push({
      eid: nextEid++, kind, hw, hh,
      x: cx + side * (760 + this.rng() * 280) + formationOffset,
      y: t.fly ? this.stage.main.y - 190 - this.rng() * 150 : this.stage.main.y - hh,
      vx: 0, vy: 0, hp, maxHp: hp,
      cr,
      facing: -side, grounded: !t.fly, hurt: 0,
      windup: 0, atkCd: (t.atkCd || 0) * (0.4 + this.rng() * 0.6),   // stagger the first shot
      stagger: 0,
      temperament: ENEMY_TEMPERAMENTS[Math.floor(this.rng() * ENEMY_TEMPERAMENTS.length)],
      focusId: null,
      elite,
      variant: 0, rushT: 0, rushHit: null, atkKind: 0, aimX: 0, aimY: 0,
    });
  }

  // A boss bars the road ahead of the party. Type rolls on the run rng; the
  // variation tier climbs with the difficulty level, so late runs meet the
  // nastier cousins of each boss.
  _spawnBoss(live, level) {
    const kind = BOSS_KINDS[Math.floor(this.rng() * BOSS_KINDS.length)];
    const variant = Math.min(2, Math.floor(level / 4));
    const t = ENEMY_TYPES[kind];
    const v = BOSS_VARIANTS[kind][variant];
    const cx = live.reduce((s, f) => s + f.x, 0) / live.length;
    const hw = t.w / 2, hh = t.h / 2;
    const hp = Math.round(t.hp * v.hp * (1 + Math.min(1, level * 0.05)));
    const x = cx + 900;
    const y = t.fly ? this.stage.main.y - 220 : this.stage.main.y - hh;
    this.enemies.push({
      eid: nextEid++, kind, hw, hh, x, y,
      vx: 0, vy: 0, hp, maxHp: hp,
      cr: 25 + level * 5 + variant * 10,      // a real bounty on top of the heart burst
      facing: -1, grounded: !t.fly, hurt: 0,
      windup: 0, atkCd: 1.6,                  // a beat of menace before the first telegraph
      stagger: 0,
      temperament: 'bold',
      focusId: null,
      elite: false,
      variant, rushT: 0, rushHit: null, atkKind: 0, aimX: 0, aimY: 0,
      sigCd: 6, barrage: null, sigPts: null,  // signature set piece: grace, active barrage, locked strike points
    });
    this.events.push({ e: 'boss', name: v.name, kind, variant, x, y });
  }

  _spawnBiomePatrol(live, level, maxEnemies, biome) {
    const choices = BIOME_PATROLS[biome] || BIOME_PATROLS.battlefield;
    const unlocked = choices.filter(kind => {
      const minLevel = { grunt: 0, runner: 1, hopper: 1, flyer: 2, slinger: 2, brute: 3 }[kind];
      return level >= minLevel;
    });
    const count = Math.min(Math.max(2, unlocked.length), maxEnemies - this.enemies.length);
    if (!count || !unlocked.length) return;
    const side = this.rng() < 0.5 ? -1 : 1;
    const elite = biome !== 'battlefield' && Math.abs(this._biomeRegion) % 3 === 2;
    for (let i = 0; i < count; i++) this._spawnEnemy(live, level, side, i, count, unlocked[i % unlocked.length], elite && i === 0);
    const cx = live.reduce((sum, f) => sum + f.x, 0) / live.length;
    this.events.push({ e: 'patrol', biome, name: `${MAPS[biome].name}`, count, x: cx, y: this.stage.main.y - 180 });
  }

  _enemyTarget(e, live) {
    if (e.temperament === 'vengeful' && e.focusId) {
      const focus = live.find(f => f.id === e.focusId);
      if (focus) return focus;
    }
    if (e.temperament === 'pack') {
      let target = null, best = Infinity;
      for (const f of live) {
        const score = f.hp / f.maxHp * 600 + Math.abs(f.x - e.x);
        if (score < best) { best = score; target = f; }
      }
      return target;
    }
    return this._nearestPlayer(e, live);
  }

  // A telegraphed creep looses a slow, dodgeable shot at where the target is now.
  _enemyFire(e, t, tgt) {
    const target = tgt || this._nearestPlayer(e, this.fighters.filter(f => !f.dead && !f.parked));
    let dx = e.facing, dy = 0;
    if (target) { dx = target.x - e.x; dy = (target.y - 8) - e.y; const n = Math.hypot(dx, dy) || 1; dx /= n; dy /= n; }
    const spd = t.shotSpd || 360;
    this.projectiles.push({
      eid: nextEid++, kind: 'foeshot', owner: 'e' + e.eid, foe: true,
      x: e.x + dx * (e.hw + 8), y: e.y - 4 + dy * 8,
      vx: dx * spd, vy: dy * spd, ttl: 2.4,
      dmg: t.shotDmg || 7, kb: 260, ks: 4, r: 12,
    });
    this.events.push({ e: 'foefire', x: e.x, y: e.y, kind: e.kind });
  }

  // A melee creep's windup ends: swing a strike box ahead of the facing it
  // locked when the telegraph began. Whoever is still inside gets shoved
  // mostly sideways (a low pop, not a juggle launch) and a mercy window of
  // invulnerability so a crowd can't chain-stun.
  _enemyStrike(e, t, live, dmgMult = 1) {
    const half = (t.reach || 50) / 2;
    const sx = e.x + e.facing * (e.hw + half);
    for (const f of live) {
      if (f.invuln > 0) continue;
      const ob = hurtBox(f);
      if (Math.abs(f.x - sx) < half + F_W / 2 && Math.abs((f.y + ob.dy) - e.y) < e.hh + 26 + ob.hh) {
        const dmg = this._shielded(f, t.dmg * dmgMult);
        const dir = Math.sign(f.x - e.x) || e.facing;
        f.vx += dir * t.touchKb;
        f.vy = Math.min(f.vy, -150);
        f.grounded = false;
        f.state = 'hitstun'; f.stateT = 0; f.hitstunFor = 0.26;
        f.atk = null; f.atkDir = null; f.melee = null; f.chg = 0;
        this.events.push({ e: 'hit', x: f.x, y: f.y, dmg: Math.round(dmg), heavy: dmg >= 6, vic: f.id, att: 'e' + e.eid });
        this._damageHp(f, dmg, 'e' + e.eid);
        f.invuln = Math.max(f.invuln, ENEMY_HIT_MERCY);
      }
    }
    // summons standing in the arc get clipped too — a summon can tank a
    // swing for the party, at the price of its own hide
    for (const o of this.enemies) {
      if (!o.ally || o.hp <= 0) continue;
      if (Math.abs(o.x - sx) < half + o.hw && Math.abs(o.y - e.y) < e.hh + 26 + o.hh) {
        o.hp -= t.dmg * dmgMult;
        o.hurt = 0.14;
        o.vx += (Math.sign(o.x - e.x) || e.facing) * t.touchKb;
        if (!(ENEMY_TYPES[o.kind] || ENEMY_TYPES.grunt).fly) { o.vy = Math.min(o.vy, -150); o.grounded = false; }
        this.events.push({ e: 'hit', x: o.x, y: o.y, dmg: Math.round(t.dmg * dmgMult), heavy: false, vic: 'e' + o.eid, att: 'e' + e.eid });
        if (o.hp <= 0) this._enemyDied(o, null);
      }
    }
    this.events.push({ e: 'strike', x: sx, y: e.y, kind: e.kind, facing: e.facing });
  }

  // ---------- summoned allies ----------

  // A summon is a creep that fights FOR its summoner: it lives in
  // this.enemies (so it streams, interpolates, and hands off exactly like
  // any creep) but carries `ally` (the summoner's fighter id) and `life`
  // (seconds left). Allies are stepped by _stepAllies in BOTH modes —
  // _stepEnemies skips them — and target creeps in co-op, rivals in PvP.
  _summonAlly(f, kind) {
    const t = ENEMY_TYPES[kind] || ENEMY_TYPES.grunt;
    // per-layer cap: at the limit, the weakest of your summons in that
    // layer is dismissed on the spot to make room for the fresh arrival
    let weakest = null, count = 0;
    for (const e of this.enemies) {
      if (e.ally !== f.id || e.hp <= 0) continue;
      if (!!(ENEMY_TYPES[e.kind] || ENEMY_TYPES.grunt).fly !== !!t.fly) continue;
      count++;
      if (!weakest || e.hp < weakest.hp) weakest = e;
    }
    if (count >= SUMMON_CAP && weakest) {
      this.events.push({ e: 'summonout', x: weakest.x, y: weakest.y, kind: weakest.kind });
      this.enemies.splice(this.enemies.indexOf(weakest), 1);
    }
    const hw = t.w / 2, hh = t.h / 2;
    this.enemies.push({
      eid: nextEid++, kind, hw, hh,
      x: f.x + f.facing * 70,
      y: t.fly ? f.y - 50 : f.y + F_H / 2 - hh,
      vx: 0, vy: 0, hp: t.hp, maxHp: t.hp, cr: 0,
      facing: f.facing, grounded: false, hurt: 0,
      windup: 0, atkCd: 0.6, stagger: 0,
      temperament: 'bold', focusId: null, elite: false,
      variant: 0, rushT: 0, rushHit: null, atkKind: 0, aimX: 0, aimY: 0,
      ally: f.id, life: SUMMON_LIFE,
    });
    this.events.push({ e: 'summon', x: f.x + f.facing * 70, y: f.y - 20, kind, id: f.id });
  }

  // Who a summon hunts: the nearest live creep in co-op; in PvP the
  // nearest rival — fighter or rival summon, whichever is closer. A summon
  // whose owner has vanished (host handoff edge) goes passive rather than
  // guessing.
  _allyTarget(e, owner) {
    if (!owner) return null;
    let best = null, bestD = Infinity;
    if (this.coop) {
      for (const o of this.enemies) {
        if (o.ally || o.hp <= 0) continue;
        const d = Math.abs(o.x - e.x) + Math.abs(o.y - e.y);
        if (d < bestD) { bestD = d; best = o; }
      }
    } else {
      for (const f of this.fighters) {
        if (f.dead || f.parked || f.id === e.ally) continue;
        const d = Math.abs(f.x - e.x) + Math.abs(f.y - e.y);
        if (d < bestD) { bestD = d; best = f; }
      }
      for (const o of this.enemies) {
        if (o.hp <= 0 || !o.ally || o.ally === e.ally) continue;
        const d = Math.abs(o.x - e.x) + Math.abs(o.y - e.y);
        if (d < bestD) { bestD = d; best = o; }
      }
    }
    return best;
  }

  // The summon's telegraphed windup ends: ranged kinds loose a shot owned
  // by the summoner (so the normal projectile pipeline handles who it can
  // hurt); melee kinds swing a strike box ahead of their locked facing.
  _allyStrike(e, t, owner) {
    if (!owner || owner.dead) return;
    if (t.ranged) {
      const tgt = this._allyTarget(e, owner);
      let dx = e.facing, dy = 0;
      if (tgt) { dx = tgt.x - e.x; dy = (tgt.y - 8) - e.y; const n = Math.hypot(dx, dy) || 1; dx /= n; dy /= n; }
      const spd = t.shotSpd || 360;
      this.projectiles.push({
        eid: nextEid++, kind: 'bolt', owner: owner.id,
        x: e.x + dx * (e.hw + 8), y: e.y - 4 + dy * 8,
        vx: dx * spd, vy: dy * spd, ttl: 1.6,
        dmg: t.shotDmg || 3, kb: 200, ks: 8, r: 11,
      });
      this.events.push({ e: 'foefire', x: e.x, y: e.y, kind: e.kind });
      return;
    }
    const half = (t.reach || 50) / 2;
    const sx = e.x + e.facing * (e.hw + half);
    const spec = { dmg: t.dmg, kb: t.touchKb, ks: 10 };
    if (this.coop) {
      for (const o of this.enemies) {
        if (o.ally || o.hp <= 0) continue;
        if (Math.abs(o.x - sx) < half + o.hw && Math.abs(o.y - e.y) < e.hh + 26 + o.hh) {
          this._hitEnemy(owner, o, spec, deg(-30), Math.sign(o.x - e.x) || e.facing, false);
        }
      }
    } else {
      for (const o of this.fighters) {
        if (o.dead || o.id === owner.id || o.invuln > 0) continue;
        const ob = hurtBox(o);
        if (Math.abs(o.x - sx) < half + F_W / 2 && Math.abs((o.y + ob.dy) - e.y) < e.hh + 26 + ob.hh) {
          this._applyHit(owner, o, spec, deg(-30), Math.sign(o.x - e.x) || e.facing);
        }
      }
      // rival summons in the arc get carved too — summons duel summons
      for (const o of this.enemies) {
        if (o.hp <= 0 || !o.ally || o.ally === owner.id) continue;
        if (Math.abs(o.x - sx) < half + o.hw && Math.abs(o.y - e.y) < e.hh + 26 + o.hh) {
          this._hitEnemy(owner, o, spec, deg(-30), Math.sign(o.x - e.x) || e.facing, false);
        }
      }
    }
    this.events.push({ e: 'strike', x: sx, y: e.y, kind: e.kind, facing: e.facing });
  }

  // Per-tick summon behavior, shared by both modes: chase the mark, plant
  // and telegraph a strike in reach, heel back to the summoner when there's
  // nothing to fight, and fade out when the clock (or the hide) runs out.
  _stepAllies() {
    let any = false;
    for (const e of this.enemies) if (e.ally) { any = true; break; }
    if (!any) return;
    const floor = this.stage.main.y;
    const plats = this.platsNow();
    const b = this.stage.blast;
    let kept = 0;
    for (const e of this.enemies) {
      if (!e.ally) { this.enemies[kept++] = e; continue; }
      const t = ENEMY_TYPES[e.kind] || ENEMY_TYPES.grunt;
      e.life -= TICK;
      const blasted = b && (e.x < b.l || e.x > b.r || e.y < b.t || e.y > b.b);
      if (e.hp <= 0 || e.life <= 0 || blasted) {
        if (e.hp > 0) this.events.push({ e: 'summonout', x: e.x, y: e.y, kind: e.kind });
        continue;   // dropped from the array
      }
      const owner = this.fighters.find(f => f.id === e.ally);
      const tgt = this._allyTarget(e, owner);
      if (tgt && e.windup <= 0) e.facing = Math.sign(tgt.x - e.x) || e.facing;

      if (e.stagger > 0) {
        e.stagger = Math.max(0, e.stagger - TICK);
        e.windup = 0;
        e.vx = approach(e.vx, 0, t.accel * TICK);
        if (!t.fly) e.vy = Math.min(MAX_FALL, e.vy + GRAV * TICK);
      } else if (e.windup > 0) {
        e.windup -= TICK;
        e.vx = approach(e.vx, 0, t.accel * TICK);
        if (t.fly) e.vy = approach(e.vy, 0, t.accel * TICK);
        else e.vy = Math.min(MAX_FALL, e.vy + GRAV * TICK);
        if (e.windup <= 0) { e.windup = 0; this._allyStrike(e, t, owner); }
      } else {
        // chase the mark; with nothing to fight, heel beside the summoner
        const goal = tgt || owner;
        const hold = tgt ? (t.ranged ? t.range * 0.7 : (t.reach + e.hw) * 0.85) : 90;
        let want = 0;
        if (goal && Math.abs(goal.x - e.x) > hold) want = Math.sign(goal.x - e.x) * t.speed;
        e.vx = approach(e.vx, want, t.accel * TICK);
        if (t.fly) {
          const wantY = goal ? clamp(((goal.y - 30) - e.y) * 3, -t.speed, t.speed) : 0;
          e.vy = approach(e.vy, wantY, t.accel * TICK);
        } else {
          e.vy = Math.min(MAX_FALL, e.vy + GRAV * TICK);
          if (t.jump && e.grounded && goal && goal.y < e.y - 70 && this.rng() < 0.05) { e.vy = -1000; e.grounded = false; }
        }
        const rx = t.ranged ? t.range : t.reach + e.hw + ((tgt && tgt.hw) || F_W / 2);
        const ry = t.ranged ? 260 : e.hh + ((tgt && tgt.hh) || F_H / 2) + 26;
        if (tgt && e.atkCd <= 0 && (t.fly || e.grounded)
            && Math.abs(tgt.x - e.x) < rx && Math.abs(tgt.y - e.y) < ry) {
          e.windup = t.windup;
          e.atkCd = t.atkCd * (0.75 + this.rng() * 0.5);
          this.events.push({ e: 'telegraph', x: e.x, y: e.y, kind: e.kind });
        }
      }

      e.x += e.vx * TICK;
      e.y += e.vy * TICK;
      if (!t.fly) {
        e.grounded = false;
        if (e.vy >= 0) {
          const feet = e.y + e.hh;
          if (feet >= floor && feet <= floor + 46) { e.y = floor - e.hh; e.vy = 0; e.grounded = true; }
          else for (const p of plats) {
            if (feet >= p.y && feet <= p.y + 22 && e.x > p.x && e.x < p.x + p.w) { e.y = p.y - e.hh; e.vy = 0; e.grounded = true; break; }
          }
        }
      }
      if (e.atkCd > 0) e.atkCd -= TICK;
      if (e.hurt > 0) e.hurt -= TICK;
      if (e.burn) this._burnEnemy(e);
      this.enemies[kept++] = e;
    }
    this.enemies.length = kept;
  }

  // ---------- bosses ----------

  _bossVar(e) { return (BOSS_VARIANTS[e.kind] || BOSS_VARIANTS.colossus)[e.variant || 0] || BOSS_VARIANTS[e.kind][0]; }

  // Every boss blow funnels through here: heavy shove, hitstun, and the same
  // post-hit mercy window regular creeps grant. originX lets a barrage point
  // knock victims away from where the blow actually landed rather than from
  // the boss itself, which may be standing well clear of it.
  _bossHit(e, t, f, dmg, kb, pop, originX = e.x) {
    dmg = this._shielded(f, dmg);
    const dir = Math.sign(f.x - originX) || e.facing;
    f.vx += dir * kb;
    f.vy = Math.min(f.vy, pop);
    f.grounded = false;
    f.state = 'hitstun'; f.stateT = 0; f.hitstunFor = 0.3;
    f.atk = null; f.atkDir = null; f.melee = null; f.chg = 0;
    this.events.push({ e: 'hit', x: f.x, y: f.y, dmg: Math.round(dmg), heavy: true, vic: f.id, att: 'e' + e.eid });
    this._damageHp(f, dmg, 'e' + e.eid);
    f.invuln = Math.max(f.invuln, ENEMY_HIT_MERCY);
  }

  // Pick which of the three attacks to telegraph, by spacing with a dash of
  // rng. Aim is locked NOW — spot attacks land where the target stood when
  // the windup began, so watching the telegraph is what saves you. Once the
  // signature's own long cooldown has cleared, there's a chance the boss
  // reaches for that instead of its regular three.
  _bossTelegraph(e, t, tgt) {
    if (e.sigCd <= 0 && this.rng() < BOSS_SIG_CHANCE) { this._bossTelegraphSignature(e, t, tgt); return; }
    const dx = Math.abs(tgt.x - e.x);
    let atk;
    if (e.kind === 'colossus') atk = dx < t.reach + e.hw ? 0 : dx < 460 && this.rng() < 0.55 ? 1 : 2;
    else if (e.kind === 'tempest') atk = dx < t.reach + e.hw && Math.abs(tgt.y - e.y) < 140 ? 0 : this.rng() < 0.5 ? 1 : 2;
    else atk = dx < 190 ? 2 : this.rng() < 0.55 ? 0 : 1;
    e.atkKind = atk;
    e.aimX = tgt.x; e.aimY = tgt.y;
    e.windup = BOSS_ATTACKS[e.kind][atk];
    e.atkCd = t.atkCd * (0.8 + this.rng() * 0.4);
    this.events.push({ e: 'telegraph', x: e.x, y: e.y, kind: e.kind });
    // the warlock's eruption marks its landing spot on the ground
    if (e.kind === 'warlock' && atk === 1) {
      this.events.push({ e: 'bosswarn', x: e.aimX, y: this.stage.main.y, r: 150, life: e.windup });
    }
  }

  // The rare fourth attack: a screen-spanning set piece. Every strike point
  // (or the laser's full sweep lane) is locked in and broadcast to the
  // renderer the instant the windup starts, so the whole hazard is visible
  // for its entire long telegraph — reading it, not reacting to it, is what
  // keeps a party alive.
  _bossTelegraphSignature(e, t, tgt) {
    e.atkKind = 3;
    e.aimX = tgt.x; e.aimY = tgt.y;
    const windup = BOSS_ATTACKS[e.kind][3];
    e.windup = windup;
    e.sigCd = BOSS_SIG_CD;
    e.atkCd = t.atkCd * 1.6;
    const v = this._bossVar(e);
    const floor = this.stage.main.y;
    this.events.push({ e: 'bosssig', kind: e.kind, name: v.name, atk: BOSS_SIG_NAMES[e.kind], x: e.x, y: e.y });

    if (e.kind === 'warlock') {
      // Arcane Laser: a beam lane the full width of a lunge, locked to a
      // side of the boss right now so the entire lane is visible up front —
      // clear it, or simply never stand in it.
      const dir = tgt.x >= e.x ? 1 : -1;
      const x0 = e.x + dir * 120, x1 = x0 + dir * 820;
      e.sigPts = { x0, x1, y: floor };
      this.events.push({ e: 'laserwarn', x0, x1, y: floor, life: windup });
    } else {
      // Meteor Slam / Lightning Storm: a spread of strike points across a
      // wide swath around the party, each marked on the ground up front.
      const n = 6, spread = 760, cx = tgt.x;
      const pts = [];
      for (let i = 0; i < n; i++) {
        pts.push({ x: cx - spread / 2 + (spread / (n - 1)) * i + (this.rng() - 0.5) * 40, y: floor });
      }
      e.sigPts = pts;
      const warnKind = e.kind === 'colossus' ? 'meteormark' : 'lightningmark';
      const r = e.kind === 'colossus' ? 130 : 95;
      for (const p of pts) this.events.push({ e: warnKind, x: p.x, y: p.y, r, life: windup });
    }
  }

  // Resolve the signature attack the telegraph locked in: hand off to a
  // barrage that fires its points on its own clock (see _stepEnemies).
  _bossSignatureResolve(e, t, v, dmg) {
    if (e.kind === 'warlock') {
      const { x0, x1, y } = e.sigPts;
      const n = 7;
      const pts = [];
      for (let i = 0; i < n; i++) pts.push({ x: x0 + (x1 - x0) * (i / (n - 1)), y });
      // 'laserhit' (per-segment) is distinct from 'laserfire' (the beam
      // visual, pushed once below) so the two don't fight over event shape
      e.barrage = { pts, idx: 0, timer: 0, every: 0.09, dmg: dmg * 1.35, kb: 340, pop: -360, mode: 'column', w: 210, r: 0, kind: 'laserhit' };
      this.events.push({ e: 'laserfire', x0, x1, y, life: 0.7 });
    } else if (e.kind === 'colossus') {
      e.barrage = { pts: e.sigPts, idx: 0, timer: 0, every: 0.22, dmg: dmg * 1.55, kb: 300, pop: -480, mode: 'radial', r: 130, w: 0, kind: 'meteor' };
    } else {
      e.barrage = { pts: e.sigPts, idx: 0, timer: 0, every: 0.13, dmg: dmg * 1.6, kb: 320, pop: -520, mode: 'radial', r: 95, w: 0, kind: 'lightning' };
    }
    e.sigPts = null;
  }

  // A single barrage point's turn: hit whoever's standing in it, then flare
  // the impact for the renderer/SFX regardless of whether it connected.
  _resolveBarragePoint(e, t, bar, pt) {
    for (const f of this._liveFighters) {
      if (f.invuln > 0) continue;
      const hit = bar.mode === 'column'
        ? Math.abs(f.x - pt.x) < bar.w / 2
        : Math.abs(f.x - pt.x) < bar.r && Math.abs(f.y - pt.y) < bar.r + 60;
      if (hit) this._bossHit(e, t, f, bar.dmg, bar.kb, bar.pop, pt.x);
    }
    this.events.push({ e: bar.kind, x: pt.x, y: pt.y, r: bar.r, w: bar.w });
  }

  // The windup ended: resolve whichever attack was telegraphed.
  _bossAttack(e, t, live) {
    const v = this._bossVar(e);
    const dmg = t.dmg * v.dmg;
    const a = e.atkKind | 0;
    if (a === 3) { this._bossSignatureResolve(e, t, v, dmg); return; }
    if (e.kind === 'colossus') {
      if (a === 0) this._enemyStrike(e, t, live, v.dmg);           // slam: huge frontal swing
      else if (a === 1) {
        // stomp: a grounded shockwave on both sides — jump to dodge it
        this.events.push({ e: 'stomp', x: e.x, y: this.stage.main.y });
        for (const f of live) {
          if (f.invuln > 0 || !f.grounded) continue;
          if (Math.abs(f.x - e.x) < 330 && Math.abs(f.y - e.y) < 190) this._bossHit(e, t, f, dmg, t.touchKb * 0.8, -420);
        }
      } else {
        // charge: barrel down the lane in the locked facing
        e.rushT = 0.85; e.rushHit = new Set();
        e.vx = e.facing * 640 * v.spd;
        this.events.push({ e: 'strike', x: e.x, y: e.y, kind: e.kind, facing: e.facing });
      }
    } else if (e.kind === 'tempest') {
      if (a === 0) this._enemyStrike(e, t, live, v.dmg);           // talon rake
      else if (a === 1) {
        // dive through the marked spot, pulling up after
        const dx = e.aimX - e.x, dy = (e.aimY + 20) - e.y;
        const n = Math.hypot(dx, dy) || 1;
        e.rushT = 0.55; e.rushHit = new Set();
        e.vx = dx / n * 820 * v.spd; e.vy = dy / n * 820 * v.spd;
        this.events.push({ e: 'strike', x: e.x, y: e.y, kind: e.kind, facing: e.facing });
      } else this._bossShots(e, t, 4, 0.3, v.dmg);                 // volley: fan of four
    } else {
      if (a === 0) this._bossShots(e, t, 3, 0.12, v.dmg);          // bolt burst
      else if (a === 1) {
        // eruption: the marked ground detonates
        const gy = this.stage.main.y;
        this.events.push({ e: 'eruption', x: e.aimX, y: gy });
        for (const f of live) {
          if (f.invuln > 0) continue;
          if (Math.abs(f.x - e.aimX) < 150 && f.y > gy - 200) this._bossHit(e, t, f, dmg * 1.2, 240, -520);
        }
      } else this._bossShotsRadial(e, t, 8, v.dmg);                // nova: ring of bolts
    }
  }

  _bossShots(e, t, n, spread, dmgMult) {
    const base = Math.atan2((e.aimY - 8) - e.y, e.aimX - e.x);
    const spd = t.shotSpd || 430;
    for (let i = 0; i < n; i++) {
      const ang = base + (n > 1 ? (i / (n - 1) - 0.5) * 2 * spread : 0);
      this.projectiles.push({
        eid: nextEid++, kind: 'foeshot', owner: 'e' + e.eid, foe: true,
        x: e.x + Math.cos(ang) * (e.hw + 10), y: e.y - 6 + Math.sin(ang) * 12,
        vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
        ttl: 2.6, dmg: (t.shotDmg || 4) * dmgMult, kb: 300, ks: 4, r: 13,
      });
    }
    this.events.push({ e: 'foefire', x: e.x, y: e.y, kind: e.kind });
  }

  _bossShotsRadial(e, t, n, dmgMult) {
    const spd = (t.shotSpd || 430) * 0.85;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2;
      this.projectiles.push({
        eid: nextEid++, kind: 'foeshot', owner: 'e' + e.eid, foe: true,
        x: e.x + Math.cos(ang) * (e.hw + 10), y: e.y - 6 + Math.sin(ang) * (e.hh * 0.5),
        vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
        ttl: 2.2, dmg: (t.shotDmg || 4) * dmgMult, kb: 280, ks: 4, r: 13,
      });
    }
    this.events.push({ e: 'foefire', x: e.x, y: e.y, kind: e.kind });
  }

  // Contact damage while a boss charge/dive is in flight: each fighter can
  // only be clipped once per rush.
  _bossRushContact(e, t, live) {
    const v = this._bossVar(e);
    for (const f of live) {
      if (f.invuln > 0 || e.rushHit?.has(f.id)) continue;
      const ob = hurtBox(f);
      if (Math.abs(f.x - e.x) < e.hw + F_W / 2 && Math.abs((f.y + ob.dy) - e.y) < e.hh + ob.hh) {
        e.rushHit?.add(f.id);
        this._bossHit(e, t, f, t.dmg * v.dmg, t.touchKb, -300);
      }
    }
  }

  // ---------- hearts ----------

  _spawnHeart(x, y, vx = (this.rng() * 2 - 1) * 70, vy = -260) {
    this.hearts.push({ hid: nextEid++, x, y: y - 10, vx, vy, grounded: false, t: 0, taken: false });
  }

  _stepHearts(live, plats) {
    const floor = this.stage.main.y;
    for (const h of this.hearts) {
      h.t += TICK;
      if (!h.grounded) {
        h.vy = Math.min(MAX_FALL, h.vy + GRAV * TICK);
        h.vx = approach(h.vx, 0, 400 * TICK);
        h.x += h.vx * TICK; h.y += h.vy * TICK;
        if (h.vy >= 0) {
          if (h.y >= floor - 12) { h.y = floor - 12; h.vy = 0; h.grounded = true; }
          else for (const p of plats) {
            if (h.y >= p.y - 14 && h.y <= p.y + 6 && h.x > p.x && h.x < p.x + p.w) { h.y = p.y - 12; h.vy = 0; h.grounded = true; break; }
          }
        }
      }
      // picked up the instant any live fighter touches it
      for (const f of live) {
        if (Math.abs(f.x - h.x) < F_W / 2 + 18 && Math.abs(f.y - h.y) < F_H / 2 + 18) { this._pickupHeart(h, live); break; }
      }
    }
    this.hearts = this.hearts.filter(h => !h.taken && h.t < HEART_LIFE);
  }

  // Grabbing a heart mends everyone nearby, so keeping the party close pays off.
  _pickupHeart(h, live) {
    if (h.taken) return;
    h.taken = true;
    for (const f of live) {
      if (Math.hypot(f.x - h.x, f.y - h.y) <= HEART_AOE) f.hp = Math.min(f.maxHp, f.hp + HEART_HEAL);
    }
    this.events.push({ e: 'heart', x: h.x, y: h.y });
  }

  _nearestPlayer(e, live) {
    let best = null, bd = Infinity;
    for (const f of live) {
      const d = Math.abs(f.x - e.x);
      if (d < bd) { bd = d; best = f; }
    }
    return best;
  }

  _rebuildEnemyGrid() {
    for (const cell of this._enemyGridTouched) {
      cell.length = 0;
      this._enemyGridPool.push(cell);
    }
    this._enemyGridTouched.length = 0;
    this._enemyGrid.clear();
    for (const e of this.enemies) {
      if (e.hp <= 0) continue;
      const key = Math.floor(e.x / ENEMY_GRID_CELL);
      let cell = this._enemyGrid.get(key);
      if (!cell) {
        cell = this._enemyGridPool.pop() || [];
        this._enemyGrid.set(key, cell);
        this._enemyGridTouched.push(cell);
      }
      cell.push(e);
    }
  }

  // A fighter's blow lands on a creep: chip its HP, knock it back, and pay the
  // attacker in score (which is what mints expedition credits).
  _hitEnemy(att, e, spec, angRad, dirX, spike) {
    let dmg = spec.dmg * att.st.dmgMult;
    if (spec.r && att.st.augments.includes('sniper')) dmg *= 1.2;
    // brawler: the bare tap kit bites harder out on the road too
    if (att.st.augments.includes('brawler') && spec.tap) {
      dmg *= 1.25;
      this.events.push({ e: 'augment', aug: 'brawler', id: att.id, x: att.x, y: att.y });
    }
    // berserker: raging while badly hurt (co-op stand-in for high-percent fury)
    if (att.st.augments.includes('berserker') && att.hp <= att.maxHp * COOP_BERSERK_HP) {
      dmg *= 1.2;
      this.events.push({ e: 'augment', aug: 'berserker', id: att.id, x: att.x, y: att.y });
    }
    // momentum: fast-moving melee bites harder out on the road too
    if (att.st.augments.includes('momentum') && !spec.r
        && (att.atkSpd > 320 || Math.hypot(att.vx, att.vy) > 320)) {
      dmg *= 1.15;
      this.events.push({ e: 'augment', aug: 'momentum', id: att.id, x: att.x, y: att.y });
    }
    // executioner: extra bite finishing off a nearly-dead creep
    if (att.st.augments.includes('executioner') && e.hp <= e.maxHp * COOP_EXEC_HP) {
      dmg *= 1.2;
      this.events.push({ e: 'augment', aug: 'executioner', id: att.id, x: e.x, y: e.y });
    }
    e.hp -= dmg;
    e.focusId = att.id;
    this._staggerEnemy(e);
    e.hurt = 0.14;
    att.score.dmg += dmg;
    if (dmg > att.score.maxHit) att.score.maxHit = dmg;
    // fireball and friends set creeps alight: a short damage-over-time
    if (spec.dot && e.hp > 0) e.burn = { ...spec.dot, tk: spec.dot.every, by: att.id };
    const kbTaken = (ENEMY_TYPES[e.kind] || ENEMY_TYPES.grunt).kbTaken;
    const kbBoost = PVE_KB_BOOST[e.kind] || 1;
    const kb = (spec.kb + spec.ks * dmg) * att.st.kbMult * kbTaken * kbBoost;
    const ang = spike ? Math.PI / 2 : angRad;
    e.vx = Math.cos(ang) * kb * dirX * (spike ? 0.3 : 1);
    e.vy = Math.sin(ang) * kb;
    if (e.vy < 0) e.grounded = false;
    // vampiric bites heal the striker — the only sustain out on the road
    if (att.st.augments.includes('vampiric')) att.hp = Math.min(att.maxHp, att.hp + dmg * 0.04);
    this.hitPause = Math.min(0.12, HIT_PAUSE + dmg * 0.004);
    this.events.push({ e: 'hit', x: e.x, y: e.y, dmg: Math.round(dmg), heavy: kb > 700, vic: 'e' + e.eid, att: att.id });
    // shield bash: light creeps get blasted aside and the wielder takes
    // their ground; the big ones (brute, bosses) barely budge, so the ram
    // just stops against them instead of parking the wielder inside a boss
    if (spec.bounce) {
      att.dashT = 0;
      att.vx = 0;
      if ((PVE_KB_BOOST[e.kind] || 1) > 2) {
        att.x = e.x;
        this.events.push({ e: 'spikebounce', id: att.id, x: att.x, y: att.y + F_H / 2 });
      }
    }
    if (e.hp <= 0) this._enemyDied(e, att);
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
    this._staggerEnemy(e);
    if (att) { att.score.dmg += dmg; }
    this.events.push({ e: 'burn', x: e.x, y: e.y - e.hh - 6, vic: 'e' + e.eid, dmg: Math.round(dmg) });
    if (--e.burn.n <= 0) e.burn = null;
    if (e.hp <= 0) this._enemyDied(e, att);
  }

  // A creep goes down: pay the killer, maybe drop a heart, tell the renderer.
  // Downed summons pay nothing — no bounty, no KO credit, no hearts.
  _enemyDied(e, att) {
    e.hp = 0;
    if (att && !e.ally) {
      att.score.ko++;
      att.score.cr += e.cr || 1;
      if (e.elite) att.score.elite++;
      if (att.st.augments.includes('reaper')) att.hp = Math.min(att.maxHp, att.hp + att.maxHp * 0.02);
    }
    this.events.push({ e: 'enemyko', x: e.x, y: e.y, id: 'e' + e.eid, kind: e.kind, cr: e.ally ? 0 : (e.cr || 1), att: e.ally ? null : (att?.id || null) });
    if (e.ally) return;
    const t = ENEMY_TYPES[e.kind] || ENEMY_TYPES.grunt;
    if (t.boss) {
      // defeat fireworks: hearts burst in every direction for the whole party
      const n = BOSS_HEARTS + (e.variant || 0) * 2;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const spd = 240 + this.rng() * 220;
        this._spawnHeart(e.x, e.y, Math.cos(a) * spd, Math.sin(a) * spd - 340);
      }
      this.events.push({ e: 'bossdown', x: e.x, y: e.y, kind: e.kind, variant: e.variant || 0, name: this._bossVar(e).name });
    } else if (this.rng() < HEART_DROP_CHANCE) this._spawnHeart(e.x, e.y);
  }

  // Small enemies lose their attack and contact priority when struck. Brutes
  // deliberately power through hits, giving the roster a readable exception.
  _staggerEnemy(e) {
    if (e.kind === 'brute' || ENEMY_TYPES[e.kind]?.boss || e.hp <= 0) return;
    e.stagger = 0.32;
    e.windup = 0;
    e.atkCd = Math.max(e.atkCd || 0, 0.2);
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

  snapshot(centerX = null, radius = Infinity) {
    const inRange = entity => centerX == null || Math.abs(entity.x - centerX) <= radius;
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
          [f.score.ko, f.score.fall, f.score.sd, r1(f.score.dmg), r1(f.score.taken), r1(f.score.maxHit), f.score.cr || 0, f.score.elite || 0],
          r2(f.burnT),
          r2(f.slideT),
          f.parked ? 1 : 0,
          r1(f.mana),
          r2(f.hitstunFor || 0),
          f.stunned ? 1 : 0,
          r2(f.ffLockT),
          r1(f.hp), f.maxHp, r2(f.downT),   // co-op health (indices 42,43,44)
          r2(f.jumpT),                      // live jump-cut window (index 45)
          f.comboN, r2(f.comboT),           // tap combo chain state (indices 46,47)
        ];
      }),
      p: this.projectiles.filter(inRange).map(p => [p.eid, p.kind, r1(p.x), r1(p.y), r1(p.vx), r1(p.r || 0)]),
      en: this.enemies.filter(inRange).map(e => [e.eid, r1(e.x), r1(e.y), r1(e.hp), e.maxHp, e.facing, e.hurt > 0 ? 1 : 0, e.kind, r2(e.windup || 0), e.cr || 1, e.temperament || 'bold', e.elite ? 1 : 0, r2(e.stagger || 0), e.variant || 0, e.atkKind || 0, r1(e.aimX || 0), r1(e.aimY || 0), e.ally || 0, r2(e.life || 0)]),
      ht: this.hearts.filter(inRange).map(h => [h.hid, r1(h.x), r1(h.y), r2(HEART_LIFE - h.t)]),
      ev: this.events.slice(),
    };
  }

  snapshotDelta(cache, centerX, radius) {
    const snapshot = this.snapshot(centerX, radius);
    for (const type of ['p', 'en', 'ht']) {
      const previous = cache[type];
      const current = new Map();
      const changed = [];
      for (const row of snapshot[type]) {
        const id = row[0];
        const signature = row.join('|');
        current.set(id, { row, signature });
        if (previous.get(id)?.signature !== signature) changed.push(row);
      }
      const removed = [];
      for (const id of previous.keys()) if (!current.has(id)) removed.push(id);
      cache[type] = current;
      snapshot['d' + type] = [changed, removed];
      delete snapshot[type];
    }
    return snapshot;
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
  // carry the creeps + hearts over so a host handoff doesn't blink them away
  g.enemies = (snap.en || []).map(r => {
    const kind = r[7] || 'grunt';
    const t = ENEMY_TYPES[kind] || ENEMY_TYPES.grunt;
    return {
      eid: r[0], x: r[1], y: r[2], vx: 0, vy: 0, hp: r[3], maxHp: r[4] || t.hp,
      facing: r[5] || 1, kind, hw: t.w / 2, hh: t.h / 2,
      grounded: !t.fly, hurt: 0, windup: r[8] || 0, atkCd: t.atkCd || 0, cr: r[9] || 1, temperament: r[10] || 'bold', elite: !!r[11], stagger: r[12] || 0, variant: r[13] || 0,
      rushT: 0, rushHit: null, atkKind: r[14] || 0, aimX: r[15] || 0, aimY: r[16] || 0,
      // summons carry their owner id in full JSON snapshots; a delta-built
      // row only carries a truthy flag, and the orphaned summon goes passive
      ally: r[17] || null, life: +r[18] || 0,
      sigCd: 3, barrage: null, sigPts: null,  // a handoff drops any in-flight barrage; the boss just resumes cold
    };
  });
  g.hearts = (snap.ht || []).map(r => ({
    hid: r[0], x: r[1], y: r[2], vx: 0, vy: 0, grounded: true, taken: false,
    t: Math.max(0, HEART_LIFE - (r[3] || 0)),
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
    if (sc) f.score = { ko: sc[0] | 0, fall: sc[1] | 0, sd: sc[2] | 0, dmg: +sc[3] || 0, taken: +sc[4] || 0, maxHit: +sc[5] || 0, cr: sc[6] | 0, elite: sc[7] | 0 };
    f.burnT = +row[35] || 0;
    f.slideT = +row[36] || 0;
    f.parked = !!row[37];
    if (row.length > 38) f.mana = +row[38] || 0;
    if (row.length > 39) f.hitstunFor = +row[39] || 0;
    if (row.length > 40) f.stunned = !!row[40];
    if (row.length > 41) f.ffLockT = +row[41] || 0;
    if (row.length > 43) { f.hp = +row[42] || 0; f.maxHp = +row[43] || f.maxHp; f.downT = +row[44] || 0; }
    if (row.length > 45) f.jumpT = +row[45];
    if (row.length > 47) { f.comboN = row[46] | 0; f.comboT = +row[47] || 0; }
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

// Build render-only enemy views between two authoritative snapshots. Keeping
// this outside the simulation makes PvE motion smooth without predicting AI
// or changing host authority, combat, snapshot cadence, or handoff state.
export function interpolateEnemyRows(aRows, bRows, k, from = new Map(), out = []) {
  from.clear();
  for (const e of aRows || []) from.set(e[0], e);
  const rows = bRows || [];
  out.length = rows.length;
  for (let i = 0; i < rows.length; i++) {
    const e2 = rows[i];
    const e1 = from.get(e2[0]) || e2;
    const view = out[i] || (out[i] = {});
    view.eid = e2[0];
    view.x = e1[1] + (e2[1] - e1[1]) * k;
    view.y = e1[2] + (e2[2] - e1[2]) * k;
    view.hp = e2[3]; view.maxHp = e2[4]; view.facing = e2[5]; view.hurt = !!e2[6]; view.kind = e2[7] || 'grunt'; view.windup = e2[8] || 0; view.temperament = e2[10] || 'bold'; view.elite = !!e2[11]; view.stagger = e2[12] || 0; view.variant = e2[13] || 0; view.atkKind = e2[14] || 0; view.aimX = e2[15] || 0; view.aimY = e2[16] || 0; view.ally = !!e2[17];
  }
  return out;
}

export function blankInput() {
  return {
    mx: 0, my: 0, jump: false, jr: false, ff: false, drop: false, atk: null, roll: 0,
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
