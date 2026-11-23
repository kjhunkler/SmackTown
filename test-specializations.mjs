import assert from 'node:assert/strict';
import { ABILITIES, ABILITY_UPGRADES, abilityDef, buildCost, derivedStats,
  emptyBuild, sanitizeBuild, TRAIT_FOCUS, TOTAL_CREDITS } from './js/profile.js';
import { Game, gameFromSnapshot } from './js/game.js';

const kit = (...abilities) => ({ ...emptyBuild(), abilities });
const old = { abilities: ['fireball', 'hook'], augments: [], stats: {} };
assert.deepEqual(sanitizeBuild(old), kit('fireball', 'hook'));
assert.deepEqual(sanitizeBuild(kit('cinderskip', 'fireball', 'sunburst', 'trap')).abilities, ['cinderskip', 'trap']);
assert.deepEqual(sanitizeBuild(kit('unknown', '__proto__', 'sunburst')).abilities, ['sunburst']);
for (const base of ABILITIES) {
  const upgrades = ABILITY_UPGRADES[base.id];
  assert.ok(upgrades.length >= 1 && upgrades.length <= 3);
  for (const upgrade of upgrades) {
    assert.equal(abilityDef(upgrade.id).family, base.id);
    assert.equal(buildCost(kit(upgrade.id)), base.cost + upgrade.premium);
    assert.deepEqual(sanitizeBuild(kit(upgrade.id), base.cost + upgrade.premium - 1), emptyBuild());
  }
}
const focused = { ...kit(), stats: { power: 2, speed: 2, defense: 2, agility: 2 }, focuses: Object.keys(TRAIT_FOCUS) };
assert.deepEqual(sanitizeBuild(focused), emptyBuild()); // all four exceed the shared purse
for (const [id, focus] of Object.entries(TRAIT_FOCUS)) {
  const b = { ...kit(), focuses: [id, id] };
  assert.deepEqual(sanitizeBuild(b).focuses, []);
  b.stats[id] = 2;
  const legal = sanitizeBuild(b);
  assert.deepEqual(legal.focuses, [id]);
  assert.equal(buildCost(legal), 160 + focus.cost);
  const base = derivedStats({ ...b, focuses: [] }), specialized = derivedStats(legal);
  const key = { power: 'kbMult', speed: 'speedMult', defense: 'dmgTaken', agility: 'maxJumps' }[id];
  assert.ok(id === 'defense' ? specialized[key] < base[key] : specialized[key] > base[key]);
}
const make = (id, map = 'flatlands') => {
  const g = new Game([{ id: 'A', build: kit(id) }, { id: 'B', build: kit() }], 42, map);
  const [a, b] = g.fighters;
  a.x = 0; a.y = -32; a.facing = 1; a.grounded = true; b.x = 230; b.y = -32;
  return { g, a, b };
};
const cast = (id, setup = () => {}, map) => {
  const { g, a, b } = make(id, map);
  setup(a, b, g);
  g._useAbility(a, 0);
  assert.equal(a.cds[0], abilityDef(id).cd);
  return { g, a, b, p: g.projectiles[0] };
};
const skip = cast('cinderskip');
assert.ok(skip.p.ttl > cast('fireball').p.ttl);
for (let i = 0; i < 240 && skip.g.projectiles.length; i++) skip.g._stepProjectiles();
assert.equal(skip.g.events.filter(e => e.e === 'fireskip').length, 3);
assert.equal(skip.g.events.filter(e => e.e === 'burstboom').length, 1);
const platform = cast('cinderskip', (a, b, g) => {
  const pl = g.platsNow()[0]; a.x = pl.x + pl.w / 2; a.y = pl.y - 70; a.grounded = false;
  g.inputs.get('A').my = 1;
}, 'battlefield');
for (let i = 0; i < 10 && platform.p.skips === 3; i++) platform.g._stepProjectiles();
assert.equal(platform.p.skips, 2);
assert.equal(platform.p.y + platform.p.r, platform.g.platsNow()[0].y);
assert.ok(cast('sunburst').p.fireR > cast('fireball').p.fireR);
assert.ok(cast('sunburst').p.dot.n > cast('fireball').p.dot.n);
assert.ok(cast('cometdash').a.melee.until > cast('dashstrike').a.melee.until);
assert.equal(cast('shockwave').b.pct, 0);
assert.ok(cast('faultline').b.pct > 0);
const falling = cast('faultline', a => { a.grounded = false; a.y = -180; });
falling.a.grounded = true; falling.a.y = -32; falling.g._resolveAttacks();
assert.ok(falling.b.pct > 0);
assert.ok(cast('skybreaker').a.melee.kb > cast('uppercut').a.melee.kb);
assert.ok(cast('foresight').a.counterT > cast('counter').a.counterT);
assert.ok(cast('longblink').a.x > cast('blink').a.x);
assert.equal(cast('starfall').g.projectiles.length, 5);
assert.equal(cast('gale').b.pct, 0);
assert.ok(cast('cyclone').b.pct > 0);
assert.equal(cast('bubble').a.invuln, 1.8);
assert.ok(cast('prism').a.invuln > cast('bubble').a.invuln);
assert.ok(cast('repulse', (a, b) => { b.x = 80; }).b.vx > 0);
assert.equal(cast('renewal', a => { a.pct = 40; }).a.pct, 16);
assert.equal(cast('renewal', a => { a.hp = 20; }, 'expanse').a.hp, 44);
assert.ok(cast('harpoon').p.vx > cast('hook').p.vx);
assert.ok(cast('beartrap').p.stun > cast('trap').p.stun);
assert.ok(cast('kickback').p.kb > cast('springtrap').p.kb);
for (const map of ['flatlands', 'expanse']) {
  const { g, a } = cast('lifeline', a => { a.pct = 30; a.hp = 40; }, map);
  const resumed = gameFromSnapshot([{ id: 'A', build: kit('lifeline') }, { id: 'B', build: kit() }], g.snapshot(5000, 10));
  resumed.fighters[0].x = 90;
  resumed._useAbility(resumed.fighters[0], 0);
  assert.equal(resumed.fighters[0].x, 0);
  a.x = 400; g._useAbility(a, 0);
  assert.equal(a.x, 0);
  assert.equal(map === 'expanse' ? a.hp : a.pct, map === 'expanse' ? 50 : 20);
}
const guard = cast('vanguard').g.enemies[0];
assert.equal(guard.kind, 'brute');
const { g, a } = make('troop'); g._summonAlly(a, 'brute');
assert.ok(guard.hp > g.enemies[0].hp);
const twins = cast('twinflight');
assert.equal(twins.g.enemies.length, 2);
assert.notEqual(twins.g.enemies[0].x, twins.g.enemies[1].x);
for (let i = 0; i < 4; i++) { twins.a.cds[0] = 0; twins.g._useAbility(twins.a, 0); }
assert.equal(twins.g.enemies.length, 5);
assert.ok(buildCost(kit('twinflight', 'sunburst')) <= TOTAL_CREDITS);
console.log('Ability families, credits, all trait focuses and every combat variant passed.');
