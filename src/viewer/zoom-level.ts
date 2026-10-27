import { MathUtils } from "three";

// Chu vi xích đạo Web Mercator (2πR, R = 6 378 137 m).
const MERCATOR_CIRCUMFERENCE = 40075016.686;

export interface ZoomScale {
  latitude: number;
  tileSize: number;
  fovDeg: number;
  viewportHeight: number;
}

/**
 * Khoảng cách camera → tâm orbit (mét) để tỉ lệ ở tâm màn hình bằng tỉ lệ của
 * web map ở mức `zoom`. Cùng định nghĩa với MapLibre nên không phụ thuộc góc
 * nghiêng camera.
 */
export function zoomToDistance(zoom: number, scale: ZoomScale): number {
  return pixelsToCenter(scale) * metersPerPixel(zoom, scale);
}

export function distanceToZoom(distanceMeters: number, scale: ZoomScale): number {
  const metersPerPixelAtZoom0 = metersPerPixel(0, scale);
  return Math.log2(
    (pixelsToCenter(scale) * metersPerPixelAtZoom0) / Math.max(distanceMeters, 1e-6),
  );
}

function metersPerPixel(zoom: number, scale: ZoomScale): number {
  return (
    (MERCATOR_CIRCUMFERENCE * Math.cos(MathUtils.degToRad(scale.latitude))) /
    (scale.tileSize * 2 ** zoom)
  );
}

function pixelsToCenter(scale: ZoomScale): number {
  return (
    scale.viewportHeight / 2 / Math.tan(MathUtils.degToRad(scale.fovDeg) / 2)
  );
}
