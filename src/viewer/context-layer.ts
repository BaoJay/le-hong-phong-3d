import {
  BufferGeometry,
  CanvasTexture,
  Color,
  EdgesGeometry,
  ExtrudeGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  Shape,
  TextureLoader,
  Vector2,
} from "three";
import type { Texture } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { GeoTransform } from "./geo";
import type { BasemapInfo, ContextConfig, ZoomConfig } from "./types";

const BLOCK_EDGE_THRESHOLD_ANGLE = 30;
const BLOCK_EDGE_OPACITY = 0.55;
// Viền mờ dần ở 15% ngoài cùng của basemap thay vì cắt vuông.
const BASEMAP_EDGE_FADE_START = 0.85;
const DISABLED_RAYCAST = () => undefined;

type Position = [number, number];
type Ring = Position[];

interface BlockFeature {
  rings: Ring[];
  height: number;
  minHeight: number;
  isSchool: boolean;
}

interface BlockLayer {
  mesh: Mesh<BufferGeometry, MeshStandardMaterial>;
  edges: LineSegments<BufferGeometry, LineBasicMaterial>;
  opacity: number;
}

export interface ContextLayer {
  group: Group;
  load(): Promise<void>;
  setZoom(zoom: number): void;
  setBasemap(id: string): Promise<BasemapInfo | null>;
  /** Các khối LOD1 thuộc trường, để raycast khi GLB đang ẩn. */
  schoolPickables(): Mesh[];
  hasBasemap(): boolean;
  dispose(): void;
}

export function createContextLayer(options: {
  config: ContextConfig;
  zoom: ZoomConfig;
  geo: GeoTransform;
  onBasemapChange?: (basemap: BasemapInfo | null) => void;
}): ContextLayer {
  const { config, zoom, geo, onBasemapChange } = options;
  const group = new Group();
  group.name = "GeoContext";
  group.matrixAutoUpdate = false;
  group.matrix.copy(geo.enuToModel);

  const groundEnuY = config.groundY * geo.metersPerUnit;
  const textureLoader = new TextureLoader();
  const textureCache = new Map<string, Promise<Texture>>();
  const edgeFadeMap = createEdgeFadeTexture();

  let manifest: BasemapInfo[] = [];
  let manifestUrl = config.basemapManifest;
  let basemapMesh: Mesh<PlaneGeometry, MeshBasicMaterial> | null = null;
  let activeBasemapId: string | null = null;
  let schoolBlocks: BlockLayer | null = null;
  let surroundingBlocks: BlockLayer | null = null;
  let lastZoom = Number.NaN;

  async function load() {
    const [basemaps, blocks] = await Promise.all([
      fetchJson<{ basemaps: BasemapInfo[] }>(config.basemapManifest),
      fetchJson<GeoJsonFeatureCollection>(config.blocks),
    ]);

    manifest = basemaps?.basemaps ?? [];
    manifestUrl = new URL(config.basemapManifest, window.location.href).href;
    if (blocks) {
      buildBlocks(parseBlocks(blocks, config.defaultBlockHeight));
    }
    await setBasemap(config.defaultBasemap);
    if (!Number.isNaN(lastZoom)) applyZoom(lastZoom);
  }

  async function setBasemap(id: string): Promise<BasemapInfo | null> {
    const info = manifest.find((basemap) => basemap.id === id) ?? null;
    if (!info) {
      if (manifest.length > 0) {
        console.warn(`[context] Basemap "${id}" không có trong manifest.`);
      }
      return null;
    }
    if (activeBasemapId === id) return info;
    activeBasemapId = id;

    const texture = await loadTexture(new URL(info.image, manifestUrl).href);
    if (activeBasemapId !== id) return info;

    const [west, south, east, north] = info.bounds;
    const [minE, minN] = geo.lngLatToEnu([west, south]);
    const [maxE, maxN] = geo.lngLatToEnu([east, north]);

    if (!basemapMesh) {
      const material = new MeshBasicMaterial({
        alphaMap: edgeFadeMap,
        transparent: true,
        depthWrite: false,
        // Đẩy basemap ra sau để mặt đất của GLB ở cùng cao độ luôn nằm trên.
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 4,
      });
      basemapMesh = new Mesh(new PlaneGeometry(1, 1), material);
      basemapMesh.name = "Basemap";
      basemapMesh.rotation.x = -Math.PI / 2;
      basemapMesh.renderOrder = -1;
      basemapMesh.raycast = DISABLED_RAYCAST;
      group.add(basemapMesh);
    }

    basemapMesh.material.map = texture;
    basemapMesh.material.needsUpdate = true;
    basemapMesh.scale.set(maxE - minE, maxN - minN, 1);
    basemapMesh.position.set((minE + maxE) / 2, groundEnuY, -(minN + maxN) / 2);
    onBasemapChange?.(info);
    return info;
  }

  function loadTexture(url: string): Promise<Texture> {
    let pending = textureCache.get(url);
    if (!pending) {
      pending = textureLoader.loadAsync(url).then((texture) => {
        texture.colorSpace = SRGBColorSpace;
        texture.anisotropy = 4;
        return texture;
      });
      textureCache.set(url, pending);
    }
    return pending;
  }

  function buildBlocks(features: BlockFeature[]) {
    const school: BufferGeometry[] = [];
    const surrounding: BufferGeometry[] = [];

    for (const feature of features) {
      const geometry = extrudeFeature(feature);
      if (geometry) (feature.isSchool ? school : surrounding).push(geometry);
    }

    schoolBlocks = createBlockLayer(school, "SchoolBlocks");
    surroundingBlocks = createBlockLayer(surrounding, "SurroundingBlocks");
  }

  function extrudeFeature(feature: BlockFeature): BufferGeometry | null {
    const [outer, ...holes] = feature.rings.map((ring) =>
      openRing(ring).map((lngLat) => new Vector2(...geo.lngLatToEnu(lngLat))),
    );
    if (!outer || outer.length < 3) return null;

    const shape = new Shape(outer);
    shape.holes = holes.map((hole) => new Shape(hole));
    const depth = Math.max(feature.height - feature.minHeight, 0.5);
    const geometry = new ExtrudeGeometry(shape, { depth, bevelEnabled: false });
    // Shape nằm trên mặt (đông, bắc), đùn theo +Z ⇒ quay để đùn theo +Y.
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, groundEnuY + feature.minHeight, 0);
    return geometry;
  }

  function createBlockLayer(geometries: BufferGeometry[], name: string): BlockLayer | null {
    if (geometries.length === 0) return null;

    const geometry = geometries.length === 1 ? geometries[0] : mergeGeometries(geometries, false);
    if (geometries.length > 1) geometries.forEach((part) => part.dispose());
    if (!geometry) return null;

    const mesh = new Mesh(
      geometry,
      new MeshStandardMaterial({
        color: new Color(config.blockColor),
        roughness: 0.92,
        metalness: 0,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      }),
    );
    mesh.name = name;

    const edges = new LineSegments(
      new EdgesGeometry(geometry, BLOCK_EDGE_THRESHOLD_ANGLE),
      new LineBasicMaterial({
        color: new Color(config.blockEdgeColor),
        transparent: true,
        opacity: BLOCK_EDGE_OPACITY,
        depthWrite: false,
      }),
    );
    edges.name = `${name}Edges`;
    edges.raycast = DISABLED_RAYCAST;

    group.add(mesh, edges);
    return { mesh, edges, opacity: 1 };
  }

  function setZoom(zoomLevel: number) {
    if (zoomLevel === lastZoom) return;
    lastZoom = zoomLevel;
    applyZoom(zoomLevel);
  }

  function applyZoom(zoomLevel: number) {
    const schoolFade = smoothstep(zoom.modelFade[0], zoom.modelFade[1], zoomLevel);
    const ghostFade = smoothstep(zoom.contextGhost[0], zoom.contextGhost[1], zoomLevel);
    setLayerOpacity(schoolBlocks, 1 - schoolFade);
    setLayerOpacity(surroundingBlocks, MathUtils.lerp(1, zoom.ghostOpacity, ghostFade));
  }

  function setLayerOpacity(layer: BlockLayer | null, opacity: number) {
    if (!layer || Math.abs(layer.opacity - opacity) < 1e-3) return;
    layer.opacity = opacity;

    const translucent = opacity < 0.999;
    const material = layer.mesh.material;
    material.opacity = opacity;
    if (material.transparent !== translucent) {
      // Shader của vật liệu đục được biên dịch với OPAQUE (alpha = 1), nên
      // đổi `transparent` phải biên dịch lại.
      material.transparent = translucent;
      material.needsUpdate = true;
    }
    material.depthWrite = !translucent;
    layer.edges.material.opacity = BLOCK_EDGE_OPACITY * opacity;

    const visible = opacity > 0.001;
    layer.mesh.visible = visible;
    layer.edges.visible = visible;
  }

  function dispose() {
    for (const layer of [schoolBlocks, surroundingBlocks]) {
      if (!layer) continue;
      layer.mesh.geometry.dispose();
      layer.mesh.material.dispose();
      layer.edges.geometry.dispose();
      layer.edges.material.dispose();
    }
    if (basemapMesh) {
      basemapMesh.geometry.dispose();
      basemapMesh.material.dispose();
    }
    for (const pending of textureCache.values()) {
      void pending.then((texture) => texture.dispose()).catch(() => undefined);
    }
    edgeFadeMap.dispose();
    group.clear();
  }

  return {
    group,
    load,
    setZoom,
    setBasemap,
    schoolPickables: () => (schoolBlocks?.mesh.visible ? [schoolBlocks.mesh] : []),
    hasBasemap: () => basemapMesh !== null,
    dispose,
  };
}

// ── GeoJSON ─────────────────────────────────────────────────────────────────

interface GeoJsonFeatureCollection {
  type: "FeatureCollection";
  features: {
    geometry: { type: string; coordinates: unknown } | null;
    properties: Record<string, unknown> | null;
  }[];
}

function parseBlocks(collection: GeoJsonFeatureCollection, defaultHeight: number): BlockFeature[] {
  const features: BlockFeature[] = [];

  for (const feature of collection.features ?? []) {
    const geometry = feature.geometry;
    if (!geometry) continue;

    const polygons =
      geometry.type === "Polygon"
        ? [geometry.coordinates as Ring[]]
        : geometry.type === "MultiPolygon"
          ? (geometry.coordinates as Ring[][])
          : [];
    const props = feature.properties ?? {};
    const height = toNumber(props.height) ?? defaultHeight;
    const minHeight = toNumber(props.min_height) ?? 0;
    const isSchool = props.is_school === true || props.is_school === "true" || props.is_school === 1;

    for (const rings of polygons) {
      if (rings.length > 0) features.push({ rings, height, minHeight, isSchool });
    }
  }

  return features;
}

/** GeoJSON lặp lại điểm đầu ở cuối ring; Shape của Three.js thì không. */
function openRing(ring: Ring): Ring {
  const first = ring[0];
  const last = ring[ring.length - 1];
  return ring.length > 1 && first[0] === last[0] && first[1] === last[1]
    ? ring.slice(0, -1)
    : ring;
}

function toNumber(value: unknown): number | null {
  const number = typeof value === "string" ? Number.parseFloat(value) : value;
  return typeof number === "number" && Number.isFinite(number) ? number : null;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.info(`[context] Bỏ qua ${url} (HTTP ${response.status}).`);
      return null;
    }
    return (await response.json()) as T;
  } catch (error) {
    console.warn(`[context] Không đọc được ${url}.`, error);
    return null;
  }
}

function createEdgeFadeTexture(): CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (context) {
    const half = size / 2;
    const gradient = context.createRadialGradient(
      half, half, half * BASEMAP_EDGE_FADE_START,
      half, half, half,
    );
    gradient.addColorStop(0, "#ffffff");
    gradient.addColorStop(1, "#000000");
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  }
  return new CanvasTexture(canvas);
}

export function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}
