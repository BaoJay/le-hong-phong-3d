/**
 * Sân thử chế độ đi bộ (`/walk-test.html`, chỉ có ở `npm run dev`): một level
 * dựng bằng code với cầu thang, dốc, bậc, tường và hành lang, để chỉnh cảm
 * giác di chuyển mà không cần model thật hay khoá giải mã.
 */
import {
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  EdgesGeometry,
  Fog,
  Group,
  HemisphereLight,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";
import { buildWalkCollider, findSpawnPoint } from "./collider";
import { createWalkController, yawTowards } from "./walk-controller";
import { createWalkHud } from "./walk-hud";
import { viewerConfig } from "../config/viewer-config";

const canvas = document.getElementById("walk-test-canvas") as HTMLCanvasElement;
const renderer = new WebGLRenderer({ canvas, antialias: true });
renderer.outputColorSpace = SRGBColorSpace;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));

const scene = new Scene();
scene.background = new Color("#e9e9e4");
scene.fog = new Fog("#e9e9e4", 30, 90);
const camera = new PerspectiveCamera(70, 1, 0.05, 300);

scene.add(new AmbientLight("#ffffff", 1.2));
scene.add(new HemisphereLight("#fff4d2", "#d8d8d0", 1.1));
const sun = new DirectionalLight("#fff9ea", 2.2);
sun.position.set(-12, 20, 8);
scene.add(sun);

const level = new Group();
const plaster = new MeshStandardMaterial({ color: "#f1ede4", roughness: 0.95 });
const tile = new MeshStandardMaterial({ color: "#d9cfbf", roughness: 0.9 });
const accent = new MeshStandardMaterial({ color: "#b8604a", roughness: 0.85 });

/** Hộp theo kích thước (m) với tâm đáy tại (x, y, z). */
function box(w: number, h: number, d: number, x: number, y: number, z: number, material = plaster) {
  const mesh = new Mesh(new BoxGeometry(w, h, d), material);
  mesh.position.set(x, y + h / 2, z);
  level.add(mesh);
  return mesh;
}

// Sàn sân trường 40 × 40 m.
box(40, 0.2, 40, 0, -0.2, 0, tile);

// Cầu thang 12 bậc (cao 0.17, sâu 0.3) lên sàn tầng 2 cao 2.04 m.
const RISE = 0.17;
const RUN = 0.3;
for (let i = 0; i < 12; i += 1) {
  box(2, RISE * (i + 1), RUN, -6, 0, -4 - i * RUN);
}
// Sàn tầng 2 nối liền bậc trên cùng (mép sau bậc 12 ở z = -7.45).
const TOP_EDGE_Z = -4 - 11 * RUN - RUN / 2;
box(8, 0.2, 6, -6, 12 * RISE - 0.2, TOP_EDGE_Z - 3);
box(8, 1, 0.15, -6, 12 * RISE, TOP_EDGE_Z - 6, accent); // lan can cuối
box(0.15, 1, 6, -10, 12 * RISE, TOP_EDGE_Z - 3, accent); // lan can hai bên
box(0.15, 1, 6, -2, 12 * RISE, TOP_EDGE_Z - 3, accent);

// Dốc thoải 12° (đi lên được) và dốc gắt 50° (không leo lên được).
const gentle = box(3, 0.2, 8, 4, 0, -8);
gentle.rotation.x = (12 * Math.PI) / 180;
gentle.position.y = Math.sin((12 * Math.PI) / 180) * 4 - 0.1;
const steep = box(3, 0.2, 4, 9, 0, -8, accent);
steep.rotation.x = (50 * Math.PI) / 180;
steep.position.y = Math.sin((50 * Math.PI) / 180) * 2;

// Bậc thềm 0.15 m (bước lên được) và bục 0.5 m (phải chặn lại).
box(4, 0.15, 2, 4, 0, 4);
box(4, 0.5, 2, 10, 0, 4, accent);

// Hành lang 2 m có cửa, dẫn vào một phòng 6 × 6 m.
box(0.2, 3, 10, -2, 0, 10);
box(0.2, 3, 10, 0.2, 0, 10);
box(6, 3, 0.2, 2.9 - 6, 0, 15.1);
box(0.2, 3, 6, -8.1, 0, 18);
box(6.2, 3, 0.2, -5, 0, 21.1);
box(2.2, 0.8, 0.2, -0.9, 2.2, 15.1); // dầm cửa

// Hàng cột hiên.
for (let i = 0; i < 6; i += 1) box(0.4, 3, 0.4, 14, 0, -12 + i * 4, accent);

level.traverse((child) => {
  if (!(child instanceof Mesh)) return;
  const edges = new LineSegments(
    new EdgesGeometry(child.geometry, 30),
    new LineBasicMaterial({ color: "#2f2f2f", transparent: true, opacity: 0.5 }),
  );
  child.add(edges);
});
scene.add(level);

const config = viewerConfig.walk;
const collider = buildWalkCollider(level);
const controller = createWalkController(collider, config, {
  minX: -19.5, maxX: 19.5, minZ: -19.5, maxZ: 19.5,
});
const spawnFeet = findSpawnPoint(collider, [6, 0, 10]);
const spawnYaw = yawTowards(spawnFeet, new Vector3(-6, 1.6, -6));
controller.teleport(spawnFeet, spawnYaw);

const hud = createWalkHud({
  mount: document.body,
  onExit: () => {
    hud.input.exitPointerLock();
    controller.teleport(spawnFeet, spawnYaw);
  },
  debug: true,
});
hud.activate();

// Móc cho test tự động (Playwright) đọc tư thế và giả lập input.
const testInput = { move: { x: 0, z: 0 }, running: false, yaw: 0, pitch: 0 };
let useTestInput = false;
const scriptedSource = {
  get move() { return testInput.move; },
  get running() { return testInput.running; },
  consumeLook() {
    const look = { yaw: testInput.yaw, pitch: testInput.pitch };
    testInput.yaw = 0;
    testInput.pitch = 0;
    return look;
  },
  consumeRespawn: () => false,
};
Object.assign(window, {
  __walkTest: {
    collider: { triangles: collider.triangleCount },
    pose: () => {
      const p = controller.getPose();
      return { x: p.feet.x, y: p.feet.y, z: p.feet.z, yaw: p.yaw, onGround: p.onGround };
    },
    teleport: (x: number, y: number, z: number, yaw: number) =>
      controller.teleport(new Vector3(x, y, z), yaw),
    drive: (move: { x: number; z: number }, running = false) => {
      useTestInput = true;
      testInput.move = move;
      testInput.running = running;
    },
    turn: (yaw: number) => {
      useTestInput = true;
      testInput.yaw += yaw;
    },
  },
});

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}
window.addEventListener("resize", resize);
resize();

let last = 0;
renderer.setAnimationLoop((time: number) => {
  const dt = last ? Math.min((time - last) / 1000, 0.1) : 1 / 60;
  last = time;
  controller.update(dt, useTestInput ? scriptedSource : hud.input);
  const pose = controller.getPose();
  if (pose.feet.y < -20) controller.teleport(spawnFeet, spawnYaw);
  controller.applyToCamera(camera);
  hud.setPose(pose);
  renderer.render(scene, camera);
});
