// The panorama and foreground palette for each illustrated battle arena.
// Scenery is screen-space parallax. Every walkable surface is painted at
// its exact world-space collision coordinate, including moving platforms.
const palette = (material, base, face, edge, ambient) => ({ material, base, face, edge, ambient });
export const ARENA_ART = {
  needledrop: palette('metal', '#261526', '#76375e', '#ff88bc'),
  belfry: palette('metal', '#302627', '#966a41', '#ffcf80'),
  koicrossing: palette('leaf', '#163e39', '#448168', '#c2e592'),
  mothmill: palette('wood', '#33273c', '#79524f', '#f5ca8a', 'fireflies'),
  pocketplanet: palette('stone', '#192c42', '#436e82', '#acf5de', 'ionspark'),
  lastscoop: palette('wafer', '#754245', '#c98a69', '#fff0bb'),
  switchback: palette('metal', '#242d40', '#96483f', '#ffe3a6'),
  glasshouse: palette('leaf', '#1b4143', '#508875', '#ceec9d'),
  parade: palette('wood', '#45293a', '#934846', '#ffca65', 'lanternmotes'),
  deadair: palette('metal', '#30293b', '#7f5e71', '#ffcc95'),
  pinball: palette('metal', '#302049', '#7d4b9e', '#8affff'),
  saltworks: palette('stone', '#5a4050', '#ba8382', '#fff4d2'),
  whalefall: palette('stone', '#173443', '#647e7c', '#cce5bc'),
  kitearmada: palette('fold', '#593448', '#c95847', '#ffe693', 'cloudwisp'),
  sleepercircuit: palette('metal', '#202637', '#505f73', '#ffab54'),
  caldera: palette('stone', '#2d2533', '#624347', '#ffac60', 'ashspark'),
  papersea: palette('fold', '#263d5a', '#6089a0', '#ffe0a5'),
  eclipse: palette('metal', '#192d44', '#465773', '#ffdf83', 'ionspark'),
};

export const arenaImage = id => 'art/arenas/' + id + '.webp';

export function drawArenaBackdrop(ctx, image, art, width, height, cam) {
  ctx.fillStyle = art.base;
  ctx.fillRect(0, 0, width, height);
  if (!image.complete || !image.naturalWidth) return;

  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight) * 1.08;
  const w = image.naturalWidth * scale, h = image.naturalHeight * scale;
  const x = (width - w) / 2 - width * 0.034 * Math.tanh(cam.x / 800);
  const y = (height - h) / 2 - height * 0.034 * Math.tanh((cam.y + 120) / 450);
  ctx.drawImage(image, x, y, w, h);
  // Mute fine painted detail behind the fighters and hit effects.
  ctx.fillStyle = 'rgba(13, 16, 35, .42)';
  ctx.fillRect(0, 0, width, height);
}

function drawSurface(ctx, x, y, w, h, art) {
  // Bevel the underside, keeping the playable top perfectly horizontal.
  const inset = Math.min(24, h * 0.6);
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(w, 0); ctx.lineTo(w, h * 0.55);
  ctx.lineTo(w - inset, h); ctx.lineTo(inset, h); ctx.lineTo(0, h * 0.55);
  ctx.closePath();
  ctx.fillStyle = art.base;
  ctx.fill();
  ctx.clip();
  ctx.fillStyle = art.face;
  ctx.fillRect(0, 3, w, h * 0.56);
  ctx.lineWidth = 2;
  ctx.strokeStyle = art.base;
  ctx.beginPath();
  for (let i = 0; i < w; i += 44) {
    switch (art.material) {
      case 'metal': // panel seams and recessed twin vents
        ctx.moveTo(i, 4); ctx.lineTo(i, h);
        ctx.moveTo(i + 10, 9); ctx.lineTo(i + 24, 9);
        ctx.moveTo(i + 10, 13); ctx.lineTo(i + 24, 13);
        break;
      case 'leaf': // branching veins
        ctx.moveTo(i, h); ctx.quadraticCurveTo(i + 24, h / 2, i + 41, 4);
        ctx.moveTo(i + 24, h / 2); ctx.lineTo(i + 18, 6);
        break;
      case 'wood':
        ctx.moveTo(i - 6, 8); ctx.bezierCurveTo(i + 6, 5, i + 20, 13, i + 38, 10);
        ctx.moveTo(i + 10, 19); ctx.lineTo(i + 38, 17);
        break;
      case 'stone':
        ctx.moveTo(i, h); ctx.lineTo(i + 17, h * 0.44); ctx.lineTo(i + 10, 4);
        ctx.moveTo(i + 17, h * 0.44); ctx.lineTo(i + 40, h * 0.6);
        break;
      case 'fold':
        ctx.moveTo(i, h); ctx.lineTo(i + 38, 4); ctx.lineTo(i + 44, h);
        break;
      case 'wafer':
        ctx.moveTo(i - 32, 0); ctx.lineTo(i + 12, h);
        ctx.moveTo(i + 12, h); ctx.lineTo(i + 56, 0);
        break;
    }
  }
  ctx.stroke();
  ctx.fillStyle = art.edge;
  ctx.fillRect(0, 0, w, 4);
  ctx.restore();
}

// Scenery attached to moving surfaces follows the same sampled position
// as a rider. Keep the bright, flat landing edge above every decoration.
function drawCarriage(ctx, p, art, railcar) {
  const depth = railcar ? 32 : 15;
  ctx.fillStyle = art.base;
  ctx.beginPath();
  ctx.moveTo(p.x + 8, p.y + 10);
  ctx.lineTo(p.x + p.w - 8, p.y + 10);
  ctx.lineTo(p.x + p.w - 26, p.y + 15 + depth);
  ctx.lineTo(p.x + 20, p.y + 15 + depth);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = railcar ? '#91c8d4' : art.edge;
  for (let x = p.x + 24; x < p.x + p.w - 38; x += 30) ctx.fillRect(x, p.y + 18, 20, depth * 0.55);
  for (const x of [p.x + 30, p.x + p.w - 34]) {
    ctx.fillStyle = '#172131';
    ctx.beginPath(); ctx.arc(x, p.y + 12 + depth, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = art.face;
    ctx.beginPath(); ctx.arc(x, p.y + 12 + depth, 3, 0, Math.PI * 2); ctx.fill();
  }
}

function drawFolds(ctx, p, art, kite) {
  const depth = Math.min(p.w * 0.23, 42);
  const keel = p.x + p.w * (kite ? 0.47 : 0.71);
  ctx.fillStyle = art.face;
  ctx.beginPath(); ctx.moveTo(p.x, p.y + 4); ctx.lineTo(keel, p.y + depth);
  ctx.lineTo(p.x + p.w, p.y + 4); ctx.fill();
  ctx.fillStyle = art.base;
  ctx.beginPath(); ctx.moveTo(p.x + p.w * 0.34, p.y + 4);
  ctx.lineTo(keel, p.y + depth); ctx.lineTo(p.x + p.w, p.y + 4); ctx.fill();
}

export function drawArenaStage(ctx, id, stage, plats, art, t) {
  const floor = stage.main;
  drawSurface(ctx, floor.x, floor.y, floor.w, floor.h, art);
  if (id === 'caldera') {
    // The pipes repeat in descending ranks beneath the organ's keyboard.
    for (let i = 0; i < Math.floor(floor.w / 32); i++) {
      const x = floor.x + 12 + i * 32;
      const depth = 16 + (6 - i % 7) * 7;
      ctx.fillStyle = art.base; ctx.fillRect(x, floor.y + floor.h - 1, 23, depth);
      ctx.fillStyle = art.face; ctx.fillRect(x + 4, floor.y + floor.h, 5, depth - 4);
    }
  }
  for (const p of plats) {
    if (p.move && (id === 'switchback' || id === 'sleepercircuit')) {
      drawCarriage(ctx, p, art, id === 'switchback');
    } else if (p.move && (id === 'belfry' || id === 'eclipse')) {
      ctx.fillStyle = art.base;
      for (const x of [p.x + 12, p.x + p.w - 16]) ctx.fillRect(x, stage.blast.t, 4, p.y - stage.blast.t);
    } else if (art.material === 'fold') {
      drawFolds(ctx, p, art, id === 'kitearmada');
    }
    drawSurface(ctx, p.x, p.y, p.w, 17, art);
    if (id === 'needledrop') {
      // The stylus has a little dancing VU meter along its cartridge.
      for (let i = 0; i < 12; i++) {
        ctx.fillStyle = i < 9 + 3 * Math.sin(t * 5) ? art.edge : art.base;
        ctx.fillRect(p.x + 28 + i * 11, p.y + 6, 7, 5);
      }
    } else if (art.material === 'wafer') {
      ctx.fillStyle = '#ffd4c4';
      for (let x = p.x + 10; x < p.x + p.w - 8; x += 35) {
        ctx.beginPath(); ctx.ellipse(x, p.y + 5, 5, 7, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
}
