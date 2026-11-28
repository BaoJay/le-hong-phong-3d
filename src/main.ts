import "./styles.css";
import { inject } from "@vercel/analytics";
import { BUILDINGS } from "./data/buildings";
import { createInfoPanel } from "./ui/info-panel";
import { formatFileSize } from "./utils/format";
import { viewerConfig } from "./config/viewer-config";
import { createViewer } from "./viewer/createViewer";
import { createOnboarding } from "./onboarding/createOnboarding";
import type { WalkHud } from "./walk/walk-hud";

inject();

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
app.classList.add("is-loading", "is-onboarding");
statusLabel.textContent = viewerConfig.ui.loadingStatus;
statusMessage.textContent = viewerConfig.ui.preparingStatus;
progressShell.dataset.mode = "determinate";
progressFill.style.width = "0%";
progressValue.textContent = "0%";

app.style.setProperty("--bg-top", viewerConfig.scene.background.top);
app.style.setProperty("--bg-bottom", viewerConfig.scene.background.bottom);
app.style.setProperty("--bg-accent", viewerConfig.scene.background.accent);
app.style.setProperty("--bg-glow", viewerConfig.scene.background.glow);

// ── View state ────────────────────────────────────────────────────────────────
const startHintBtn    = document.getElementById("start-hint-btn");
const navKienTruc     = document.getElementById("nav-kien-truc");
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

const DEBUG = new URLSearchParams(location.search).has("debug");
// Info panel (src/ui/info-panel.ts) đang tạm ẩn; code panel giữ nguyên để mở lại sau.
const ENABLE_BUILDING_CLICK_PANEL = false as boolean;

// ── Info panel ────────────────────────────────────────────────────────────────
const panel = createInfoPanel({
  // onClose is a notification: the panel has already closed, reset the camera.
  onClose: () => viewer.resetViewAnimated(),
  onTabSelect: (building) => selectBuilding(building),
});

function selectBuilding(building: (typeof BUILDINGS)[number]) {
  enterExplorerView();
  const panelW = Math.min(680, window.innerWidth * 0.9);
  viewer.focusOnPoint(building.center, panelW / window.innerWidth);
  panel.open(building, BUILDINGS);
}

// ── Onboarding intro ──────────────────────────────────────────────────────────
// Plays over the whole viewport while the ~18.5 MB campus GLB downloads. The
// year counter (1927 → 2027) is driven by the real download progress, so it
// only lands on 2027 once the model is actually on screen behind it.
const onboarding = createOnboarding({
  onComplete: () => {
    // Called as the intro starts its cross-fade, so the page enters in sync.
    app.classList.remove("is-onboarding");
  },
  onRetry: () => {
    void viewer.load().catch(() => {
      // Errors are mapped to the UI layer via onError / onStatusChange.
    });
  },
  baseUrl: import.meta.env.BASE_URL,
});

// ── Viewer ────────────────────────────────────────────────────────────────────
const viewer = createViewer({
  mount: viewerStage,
  canvas,
  config: viewerConfig,

  onObjectClick(point) {
    if (DEBUG) console.info("[debug] click:", `[${point.map((n) => Math.round(n)).join(", ")}]`);
    enterExplorerView();
    // TẠM TẮT: click model → chọn khu gần nhất + mở info panel. Bật lại: đổi thành true.
    // Hiện chỉ dùng menu bar phía dưới để bay camera tới từng khu.
    if (!ENABLE_BUILDING_CLICK_PANEL) return;
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
    onboarding.setProgress({ progress, loaded, total });
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
      onboarding.setModelReady();
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
    onboarding.setModelError(message);
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

// ── Walk mode (first-person prototype) ───────────────────────────────────────
const walkBtn = document.getElementById("walk-btn");
// HUD + vật lý va chạm chỉ được tải khi người dùng bấm nút đi bộ lần đầu.
let walkHud: WalkHud | null = null;
let walkStarting = false;

async function getWalkHud(): Promise<WalkHud> {
  if (walkHud) return walkHud;
  const { createWalkHud } = await import("./walk/walk-hud");
  walkHud ??= createWalkHud({
    mount: app,
    onExit: () => void leaveWalkMode(),
    debug: new URLSearchParams(window.location.search).has("walkdebug"),
  });
  return walkHud;
}

async function startWalkMode() {
  if (walkStarting || viewer.isWalkMode() || !app.classList.contains("is-loaded")) return;
  walkStarting = true;
  try {
    await runWalkMode();
  } finally {
    walkStarting = false;
  }
}

async function runWalkMode() {
  enterExplorerView();
  if (panel.isOpen) panel.close();
  app.classList.add("view-walk");
  let hud: WalkHud;
  try {
    hud = await getWalkHud();
  } catch (error) {
    console.error("[walk] Không tải được module đi bộ", error);
    app.classList.remove("view-walk");
    return;
  }
  hud.showPreparing();
  // Cho HUD kịp vẽ "Đang chuẩn bị…" trước khi dựng BVH (chặn main thread).
  await nextFrame();
  await nextFrame();
  try {
    const entered = await viewer.enterWalkMode(hud.input, (pose) => hud.setPose(pose));
    if (entered) hud.activate();
  } catch (error) {
    console.error("[walk] Không vào được chế độ đi bộ", error);
    hud.hide();
    app.classList.remove("view-walk");
  }
}

async function leaveWalkMode() {
  if (!viewer.isWalkMode()) return;
  walkHud?.hide();
  await viewer.exitWalkMode();
  app.classList.remove("view-walk");
  walkBtn?.focus({ preventScroll: true });
}

function nextFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

walkBtn?.addEventListener("click", (event) => {
  event.stopPropagation();
  void startWalkMode();
});

// ── Bottom zone menu: fly the camera only, no info panel ─────────────────────
const zoneMenu = requireElement("zone-menu");

for (const building of BUILDINGS) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "zone-bar__item";
  btn.textContent = building.label;
  btn.setAttribute("aria-pressed", "false");
  btn.addEventListener("click", () => {
    if (panel.isOpen) panel.close();
    zoneMenu.querySelector("[aria-pressed='true']")?.setAttribute("aria-pressed", "false");
    btn.setAttribute("aria-pressed", "true");
    viewer.focusOnPoint(building.center, 0, true);
  });
  zoneMenu.appendChild(btn);
}

// ── Debug: show each building's center point (open with ?debug) ──────────────
if (DEBUG) {
  const overlay = requireElement("explorer-overlay");
  viewer.setLabels(
    BUILDINGS.map((b) => {
      const el = document.createElement("div");
      el.style.cssText =
        "position:fixed;transform:translate(-5px,-5px);font:11px monospace;color:#c00;white-space:nowrap;pointer-events:none;z-index:3";
      el.innerHTML = `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#e00;border:2px solid #fff;vertical-align:middle"></span> ${b.label} [${b.center.join(", ")}]`;
      overlay.appendChild(el);
      return { el, pos: b.center };
    }),
  );
  viewer.showDebugGuides(BUILDINGS.map((b) => b.center));
}

// ── Load ──────────────────────────────────────────────────────────────────────
void viewer.load().catch(() => {
  // Errors are mapped to the UI layer via onError / onStatusChange.
});

window.addEventListener("beforeunload", () => {
  walkHud?.dispose();
  viewer.destroy();
});
