import {
  AmbientLight,
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
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer
} from 'three';
import type { Material } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { ViewerConfig, ViewerStatus } from './types';

interface LoadingProgress {
  loaded: number;
  total: number;
  progress: number | null;
}

interface ViewerCallbacks {
  onProgress?: (progress: LoadingProgress) => void;
  onStatusChange?: (status: ViewerStatus) => void;
  onError?: (message: string) => void;
  onAutoRotateChange?: (enabled: boolean) => void;
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

export interface ViewerApi {
  load: () => Promise<void>;
  resetView: () => void;
  setAutoRotate: (enabled: boolean) => void;
  isAutoRotateEnabled: () => boolean;
  destroy: () => void;
}

const CAMERA_NEAR_DIVISOR = 120;
const CAMERA_FAR_MULTIPLIER = 18;

export function createViewer({
  mount,
  canvas,
  config,
  onProgress,
  onStatusChange,
  onError,
  onAutoRotateChange
}: CreateViewerOptions): ViewerApi {
  const scene = new Scene();
  scene.fog = new Fog(config.scene.fogColor, 20, 120);

  const camera = new PerspectiveCamera(
    config.camera.fov,
    1,
    config.camera.near,
    config.camera.far
  );

  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true
  });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.shadowMap.enabled = config.model.enableShadows;
  renderer.shadowMap.type = PCFSoftShadowMap;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(new Color('#000000'), 0);

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

  const ambientLight = new AmbientLight('#ffffff', config.scene.lights.ambientIntensity);
  const hemisphereLight = new HemisphereLight(
    '#fff4d2',
    config.scene.groundColor,
    config.scene.lights.hemisphereIntensity
  );
  const directionalLight = new DirectionalLight(
    '#fff9ea',
    config.scene.lights.directionalIntensity
  );
  directionalLight.position.set(...config.scene.lights.directionalPosition);
  directionalLight.castShadow = config.model.enableShadows;
  directionalLight.shadow.mapSize.set(2048, 2048);
  directionalLight.shadow.bias = -0.00008;
  directionalLight.shadow.camera.near = 0.5;
  directionalLight.shadow.camera.far = 80;
  directionalLight.shadow.camera.left = -35;
  directionalLight.shadow.camera.right = 35;
  directionalLight.shadow.camera.top = 35;
  directionalLight.shadow.camera.bottom = -35;

  scene.add(ambientLight, hemisphereLight, directionalLight, directionalLight.target);

  const ground = new Mesh(
    new PlaneGeometry(1, 1),
    new MeshStandardMaterial({
      color: new Color(config.scene.groundColor),
      roughness: 0.95,
      metalness: 0.02
    })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = config.model.enableShadows;
  ground.visible = config.model.enableGround;
  scene.add(ground);

  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath(config.draco.decoderPath);

  const gltfLoader = new GLTFLoader();
  gltfLoader.setDRACOLoader(dracoLoader);

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
    if (destroyed) {
      return;
    }

    controls.update();
    renderer.render(scene, camera);
  };

  renderer.setAnimationLoop(animate);
  resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(mount);
  window.addEventListener('resize', resize);
  resize();

  const stopAutoRotateOnInteract = () => {
    if (!config.controls.stopAutoRotateOnInteract || !controls.autoRotate) {
      return;
    }

    setAutoRotate(false);
  };

  controls.addEventListener('start', stopAutoRotateOnInteract);

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
    setStatus('loading');
    onProgress?.({
      loaded: 0,
      total: 0,
      progress: 0
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
      modelRoot.name = 'LeHongPhongCampus';

      applyModelTransform(modelRoot, config);
      applyShadowSettings(modelRoot, config.model.enableShadows);

      scene.add(modelRoot);

      const bounds = new Box3().setFromObject(modelRoot);

      if (bounds.isEmpty()) {
        throw new Error('Model loaded but did not contain visible geometry.');
      }

      fitCameraToBounds(bounds);
      updateGround(bounds);

      onProgress?.({
        loaded: 1,
        total: 1,
        progress: 1
      });
      setStatus('ready');
    } catch (error) {
      const message = mapViewerError(error, config);
      setStatus('error');
      onError?.(message);
      throw error;
    }
  }

  function fitCameraToBounds(bounds: Box3) {
    const center = bounds.getCenter(new Vector3());
    const size = bounds.getSize(new Vector3());
    const maxDimension = Math.max(size.x, size.y, size.z);
    const radius = maxDimension / 2;
    const fitOffset = config.model.fitPadding;
    const fovInRadians = MathUtils.degToRad(camera.fov);
    const fitHeightDistance = radius / Math.tan(fovInRadians / 2);
    const fitWidthDistance = fitHeightDistance / camera.aspect;
    const distance = fitOffset * Math.max(fitHeightDistance, fitWidthDistance);

    const fitDirection = new Vector3(...config.camera.fitDirection).normalize();
    const nextPosition = fitDirection.multiplyScalar(distance).add(center);

    camera.position.copy(nextPosition);
    camera.near = Math.max(distance / CAMERA_NEAR_DIVISOR, 0.01);
    camera.far = Math.max(distance * CAMERA_FAR_MULTIPLIER, config.camera.far);
    camera.updateProjectionMatrix();

    controls.target.copy(center);
    controls.minDistance = Math.max(radius * 0.45, 0.5);
    controls.maxDistance = Math.max(radius * 8, 20);
    controls.update();

    initialViewState = {
      position: nextPosition.clone(),
      target: center.clone()
    };

    directionalLight.target.position.copy(center);
    directionalLight.target.updateMatrixWorld();

    if (scene.fog) {
      scene.fog.near = Math.max(distance * 0.8, 10);
      scene.fog.far = Math.max(distance * 4.5, 50);
    }
  }

  function updateGround(bounds: Box3) {
    if (!config.model.enableGround) {
      return;
    }

    const center = bounds.getCenter(new Vector3());
    const size = bounds.getSize(new Vector3());
    const diameter = Math.max(size.x, size.z) * 2.3;

    ground.scale.setScalar(Math.max(diameter, 12));
    ground.position.set(center.x, bounds.min.y - 0.02, center.z);
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
    window.removeEventListener('resize', resize);
    controls.removeEventListener('start', stopAutoRotateOnInteract);
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
    setAutoRotate,
    isAutoRotateEnabled: () => controls.autoRotate,
    destroy
  };

  function loadGltfWithProgress(
    handleProgress: (progress: LoadingProgress) => void
  ): Promise<GLTF> {
    return new Promise((resolve, reject) => {
      gltfLoader.load(
        config.model.src,
        resolve,
        (event) => {
          const total = event.total ?? 0;
          const loaded = event.loaded ?? 0;
          const progress = total > 0 ? loaded / total : null;

          handleProgress({
            loaded,
            total,
            progress
          });
        },
        reject
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
  root.traverse((child) => {
    if (!(child instanceof Mesh)) {
      return;
    }

    child.castShadow = enableShadows;
    child.receiveShadow = enableShadows;
  });
}

function disposeObject(root: Object3D) {
  root.traverse((child) => {
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

  if (normalized.includes('draco') || normalized.includes('decoder')) {
    return `${config.ui.decoderLoadError} (${rawMessage})`;
  }

  return `${config.ui.modelLoadError} (${rawMessage})`;
}

