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
const GOLD = '#C4B07A';

const TITLE = 'Logiciel de gestion spa pour hôtels';
const SUBTITLE = 'Agenda unifié · PMS Opera &amp; Mews · App thérapeute';

// La tuile logo est pleine (fond terracotta) : on l'arrondit, on ne la détoure jamais.
const TILE_SIZE = 148;
const TILE_RADIUS = 36;

const tilePath = resolve(ROOT, 'public/images/saoma.png');
const outPath = resolve(ROOT, 'public/images/saoma-og-image.png');

const roundedMask = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE_SIZE}" height="${TILE_SIZE}">
     <rect width="${TILE_SIZE}" height="${TILE_SIZE}" rx="${TILE_RADIUS}" ry="${TILE_RADIUS}" fill="#fff"/>
   </svg>`,
);

const tile = await sharp(await readFile(tilePath))
  .resize(TILE_SIZE, TILE_SIZE, { fit: 'cover' })
  .composite([{ input: roundedMask, blend: 'dest-in' }])
  .png()
  .toBuffer();

// Wordmark "saoma." : la tuile et le mot sont centrés ensemble sur une ligne.
const WORDMARK_FONT_SIZE = 116;
const WORDMARK_GAP = 34;
const WORDMARK_TEXT_WIDTH = 345; // largeur mesurée de « saoma. » à cette taille
const wordmarkWidth = TILE_SIZE + WORDMARK_GAP + WORDMARK_TEXT_WIDTH;
const wordmarkLeft = Math.round((WIDTH - wordmarkWidth) / 2);
const tileTop = 196;
const textBaseline = tileTop + Math.round(TILE_SIZE * 0.78);

const titleY = tileTop + TILE_SIZE + 110;
const subtitleY = titleY + 56;

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="${BG}"/>
  <rect x="60" y="60" width="${WIDTH - 120}" height="${HEIGHT - 120}"
        fill="none" stroke="${FRAME}" stroke-width="1"/>
  <text x="${wordmarkLeft + TILE_SIZE + WORDMARK_GAP}" y="${textBaseline}"
        font-family="Georgia, 'Times New Roman', serif"
        font-size="${WORDMARK_FONT_SIZE}"
        font-weight="400"
        letter-spacing="-1"
        fill="${DARK}">saoma<tspan fill="${GOLD}">.</tspan></text>
  <text x="${WIDTH / 2}" y="${titleY}"
        text-anchor="middle"
        font-family="Georgia, 'Times New Roman', serif"
        font-size="44"
        font-weight="400"
        fill="${DARK}">${TITLE}</text>
  <text x="${WIDTH / 2}" y="${subtitleY}"
        text-anchor="middle"
        font-family="-apple-system, 'Helvetica Neue', Arial, sans-serif"
        font-size="22"
        font-weight="400"
        letter-spacing="2"
        fill="${MUTED}">${SUBTITLE}</text>
</svg>`;

const png = await sharp(Buffer.from(svg))
  .composite([{ input: tile, left: wordmarkLeft, top: tileTop }])
  .png()
  .toBuffer();

await writeFile(outPath, png);

const meta = await sharp(png).metadata();
console.log(`✓ Wrote ${outPath}`);
console.log(`  ${meta.width}×${meta.height}, ${(png.length / 1024).toFixed(1)} KB`);
