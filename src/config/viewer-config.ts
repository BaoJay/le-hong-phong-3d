import type { ViewerConfig } from '../viewer/types';

const baseUrl = import.meta.env.BASE_URL;

export const viewerConfig: ViewerConfig = {
  meta: {
    title: 'THPT Lê Hồng Phong',
    subtitle:
      'Trình xem 3D khuôn viên trường theo pipeline SketchUp → GLB → Three.js.'
  },
  model: {
    src: `${baseUrl}models/le-hong-phong-campus-placeholder.glb`,
    fitPadding: 1.45,
    initialRotation: [0, Math.PI * 0.08, 0],
    initialScale: 1,
    enableGround: true,
    enableShadows: true
  },
  draco: {
    decoderPath: `${baseUrl}draco/`
  },
  scene: {
    background: {
      top: '#f7f1df',
      bottom: '#d8ebe0',
      accent: '#f4c76b',
      glow: '#ffe2a7'
    },
    fogColor: '#f4efe3',
    groundColor: '#e8ddc3',
    lights: {
      ambientIntensity: 0.8,
      hemisphereIntensity: 1.15,
      directionalIntensity: 1.65,
      directionalPosition: [12, 18, 10]
    }
  },
  camera: {
    fov: 42,
    near: 0.1,
    far: 2500,
    fitDirection: [1.25, 0.72, 1.4]
  },
  controls: {
    autoRotate: true,
    autoRotateSpeed: 0.8,
    enablePan: true,
    dampingFactor: 0.06,
    stopAutoRotateOnInteract: true
  },
  ui: {
    instructions: [
      'Kéo chuột hoặc chạm để xoay góc nhìn quanh mô hình.',
      'Dùng con lăn hoặc thao tác pinch để phóng to, thu nhỏ.',
      'Giữ chuột phải hoặc kéo hai ngón để di chuyển khung nhìn.'
    ],
    loadingStatus: 'Đang tải mô hình 3D',
    preparingStatus: 'Đang chuẩn bị khung cảnh và bộ giải nén Draco.',
    readyStatus: 'Sẵn sàng khám phá khuôn viên 3D.',
    progressFallback: 'Đang đồng bộ dữ liệu...',
    errorStatus: 'Không thể hiển thị mô hình',
    errorTitle: 'Sự cố tải dữ liệu',
    modelLoadError:
      'Không thể tải file GLB. Hãy kiểm tra lại đường dẫn model hoặc xuất lại asset.',
    decoderLoadError:
      'Bộ giải nén Draco chưa sẵn sàng. Hãy kiểm tra thư mục public/draco trước khi deploy.',
    resetButton: 'Reset góc nhìn',
    autoRotateOn: 'Tự xoay: Bật',
    autoRotateOff: 'Tự xoay: Tắt'
  }
};

