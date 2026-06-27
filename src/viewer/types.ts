export type ViewerStatus = "idle" | "loading" | "ready" | "error";

export interface LoadingProgress {
  loaded: number;
  total: number;
  progress: number | null;
}

export interface ViewerApi {
  load(): Promise<void>;
  resetView(): void;
  resetViewAnimated(): void;
  setAutoRotate(enabled: boolean): void;
  isAutoRotateEnabled(): boolean;
  zoomIn(): void;
  zoomOut(): void;
  setLabels(defs: { el: HTMLElement; pos: [number, number, number] }[]): void;
  focusOnPoint(center: [number, number, number], panelWidthFraction?: number): void;
  destroy(): void;
}

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
  edges?: ModelEdgesConfig;
}

export interface ModelEdgesConfig {
  enabled: boolean;
  color?: string;
  opacity?: number;
  thresholdAngle?: number;
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
  sketchUpSunDirection: [number, number, number];
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
  orbitTarget?: [number, number, number];
}

export interface ViewerDebugConfig {
  showWorldAxes?: boolean;
  worldAxesSize?: number;
  worldAxesPosition?: [number, number, number];
  worldAxesColors?: [string, string, string];
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
  debug?: ViewerDebugConfig;
  ui: UiTextConfig;
}
