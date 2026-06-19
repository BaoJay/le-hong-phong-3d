import {
  AmbientLight,
  AxesHelper,
  Box3,
  Color,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import type { Intersection, Material } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import type {
  LoadingProgress,
  ViewerApi,
  ViewerConfig,
  ViewerStatus,
} from "./types";

interface ViewerCallbacks {
  onProgress?: (progress: LoadingProgress) => void;
  onStatusChange?: (status: ViewerStatus) => void;
  onError?: (message: string) => void;
  onAutoRotateChange?: (enabled: boolean) => void;
  onObjectClick?: (point: [number, number, number]) => void;
  onEmptyClick?: () => void;
}

interface InitialViewState {
  position: Vector3;
  target: Vector3;
}

interface CreateViewerOptions extends ViewerCallbacks {
  mount: HTMLElement;
  canvas: HTMLCanvasElement;
  config: ViewerConfig;
}

const CAMERA_NEAR_DIVISOR = 120;
const CAMERA_FAR_MULTIPLIER = 18;
const DEFAULT_DEBUG_AXES_SIZE = 20;
const DEFAULT_DEBUG_AXES_COLORS: [string, string, string] = [
  "#2f72ff",
  "#2fbf5b",
  "#ff2f2f",
];
const DEFAULT_SHADOW_MAP_SIZE = 4096;
const MIN_SUN_DISTANCE = 20;
const MIN_SHADOW_EXTENT = 25;

export function createViewer({
  mount,
  canvas,
  config,
  onProgress,
  onStatusChange,
  onError,
  onAutoRotateChange,
  onObjectClick,
  onEmptyClick,
}: CreateViewerOptions): ViewerApi {
  const scene = new Scene();
  scene.fog = new Fog(config.scene.fogColor, 20, 120);

  const camera = new PerspectiveCamera(
    config.camera.fov,
    1,
    config.camera.near,
    config.camera.far,
  );

  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
  });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.shadowMap.enabled = config.model.enableShadows;
  renderer.shadowMap.type = PCFSoftShadowMap;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(new Color("#000000"), 0);

  const controls = new OrbitControls(camera, canvas);
  controls.enablePan = config.controls.enablePan;
  controls.enableDamping = true;
  controls.dampingFactor = config.controls.dampingFactor;
  controls.autoRotate = config.controls.autoRotate;
  controls.autoRotateSpeed = config.controls.autoRotateSpeed;
  controls.maxPolarAngle = Math.PI / 2.04;
  controls.minDistance = 2;
  controls.maxDistance = 400;
  controls.target.set(0, 0, 0);

  const ambientLight = new AmbientLight(
    "#ffffff",
    config.scene.lights.ambientIntensity,
  );
  const hemisphereLight = new HemisphereLight(
    "#fff4d2",
    config.scene.groundColor,
    config.scene.lights.hemisphereIntensity,
  );
  const directionalLight = new DirectionalLight(
    "#fff9ea",
    config.scene.lights.directionalIntensity,
  );
  directionalLight.position
    .copy(sketchUpSunDirectionToThree(config.scene.lights.sketchUpSunDirection))
    .multiplyScalar(MIN_SUN_DISTANCE);
  directionalLight.castShadow = config.model.enableShadows;
  directionalLight.shadow.mapSize.set(
    DEFAULT_SHADOW_MAP_SIZE,
    DEFAULT_SHADOW_MAP_SIZE,
  );
  directionalLight.shadow.bias = -0.00008;
  directionalLight.shadow.normalBias = 0.015;
  directionalLight.shadow.camera.near = 0.1;
  directionalLight.shadow.camera.far = 100;
  directionalLight.shadow.camera.left = -MIN_SHADOW_EXTENT;
  directionalLight.shadow.camera.right = MIN_SHADOW_EXTENT;
  directionalLight.shadow.camera.top = MIN_SHADOW_EXTENT;
  directionalLight.shadow.camera.bottom = -MIN_SHADOW_EXTENT;

  scene.add(
    ambientLight,
    hemisphereLight,
    directionalLight,
    directionalLight.target,
  );

  const worldAxes = new AxesHelper(
    config.debug?.worldAxesSize ?? DEFAULT_DEBUG_AXES_SIZE,
  );
  worldAxes.name = "DebugWorldAxes";
  worldAxes.setColors(
    ...(config.debug?.worldAxesColors ?? DEFAULT_DEBUG_AXES_COLORS),
  );
  worldAxes.position.set(...(config.debug?.worldAxesPosition ?? [0, 0, 0]));
  worldAxes.visible = config.debug?.showWorldAxes ?? false;
  scene.add(worldAxes);

  const ground = new Mesh(
    new PlaneGeometry(1, 1),
    new MeshStandardMaterial({
      color: new Color(config.scene.groundColor),
      roughness: 0.95,
      metalness: 0.02,
    }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = config.model.enableShadows;
  ground.visible = config.model.enableGround;
  scene.add(ground);

  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath(config.draco.decoderPath);

  const gltfLoader = new GLTFLoader();
  gltfLoader.setDRACOLoader(dracoLoader);

  interface TrackedLabel {
    el: HTMLElement;
    worldPos: Vector3;
  }
  let trackedLabels: TrackedLabel[] = [];

  function updateTrackedLabels() {
    if (trackedLabels.length === 0) return;
    const w = Math.max(mount.clientWidth, 1);
    const h = Math.max(mount.clientHeight, 1);
    for (const { el, worldPos } of trackedLabels) {
      const v = worldPos.clone().project(camera);
      if (v.z > 1) {
        el.style.visibility = "hidden";
        continue;
      }
      el.style.visibility = "";
      el.style.left = `${(v.x * 0.5 + 0.5) * w}px`;
      el.style.top = `${(-v.y * 0.5 + 0.5) * h}px`;
    }
  }

  function setLabels(
    defs: { el: HTMLElement; pos: [number, number, number] }[],
  ) {
    trackedLabels = defs.map(({ el, pos }) => ({
      el,
      worldPos: new Vector3(...pos),
    }));
  }

  // ── Camera focus animation ───────────────────────────────────────────────
  interface CamAnim {
    startPos: Vector3;
    endPos: Vector3;
    startTarget: Vector3;
    endTarget: Vector3;
    progress: number;
    onComplete?: () => void;
  }
  let camAnim: CamAnim | null = null;

  function resetViewAnimated() {
    if (!initialViewState) return;
    camAnim = {
      startPos: camera.position.clone(),
      endPos: initialViewState.position.clone(),
      startTarget: controls.target.clone(),
      endTarget: initialViewState.target.clone(),
      progress: 0,
      onComplete: () => setAutoRotate(true),
    };
  }

  function focusOnPoint(
    centerArr: [number, number, number],
    panelWidthFraction = 0,
  ) {
    const target = new Vector3(...centerArr);
    // Use the animation destination if mid-flight, so direction/distance are consistent.
    const refPos = camAnim ? camAnim.endPos : camera.position;
    const refTarget = camAnim ? camAnim.endTarget : controls.target;
    const dir = new Vector3().subVectors(refPos, refTarget).normalize();
    const newDist = Math.max(
      refPos.distanceTo(refTarget) * 0.38,
      controls.minDistance * 2,
    );

    // Shift target rightward so the building stays centered in the viewport
    // area left of the info panel (panelWidthFraction = panel px / viewport px).
    if (panelWidthFraction > 0) {
      const lookDir = dir.clone().negate();
      const right = new Vector3().crossVectors(lookDir, camera.up).normalize();
      const halfWidthWorld =
        Math.tan(MathUtils.degToRad(camera.fov / 2)) * newDist * camera.aspect;
      target.addScaledVector(right, halfWidthWorld * panelWidthFraction);
    }

    camAnim = {
      startPos: camera.position.clone(),
      endPos: target.clone().addScaledVector(dir, newDist),
      startTarget: controls.target.clone(),
      endTarget: target,
      progress: 0,
    };
    setAutoRotate(false);
  }

  // ── Raycasting / click detection ─────────────────────────────────────────
  const raycaster = new Raycaster();
  const ndcPointer = new Vector2();
  let pointerDownX = 0;
  let pointerDownY = 0;

  canvas.addEventListener("pointerdown", (e) => {
    pointerDownX = e.clientX;
    pointerDownY = e.clientY;
  });

  canvas.addEventListener("pointerup", (e) => {
    const dx = e.clientX - pointerDownX;
    const dy = e.clientY - pointerDownY;
    if (Math.sqrt(dx * dx + dy * dy) > 5 || !onObjectClick) return;

    const rect = canvas.getBoundingClientRect();
    ndcPointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    ndcPointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(ndcPointer, camera);
    const hits = raycaster.intersectObjects(scene.children, true);
    const hit = hits.find((h: Intersection<Object3D>) => h.object !== ground);
    if (hit) onObjectClick([hit.point.x, hit.point.y, hit.point.z]);
    else onEmptyClick?.();
  });

  let initialViewState: InitialViewState | null = null;
  let modelRoot: Group | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let destroyed = false;
  let loadPromise: Promise<void> | null = null;

  const resize = () => {
    if (destroyed) {
      return;
    }

    const width = Math.max(mount.clientWidth, 1);
    const height = Math.max(mount.clientHeight, 1);

    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height, false);
  };

  const animate = () => {
    if (destroyed) return;

    if (camAnim) {
      camAnim.progress = Math.min(camAnim.progress + 0.028, 1);
      const t = easeInOutCubic(camAnim.progress);
      camera.position.lerpVectors(camAnim.startPos, camAnim.endPos, t);
      controls.target.lerpVectors(camAnim.startTarget, camAnim.endTarget, t);
      controls.update();
      if (camAnim.progress >= 1) {
        const cb = camAnim.onComplete;
        camAnim = null;
        cb?.();
      }
    } else {
      controls.update();
    }

    updateTrackedLabels();
    renderer.render(scene, camera);
  };

  renderer.setAnimationLoop(animate);
  resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(mount);
  window.addEventListener("resize", resize);
  resize();

  const stopAutoRotateOnInteract = () => {
    if (!config.controls.stopAutoRotateOnInteract || !controls.autoRotate) {
      return;
    }

    setAutoRotate(false);
  };

  controls.addEventListener("start", stopAutoRotateOnInteract);

  function setStatus(status: ViewerStatus) {
    onStatusChange?.(status);
  }

  function setAutoRotate(enabled: boolean) {
    controls.autoRotate = enabled;
    onAutoRotateChange?.(enabled);
  }

  async function load(): Promise<void> {
    if (loadPromise) {
      return loadPromise;
    }

    loadPromise = loadModel().catch((error) => {
      loadPromise = null;
      throw error;
    });

    return loadPromise;
  }

  async function loadModel() {
    setStatus("loading");
    onProgress?.({
      loaded: 0,
      total: 0,
      progress: 0,
    });

    try {
      const gltf = await loadGltfWithProgress((progressEvent) => {
        onProgress?.(progressEvent);
      });

      if (destroyed) {
        return;
      }

      if (modelRoot) {
        scene.remove(modelRoot);
        disposeObject(modelRoot);
      }

      modelRoot = gltf.scene;
      modelRoot.name = "LeHongPhongCampus";

      applyModelTransform(modelRoot, config);
      applyShadowSettings(modelRoot, config.model.enableShadows);

      scene.add(modelRoot);

      const bounds = new Box3().setFromObject(modelRoot);

      if (bounds.isEmpty()) {
        throw new Error("Model loaded but did not contain visible geometry.");
      }

      fitCameraToBounds(bounds);
      updateSunLight(bounds);
      updateGround(bounds);

      onProgress?.({
        loaded: 1,
        total: 1,
        progress: 1,
      });
      setStatus("ready");
    } catch (error) {
      const message = mapViewerError(error, config);
      setStatus("error");
      onError?.(message);
      throw error;
    }
  }

  function fitCameraToBounds(bounds: Box3) {
    const center = bounds.getCenter(new Vector3());
    // Set trục orbit về trục xyz 0;0;0 của world space
    // [50, 0, -80] là tâm điểm sân trường khu A
    const orbitTarget = new Vector3(50, 0, -80);
    const size = bounds.getSize(new Vector3());
    const maxDimension = Math.max(size.x, size.y, size.z);
    const radius = maxDimension / 2;
    const fitPadding = config.model.fitPadding;
    const fovInRadians = MathUtils.degToRad(camera.fov);
    const verticalFitDistance = radius / Math.tan(fovInRadians / 2);
    const horizontalFitDistance = verticalFitDistance / camera.aspect;
    // fitDistance là khoảng cách từ camera đến tâm orbit, để toàn bộ model nằm trong view
    const fitDistance = fitPadding * Math.max(verticalFitDistance, horizontalFitDistance);

    // Giới hạn khoảng cách camera để tránh zoom quá gần hoặc quá xa
    const minDistance = fitDistance * 0.1;
    const maxDistance = fitDistance;
    const initialDistance = maxDistance/2;

    // Hướng đặt camera ban đầu so với tâm orbit, lấy từ config viewer-config.ts, fitDirection: [1.25, 0.72, 1.4]
    // .normalize() biến vector này thành vector đơn vị, nên độ lớn không quan trọng, chỉ quan trọng tỉ lệ giữa x/y/z
    const fitDirection = new Vector3(...config.camera.fitDirection).normalize();

    // nextPosition là vị trí camera ban đầu, thực tế trong world space
    // nextPosition = hướng * khoảng cách + tâm orbit
    const nextPosition = fitDirection.multiplyScalar(initialDistance).add(orbitTarget);

    camera.position.copy(nextPosition);
    // vật thể gần camera hơn khoảng này sẽ không được render.
    camera.near = Math.max(fitDistance / CAMERA_NEAR_DIVISOR, 0.01);
    // vật thể xa camera hơn khoảng này sẽ không được render.
    camera.far = Math.max(fitDistance * CAMERA_FAR_MULTIPLIER, config.camera.far);
    camera.updateProjectionMatrix();

    // Trục orbit thật nằm ở đây
    controls.target.copy(orbitTarget);
    controls.minDistance = minDistance;
    controls.maxDistance = maxDistance;
    controls.update();

    // Lưu trạng thái view ban đầu để reset khi bấm button reset
    initialViewState = {
      position: nextPosition.clone(),
      target: orbitTarget.clone(),
    };

    if (scene.fog) {
      scene.fog.near = Math.max(fitDistance * 0.8, 10);
      scene.fog.far = Math.max(fitDistance * 4.5, 50);
    }
  }

  function updateSunLight(bounds: Box3) {
    const center = bounds.getCenter(new Vector3());
    const size = bounds.getSize(new Vector3());
    const maxDimension = Math.max(size.x, size.y, size.z);
    const sunDirection = sketchUpSunDirectionToThree(
      config.scene.lights.sketchUpSunDirection,
    );
    const lightDistance = Math.max(maxDimension * 2, MIN_SUN_DISTANCE);
    const shadowExtent = Math.max(maxDimension * 0.75, MIN_SHADOW_EXTENT);
    const shadowCamera = directionalLight.shadow.camera;

    directionalLight.position
      .copy(center)
      .addScaledVector(sunDirection, lightDistance);
    directionalLight.target.position.copy(center);
    directionalLight.target.updateMatrixWorld();

    shadowCamera.near = 0.1;
    shadowCamera.far = Math.max(lightDistance + maxDimension * 2, 100);
    shadowCamera.left = -shadowExtent;
    shadowCamera.right = shadowExtent;
    shadowCamera.top = shadowExtent;
    shadowCamera.bottom = -shadowExtent;
    shadowCamera.updateProjectionMatrix();
    directionalLight.shadow.needsUpdate = true;
  }

  function updateGround(bounds: Box3) {
    if (!config.model.enableGround) {
      return;
    }

    const size = bounds.getSize(new Vector3());
    const diameter = Math.max(size.x, size.z) * 1.2;

    ground.scale.setScalar(Math.max(diameter, 12));
    ground.position.set(0, bounds.min.y - 0.02, 0);
  }

  function zoomIn() {
    const offset = new Vector3().subVectors(camera.position, controls.target);
    offset.multiplyScalar(0.8);
    camera.position.copy(controls.target).add(offset);
    controls.update();
  }

  function zoomOut() {
    const offset = new Vector3().subVectors(camera.position, controls.target);
    offset.multiplyScalar(1.25);
    camera.position.copy(controls.target).add(offset);
    controls.update();
  }

  function resetView() {
    if (!initialViewState) {
      return;
    }

    camera.position.copy(initialViewState.position);
    controls.target.copy(initialViewState.target);
    controls.update();
  }

  function destroy() {
    destroyed = true;
    renderer.setAnimationLoop(null);
    resizeObserver?.disconnect();
    resizeObserver = null;
    window.removeEventListener("resize", resize);
    controls.removeEventListener("start", stopAutoRotateOnInteract);
    controls.dispose();

    if (modelRoot) {
      scene.remove(modelRoot);
      disposeObject(modelRoot);
      modelRoot = null;
    }

    ground.geometry.dispose();
    ground.material.dispose();
    dracoLoader.dispose();
    renderer.dispose();
  }

  return {
    load,
    resetView,
    resetViewAnimated,
    setAutoRotate,
    isAutoRotateEnabled: () => controls.autoRotate,
    zoomIn,
    zoomOut,
    setLabels,
    focusOnPoint,
    destroy,
  };

  function loadGltfWithProgress(
    handleProgress: (progress: LoadingProgress) => void,
  ): Promise<GLTF> {
    return new Promise((resolve, reject) => {
      gltfLoader.load(
        config.model.src,
        resolve,
        (event: ProgressEvent) => {
          const total = event.total ?? 0;
          const loaded = event.loaded ?? 0;
          const progress = total > 0 ? loaded / total : null;

          handleProgress({
            loaded,
            total,
            progress,
          });
        },
        reject,
      );
    });
  }
}

function applyModelTransform(modelRoot: Group, config: ViewerConfig) {
  if (config.model.initialScale) {
    modelRoot.scale.setScalar(config.model.initialScale);
  }

  if (config.model.initialRotation) {
    modelRoot.rotation.set(...config.model.initialRotation);
  }
}

function applyShadowSettings(root: Object3D, enableShadows: boolean) {
  root.traverse((child: Object3D) => {
    if (!(child instanceof Mesh)) {
      return;
    }

    child.castShadow = enableShadows;
    child.receiveShadow = enableShadows;
  });
}

function sketchUpSunDirectionToThree(
  sketchUpDirection: [number, number, number],
) {
  const [x, y, z] = sketchUpDirection;
  // SketchUp is Z-up; glTF/Three.js is Y-up.
  const direction = new Vector3(x, z, -y);

  if (direction.lengthSq() === 0) {
    return new Vector3(0, 1, 0);
  }

  return direction.normalize();
}

function disposeObject(root: Object3D) {
  root.traverse((child: Object3D) => {
    if (!(child instanceof Mesh)) {
      return;
    }

    child.geometry.dispose();

    if (Array.isArray(child.material)) {
      child.material.forEach(disposeMaterial);
      return;
    }

    disposeMaterial(child.material);
  });
}

function disposeMaterial(material: Material) {
  material.dispose();
}

function mapViewerError(error: unknown, config: ViewerConfig) {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const normalized = rawMessage.toLowerCase();

  if (normalized.includes("draco") || normalized.includes("decoder")) {
    return `${config.ui.decoderLoadError} (${rawMessage})`;
  }

  return `${config.ui.modelLoadError} (${rawMessage})`;
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}
