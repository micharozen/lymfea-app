import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const WIDTH = 1200;
const HEIGHT = 630;
const BG = '#FAF7F2';
const FRAME = '#E8E0D5';
const DARK = '#1b1b1b';
const MUTED = '#7A7268';

const TAGLINE = 'Éveillez vos sens';
const SUBTITLE = 'Centre Holistique';

const LOGO_TARGET_WIDTH = 360;

const logoPath = resolve(ROOT, 'src/assets/eia-logo.png');
const outPath = resolve(ROOT, 'public/images/brand-og-image.png');

const logoBuffer = await readFile(logoPath);

// The source PNG has a solid ~#E4E2DE background; strip it so the logo
// composes cleanly on the cream OG canvas.
const { data: rawData, info: rawInfo } = await sharp(logoBuffer)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const stripped = Buffer.from(rawData);
for (let i = 0; i < stripped.length; i += 4) {
  const r = stripped[i];
  const g = stripped[i + 1];
  const b = stripped[i + 2];
  // Distance to background colour (228, 226, 222)
  const dist = Math.abs(r - 228) + Math.abs(g - 226) + Math.abs(b - 222);
  if (dist < 30) {
    stripped[i + 3] = 0;
  } else if (dist < 80) {
    // Soft edge for anti-aliasing
    stripped[i + 3] = Math.round((dist - 30) / 50 * 255);
  }
}

const logoScale = LOGO_TARGET_WIDTH / rawInfo.width;
const logoHeight = Math.round(rawInfo.height * logoScale);

const resizedLogo = await sharp(stripped, {
  raw: { width: rawInfo.width, height: rawInfo.height, channels: 4 },
})
  .resize({ width: LOGO_TARGET_WIDTH })
  .png()
  .toBuffer();

const logoLeft = Math.round((WIDTH - LOGO_TARGET_WIDTH) / 2);
const logoTop = 150;

const taglineY = logoTop + logoHeight + 80;
const subtitleY = taglineY + 60;

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="${BG}"/>
  <rect x="60" y="60" width="${WIDTH - 120}" height="${HEIGHT - 120}"
        fill="none" stroke="${FRAME}" stroke-width="1"/>
  <text x="${WIDTH / 2}" y="${taglineY}"
        text-anchor="middle"
        font-family="Georgia, 'Times New Roman', serif"
        font-style="italic"
        font-size="56"
        font-weight="400"
        letter-spacing="2"
        fill="${DARK}">${TAGLINE}</text>
  <text x="${WIDTH / 2}" y="${subtitleY}"
        text-anchor="middle"
        font-family="-apple-system, 'Helvetica Neue', Arial, sans-serif"
        font-size="22"
        font-weight="400"
        letter-spacing="6"
        fill="${MUTED}">${SUBTITLE.toUpperCase()}</text>
</svg>`;

const png = await sharp(Buffer.from(svg))
  .composite([{ input: resizedLogo, left: logoLeft, top: logoTop }])
  .png()
  .toBuffer();

await writeFile(outPath, png);

const finalMeta = await sharp(png).metadata();
console.log(`✓ Wrote ${outPath}`);
console.log(`  ${finalMeta.width}×${finalMeta.height}, ${(png.length / 1024).toFixed(1)} KB`);
