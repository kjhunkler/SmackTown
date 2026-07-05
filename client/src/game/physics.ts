import type { Fighter } from './fighter';
import {
  AIR_DRAG,
  BLAST_ZONE,
  FAST_FALL_MULT,
  GRAVITY,
  GROUND_FRICTION,
  MAX_FALL_SPEED,
  STAGE_PLATFORMS,
  WORLD_WIDTH,
} from './constants';
import type { InputFrame } from '@/net/protocol';

const EMPTY_INPUT: InputFrame = {
  moveX: 0,
  jump: false,
  fastFall: false,
  shield: false,
  attack: 'none',
  ability: 0,
  seq: 0,
};

export function isOutOfBounds(f: Fighter): boolean {
  return f.x < BLAST_ZONE.left || f.x > BLAST_ZONE.right || f.y < BLAST_ZONE.top || f.y > BLAST_ZONE.bottom;
}

export function stepMovement(f: Fighter, input: InputFrame | null, dtSec: number, now: number) {
  const frame = input ?? EMPTY_INPUT;
  const inHitstun = now < f.hitstunUntil;
  const inCounter = now < f.counterActiveUntil;
  f.shielding = frame.shield && f.grounded && !inHitstun && !inCounter;

  if (!inHitstun && !f.shielding && !inCounter) {
    const speed = frame.moveX !== 0 && Math.abs(frame.moveX) > 0.6 ? f.derived.dashSpeed : f.derived.moveSpeed;
    const control = f.grounded ? 1 : f.derived.airControlMult * 0.85;
    const targetVx = frame.moveX * speed * control;
    if (frame.moveX !== 0) {
      f.vx = f.grounded ? targetVx : clampLerp(f.vx, targetVx, 0.18);
      f.facing = frame.moveX > 0 ? 1 : -1;
    }

    if (frame.jump && f.jumpsUsed < f.derived.maxJumps) {
      f.vy = f.jumpsUsed === 0 ? f.derived.jumpVelocity : f.derived.airJumpVelocity;
      f.jumpsUsed += 1;
      f.grounded = false;
    }
  }

  // Gravity
  if (!f.grounded) {
    let g = GRAVITY;
    if (frame.fastFall && f.vy > 0) g *= FAST_FALL_MULT;
    f.vy = Math.min(MAX_FALL_SPEED, f.vy + g * dtSec);
  } else if (!inHitstun) {
    f.vx *= GROUND_FRICTION;
  }

  if (!f.grounded && !inHitstun) {
    f.vx *= AIR_DRAG;
  }

  f.x += f.vx * dtSec;
  f.y += f.vy * dtSec;

  resolvePlatformCollisions(f);

  f.x = Math.max(-40, Math.min(WORLD_WIDTH + 40, f.x));

  // State machine (cosmetic/logic bucket, used by renderer + gating)
  if (inHitstun) f.state = 'hitstun';
  else if (f.shielding) f.state = 'shield';
  else if (!f.grounded) f.state = f.vy < 0 ? 'jump' : 'fall';
  else if (Math.abs(f.vx) > 40) f.state = Math.abs(frame.moveX) > 0.6 ? 'dash' : 'walk';
  else f.state = 'idle';
}

function clampLerp(current: number, target: number, t: number): number {
  return current + (target - current) * t;
}

function resolvePlatformCollisions(f: Fighter) {
  f.grounded = false;
  const feetPrevY = f.y - f.vy * (1 / 60) + f.radius; // approx previous feet position for one-way checks
  for (const plat of STAGE_PLATFORMS) {
    const withinX = f.x + f.radius * 0.6 > plat.x && f.x - f.radius * 0.6 < plat.x + plat.width;
    if (!withinX) continue;

    const feetY = f.y + f.radius;
    if (plat.solid) {
      const topY = plat.y;
      const bottomY = plat.y + plat.height;
      if (feetY >= topY && f.y - f.radius < bottomY && f.vy >= 0) {
        f.y = topY - f.radius;
        f.vy = 0;
        f.grounded = true;
        f.jumpsUsed = 0;
      }
    } else {
      // One-way platform: only land when falling from above.
      if (f.vy >= 0 && feetY >= plat.y && feetY - Math.max(0, f.vy) * (1 / 60) <= plat.y + 6) {
        f.y = plat.y - f.radius;
        f.vy = 0;
        f.grounded = true;
        f.jumpsUsed = 0;
      }
    }
  }
}
