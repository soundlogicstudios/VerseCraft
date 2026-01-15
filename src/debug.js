// Debug tooling
// - outlines hitboxes when enabled (body.debug)
// - shows a small debug HUD with XY + routing info

function parseDebug() {
  const qs = new URLSearchParams(location.search);
  return qs.get("debug") === "1";
}

function ensureHud() {
  // Panel
  let panel = document.getElementById("debugHud");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "debugHud";
    panel.innerHTML = `
      <div class="row"><span class="k">Screen</span><span id="dbgScreen" class="v">-</span></div>
      <div class="row"><span class="k">XY</span><span id="dbgXY" class="v">-</span></div>
      <div class="row"><span class="k">Viewport</span><span id="dbgViewport" class="v">-</span></div>
    `.trim();
    document.body.appendChild(panel);
  }

  // Touch dot
  let dot = document.getElementById("debugDot");
  if (!dot) {
    dot = document.createElement("div");
    dot.id = "debugDot";
    document.body.appendChild(dot);
  }

  return { panel, dot };
}

function fmt(n) {
  return Number.isFinite(n) ? Math.round(n) : "-";
}

export function initDebug() {
  const btn = document.getElementById("btnDebug");
  const body = document.body;

  const { dot } = ensureHud();

  let lastX = null;
  let lastY = null;
  let lastScreen = null;

  const updateHud = () => {
    const screenEl = document.getElementById("dbgScreen");
    const xyEl = document.getElementById("dbgXY");
    const vpEl = document.getElementById("dbgViewport");

    const hash = (location.hash || "").replace("#", "").trim();
    const active = document.querySelector(".screen.active");
    const activeId = active?.getAttribute("data-screen") || "-";
    const screen = hash || activeId;

    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;

    if (screenEl && screen !== lastScreen) {
      screenEl.textContent = screen;
      lastScreen = screen;
    }

    if (xyEl) {
      if (lastX == null || lastY == null) {
        xyEl.textContent = "-";
      } else {
        const px = fmt(lastX);
        const py = fmt(lastY);
        const pctx = Math.round((lastX / Math.max(1, w)) * 100);
        const pcty = Math.round((lastY / Math.max(1, h)) * 100);
        xyEl.textContent = `${px}, ${py}  (${pctx}%, ${pcty}%)`;
      }
    }

    if (vpEl) {
      vpEl.textContent = `${Math.round(w)}×${Math.round(h)}  DPR ${dpr}`;
    }
  };

  const setXY = (x, y) => {
    lastX = x;
    lastY = y;

    // Position dot (centered)
    dot.style.transform = `translate(${fmt(x)}px, ${fmt(y)}px) translate(-50%, -50%)`;
    updateHud();
  };

  // Pointer + touch tracking
  const onPointer = (e) => {
    if (!body.classList.contains("debug")) return;
    setXY(e.clientX, e.clientY);
  };

  const onTouch = (e) => {
    if (!body.classList.contains("debug")) return;
    const t = e.touches && e.touches[0];
    if (!t) return;
    setXY(t.clientX, t.clientY);
  };

  window.addEventListener("pointermove", onPointer, { passive: true });
  window.addEventListener("pointerdown", onPointer, { passive: true });
  window.addEventListener("touchstart", onTouch, { passive: true });
  window.addEventListener("touchmove", onTouch, { passive: true });

  // Routing updates
  window.addEventListener("hashchange", updateHud);
  window.addEventListener("versecraft:navigate", updateHud);

  // initial
  if (parseDebug()) body.classList.add("debug");
  updateHud();

  if (btn) {
    btn.addEventListener("click", () => {
      body.classList.toggle("debug");
      body.classList.toggle("debug-hitboxes"); 
      updateHud();
    });
  }
}
