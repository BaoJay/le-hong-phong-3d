import "./styles.css";
import { BUILDINGS } from "./data/buildings";
import { createInfoPanel } from "./ui/info-panel";
import { formatFileSize } from "./utils/format";
import { viewerConfig } from "./config/viewer-config";
import { createViewer } from "./viewer/createViewer";

// ── DOM queries ───────────────────────────────────────────────────────────────
function requireElement<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id) as T | null;
  if (!el) throw new Error(`Missing required DOM element: #${id}`);
  return el;
}

const app             = requireElement("app");
const viewerStage     = requireElement("viewer-stage");
const canvas          = requireElement<HTMLCanvasElement>("viewer-canvas");
const loadingOverlay  = requireElement("viewer-loading");
const titleElement    = requireElement("school-title");
const subtitleElement = requireElement("school-subtitle");
const instructionList = requireElement<HTMLUListElement>("instruction-list");
const statusLabel     = requireElement("status-label");
const statusMessage   = requireElement("status-message");
const progressValue   = requireElement("progress-value");
const progressShell   = requireElement("progress-shell");
const progressFill    = requireElement("progress-fill");
const errorBanner     = requireElement("error-banner");

const progressTrack = progressShell.querySelector<HTMLElement>(".progress-track");
if (!progressTrack) throw new Error("Missing required DOM element: .progress-track");

// ── Initial setup ─────────────────────────────────────────────────────────────
document.title = `${viewerConfig.meta.title} | 3D Viewer`;
app.classList.add("is-loading");
titleElement.textContent = viewerConfig.meta.title;
subtitleElement.textContent = viewerConfig.meta.subtitle;
statusLabel.textContent = viewerConfig.ui.loadingStatus;
statusMessage.textContent = viewerConfig.ui.preparingStatus;
progressShell.dataset.mode = "determinate";
progressFill.style.width = "0%";
progressValue.textContent = "0%";

for (const instruction of viewerConfig.ui.instructions) {
  const li = document.createElement("li");
  li.textContent = instruction;
  instructionList.append(li);
}

app.style.setProperty("--bg-top", viewerConfig.scene.background.top);
app.style.setProperty("--bg-bottom", viewerConfig.scene.background.bottom);
app.style.setProperty("--bg-accent", viewerConfig.scene.background.accent);
app.style.setProperty("--bg-glow", viewerConfig.scene.background.glow);

// ── View state ────────────────────────────────────────────────────────────────
const startHintBtn    = document.getElementById("start-hint-btn");
const navKienTruc     = document.getElementById("nav-kien-truc");
const explorerHint    = document.getElementById("explorer-hint");
const zoomInBtn       = document.getElementById("zoom-in-btn");
const zoomOutBtn      = document.getElementById("zoom-out-btn");
const toggleRotateBtn = document.getElementById("toggle-rotate-btn");
const perspectiveBtn  = document.getElementById("perspective-btn");

function enterExplorerView() {
  if (app.classList.contains("view-explorer")) return;
  app.classList.add("view-explorer");
  navKienTruc?.classList.add("active");
  if (startHintBtn) startHintBtn.style.display = "none";
}

// ── Info panel ────────────────────────────────────────────────────────────────
const panel = createInfoPanel({
  // onClose is a notification: the panel has already closed, reset the camera.
  onClose: () => viewer.resetViewAnimated(),
  onTabSelect: (building) => selectBuilding(building),
});

function selectBuilding(building: (typeof BUILDINGS)[number]) {
  enterExplorerView();
  if (explorerHint) explorerHint.style.display = "none";
  const panelW = Math.min(680, window.innerWidth * 0.9);
  viewer.focusOnPoint(building.center, panelW / window.innerWidth);
  panel.open(building, BUILDINGS);
}

// ── Viewer ────────────────────────────────────────────────────────────────────
const viewer = createViewer({
  mount: viewerStage,
  canvas,
  config: viewerConfig,

  onObjectClick(point) {
    let nearest = BUILDINGS[0];
    let minDist = Infinity;
    for (const b of BUILDINGS) {
      const dx = point[0] - b.center[0];
      const dy = point[1] - b.center[1];
      const dz = point[2] - b.center[2];
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < minDist) { minDist = dist; nearest = b; }
    }
    selectBuilding(nearest);
  },

  onEmptyClick() {
    enterExplorerView();
    if (panel.isOpen) {
      panel.close();
      viewer.resetViewAnimated();
    }
  },

  onProgress({ progress, loaded, total }) {
    statusLabel.textContent = viewerConfig.ui.loadingStatus;
    progressShell.hidden = false;
    progressValue.hidden = false;

    if (progress === null) {
      progressShell.dataset.mode = "indeterminate";
      progressFill.style.width = "45%";
      progressValue.textContent = "...";
      progressTrack.removeAttribute("aria-valuenow");
      progressTrack.setAttribute("aria-valuetext", viewerConfig.ui.progressFallback);
      statusMessage.textContent = `Đã nhận ${formatFileSize(loaded)} dữ liệu từ model.`;
      return;
    }

    progressShell.dataset.mode = "determinate";
    const percent = Math.round(progress * 100);
    progressFill.style.width = `${percent}%`;
    progressValue.textContent = `${percent}%`;
    progressTrack.setAttribute("aria-valuenow", String(percent));
    progressTrack.removeAttribute("aria-valuetext");
    statusMessage.textContent = total > 0
      ? `Đã tải ${formatFileSize(loaded)} / ${formatFileSize(total)} dữ liệu.`
      : viewerConfig.ui.preparingStatus;
  },

  onStatusChange(status) {
    if (status === "loading") {
      app.classList.add("is-loading");
      app.classList.remove("is-loaded", "is-load-error");
      loadingOverlay.setAttribute("aria-busy", "true");
      progressShell.hidden = false;
      progressValue.hidden = false;
      errorBanner.hidden = true;
      return;
    }
    if (status === "ready") {
      app.classList.remove("is-loading", "is-load-error");
      app.classList.add("is-loaded");
      loadingOverlay.setAttribute("aria-busy", "false");
      statusLabel.textContent = viewerConfig.ui.readyStatus;
      statusMessage.textContent =
        "Dùng các nút điều khiển hoặc thao tác trực tiếp trên mô hình để quan sát bố cục khuôn viên.";
      progressValue.textContent = "100%";
      progressFill.style.width = "100%";
      errorBanner.hidden = true;
      return;
    }
    if (status === "error") {
      app.classList.remove("is-loading", "is-loaded");
      app.classList.add("is-load-error");
      loadingOverlay.setAttribute("aria-busy", "false");
      statusLabel.textContent = viewerConfig.ui.errorStatus;
      progressShell.hidden = true;
      progressValue.hidden = true;
    }
  },

  onError(message) {
    errorBanner.hidden = false;
    errorBanner.textContent = `${viewerConfig.ui.errorTitle}: ${message}`;
    statusMessage.textContent =
      "Kiểm tra asset trong thư mục public/models hoặc chạy lại npm install để đồng bộ bộ giải mã.";
  },
});

// ── Controls ──────────────────────────────────────────────────────────────────
zoomInBtn?.addEventListener("click", () => viewer.zoomIn());
zoomOutBtn?.addEventListener("click", () => viewer.zoomOut());

toggleRotateBtn?.addEventListener("click", () =>
  viewer.setAutoRotate(!viewer.isAutoRotateEnabled()));

perspectiveBtn?.addEventListener("click", () => {
  if (panel.isOpen) panel.close();
  viewer.resetViewAnimated();
});

// Any click anywhere enters explorer mode on the first interaction.
app.addEventListener("click", () => enterExplorerView(), { once: true });

startHintBtn?.addEventListener("click", enterExplorerView);
navKienTruc?.addEventListener("click", (e) => {
  e.preventDefault();
  enterExplorerView();
});

// ── 3D label tracking ─────────────────────────────────────────────────────────
const labelDefs = BUILDINGS.flatMap((b) => {
  const el = document.getElementById(b.labelId);
  return el ? [{ el, pos: b.labelPos, building: b }] : [];
});

viewer.setLabels(labelDefs.map(({ el, pos }) => ({ el, pos })));

for (const { el, building } of labelDefs) {
  el.style.cursor = "pointer";
  el.style.pointerEvents = "auto";
  el.addEventListener("click", () => selectBuilding(building));
}

// ── Load ──────────────────────────────────────────────────────────────────────
void viewer.load().catch(() => {
  // Errors are mapped to the UI layer via onError / onStatusChange.
});

window.addEventListener("beforeunload", () => viewer.destroy());
