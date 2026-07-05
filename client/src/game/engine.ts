import { Fighter } from './fighter';
import { stepMovement, isOutOfBounds } from './physics';
import { applyHit, JAB, SMASH_DOWN, SMASH_SIDE, SMASH_UP, meleeRange } from './combat';
import { tryUseAbility, updateProjectiles, type Projectile } from './abilities';
import { MATCH_TIME_MS, SPAWN_POINTS } from './constants';
import type { EntitySnapshot, HitEffect, InputFrame } from '@/net/protocol';
import type { FighterBuild } from '@/builder/catalog';

const ATTACK_COOLDOWN_MS = 380;

export type MatchPhase = 'countdown' | 'active' | 'ended';

export interface MatchResult {
  clientId: string;
  place: number;
}

export class MatchEngine {
  fighters: Map<string, Fighter> = new Map();
  order: string[] = [];
  projectiles: Projectile[] = [];
  effects: HitEffect[] = [];
  startedAt = 0;
  phase: MatchPhase = 'countdown';
  results: MatchResult[] | null = null;

  constructor(players: { clientId: string; username: string; build: FighterBuild }[], startTime: number) {
    this.order = players.map((p) => p.clientId);
    players.forEach((p, i) => {
      const spawn = SPAWN_POINTS[i % SPAWN_POINTS.length];
      this.fighters.set(p.clientId, new Fighter(p.clientId, p.username, p.build, spawn));
    });
    this.startedAt = startTime;
  }

  timeRemainingMs(now: number): number {
    return Math.max(0, MATCH_TIME_MS - (now - this.startedAt));
  }

  applyInput(clientId: string, frame: InputFrame) {
    const f = this.fighters.get(clientId);
    if (f) f.lastInput = frame;
  }

  tick(dtSec: number, now: number) {
    if (this.phase === 'ended') return;
    if (now - this.startedAt < 1500) {
      this.phase = 'countdown';
      return;
    }
    this.phase = 'active';
    this.effects = [];

    const alive = [...this.fighters.values()].filter((f) => f.isAlive());

    for (const f of alive) {
      stepMovement(f, f.lastInput, dtSec, now);
      this.handleActions(f, alive, now);
    }

    this.projectiles = updateProjectiles(this.projectiles, alive, dtSec, now, this.effects);

    for (const f of alive) {
      if (isOutOfBounds(f)) {
        this.effects.push({ x: Math.max(0, Math.min(960, f.x)), y: Math.max(0, Math.min(540, f.y)), kind: 'ko' });
        f.stocks -= 1;
        if (f.stocks <= 0) {
          f.state = 'ko';
        } else {
          const spawn = SPAWN_POINTS[this.order.indexOf(f.clientId) % SPAWN_POINTS.length];
          f.respawn(spawn, now);
        }
      }
    }

    this.checkEndCondition(now);
  }

  private handleActions(f: Fighter, alive: Fighter[], now: number) {
    const input = f.lastInput;
    if (!input) return;
    const opponents = alive.filter((o) => o.clientId !== f.clientId);

    if (input.attack !== 'none' && now >= f.attackCooldownUntil && now >= f.hitstunUntil && !f.shielding) {
      f.attackCooldownUntil = now + ATTACK_COOLDOWN_MS;
      f.state = 'attack';
      const params = input.attack === 'jab' ? JAB : input.attack === 'smash-up' ? SMASH_UP : input.attack === 'smash-down' ? SMASH_DOWN : SMASH_SIDE;
      const angle = input.attack === 'smash-up' ? 95 : input.attack === 'smash-down' ? -95 : f.facing > 0 ? 10 : 170;
      for (const opp of opponents) {
        const dx = opp.x - f.x;
        const dy = opp.y - f.y;
        if (Math.hypot(dx, dy) < meleeRange(f)) {
          applyHit(f, opp, { ...params, angleDeg: angle }, now, this.effects);
        }
      }
    }

    if (input.ability === 1 || input.ability === 2) {
      tryUseAbility(input.ability - 1, f, opponents, now, this.effects, (p) => this.projectiles.push(p));
    }
  }

  private checkEndCondition(now: number) {
    const alive = [...this.fighters.values()].filter((f) => f.isAlive());
    const timeUp = this.timeRemainingMs(now) <= 0;
    if (alive.length <= 1 && this.fighters.size > 1) {
      this.finish(now);
    } else if (timeUp) {
      this.finish(now);
    }
  }

  private finish(now: number) {
    if (this.phase === 'ended') return;
    this.phase = 'ended';
    const ranked = [...this.fighters.values()].sort((a, b) => {
      if (a.stocks !== b.stocks) return b.stocks - a.stocks;
      return a.damagePercent - b.damagePercent;
    });
    this.results = ranked.map((f, i) => ({ clientId: f.clientId, place: i + 1 }));
  }

  snapshot(): EntitySnapshot[] {
    return [...this.fighters.values()].map((f) => ({
      clientId: f.clientId,
      x: f.x,
      y: f.y,
      vx: f.vx,
      vy: f.vy,
      facing: f.facing,
      damagePercent: f.damagePercent,
      stocks: f.stocks,
      state: f.state,
      hitstunUntil: f.hitstunUntil,
    }));
  }

  applySnapshot(entities: EntitySnapshot[]) {
    for (const e of entities) {
      const f = this.fighters.get(e.clientId);
      if (!f) continue;
      f.x = e.x;
      f.y = e.y;
      f.vx = e.vx;
      f.vy = e.vy;
      f.facing = e.facing;
      f.damagePercent = e.damagePercent;
      f.stocks = e.stocks;
      f.state = e.state as Fighter['state'];
      f.hitstunUntil = e.hitstunUntil;
    }
  }
}
