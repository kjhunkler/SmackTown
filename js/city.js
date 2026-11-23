// Collision and scenery share room-local coordinates, including the train roofs.
const ledge = (x, y, w) => ({ x, y, w });
const district = (name, art, colors, foes, plats, limit = 565) => ({
  name, art, colors, foes, plats, limit,
  main: { x: -limit - 80, y: 0, w: 2 * (limit + 80), h: 50 },
  blast: { l: -limit - 200, r: limit + 200, t: -700, b: 360 },
});

const carRoofs = [];
for (let x = -3080; x < 3100; x += 440) {
  carRoofs.push(ledge(x, -132, 395), ledge(x + 398, -68, 41));
}

export const CITY_ROOMS = {
  market: district('Lantern Market', 'market', ['#31252d', '#72564a', '#cea579'],
    ['grunt', 'runner', 'grunt'], [ledge(-310, -124, 180), ledge(76, -180, 172)]),
  alley: district('Fire Escape Alley', 'alley', ['#25202d', '#564458', '#bb98a8'],
    ['runner', 'grunt', 'hopper'], [ledge(-390, -88, 135), ledge(-180, -173, 174), ledge(160, -123, 143)]),
  roofs: district('Signal Heights', 'roofs', ['#31282e', '#73545b', '#d2a18d'],
    ['flyer', 'runner', 'hopper'], [ledge(-260, -135, 178), ledge(68, -227, 196)]),
  parking: district('Midnight Parking', 'parking', ['#292e3a', '#53596b', '#c2ad8d'],
    ['runner', 'grunt', 'slinger'], [ledge(-330, -74, 156), ledge(90, -93, 191)]),
  cistern: district('Undertow Works', 'cistern', ['#1c3039', '#406063', '#90b7a8'],
    ['hopper', 'runner', 'grunt'], [ledge(-190, -153, 135), ledge(155, -98, 182)]),
  factory: district('Furnace Hall', 'factory', ['#352b2b', '#715449', '#c6a07b'],
    ['grunt', 'brute', 'runner', 'grunt'], [ledge(-400, -106, 220), ledge(-55, -190, 180), ledge(240, -88, 155)]),
  lab: district('Specimen Lab', 'lab', ['#1e3039', '#3c646a', '#99c0bb'],
    ['hopper', 'grunt', 'slinger'], [ledge(-320, -144, 168), ledge(-12, -83, 154), ledge(207, -178, 152)]),
  cars: district('Freight Line', 'roofs', ['#232d38', '#595561', '#b69a8d'],
    ['runner', 'hopper', 'flyer', 'grunt'], carRoofs, 3200),
  train: district('Last Train', 'train', ['#292e39', '#585967', '#baa58c'],
    ['runner', 'grunt', 'hopper'], [ledge(-376, -100, 185), ledge(156, -125, 208)]),
};

// The open vestibule is centered at x = 0 on the station platform.
export const TRAIN_DOOR_HALF_WIDTH = 85;
export const TRAVEL_HOLD = .42;
export const GATEKEEPER_GRACE = 10;
export const CITY_ROUTE = Object.keys(CITY_ROOMS);
export function nextDistrict(room, side) {
  return CITY_ROUTE[(CITY_ROUTE.indexOf(room) + side + CITY_ROUTE.length) % CITY_ROUTE.length];
}

export const newCity = () => ({
  room: 'market', reachedTrain: false, wave: 0, wait: .55, visit: 0, pumpTick: 0,
  left: 0, right: 0, required: 0, hold: 0, locked: false, boarding: 0,
  openingWave: null, gatekeeperSpawned: false, gatekeeperReadyAt: 0,
});

export function showMarketExit(state) {
  return state.room === 'market' && state.visit === 0 && state.openingWave?.length === 0 && !state.locked;
}

export function arrive(f, x, limit) {
  f.x = Math.max(-limit + 24, Math.min(limit - 24, x));
  f.y = -32; f.vx = 0; f.vy = 0;
  f.grounded = true; f.ridePlat = null; f.ledge = 0;
  f.state = f.dead ? 'dead' : 'idle'; f.stateT = 0;
  f.atk = null; f.atkDir = null; f.melee = null; f.hammerFlight = null;
  f.chg = 0; f.dashT = 0; f.slideT = 0; f.fastfall = false;
  f.pendingShock = false; f.stunned = false; f.jumps = f.st.maxJumps;
  f.invuln = Math.max(f.invuln, 1.2);
}

function stepPump(game, live, state) {
  state.pumpTick = (state.pumpTick + 1) % 420;
  if (state.pumpTick === 390) {
    for (const f of live) {
      if (f.y < -86 || f.invuln > 0) continue;
      game._damageHp(f, 4, null, true);
      if (!f.dead) { f.vy = -460; f.grounded = false; f.invuln = .65; }
    }
    for (const e of game.enemies) {
      if (e.ally || e.hp <= 0 || e.y < -86) continue;
      e.hp -= 4; e.vy = -400; e.grounded = false; e.stagger = .45;
      if (e.hp <= 0) game._enemyDied(e, null);
    }
  }
}

function spawnWave(game, live, room, capacity) {
  const state = game.cityRun;
  state.wave++;
  const level = game._difficulty();
  const size = Math.min(capacity, 4 + live.length + Math.floor(state.wave / 2), 16);
  const side = game.rng() < .5 ? -1 : 1;
  const target = live[Math.floor(game.rng() * live.length)];
  const overhead = state.wave % 3 === 1 || (room.limit > 1000 && room.limit - side * target.x > 1050);
  const dropX = Math.max(-room.limit + 170, Math.min(room.limit - 170, target.x + side * 145));
  for (let i = 0; i < size; i++) {
    const kind = room.foes[Math.floor(game.rng() * room.foes.length)];
    game._spawnEnemy(live, level, side, i, size, kind);
    const e = game.enemies.at(-1);
    if (overhead) {
      e.x = dropX + ((i % 6) - 2.5) * 43;
      e.y = -515 - Math.floor(i / 6) * 65 - game.rng() * 45;
      e.vy = 180; e.grounded = false;
    } else {
      e.x = side * (room.limit + 180 + i * 39);
      e.vx = -side * 185;
    }
  }
  if (state.visit === 0 && state.wave === 1) {
    state.openingWave = game.enemies.slice(-size).map(e => e.eid);
  }
  // Once the crew beats this visit's gatekeeper, later swarms leave the exit open.
  if (state.wave % 6 === 0 && !state.gatekeeperSpawned && game.runT >= state.gatekeeperReadyAt) {
    game._spawnBoss(live, level);
    state.gatekeeperSpawned = true;
    state.locked = true;
  }
  state.wait = Math.max(2.8, 6.2 - state.wave * .14);
}

function travel(game, side) {
  const state = game.cityRun;
  state.room = nextDistrict(state.room, side);
  if (state.room === 'train') state.reachedTrain = true;
  state.visit++;
  state.openingWave = null;
  state.gatekeeperSpawned = false;
  state.left = state.right = state.hold = state.boarding = state.pumpTick = 0;
  const limit = CITY_ROOMS[state.room].limit;
  const entry = -side * (limit - 152);
  game.fighters.forEach((f, i) => arrive(f, entry + side * (i % 5) * 18, limit));
  let followers = 0;
  for (const e of game.enemies) {
    if (e.hp <= 0) continue;
    e.x = e.ally ? entry : -side * (limit + 40 + 30 * followers++);
    e.y = -e.hh; e.vx = side * 150; e.vy = 0;
    e.windup = 0; e.grounded = true;
  }
  game.hearts.length = game.projectiles.length = game.hist.length = 0;
  game._pc = null;
  game.events.push({ e: 'district', room: state.room });
}

export function stepCity(game, live, dt, bossAlive) {
  if (!live.length) return;
  game.runT += dt;
  const state = game.cityRun;
  const room = CITY_ROOMS[state.room];
  state.locked = bossAlive;
  if (bossAlive) state.gatekeeperSpawned = true;
  if (state.room === 'cistern') stepPump(game, live, state);
  if (state.openingWave?.length && !game.enemies.some(e => e.hp > 0 && state.openingWave.includes(e.eid))) {
    state.openingWave = [];
  }
  const active = game.enemies.filter(e => !e.ally && e.hp > 0).length;
  const capacity = Math.min(34, 15 + live.length * 2 + state.wave) - active;
  state.wait = Math.max(0, state.wait - dt);
  if (!active && state.wave) state.wait = Math.min(state.wait, .75);
  if (!state.wait && capacity >= 4) spawnWave(game, live, room, capacity);

  const party = game.fighters.filter(f => !f.parked && f.stocks > 0);
  state.required = party.length;
  function rallyCount(side) {
    const pushing = live.some(f => !f.dead && f.x * side >= room.limit - 6 &&
      side * game.inputs.get(f.id).mx > .35);
    return pushing ? party.filter(f => !f.dead && f.x * side >= room.limit - 96).length : 0;
  }
  const marketShortcutSealed = state.room === 'market' && !state.reachedTrain;
  state.left = marketShortcutSealed ? 0 : rallyCount(-1);
  state.right = rallyCount(1);
  const together = party.length > 0 && (state.left === party.length || state.right === party.length);
  state.hold = together && !state.locked ? state.hold + dt : 0;
  if (state.hold >= TRAVEL_HOLD) {
    travel(game, state.left ? -1 : 1);
    return;
  }

  const board = state.room === 'train' && !state.locked && party.length && party.every(f =>
    !f.dead && f.grounded && Math.abs(f.x) < TRAIN_DOOR_HALF_WIDTH && game.inputs.get(f.id).my > .55);
  state.boarding = board ? state.boarding + dt : 0;
  if (state.boarding >= 1) { game.won = true; game._endRun('cleared'); }
}
