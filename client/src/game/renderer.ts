import type { Fighter } from './fighter';
import type { Projectile } from './abilities';
import { STAGE_PLATFORMS, WORLD_HEIGHT, WORLD_WIDTH } from './constants';
import type { HitEffect } from '@/net/protocol';

interface FloatingEffect extends HitEffect {
  bornAt: number;
}

export class Renderer {
  ctx: CanvasRenderingContext2D;
  canvas: HTMLCanvasElement;
  private activeEffects: FloatingEffect[] = [];
  private shakeUntil = 0;
  private shakeMag = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');
    this.ctx = ctx;
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
  }

  pushEffects(effects: HitEffect[], now: number) {
    for (const e of effects) {
      this.activeEffects.push({ ...e, bornAt: now });
      if (e.kind === 'ko') {
        this.shakeUntil = now + 260;
        this.shakeMag = 10;
      } else if (e.kind === 'hit') {
        this.shakeUntil = now + 90;
        this.shakeMag = 3;
      }
    }
  }

  draw(fighters: Fighter[], projectiles: Projectile[], now: number, timeRemainingMs: number, localClientId: string) {
    const { ctx, canvas } = this;
    const scaleX = canvas.width / WORLD_WIDTH;
    const scaleY = canvas.height / WORLD_HEIGHT;
    const scale = Math.min(scaleX, scaleY);
    const offsetX = (canvas.width - WORLD_WIDTH * scale) / 2;
    const offsetY = (canvas.height - WORLD_HEIGHT * scale) / 2;

    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, '#1e1240');
    grad.addColorStop(1, '#090512');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.translate(offsetX, offsetY);
    if (now < this.shakeUntil) {
      const t = (this.shakeUntil - now) / 260;
      ctx.translate((Math.random() - 0.5) * this.shakeMag * t, (Math.random() - 0.5) * this.shakeMag * t);
    }
    ctx.scale(scale, scale);

    this.drawStage(ctx);
    for (const p of projectiles) this.drawProjectile(ctx, p);
    for (const f of fighters) this.drawFighter(ctx, f, now, f.clientId === localClientId);
    this.drawEffects(ctx, now);

    ctx.restore();

    this.drawHud(ctx, fighters, timeRemainingMs, localClientId);
  }

  private drawStage(ctx: CanvasRenderingContext2D) {
    for (const plat of STAGE_PLATFORMS) {
      ctx.fillStyle = plat.solid ? '#4c3a7a' : '#6d5aa8';
      roundRect(ctx, plat.x, plat.y, plat.width, plat.height, 8);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  private drawProjectile(ctx: CanvasRenderingContext2D, p: Projectile) {
    ctx.save();
    ctx.fillStyle = '#ffb347';
    ctx.shadowColor = '#ff8800';
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawFighter(ctx: CanvasRenderingContext2D, f: Fighter, now: number, isLocal: boolean) {
    if (!f.isAlive()) return;
    ctx.save();
    const flashHit = now < f.hitstunUntil;
    const invuln = now < f.invulnerableUntil;

    if (invuln && Math.floor(now / 90) % 2 === 0) ctx.globalAlpha = 0.45;

    ctx.translate(f.x, f.y);

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, f.radius + 8, f.radius * 0.8, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Shield bubble
    if (f.shielding) {
      ctx.strokeStyle = 'rgba(120,220,255,0.9)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, f.radius + 10, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = flashHit ? '#ffffff' : f.build.color;
    ctx.beginPath();
    ctx.arc(0, 0, f.radius, 0, Math.PI * 2);
    ctx.fill();

    if (isLocal) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, f.radius + 3, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Facing indicator (eyes)
    ctx.fillStyle = '#0b0b12';
    const eyeX = f.facing * f.radius * 0.35;
    ctx.beginPath();
    ctx.arc(eyeX - 4, -6, 3.4, 0, Math.PI * 2);
    ctx.arc(eyeX + 4, -6, 3.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // Name + damage%
    ctx.save();
    ctx.font = '13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(f.username, f.x, f.y - f.radius - 14);
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.fillStyle = damageColor(f.damagePercent);
    ctx.fillText(`${Math.round(f.damagePercent)}%`, f.x, f.y + f.radius + 26);
    ctx.restore();
  }

  private drawEffects(ctx: CanvasRenderingContext2D, now: number) {
    this.activeEffects = this.activeEffects.filter((e) => now - e.bornAt < 400);
    for (const e of this.activeEffects) {
      const t = (now - e.bornAt) / 400;
      ctx.save();
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = e.kind === 'ko' ? '#ff4d4d' : e.kind === 'block' ? '#7dd3fc' : '#ffe066';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(e.x, e.y, 14 + t * 30, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawHud(ctx: CanvasRenderingContext2D, fighters: Fighter[], timeRemainingMs: number, localClientId: string) {
    const w = this.canvas.width;
    ctx.save();
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    const secs = Math.ceil(timeRemainingMs / 1000);
    ctx.fillText(`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`, w / 2, 30 * (window.devicePixelRatio || 1));
    ctx.restore();
  }
}

function damageColor(pct: number): string {
  if (pct < 50) return '#fef9c3';
  if (pct < 100) return '#fdba74';
  return '#f87171';
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
