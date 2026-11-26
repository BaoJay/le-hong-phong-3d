import type { ViewerConfig } from "../viewer/types";
import { modelAsset } from "./model-asset";

const baseUrl = import.meta.env.BASE_URL;

export const viewerConfig: ViewerConfig = {
  meta: {
    title: "Trường THPT Chuyên Lê Hồng Phong",
    subtitle: "Dự án kỉ niệm 100 năm LHP",
  },
  model: {
    // Model đã được tối ưu + mã hoá bởi `npm run protect:model` (xem docs/model-protection.md)
    src: `${baseUrl}${modelAsset.path}`,
    keyEndpoint: `${baseUrl}api/model-key`,
    expectedBytes: modelAsset.byteLength,
    fitPadding: 1.45,
    initialRotation: [0, 0, 0],
    // Model LHP100_20261005 xuất theo đơn vị decimet; ×0.1 để về mét như mọi toạ độ trong config.
    initialScale: 0.1,
    enableGround: true,
    enableShadows: true,
    edges: {
      enabled: true,
      color: "#2f2f2f",
      opacity: 0.5,
      thresholdAngle: 30,
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
      ambientIntensity: 1.45,
      hemisphereIntensity: 1.25,
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
    orbitTarget: [50, 0, -80], // Tâm xoay tại tim sân trường khu A
  },
  walk: {
    // Điểm xuất phát: tim sân trường khu A, nhìn về dãy nhà A.
    // Mở trang với `?walkdebug` rồi nhấn C để chép toạ độ đang đứng.
    spawn: [50, 0, -80],
    spawnLookAt: [47, 1.6, -45],
    height: 1.75,
    radius: 0.3,
    eyeHeight: 1.62,
    walkSpeed: 2.4,
    runSpeed: 5,
    gravity: -20,
    stepDown: 0.45,
    near: 0.05,
    far: 1500,
    fog: { near: 40, far: 320 },
    transitionSeconds: 1.6,
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
    modelKeyError:
      "Không thể xác thực quyền xem mô hình. Hãy tải lại trang hoặc thử lại sau.",
    decoderLoadError:
      "Bộ giải nén Draco chưa sẵn sàng. Hãy kiểm tra thư mục public/draco trước khi deploy.",
    resetButton: "Đặt lại góc nhìn",
    autoRotateOn: "Tự xoay: Bật",
    autoRotateOff: "Tự xoay: Tắt",
  },
};
