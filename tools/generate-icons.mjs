// Regenerates the PWA / home-screen icons from the brand mark.
// Run with: node tools/generate-icons.mjs
//
// The source is a full-bleed dark square with the cream "P" centered well
// inside the maskable safe zone (the inner 80% circle), so the same artwork
// works as an Android maskable icon, an iOS apple-touch-icon (iOS applies its
// own rounded-rect mask), and the standard "any" icon.
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const publicDir = fileURLToPath(new URL("../public/", import.meta.url));

const master = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#17251e"/>
  <text x="256" y="256" fill="#f8f7f0" font-family="Inter, 'Segoe UI', Arial, sans-serif"
        font-size="300" font-weight="800"
        text-anchor="middle" dominant-baseline="central">P</text>
</svg>`;

const outputs = [
  { file: "icon-192.png", size: 192 },
  { file: "icon-512.png", size: 512 },
  { file: "apple-touch-icon.png", size: 180 },
];

const source = Buffer.from(master);
for (const { file, size } of outputs) {
  const png = await sharp(source, { density: 384 }).resize(size, size).png().toBuffer();
  await writeFile(new URL(file, `file://${publicDir}`), png);
  console.log(`wrote public/${file} (${size}x${size})`);
}
