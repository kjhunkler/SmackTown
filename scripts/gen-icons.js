// Pure-Node PNG encoder (no deps) to procedurally generate the PWA app icons.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { mkdirSync } from 'node:fs';

function crc32(buf) {
  let c;
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(width, height, rgbaPixels) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgbaPixels.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idatData = deflateSync(raw, { level: 9 });

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idatData),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- Icon art: a stylized fist-bump spark badge on a rounded gradient square ---
function hexToRgb(hex) {
  const v = parseInt(hex.replace('#', ''), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function mixColor(c1, c2, t) {
  return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
}

function pointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function drawIcon(size, { maskable = false } = {}) {
  const px = Buffer.alloc(size * size * 4);
  const top = hexToRgb('#7c3aed'); // violet
  const bottom = hexToRgb('#ec4899'); // pink
  const spark = hexToRgb('#fef08a'); // pale yellow
  const sparkEdge = hexToRgb('#f97316'); // orange

  // Safe-zone padding for maskable icons (content must fit within ~80% center circle).
  const pad = maskable ? size * 0.18 : size * 0.06;
  const cornerRadius = maskable ? 0 : size * 0.22;
  const cx = size / 2;
  const cy = size / 2;

  // A simple 4-point "spark/star" polygon (like a fist-impact burst), scaled to fit safe zone.
  const r1 = (size / 2 - pad); // outer point radius
  const r2 = r1 * 0.42; // inner concave radius
  const points = [];
  const spikes = 4;
  for (let i = 0; i < spikes * 2; i++) {
    const angle = (Math.PI / spikes) * i - Math.PI / 2;
    const r = i % 2 === 0 ? r1 : r2;
    points.push([cx + Math.cos(angle) * r, cy + Math.sin(angle) * r]);
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      let a = 255;

      if (!maskable) {
        // Rounded-rect clipping for the "any" purpose icon.
        const dx = Math.max(0, Math.abs(x - cx) - (size / 2 - cornerRadius));
        const dy = Math.max(0, Math.abs(y - cy) - (size / 2 - cornerRadius));
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > cornerRadius) {
          px[idx] = 0; px[idx + 1] = 0; px[idx + 2] = 0; px[idx + 3] = 0;
          continue;
        }
      }

      const t = y / size;
      const bg = mixColor(top, bottom, t);

      let color = bg;
      const distFromCenter = Math.hypot(x - cx, y - cy);
      if (pointInPolygon(x, y, points)) {
        const glow = 1 - Math.min(1, distFromCenter / r1);
        color = mixColor(sparkEdge, spark, glow);
      }

      px[idx] = Math.round(color[0]);
      px[idx + 1] = Math.round(color[1]);
      px[idx + 2] = Math.round(color[2]);
      px[idx + 3] = a;
    }
  }
  return px;
}

mkdirSync(new URL('../client/public/icons', import.meta.url), { recursive: true });

const outputs = [
  { name: 'icon-192.png', size: 192, maskable: false },
  { name: 'icon-512.png', size: 512, maskable: false },
  { name: 'icon-maskable-192.png', size: 192, maskable: true },
  { name: 'icon-maskable-512.png', size: 512, maskable: true },
  { name: 'apple-touch-icon.png', size: 180, maskable: false },
  { name: 'favicon-32.png', size: 32, maskable: false },
];

for (const { name, size, maskable } of outputs) {
  const pixels = drawIcon(size, { maskable });
  const png = encodePNG(size, size, pixels);
  const path = new URL(`../client/public/icons/${name}`, import.meta.url);
  writeFileSync(path, png);
  console.log(`wrote ${name} (${size}x${size}, ${png.length} bytes)`);
}
