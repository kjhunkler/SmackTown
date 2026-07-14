// Default starter characters: every seeded loadout must stay legal as the
// shop evolves — valid hat art, budget-legal builds that sanitizeBuild
// wouldn't alter, and exactly one character per weapon. Run: node test-defaults.mjs
import {
  DEFAULT_HATS, DEFAULT_LOADOUTS, WEAPONS, TOTAL_CREDITS,
  sanitizeHat, sanitizeBuild, buildCost, validLoadoutName,
  seedDefaultCharacters, restoreDefaultCharacters,
  loadLoadouts, loadHats, deleteLoadout, saveLoadout,
} from './js/profile.js';

// profile.js touches localStorage only at call time, so a Map-backed stub is
// enough to exercise the seed/restore flows headlessly.
const store = new Map();
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
};

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

// --- seed & restore flows against the stubbed storage ---
seedDefaultCharacters();
check('first run seeds the full roster',
  loadLoadouts().length === DEFAULT_LOADOUTS.length
  && loadHats().length === DEFAULT_HATS.length);

seedDefaultCharacters();
check('seeding is one-time', loadLoadouts().length === DEFAULT_LOADOUTS.length);

deleteLoadout('Skewer');
deleteLoadout('Rebound');
check('restore brings back only the deleted characters',
  restoreDefaultCharacters() === 2
  && loadLoadouts().length === DEFAULT_LOADOUTS.length);

saveLoadout('Bastion', '#3ddc84', { stats: { power: 5, speed: 0, defense: 0, agility: 0 },
  weapon: 'sword', abilities: [], augments: [] }, null);
check('restore never clobbers an edited character',
  restoreDefaultCharacters() === 0
  && loadLoadouts().find(l => l.name === 'Bastion').build.weapon === 'sword');

console.log(fails ? `\n${fails}/${n} FAILED` : `\nall ${n} passed`);
process.exit(fails ? 1 : 0);
