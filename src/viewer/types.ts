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
  getZoom(): number;
  setBasemap(id: string): Promise<BasemapInfo | null>;
  modelToLngLat(point: [number, number, number]): [number, number];
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
  initialRotation?: [number, number, number];
  initialScale?: number;
  enableGround: boolean;
  enableShadows: boolean;
  edges?: ModelEdgesConfig;
  /**
   * Xoá các tam giác theo màu palette (UV) của một mesh lúc load. Dùng tạm cho
   * mặt phẳng nền trong file SketchUp; bỏ entry khi model export lại đã xoá nó,
   * vì màu palette có thể được gán cho vật thể khác ở lần export sau.
   */
  removeFaces?: ModelFaceFilter[];
}

export interface ModelFaceFilter {
  mesh: string;
  uv: [number, number];
  tolerance?: number;
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

export interface GeoControlPoint {
  /** Toạ độ (x, z) trong không gian model — lấy bằng chế độ `?calibrate`. */
  model: [number, number];
  /** [lon, lat] WGS84 của cùng điểm đó (Google Maps, QGIS…). */
  lngLat: [number, number];
}

export interface GeoConfig {
  /** Từ 2 điểm trở lên sẽ giải phép biến đổi đồng dạng và bỏ qua `estimate`. */
  controlPoints: GeoControlPoint[];
  estimate: {
    lngLat: [number, number];
    model: [number, number];
    metersPerUnit: number;
    /** Góc từ bắc thật tới trục -Z của model, theo chiều kim đồng hồ. */
    rotationDeg: number;
  };
}

export interface ZoomConfig {
  /** 512 theo MapLibre/Mapbox, 256 theo Google/Leaflet. */
  tileSize: number;
  min: number;
  max: number;
  initial: number;
  /** GLB hiện dần, khối LOD1 của trường mờ dần trong khoảng zoom này. */
  modelFade: [number, number];
  /** Khối LOD1 xung quanh mờ dần về `ghostOpacity` trong khoảng zoom này. */
  contextGhost: [number, number];
  ghostOpacity: number;
  /** Giới hạn khoảng dịch tâm orbit tính từ tâm khu vực, theo mét. */
  maxPanMeters: number;
}

export interface ContextConfig {
  basemapManifest: string;
  defaultBasemap: string;
  blocks: string;
  /** Cao độ mặt đất của model, theo đơn vị model. */
  groundY: number;
  blockColor: string;
  blockEdgeColor: string;
  defaultBlockHeight: number;
}

export interface BasemapInfo {
  id: string;
  label: string;
  year: number;
  image: string;
  /** [west, south, east, north] WGS84. */
  bounds: [number, number, number, number];
  attribution: string;
}

export interface ViewerConfig {
  meta: ViewerMeta;
  model: ModelConfig;
  draco: DracoConfig;
  scene: ViewerSceneConfig;
  camera: ViewerCameraConfig;
  controls: ViewerControlsConfig;
  geo: GeoConfig;
  zoom: ZoomConfig;
  context: ContextConfig;
  debug?: ViewerDebugConfig;
  ui: UiTextConfig;
}
