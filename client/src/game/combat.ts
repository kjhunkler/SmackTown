import type { Fighter } from './fighter';
import type { HitEffect } from '@/net/protocol';

export interface HitParams {
  baseDamage: number;
  baseKnockback: number;
  angleDeg: number; // 0 = right, 90 = up, in on-screen terms (up is negative y)
}

export function applyHit(attacker: Fighter, defender: Fighter, params: HitParams, now: number, effects: HitEffect[]) {
  if (now < defender.invulnerableUntil) return;

  if (defender.shielding) {
    effects.push({ x: defender.x, y: defender.y, kind: 'block' });
    defender.vx = 0;
    return;
  }

  // Counter Stance: reflect a strong hit back at the attacker instead of taking it.
  if (now < defender.counterActiveUntil) {
    defender.counterActiveUntil = 0;
    doApplyHit(defender, attacker, { baseDamage: params.baseDamage * 1.6, baseKnockback: params.baseKnockback * 1.6, angleDeg: params.angleDeg + 180 }, now, effects);
    return;
  }

  doApplyHit(attacker, defender, params, now, effects);
}

function doApplyHit(attacker: Fighter, defender: Fighter, params: HitParams, now: number, effects: HitEffect[]) {
  const dmg = params.baseDamage * attacker.derived.damageMult * (1 - defender.derived.defenseResist);
  defender.damagePercent = Math.max(0, defender.damagePercent + dmg);

  // Second Wind: crossing the 150% threshold grants a brief shield once per stock.
  if (defender.hasAugment('secondWind') && !defender.secondWindUsedThisStock && defender.damagePercent >= 150) {
    defender.secondWindUsedThisStock = true;
    defender.shieldBonusUntil = now + 1500;
    defender.invulnerableUntil = Math.max(defender.invulnerableUntil, now + 250);
  }

  const shieldBonus = now < defender.shieldBonusUntil ? 0.5 : 1;
  const growth = (defender.damagePercent / 100) * params.baseKnockback * 1.35;
  const totalKb = (params.baseKnockback * 0.55 + growth) * (1 - defender.derived.knockbackResist) * attacker.derived.damageMult * shieldBonus;

  const rad = (params.angleDeg * Math.PI) / 180;
  defender.vx = Math.cos(rad) * totalKb;
  defender.vy = -Math.sin(rad) * totalKb;
  defender.grounded = false;

  const hitstunMs = Math.min(1400, 140 + totalKb * 1.15);
  defender.hitstunUntil = now + hitstunMs;

  attacker.lastHitLandedAt = now;
  if (attacker.hasAugment('vampiric')) {
    attacker.damagePercent = Math.max(0, attacker.damagePercent - dmg * 0.22);
  }

  effects.push({ x: defender.x, y: defender.y, kind: 'hit' });
}

export const JAB = { baseDamage: 4, baseKnockback: 60 };
export const SMASH_SIDE = { baseDamage: 12, baseKnockback: 165 };
export const SMASH_UP = { baseDamage: 11, baseKnockback: 175 };
export const SMASH_DOWN = { baseDamage: 13, baseKnockback: 150 };

export function meleeRange(f: Fighter): number {
  return f.radius + 46;
}
