// Headless coverage for the delayed, charge-scaled bomb weapon.
import { Game, bombLaunch } from './js/game.js';
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
check('straight-up bomb aim has no sideways drift', bombLaunch(0, 0, 1, 0, -1, true, .5).vx === 0);

const weakGame = game();
const weakThrower = weakGame.fighters[0];
weakGame._startAttack(weakThrower, { kind: 'swipe', dx: 1, dy: 0 }, false, 0);
const weak = weakGame.projectiles[0];
check('a bomb swipe throws a bomb with a brief post-throw safety grace', weakThrower.atk === 'bomb' && weak.kind === 'bomb' && weak.arm > 0 && weak.arm < 1);
check('a side throw starts perfectly horizontal, no added arc', weak.grav > 0 && weak.vx > 0 && weak.vy === 0);
check('bombs use the heavier fall gravity', weak.grav === 1200);
check('uncharged bombs have weaker knockback', weak.kb === 350);

const strongGame = game();
strongGame._startAttack(strongGame.fighters[0], { kind: 'swipe', dx: 1, dy: 0 }, false, 1);
const strong = strongGame.projectiles[0];
check('charge no longer changes throw distance', strong.vx === weak.vx && strong.vy === weak.vy);
check('charge increases damage and explosion radius', strong.dmg > weak.dmg && strong.bombR > weak.bombR);
check('an uncharged bomb has hardly any blast radius', weak.bombR === 8);
check('a fully charged bomb blasts half a character height', strong.bombR === 32);
check('fully charged bombs have much stronger knockback', strong.kb === 1100);
check('snapshot carries the public explosion telegraph radius', strongGame.snapshot().p[0][8] === strong.bombR);

// Aiming down while standing spikes the bomb into the ground near your feet.
const spike = bombLaunch(0, 0, 1, 1, 1, true, 0);
check('grounded down-aim spikes the bomb downward', spike.vy > 0 && spike.bounce === 1);
const loft = bombLaunch(0, 0, 1, 1, 0, true, 0);
check('grounded side-aim launches perfectly horizontal, no loft', loft.vy === 0 && !loft.bounce);
check('airborne down-aim keeps its straight-line launch (no spike)', bombLaunch(0, 0, 1, 1, 1, false, 0).bounce === 0);
const diag = bombLaunch(0, 0, 1, 1, -1, false, 0);
check('a diagonal throw launches along the exact 45-degree aim', Math.abs(diag.vx) === Math.abs(diag.vy) && diag.vx > 0 && diag.vy < 0);

// A spiked bomb reflects off the floor once, then settles on the next touch.
const bounceGame = game();
const gmain = bounceGame.stage.main;
const spiked = { kind: 'bomb', x: gmain.x + 120, y: gmain.y - 15, vx: 220, vy: 320,
  grav: 1200, r: 13, ttl: 1, arm: 1, bounce: 1 };
bounceGame.projectiles.push(spiked);
bounceGame._stepProjectiles();
check('a spiked bomb bounces off the ground', spiked.vy < 0 && spiked.grav === 1200 && spiked.bounce === 0);

const platformGame = new Game([
  { id: 'A', name: 'Alice', color: '#f00', build: build('bombs') },
  { id: 'B', name: 'Bob', color: '#0f0', build: build('unarmed') },
], 19, 'battlefield');
const platform = platformGame.platsNow()[0];
const landing = { kind: 'bomb', x: platform.x + platform.w / 2, y: platform.y - 14,
  vx: 0, vy: 240, grav: 1050, r: 13, ttl: 1, arm: 1 };
platformGame.projectiles.push(landing);
platformGame._stepProjectiles();
check('bombs collide with elevated platforms', landing.grav === 0 && landing.y === platform.y - landing.r);

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

// Bombs detonate the instant they touch an opponent, not just on fuse timeout.
const impactGame = game();
impactGame._startAttack(impactGame.fighters[0], { kind: 'swipe', dx: 1, dy: 0 }, false, 0);
const impactBomb = impactGame.projectiles[0];
impactBomb.arm = 0;   // past the post-throw safety grace
const impactVictim = impactGame.fighters[1];
impactVictim.x = impactBomb.x; impactVictim.y = impactBomb.y;
const impactPctBefore = impactVictim.pct;
impactGame._resolveAttacks();
check('a bomb touching an opponent is marked to detonate', impactBomb.ttl === 0 && !impactBomb.boomed);
impactGame._stepProjectiles();
check('bombs detonate on impact instead of waiting for the fuse',
  impactVictim.pct > impactPctBefore && impactBomb.boomed);

// Bombs detonate on contact with a co-op creep too.
const creepGame = game();
creepGame._startAttack(creepGame.fighters[0], { kind: 'swipe', dx: 1, dy: 0 }, false, 0);
const creepBomb = creepGame.projectiles[0];
creepBomb.arm = 0;
creepGame.enemies.push({
  eid: 1, kind: 'grunt', hw: 22, hh: 26,
  x: creepBomb.x, y: creepBomb.y, vx: 0, vy: 0,
  hp: 20, maxHp: 20, cr: 5, facing: -1, grounded: true, hurt: 0,
  windup: 0, atkCd: 99, stagger: 0, temperament: 'bold', focusId: null,
  elite: false, variant: 0, rushT: 0, rushHit: null, atkKind: 0, aimX: 0, aimY: 0,
});
const creep = creepGame.enemies[0];
creepGame._resolveAttacks();
check('a bomb touching a creep is marked to detonate', creepBomb.ttl === 0 && !creepBomb.boomed);
creepGame._stepProjectiles();
check('bombs detonate on impact with a creep too', creep.hp < 20 && creepBomb.boomed);

console.log(`\n${n - fails}/${n} passed`);
if (fails) process.exit(1);
