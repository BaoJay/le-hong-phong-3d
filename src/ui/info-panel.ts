import type { Building } from "../data/buildings";

export interface InfoPanelApi {
  open(building: Building, buildings: readonly Building[]): void;
  close(): void;
  readonly isOpen: boolean;
}

export function createInfoPanel({
  onClose,
  onTabSelect,
}: {
  // Called after the panel closes — use it for side-effects (camera reset, etc.)
  onClose: () => void;
  onTabSelect: (building: Building) => void;
}): InfoPanelApi {
  const el = document.getElementById("info-panel") as HTMLElement | null;
  const closeBtn = document.getElementById("info-panel-close");
  const tabsNav = document.getElementById("panel-tabs");
  const titleEl = document.getElementById("panel-title");
  const descEl = document.getElementById("panel-desc");
  const metaEl = document.getElementById("panel-meta");

  // Each close() call gets a unique generation. open() bumps the generation so
  // any in-flight transitionend or setTimeout from a prior close() is a no-op.
  let generation = 0;

  function close() {
    if (!el) return;
    const gen = ++generation;
    el.classList.remove("open");
    // Fallback: hide if transitionend never fires (reduced-motion, etc.)
    const timer = setTimeout(() => {
      if (generation === gen) el.hidden = true;
    }, 400);
    el.addEventListener("transitionend", () => {
      clearTimeout(timer);
      if (generation === gen) el.hidden = true;
    }, { once: true });
  }

  // Close button: run the close animation, then notify the parent.
  closeBtn?.addEventListener("click", () => {
    close();
    onClose();
  });

  return {
    open(building, buildings) {
      if (!el || !tabsNav || !titleEl || !descEl || !metaEl) return;

      // Invalidate any pending close callbacks before showing the panel.
      generation++;

      tabsNav.innerHTML = "";
      for (const b of buildings) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `panel-tab${b.id === building.id ? " panel-tab--active" : ""}`;
        btn.textContent = b.title;
        btn.addEventListener("click", () => onTabSelect(b));
        tabsNav.appendChild(btn);
      }

      titleEl.textContent = building.title.toUpperCase();
      descEl.textContent = building.description;
      metaEl.innerHTML = building.meta
        .map((m) => `<div><dt>${m.label}</dt><dd>${m.value}</dd></div>`)
        .join("");

      el.hidden = false;
      requestAnimationFrame(() => el.classList.add("open"));
    },

    close,

    get isOpen() {
      return el ? !el.hidden : false;
    },
  };
}
