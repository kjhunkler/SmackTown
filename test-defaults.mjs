// Default starter characters: every seeded loadout must stay legal as the
// shop evolves — valid hat art, budget-legal builds that sanitizeBuild
// wouldn't alter, and exactly one character per weapon. Run: node test-defaults.mjs
import {
  DEFAULT_HATS, DEFAULT_LOADOUTS, WEAPONS, TOTAL_CREDITS,
  sanitizeHat, sanitizeBuild, buildCost, validLoadoutName,
} from './js/profile.js';

let n = 0, fails = 0;
function check(name, ok) {
  n++;
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}. ${name}`);
}

check('one default character per weapon',
  DEFAULT_LOADOUTS.length === WEAPONS.length
  && new Set(DEFAULT_LOADOUTS.map(l => l.build.weapon)).size === WEAPONS.length
  && DEFAULT_LOADOUTS.every(l => WEAPONS.some(w => w.id === l.build.weapon)));

check('every default hat is valid art under a unique id',
  DEFAULT_HATS.every(h => sanitizeHat(h.art) === h.art)
  && new Set(DEFAULT_HATS.map(h => h.id)).size === DEFAULT_HATS.length);

for (const l of DEFAULT_LOADOUTS) {
  const clean = sanitizeBuild(l.build);
  check(`${l.name}: build survives sanitizeBuild unchanged`,
    JSON.stringify(clean) === JSON.stringify({ ...clean, ...l.build }));
  check(`${l.name}: within the ${TOTAL_CREDITS} cr purse (${buildCost(l.build)})`,
    buildCost(l.build) <= TOTAL_CREDITS);
  check(`${l.name}: valid name and a hat that exists`,
    validLoadoutName(l.name) && DEFAULT_HATS.some(h => h.id === l.hatId));
}

console.log(fails ? `\n${fails}/${n} FAILED` : `\nall ${n} passed`);
process.exit(fails ? 1 : 0);
