import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  LineSegments,
  Mesh,
  Ray,
  Vector3,
} from "three";
import type { Object3D } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { MeshBVH } from "three-mesh-bvh";

/** Mesh va chạm: một BufferGeometry duy nhất trong world space, kèm BVH. */
export interface WalkCollider {
  geometry: BufferGeometry;
  bvh: MeshBVH;
  triangleCount: number;
}

export interface ColliderGround {
  /** Tâm của mặt đất phẳng bao quanh model (world space). */
  center: Vector3;
  /** Nửa cạnh của hình vuông mặt đất. */
  halfSize: number;
}

/**
 * Gộp toàn bộ mesh hiển thị của `root` thành một geometry chỉ có `position`
 * (world space), thêm một mặt đất phẳng để người chơi không rơi ra ngoài,
 * rồi dựng BVH để va chạm capsule chạy được ở 60fps.
 *
 * Geometry hiển thị không bị đụng tới: va chạm dùng bản sao riêng.
 */
export function buildWalkCollider(
  root: Object3D,
  ground?: ColliderGround,
): WalkCollider {
  root.updateMatrixWorld(true);
  const parts: BufferGeometry[] = [];

  root.traverse((child: Object3D) => {
    if (!(child instanceof Mesh) || child instanceof LineSegments) return;
    if (!child.visible) return;
    const source = child.geometry as BufferGeometry;
    const position = source.getAttribute("position");
    if (!position) return;

    const part = new BufferGeometry();
    part.setAttribute("position", position.clone());
    part.setIndex(
      source.index ? source.index.clone() : sequentialIndex(position.count),
    );
    part.applyMatrix4(child.matrixWorld);
    parts.push(part);
  });

  if (ground) parts.push(createGroundQuad(ground));

  if (parts.length === 0) {
    throw new Error("Walk collider: model has no geometry to collide with.");
  }

  const geometry =
    parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
  if (!geometry) {
    throw new Error("Walk collider: failed to merge geometries.");
  }
  if (parts.length > 1) parts.forEach((part) => part.dispose());

  const bvh = new MeshBVH(geometry);
  return {
    geometry,
    bvh,
    triangleCount: geometry.index ? geometry.index.count / 3 : 0,
  };
}

export function disposeWalkCollider(collider: WalkCollider) {
  collider.geometry.dispose();
}

const DOWN = new Vector3(0, -1, 0);

/**
 * Tìm điểm đặt chân tại (x, z): bắn tia xuống từ ngay trên `y` (để không đáp
 * lên mái nhà nếu điểm spawn nằm dưới mái hiên), rồi mới thử từ đỉnh model.
 */
export function findFloorBelow(
  collider: WalkCollider,
  x: number,
  y: number,
  z: number,
  maxDrop = 40,
): Vector3 | null {
  const ray = new Ray(new Vector3(x, y, z), DOWN);
  const hit = collider.bvh.raycastFirst(ray, DoubleSide, 0, maxDrop);
  return hit ? hit.point.clone() : null;
}

export function findSpawnPoint(
  collider: WalkCollider,
  spawn: [number, number, number],
): Vector3 {
  const [x, y, z] = spawn;
  const nearHit = findFloorBelow(collider, x, y + 2, z);
  if (nearHit) return nearHit;

  collider.geometry.computeBoundingBox();
  const top = collider.geometry.boundingBox?.max.y ?? y + 50;
  const topHit = findFloorBelow(collider, x, top + 1, z, Infinity);
  return topHit ?? new Vector3(x, y, z);
}

function sequentialIndex(count: number) {
  const array = count > 65535 ? new Uint32Array(count) : new Uint16Array(count);
  for (let i = 0; i < count; i += 1) array[i] = i;
  return new BufferAttribute(array, 1);
}

function createGroundQuad({ center, halfSize }: ColliderGround) {
  const { x, y, z } = center;
  const h = halfSize;
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new BufferAttribute(
      new Float32Array([
        x - h, y, z - h,
        x + h, y, z - h,
        x + h, y, z + h,
        x - h, y, z + h,
      ]),
      3,
    ),
  );
  geometry.setIndex(new BufferAttribute(new Uint16Array([0, 2, 1, 0, 3, 2]), 1));
  return geometry;
}
