import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PUBLIC = resolve(ROOT, 'public');

const svgPath = resolve(PUBLIC, 'favicon.svg');
const svg = await readFile(svgPath);

// Standard sizes from a circular icon (fits the SVG viewBox edge-to-edge).
const standardSizes = [
  { name: 'favicon-16x16.png', size: 16 },
  { name: 'favicon-32x32.png', size: 32 },
  { name: 'favicon.ico', size: 32 },
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'pwa-64x64.png', size: 64 },
  { name: 'pwa-192x192.png', size: 192 },
  { name: 'pwa-512x512.png', size: 512 },
];

for (const { name, size } of standardSizes) {
  await sharp(svg, { density: Math.max(72, size * 4) })
    .resize(size, size)
    .png()
    .toFile(resolve(PUBLIC, name));
  console.log(`✓ ${name} (${size}×${size})`);
}

// Maskable icon: black square background with the logo at ~70% scale (safe zone).
const maskableSize = 512;
const innerSize = Math.round(maskableSize * 0.7);
const inner = await sharp(svg, { density: maskableSize * 4 })
  .resize(innerSize, innerSize)
  .png()
  .toBuffer();

await sharp({
  create: {
    width: maskableSize,
    height: maskableSize,
    channels: 4,
    background: '#C5673B',
  },
})
  .composite([
    {
      input: inner,
      left: Math.round((maskableSize - innerSize) / 2),
      top: Math.round((maskableSize - innerSize) / 2),
    },
  ])
  .png()
  .toFile(resolve(PUBLIC, 'maskable-icon-512x512.png'));
console.log(`✓ maskable-icon-512x512.png (${maskableSize}×${maskableSize}, 70% safe zone)`);
