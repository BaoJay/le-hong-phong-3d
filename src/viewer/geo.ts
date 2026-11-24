import { Matrix4, Vector3 } from "three";
import type { GeoConfig } from "./types";

// WGS84. Bán kính cầu cho sai ~0,65% theo phương bắc-nam ở vĩ độ Sài Gòn
// (~6,5 m mỗi km), nên dùng bán kính cong của ellipsoid.
const WGS84_A = 6378137;
const WGS84_E2 = 0.00669437999014;
const DEG = Math.PI / 180;

export interface GeoTransform {
  /** Gốc ENU, [lon, lat]. */
  origin: [number, number];
  metersPerUnit: number;
  rotationDeg: number;
  source: "controlPoints" | "estimate";
  /** Sai số từng control point theo mét (rỗng khi dùng estimate). */
  residualsMeters: number[];
  /**
   * Đưa toạ độ ENU dạng Three.js (x = đông, y = lên, z = -bắc, đơn vị mét,
   * gốc tại `origin`) vào không gian model.
   */
  enuToModel: Matrix4;
  /** Tâm khu vực (gốc ENU) trong không gian model. */
  originInModel: Vector3;
  lngLatToEnu(lngLat: [number, number]): [number, number];
  modelToLngLat(x: number, z: number): [number, number];
}

/**
 * Mặt phẳng tiếp tuyến cục bộ: Δλ·N·cosφ theo đông, Δφ·M theo bắc. Trong bán
 * kính vài km quanh gốc, sai số cỡ centimet — đủ cho LOD1 và basemap.
 */
function localRadii(lat: number) {
  const sin = Math.sin(lat * DEG);
  const w = 1 - WGS84_E2 * sin * sin;
  const primeVertical = WGS84_A / Math.sqrt(w);
  const meridian = (WGS84_A * (1 - WGS84_E2)) / (w * Math.sqrt(w));
  return {
    east: primeVertical * Math.cos(lat * DEG) * DEG,
    north: meridian * DEG,
  };
}

export function createGeoTransform(config: GeoConfig): GeoTransform {
  const points = config.controlPoints;
  const origin: [number, number] =
    points.length >= 2
      ? [
          points.reduce((sum, p) => sum + p.lngLat[0], 0) / points.length,
          points.reduce((sum, p) => sum + p.lngLat[1], 0) / points.length,
        ]
      : config.estimate.lngLat;
  const radii = localRadii(origin[1]);

  const lngLatToEnu = ([lon, lat]: [number, number]): [number, number] => [
    (lon - origin[0]) * radii.east,
    (lat - origin[1]) * radii.north,
  ];

  // Phép đồng dạng 2D từ (mx, my) = (x, -z) của model sang (E, N):
  //   E = a·mx − b·my + tx,   N = b·mx + a·my + ty
  let a: number;
  let b: number;
  let tx: number;
  let ty: number;
  let residualsMeters: number[] = [];
  let source: GeoTransform["source"];

  if (points.length >= 2) {
    source = "controlPoints";
    const model = points.map((p) => [p.model[0], -p.model[1]]);
    const enu = points.map((p) => lngLatToEnu(p.lngLat));
    const mean = (rows: number[][], i: number) =>
      rows.reduce((sum, r) => sum + r[i], 0) / rows.length;
    const mx = mean(model, 0);
    const my = mean(model, 1);
    const me = mean(enu, 0);
    const mn = mean(enu, 1);
    let sumAa = 0;
    let sumB = 0;
    let sumSq = 0;
    for (let i = 0; i < points.length; i += 1) {
      const dx = model[i][0] - mx;
      const dy = model[i][1] - my;
      const de = enu[i][0] - me;
      const dn = enu[i][1] - mn;
      sumAa += dx * de + dy * dn;
      sumB += dx * dn - dy * de;
      sumSq += dx * dx + dy * dy;
    }
    if (sumSq === 0) {
      throw new Error("Geo control points must not share the same model position.");
    }
    a = sumAa / sumSq;
    b = sumB / sumSq;
    tx = me - (a * mx - b * my);
    ty = mn - (b * mx + a * my);
    residualsMeters = model.map(([x, y], i) =>
      Math.hypot(a * x - b * y + tx - enu[i][0], b * x + a * y + ty - enu[i][1]),
    );
  } else {
    source = "estimate";
    const { metersPerUnit, rotationDeg, model } = config.estimate;
    // Trục bắc của model (0, 1) phải trỏ về (sin r, cos r) trong ENU ⇒ θ = −r.
    const theta = -rotationDeg * DEG;
    a = metersPerUnit * Math.cos(theta);
    b = metersPerUnit * Math.sin(theta);
    const [ax, ay] = [model[0], -model[1]];
    tx = -(a * ax - b * ay);
    ty = -(b * ax + a * ay);
  }

  const metersPerUnit = Math.hypot(a, b);
  const rotationDeg = -Math.atan2(b, a) / DEG;

  // Model (x, y, z) → ENU Three.js (E, s·y, −N).
  const modelToEnu = new Matrix4().set(
    a, 0, b, tx,
    0, metersPerUnit, 0, 0,
    -b, 0, a, -ty,
    0, 0, 0, 1,
  );
  const enuToModel = modelToEnu.clone().invert();

  return {
    origin,
    metersPerUnit,
    rotationDeg,
    source,
    residualsMeters,
    enuToModel,
    originInModel: new Vector3(0, 0, 0).applyMatrix4(enuToModel),
    lngLatToEnu,
    modelToLngLat(x, z) {
      const east = a * x + b * z + tx;
      const north = b * x - a * z + ty;
      return [origin[0] + east / radii.east, origin[1] + north / radii.north];
    },
  };
}
