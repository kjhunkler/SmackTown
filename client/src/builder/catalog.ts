// Every player gets the same credit pool to build their fighter. Stats level up
// from a free baseline; abilities and augments are flat-cost picks with limited slots.

export const TOTAL_CREDITS = 100;
export const STAT_MAX_LEVEL = 5;
export const STAT_LEVEL_COST = 6; // cost per level above the free baseline (level 1)
export const MAX_ABILITY_SLOTS = 2;
export const MAX_AUGMENT_SLOTS = 2;
export const ABILITY_COST = 20;
export const AUGMENT_COST = 15;

export type StatId = 'power' | 'defense' | 'speed' | 'weight' | 'jump';

export interface StatDef {
  id: StatId;
  name: string;
  short: string;
  description: string;
}

export const STATS: StatDef[] = [
  { id: 'power', name: 'Power', short: 'PWR', description: 'Damage dealt on every hit.' },
  { id: 'defense', name: 'Defense', short: 'DEF', description: 'Damage reduction from incoming hits.' },
  { id: 'speed', name: 'Speed', short: 'SPD', description: 'Ground move and dash speed.' },
  { id: 'weight', name: 'Weight', short: 'WGT', description: 'Knockback resistance — harder to launch.' },
  { id: 'jump', name: 'Jump', short: 'JMP', description: 'Jump height and extra mid-air jumps.' },
];

export type AbilityId = 'fireball' | 'dashStrike' | 'groundPound' | 'counterStance' | 'teleportBlink' | 'risingUppercut';

export interface AbilityDef {
  id: AbilityId;
  name: string;
  description: string;
  cooldownMs: number;
  icon: string; // single glyph/emoji for compact HUD rendering
}

export const ABILITIES: AbilityDef[] = [
  { id: 'fireball', name: 'Fireball', description: 'Launch a ranged projectile that knocks foes back.', cooldownMs: 3000, icon: '🔥' },
  { id: 'dashStrike', name: 'Dash Strike', description: 'Rocket forward with a heavy hit and a speed burst.', cooldownMs: 2500, icon: '⚡' },
  { id: 'groundPound', name: 'Ground Pound', description: 'Slam downward, spiking airborne foes into the stage.', cooldownMs: 4000, icon: '💥' },
  { id: 'counterStance', name: 'Counter Stance', description: 'Brace briefly; a hit taken during it is reflected hard.', cooldownMs: 5000, icon: '🛡️' },
  { id: 'teleportBlink', name: 'Teleport Blink', description: 'Blink a short distance — great for repositioning or recovery.', cooldownMs: 4000, icon: '✨' },
  { id: 'risingUppercut', name: 'Rising Uppercut', description: 'Launch upward through foes, doubling as recovery.', cooldownMs: 3500, icon: '🌀' },
];

export type AugmentId = 'vampiric' | 'glassCannon' | 'featherweight' | 'juggernaut' | 'secondWind' | 'momentumShift';

export interface AugmentDef {
  id: AugmentId;
  name: string;
  description: string;
  icon: string;
}

export const AUGMENTS: AugmentDef[] = [
  { id: 'vampiric', name: 'Vampiric Strikes', description: 'Landing a hit slightly heals your own damage percent.', icon: '🩸' },
  { id: 'glassCannon', name: 'Glass Cannon', description: '+20% damage dealt, but +15% damage taken.', icon: '💣' },
  { id: 'featherweight', name: 'Featherweight', description: '+20% air control, but -15% knockback resistance.', icon: '🪶' },
  { id: 'juggernaut', name: 'Juggernaut', description: '+20% knockback resistance, but -10% dash speed.', icon: '🗿' },
  { id: 'secondWind', name: 'Second Wind', description: 'Once per stock, crossing 150% grants a brief damage shield.', icon: '🌟' },
  { id: 'momentumShift', name: 'Momentum Shift', description: 'Ability cooldowns tick 25% faster while you’re on the offensive.', icon: '🔄' },
];

export const PRESET_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16',
  '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#3b82f6',
  '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e',
];

export interface FighterBuild {
  version: 1;
  stats: Record<StatId, number>;
  abilities: AbilityId[];
  augments: AugmentId[];
  color: string;
}

export function defaultBuild(): FighterBuild {
  return {
    version: 1,
    stats: { power: 1, defense: 1, speed: 1, weight: 1, jump: 1 },
    abilities: [],
    augments: [],
    color: PRESET_COLORS[9],
  };
}

export function statLevelCost(currentLevel: number): number {
  // Cost to go from currentLevel -> currentLevel + 1
  if (currentLevel < 1 || currentLevel >= STAT_MAX_LEVEL) return 0;
  return STAT_LEVEL_COST;
}

export function costOfBuild(build: FighterBuild): number {
  let cost = 0;
  for (const stat of STATS) {
    const level = build.stats[stat.id] ?? 1;
    for (let l = 1; l < level; l++) cost += STAT_LEVEL_COST;
  }
  cost += build.abilities.length * ABILITY_COST;
  cost += build.augments.length * AUGMENT_COST;
  return cost;
}

export function creditsRemaining(build: FighterBuild): number {
  return TOTAL_CREDITS - costOfBuild(build);
}

export function isValidBuild(build: FighterBuild): boolean {
  if (creditsRemaining(build) < 0) return false;
  if (build.abilities.length > MAX_ABILITY_SLOTS) return false;
  if (build.augments.length > MAX_AUGMENT_SLOTS) return false;
  for (const stat of STATS) {
    const lvl = build.stats[stat.id] ?? 1;
    if (lvl < 1 || lvl > STAT_MAX_LEVEL) return false;
  }
  const uniqueAbilities = new Set(build.abilities);
  const uniqueAugments = new Set(build.augments);
  if (uniqueAbilities.size !== build.abilities.length) return false;
  if (uniqueAugments.size !== build.augments.length) return false;
  return true;
}
