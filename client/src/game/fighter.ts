import type { AbilityId, AugmentId, FighterBuild, StatId } from '@/builder/catalog';
import { ABILITIES } from '@/builder/catalog';
import { BASE_AIR_JUMP_VELOCITY, BASE_DASH_SPEED, BASE_JUMP_VELOCITY, BASE_MOVE_SPEED, FIGHTER_RADIUS, STOCK_COUNT } from './constants';
import type { InputFrame } from '@/net/protocol';

export type FighterState = 'idle' | 'walk' | 'dash' | 'jump' | 'fall' | 'shield' | 'hitstun' | 'attack' | 'ability' | 'ko';

export interface DerivedStats {
  damageMult: number;
  defenseResist: number;
  moveSpeed: number;
  dashSpeed: number;
  knockbackResist: number;
  jumpVelocity: number;
  airJumpVelocity: number;
  maxJumps: number;
  airControlMult: number;
  cooldownMult: number;
}

function statLevel(build: FighterBuild, id: StatId): number {
  return build.stats[id] ?? 1;
}

export function deriveStats(build: FighterBuild): DerivedStats {
  const power = statLevel(build, 'power');
  const defense = statLevel(build, 'defense');
  const speed = statLevel(build, 'speed');
  const weight = statLevel(build, 'weight');
  const jump = statLevel(build, 'jump');

  let damageMult = 1 + (power - 1) * 0.08;
  let defenseResist = (defense - 1) * 0.06;
  let moveSpeed = BASE_MOVE_SPEED * (1 + (speed - 1) * 0.07);
  let dashSpeed = BASE_DASH_SPEED * (1 + (speed - 1) * 0.07);
  let knockbackResist = (weight - 1) * 0.06;
  let airControlMult = 1;
  let cooldownMult = 1;

  const maxJumps = jump >= 5 ? 3 : jump >= 3 ? 2 : 1;
  const jumpVelocity = BASE_JUMP_VELOCITY * (1 + (jump - 1) * 0.04);
  const airJumpVelocity = BASE_AIR_JUMP_VELOCITY * (1 + (jump - 1) * 0.04);

  if (build.augments.includes('glassCannon')) {
    damageMult *= 1.2;
    defenseResist -= 0.15;
  }
  if (build.augments.includes('featherweight')) {
    airControlMult *= 1.2;
    knockbackResist -= 0.15;
  }
  if (build.augments.includes('juggernaut')) {
    knockbackResist += 0.2;
    dashSpeed *= 0.9;
  }

  return {
    damageMult,
    defenseResist: clamp(defenseResist, -0.5, 0.6),
    moveSpeed,
    dashSpeed,
    knockbackResist: clamp(knockbackResist, -0.5, 0.6),
    jumpVelocity,
    airJumpVelocity,
    maxJumps,
    airControlMult,
    cooldownMult,
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export interface AbilitySlot {
  id: AbilityId;
  cooldownUntil: number;
}

export class Fighter {
  clientId: string;
  username: string;
  build: FighterBuild;
  derived: DerivedStats;

  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  facing: 1 | -1 = 1;
  grounded = false;
  jumpsUsed = 0;
  damagePercent = 0;
  stocks = STOCK_COUNT;
  state: FighterState = 'idle';
  hitstunUntil = 0;
  shielding = false;
  invulnerableUntil = 0;
  respawnAt = 0;
  radius = FIGHTER_RADIUS;

  abilitySlots: AbilitySlot[];
  counterActiveUntil = 0;
  secondWindUsedThisStock = false;
  shieldBonusUntil = 0;
  lastHitLandedAt = 0;

  attackCooldownUntil = 0;
  lastInput: InputFrame | null = null;

  constructor(clientId: string, username: string, build: FighterBuild, spawn: { x: number; y: number }) {
    this.clientId = clientId;
    this.username = username;
    this.build = build;
    this.derived = deriveStats(build);
    this.x = spawn.x;
    this.y = spawn.y;
    this.abilitySlots = build.abilities.map((id) => ({ id, cooldownUntil: 0 }));
  }

  hasAugment(id: AugmentId): boolean {
    return this.build.augments.includes(id);
  }

  abilityDef(id: AbilityId) {
    return ABILITIES.find((a) => a.id === id)!;
  }

  isAlive(): boolean {
    return this.stocks > 0;
  }

  effectiveCooldownMult(now: number): number {
    if (this.hasAugment('momentumShift') && now - this.lastHitLandedAt < 3000) {
      return 0.75;
    }
    return 1;
  }

  respawn(spawn: { x: number; y: number }, now: number) {
    this.x = spawn.x;
    this.y = spawn.y;
    this.vx = 0;
    this.vy = 0;
    this.damagePercent = 0;
    this.state = 'fall';
    this.grounded = false;
    this.jumpsUsed = 0;
    this.invulnerableUntil = now + 1500;
    this.secondWindUsedThisStock = false;
  }
}
