import "./onboarding.css";
import { formatFileSize } from "../utils/format";
import type { LoadingProgress } from "../viewer/types";

/* ─── Composition data (from the designer's prototype) ─────────────────────── */

interface PhotoDef {
  src: string;
  /** Parallax depth — deeper frames drift and split further. */
  depth: number;
  /** Split direction when the gallery opens away from centre. */
  dir: 1 | -1;
  left: string;
  top: string;
  width: string;
  height: string;
}

const PHOTOS: readonly PhotoDef[] = [
  {
    src: "3.jpg",
    depth: 3,
    dir: 1,
    left: "67.57%",
    top: "-11.3%",
    width: "19.79%",
    height: "48.15%",
  },
  {
    src: "5.jpg",
    depth: 2,
    dir: -1,
    left: "-5.78%",
    top: "34.8%",
    width: "23.26%",
    height: "25.11%",
  },
  {
    src: "13.jpg",
    depth: 3,
    dir: -1,
    left: "4.1%",
    top: "70.91%",
    width: "19.65%",
    height: "47.82%",
  },
  {
    src: "7.jpg",
    depth: 2.6,
    dir: 1,
    left: "61.8%",
    top: "68.39%",
    width: "18.01%",
    height: "43.89%",
  },
  {
    src: "12.jpg",
    depth: 2.4,
    dir: 1,
    left: "84.79%",
    top: "64.75%",
    width: "16.25%",
    height: "39.54%",
  },
  {
    src: "17.jpg",
    depth: 1.2,
    dir: 1,
    left: "91.04%",
    top: "9.98%",
    width: "16.6%",
    height: "17.94%",
  },
  {
    src: "14.jpg",
    depth: 0.9,
    dir: -1,
    left: "17.29%",
    top: "6.53%",
    width: "11.67%",
    height: "12.61%",
  },
  {
    src: "11.jpg",
    depth: 2.2,
    dir: -1,
    left: "23.26%",
    top: "-27.7%",
    width: "16.67%",
    height: "40.55%",
  },
  {
    src: "16.jpg",
    depth: 1.4,
    dir: 1,
    left: "74.93%",
    top: "45.81%",
    width: "10.21%",
    height: "24.94%",
  },
  {
    src: "10.jpg",
    depth: 0.7,
    dir: 1,
    left: "47.64%",
    top: "84.32%",
    width: "9.72%",
    height: "10.51%",
  },
  {
    src: "6.jpg",
    depth: 0.5,
    dir: -1,
    left: "15.47%",
    top: "43.69%",
    width: "7.81%",
    height: "8.45%",
  },
];

/** Keep each phrase intact; `null` marks the petal in the year line. */
const HEADLINE_LINES: readonly (readonly (string | null)[])[] = [
  ["100 Năm"],
  ["Lê Hồng Phong"],
  ["1927", null, "2027."],
  ["Một thế kỷ"],
  ["di sản và tri thức."],
];

const PROMPT_LINES: readonly (readonly string[])[] = [
  ["bạn có muốn ĐỂ"],
  ["LẠI một lời nhắn?"],
];

/* ─── Timing ───────────────────────────────────────────────────────────────── */

const T_FADE_IN = 650; // year reel fades in
const T_HOLD = T_FADE_IN + 400; // beat before the counter starts running
const MIN_RUN_MS = 2400; // floor on the 1927→2027 run, so a cached model still reads
const T_REST = 400; // beat after the counter lands on 2027
const LEAVE_MS = 700; // cross-fade into the live page

/** Year slots rendered either side of the current index. */
const SLOT_COUNT = 9;
const SLOT_SPAN = 4;

/* ─── Math helpers (ported verbatim from the prototype) ────────────────────── */

const clamp = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (t: number) => t * t * (3 - 2 * t);
// Quintic ease-in-out: zero velocity AND zero acceleration at both ends, so a
// segment starts and stops with no kick.
const ease = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

// Every keyframe segment eases on its local t, and the path is identical in
// both directions, so scrolling up feels the same as scrolling down.
function stops(x: number, pts: readonly (readonly [number, number])[]): number {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i][0]) {
      const t = ease((x - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0]));
      return pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t;
    }
  }
  return pts[pts.length - 1][1];
}

/* ─── Public API ───────────────────────────────────────────────────────────── */

export interface OnboardingApi {
  /** Feed real GLB download progress into the year counter. */
  setProgress(progress: LoadingProgress): void;
  /** The model is parsed and on screen — the counter may land on 2027. */
  setModelReady(): void;
  /** Surface a load failure inside the intro instead of stranding the visitor. */
  setModelError(message: string): void;
  destroy(): void;
}

export interface OnboardingOptions {
  /** Fired as the intro starts fading out, so the page can enter in sync. */
  onComplete: () => void;
  /** Retry button in the error state. */
  onRetry: () => void;
  baseUrl?: string;
}

export function createOnboarding({
  onComplete,
  onRetry,
  baseUrl = "/",
}: OnboardingOptions): OnboardingApi {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ── DOM ─────────────────────────────────────────────────────────────────── */

  const root = document.createElement("div");
  root.className = `onboarding${reduced ? " onboarding--reduced" : ""}`;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-label", "Giới thiệu 100 năm Lê Hồng Phong");

  const headlineHtml = HEADLINE_LINES.map((line) => {
    const tight = line.includes(null);
    const phrases = line
      .map((phrase) =>
        phrase === null
          ? `<span class="ob-petal"><img src="${baseUrl}onboarding/petal.png" alt="" /></span>`
          : `<span class="ob-phrase">${phrase.normalize("NFC")}</span>`,
      )
      .join("");
    return `<div class="ob-headline__line${tight ? " ob-headline__line--tight" : ""}">${phrases}</div>`;
  }).join("");

  const promptHtml = PROMPT_LINES.map(
    (line) =>
      `<div class="ob-prompt__line">${line
        .map(
          (phrase) =>
            `<span class="ob-prompt__phrase">${phrase.normalize("NFC")}</span>`,
        )
        .join("")}</div>`,
  ).join("");

  const galleryHtml = PHOTOS.map(
    (p) =>
      `<div class="ob-photo" style="left:${p.left};top:${p.top};width:${p.width};height:${p.height}">` +
      `<img src="${baseUrl}onboarding/photos/${p.src}" alt="" loading="eager" decoding="async" fetchpriority="low" />` +
      `</div>`,
  ).join("");

  root.innerHTML = `
    <button class="ob-skip" type="button" data-ob="skip">Bỏ qua giới thiệu</button>
    <div class="onboarding__scroller" data-ob="scroller">
      <div class="onboarding__track" data-ob="track">
        <div class="onboarding__stage" data-ob="stage">

          <div class="ob-years" data-ob="years" aria-hidden="true">
            <div class="ob-years__reel">
              ${Array.from({ length: SLOT_COUNT }, () => `<div class="ob-year"></div>`).join("")}
            </div>
          </div>

          <div class="ob-caption" data-ob="caption" role="status" aria-live="polite">
            <span class="ob-caption__label" data-ob="caption-label">Đang mở hồ sơ 3D</span>
            <span class="ob-caption__bytes" data-ob="caption-bytes" aria-hidden="true"></span>
            <button class="ob-caption__retry" type="button" data-ob="retry" hidden>Thử lại</button>
          </div>

          <div class="ob-logo" data-ob="logo">
            <img src="${baseUrl}onboarding/logo.png" alt="100 năm Trường Petrus Ký – Chuyên Lê Hồng Phong" />
          </div>

          <div class="ob-gallery">${galleryHtml}</div>

          <div class="ob-roof" data-ob="roof" aria-hidden="true"></div>

          <div class="ob-headline" data-ob="headline">${headlineHtml}</div>

          <div class="ob-scroll-hint" data-ob="scroll-hint" aria-hidden="true">
            <span>Cuộn để khám phá</span>
            <svg width="14" height="18" viewBox="0 0 14 18" fill="none" aria-hidden="true">
              <path d="M7 1v14M2 10l5 5 5-5" stroke="#9c9c9c" stroke-width="1.3"
                    stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </div>

          <div class="ob-prompt" data-ob="prompt">
            <div class="ob-prompt__copy">${promptHtml}</div>
            <div class="ob-prompt__actions" data-ob="prompt-actions">
              <button class="ob-btn ob-btn--primary" type="button" data-ob="leave-note">Để lại lời nhắn</button>
              <button class="ob-btn ob-btn--ghost" type="button" data-ob="enter">Bỏ qua</button>
            </div>
          </div>

          ${reduced ? `<div class="ob-enter"><button class="ob-btn ob-btn--primary" type="button" data-ob="enter-reduced" hidden>Nhấn để bắt đầu</button></div>` : ""}

        </div>
      </div>
    </div>
  `;

  const pick = <T extends HTMLElement>(key: string): T => {
    const el = root.querySelector<T>(`[data-ob="${key}"]`);
    if (!el) throw new Error(`Onboarding: missing [data-ob="${key}"]`);
    return el;
  };

  const el = {
    skip: pick<HTMLButtonElement>("skip"),
    scroller: pick("scroller"),
    track: pick("track"),
    stage: pick("stage"),
    years: pick("years"),
    caption: pick("caption"),
    captionLabel: pick("caption-label"),
    captionBytes: pick("caption-bytes"),
    retry: pick<HTMLButtonElement>("retry"),
    logo: pick("logo"),
    roof: pick("roof"),
    headline: pick("headline"),
    scrollHint: pick("scroll-hint"),
    prompt: pick("prompt"),
    promptActions: pick("prompt-actions"),
  };

  const slots = Array.from(root.querySelectorAll<HTMLElement>(".ob-year"));
  const phrases = Array.from(root.querySelectorAll<HTMLElement>(".ob-phrase"));
  const petal = root.querySelector<HTMLElement>(".ob-petal");
  const promptPhrases = Array.from(
    root.querySelectorAll<HTMLElement>(".ob-prompt__phrase"),
  );
  const photos = Array.from(
    root.querySelectorAll<HTMLElement>(".ob-photo"),
  ).map((node, i) => ({
    node,
    depth: PHOTOS[i].depth,
    dir: PHOTOS[i].dir,
  }));
  const enterReduced = root.querySelector<HTMLButtonElement>(
    '[data-ob="enter-reduced"]',
  );

  document.body.appendChild(root);

  /* ── State ───────────────────────────────────────────────────────────────── */

  let elapsed = 0; // ms since the intro began
  let last = 0; // previous rAF timestamp
  let yearIdx = 0; // 0..100 — the animated year cursor
  let progressTarget = 0; // 0..100 — where the download says the cursor should be
  let indeterminate = true; // no Content-Length yet
  let modelReady = false;
  let errored = false;
  let erroredAt = 0;
  let runEndAt: number | null = null;
  let unlocked = false;
  let leaving = false;
  let raf = 0;

  // Eased pointer for the gallery parallax.
  let mx = 0,
    my = 0,
    tmx = 0,
    tmy = 0;

  // Change guards, so a still frame writes nothing.
  let lastYearsOpacity = -1;
  let lastScroll = -1;
  let lastLogoIn = -1;
  let lastMx = 0,
    lastMy = 0;

  /* ── Interaction ─────────────────────────────────────────────────────────── */

  const onPointerMove = (ev: MouseEvent) => {
    const r = el.stage.getBoundingClientRect();
    tmx = ((ev.clientX - r.left) / r.width) * 2 - 1;
    tmy = ((ev.clientY - r.top) / r.height) * 2 - 1;
  };
  window.addEventListener("mousemove", onPointerMove, { passive: true });

  const onKeyDown = (ev: KeyboardEvent) => {
    if (ev.key === "Escape") complete();
  };
  window.addEventListener("keydown", onKeyDown);

  el.skip.addEventListener("click", complete);
  el.retry.addEventListener("click", () => {
    errored = false;
    el.retry.hidden = true;
    el.captionBytes.classList.remove("ob-caption__bytes--error");
    el.captionLabel.textContent = "Đang mở hồ sơ 3D";
    onRetry();
  });
  // The "leave a note" flow does not exist yet — both actions enter the site.
  pick<HTMLButtonElement>("leave-note").addEventListener("click", complete);
  pick<HTMLButtonElement>("enter").addEventListener("click", complete);
  enterReduced?.addEventListener("click", complete);

  /* ── Frame loop ──────────────────────────────────────────────────────────── */

  function tick(now: number) {
    raf = requestAnimationFrame(tick);
    frame(now);
  }

  function frame(now: number) {
    if (leaving) return;

    const raw = (now - (last || now - 16)) / 1000;
    last = now;
    // The intro clock tolerates a much larger delta than the easing does: while
    // the GLB is parsing it blocks the main thread, and a clock built from
    // 50ms-capped frames would crawl and strand the counter short of 2027.
    // A backgrounded tab returns with a multi-second gap, which this still caps.
    elapsed += Math.min(250, Math.max(1, raw * 1000));
    const dt = Math.min(0.05, Math.max(0.001, raw));

    const t = elapsed;
    const H = el.stage.clientHeight || 1;

    /* ── Year counter, paced by the real download ─────────────────────────── */

    // A time-based ceiling keeps the reel from blowing through 100 years in one
    // frame when the GLB is already in cache.
    const runT = clamp((t - T_HOLD) / MIN_RUN_MS);
    const pacedCeiling =
      100 *
      (runT < 0.5
        ? 4 * runT * runT * runT
        : 1 - Math.pow(-2 * runT + 2, 3) / 2);

    // Until the model is actually ready the cursor stalls just shy of 2027, so
    // the landing always coincides with the campus being on screen.
    const cap = modelReady
      ? 100
      : Math.min(indeterminate ? 95 : progressTarget, 99.2);
    const target = Math.min(cap, pacedCeiling);
    yearIdx += (target - yearIdx) * (1 - Math.pow(0.88, dt * 60));

    if (runEndAt === null && modelReady && yearIdx > 99.85) {
      yearIdx = 100;
      runEndAt = t;
    }

    const restAt = runEndAt === null ? Infinity : runEndAt + T_REST;
    const errorFade = errored ? smooth(clamp((t - erroredAt) / 500)) : 0;
    const yearsOpacity =
      smooth(clamp(t / T_FADE_IN)) *
      (1 - smooth(clamp((t - restAt) / 700))) *
      (1 - errorFade);

    if (yearsOpacity !== lastYearsOpacity) {
      lastYearsOpacity = yearsOpacity;
      el.years.style.opacity = String(yearsOpacity);
    }

    if (yearsOpacity > 0.002) {
      const radius = H * 0.4;
      const step = 25;
      const centre = Math.round(yearIdx);

      // Reduced motion: no rotating carousel, just one year counting up — the
      // progress still reads, without the spinning reel.
      if (reduced) {
        for (let j = 0; j < slots.length; j++) {
          const slot = slots[j];
          if (j !== SLOT_SPAN) {
            slot.style.opacity = "0";
            continue;
          }
          const text = String(1927 + Math.min(100, Math.max(0, centre)));
          if (slot.textContent !== text) slot.textContent = text;
          slot.style.opacity = "1";
          slot.style.transform = "none";
          slot.style.filter = "none";
        }
      } else {
        for (let j = 0; j < slots.length; j++) {
          const slot = slots[j];
          const yi = centre - SLOT_SPAN + j;
          if (yi < 0 || yi > 100) {
            slot.style.opacity = "0";
            continue;
          }
          const d = yi - yearIdx;
          const ad = Math.abs(d);
          const text = String(1927 + yi);
          if (slot.textContent !== text) slot.textContent = text;
          slot.style.opacity = String(clamp(1 - ad * 0.3) * (ad > 3.3 ? 0 : 1));
          slot.style.filter =
            ad > 0.06 ? `blur(${(ad * 1.2).toFixed(2)}px)` : "none";
          slot.style.transform = `rotateX(${(-d * step).toFixed(3)}deg) translateZ(${radius.toFixed(1)}px)`;
        }
      }
    }

    // The year reel is the progress indicator, so a status line beside it only
    // ever competes with it. The caption is reserved for the one case the reel
    // cannot express: the model failed to load.
    el.caption.classList.toggle("is-visible", errored);
    el.skip.classList.toggle("is-visible", t > T_HOLD);

    /* ── Handover: logo, then the scroll journey ──────────────────────────── */

    const logoIn = smooth(clamp((t - (restAt + 160)) / 950));

    if (reduced) {
      if (logoIn !== lastLogoIn) {
        lastLogoIn = logoIn;
        el.logo.style.opacity = String(logoIn);
        if (enterReduced) enterReduced.hidden = logoIn < 0.9;
      }
      return;
    }

    if (!unlocked && runEndAt !== null && t > restAt + 650) {
      unlocked = true;
      el.scroller.style.overflowY = "auto";
    }

    // Eased pointer — smooth without feeling laggy.
    const k = 1 - Math.pow(0.86, dt * 60);
    mx += (tmx - mx) * k;
    my += (tmy - my) * k;

    /* ── Scroll, measured in vh of travel ─────────────────────────────────── */
    // Every cue is anchored in vh of actual scrolling rather than in a fraction
    // of the track, so perceived speed never changes when the track length does.
    const maxScroll = Math.max(
      1,
      el.scroller.scrollHeight - el.scroller.clientHeight,
    );
    const vh = H / 100;
    const sc = unlocked ? el.scroller.scrollTop / vh : 0;
    const maxVh = maxScroll / vh;
    const A = 0.36 * maxVh;

    const moved =
      Math.abs(mx - lastMx) > 0.0004 || Math.abs(my - lastMy) > 0.0004;
    if (sc === lastScroll && logoIn === lastLogoIn && !moved) return;
    lastScroll = sc;
    lastLogoIn = logoIn;
    lastMx = mx;
    lastMy = my;

    el.logo.style.opacity = String(logoIn * (1 - smooth(clamp(sc / 40))));
    el.scrollHint.classList.toggle("is-visible", unlocked && sc < 6);

    // Roof: rigid 1:1 with the scroll — it rides up exactly as far as the wheel
    // turns. Anchored so its top edge sits at 170vh when the scroll reaches A.
    el.roof.style.transform = `translate3d(0,${Math.max(-175, 170 + A - sc).toFixed(2)}vh,0)`;

    el.headline.style.transform = `translate3d(0,${stops(sc, [
      [0, 95],
      [A, 0],
      [A + 40, -4],
      [A + 200, -30],
    ]).toFixed(2)}vh,0)`;
    el.headline.style.opacity = String(
      stops(sc, [
        [0, 1],
        [A + 50, 1],
        [A + 150, 0],
      ]),
    );

    // Reveal complete phrases; keep the original overall stagger duration.
    const hp = clamp((sc - 0.04 * maxVh) / (0.3 * maxVh));
    for (let i = 0; i < phrases.length; i++) {
      const delay = (i / Math.max(1, phrases.length - 1)) * 0.672;
      const wi = ease(clamp((hp * 1.6 - delay) / 0.34));
      const g = Math.round(226 + (26 - 226) * wi);
      phrases[i].style.color = `rgb(${g},${g},${g})`;
    }
    if (petal)
      petal.style.opacity = String(ease(clamp((hp * 1.6 - 0.24) / 0.34)));

    // Photos: staggered reveal with the headline, mouse parallax at rest, then
    // split away from the centre as the roof climbs. Deeper frames travel more.
    const split = stops(sc, [
      [0, 0],
      [A + 10, 0],
      [A + 230, 88],
    ]);
    for (let i = 0; i < photos.length; i++) {
      const f = photos[i];
      const inOp = ease(clamp((sc - 20 - i * 12) / 90));
      const outOp = 1 - ease(clamp((sc - (A + 40) - (3 - f.depth) * 10) / 170));
      f.node.style.opacity = String(inOp * outOp);
      const rise =
        stops(sc, [
          [0, 20],
          [A, 0],
        ]) *
        (0.5 + f.depth * 0.18);
      const px = (-mx * f.depth * 16).toFixed(2);
      const py = (-my * f.depth * 12).toFixed(2);
      const dx = (f.dir * split * (0.6 + f.depth * 0.18)).toFixed(2);
      f.node.style.transform = `translate3d(calc(${dx}vw + ${px}px), calc(${rise.toFixed(2)}vh + ${py}px), 0)`;
    }

    const bg = Math.round(
      255 -
        17 *
          clamp(
            stops(sc, [
              [0, 0],
              [A + 300, 0],
              [A + 360, 1],
            ]),
          ),
    );
    el.stage.style.background = `rgb(${bg},${bg},${bg})`;

    /* ── Closing prompt ───────────────────────────────────────────────────── */

    const v = ease(clamp((sc - (A + 330)) / 70));
    el.prompt.style.opacity = v > 0 ? "1" : "0";
    for (let i = 0; i < promptPhrases.length; i++) {
      const delay = (i / Math.max(1, promptPhrases.length - 1)) * 0.36;
      const wi = clamp((v - delay) / 0.38);
      promptPhrases[i].style.opacity = String(wi);
      promptPhrases[i].style.transform =
        `translateY(${((1 - wi) * 14).toFixed(2)}px)`;
    }
    const bv = clamp((v - 0.5) / 0.4);
    el.promptActions.style.opacity = String(bv);
    el.promptActions.style.transform = `translateY(${((1 - bv) * 10).toFixed(2)}px)`;
    el.prompt.style.pointerEvents = bv > 0.9 ? "auto" : "none";
  }

  raf = requestAnimationFrame(tick);

  // Some environments throttle requestAnimationFrame hard (a backgrounded tab,
  // a main thread busy parsing the model). A slow watchdog keeps the intro
  // advancing rather than freezing mid-count.
  const guard = window.setInterval(() => {
    if (!leaving && performance.now() - last > 90) frame(performance.now());
  }, 50);

  /* ── Teardown ────────────────────────────────────────────────────────────── */

  function complete() {
    if (leaving) return;
    leaving = true;
    root.classList.add("is-leaving");
    el.scroller.style.overflowY = "hidden";
    // Hand over at the start of the cross-fade so the page enters in sync.
    onComplete();
    window.setTimeout(destroy, LEAVE_MS);
  }

  function destroy() {
    cancelAnimationFrame(raf);
    window.clearInterval(guard);
    window.removeEventListener("mousemove", onPointerMove);
    window.removeEventListener("keydown", onKeyDown);
    root.remove();
  }

  return {
    setProgress({ progress, loaded, total }) {
      // The viewer emits a synthetic {loaded:1,total:1} marker once the model is
      // on screen. It carries no byte count worth showing.
      if (loaded === 1 && total === 1) {
        progressTarget = 100;
        return;
      }
      indeterminate = progress === null;
      if (progress !== null)
        progressTarget = Math.max(progressTarget, progress * 100);
      el.captionBytes.textContent = indeterminate
        ? `Đã nhận ${formatFileSize(loaded)}`
        : `${formatFileSize(loaded)} / ${formatFileSize(total)}`;
    },

    setModelReady() {
      modelReady = true;
      progressTarget = 100;
      // A retry that succeeded must clear the error state it replaced.
      errored = false;
      root.classList.remove("is-error");
      el.retry.hidden = true;
      el.captionBytes.setAttribute("aria-hidden", "true");
      el.captionBytes.classList.remove("ob-caption__bytes--error");
      el.captionLabel.textContent = "Khuôn viên đã sẵn sàng";
    },

    setModelError(message) {
      if (!errored) erroredAt = elapsed;
      errored = true;
      root.classList.add("is-error");
      el.captionLabel.textContent = "Không thể tải mô hình";
      el.captionBytes.textContent = message;
      el.captionBytes.removeAttribute("aria-hidden");
      el.captionBytes.classList.add("ob-caption__bytes--error");
      el.retry.hidden = false;
    },

    destroy,
  };
}
