// CreditX brand-asset generator
// --------------------------------
// Rasterizes brand/creditx-icon.png (ideally 1024×1024) into every favicon,
// login logo, and Capacitor native-asset source used across the three apps.
//
// Usage (from creditx-agent, where the dev deps live):
//   npm i -D sharp png-to-ico @capacitor/assets
//   node ../brand/generate-assets.mjs
//   npx capacitor-assets generate --android   # regenerates android/ icons+splash
//
// The native step reads creditx-agent/assets/* (produced below) and writes the
// Android launcher densities, adaptive icon, and splash screens.

import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';

// Resolve sharp / png-to-ico from the cwd (run this from creditx-agent, where
// the dev deps are installed) rather than from this script's brand/ folder.
const require = createRequire(join(process.cwd(), 'package.json'));
const sharp = require('sharp');
const pngToIcoMod = require('png-to-ico');
const pngToIco = pngToIcoMod.default || pngToIcoMod;

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const SRC = join(here, 'creditx-icon.png');

if (!existsSync(SRC)) {
  console.error(`\n✗ Source not found: ${SRC}\n  Save the logo (1024×1024 PNG) there first.\n`);
  process.exit(1);
}

const p = (...seg) => join(root, ...seg);
const ensure = (f) => { mkdirSync(dirname(f), { recursive: true }); return f; };

// Square 1024 master from the source (cover-crops if not square).
const base = await sharp(SRC).resize(1024, 1024, { fit: 'cover' }).png().toBuffer();

// The source is a rounded green tile sitting on a white margin. Trim the white
// to get the tile, and sample the brand green from just inside its top edge
// (a corner pixel would read the white margin).
const trimmed = await sharp(SRC).trim().toBuffer({ resolveWithObject: true });
const tile = trimmed.data;
const gp = await sharp(tile)
  .extract({ left: Math.round(trimmed.info.width * 0.5), top: Math.round(trimmed.info.height * 0.05), width: 2, height: 2 })
  .raw().toBuffer();
const bg = { r: gp[0], g: gp[1], b: gp[2], alpha: 1 };
console.log(`Brand green sampled: rgb(${bg.r}, ${bg.g}, ${bg.b})`);

const solid = (size) => sharp({ create: { width: size, height: size, channels: 4, background: bg } }).png().toBuffer();

// Full-bleed tile: overscale the trimmed tile ~22% and center-crop back to
// size, so its rounded corners fall outside the crop, leaving the brand green
// edge-to-edge with the mark centred.
const fullBleed = async (size) => {
  const big = Math.round(size * 1.22);
  const off = Math.round((big - size) / 2);
  const scaled = await sharp(tile).resize(big, big, { fit: 'cover' }).png().toBuffer();
  return sharp(scaled).extract({ left: off, top: off, width: size, height: size }).png().toBuffer();
};

// A cornerless central crop (mark on green, no rounded corners) for the
// adaptive foreground + splash so it blends seamlessly over a green field.
const cc = Math.round(1024 * 0.62), coff = Math.round((1024 - cc) / 2);
const markGreen = await sharp(base).extract({ left: coff, top: coff, width: cc, height: cc }).png().toBuffer();
const transparent = (size) => sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
const markOn = async (canvas, size, inner) => sharp(canvas)
  .composite([{ input: await sharp(markGreen).resize(inner, inner, { fit: 'cover' }).png().toBuffer(), gravity: 'center' }])
  .png().toBuffer();

async function write(file, buf) { writeFileSync(ensure(p(file)), buf); console.log('  ✓', file); }

console.log('\nWeb favicons + login logos');
// Favicons (multi-res .ico for the two Angular apps; PNG for the Ionic app).
const ico = await pngToIco([await fullBleed(16), await fullBleed(32), await fullBleed(48), await fullBleed(64)]);
await write('creditx-admin/public/favicon.ico', ico);
await write('creditx-portal/public/favicon.ico', ico);
await write('creditx-agent/src/assets/icon/favicon.png', await fullBleed(64));

// Login logos + apple touch icon (full-bleed tile; CSS rounds the corners).
await write('creditx-admin/public/creditx-logo.png', await fullBleed(512));
await write('creditx-portal/public/creditx-logo.png', await fullBleed(512));
await write('creditx-agent/src/assets/icon/logo.png', await fullBleed(512));
await write('creditx-admin/public/apple-touch-icon.png', await fullBleed(180));
await write('creditx-portal/public/apple-touch-icon.png', await fullBleed(180));

console.log('\nCapacitor native-asset sources (creditx-agent/assets)');
// @capacitor/assets inputs: full-bleed square icon, adaptive foreground (mark
// in the safe zone) + matching green background, and a splash with the mark
// centred on the brand green.
await write('creditx-agent/assets/icon-only.png', await fullBleed(1024));
await write('creditx-agent/assets/icon-foreground.png', await markOn(await transparent(1024), 1024, 640));
await write('creditx-agent/assets/icon-background.png', await solid(1024));
await write('creditx-agent/assets/splash.png', await markOn(await solid(2732), 2732, 1000));
await write('creditx-agent/assets/splash-dark.png', await markOn(await solid(2732), 2732, 1000));

console.log('\nDone. Next: cd creditx-agent && npx capacitor-assets generate --android\n');
