// Headless smoke test: map-vote tally with size-class votes. Every votable
// map carries a size, the classes split sensibly by floor width, and
// tallyMapVotes resolves map votes, size votes, ties, and junk correctly.
// Run: node test-mapvote.mjs
import { MAPS, MAP_IDS, MAP_SIZES, mapsOfSize, tallyMapVotes } from './js/game.js';

let n = 0, fails = 0;
function check(name, ok) {
  n++;
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}. ${name}`);
}

// --- 1. size classes ---
{
  check('every votable map has a valid size', MAP_IDS.every(id => MAP_SIZES.includes(MAPS[id].size)));
  check('every size class has at least two maps', MAP_SIZES.every(s => mapsOfSize(s).length >= 2));
  check('the classes partition the votable maps',
    MAP_SIZES.reduce((t, s) => t + mapsOfSize(s).length, 0) === MAP_IDS.length);
  check('size tokens never collide with map ids', MAP_SIZES.every(s => !MAP_IDS.includes(s)));
  const widths = s => mapsOfSize(s).map(id => MAPS[id].main.w);
  check('every small floor is narrower than every medium floor',
    Math.max(...widths('small')) < Math.min(...widths('medium')));
  check('every medium floor is narrower than every large floor',
    Math.max(...widths('medium')) < Math.min(...widths('large')));
  check('hidden maps stay out of the size pools',
    MAP_SIZES.every(s => !mapsOfSize(s).some(id => MAPS[id].hidden)));
}

// --- 2. map votes still work ---
{
  check('unanimous map vote wins', tallyMapVotes(['docks', 'docks', 'docks']) === 'docks');
  check('majority map vote beats the minority', tallyMapVotes(['temple', 'canyon', 'temple']) === 'temple');
  check('a lone vote decides for everyone', tallyMapVotes([null, 'garden', null]) === 'garden');
  check('no votes at all still lands a real map', MAP_IDS.includes(tallyMapVotes([null, null])));
  check('junk votes are ignored', MAP_IDS.includes(tallyMapVotes(['nonsense', undefined, ''])));
}

// --- 3. size votes ---
{
  check('a winning size vote draws a map of that size',
    Array.from({ length: 50 }, () => tallyMapVotes(['large'])).every(id => MAPS[id].size === 'large'));
  check('size majority beats a specific-map minority',
    Array.from({ length: 50 }, () => tallyMapVotes(['small', 'small', 'temple'])).every(id => MAPS[id].size === 'small'));
  check('a specific-map majority beats a size minority',
    tallyMapVotes(['frostspire', 'frostspire', 'medium']) === 'frostspire');
  const smallDraws = new Set(Array.from({ length: 400 }, () => tallyMapVotes(['small'])));
  check('the size draw actually spreads across its class',
    smallDraws.size === mapsOfSize('small').length);
}

// --- 4. ties ---
{
  const tie = Array.from({ length: 200 }, () => tallyMapVotes(['docks', 'large']));
  check('a map/size tie only ever lands on the two options',
    tie.every(id => id === 'docks' || MAPS[id].size === 'large'));
  check('both sides of the tie win sometimes',
    tie.includes('docks') && tie.some(id => MAPS[id].size === 'large'));
}

console.log(fails ? `\n${fails}/${n} FAILED` : `\nAll ${n} checks passed.`);
process.exit(fails ? 1 : 0);
