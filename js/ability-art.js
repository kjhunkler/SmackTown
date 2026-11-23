// World-space ability artwork. Casts animate once from simulation events.
// Projectiles take their orientation, radius and specialization from the sim.
import { abilityDef } from './profile.js';

const TAU = Math.PI * 2;
const ink = '#222239', light = '#fff7df';
const colors = {
  fireball: '#ff853f', volley: '#ffb83d', dashstrike: '#ffc448', uppercut: '#ffbb59',
  shockwave: '#ffc367', gale: '#c1e9ff', counter: '#6ecbff', bubble: '#86eaff',
  mend: '#69ed99', blink: '#c4a3ff', anchor: '#59efa5', hook: '#b5d8ed',
  trap: '#c7d4e2', springtrap: '#87d4ff', troop: '#9bee96', bird: '#a9dfff',
};
export const abilityColor = (family, variant) => abilityDef(variant)?.color || colors[family];

function line(ctx, points) {
  ctx.beginPath();
  ctx.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
  ctx.stroke();
}

function oval(ctx, x, y, rx, ry, angle = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, angle, 0, TAU);
  ctx.stroke();
}

function spark(ctx, x, y, r) {
  ctx.beginPath(); ctx.moveTo(x, y - r);
  ctx.lineTo(x + r * .28, y - r * .28); ctx.lineTo(x + r, y);
  ctx.lineTo(x + r * .28, y + r * .28); ctx.lineTo(x, y + r);
  ctx.lineTo(x - r * .28, y + r * .28); ctx.lineTo(x - r, y);
  ctx.lineTo(x - r * .28, y - r * .28); ctx.closePath(); ctx.fill();
}

// The flame tail points back along the actual flight, including after a skip.
export function drawFireShot(ctx, p, t) {
  const bolt = p.kind === 'bolt', r = p.r || (bolt ? 11 : 14);
  const phase = t * 22 + p.eid;
  const color = abilityColor(bolt ? 'volley' : 'fireball', p.variant);
  ctx.rotate(Math.atan2(p.vy || 0, p.vx || 0));
  ctx.fillStyle = color; ctx.strokeStyle = ink; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-r * (2.6 + .22 * Math.sin(phase)), 0);
  ctx.quadraticCurveTo(-r, -r * .22, -r * 1.5, -r);
  ctx.quadraticCurveTo(r, -r * 1.35, r, 0);
  ctx.quadraticCurveTo(r, r * 1.25, -r * 1.4, r * .85);
  ctx.quadraticCurveTo(-r, r * .35, -r * 2.6, 0);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = light;
  ctx.beginPath(); ctx.ellipse(0, 0, r * .65, r * .44, 0, 0, TAU); ctx.fill();
  if (p.variant === 'cinderskip') {
    ctx.strokeStyle = light; ctx.lineWidth = 2;
    oval(ctx, 0, 0, r * 1.35, r * .54, phase * .24);
  } else if (p.variant === 'sunburst' || p.variant === 'starfall') {
    ctx.rotate(phase * .22); ctx.fillStyle = color;
    for (let i = 0; i < (bolt ? 2 : 4); i++) {
      spark(ctx, r * 1.36, 0, r * .34); ctx.rotate(bolt ? Math.PI : Math.PI / 2);
    }
  }
}

export function drawHook(ctx, p, owner, t) {
  const color = abilityColor('hook', p.variant);
  if (owner) {
    const dx = owner.x - p.x, dy = owner.y - p.y - 6;
    ctx.strokeStyle = ink; ctx.lineWidth = 4;
    line(ctx, [0, 0, dx, dy]);
    ctx.strokeStyle = color; ctx.lineWidth = 2;
    ctx.setLineDash([7, 5]); ctx.lineDashOffset = -t * 65;
    line(ctx, [0, 0, dx, dy]); ctx.setLineDash([]);
  }
  ctx.rotate(Math.atan2(p.vy || 0, p.vx));
  ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.strokeStyle = color;
  line(ctx, [-13, 0, 17, 0, 6, -6]);
  for (const side of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(-8, 0);
    ctx.quadraticCurveTo(-6, side * 19, 12, side * 11); ctx.lineTo(9, side * 5); ctx.stroke();
  }
  if (p.variant) { ctx.fillStyle = light; spark(ctx, 18, 0, 7); }
}

export function drawTrap(ctx, p, t) {
  const spring = p.kind === 'spring', r = p.r || 24;
  const color = abilityColor(spring ? 'springtrap' : 'trap', p.variant);
  const wave = Math.sin(t * 7 + p.eid);
  ctx.lineWidth = 2; ctx.strokeStyle = color; ctx.fillStyle = ink;
  ctx.fillRect(-r, 4, 2 * r, 8); ctx.strokeRect(-r, 4, 2 * r, 8);
  if (spring) {
    const top = -12 + wave * 2;
    for (let i = 0; i < 4; i++) oval(ctx, 0, 3 + i * top / 3, r * .68, 4.5, -.09);
    ctx.fillStyle = color; ctx.fillRect(-r * .7, top - 4, r * 1.4, 4);
    if (p.variant) for (const side of [-1, 1]) line(ctx, [side * 8, top - 8, side * 14, top - 12, side * 8, top - 16]);
  } else {
    const teeth = p.variant ? 6 : 4, pitch = 2 * r / teeth;
    for (let i = 0; i < teeth; i++) {
      const x = -r + i * pitch;
      ctx.beginPath(); ctx.moveTo(x, 4); ctx.lineTo(x + pitch * .65, -10 + wave * 1.5);
      ctx.lineTo(x + pitch, 4); ctx.closePath(); ctx.fillStyle = color; ctx.fill();
    }
  }
  ctx.fillStyle = light; spark(ctx, wave * r * .66, 6, 2.5);
}

export function drawBeacon(ctx, p, t) {
  const color = abilityColor('anchor', p.variant);
  const phase = t * 3 + p.eid;
  ctx.lineWidth = 2.5; ctx.strokeStyle = color;
  oval(ctx, 0, 20, 23, 5);
  ctx.setLineDash([9, 4]); ctx.lineDashOffset = -t * 22;
  oval(ctx, 0, 20, 28, 7); ctx.setLineDash([]);
  const y = -37 + 3 * Math.sin(phase);
  ctx.setLineDash([3, 5]); line(ctx, [0, y + 12, 0, 18]); ctx.setLineDash([]);
  ctx.fillStyle = ink;
  ctx.beginPath(); ctx.moveTo(0, y - 16); ctx.lineTo(11, y); ctx.lineTo(0, y + 16); ctx.lineTo(-11, y); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = color;
  if (p.variant === 'lifeline') {
    ctx.fillRect(-6, y - 2, 12, 4); ctx.fillRect(-2, y - 6, 4, 12);
  } else spark(ctx, 0, y, 6);
}

// Short-lived gestures use the same clocks on either side of the network.
// k is elapsed lifetime from zero to one, independent of frame rate.
export function drawAbilityCast(ctx, ev, k) {
  const key = ev.ability;
  const family = key === 'anchortp' ? 'anchor' : key;
  const color = abilityColor(family, ev.variant);
  if (!color) return;
  const ease = 1 - (1 - k) ** 2, dir = ev.dir || 1;
  ctx.save(); ctx.translate(ev.x, ev.y);
  ctx.globalAlpha = Math.min(1, (1 - k) * 1.8);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 3;
  switch (key) {
    case 'fireball':
    case 'volley': {
      ctx.rotate(Math.atan2(ev.aimY || 0, ev.aimX ?? dir));
      const rays = key === 'fireball' ? 3 : ev.variant ? 5 : 3;
      for (let i = 0; i < rays; i++) {
        const a = (i - (rays - 1) / 2) * (key === 'fireball' ? .17 : .26);
        ctx.save(); ctx.rotate(a); const x = 25 + ease * 65;
        line(ctx, [x - 14 * (1 - k), 0, x, 0]); ctx.restore();
      }
      break;
    }
    case 'dashstrike':
    case 'uppercut': {
      ctx.scale(dir, 1);
      ctx.rotate(key === 'uppercut' ? -1.35 : ev.up ? -.73 : 0);
      const x = ease * (ev.variant ? 140 : 96);
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath(); ctx.moveTo(x - 65, i * 11 + 12);
        ctx.quadraticCurveTo(x - 32, i * 14 - 10, x, i * 9); ctx.stroke();
      }
      if (ev.variant) { ctx.fillStyle = light; spark(ctx, x, 0, 9 * (1 - k)); }
      break;
    }
    case 'shockwave': {
      const radius = ev.variant ? 265 : 190;
      for (const sign of [-1, 1]) {
        const x = sign * (16 + ease * radius);
        line(ctx, [x * .25, 1, x * .44, -5, x * .56, 2, x * .65, -12, x * .8, -3, x, 0]);
        if (ev.variant) line(ctx, [x * .65, -12, x * .67, -25, x * .75, -34]);
      }
      break;
    }
    case 'gale': {
      const radius = (ev.variant ? 260 : 200) * (.14 + ease * .86);
      ctx.scale(1, .55);
      for (let i = 0; i < (ev.variant ? 4 : 3); i++) {
        const a = k * 4 + i * TAU / (ev.variant ? 4 : 3);
        ctx.beginPath(); ctx.arc(0, 0, radius, a, a + 1); ctx.stroke();
      }
      break;
    }
    case 'bubble':
    case 'counter': {
      const count = ev.variant ? 8 : 4, r = 65 - ease * 22;
      for (let i = 0; i < count; i++) {
        ctx.rotate(TAU / count); line(ctx, [r + 8, -5, r, 0, r + 8, 5]);
      }
      break;
    }
    case 'mend':
      for (let i = 0; i < (ev.variant ? 7 : 4); i++) {
        const a = i * 2.4 + k * 2;
        const x = Math.cos(a) * 30, y = 14 - ease * 62 + Math.sin(a) * 15;
        ctx.fillRect(x - 6, y - 2, 12, 4); ctx.fillRect(x - 2, y - 6, 4, 12);
      }
      break;
    case 'blink':
    case 'anchortp': {
      const dx = (ev.fromX ?? ev.x) - ev.x, dy = (ev.fromY ?? ev.y) - ev.y;
      const aperture = 4 + (1 - k) * 12;
      oval(ctx, dx, dy, aperture, 38 * (1 - k) + 2, .2);
      oval(ctx, 0, 0, aperture, 25 + 20 * ease, -.2);
      ctx.setLineDash([10, 10]); ctx.lineDashOffset = k * 65;
      line(ctx, [dx, dy, 0, 0]); ctx.setLineDash([]);
      if (ev.variant) { ctx.fillStyle = light; spark(ctx, dx * (1 - ease), dy * (1 - ease), 8); }
      break;
    }
    case 'hook':
      ctx.translate(0, -8);
      ctx.rotate(Math.atan2(ev.aimY || 0, ev.aimX ?? dir));
      for (let i = 0; i < 3; i++) oval(ctx, 20 + ease * 55 + i * 9, 0, 6, 3, -.22);
      break;
    case 'trap':
    case 'springtrap':
    case 'anchor':
      oval(ctx, key === 'anchor' ? 0 : dir * 30, 27, 9 + ease * (ev.variant ? 42 : 31), 4 + ease * 6);
      break;
    case 'troop':
    case 'bird': {
      const flyer = key === 'bird';
      const sides = ev.variant === 'twinflight' ? [1, -1] : [1];
      for (const side of sides) {
        const x = dir * side * 70, y = flyer ? -50 : 20;
        oval(ctx, x, y, 14 + ease * 29, 5 + ease * 7);
        for (const s of [-1, 1]) {
          const height = flyer ? -20 - ease * 28 : -12 - ease * 20;
          line(ctx, [x + s * 8, y - 3, x + s * 25, y + height * .6, x + s * (flyer ? 45 : 25), y + height]);
          if (ev.variant === 'vanguard') line(ctx, [x + s * 13, y - 11, x + s * 19, y - 24]);
        }
      }
      break;
    }
  }
  ctx.restore();
}
