export type ViewerStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface ViewerMeta {
  title: string;
  subtitle: string;
}

export interface ModelConfig {
  src: string;
  fitPadding: number;
  initialRotation?: [number, number, number];
  initialScale?: number;
  enableGround: boolean;
  enableShadows: boolean;
}

export interface DracoConfig {
  decoderPath: string;
}

export interface ViewerBackground {
  top: string;
  bottom: string;
  accent: string;
  glow: string;
}

export interface ViewerLights {
  ambientIntensity: number;
  hemisphereIntensity: number;
  directionalIntensity: number;
  directionalPosition: [number, number, number];
}

export interface ViewerSceneConfig {
  background: ViewerBackground;
  fogColor: string;
  groundColor: string;
  lights: ViewerLights;
}

export interface ViewerCameraConfig {
  fov: number;
  near: number;
  far: number;
  fitDirection: [number, number, number];
}

export interface ViewerControlsConfig {
  autoRotate: boolean;
  autoRotateSpeed: number;
  enablePan: boolean;
  dampingFactor: number;
  stopAutoRotateOnInteract: boolean;
}

export interface UiTextConfig {
  instructions: string[];
  loadingStatus: string;
  preparingStatus: string;
  readyStatus: string;
  progressFallback: string;
  errorStatus: string;
  errorTitle: string;
  modelLoadError: string;
  decoderLoadError: string;
  resetButton: string;
  autoRotateOn: string;
  autoRotateOff: string;
}

export interface ViewerConfig {
  meta: ViewerMeta;
  model: ModelConfig;
  draco: DracoConfig;
  scene: ViewerSceneConfig;
  camera: ViewerCameraConfig;
  controls: ViewerControlsConfig;
  ui: UiTextConfig;
}

