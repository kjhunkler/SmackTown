import { CITY_ROOMS, cityDoors, cityOpen } from './city.js';

const posters = new Map();
function poster(art) {
  if (!posters.has(art)) {
    const image = new Image();
    image.src = 'art/city-' + art + '.webp';
    posters.set(art, image);
  }
  return posters.get(art);
}

function placard(ctx, x, y, label, color) {
  ctx.font = '900 21px "Barlow Condensed", sans-serif';
  ctx.textAlign = 'center';
  const w = ctx.measureText(label).width + 20;
  ctx.fillStyle = '#0e1426'; ctx.fillRect(x - w / 2, y - 22, w, 29);
  ctx.fillStyle = color; ctx.fillRect(x - w / 2, y + 6, w, 2);
  ctx.fillText(label, x, y);
}

function entrance(ctx, room, t, warning) {
  const [x, y] = room.entry;
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = '#101322'; ctx.strokeStyle = warning ? '#fff2b0' : room.color;
  ctx.lineWidth = warning ? 5 : 3;
  if (room.art === 'roofs') {
    ctx.beginPath(); ctx.ellipse(0, 0, 40, 15, -.18, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.setLineDash([9, 6]); ctx.lineDashOffset = -t * 22;
    ctx.beginPath(); ctx.ellipse(0, 0, 48, 23, -.18, 0, Math.PI * 2); ctx.stroke();
  } else if (room.art === 'cistern') {
    ctx.beginPath(); ctx.arc(0, 0, 35, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    for (let i = -2; i <= 2; i++) {
      ctx.fillStyle = '#5dd4c888'; ctx.fillRect(i * 10, 8 + Math.sin(t * 3 + i) * 3, 5, 18);
    }
  } else {
    ctx.fillRect(-36, -39, 72, 74); ctx.strokeRect(-36, -39, 72, 74);
    ctx.fillStyle = '#6e6977';
    for (let i = 0; i < (warning ? 2 : 6); i++) ctx.fillRect(-33, -36 + i * 8, 66, 4);
  }
  ctx.restore();
  if (warning) placard(ctx, x, y - 44, room.source.toUpperCase(), '#ffde8a');
}

export function drawCity(ctx, view, cam, canvas, t) {
  const state = view.city;
  const room = CITY_ROOMS[state.room];
  const width = canvas.width / cam.zoom, height = canvas.height / cam.zoom;
  const top = cam.y - height / 2, left = -width / 2;
  ctx.save();
  ctx.fillStyle = '#111624'; ctx.fillRect(left, top, width, height);
  const boarding = state.finale === 2;
  const img = poster(boarding ? 'train' : room.art);
  if (img.complete && img.naturalWidth) {
    const scale = Math.max(width / img.naturalWidth, (16 - top) / img.naturalHeight);
    const w = img.naturalWidth * scale, h = img.naturalHeight * scale;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, -w / 2, 16 - h, w, h);
  }
  // The floor and one-way platforms have the exact same silhouettes as
  // collision geometry. Foreground utility lines frame the touch controls.
  ctx.fillStyle = '#101321'; ctx.fillRect(left, 0, width, height);
  ctx.fillStyle = '#353448'; ctx.fillRect(left, 4, width, 13);
  ctx.fillStyle = room.color; ctx.fillRect(left, 0, width, 3);
  for (let x = -620; x < 640; x += 42) {
    ctx.fillStyle = '#645464'; ctx.fillRect(x, 8, 16, 4);
    ctx.fillStyle = '#242638'; ctx.fillRect(x, 22, 34, 4);
  }
  for (const p of room.plats) {
    ctx.fillStyle = '#121524'; ctx.fillRect(p.x, p.y, p.w, 14);
    ctx.fillStyle = room.color; ctx.fillRect(p.x, p.y, p.w, 3);
    ctx.fillStyle = '#757181';
    for (let x = p.x + 8; x < p.x + p.w - 5; x += 20) ctx.fillRect(x, p.y + 7, 9, 2);
  }
  // The line diagram doubles as the party's route map below the playfield.
  const stops = [[-205, 'roofs', 'SIGNAL HEIGHTS'], [0, 'market', 'LANTERN MARKET'], [205, 'cistern', 'UNDERTOW WORKS']];
  ctx.lineWidth = 3; ctx.strokeStyle = '#535569'; ctx.beginPath();
  ctx.moveTo(-205, 60); ctx.lineTo(205, 60); ctx.stroke();
  for (const [x, id, label] of stops) {
    ctx.fillStyle = id === state.room ? room.color : (state.clear & CITY_ROOMS[id].bit) ? '#8ee4cb' : '#7b8192';
    ctx.beginPath(); ctx.arc(x, 60, id === state.room ? 8 : 5, 0, Math.PI * 2); ctx.fill();
    ctx.font = '900 18px "Barlow Condensed",sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(label, x, 88);
  }
  if (room.relay) {
    const { x, y } = room.relay;
    const color = state.clear & room.bit ? '#80ffe3' : state.relayReady ? '#ffdc66' : '#8192a1';
    ctx.fillStyle = '#111a28'; ctx.fillRect(x - 13, y - 44, 26, 43);
    ctx.fillStyle = color; ctx.fillRect(x - 8, y - 38, 16, 20);
    if (state.relayReady) {
      placard(ctx, x, y - 65, 'POWER RELAY', color);
      ctx.fillRect(x - 30, y - 54, Math.min(60, state.relayCharge / .65 * 60), 4);
    }
  }
  if (state.room === 'cistern' && !cityOpen(state) && !state.relayReady && state.pumpTick >= 295) {
    const surge = state.pumpTick >= 390;
    const h = surge ? 68 * (420 - state.pumpTick) / 30 : 7 + 3 * Math.sin(t * 8);
    ctx.fillStyle = surge ? '#87ffe58c' : '#eec06699'; ctx.fillRect(-590, -h, 1180, h);
    placard(ctx, 0, -54, surge ? 'FLUSH' : 'PRESSURE RISING', '#ffe19b');
  }
  const open = cityOpen(state);
  if (!boarding) entrance(ctx, room, t, !open && state.wait < 1.05 && state.sent < (state.finale ? 1 : room.foes.length));
  for (const gate of cityDoors(state)) {
    const x = gate.x;
    const light = open ? '#8cffe4' : '#d39577';
    if (boarding) {
      placard(ctx, x, -104, 'BOARD TOGETHER', light);
      ctx.fillStyle = '#8cffe450'; ctx.fillRect(x - 65, -6, 130, 6);
      if (state.hold) {
        ctx.fillStyle = light; ctx.fillRect(x - 65, -6, 130 * Math.min(1, state.hold / .85), 6);
      }
      continue;
    }
    ctx.fillStyle = '#0b1121d9'; ctx.fillRect(x - 37, -87, 74, 87);
    ctx.strokeStyle = light; ctx.lineWidth = 4; ctx.strokeRect(x - 37, -87, 74, 87);
    if (open) {
      ctx.fillStyle = '#80fcdc28'; ctx.fillRect(x - 34, -84, 68, 82);
      ctx.fillStyle = '#aaffdf'; ctx.fillRect(x - 34, -76 + (t * 35 % 70), 68, 2);
    } else {
      ctx.fillStyle = '#6b534e';
      for (let y = -80; y < 0; y += 12) ctx.fillRect(x - 32, y, 64, 3);
    }
    placard(ctx, x, -96, gate.label.toUpperCase(), light);
    if (state.gate === gate.to) {
      ctx.fillStyle = '#91ffe6'; ctx.fillRect(x - 38, -4, 76 * Math.min(1, state.hold / .85), 6);
    }
  }
  ctx.restore();
}
