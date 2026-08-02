// draws the pwa icons: a white "7" on stone-800, no image libraries.
// run with: node scripts/make-icons.mjs
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const BG = [41, 37, 36]; // stone-800
const FG = [250, 250, 249]; // stone-50

// crc32, table built once
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) {
    c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

// is this point inside the seven? u and v are 0..1 across the icon.
function inSeven(u, v) {
  // the top bar. it ends where the stroke below it starts, or the join
  // leaves a little step on the right.
  if (v >= 0.24 && v <= 0.34 && u >= 0.26 && u <= 0.755) {
    return true;
  }

  // the stroke coming down from the right end of the bar
  if (v > 0.34 && v <= 0.78) {
    const center = 0.7 - ((v - 0.34) * 0.28) / 0.44;
    return Math.abs(u - center) <= 0.055;
  }

  return false;
}

function drawPng(size) {
  const rows = [];
  const samples = 3; // supersample so the diagonal is not a staircase

  for (let y = 0; y < size; y += 1) {
    const row = Buffer.alloc(1 + size * 3);

    for (let x = 0; x < size; x += 1) {
      let hits = 0;

      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const u = (x + (sx + 0.5) / samples) / size;
          const v = (y + (sy + 0.5) / samples) / size;
          if (inSeven(u, v)) {
            hits += 1;
          }
        }
      }

      const weight = hits / (samples * samples);
      const offset = 1 + x * 3;

      for (let channel = 0; channel < 3; channel += 1) {
        row[offset + channel] = Math.round(
          BG[channel] + (FG[channel] - BG[channel]) * weight,
        );
      }
    }

    rows.push(row);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // 8 bits per channel
  header[9] = 2; // truecolor rgb
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const [name, size] of [
  ["public/icon-192.png", 192],
  ["public/icon-512.png", 512],
  ["public/apple-touch-icon.png", 180],
]) {
  writeFileSync(name, drawPng(size));
  console.log(`wrote ${name} (${size}x${size})`);
}
