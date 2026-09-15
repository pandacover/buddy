import { deflateSync } from "node:zlib";

const PNG_SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const body = new Uint8Array(typeBytes.length + data.length);
  body.set(typeBytes, 0);
  body.set(data, 4);
  const crc = crc32(body);
  const out = new Uint8Array(8 + data.length + 4);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(body, 4);
  view.setUint32(8 + data.length, crc);
  return out;
}

export function scaleRgba(
  width: number,
  height: number,
  rgba: Uint8Array,
  maxDimension = 1920,
): { width: number; height: number; rgba: Uint8Array } {
  const largest = Math.max(width, height);
  if (largest <= maxDimension) {
    return { width, height, rgba };
  }

  const scale = maxDimension / largest;
  const nextWidth = Math.max(1, Math.round(width * scale));
  const nextHeight = Math.max(1, Math.round(height * scale));
  const next = new Uint8Array(nextWidth * nextHeight * 4);

  for (let y = 0; y < nextHeight; y += 1) {
    const srcY = Math.min(height - 1, Math.floor((y / nextHeight) * height));
    for (let x = 0; x < nextWidth; x += 1) {
      const srcX = Math.min(width - 1, Math.floor((x / nextWidth) * width));
      const src = (srcY * width + srcX) * 4;
      const dst = (y * nextWidth + x) * 4;
      next[dst] = rgba[src] ?? 0;
      next[dst + 1] = rgba[src + 1] ?? 0;
      next[dst + 2] = rgba[src + 2] ?? 0;
      next[dst + 3] = rgba[src + 3] ?? 255;
    }
  }

  return { width: nextWidth, height: nextHeight, rgba: next };
}

export function encodeRgbaPng(
  width: number,
  height: number,
  rgba: Uint8Array,
): Uint8Array {
  if (rgba.length < width * height * 4) {
    throw new Error("RGBA buffer is smaller than width * height * 4");
  }

  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, width);
  ihdrView.setUint32(4, height);
  ihdr[8] = 8;
  ihdr[9] = 6;

  const stride = width * 4;
  const raw = new Uint8Array(height * (1 + stride));
  for (let y = 0; y < height; y += 1) {
    const offset = y * (1 + stride);
    raw[offset] = 0;
    raw.set(rgba.subarray(y * stride, y * stride + stride), offset + 1);
  }

  const compressed = deflateSync(raw);
  const parts = [
    PNG_SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", compressed),
    chunk("IEND", new Uint8Array()),
  ];

  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const png = new Uint8Array(total);
  let cursor = 0;
  for (const part of parts) {
    png.set(part, cursor);
    cursor += part.length;
  }
  return png;
}

export function uint8ToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}
