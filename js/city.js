// All districts use room-local coordinates. A snapshot changes the active
// district for the entire party, including sleeping and disconnected seats.
export const CITY_LIMIT = 565;
export const CITY_ROOMS = {
  market: {
    name: 'Lantern Market', art: 'market', color: '#ffc25c', bit: 1,
    source: 'Shutter', entry: [210, -36], foes: ['grunt', 'runner', 'grunt'],
    plats: [{ x: -310, y: -124, w: 180 }, { x: 76, y: -180, w: 172 }],
    doors: [{ x: -482, to: 'roofs', label: 'Roof lift' }, { x: 482, to: 'cistern', label: 'Storm drain' }],
  },
  roofs: {
    name: 'Signal Heights', art: 'roofs', color: '#ff9989', bit: 2,
    relay: { x: 166, y: -227 }, source: 'Sky rift', entry: [185, -253], foes: ['flyer', 'runner', 'slinger', 'flyer', 'hopper'],
    plats: [{ x: -260, y: -135, w: 178 }, { x: 68, y: -227, w: 196 }],
    doors: [{ x: -482, to: 'market', label: 'Street lift' }],
  },
  cistern: {
    name: 'Undertow Works', art: 'cistern', color: '#6bffe0', bit: 4,
    relay: { x: 240, y: -98 }, source: 'Spillway', entry: [-260, -30], foes: ['hopper', 'runner', 'runner', 'brute', 'hopper'],
    plats: [{ x: -190, y: -153, w: 135 }, { x: 155, y: -98, w: 182 }],
    doors: [{ x: 482, to: 'market', label: 'Street ladder' }],
  },
};
const TRAIN = [{ x: 0, to: 'train', label: 'Last train' }];
export const cityDoors = state => state.finale === 2 ? TRAIN : CITY_ROOMS[state.room].doors;
export const cityOpen = state => !!(state.clear & CITY_ROOMS[state.room].bit) && state.finale !== 1;
export const relayCount = state => Number(!!(state.clear & 2)) + Number(!!(state.clear & 4));
export const newCity = () => ({
  room: 'market', clear: 0, finale: 0, sent: 0, wait: 2.2,
  gate: '', hold: 0, visit: 0, relayReady: false, relayCharge: 0, pumpTick: 0,
});

export function arrive(f, x) {
  f.x = Math.max(-CITY_LIMIT + 24, Math.min(CITY_LIMIT - 24, x));
  f.y = -32; f.vx = 0; f.vy = 0;
  f.grounded = true; f.ridePlat = null; f.ledge = 0;
  f.state = f.dead ? 'dead' : 'idle'; f.stateT = 0;
  f.atk = null; f.atkDir = null; f.melee = null; f.hammerFlight = null;
  f.chg = 0; f.dashT = 0; f.slideT = 0; f.fastfall = false;
  f.pendingShock = false; f.stunned = false; f.jumps = f.st.maxJumps;
  f.invuln = Math.max(f.invuln, 1.2);
}

export function stepCity(game, live, dt) {
  if (!live.length) return;
  game.runT += dt;
  const state = game.cityRun;
  const room = CITY_ROOMS[state.room];
  if (!cityOpen(state)) {
    const boss = state.finale === 1;
    // The pressure valve discharges every seven fought seconds. Height
    // keeps you safe. Luring a pack into the water turns it against them.
    if (state.room === 'cistern' && !state.relayReady) {
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
    const quota = boss ? 1 : room.foes.length;
    const active = game.enemies.filter(e => !e.ally && e.hp > 0).length;
    if (state.sent < quota && active < 4) {
      state.wait = Math.max(0, state.wait - dt);
      if (!state.wait) {
        const level = relayCount(state);
        if (boss) game._spawnBoss(live, level);
        else game._spawnEnemy(live, level, 1, 0, 1, room.foes[state.sent]);
        const e = game.enemies.at(-1);
        e.x = room.entry[0]; e.y = Math.min(-e.hh, room.entry[1]);
        e.grounded = e.y === -e.hh;
        e.vx = state.room === 'cistern' ? 330 : -110;
        e.vy = state.room === 'cistern' ? -320 : 0;
        e.atkCd = 1.2;
        game.events.push({ e: 'cityspawn', x: e.x, y: e.y, color: room.color });
        state.sent++;
        state.wait = state.room === 'cistern' && state.sent % 2 ? .65 : 2.6;
      }
    } else if (state.sent >= quota && !active) {
      if (room.relay) {
        state.relayReady = true;
        const touching = live.some(f => !f.dead && Math.abs(f.x - room.relay.x) < 69 &&
          Math.abs(f.y + 32 - room.relay.y) < 40);
        state.relayCharge = touching ? state.relayCharge + dt : 0;
        if (state.relayCharge < .65) return;
        state.relayReady = false;
      }
      state.clear |= room.bit;
      if (boss) { state.finale = 2; game.won = true; }
      game.events.push({ e: 'districtclear', room: state.room, finale: state.finale });
      for (const f of live) game._spawnHeart(f.x, f.y);
    }
    return;
  }

  const party = game.fighters.filter(f => !f.parked && f.stocks > 0);
  const gate = cityDoors(state).find(g => party.every(f =>
    !f.dead && Math.abs(f.x - g.x) <= 80 && Math.abs(f.y + 32) <= 85));
  if (!gate) { state.hold = 0; state.gate = ''; return; }
  if (state.gate !== gate.to) state.hold = 0;
  state.gate = gate.to;
  state.hold += dt;
  if (state.hold < .85) return;
  if (gate.to === 'train') { game._endRun('cleared'); return; }

  const destination = CITY_ROOMS[gate.to];
  const entry = destination.doors.find(d => d.to === state.room);
  state.room = gate.to; state.visit++;
  state.relayReady = false; state.relayCharge = 0; state.pumpTick = 0;
  state.sent = 0; state.wait = 2; state.hold = 0; state.gate = '';
  if (state.room === 'market' && state.clear === 7) state.finale = 1;
  // Land clear of the return trigger. Pets cross with their owners, while
  // old-room projectiles, planted anchors and pickups stay behind.
  const x = entry.x - Math.sign(entry.x) * 165;
  game.fighters.forEach((f, i) => arrive(f, x + ((i % 5) - 2) * 21));
  game.enemies = game.enemies.filter(e => e.ally && e.hp > 0);
  for (const e of game.enemies) { e.x = x; e.y = -e.hh; e.vx = e.vy = 0; }
  game.hearts.length = game.projectiles.length = game.hist.length = 0;
  game._pc = null;
  game.events.push({ e: 'district', room: state.room });
}
