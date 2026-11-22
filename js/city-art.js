import { CITY_ROOMS, TRAVEL_HOLD, nextDistrict } from './city.js';

const posters = new Map();
function poster(art) {
  if (!posters.has(art)) {
    const image = new Image();
    image.src = 'art/city-' + art + '.webp';
    posters.set(art, image);
  }
  return posters.get(art);
}

function freightCar(ctx, p, index) {
  const x = p.x, y = p.y + 6, w = p.w;
  ctx.fillStyle = '#222830'; ctx.fillRect(x + 3, y, w - 6, -y - 18);
  // Reuse the station train's painted carriage. Alternate the lit doors
  // with window bays so each roof has an identifiable car beneath it.
  const train = poster('train');
  if (train.complete && train.naturalWidth) {
    const sx = index % 3 === 1 ? .32 : .082, sw = index % 3 === 1 ? .36 : .32;
    ctx.drawImage(train, train.naturalWidth * sx, train.naturalHeight * .34,
      train.naturalWidth * sw, train.naturalHeight * .51, x + 3, y, w - 6, -y - 23);
    ctx.fillStyle = '#18202c50'; ctx.fillRect(x + 3, y, w - 6, -y - 23);
  }
  for (const offset of [33, 63, w - 63, w - 33]) {
    ctx.fillStyle = '#191e25'; ctx.beginPath(); ctx.arc(x + offset, -14, 13, 0, 2 * Math.PI); ctx.fill();
    ctx.fillStyle = '#5b5c62'; ctx.fillRect(x + offset - 4, -18, 8, 8);
  }
}

function edgePrompt(ctx, state, room, t, side, nearby) {
  const x = side * (room.limit - 55), y = -155;
  ctx.save();
  ctx.translate(x + side * 5 * Math.sin(t * 7), y);
  ctx.scale(side, 1);
  ctx.globalAlpha = .76 + .24 * Math.sin(t * 7);
  ctx.beginPath();
  ctx.moveTo(-37, -9); ctx.lineTo(2, -9); ctx.lineTo(2, -23);
  ctx.lineTo(37, 0); ctx.lineTo(2, 23); ctx.lineTo(2, 9); ctx.lineTo(-37, 9);
  ctx.closePath(); ctx.fillStyle = state.locked ? '#e89783' : '#ffe3a6';
  ctx.strokeStyle = '#24202a'; ctx.lineWidth = 6; ctx.stroke(); ctx.fill();
  ctx.restore();

  const label = state.locked ? 'BOSS LOCK' : CITY_ROOMS[nextDistrict(state.room, side)].name.toUpperCase();
  ctx.font = '900 18px "Barlow Condensed", sans-serif';
  const text = label + '  ' + nearby + '/' + state.required;
  const width = ctx.measureText(text).width + 18;
  const left = side > 0 ? room.limit - width : -room.limit;
  ctx.fillStyle = '#171a23'; ctx.fillRect(left, y + 29, width, 29);
  ctx.fillStyle = '#fff0d5'; ctx.textAlign = 'center';
  ctx.fillText(text, left + width / 2, y + 49);
  ctx.fillRect(left, y + 56, width * Math.min(1, state.hold / TRAVEL_HOLD), 2);
}

export function drawCity(ctx, view, cam, canvas, t) {
  const state = view.city, room = CITY_ROOMS[state.room];
  const width = canvas.width / cam.zoom, height = canvas.height / cam.zoom;
  const top = cam.y - height / 2, left = cam.x - width / 2;
  const [base, face, lip] = room.colors;
  ctx.save();
  ctx.fillStyle = base; ctx.fillRect(left, top, width, height);
  const img = poster(room.art);
  if (img.complete && img.naturalWidth) {
    const scale = Math.max(width / img.naturalWidth, (10 - top) / img.naturalHeight) * 1.12;
    const w = img.naturalWidth * scale, h = img.naturalHeight * scale;
    const pan = -.034 * Math.tanh(cam.x / 760) + .009 * Math.sin(t * .24);
    ctx.drawImage(img, cam.x - w / 2 + width * pan, 8 - h + 3 * Math.sin(t * .33), w, h);
    ctx.fillStyle = '#13142530'; ctx.fillRect(left, top, width, -top);
  }
  ctx.fillStyle = base; ctx.fillRect(left, 0, width, height);
  ctx.fillStyle = face; ctx.fillRect(left, 3, width, 10);
  ctx.fillStyle = lip; ctx.fillRect(left, 0, width, 2);
  for (let x = Math.floor(left / 64) * 64; x < left + width; x += 64) {
    ctx.fillStyle = '#0003'; ctx.fillRect(x, 7, 19, 3);
  }
  room.plats.forEach((p, i) => {
    if (p.x > left + width || p.x + p.w < left) return;
    if (state.room === 'cars' && i % 2 === 0) freightCar(ctx, p, i / 2);
    ctx.fillStyle = base; ctx.fillRect(p.x, p.y, p.w, 14);
    ctx.fillStyle = face; ctx.fillRect(p.x, p.y + 2, p.w, 7);
    ctx.fillStyle = lip; ctx.fillRect(p.x, p.y, p.w, 2);
    ctx.fillStyle = '#0004';
    for (let x = p.x + 8; x < p.x + p.w - 5; x += 28) ctx.fillRect(x, p.y + 5, 3, 2);
  });
  if (state.room === 'cistern' && state.pumpTick >= 295) {
    const surge = state.pumpTick >= 390;
    const h = surge ? 68 * (420 - state.pumpTick) / 30 : 6 + 3 * Math.sin(t * 8);
    ctx.fillStyle = surge ? '#87ffe58c' : '#eec06699'; ctx.fillRect(room.main.x, -h, room.main.w, h);
  }
  if (state.left) edgePrompt(ctx, state, room, t, -1, state.left);
  if (state.right) edgePrompt(ctx, state, room, t, 1, state.right);
  ctx.restore();
}
