import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const W = 1200;
const H = 720;
const pixels = Buffer.alloc(W * H * 3);

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function set(x, y, color) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  pixels[i] = color[0];
  pixels[i + 1] = color[1];
  pixels[i + 2] = color[2];
}

function blend(x, y, color, alpha = 1) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  pixels[i] = Math.round(pixels[i] * (1 - alpha) + color[0] * alpha);
  pixels[i + 1] = Math.round(pixels[i + 1] * (1 - alpha) + color[1] * alpha);
  pixels[i + 2] = Math.round(pixels[i + 2] * (1 - alpha) + color[2] * alpha);
}

function line(x0, y0, x1, y1, color, width = 1) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= steps; i++) {
    const x = x0 + ((x1 - x0) * i) / steps;
    const y = y0 + ((y1 - y0) * i) / steps;
    for (let dx = -width; dx <= width; dx++) {
      for (let dy = -width; dy <= width; dy++) {
        if (dx * dx + dy * dy <= width * width + 1) blend(Math.round(x + dx), Math.round(y + dy), color, 0.85);
      }
    }
  }
}

const bg = [248, 243, 233];
const ink = [43, 41, 37];
const grid = [226, 217, 203];
const accent = [180, 83, 42];
const accent2 = [49, 95, 114];

for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) set(x, y, bg);
}

const left = 96;
const right = W - 62;
const top = 58;
const bottom = H - 86;
for (let i = 0; i <= 6; i++) {
  const y = top + ((bottom - top) * i) / 6;
  line(left, y, right, y, grid, 1);
}
for (let i = 0; i <= 8; i++) {
  const x = left + ((right - left) * i) / 8;
  line(x, top, x, bottom, grid, 1);
}
line(left, bottom, right, bottom, ink, 2);
line(left, top, left, bottom, ink, 2);

function curve(fn, color, width = 3) {
  let prev = null;
  for (let screenX = left; screenX <= right; screenX += 1) {
    const t = ((screenX - left) / (right - left)) * Math.PI * 2;
    const value = fn(t);
    const screenY = bottom - (value + 1.25) * ((bottom - top) / 2.7);
    if (prev) line(prev[0], prev[1], screenX, screenY, color, width);
    prev = [screenX, screenY];
  }
}

curve((t) => Math.sin(t) * Math.exp(-t / 7) + 0.12 * Math.cos(6 * t), accent2, 2);
curve((t) => 0.72 * Math.cos(t * 0.85) * Math.exp(-t / 11), accent, 3);

// Axis labels rendered as tiny blocks, so the demo needs no font dependency.
function blockText(x, y, widths, color) {
  let cursor = x;
  for (const w of widths) {
    for (let yy = 0; yy < 3; yy++) {
      for (let xx = 0; xx < w; xx++) set(cursor + xx, y + yy, color);
    }
    cursor += w + 5;
  }
}

blockText(left, bottom + 28, [18, 8, 8, 16], ink);
blockText(right - 92, bottom + 28, [18, 8, 12, 8, 16], ink);
blockText(left - 20, top - 26, [24, 8, 8], ink);

const raw = Buffer.alloc((W * 3 + 1) * H);
for (let y = 0; y < H; y++) {
  raw[y * (W * 3 + 1)] = 0;
  pixels.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;
ihdr[9] = 2;
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const target = path.join(process.cwd(), 'demo', 'assets', 'curve.png');
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, png);
console.log(`wrote ${target} (${png.length} bytes)`);
