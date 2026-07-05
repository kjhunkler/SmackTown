import type { AbilityId } from '@/builder/catalog';
import type { Fighter } from './fighter';
import { applyHit, meleeRange } from './combat';
import type { HitEffect } from '@/net/protocol';

export interface Projectile {
  id: number;
  ownerId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  bornAt: number;
  ttlMs: number;
}

let nextProjectileId = 1;

export function tryUseAbility(
  slotIndex: number,
  fighter: Fighter,
  opponents: Fighter[],
  now: number,
  effects: HitEffect[],
  spawnProjectile: (p: Projectile) => void,
): boolean {
  const slot = fighter.abilitySlots[slotIndex];
  if (!slot) return false;
  if (now < slot.cooldownUntil) return false;
  if (now < fighter.hitstunUntil) return false;

  const used = executeAbility(slot.id, fighter, opponents, now, effects, spawnProjectile);
  if (used) {
    const def = fighter.abilityDef(slot.id);
    const mult = fighter.effectiveCooldownMult(now);
    slot.cooldownUntil = now + def.cooldownMs * mult;
  }
  return used;
}

function executeAbility(
  id: AbilityId,
  f: Fighter,
  opponents: Fighter[],
  now: number,
  effects: HitEffect[],
  spawnProjectile: (p: Projectile) => void,
): boolean {
  switch (id) {
    case 'fireball': {
      spawnProjectile({
        id: nextProjectileId++,
        ownerId: f.clientId,
        x: f.x + f.facing * f.radius,
        y: f.y - 6,
        vx: f.facing * 520,
        vy: 0,
        bornAt: now,
        ttlMs: 1800,
      });
      f.state = 'ability';
      return true;
    }
    case 'dashStrike': {
      f.vx = f.facing * 620;
      f.state = 'ability';
      for (const opp of opponents) {
        if (Math.abs(opp.x - f.x) < meleeRange(f) + 40 && Math.abs(opp.y - f.y) < 60) {
          applyHit(f, opp, { baseDamage: 9, baseKnockback: 130, angleDeg: f.facing > 0 ? 20 : 160 }, now, effects);
        }
      }
      return true;
    }
    case 'groundPound': {
      if (f.grounded) return false;
      f.vy = 1100;
      f.state = 'ability';
      for (const opp of opponents) {
        if (Math.abs(opp.x - f.x) < 70 && opp.y > f.y) {
          applyHit(f, opp, { baseDamage: 14, baseKnockback: 120, angleDeg: -80 }, now, effects);
        }
      }
      return true;
    }
    case 'counterStance': {
      f.counterActiveUntil = now + 500;
      f.state = 'ability';
      return true;
    }
    case 'teleportBlink': {
      f.x += f.facing * 220;
      f.invulnerableUntil = now + 200;
      f.state = 'ability';
      return true;
    }
    case 'risingUppercut': {
      f.vy = -820;
      f.vx = f.facing * 140;
      f.grounded = false;
      f.jumpsUsed = Math.max(f.jumpsUsed, 1);
      f.state = 'ability';
      for (const opp of opponents) {
        if (Math.abs(opp.x - f.x) < meleeRange(f) && Math.abs(opp.y - f.y) < 80) {
          applyHit(f, opp, { baseDamage: 10, baseKnockback: 160, angleDeg: 95 }, now, effects);
        }
      }
      return true;
    }
    default:
      return false;
  }
}

export function updateProjectiles(
  projectiles: Projectile[],
  fighters: Fighter[],
  dtSec: number,
  now: number,
  effects: HitEffect[],
): Projectile[] {
  const alive: Projectile[] = [];
  for (const p of projectiles) {
    if (now - p.bornAt > p.ttlMs) continue;
    p.x += p.vx * dtSec;
    p.y += p.vy * dtSec;

    let consumed = false;
    for (const f of fighters) {
      if (f.clientId === p.ownerId) continue;
      if (!f.isAlive()) continue;
      const dx = f.x - p.x;
      const dy = f.y - p.y;
      if (Math.hypot(dx, dy) < f.radius + 12) {
        const owner = fighters.find((o) => o.clientId === p.ownerId);
        if (owner) {
          applyHit(owner, f, { baseDamage: 8, baseKnockback: 120, angleDeg: p.vx >= 0 ? 15 : 165 }, now, effects);
        }
        consumed = true;
        break;
      }
    }
    if (!consumed) alive.push(p);
  }
  return alive;
}
