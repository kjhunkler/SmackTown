// Player profile: username, color, and fighter build. Persisted in localStorage.

export const COLORS = [
  '#ff5470', '#ffb02e', '#3ddc84', '#38b6ff',
  '#b388ff', '#ff8a5c', '#f5f5f5', '#00e5c3',
];

export const TOTAL_CREDITS = 1000;

export const STATS = [
  { id: 'power',   name: 'Power',   desc: '+5% damage & knockback per level',      cost: 80, max: 5 },
  { id: 'speed',   name: 'Speed',   desc: '+6% run speed per level',               cost: 80, max: 5 },
  { id: 'defense', name: 'Defense', desc: '-6% knockback & -4% damage taken per level', cost: 80, max: 5 },
  { id: 'agility', name: 'Agility', desc: '+jump height & air control per level',  cost: 80, max: 5 },
];

export const ABILITIES = [
  { id: 'fireball',  icon: '🔥', name: 'Fireball',    cost: 220, cd: 3.0,
    desc: 'Hurl a projectile that sets foes ablaze — burns over time' },
  { id: 'dashstrike',icon: '⚡', name: 'Dash Strike', cost: 200, cd: 4.0,
    desc: 'Lunge with a rushing blow — hold up to launch skyward' },
  { id: 'shockwave', icon: '💥', name: 'Shockwave',   cost: 250, cd: 6.0,
    desc: 'Slam the ground, blasting everyone nearby' },
  { id: 'uppercut',  icon: '🥊', name: 'Uppercut',    cost: 200, cd: 4.0,
    desc: 'Rising punch that rockets enemies into the sky' },
  { id: 'counter',   icon: '🛡️', name: 'Counter',     cost: 240, cd: 5.0,
    desc: 'Brief parry — negate a hit and strike back' },
  { id: 'blink',     icon: '✨', name: 'Blink',       cost: 260, cd: 4.0,
    desc: 'Teleport a short distance in any direction' },
  { id: 'volley',    icon: '🎇', name: 'Fire Volley', cost: 250, cd: 5.0,
    desc: 'Loose a fan of three fire bolts' },
  { id: 'gale',      icon: '💨', name: 'Gale Burst',  cost: 220, cd: 5.0,
    desc: 'Blast of wind that flings everyone near you' },
  { id: 'bubble',    icon: '🫧', name: 'Bubble Shield', cost: 240, cd: 6.0,
    desc: 'Pop a shield — 1.5s of invulnerability' },
  { id: 'mend',      icon: '💚', name: 'Mend',        cost: 260, cd: 7.0,
    desc: 'Patch yourself up — instantly heal 15%' },
  { id: 'hook',      icon: '🪝', name: 'Grapple Hook', cost: 240, cd: 4.5,
    desc: 'Hurl a hook that reels a foe in — harder the further it flew' },
  { id: 'trap',      icon: '🪤', name: 'Spike Trap',   cost: 230, cd: 6.0,
    desc: 'Plant spikes that launch and stun whoever steps in' },
  { id: 'anchor',    icon: '⚓', name: 'Second Wind',  cost: 200, cd: 6.0,
    desc: 'Drop a teleport anchor — hit the button again while it\'s down to warp back to it' },
];

// Weapons: what the strong-attack control swings. Every fighter carries
// exactly one; all weapons are free — each trades the classic smash kit
// for a different gimmick, so the pick is pure style, not budget.
export const WEAPONS = [
  { id: 'unarmed', icon: '👊', name: 'Bare Fists', cost: 0,
    desc: 'The classic smash kit — big damage AND big launches, no strings' },
  { id: 'sword',   icon: '🗡️', name: 'Sword', cost: 0,
    desc: 'Lunging slashes in any direction — huge damage, light launch, charges in a blink' },
  { id: 'magic',   icon: '🔮', name: 'Magic', cost: 0,
    desc: 'Fire bursts that fling foes far — low damage, drains mana, and charge = range' },
  { id: 'spear',   icon: '🔱', name: 'Spear', cost: 0,
    desc: 'Long stationary thrust with a dead zone up close — huge damage at real range' },
  { id: 'boomerang', icon: '🪃', name: 'Boomerang', cost: 0,
    desc: 'Returning blade that cuts out and back — charge for range and bite, one in the air at a time' },
  { id: 'shield',  icon: '🛡️', name: 'Shield', cost: 0,
    desc: 'Battering-ram lunge that blasts foes out of their spot and puts you in it — the victim becomes a live hazard mid-flight, damaging anyone else they crash into. Blunts hits while charging' },
];
export const DEFAULT_WEAPON = 'unarmed';

// Abilities and augments can carry a `pveDesc` where the effect differs in
// expeditions; the shop and loot cards show whichever matches the mode.
export const AUGMENTS = [
  { id: 'vampiric',    icon: '🩸', name: 'Vampiric',     cost: 170,
    desc: 'Heal 12% of the damage you deal',
    pveDesc: 'Heal 4% of the damage you deal' },
  { id: 'thorns',      icon: '🌵', name: 'Thorns',       cost: 160,
    desc: 'Melee attackers take 4% recoil damage' },
  { id: 'feather',     icon: '🪶', name: 'Featherweight',cost: 140,
    desc: '+1 midair jump, but you fly 8% further when hit' },
  { id: 'heavy',       icon: '🗿', name: 'Heavyweight',  cost: 160,
    desc: '-15% knockback taken, but -5% run speed' },
  { id: 'berserker',   icon: '😤', name: 'Berserker',    cost: 170,
    desc: '+20% damage while your own percent is 80+',
    pveDesc: '+20% damage while your HP is low' },
  { id: 'glasscannon', icon: '💎', name: 'Glass Cannon', cost: 170,
    desc: '+18% damage & knockback dealt, +18% knockback taken' },
  { id: 'quickhands',  icon: '⏱️', name: 'Quick Hands',  cost: 180,
    desc: 'Ability cooldowns recover 20% faster' },
  { id: 'acrobat',     icon: '🤸', name: 'Acrobat',      cost: 150,
    desc: 'Landing a hit refreshes your air jumps' },
  { id: 'sniper',      icon: '🎯', name: 'Sniper',       cost: 160,
    desc: 'Your projectiles deal +20% damage' },
  { id: 'momentum',    icon: '🏃', name: 'Momentum',     cost: 150,
    desc: 'Melee hits deal +15% while you move fast' },
  { id: 'brawler',     icon: '🥋', name: 'Brawler',      cost: 160,
    desc: 'Your tap attacks — jabs, the combo string, dash attacks — hit 25% harder' },
  { id: 'bulwark',     icon: '🧱', name: 'Bulwark',      cost: 150,
    desc: 'Your duck guard wears down 40% slower' },
  { id: 'executioner', icon: '🪓', name: 'Executioner',  cost: 160,
    desc: '+20% knockback vs foes at 100% or more',
    pveDesc: '+20% damage vs low-HP enemies' },
  { id: 'reaper',      icon: '💀', name: 'Reaper',       cost: 170,
    desc: 'KO a foe to heal 50%',
    pveDesc: 'Heal 2% for every creep you defeat' },
];

export const MAX_ABILITIES = 2;
export const MAX_AUGMENTS = 2;

// The priciest a fully-legal build can ever cost (every stat maxed, dearest
// weapon, two dearest abilities & augments). Co-op expeditions cap spending
// at accumulated credits instead of the 1000 PvP budget, so their builds are
// validated against this structural ceiling rather than the standard purse.
export const MAX_BUILD_COST = (() => {
  let c = 0;
  for (const s of STATS) c += s.max * s.cost;
  c += Math.max(...WEAPONS.map(w => w.cost));
  const top = (arr, n) => arr.map(x => x.cost).sort((a, b) => b - a).slice(0, n).reduce((s, x) => s + x, 0);
  c += top(ABILITIES, MAX_ABILITIES) + top(AUGMENTS, MAX_AUGMENTS);
  return c;
})();

export function earnedCredits(score) {
  if (!score) return 0;
  return score.cr || 0;
}

// ---------- pixel hats ----------
// A hat is a HAT_W x HAT_H pixel grid drawn in the Hat Studio, worn above
// the fighter's head. Encoded as one string, row-major: '.' = transparent,
// '0'-'f' = an index into HAT_PALETTE. HAT_PX is world units per hat pixel;
// the box is centered on the head (x: ±36) with its brim at y = -16. The
// bottom HAT_FACE_ROWS rows hang below the brim, over the face — room for
// glasses, sideburns, masks. Hats saved before the face rows existed are
// zero-padded at the bottom by sanitizeHat, so old art keeps its position.
export const HAT_W = 24;
export const HAT_H = 23;
export const HAT_FACE_ROWS = 7;   // rows of the grid below the brim line
export const HAT_PX = 3;
export const HAT_CHARS = '0123456789abcdef';
export const HAT_PALETTE = [
  '#10122a', '#ffffff', '#9aa3c7', '#4a2c14',
  '#8a5a2b', '#ff5470', '#ffb02e', '#f5d76e',
  '#3ddc84', '#1e7a4a', '#38b6ff', '#2a5fd0',
  '#b388ff', '#ff8a5c', '#00e5c3', '#ff2e63',
];

// Valid hat string or null (malformed, wrong size, or fully transparent).
// Legacy hats from before the face rows are padded up to the new height.
export function sanitizeHat(raw) {
  if (typeof raw !== 'string') return null;
  if (raw.length === HAT_W * (HAT_H - HAT_FACE_ROWS)) {
    raw += '.'.repeat(HAT_W * HAT_FACE_ROWS);
  }
  if (raw.length !== HAT_W * HAT_H) return null;
  if (!/^[.0-9a-f]+$/.test(raw) || !/[0-9a-f]/.test(raw)) return null;
  return raw;
}

// ---------- hat library ----------
// Hats live in their own store, each under a unique id. The profile and any
// saved build reference their 'selected hat' by id instead of owning the art.

const HATS_KEY = 'smacktown.hats.v1';
export const MAX_HATS = 40;

export function loadHats() {
  try {
    const raw = JSON.parse(localStorage.getItem(HATS_KEY));
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(h => h && typeof h.id === 'string' && sanitizeHat(h.art))
      .slice(0, MAX_HATS)
      .map(h => ({ id: h.id, art: sanitizeHat(h.art) }));
  } catch (_) { return []; }
}

// Resolve a hat id to its pixel art (null if unset or since deleted).
export function hatArt(id) {
  if (typeof id !== 'string') return null;
  return loadHats().find(h => h.id === id)?.art ?? null;
}

// Update an existing hat (matched by id) or mint a new one (id = null).
// Returns {ok, id} or {ok:false, error} with a message fit to show the player.
export function saveHat(art, id = null) {
  const a = sanitizeHat(art);
  if (!a) return { ok: false, error: 'Paint at least one pixel first!' };
  const list = loadHats();
  const i = id ? list.findIndex(h => h.id === id) : -1;
  if (i >= 0) {
    list[i] = { id, art: a };
  } else {
    if (list.length >= MAX_HATS) {
      return { ok: false, error: `You can keep up to ${MAX_HATS} hats — delete one first.` };
    }
    id = 'h' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    list.push({ id, art: a });
  }
  localStorage.setItem(HATS_KEY, JSON.stringify(list));
  return { ok: true, id };
}

export function deleteHat(id) {
  localStorage.setItem(HATS_KEY, JSON.stringify(loadHats().filter(h => h.id !== id)));
}

export function emptyBuild() {
  return {
    stats: { power: 0, speed: 0, defense: 0, agility: 0 },
    weapon: DEFAULT_WEAPON,
    abilities: [],
    augments: [],
  };
}

export function buildCost(build) {
  let total = 0;
  for (const s of STATS) total += (build.stats[s.id] || 0) * s.cost;
  total += WEAPONS.find(w => w.id === build.weapon)?.cost || 0;
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
// players so nobody joins with an over-budget build). The cap defaults to the
// PvP purse; co-op expeditions pass MAX_BUILD_COST so bigger, earned builds
// survive (their real limit is enforced against accumulated credits elsewhere).
export function sanitizeBuild(raw, cap = TOTAL_CREDITS) {
  const b = emptyBuild();
  if (raw && typeof raw === 'object') {
    for (const s of STATS) {
      const v = raw.stats && raw.stats[s.id];
      b.stats[s.id] = Math.min(s.max, Math.max(0, Math.floor(Number(v) || 0)));
    }
    if (WEAPONS.some(w => w.id === raw.weapon)) b.weapon = raw.weapon;
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
  if (buildCost(b) > cap) return emptyBuild();
  return b;
}

const KEY = 'smacktown.profile.v1';
let profile = null;

// Stable identity that survives leaving/rejoining a room (peer ids don't):
// lets the host recognize a returning player and swap them in, not duplicate.
function genPid() {
  try { return crypto.randomUUID(); }
  catch (_) { return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }
}

export function loadProfile() {
  if (profile) return profile;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (raw && typeof raw.name === 'string' && raw.name.trim()) {
      let hatId = typeof raw.hatId === 'string' ? raw.hatId : null;
      if (!hatId && sanitizeHat(raw.hat)) {
        const res = saveHat(raw.hat);        // migrate pre-library inline art
        if (res.ok) hatId = res.id;
      }
      profile = {
        name: String(raw.name).slice(0, 14),
        color: COLORS.includes(raw.color) ? raw.color : COLORS[0],
        build: sanitizeBuild(raw.build),
        hatId,
        hat: hatArt(hatId),                  // resolved art — what the room sees
        pid: typeof raw.pid === 'string' && raw.pid ? raw.pid.slice(0, 40) : genPid(),
      };
      localStorage.setItem(KEY, JSON.stringify(profile));
      return profile;
    }
  } catch (_) { /* corrupted storage — treat as first run */ }
  return null;
}

export function saveProfile(p) {
  const hatId = hatArt(p.hatId) ? p.hatId : null;
  profile = {
    name: String(p.name).trim().slice(0, 14),
    color: COLORS.includes(p.color) ? p.color : COLORS[0],
    build: sanitizeBuild(p.build),
    hatId,
    hat: hatArt(hatId),
    pid: profile?.pid || (typeof p.pid === 'string' && p.pid) || genPid(),
  };
  localStorage.setItem(KEY, JSON.stringify(profile));
  return profile;
}

export function validName(name) {
  const n = String(name || '').trim();
  return n.length >= 2 && n.length <= 14 && /^[\w \-'!.]+$/.test(n);
}

// Derived combat stats used by the sim (must match on host & clients).
// Sanitized against the structural ceiling, not the PvP purse: budget
// enforcement happens where builds enter (host validation, workshop save),
// and expedition run builds legitimately cost more than 1000 cr — capping
// here used to silently strip such fighters to an empty kit.
export function derivedStats(build) {
  const b = sanitizeBuild(build, MAX_BUILD_COST);
  const has = id => b.augments.includes(id);
  const glass = has('glasscannon');
  return {
    dmgMult:   (1 + 0.05 * b.stats.power) * (glass ? 1.2 : 1),
    kbMult:    (1 + 0.05 * b.stats.power) * (glass ? 1.2 : 1),
    speedMult: (1 + 0.06 * b.stats.speed) * (has('heavy') ? 0.95 : 1),
    kbTaken:   (1 - 0.06 * b.stats.defense) * (has('heavy') ? 0.85 : 1)
      * (has('feather') ? 1.08 : 1) * (glass ? 1.18 : 1),
    dmgTaken:  1 - 0.04 * b.stats.defense,
    jumpMult:  1 + 0.05 * b.stats.agility,
    airMult:   1 + 0.08 * b.stats.agility,
    // Co-op health pool (unused by stock matches): Defense doubles as a
    // toughness stat, so a tank build carries more HP through an expedition.
    maxHp:     100 + 25 * b.stats.defense,
    maxJumps:  2 + (has('feather') ? 1 : 0),
    cdMult:    has('quickhands') ? 0.8 : 1,
    weapon:    b.weapon,
    abilities: b.abilities,
    augments:  b.augments,
  };
}

// ---------- saved builds (loadouts) ----------
// Nicknamed presets the player can stash and swap between in the workshop.

const LOADOUT_KEY = 'smacktown.loadouts.v1';
export const MAX_LOADOUTS = 24;

export function validLoadoutName(name) {
  const n = String(name || '').trim();
  return n.length >= 1 && n.length <= 16 && /^[\w \-'!.]+$/.test(n);
}

export function loadLoadouts() {
  try {
    const raw = JSON.parse(localStorage.getItem(LOADOUT_KEY));
    if (!Array.isArray(raw)) return [];
    let migrated = false;
    const list = raw
      .filter(l => l && validLoadoutName(l.name))
      .slice(0, MAX_LOADOUTS)
      .map(l => {
        let hatId = typeof l.hatId === 'string' ? l.hatId : null;
        if (!hatId && sanitizeHat(l.hat)) {
          const res = saveHat(l.hat);        // migrate pre-library inline art
          if (res.ok) { hatId = res.id; migrated = true; }
        }
        return {
          name: String(l.name).trim().slice(0, 16),
          color: COLORS.includes(l.color) ? l.color : COLORS[0],
          build: sanitizeBuild(l.build),
          hatId,
        };
      });
    if (migrated) localStorage.setItem(LOADOUT_KEY, JSON.stringify(list));
    return list;
  } catch (_) { return []; }
}

// Saves (or overwrites, matched by name) a loadout. Returns {ok} or
// {ok:false, error} with a message fit to show the player.
export function saveLoadout(name, color, build, hatId = null) {
  if (!validLoadoutName(name)) {
    return { ok: false, error: 'Nicknames are 1–16 letters, numbers or basic punctuation.' };
  }
  const n = String(name).trim().slice(0, 16);
  const list = loadLoadouts();
  const entry = {
    name: n,
    color: COLORS.includes(color) ? color : COLORS[0],
    build: sanitizeBuild(build),
    hatId: hatArt(hatId) ? hatId : null,
  };
  const i = list.findIndex(l => l.name.toLowerCase() === n.toLowerCase());
  if (i >= 0) list[i] = entry;
  else if (list.length >= MAX_LOADOUTS) {
    return { ok: false, error: `You can keep up to ${MAX_LOADOUTS} builds — delete one first.` };
  } else list.push(entry);
  localStorage.setItem(LOADOUT_KEY, JSON.stringify(list));
  return { ok: true };
}

export function deleteLoadout(name) {
  const n = String(name || '').trim().toLowerCase();
  const list = loadLoadouts().filter(l => l.name.toLowerCase() !== n);
  localStorage.setItem(LOADOUT_KEY, JSON.stringify(list));
  const sel = selectedLoadout();
  if (sel && sel.toLowerCase() === n) selectLoadout(null);
}

// ---------- default characters ----------
// New players shouldn't face a blank workshop: the first run seeds one
// ready-made character per weapon (with their signature hats) into the
// normal hat/loadout stores, so they cycle, edit and delete like any
// player-made character. A one-time flag keeps them from respawning for
// veterans who deliberately clear their roster.

const SEED_KEY = 'smacktown.defaults.v1';

export const DEFAULT_HATS = [
  { id: 'dflt-haymaker',
    art: '............................................................................................................................................................................................................................................................................................................................1111111111111121........5555555555555555....................................................................................................................................................................................................' },
  { id: 'dflt-bladewind',
    art: '........................................................................................................................................................000000000..0......000..00000000000.00....000000000000000000000..0000000000000000000000..0000000022222222222000..0000000002222222222000...000000000000000000000...00000000000000000000.....000000000000000000....................................................................................................................................................................................................' },
  { id: 'dflt-emberlyn',
    art: '..................................................................................................................................000....................000000..................000000..................222212................0000000000......................................................................................................................................................1.......................0.......................0.......................0.......................0.......................0.......................0.......................0' },
  { id: 'dflt-skewer',
    art: '.........................................................................................................................1...................1...1...................1...111....22222222...111....1111222222222222111......11122222222222221........2222222222222222.......222222222222222222......342342342342342342......222222222222222222......222222222222222222........4.......................4.......................4.......................4.......................3..........................................................................................' },
  { id: 'dflt-rebound',
    art: '.....................................................................................0.................0.00..00............00..00000.000.00.........000000000000000.......0..00202000000000.0.....0000000220000020000......000000000002000000....00002000000000000020.....0002220000000002020.....00000200000000000200......00000000.0000000000...000000000.......0000...0000000.0.....667.00.....000000......66.6600......00000......6...6........000........66.66.........0..........666...............4.......2.......................22........................2....' },
  { id: 'dflt-bastion',
    art: '.........................................................................f5.f5..................f.f5fff.f....................5f5......................55f5.....................f5.......................43..................2222222222222122.......222222222222222222......222222222222222222......222222222222222222......222222222222222222......222222222222222222......222222222222222222......222222.2.2.2.2.2.2......222222.2.2.2.2.2.2......222222.2.2.2.2.2.2......222222222222222222......22222222222222222.......22222222222022222.............22222222222....' },
];

export const DEFAULT_LOADOUTS = [
  { name: 'Haymaker', color: '#ffb02e', hatId: 'dflt-haymaker',
    build: { stats: { power: 2, speed: 1, defense: 0, agility: 0 },
      weapon: 'unarmed',
      abilities: ['uppercut', 'dashstrike'],
      augments: ['brawler', 'momentum'] } },
  { name: 'Bladewind', color: '#f5f5f5', hatId: 'dflt-bladewind',
    build: { stats: { power: 0, speed: 1, defense: 0, agility: 1 },
      weapon: 'sword',
      abilities: ['counter', 'blink'],
      augments: ['vampiric', 'acrobat'] } },
  { name: 'Emberlyn', color: '#b388ff', hatId: 'dflt-emberlyn',
    build: { stats: { power: 1, speed: 0, defense: 0, agility: 1 },
      weapon: 'magic',
      abilities: ['fireball', 'volley'],
      augments: ['sniper', 'quickhands'] } },
  { name: 'Skewer', color: '#ff8a5c', hatId: 'dflt-skewer',
    build: { stats: { power: 1, speed: 0, defense: 1, agility: 0 },
      weapon: 'spear',
      abilities: ['hook', 'trap'],
      augments: ['executioner', 'bulwark'] } },
  { name: 'Rebound', color: '#ff5470', hatId: 'dflt-rebound',
    build: { stats: { power: 0, speed: 1, defense: 0, agility: 2 },
      weapon: 'boomerang',
      abilities: ['gale', 'anchor'],
      augments: ['feather', 'glasscannon'] } },
  { name: 'Bastion', color: '#38b6ff', hatId: 'dflt-bastion',
    build: { stats: { power: 0, speed: 0, defense: 2, agility: 0 },
      weapon: 'shield',
      abilities: ['shockwave', 'bubble'],
      augments: ['heavy', 'thorns'] } },
];

export function seedDefaultCharacters() {
  try {
    if (localStorage.getItem(SEED_KEY)) return;
    localStorage.setItem(SEED_KEY, '1');
    // Anything already here means a returning player — never overwrite.
    if (loadProfile() || loadLoadouts().length || loadHats().length) return;
    localStorage.setItem(HATS_KEY, JSON.stringify(DEFAULT_HATS));
    localStorage.setItem(LOADOUT_KEY, JSON.stringify(DEFAULT_LOADOUTS));
  } catch (_) { /* storage unavailable — nothing to seed into */ }
}

// ---------- selected character ----------
// Which saved build the player is currently "being". Tracked by nickname;
// the menu arrows cycle it and the workshop saves back into it.

const SEL_KEY = 'smacktown.loadout.sel.v1';

// Canonical name of the selected loadout, or null if none / since deleted.
export function selectedLoadout() {
  const raw = localStorage.getItem(SEL_KEY);
  if (!raw) return null;
  const hit = loadLoadouts().find(l => l.name.toLowerCase() === raw.toLowerCase());
  return hit ? hit.name : null;
}

export function selectLoadout(name) {
  if (name) localStorage.setItem(SEL_KEY, String(name).trim().slice(0, 16));
  else localStorage.removeItem(SEL_KEY);
}

export function buildSummary(build) {
  const b = sanitizeBuild(build);
  const parts = [];
  const statBits = STATS.filter(s => b.stats[s.id] > 0)
    .map(s => `${s.name} ${b.stats[s.id]}`);
  if (statBits.length) parts.push(statBits.join(' · '));
  const wpn = WEAPONS.find(w => w.id === b.weapon);
  if (wpn && wpn.id !== DEFAULT_WEAPON) parts.push(`${wpn.icon} ${wpn.name}`);
  const abil = b.abilities.map(id => ABILITIES.find(a => a.id === id)?.name).filter(Boolean);
  if (abil.length) parts.push(abil.join(' + '));
  const augs = b.augments.map(id => AUGMENTS.find(a => a.id === id)?.name).filter(Boolean);
  if (augs.length) parts.push(augs.join(' + '));
  return parts.length ? parts.join('\n') : 'Stock fighter — visit the workshop!';
}
