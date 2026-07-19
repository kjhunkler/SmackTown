// Headless coverage for the delayed, charge-scaled bomb weapon.
import { Game } from './js/game.js';
import { sanitizeBuild } from './js/profile.js';

let n = 0, fails = 0;
const check = (name, ok) => {
  n++;
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}. ${name}`);
};
const build = weapon => ({
  stats: { power: 0, speed: 0, defense: 0, agility: 0 },
  weapon, abilities: [], augments: [],
});
const game = () => new Game([
  { id: 'A', name: 'Alice', color: '#f00', build: build('bombs') },
  { id: 'B', name: 'Bob', color: '#0f0', build: build('unarmed') },
], 19, 'flatlands');

check('bombs are accepted by build sanitization', sanitizeBuild(build('bombs')).weapon === 'bombs');

const weakGame = game();
const weakThrower = weakGame.fighters[0];
weakGame._startAttack(weakThrower, { kind: 'swipe', dx: 1, dy: 0 }, false, 0);
const weak = weakGame.projectiles[0];
check('a bomb swipe throws a delayed bomb', weakThrower.atk === 'bomb' && weak.kind === 'bomb' && weak.arm > 1);
check('the bomb starts on a gravity-driven arc', weak.grav > 0 && weak.vx > 0 && weak.vy < 0);

const strongGame = game();
strongGame._startAttack(strongGame.fighters[0], { kind: 'swipe', dx: 1, dy: 0 }, false, 1);
const strong = strongGame.projectiles[0];
check('charge increases throw distance', strong.vx > weak.vx && Math.abs(strong.vy) > Math.abs(weak.vy));
check('charge increases damage and explosion radius', strong.dmg > weak.dmg && strong.bombR > weak.bombR);
check('snapshot carries the public explosion telegraph radius', strongGame.snapshot().p[0][8] === strong.bombR);

// Put both fighters inside the blast, expire the fuse, and resolve it.
const owner = strongGame.fighters[0], victim = strongGame.fighters[1];
strong.x = owner.x; strong.y = owner.y;
victim.x = owner.x + 30; victim.y = owner.y;
const ownerPct = owner.pct;
strong.ttl = 0;
strongGame._stepProjectiles();
check('the delayed explosion damages opponents', victim.pct > 0);
check('the explosion knocks its thrower back', owner.vx !== 0 || owner.vy < 0);
check('self-knockback never damages its thrower', owner.pct === ownerPct && owner.hp === owner.maxHp);
check('the explosion is consumed exactly once', strongGame.projectiles.length === 0 && strong.boomed);

console.log(`\n${n - fails}/${n} passed`);
if (fails) process.exit(1);
