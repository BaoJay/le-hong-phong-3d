#!/usr/bin/env node
// Lấy footprint building OSM quanh trường qua Overpass, ước chiều cao và đánh
// dấu `is_school` cho các khối nằm trong khuôn viên trường. Kết quả là GeoJSON
// WGS84 (RFC 7946) mở và sửa tiếp được bằng QGIS.
//
//   node scripts/fetch-osm-buildings.mjs
//   node scripts/fetch-osm-buildings.mjs --center 10.7612,106.6825 --radius 500
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";

const LEVEL_HEIGHT = 3.2;
const SCHOOL_SEARCH_RADIUS = 400;

const { values: args } = parseArgs({
  options: {
    config: { type: "string", default: "data/context/context.json" },
    out: { type: "string", default: "public/context/blocks.geojson" },
    endpoint: { type: "string", default: "https://overpass-api.de/api/interpreter" },
    center: { type: "string" },
    radius: { type: "string" },
  },
});

const config = JSON.parse(await readFile(resolve(args.config), "utf8"));
const [lon, lat] = args.center ? args.center.split(",").map(Number).reverse() : config.center;
const radius = Number(args.radius ?? config.blocksRadiusMeters);
const around = `around:${radius},${lat},${lon}`;

const buildings = await overpass(`[out:json][timeout:120];
(
  way["building"](${around});
  relation["building"]["type"="multipolygon"](${around});
);
out tags geom;`);

const schools = await overpass(`[out:json][timeout:60];
(
  way["amenity"="school"](around:${SCHOOL_SEARCH_RADIUS},${lat},${lon});
  relation["amenity"="school"](around:${SCHOOL_SEARCH_RADIUS},${lat},${lon});
);
out tags geom;`);

const schoolName = normalize(config.schoolName);
const schoolPolygons = schools.elements
  .filter((element) =>
    ["name", "name:vi", "alt_name", "official_name"].some((key) =>
      normalize(element.tags?.[key] ?? "").includes(schoolName),
    ),
  )
  .flatMap(elementPolygons);
if (schoolPolygons.length === 0) {
  console.warn(`Không tìm thấy khuôn viên "${config.schoolName}" trên OSM — tự đánh dấu is_school trong QGIS.`);
}

const features = [];
for (const element of buildings.elements) {
  const polygons = elementPolygons(element);
  if (polygons.length === 0) continue;

  const tags = element.tags ?? {};
  const height = estimateHeight(tags);
  const centroid = ringCentroid(polygons[0][0]);
  features.push({
    type: "Feature",
    properties: {
      osm_id: `${element.type}/${element.id}`,
      name: tags.name ?? null,
      height: height.value,
      min_height: parseMeters(tags.min_height) ?? levelsToMeters(tags["building:min_level"]) ?? 0,
      height_source: height.source,
      levels: parseMeters(tags["building:levels"]),
      is_school: schoolPolygons.some((polygon) => pointInPolygon(centroid, polygon)),
      // Phase 2: năm của tấm bản đồ đầu/cuối còn thấy khối này.
      first_seen: null,
      last_seen: null,
    },
    geometry:
      polygons.length === 1
        ? { type: "Polygon", coordinates: polygons[0] }
        : { type: "MultiPolygon", coordinates: polygons },
  });
}

const output = resolve(args.out);
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify({ type: "FeatureCollection", features })}\n`);
const schoolCount = features.filter((feature) => feature.properties.is_school).length;
console.log(`Đã ghi ${features.length} building (${schoolCount} thuộc trường) → ${output}`);

async function overpass(query) {
  const response = await fetch(args.endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ data: query }),
  });
  if (!response.ok) throw new Error(`Overpass HTTP ${response.status}: ${await response.text()}`);
  return response.json();
}

/** Polygon dạng GeoJSON ([[outer], [hole]…]) từ way kín hoặc relation multipolygon. */
function elementPolygons(element) {
  if (element.type === "way") {
    const ring = toRing(element.geometry);
    return ring ? [[ring]] : [];
  }
  if (element.type !== "relation") return [];

  const outers = joinRings(element.members.filter((m) => m.role === "outer"));
  const inners = joinRings(element.members.filter((m) => m.role === "inner"));
  return outers.map((outer) => [
    outer,
    ...inners.filter((inner) => pointInPolygon(inner[0], [outer])),
  ]);
}

function toRing(geometry) {
  if (!geometry || geometry.length < 4) return null;
  const ring = geometry.map((point) => [round(point.lon), round(point.lat)]);
  const [first, last] = [ring[0], ring[ring.length - 1]];
  return first[0] === last[0] && first[1] === last[1] ? ring : null;
}

/** Nối các way thành viên (có thể bị cắt nhỏ) thành ring kín. */
function joinRings(members) {
  const segments = members
    .filter((member) => member.geometry?.length > 1)
    .map((member) => member.geometry.map((point) => [round(point.lon), round(point.lat)]));
  const rings = [];
  const same = (a, b) => a[0] === b[0] && a[1] === b[1];

  while (segments.length > 0) {
    let ring = segments.shift();
    let extended = true;
    while (!same(ring[0], ring[ring.length - 1]) && extended) {
      extended = false;
      for (let i = 0; i < segments.length; i += 1) {
        const segment = segments[i];
        const end = ring[ring.length - 1];
        if (same(segment[0], end)) ring = ring.concat(segment.slice(1));
        else if (same(segment[segment.length - 1], end)) ring = ring.concat(segment.slice(0, -1).reverse());
        else continue;
        segments.splice(i, 1);
        extended = true;
        break;
      }
    }
    if (ring.length >= 4 && same(ring[0], ring[ring.length - 1])) rings.push(ring);
  }
  return rings;
}

function estimateHeight(tags) {
  const height = parseMeters(tags.height) ?? parseMeters(tags["building:height"]);
  if (height !== null) return { value: height, source: "osm:height" };
  const levels = levelsToMeters(tags["building:levels"]);
  if (levels !== null) {
    const roof = levelsToMeters(tags["roof:levels"]) ?? 0;
    return { value: Number((levels + roof).toFixed(1)), source: "osm:levels" };
  }
  return { value: null, source: "default" };
}

function levelsToMeters(value) {
  const levels = parseMeters(value);
  return levels === null ? null : levels * LEVEL_HEIGHT;
}

function parseMeters(value) {
  if (value === undefined || value === null) return null;
  const number = Number.parseFloat(String(value).replace(",", "."));
  return Number.isFinite(number) ? number : null;
}

function ringCentroid(ring) {
  const points = ring.slice(0, -1);
  return [
    points.reduce((sum, p) => sum + p[0], 0) / points.length,
    points.reduce((sum, p) => sum + p[1], 0) / points.length,
  ];
}

function pointInPolygon([x, y], polygon) {
  let inside = false;
  for (const ring of polygon) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

function normalize(text) {
  return text.normalize("NFC").toLowerCase();
}

function round(value) {
  return Number(value.toFixed(7));
}
