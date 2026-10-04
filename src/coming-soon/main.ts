import "./coming-soon.css";
import { inject } from "@vercel/analytics";

inject();

// ── Config ────────────────────────────────────────────────────────────────────
/** Launch moment shown on the page: 09:00 05.09.2027, Vietnam time. */
const LAUNCH_AT = new Date("2027-09-05T09:00:00+07:00");

/** Where "Đăng ký" leads. TODO: point at the real invitation sign-up form. */
const SIGNUP_URL = "#";

/** Design frame the desktop layout is drawn in (Figma node 52:8). */
const FRAME = { width: 1440, height: 896 };

const DAY_MS = 24 * 60 * 60 * 1000;

// ── DOM queries ───────────────────────────────────────────────────────────────
function requireElement<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id) as T | null;
  if (!el) throw new Error(`Missing required DOM element: #${id}`);
  return el;
}

const root     = requireElement("coming-soon");
const daysEl   = requireElement("cs-days");
const signupEl = requireElement<HTMLAnchorElement>("cs-signup");

signupEl.href = SIGNUP_URL;

// ── Countdown ─────────────────────────────────────────────────────────────────
function renderDays() {
  const days = Math.max(0, Math.ceil((LAUNCH_AT.getTime() - Date.now()) / DAY_MS));
  daysEl.textContent = String(days);
}

renderDays();
setInterval(renderDays, 60_000);

// ── Stage scaling ─────────────────────────────────────────────────────────────
// On landscape screens the whole Figma frame is scaled to cover the viewport,
// so the copy stays pinned to the notebook pages in the photo.
function fitStage() {
  const scale = Math.max(
    window.innerWidth / FRAME.width,
    window.innerHeight / FRAME.height,
  );
  root.style.setProperty("--cs-scale", String(scale));
}

fitStage();
window.addEventListener("resize", fitStage);
