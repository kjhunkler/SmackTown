// Player profile: username, color, and fighter build. Persisted in localStorage.

export const COLORS = [
  '#ff5470', '#ffb02e', '#3ddc84', '#38b6ff',
  '#b388ff', '#ff8a5c', '#f5f5f5', '#00e5c3',
];

export const TOTAL_CREDITS = 1000;

export const STATS = [
  { id: 'power',   name: 'Power',   desc: '+7% damage & knockback per level',      cost: 80, max: 5 },
  { id: 'speed',   name: 'Speed',   desc: '+6% run speed per level',               cost: 80, max: 5 },
  { id: 'defense', name: 'Defense', desc: '-5% knockback taken per level',         cost: 80, max: 5 },
  { id: 'agility', name: 'Agility', desc: '+jump height & air control per level',  cost: 80, max: 5 },
];

export const ABILITIES = [
  { id: 'fireball',  icon: '🔥', name: 'Fireball',    cost: 220, cd: 3.0,
    desc: 'Hurl a projectile that burns for 6%' },
  { id: 'dashstrike',icon: '⚡', name: 'Dash Strike', cost: 200, cd: 4.0,
    desc: 'Lunge forward with a rushing blow' },
  { id: 'shockwave', icon: '💥', name: 'Shockwave',   cost: 250, cd: 6.0,
    desc: 'Slam the ground, blasting everyone nearby' },
  { id: 'uppercut',  icon: '🥊', name: 'Uppercut',    cost: 200, cd: 5.0,
    desc: 'Rising punch that launches enemies skyward' },
  { id: 'counter',   icon: '🛡️', name: 'Counter',     cost: 240, cd: 5.0,
    desc: 'Brief parry — negate a hit and strike back' },
  { id: 'blink',     icon: '✨', name: 'Blink',       cost: 260, cd: 4.0,
    desc: 'Teleport a short distance in any direction' },
];

export const AUGMENTS = [
  { id: 'vampiric',    icon: '🩸', name: 'Vampiric',     cost: 180,
    desc: 'Heal 15% of the damage you deal' },
  { id: 'thorns',      icon: '🌵', name: 'Thorns',       cost: 150,
    desc: 'Melee attackers take 3% recoil damage' },
  { id: 'feather',     icon: '🪶', name: 'Featherweight',cost: 120,
    desc: '+1 midair jump, but you fly 8% further when hit' },
  { id: 'heavy',       icon: '🗿', name: 'Heavyweight',  cost: 160,
    desc: '-12% knockback taken, but -8% run speed' },
  { id: 'berserker',   icon: '😤', name: 'Berserker',    cost: 170,
    desc: '+25% damage while your own percent is 80+' },
  { id: 'secondwind',  icon: '💫', name: 'Second Wind',  cost: 200,
    desc: 'Once per stock: heal 30% when you pass 100%' },
];

export const MAX_ABILITIES = 2;
export const MAX_AUGMENTS = 2;

export function emptyBuild() {
  return {
    stats: { power: 0, speed: 0, defense: 0, agility: 0 },
    abilities: [],
    augments: [],
  };
}

export function buildCost(build) {
  let total = 0;
  for (const s of STATS) total += (build.stats[s.id] || 0) * s.cost;
  for (const id of build.abilities) {
    const a = ABILITIES.find(x => x.id === id);
    if (a) total += a.cost;
  }
  for (const id of build.augments) {
    const a = AUGMENTS.find(x => x.id === id);
    if (a) total += a.cost;
  }
  return total;
}

// Clamp/repair an incoming build (also used by the host to validate remote
// players so nobody joins with an over-budget build).
export function sanitizeBuild(raw) {
  const b = emptyBuild();
  if (raw && typeof raw === 'object') {
    for (const s of STATS) {
      const v = raw.stats && raw.stats[s.id];
      b.stats[s.id] = Math.min(s.max, Math.max(0, Math.floor(Number(v) || 0)));
    }
    if (Array.isArray(raw.abilities)) {
      b.abilities = raw.abilities
        .filter(id => ABILITIES.some(a => a.id === id))
        .slice(0, MAX_ABILITIES);
    }
    if (Array.isArray(raw.augments)) {
      b.augments = raw.augments
        .filter(id => AUGMENTS.some(a => a.id === id))
        .slice(0, MAX_AUGMENTS);
    }
  }
  if (buildCost(b) > TOTAL_CREDITS) return emptyBuild();
  return b;
}

const KEY = 'smacktown.profile.v1';
let profile = null;

export function loadProfile() {
  if (profile) return profile;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (raw && typeof raw.name === 'string' && raw.name.trim()) {
      profile = {
        name: String(raw.name).slice(0, 14),
        color: COLORS.includes(raw.color) ? raw.color : COLORS[0],
        build: sanitizeBuild(raw.build),
      };
      return profile;
    }
  } catch (_) { /* corrupted storage — treat as first run */ }
  return null;
}

export function saveProfile(p) {
  profile = {
    name: String(p.name).trim().slice(0, 14),
    color: COLORS.includes(p.color) ? p.color : COLORS[0],
    build: sanitizeBuild(p.build),
  };
  localStorage.setItem(KEY, JSON.stringify(profile));
  return profile;
}

export function validName(name) {
  const n = String(name || '').trim();
  return n.length >= 2 && n.length <= 14 && /^[\w \-'!.]+$/.test(n);
}

// Derived combat stats used by the sim (must match on host & clients).
export function derivedStats(build) {
  const b = sanitizeBuild(build);
  const has = id => b.augments.includes(id);
  return {
    dmgMult:   1 + 0.07 * b.stats.power,
    kbMult:    1 + 0.07 * b.stats.power,
    speedMult: (1 + 0.06 * b.stats.speed) * (has('heavy') ? 0.92 : 1),
    kbTaken:   (1 - 0.05 * b.stats.defense) * (has('heavy') ? 0.88 : 1) * (has('feather') ? 1.08 : 1),
    jumpMult:  1 + 0.05 * b.stats.agility,
    airMult:   1 + 0.08 * b.stats.agility,
    maxJumps:  2 + (has('feather') ? 1 : 0),
    abilities: b.abilities,
    augments:  b.augments,
  };
}

export function buildSummary(build) {
  const b = sanitizeBuild(build);
  const parts = [];
  const statBits = STATS.filter(s => b.stats[s.id] > 0)
    .map(s => `${s.name} ${b.stats[s.id]}`);
  if (statBits.length) parts.push(statBits.join(' · '));
  const abil = b.abilities.map(id => ABILITIES.find(a => a.id === id)?.name).filter(Boolean);
  if (abil.length) parts.push(abil.join(' + '));
  const augs = b.augments.map(id => AUGMENTS.find(a => a.id === id)?.name).filter(Boolean);
  if (augs.length) parts.push(augs.join(' + '));
  return parts.length ? parts.join('\n') : 'Stock fighter — visit the workshop!';
}
