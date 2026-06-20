import type { ViewerConfig } from "../viewer/types";

const baseUrl = import.meta.env.BASE_URL;

export const viewerConfig: ViewerConfig = {
  meta: {
    title: "Trường THPT Chuyên Lê Hồng Phong",
    subtitle: "Dự án kỉ niệm 100 năm LHP",
  },
  model: {
    src: `${baseUrl}models/LHP100_20260607_pk.glb`,
    fitPadding: 1.45,
    initialRotation: [0, 0, 0],
    initialScale: 1,
    enableGround: true,
    enableShadows: true,
    edges: {
      enabled: true,
      color: "#2f2f2f",
      opacity: 0.5,
      thresholdAngle: 12,
    },
  },
  draco: {
    decoderPath: `${baseUrl}draco/`,
  },
  scene: {
    background: {
      top: "#e9e9e9",
      bottom: "#dcdcdc",
      accent: "#d0d0d0",
      glow: "#e9e9e9",
    },
    fogColor: "#efefef",
    groundColor: "#e0e0e0",
    lights: {
      ambientIntensity: 0.45,
      hemisphereIntensity: 0.25,
      directionalIntensity: 2.4,
      sketchUpSunDirection: [-0.383216, -0.494039, 0.78043],
    },
  },
  camera: {
    fov: 42,
    near: 0.1,
    far: 2500,
    fitDirection: [1.25, 0.72, 1.4],
  },
  controls: {
    autoRotate: true,
    autoRotateSpeed: 0.8,
    enablePan: true,
    dampingFactor: 0.06,
    stopAutoRotateOnInteract: true,
  },
  debug: {
    showWorldAxes: false,
    worldAxesSize: 40,
    worldAxesPosition: [0, 0, 0],
    worldAxesColors: ["#ff2f2f", "#2f72ff", "#2fbf5b"],
  },
  ui: {
    instructions: [
      "Kéo chuột hoặc chạm để xoay góc nhìn quanh toàn bộ khuôn viên.",
      "Dùng con lăn hoặc thao tác pinch để tiến gần các khối nhà và sân trường.",
      "Giữ chuột phải hoặc kéo hai ngón để dịch khung nhìn theo hành lang và mặt đứng.",
    ],
    loadingStatus: "Đang mở hồ sơ 3D",
    preparingStatus: "Đang chuẩn bị khung cảnh, ánh sáng và bộ giải nén Draco.",
    readyStatus: "Sẵn sàng tham quan khuôn viên.",
    progressFallback: "Đang đồng bộ tư liệu số...",
    errorStatus: "Không thể hiển thị khuôn viên",
    errorTitle: "Sự cố tải mô hình",
    modelLoadError:
      "Không thể tải file GLB. Hãy kiểm tra lại đường dẫn model hoặc xuất lại asset.",
    decoderLoadError:
      "Bộ giải nén Draco chưa sẵn sàng. Hãy kiểm tra thư mục public/draco trước khi deploy.",
    resetButton: "Đặt lại góc nhìn",
    autoRotateOn: "Tự xoay: Bật",
    autoRotateOff: "Tự xoay: Tắt",
  },
};
