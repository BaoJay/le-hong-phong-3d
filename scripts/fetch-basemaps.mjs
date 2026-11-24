#!/usr/bin/env node
// Tải tile XYZ (Web Mercator EPSG:3857) quanh trường, ghép và cắt thành một
// ảnh WebP cho mỗi basemap, rồi ghi bounds WGS84 vào public/context/basemaps.json.
//
//   node scripts/fetch-basemaps.mjs                 # mọi basemap trong config
//   node scripts/fetch-basemaps.mjs --only now,1923
//   node scripts/fetch-basemaps.mjs --center 10.7612,106.6825 --radius 1000
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import sharp from "sharp";

const EARTH_RADIUS = 6378137;
const HALF_WORLD = Math.PI * EARTH_RADIUS;
const CONCURRENCY = 4;
const RETRIES = 3;
const USER_AGENT = "le-hong-phong-3d basemap export (one-off, small area)";

const { values: args } = parseArgs({
  options: {
    config: { type: "string", default: "data/context/context.json" },
    out: { type: "string", default: "public/context" },
    only: { type: "string" },
    center: { type: "string" },
    radius: { type: "string" },
  },
});

const config = JSON.parse(await readFile(resolve(args.config), "utf8"));
const [centerLon, centerLat] = args.center
  ? args.center.split(",").map(Number).reverse()
  : config.center;
const radius = Number(args.radius ?? config.basemapRadiusMeters);
const only = args.only?.split(",").map((id) => id.trim());
const outDir = resolve(args.out);
const manifestPath = resolve(outDir, "basemaps.json");

const lonToX = (lon) => (lon * Math.PI * EARTH_RADIUS) / 180;
const latToY = (lat) => EARTH_RADIUS * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const xToLon = (x) => (x / EARTH_RADIUS) * (180 / Math.PI);
const yToLat = (y) => (2 * Math.atan(Math.exp(y / EARTH_RADIUS)) - Math.PI / 2) * (180 / Math.PI);

// Mét Web Mercator lớn hơn mét mặt đất 1/cos(lat) lần (~1,8% ở Sài Gòn).
const mercatorRadius = radius / Math.cos((centerLat * Math.PI) / 180);
const cx = lonToX(centerLon);
const cy = latToY(centerLat);
const bbox = {
  minX: cx - mercatorRadius,
  maxX: cx + mercatorRadius,
  minY: cy - mercatorRadius,
  maxY: cy + mercatorRadius,
};

await mkdir(outDir, { recursive: true });
const manifest = await readManifest();

for (const source of config.basemaps) {
  if (only && !only.includes(source.id)) continue;
  const entry = await exportBasemap(source);
  const index = manifest.basemaps.findIndex((basemap) => basemap.id === entry.id);
  if (index >= 0) manifest.basemaps[index] = entry;
  else manifest.basemaps.push(entry);
}

const order = config.basemaps.map((source) => source.id);
manifest.basemaps.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Đã ghi ${manifestPath}`);

async function exportBasemap(source) {
  const zoom = source.zoom;
  const tilePx = source.tileSize ?? 256;
  const span = (2 * HALF_WORLD) / 2 ** zoom;
  const tileX = (x) => Math.floor((x + HALF_WORLD) / span);
  const tileY = (y) => Math.floor((HALF_WORLD - y) / span);
  const [x0, x1] = [tileX(bbox.minX), tileX(bbox.maxX)];
  const [y0, y1] = [tileY(bbox.maxY), tileY(bbox.minY)];

  const jobs = [];
  for (let ty = y0; ty <= y1; ty += 1) {
    for (let tx = x0; tx <= x1; tx += 1) jobs.push({ tx, ty });
  }
  console.log(`[${source.id}] z${zoom}: ${jobs.length} tile…`);

  let missing = 0;
  const tiles = await mapLimit(jobs, CONCURRENCY, async ({ tx, ty }) => {
    const url = source.url
      .replace("{z}", String(zoom))
      .replace("{x}", String(tx))
      .replace("{y}", String(ty));
    const buffer = await fetchTile(url);
    if (!buffer) {
      missing += 1;
      return null;
    }
    return {
      input: await sharp(buffer).resize(tilePx, tilePx).png().toBuffer(),
      left: (tx - x0) * tilePx,
      top: (ty - y0) * tilePx,
    };
  });
  if (missing === jobs.length) {
    throw new Error(`[${source.id}] không tải được tile nào — kiểm tra URL và mạng.`);
  }
  if (missing > 0) console.warn(`[${source.id}] ${missing} tile trống/ngoài vùng bản đồ.`);

  // Cắt đúng bbox, làm tròn ra mép pixel rồi tính lại bounds theo mép đó để
  // georef của ảnh khớp tuyệt đối.
  const pixelsPerMeter = tilePx / span;
  const originX = x0 * span - HALF_WORLD;
  const originY = HALF_WORLD - y0 * span;
  const left = Math.floor((bbox.minX - originX) * pixelsPerMeter);
  const right = Math.ceil((bbox.maxX - originX) * pixelsPerMeter);
  const top = Math.floor((originY - bbox.maxY) * pixelsPerMeter);
  const bottom = Math.ceil((originY - bbox.minY) * pixelsPerMeter);

  const image = `basemap-${source.id}.webp`;
  await sharp({
    create: {
      width: (x1 - x0 + 1) * tilePx,
      height: (y1 - y0 + 1) * tilePx,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(tiles.filter(Boolean))
    .png()
    .toBuffer()
    .then((mosaic) =>
      sharp(mosaic)
        .extract({ left, top, width: right - left, height: bottom - top })
        .webp({ quality: 85, alphaQuality: 90 })
        .toFile(resolve(outDir, image)),
    );

  const bounds = [
    xToLon(originX + left / pixelsPerMeter),
    yToLat(originY - bottom / pixelsPerMeter),
    xToLon(originX + right / pixelsPerMeter),
    yToLat(originY - top / pixelsPerMeter),
  ].map((value) => Number(value.toFixed(7)));

  console.log(`[${source.id}] ${right - left}×${bottom - top}px → ${image}`);
  return {
    id: source.id,
    label: source.label,
    year: source.year,
    image,
    bounds,
    attribution: source.attribution,
  };
}

async function fetchTile(url) {
  for (let attempt = 1; attempt <= RETRIES; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
      if (response.status === 404 || response.status === 204) return null;
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const type = response.headers.get("content-type") ?? "";
      if (!type.startsWith("image/")) return null;
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      if (attempt === RETRIES) {
        console.warn(`  bỏ qua ${url}: ${error.message}`);
        return null;
      }
      await new Promise((done) => setTimeout(done, 500 * 2 ** attempt));
    }
  }
  return null;
}

async function mapLimit(items, limit, task) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await task(items[index]);
      }
    }),
  );
  return results;
}

async function readManifest() {
  try {
    return JSON.parse(await readFile(manifestPath, "utf8"));
  } catch {
    await mkdir(dirname(manifestPath), { recursive: true });
    return { basemaps: [] };
  }
}
