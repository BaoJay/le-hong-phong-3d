import "./styles.css";
import { viewerConfig } from "./config/viewer-config";
import { createViewer } from "./viewer/createViewer";

const app = document.querySelector<HTMLElement>("#app");
const viewerStage = document.querySelector<HTMLElement>("#viewer-stage");
const canvas = document.querySelector<HTMLCanvasElement>("#viewer-canvas");
const titleElement = document.querySelector<HTMLElement>("#school-title");
const subtitleElement = document.querySelector<HTMLElement>("#school-subtitle");
const instructionList =
  document.querySelector<HTMLUListElement>("#instruction-list");
const statusLabel = document.querySelector<HTMLElement>("#status-label");
const statusMessage = document.querySelector<HTMLElement>("#status-message");
const progressValue = document.querySelector<HTMLElement>("#progress-value");
const progressShell = document.querySelector<HTMLElement>("#progress-shell");
const progressTrack =
  progressShell?.querySelector<HTMLElement>(".progress-track");
const progressFill = document.querySelector<HTMLElement>("#progress-fill");
const errorBanner = document.querySelector<HTMLElement>("#error-banner");
const resetButton =
  document.querySelector<HTMLButtonElement>("#reset-view-button");
const autoRotateButton = document.querySelector<HTMLButtonElement>(
  "#toggle-auto-rotate-button",
);

if (
  !app ||
  !viewerStage ||
  !canvas ||
  !titleElement ||
  !subtitleElement ||
  !instructionList ||
  !statusLabel ||
  !statusMessage ||
  !progressValue ||
  !progressShell ||
  !progressTrack ||
  !progressFill ||
  !errorBanner ||
  !resetButton ||
  !autoRotateButton
) {
  throw new Error(
    "Không thể khởi tạo giao diện viewer vì thiếu phần tử DOM bắt buộc.",
  );
}

document.title = `${viewerConfig.meta.title} | 3D Viewer`;

titleElement.textContent = viewerConfig.meta.title;
subtitleElement.textContent = viewerConfig.meta.subtitle;
statusLabel.textContent = viewerConfig.ui.loadingStatus;
statusMessage.textContent = viewerConfig.ui.preparingStatus;
resetButton.textContent = viewerConfig.ui.resetButton;

for (const instruction of viewerConfig.ui.instructions) {
  const item = document.createElement("li");
  item.textContent = instruction;
  instructionList.append(item);
}

applyTheme();

const viewer = createViewer({
  mount: viewerStage,
  canvas,
  config: viewerConfig,
  onProgress: ({ progress, loaded, total }) => {
    statusLabel.textContent = viewerConfig.ui.loadingStatus;

    if (progress === null) {
      progressShell.dataset.mode = "indeterminate";
      progressFill.style.width = "45%";
      progressValue.textContent = viewerConfig.ui.progressFallback;
      progressTrack.setAttribute(
        "aria-valuetext",
        viewerConfig.ui.progressFallback,
      );
      statusMessage.textContent = `Đã nhận ${formatFileSize(loaded)} dữ liệu từ model.`;
      return;
    }

    progressShell.dataset.mode = "determinate";

    const percent = Math.round(progress * 100);
    progressFill.style.width = `${percent}%`;
    progressValue.textContent = `${percent}%`;
    progressTrack.setAttribute("aria-valuenow", String(percent));
    statusMessage.textContent =
      total > 0
        ? `Đã tải ${formatFileSize(loaded)} / ${formatFileSize(total)} dữ liệu.`
        : viewerConfig.ui.preparingStatus;
  },
  onStatusChange: (status) => {
    if (status === "ready") {
      statusLabel.textContent = viewerConfig.ui.readyStatus;
      statusMessage.textContent =
        "Dùng các nút điều khiển hoặc thao tác trực tiếp trên mô hình để quan sát bố cục khuôn viên.";
      progressShell.hidden = true;
      progressValue.textContent = "100%";
      progressFill.style.width = "100%";
      errorBanner.hidden = true;
      return;
    }

    if (status === "error") {
      statusLabel.textContent = viewerConfig.ui.errorStatus;
      progressShell.hidden = true;
    }
  },
  onError: (message) => {
    errorBanner.hidden = false;
    errorBanner.textContent = `${viewerConfig.ui.errorTitle}: ${message}`;
    statusMessage.textContent =
      "Kiểm tra asset trong thư mục public/models hoặc chạy lại npm install để đồng bộ bộ giải mã.";
  },
  onAutoRotateChange: (enabled) => {
    autoRotateButton.textContent = enabled
      ? viewerConfig.ui.autoRotateOn
      : viewerConfig.ui.autoRotateOff;
  },
});

autoRotateButton.textContent = viewer.isAutoRotateEnabled()
  ? viewerConfig.ui.autoRotateOn
  : viewerConfig.ui.autoRotateOff;

resetButton.addEventListener("click", () => {
  viewer.resetView();
});

autoRotateButton.addEventListener("click", () => {
  viewer.setAutoRotate(!viewer.isAutoRotateEnabled());
});

window.addEventListener("beforeunload", () => {
  viewer.destroy();
});

void viewer.load().catch(() => {
  // Errors are already mapped to the UI layer.
});

function applyTheme() {
  app.style.setProperty("--bg-top", viewerConfig.scene.background.top);
  app.style.setProperty("--bg-bottom", viewerConfig.scene.background.bottom);
  app.style.setProperty("--bg-accent", viewerConfig.scene.background.accent);
  app.style.setProperty("--bg-glow", viewerConfig.scene.background.glow);
}

function formatFileSize(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  const digits = unitIndex === 0 ? 0 : 1;
  return `${size.toFixed(digits)} ${units[unitIndex]}`;
}
