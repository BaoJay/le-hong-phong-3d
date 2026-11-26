import { Box3, DoubleSide, Line3, MathUtils, Ray, Vector3 } from "three";
import type { PerspectiveCamera } from "three";
import type { WalkCollider } from "./collider";

/** Nguồn input trừu tượng: bàn phím/chuột, joystick cảm ứng, hay script test. */
export interface WalkInputSource {
  /** x: sang phải (+), z: tiến lên (+). Độ lớn ≤ 1. */
  readonly move: { readonly x: number; readonly z: number };
  readonly running: boolean;
  /** Lượng xoay tích luỹ (radian) kể từ lần gọi trước. */
  consumeLook(): { yaw: number; pitch: number };
  consumeRespawn(): boolean;
  consumeJump(): boolean;
}

export interface WalkPhysicsSettings {
  /** Tổng chiều cao capsule (m). */
  height: number;
  /** Bán kính capsule (m). Bậc thấp hơn ~bán kính sẽ tự bước lên được. */
  radius: number;
  /** Độ cao mắt tính từ chân (m). */
  eyeHeight: number;
  walkSpeed: number;
  runSpeed: number;
  /** Gia tốc trọng trường (m/s², số âm). */
  gravity: number;
  /** Khoảng hụt tối đa vẫn "dính" xuống bậc khi đi xuống cầu thang (m). */
  stepDown: number;
}

export interface WalkBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface WalkPose {
  /** Vị trí chân (world space). */
  feet: Vector3;
  yaw: number;
  pitch: number;
  onGround: boolean;
}

export interface WalkController {
  teleport(feet: Vector3, yaw: number, pitch?: number): void;
  update(deltaSeconds: number, input: WalkInputSource): void;
  /** Ghi vị trí + hướng mắt hiện tại vào camera. */
  applyToCamera(camera: PerspectiveCamera): void;
  getPose(): WalkPose;
}

const PHYSICS_SUBSTEPS = 5;
const MAX_PITCH = MathUtils.degToRad(85);
const GROUND_ACCELERATION = 14;
const AIR_ACCELERATION = 2;
/** Vận tốc bật lên (m/s): với gravity -20 chân nhấc ~0.75 m, cộng phần capsule tự bước ~0.3 m là qua gờ ~1 m. */
const JUMP_SPEED = 5.5;
/** Mặt dốc hơn 45° không tính là sàn: người chơi trượt xuống thay vì leo lên. */
const MIN_GROUND_NORMAL_Y = Math.cos(MathUtils.degToRad(45));

/**
 * Điều khiển nhân vật dạng capsule va chạm với BVH (theo mẫu
 * characterMovement của three-mesh-bvh): mỗi bước con, đẩy đoạn thẳng lõi
 * capsule ra khỏi mọi tam giác gần hơn bán kính; phần bị đẩy lên trên chính
 * là "đang đứng trên sàn".
 */
export function createWalkController(
  collider: WalkCollider,
  settings: WalkPhysicsSettings,
  bounds?: WalkBounds,
): WalkController {
  const { radius } = settings;
  // `position` là tâm cầu trên của capsule; tâm cầu dưới thấp hơn `segmentLength`.
  const topOffset = settings.height - radius;
  const segmentLength = Math.max(settings.height - radius * 2, 0);
  const eyeOffset = settings.eyeHeight - topOffset;

  const position = new Vector3();
  const velocity = new Vector3();
  const horizontal = new Vector3();
  const wish = new Vector3();
  let yaw = 0;
  let pitch = 0;
  let onGround = false;
  /** Có sàn ngay dưới chân (≤ stepDown): dùng cho độ bám điều khiển. */
  let nearGround = false;

  const segment = new Line3();
  const box = new Box3();
  const triPoint = new Vector3();
  const capsulePoint = new Vector3();
  const delta = new Vector3();
  const pushDir = new Vector3();
  const faceNormal = new Vector3();
  const ray = new Ray(new Vector3(), new Vector3(0, -1, 0));

  function teleport(feet: Vector3, newYaw: number, newPitch = 0) {
    position.copy(feet).y += topOffset;
    velocity.set(0, 0, 0);
    horizontal.set(0, 0, 0);
    yaw = newYaw;
    pitch = MathUtils.clamp(newPitch, -MAX_PITCH, MAX_PITCH);
    onGround = false;
    nearGround = false;
  }

  function step(dt: number) {
    if (onGround) velocity.y = dt * settings.gravity;
    else velocity.y += dt * settings.gravity;

    position.addScaledVector(velocity, dt);
    position.addScaledVector(horizontal, dt);

    segment.start.copy(position);
    segment.end.copy(position).y -= segmentLength;

    box.makeEmpty();
    box.expandByPoint(segment.start);
    box.expandByPoint(segment.end);
    box.min.addScalar(-radius);
    box.max.addScalar(radius);

    // Chỉ coi là "đứng trên sàn" khi chạm vào mặt đủ phẳng: mép bậc thang
    // thuộc mặt trên nằm ngang nên vẫn bước lên được, còn dốc gắt thì trượt.
    let touchedWalkable = false;
    collider.bvh.shapecast({
      intersectsBounds: (nodeBox: Box3) => nodeBox.intersectsBox(box),
      intersectsTriangle: (tri) => {
        const distance = tri.closestPointToSegment(segment, triPoint, capsulePoint);
        if (distance < radius) {
          const depth = radius - distance;
          pushDir.subVectors(capsulePoint, triPoint).normalize();
          segment.start.addScaledVector(pushDir, depth);
          segment.end.addScaledVector(pushDir, depth);
          tri.getNormal(faceNormal);
          if (faceNormal.dot(pushDir) < 0) faceNormal.negate();
          if (faceNormal.y > MIN_GROUND_NORMAL_Y) touchedWalkable = true;
        }
      },
    });

    delta.subVectors(segment.start, position);
    const pushLength = delta.length();
    onGround = touchedWalkable && delta.y > Math.abs(dt * velocity.y * 0.25);

    const offset = Math.max(0, pushLength - 1e-5);
    delta.normalize().multiplyScalar(offset);
    position.add(delta);

    if (onGround) {
      velocity.set(0, 0, 0);
    } else {
      // Bỏ phần vận tốc đâm vào bề mặt, giữ phần trượt dọc theo nó.
      delta.normalize();
      velocity.addScaledVector(delta, -delta.dot(velocity));
    }
  }

  /** Khoảng cách từ chân xuống sàn ngay bên dưới (Infinity nếu xa hơn stepDown). */
  function floorDistance() {
    const feetY = position.y - topOffset;
    ray.origin.set(position.x, feetY + radius, position.z);
    const hit = collider.bvh.raycastFirst(
      ray,
      DoubleSide,
      0,
      radius + settings.stepDown,
    );
    return hit ? feetY - hit.point.y : Infinity;
  }

  /** Khi vừa bước khỏi mép bậc, kéo chân xuống bậc dưới thay vì "nhảy cóc". */
  function snapDown() {
    const drop = floorDistance();
    if (drop > 0 && drop <= settings.stepDown) {
      position.y -= drop;
      velocity.set(0, 0, 0);
      onGround = true;
    }
  }

  function update(dt: number, input: WalkInputSource) {
    const look = input.consumeLook();
    yaw -= look.yaw;
    pitch = MathUtils.clamp(pitch - look.pitch, -MAX_PITCH, MAX_PITCH);

    const speed = input.running ? settings.runSpeed : settings.walkSpeed;
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    // Camera nhìn theo -Z khi yaw = 0.
    wish.set(
      input.move.x * cos - input.move.z * sin,
      0,
      -input.move.x * sin - input.move.z * cos,
    );
    if (wish.lengthSq() > 1) wish.normalize();
    wish.multiplyScalar(speed);

    const accel = nearGround ? GROUND_ACCELERATION : AIR_ACCELERATION;
    horizontal.lerp(wish, 1 - Math.exp(-accel * dt));

    // `velocity.y <= 0`: không nhảy tiếp khi vừa bật lên mà tia dò sàn vẫn còn chạm.
    if (input.consumeJump() && nearGround && velocity.y <= 0) {
      velocity.y = JUMP_SPEED;
      onGround = false;
    }

    const wasOnGround = onGround;
    const startY = position.y;
    const subDt = dt / PHYSICS_SUBSTEPS;
    for (let i = 0; i < PHYSICS_SUBSTEPS; i += 1) step(subDt);

    // Chỉ "dính" xuống khi đang đi xuống: lúc đang bước lên bậc thì capsule
    // cũng rời sàn trong chốc lát, và kéo xuống lúc đó sẽ làm kẹt ở bậc đầu.
    if (wasOnGround && !onGround && velocity.y <= 0 && position.y <= startY) {
      snapDown();
    }

    // Khi xuống cầu thang, capsule "lăn" qua mép từng bậc nên liên tục rời
    // sàn một chút; miễn là bậc dưới còn trong tầm stepDown thì vẫn tính là bám sàn.
    nearGround = onGround || floorDistance() <= settings.stepDown;

    if (bounds) {
      position.x = MathUtils.clamp(position.x, bounds.minX, bounds.maxX);
      position.z = MathUtils.clamp(position.z, bounds.minZ, bounds.maxZ);
    }
  }

  function applyToCamera(camera: PerspectiveCamera) {
    camera.position.set(position.x, position.y + eyeOffset, position.z);
    camera.rotation.set(pitch, yaw, 0, "YXZ");
  }

  function getPose(): WalkPose {
    return {
      feet: new Vector3(position.x, position.y - topOffset, position.z),
      yaw,
      pitch,
      onGround: nearGround,
    };
  }

  return { teleport, update, applyToCamera, getPose };
}

/** Yaw để camera ở `from` nhìn về `to` (cùng quy ước với camera.rotation "YXZ"). */
export function yawTowards(from: Vector3, to: Vector3) {
  return Math.atan2(-(to.x - from.x), -(to.z - from.z));
}
