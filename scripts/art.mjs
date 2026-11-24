// Turns the flat-background illustrations into transparent WebP: flood-fills the background from
// the canvas edges only, so same-coloured areas inside a drawing survive.
import sharp from "sharp";
const [, , src, out, width = "1600", crop, tol = "42", holes] = process.argv;
let img = sharp(src);
if (crop && crop !== "all") {
  const m = await img.metadata();
  const [a, b] = crop.split("-").map(Number);
  img = sharp(await img.extract({ left: Math.round(m.width * a), top: 0, width: Math.round(m.width * (b - a)), height: m.height }).toBuffer());
}
const { data, info } = await img.resize({ width: Number(width), withoutEnlargement: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: w, height: h } = info;
const at = (x, y) => (y * w + x) * 4;
const sample = [...Array(40)].map((_, i) => at(Math.floor(((i + 0.5) * w) / 40), 3));
const med = (k) => sample.map((p) => data[p + k]).sort((x, y) => x - y)[20];
const bg = [med(0), med(1), med(2)];
const dist = (p) => Math.hypot(data[p] - bg[0], data[p + 1] - bg[1], data[p + 2] - bg[2]);
const T = Number(tol);
const seen = new Uint8Array(w * h);
const stack = [];
const push = (x, y) => {
  const i = y * w + x;
  if (x < 0 || y < 0 || x >= w || y >= h || seen[i] || dist(i * 4) > T) return;
  seen[i] = 1;
  stack.push(i);
};
for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
while (stack.length) {
  const i = stack.pop();
  const x = i % w, y = (i / w) | 0;
  push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
}
for (let i = 0; i < w * h; i++) if (seen[i] || (holes && dist(i * 4) < 16)) data[i * 4 + 3] = 0;
const cut = await sharp(data, { raw: info }).png().toBuffer();
await sharp(cut).trim({ threshold: 1 }).webp({ quality: 86, alphaQuality: 90 }).toFile(out);
console.log(out, w, h, "bg", bg.join());
