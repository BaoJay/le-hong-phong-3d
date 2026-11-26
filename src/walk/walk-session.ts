import { Fog, Matrix4, Quaternion, Vector3 } from "three";
import type { Object3D, PerspectiveCamera, Scene } from "three";
import {
  buildWalkCollider,
  disposeWalkCollider,
  findSpawnPoint,
} from "./collider";
import type { ColliderGround, WalkCollider } from "./collider";
import { createWalkController, yawTowards } from "./walk-controller";
import type {
  WalkController,
  WalkInputSource,
  WalkPhysicsSettings,
  WalkPose,
} from "./walk-controller";

export interface WalkModeConfig extends WalkPhysicsSettings {
  /** Điểm xuất phát (world space, m). Chân sẽ được đặt xuống sàn gần nhất bên dưới. */
  spawn: [number, number, number];
  /** Điểm mà người chơi nhìn về lúc xuất phát. */
  spawnLookAt: [number, number, number];
  /** Camera near/far khi ở tầm mắt (near nhỏ để không xén tường khi đứng sát). */
  near: number;
  far: number;
  /** Sương mù ở tầm mắt; bỏ trống để giữ nguyên sương mù của chế độ quỹ đạo. */
  fog?: { near: number; far: number };
  /** Thời gian bay camera giữa chế độ quỹ đạo và tầm mắt (giây). */
  transitionSeconds: number;
}

export interface WalkWorld {
  root: Object3D;
  ground?: ColliderGround;
  /** Rơi thấp hơn mức này thì đưa về điểm xuất phát. */
  killY: number;
}

export interface OrbitPose {
  position: Vector3;
  target: Vector3;
}

export type WalkSessionState = "idle" | "entering" | "walking" | "exiting";

export interface WalkSession {
  readonly state: WalkSessionState;
  /** Dựng va chạm (lần đầu) và bay camera xuống tầm mắt. */
  enter(input: WalkInputSource, onPose?: (pose: WalkPose) => void): Promise<void>;
  /** Bay camera về `orbitPose` rồi trả quyền cho OrbitControls. */
  exit(orbitPose: OrbitPose): Promise<void>;
  /** Gọi mỗi frame. Trả `true` khi walk mode đang điều khiển camera. */
  update(deltaSeconds: number): boolean;
  /** Bỏ va chạm đã dựng (khi model được tải lại). */
  invalidate(): void;
  dispose(): void;
}

interface Transition {
  fromPosition: Vector3;
  toPosition: Vector3;
  fromQuaternion: Quaternion;
  toQuaternion: Quaternion;
  progress: number;
  duration: number;
  resolve: () => void;
}

interface SavedView {
  near: number;
  far: number;
  fogNear: number | null;
  fogFar: number | null;
}

export interface WalkSessionOptions {
  camera: PerspectiveCamera;
  scene: Scene;
  config: WalkModeConfig;
  getWorld: () => WalkWorld | null;
  /** Gọi khi walk mode lấy / trả quyền điều khiển camera. */
  onControlChange?: (walkHasControl: boolean) => void;
  reducedMotion?: () => boolean;
}

export function createWalkSession({
  camera,
  scene,
  config,
  getWorld,
  onControlChange,
  reducedMotion = () => false,
}: WalkSessionOptions): WalkSession {
  let state: WalkSessionState = "idle";
  let collider: WalkCollider | null = null;
  let controller: WalkController | null = null;
  let transition: Transition | null = null;
  let input: WalkInputSource | null = null;
  let poseListener: ((pose: WalkPose) => void) | undefined;
  let saved: SavedView | null = null;
  let spawnFeet = new Vector3();
  let spawnYaw = 0;
  let killY = -Infinity;

  const lookMatrix = new Matrix4();

  function ensureController(world: WalkWorld) {
    if (collider && controller) return controller;
    collider = buildWalkCollider(world.root, world.ground);
    const bounds = world.ground
      ? {
          minX: world.ground.center.x - world.ground.halfSize,
          maxX: world.ground.center.x + world.ground.halfSize,
          minZ: world.ground.center.z - world.ground.halfSize,
          maxZ: world.ground.center.z + world.ground.halfSize,
        }
      : undefined;
    controller = createWalkController(collider, config, bounds);
    const [sx, sy, sz] = config.spawn;
    spawnFeet = findSpawnPoint(collider, [
      bounds ? clamp(sx, bounds.minX, bounds.maxX) : sx,
      sy,
      bounds ? clamp(sz, bounds.minZ, bounds.maxZ) : sz,
    ]);
    spawnYaw = yawTowards(spawnFeet, new Vector3(...config.spawnLookAt));
    return controller;
  }

  function startTransition(toPosition: Vector3, toQuaternion: Quaternion) {
    return new Promise<void>((resolve) => {
      transition = {
        fromPosition: camera.position.clone(),
        toPosition,
        fromQuaternion: camera.quaternion.clone(),
        toQuaternion,
        progress: 0,
        duration: reducedMotion() ? 0 : config.transitionSeconds,
        resolve,
      };
    });
  }

  function applyWalkView() {
    saved = {
      near: camera.near,
      far: camera.far,
      fogNear: scene.fog instanceof Fog ? scene.fog.near : null,
      fogFar: scene.fog instanceof Fog ? scene.fog.far : null,
    };
    camera.near = config.near;
    camera.far = Math.min(saved.far, config.far);
    camera.updateProjectionMatrix();
    if (config.fog && scene.fog instanceof Fog) {
      scene.fog.near = config.fog.near;
      scene.fog.far = config.fog.far;
    }
  }

  function restoreView() {
    if (!saved) return;
    camera.near = saved.near;
    camera.far = saved.far;
    camera.updateProjectionMatrix();
    if (scene.fog instanceof Fog && saved.fogNear !== null && saved.fogFar !== null) {
      scene.fog.near = saved.fogNear;
      scene.fog.far = saved.fogFar;
    }
    saved = null;
  }

  async function enter(nextInput: WalkInputSource, onPose?: (pose: WalkPose) => void) {
    if (state !== "idle") return;
    const world = getWorld();
    if (!world) throw new Error("Walk mode: model is not loaded yet.");

    const walker = ensureController(world);
    killY = world.killY;
    input = nextInput;
    poseListener = onPose;
    walker.teleport(spawnFeet, spawnYaw, 0);

    state = "entering";
    onControlChange?.(true);
    applyWalkView();

    // Ước lượng tư thế camera đích từ controller mà không làm lệch trạng thái thật.
    const startPosition = camera.position.clone();
    const startQuaternion = camera.quaternion.clone();
    walker.applyToCamera(camera);
    const toPosition = camera.position.clone();
    const toQuaternion = camera.quaternion.clone();
    camera.position.copy(startPosition);
    camera.quaternion.copy(startQuaternion);

    await startTransition(toPosition, toQuaternion);
    // `exit()` có thể đã được gọi giữa chừng lượt bay xuống.
    if (state === "entering") state = "walking";
  }

  async function exit(orbitPose: OrbitPose) {
    if (state === "idle" || state === "exiting") return;
    if (state === "entering" && transition) {
      // Đang bay xuống mà bị huỷ: kết thúc lượt bay hiện tại trước.
      transition.resolve();
      transition = null;
    }
    state = "exiting";
    input = null;

    lookMatrix.lookAt(orbitPose.position, orbitPose.target, camera.up);
    const toQuaternion = new Quaternion().setFromRotationMatrix(lookMatrix);
    // Trả far/fog ngay để toàn cảnh không bị cắt khi camera bay lên, nhưng giữ
    // near nhỏ cho tới khi bay xong để không xén tường ở những frame đầu.
    restoreView();
    const orbitNear = camera.near;
    camera.near = config.near;
    camera.updateProjectionMatrix();

    await startTransition(orbitPose.position.clone(), toQuaternion);
    camera.near = orbitNear;
    camera.updateProjectionMatrix();
    state = "idle";
    onControlChange?.(false);
  }

  function update(dt: number): boolean {
    if (transition) {
      const t = transition;
      t.progress = t.duration > 0 ? Math.min(t.progress + dt / t.duration, 1) : 1;
      const k = easeInOutCubic(t.progress);
      camera.position.lerpVectors(t.fromPosition, t.toPosition, k);
      camera.quaternion.slerpQuaternions(t.fromQuaternion, t.toQuaternion, k);
      if (t.progress >= 1) {
        transition = null;
        t.resolve();
      }
      return true;
    }

    if (state === "walking" && controller && input) {
      if (input.consumeRespawn()) controller.teleport(spawnFeet, spawnYaw, 0);
      controller.update(dt, input);
      let pose = controller.getPose();
      if (pose.feet.y < killY) {
        controller.teleport(spawnFeet, spawnYaw, 0);
        pose = controller.getPose();
      }
      controller.applyToCamera(camera);
      poseListener?.(pose);
      return true;
    }

    return state !== "idle";
  }

  function invalidate() {
    if (collider) disposeWalkCollider(collider);
    collider = null;
    controller = null;
  }

  return {
    get state() {
      return state;
    },
    enter,
    exit,
    update,
    invalidate,
    dispose() {
      transition?.resolve();
      transition = null;
      invalidate();
    },
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}
