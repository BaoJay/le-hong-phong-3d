import type { WalkInputSource } from "./walk-controller";

export interface WalkInputOptions {
  /** Phần tử phủ toàn màn hình nhận chuột/cảm ứng. */
  surface: HTMLElement;
  joystickBase: HTMLElement;
  joystickKnob: HTMLElement;
  /** Radian trên mỗi pixel chuột. */
  mouseSensitivity?: number;
  /** Radian trên mỗi pixel kéo bằng ngón tay. */
  touchSensitivity?: number;
  onPointerLockChange?: (locked: boolean) => void;
  onEscape?: () => void;
}

export interface WalkInput extends WalkInputSource {
  setEnabled(enabled: boolean): void;
  /** Tạm dừng: bỏ qua di chuyển / nhìn, nhưng vẫn nhận Esc để thoát. */
  setPaused(paused: boolean): void;
  requestPointerLock(): void;
  exitPointerLock(): void;
  isPointerLocked(): boolean;
  dispose(): void;
}

const FORWARD_KEYS = new Set(["KeyW", "ArrowUp"]);
const BACK_KEYS = new Set(["KeyS", "ArrowDown"]);
const LEFT_KEYS = new Set(["KeyA", "ArrowLeft"]);
const RIGHT_KEYS = new Set(["KeyD", "ArrowRight"]);
const RUN_KEYS = new Set(["ShiftLeft", "ShiftRight"]);
const HANDLED_KEYS = new Set([
  ...FORWARD_KEYS, ...BACK_KEYS, ...LEFT_KEYS, ...RIGHT_KEYS, ...RUN_KEYS,
  "KeyR", "Space",
]);

const JOYSTICK_RADIUS_PX = 52;
/** Vùng bên trái màn hình (tỉ lệ bề ngang) dành cho joystick di chuyển. */
const JOYSTICK_ZONE = 0.45;
/** Chrome đôi khi trả movementX cực lớn khi vừa khoá chuột; bỏ các cú giật đó. */
const MAX_MOUSE_STEP_PX = 250;
/** Phím Esc vừa nhả khoá chuột không được tính là "thoát" luôn. */
const ESC_GRACE_MS = 400;

/**
 * Gom input bàn phím, chuột (pointer lock hoặc kéo-để-nhìn) và cảm ứng
 * (joystick ảo bên trái, kéo-để-nhìn bên phải) thành một `WalkInputSource`.
 */
export function createWalkInput({
  surface,
  joystickBase,
  joystickKnob,
  mouseSensitivity = 0.0022,
  touchSensitivity = 0.005,
  onPointerLockChange,
  onEscape,
}: WalkInputOptions): WalkInput {
  const keys = new Set<string>();
  const move = { x: 0, z: 0 };
  let lookYaw = 0;
  let lookPitch = 0;
  let respawn = false;
  let enabled = false;
  let paused = false;
  let lockFailed = false;
  let lastUnlockAt = -Infinity;

  let joystickId: number | null = null;
  let joystickOriginX = 0;
  let joystickOriginY = 0;
  let joyX = 0;
  let joyZ = 0;

  let lookId: number | null = null;
  let lookLastX = 0;
  let lookLastY = 0;
  let lookSensitivity = touchSensitivity;

  function recomputeMove() {
    const keyX = (anyPressed(RIGHT_KEYS) ? 1 : 0) - (anyPressed(LEFT_KEYS) ? 1 : 0);
    const keyZ = (anyPressed(FORWARD_KEYS) ? 1 : 0) - (anyPressed(BACK_KEYS) ? 1 : 0);
    let x = keyX + joyX;
    let z = keyZ + joyZ;
    const length = Math.hypot(x, z);
    if (length > 1) {
      x /= length;
      z /= length;
    }
    move.x = x;
    move.z = z;
  }

  function anyPressed(set: Set<string>) {
    for (const code of set) if (keys.has(code)) return true;
    return false;
  }

  function isLocked() {
    return document.pointerLockElement === surface;
  }

  // ── Keyboard ──────────────────────────────────────────────────────────────
  function onKeyDown(event: KeyboardEvent) {
    if (!enabled || event.defaultPrevented) return;
    if (event.key === "Escape") {
      if (!isLocked() && performance.now() - lastUnlockAt > ESC_GRACE_MS) {
        onEscape?.();
      }
      return;
    }
    if (!HANDLED_KEYS.has(event.code)) return;
    event.preventDefault();
    if (paused) return;
    if (event.code === "KeyR" && !event.repeat) respawn = true;
    keys.add(event.code);
    recomputeMove();
  }

  function onKeyUp(event: KeyboardEvent) {
    if (!keys.delete(event.code)) return;
    recomputeMove();
  }

  // ── Mouse / touch ─────────────────────────────────────────────────────────
  function onPointerDown(event: PointerEvent) {
    if (!enabled || paused) return;

    if (event.pointerType === "mouse") {
      if (event.button !== 0 || isLocked()) return;
      if (!lockFailed) {
        requestPointerLock();
        return;
      }
      // Không khoá được chuột (iframe, trình duyệt chặn): kéo để nhìn.
      startLook(event, mouseSensitivity);
      return;
    }

    const rect = surface.getBoundingClientRect();
    const inJoystickZone = event.clientX - rect.left < rect.width * JOYSTICK_ZONE;
    if (inJoystickZone && joystickId === null) {
      joystickId = event.pointerId;
      joystickOriginX = event.clientX;
      joystickOriginY = event.clientY;
      joystickBase.style.left = `${event.clientX - rect.left}px`;
      joystickBase.style.top = `${event.clientY - rect.top}px`;
      joystickBase.classList.add("is-active");
      setKnob(0, 0);
      surface.setPointerCapture(event.pointerId);
    } else if (lookId === null) {
      startLook(event, touchSensitivity);
    }
  }

  function startLook(event: PointerEvent, sensitivity: number) {
    lookId = event.pointerId;
    lookLastX = event.clientX;
    lookLastY = event.clientY;
    lookSensitivity = sensitivity;
    surface.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent) {
    if (event.pointerId === joystickId) {
      let dx = event.clientX - joystickOriginX;
      let dy = event.clientY - joystickOriginY;
      const length = Math.hypot(dx, dy);
      if (length > JOYSTICK_RADIUS_PX) {
        dx = (dx / length) * JOYSTICK_RADIUS_PX;
        dy = (dy / length) * JOYSTICK_RADIUS_PX;
      }
      setKnob(dx, dy);
      joyX = dx / JOYSTICK_RADIUS_PX;
      joyZ = -dy / JOYSTICK_RADIUS_PX;
      recomputeMove();
      return;
    }
    if (event.pointerId === lookId) {
      lookYaw += (event.clientX - lookLastX) * lookSensitivity;
      lookPitch += (event.clientY - lookLastY) * lookSensitivity;
      lookLastX = event.clientX;
      lookLastY = event.clientY;
    }
  }

  function onPointerEnd(event: PointerEvent) {
    if (event.pointerId === joystickId) {
      joystickId = null;
      joyX = 0;
      joyZ = 0;
      joystickBase.classList.remove("is-active");
      recomputeMove();
    }
    if (event.pointerId === lookId) lookId = null;
  }

  function setKnob(dx: number, dy: number) {
    joystickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }

  function onMouseMove(event: MouseEvent) {
    if (!enabled || paused || !isLocked()) return;
    const dx = event.movementX;
    const dy = event.movementY;
    if (Math.abs(dx) > MAX_MOUSE_STEP_PX || Math.abs(dy) > MAX_MOUSE_STEP_PX) return;
    lookYaw += dx * mouseSensitivity;
    lookPitch += dy * mouseSensitivity;
  }

  // ── Pointer lock ──────────────────────────────────────────────────────────
  function requestPointerLock() {
    if (!surface.requestPointerLock) {
      lockFailed = true;
      return;
    }
    try {
      const result = surface.requestPointerLock() as unknown;
      if (result instanceof Promise) {
        result.catch(() => {
          // Bị chặn hoặc gọi quá sớm sau khi vừa nhả khoá: lần sau thử lại.
        });
      }
    } catch {
      lockFailed = true;
    }
  }

  function onPointerLockChangeEvent() {
    const locked = isLocked();
    if (!locked) lastUnlockAt = performance.now();
    onPointerLockChange?.(locked);
  }

  function onPointerLockError() {
    lockFailed = true;
    onPointerLockChange?.(false);
  }

  function reset() {
    keys.clear();
    joystickId = null;
    lookId = null;
    joyX = 0;
    joyZ = 0;
    joystickBase.classList.remove("is-active");
    recomputeMove();
  }

  function onVisibilityChange() {
    if (document.hidden) reset();
  }

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", reset);
  document.addEventListener("visibilitychange", onVisibilityChange);
  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("pointerlockchange", onPointerLockChangeEvent);
  document.addEventListener("pointerlockerror", onPointerLockError);
  surface.addEventListener("pointerdown", onPointerDown);
  surface.addEventListener("pointermove", onPointerMove);
  surface.addEventListener("pointerup", onPointerEnd);
  surface.addEventListener("pointercancel", onPointerEnd);
  surface.addEventListener("contextmenu", preventDefault);

  return {
    move,
    get running() {
      return anyPressed(RUN_KEYS);
    },
    consumeLook() {
      const look = { yaw: lookYaw, pitch: lookPitch };
      lookYaw = 0;
      lookPitch = 0;
      return look;
    },
    consumeRespawn() {
      const value = respawn;
      respawn = false;
      return value;
    },
    setEnabled(next) {
      enabled = next;
      if (!next) {
        reset();
        lookYaw = 0;
        lookPitch = 0;
        if (isLocked()) document.exitPointerLock();
      }
    },
    setPaused(next) {
      paused = next;
      if (next) reset();
    },
    requestPointerLock,
    exitPointerLock() {
      if (isLocked()) document.exitPointerLock();
    },
    isPointerLocked: isLocked,
    dispose() {
      enabled = false;
      if (isLocked()) document.exitPointerLock();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", reset);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("pointerlockchange", onPointerLockChangeEvent);
      document.removeEventListener("pointerlockerror", onPointerLockError);
      surface.removeEventListener("pointerdown", onPointerDown);
      surface.removeEventListener("pointermove", onPointerMove);
      surface.removeEventListener("pointerup", onPointerEnd);
      surface.removeEventListener("pointercancel", onPointerEnd);
      surface.removeEventListener("contextmenu", preventDefault);
    },
  };
}

function preventDefault(event: Event) {
  event.preventDefault();
}
