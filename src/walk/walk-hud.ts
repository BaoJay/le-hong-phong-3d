import "./walk.css";
import { MathUtils } from "three";
import { createWalkInput } from "./walk-input";
import type { WalkInput } from "./walk-input";
import type { WalkPose } from "./walk-controller";

export interface WalkHudOptions {
  mount: HTMLElement;
  onExit: () => void;
  /** Hiện toạ độ chân + hướng nhìn (bật bằng `?walkdebug`). */
  debug?: boolean;
}

export interface WalkHud {
  readonly input: WalkInput;
  readonly element: HTMLElement;
  /** Hiện HUD ở trạng thái "đang chuẩn bị" (dựng va chạm, bay camera xuống). */
  showPreparing(): void;
  /** Camera đã tới mặt đất: cho phép điều khiển. */
  activate(): void;
  hide(): void;
  setPose(pose: WalkPose): void;
  dispose(): void;
}

const COARSE_POINTER = "(pointer: coarse)";

/**
 * Lớp giao diện của chế độ đi bộ: bề mặt nhận input, tâm ngắm, joystick ảo,
 * thẻ hướng dẫn / tạm dừng và nút rời khỏi. Không biết gì về Three.js scene.
 */
export function createWalkHud({ mount, onExit, debug = false }: WalkHudOptions): WalkHud {
  const root = document.createElement("div");
  root.className = "walk-hud";
  root.hidden = true;
  root.innerHTML = `
    <div class="walk-surface" aria-hidden="true"></div>
    <div class="walk-crosshair" aria-hidden="true"></div>
    <div class="walk-joystick" aria-hidden="true"><span class="walk-joystick__knob"></span></div>
    <button class="walk-jump" type="button">Nhảy</button>
    <div class="walk-topbar">
      <p class="walk-topbar__title">Đi bộ trong khuôn viên</p>
      <button class="walk-exit" type="button">
        <span>Rời khỏi</span><kbd class="walk-kbd walk-only-fine">Esc</kbd>
      </button>
    </div>
    <p class="walk-toast" role="status" aria-live="polite"></p>
    <div class="walk-card" role="dialog" aria-modal="false" aria-labelledby="walk-card-title">
      <h2 class="walk-card__title" id="walk-card-title">Đi bộ trong khuôn viên</h2>
      <ul class="walk-card__keys walk-only-fine">
        <li><span><kbd class="walk-kbd">W</kbd><kbd class="walk-kbd">A</kbd><kbd class="walk-kbd">S</kbd><kbd class="walk-kbd">D</kbd></span>Di chuyển</li>
        <li><span><kbd class="walk-kbd">Chuột</kbd></span>Nhìn xung quanh</li>
        <li><span><kbd class="walk-kbd">Shift</kbd></span>Đi nhanh</li>
        <li><span><kbd class="walk-kbd">Space</kbd></span>Nhảy</li>
        <li><span><kbd class="walk-kbd">R</kbd></span>Về điểm xuất phát</li>
        <li><span><kbd class="walk-kbd">Esc</kbd></span>Tạm dừng · nhấn lần nữa để rời khỏi</li>
      </ul>
      <ul class="walk-card__keys walk-only-coarse">
        <li><span class="walk-card__touch">Trái</span>Kéo để di chuyển</li>
        <li><span class="walk-card__touch">Phải</span>Kéo để nhìn xung quanh</li>
        <li><span class="walk-card__touch">Nhảy</span>Chạm nút để nhảy qua gờ</li>
      </ul>
      <button class="walk-card__start" type="button">Bắt đầu</button>
    </div>
    <pre class="walk-debug" hidden></pre>
  `;
  mount.appendChild(root);

  const surface = query(".walk-surface");
  const card = query(".walk-card");
  const cardTitle = query(".walk-card__title");
  const startButton = query<HTMLButtonElement>(".walk-card__start");
  const exitButton = query<HTMLButtonElement>(".walk-exit");
  const toast = query(".walk-toast");
  const debugPanel = query<HTMLPreElement>(".walk-debug");
  const coarseQuery = window.matchMedia(COARSE_POINTER);

  let active = false;
  let hasStarted = false;
  let lastPose: WalkPose | null = null;
  let toastTimer = 0;

  const input = createWalkInput({
    surface,
    joystickBase: query(".walk-joystick"),
    joystickKnob: query(".walk-joystick__knob"),
    onPointerLockChange(locked) {
      if (!active) return;
      root.classList.toggle("is-locked", locked);
      if (locked) {
        hasStarted = true;
        setCard(false);
      } else if (!coarseQuery.matches) {
        // Esc nhả khoá chuột: hiện thẻ tạm dừng; Esc lần nữa sẽ rời khỏi.
        cardTitle.textContent = "Đã tạm dừng";
        startButton.textContent = "Tiếp tục";
        setCard(true);
      }
    },
    onEscape() {
      if (active) onExit();
    },
  });

  startButton.addEventListener("click", () => {
    hasStarted = true;
    setCard(false);
    if (!coarseQuery.matches) input.requestPointerLock();
  });
  exitButton.addEventListener("click", () => onExit());
  // pointerdown thay vì click: nhảy ngay khi chạm, không chờ nhấc ngón tay.
  query(".walk-jump").addEventListener("pointerdown", (event) => {
    event.preventDefault();
    input.jump();
  });

  const onDebugKey = (event: KeyboardEvent) => {
    if (!debug || !active || event.code !== "KeyC" || !lastPose) return;
    const text = formatPoseSnippet(lastPose);
    void navigator.clipboard?.writeText(text).then(
      () => flash("Đã chép toạ độ vào clipboard"),
      () => flash(text),
    );
    console.info("[walk] pose", text);
  };
  window.addEventListener("keydown", onDebugKey);

  function query<T extends HTMLElement = HTMLElement>(selector: string): T {
    const el = root.querySelector<T>(selector);
    if (!el) throw new Error(`Walk HUD: missing ${selector}`);
    return el;
  }

  function setCard(visible: boolean) {
    card.hidden = !visible;
    root.classList.toggle("has-card", visible);
    input.setPaused(visible);
  }

  function flash(message: string, durationMs = 2200) {
    toast.textContent = message;
    toast.classList.add("is-visible");
    window.clearTimeout(toastTimer);
    if (durationMs > 0) {
      toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), durationMs);
    }
  }

  return {
    input,
    element: root,
    showPreparing() {
      root.hidden = false;
      root.classList.add("is-preparing");
      root.classList.remove("is-locked");
      setCard(false);
      debugPanel.hidden = true;
      flash("Đang chuẩn bị lối đi…", 0);
    },
    activate() {
      active = true;
      root.hidden = false;
      root.classList.remove("is-preparing");
      toast.classList.remove("is-visible");
      debugPanel.hidden = !debug;
      input.setEnabled(true);
      if (!hasStarted) {
        cardTitle.textContent = "Đi bộ trong khuôn viên";
        startButton.textContent = "Bắt đầu";
        setCard(true);
        startButton.focus({ preventScroll: true });
      } else if (coarseQuery.matches) {
        setCard(false);
      } else {
        cardTitle.textContent = "Đi bộ trong khuôn viên";
        startButton.textContent = "Tiếp tục";
        setCard(true);
      }
    },
    hide() {
      active = false;
      input.setEnabled(false);
      root.classList.remove("is-locked", "is-preparing");
      setCard(false);
      toast.classList.remove("is-visible");
      root.hidden = true;
    },
    setPose(pose) {
      lastPose = pose;
      if (!debug) return;
      const { feet } = pose;
      debugPanel.textContent =
        `x ${feet.x.toFixed(2)}  y ${feet.y.toFixed(2)}  z ${feet.z.toFixed(2)}\n` +
        `yaw ${MathUtils.radToDeg(pose.yaw).toFixed(0)}°  pitch ${MathUtils.radToDeg(pose.pitch).toFixed(0)}°  ` +
        `${pose.onGround ? "trên sàn" : "đang rơi"}\n` +
        `C: chép toạ độ`;
    },
    dispose() {
      window.clearTimeout(toastTimer);
      window.removeEventListener("keydown", onDebugKey);
      input.dispose();
      root.remove();
    },
  };
}

function formatPoseSnippet(pose: WalkPose) {
  const { feet, yaw } = pose;
  const r = (n: number) => Number(n.toFixed(2));
  // Điểm nhìn cách 5 m theo hướng hiện tại, dán thẳng vào `walk.spawnLookAt`.
  const look = [r(feet.x - Math.sin(yaw) * 5), r(feet.y + 1.6), r(feet.z - Math.cos(yaw) * 5)];
  return `spawn: [${r(feet.x)}, ${r(feet.y)}, ${r(feet.z)}], spawnLookAt: [${look.join(", ")}]`;
}
