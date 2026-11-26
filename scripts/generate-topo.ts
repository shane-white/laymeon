/**
 * Generates the landing page's two topographic backgrounds as static SVGs in public/marketing/.
 *
 *   topo-hill.svg    One peak, drawn behind the hero guide map. Rings are tinted by height in
 *                    the four line colors (rust → amber → sage → cyan) and fade out at the edges.
 *   topo-survey.svg  A seamless 1200px tile of faint, even contour lines for the rest of the page.
 *
 * Run with `npm run generate:topo`. The output is deterministic: change a seed, the line count or
 * the peak shape below, regenerate, and commit the SVGs. The page loads them as CSS backgrounds
 * (see `.hero::before` and `.page::after` in src/components/marketing/landing.module.css).
 */
import { contours } from "d3-contour";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT_DIR = join(process.cwd(), "public", "marketing");

const PAPER = "#ece2d0";
const LINE_COLORS = ["#a8473a", "#de9e2e", "#6f9a6a", "#5b98a6"];

type Noise = (x: number, y: number, periodX: number, periodY: number, octaves?: number) => number;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

/**
 * Seeded value noise on a lattice that wraps every `period` cells, so a tile repeats without a
 * seam. x and y are positions in [0, 1) across the tile.
 */
function makeNoise(seed: number): Noise {
  const r = rng(seed);
  const perm = [...Array(256).keys()].sort(() => r() - 0.5);
  const values = Array.from({ length: 256 }, () => r());
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const mod = (a: number, p: number) => ((a % p) + p) % p;
  const lattice = (a: number, b: number, px: number, py: number) =>
    values[perm[(perm[mod(a, px) & 255] + mod(b, py)) & 255]];
  const noise2 = (x: number, y: number, px: number, py: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const u = smooth(x - xi);
    const w = smooth(y - yi);
    const a = lattice(xi, yi, px, py);
    const b = lattice(xi + 1, yi, px, py);
    const c = lattice(xi, yi + 1, px, py);
    const d = lattice(xi + 1, yi + 1, px, py);
    return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
  };
  return (x, y, periodX, periodY, octaves = 4) => {
    let total = 0;
    let amp = 0.55;
    for (let o = 0; o < octaves; o++) {
      const f = 2 ** o;
      total += amp * noise2(x * periodX * f, y * periodY * f, periodX * f, periodY * f);
      amp *= 0.5;
    }
    return total;
  };
}

type Field = { w: number; h: number; values: Float64Array };

/**
 * Samples `fn` on a grid with `margin` extra cells on every side. Contour rings close along the
 * grid's border, so the margin pushes those closing edges outside the SVG's viewBox.
 */
function sampleField(cols: number, rows: number, margin: number, fn: (x: number, y: number) => number): Field {
  const w = cols + margin * 2 + 1;
  const h = rows + margin * 2 + 1;
  const values = new Float64Array(w * h);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) values[j * w + i] = fn((i - margin) / cols, (j - margin) / rows);
  }
  return { w, h, values };
}

/** One SVG path per contour level, in pixels. */
function contourPaths({ w, h, values }: Field, levels: number, cell: number, margin: number): string[] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const thresholds = Array.from({ length: levels }, (_, k) => lo + ((hi - lo) * (k + 0.5)) / levels);
  const px = (n: number) => Math.round((n - margin) * cell);
  return contours()
    .size([w, h])
    .smooth(true)
    .thresholds(thresholds)(Array.from(values))
    .map((level) => {
      let d = "";
      for (const polygon of level.coordinates) {
        for (const ring of polygon) {
          d += ring.map(([x, y], i) => `${i ? "L" : "M"}${px(x)} ${px(y)}`).join("") + "Z";
        }
      }
      // Drop repeated points that rounding to whole pixels produces.
      return d.replace(/L(-?\d+ -?\d+)(?=L\1)/g, "");
    });
}

function write(name: string, svg: string) {
  writeFileSync(join(OUT_DIR, name), svg);
  console.log(`${name}: ${(svg.length / 1024).toFixed(0)} KB`);
}

function survey() {
  const size = 1200;
  const cell = 10;
  const cols = size / cell;
  const margin = 2;
  const noise = makeNoise(7);
  const field = sampleField(cols, cols, margin, (x, y) => noise(x, y, 4, 4));
  const paths = contourPaths(field, 22, cell, margin);
  write(
    "topo-survey.svg",
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">` +
      `<g fill="none" stroke="${PAPER}" stroke-opacity=".065" stroke-width="1" stroke-linejoin="round">` +
      paths.map((d) => `<path d="${d}"/>`).join("") +
      `</g></svg>`,
  );
}

function hill() {
  const width = 1600;
  const height = 1150;
  const cell = 10;
  const margin = 2;
  const levels = 26;
  const noise = makeNoise(5);
  const field = sampleField(width / cell, height / cell, margin, (x, y) => {
    const peak = Math.exp(-(((x - 0.5) / 0.16) ** 2 + ((y - 0.5) / 0.22) ** 2));
    return 0.45 * noise(x, y, 4, 3) + peak;
  });
  const paths = contourPaths(field, levels, cell, margin);
  const colorFor = (k: number) => LINE_COLORS[Math.min(3, Math.floor((k / levels) * 4))];
  write(
    "topo-hill.svg",
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">` +
      `<defs><radialGradient id="f" cx=".5" cy=".5" r=".5">` +
      `<stop offset="0" stop-color="#fff"/><stop offset=".55" stop-color="#fff" stop-opacity=".75"/>` +
      `<stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>` +
      `<mask id="m"><rect width="${width}" height="${height}" fill="url(#f)"/></mask></defs>` +
      `<g mask="url(#m)" fill="none" stroke-width="1.1" stroke-opacity=".26" stroke-linejoin="round">` +
      paths.map((d, k) => `<path stroke="${colorFor(k)}" d="${d}"/>`).join("") +
      `</g></svg>`,
  );
}

survey();
hill();
