/* =========================================================
   VerseCraft — Debug Hitbox Editor (Drag Mode)
   - Only active when body.debug is ON
   - Tap hitbox to select, drag to move
   - Bottom-right handle to resize
   - Copy CSS exports ONLY changed hitboxes
   ========================================================= */

const EDITOR_Z = 1000000;

function qs(sel, root = document) { return root.querySelector(sel); }
function qsa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function pxToPct(px, total) { return (px / total) * 100; }
function pctToPx(pct, total) { return (pct / 100) * total; }

function round2(n) { return Math.round(n * 100) / 100; }

function getViewport() {
  // Use visualViewport when available (iOS Safari can shrink/expand)
  const vv = window.visualViewport;
  const w = vv?.width ?? window.innerWidth;
  const h = vv?.height ?? window.innerHeight;
  return { w, h };
}

function isDebugOn() {
  return document.body.classList.contains("debug");
}

function ensureStyleOnce() {
  if (qs("#vcHitboxEditorStyles")) return;
  const st = document.createElement("style");
  st.id = "vcHitboxEditorStyles";
  st.textContent = `
    /* Hitbox Editor UI */
    #vcHitboxEditorPanel{
      position: fixed;
      right: 10px;
      bottom: 64px;
      z-index: ${EDITOR_Z};
      font: 12px/1.25 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono","Courier New", monospace;
      color: rgba(255,255,255,.95);
      background: rgba(0,0,0,.72);
      border: 1px solid rgba(255,255,255,.18);
      border-radius: 12px;
      padding: 10px 10px;
      backdrop-filter: blur(6px);
      display: none;
      width: 220px;
      user-select: none;
      -webkit-user-select: none;
    }
    #vcHitboxEditorPanel .row{
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:10px;
      margin: 6px 0;
    }
    #vcHitboxEditorPanel button{
      font: inherit;
      color: rgba(255,255,255,.95);
      background: rgba(255,255,255,.10);
      border: 1px solid rgba(255,255,255,.20);
      border-radius: 10px;
      padding: 6px 8px;
    }
    #vcHitboxEditorPanel button:active{ transform: translateY(1px); }
    #vcHitboxEditorPanel .pill{
      padding: 4px 8px;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,.18);
      background: rgba(0,0,0,.35);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 140px;
    }
    #vcHitboxEditorPanel .hint{
      opacity: .75;
      margin-top: 6px;
      font-size: 11px;
    }

    /* Selection ring */
    body.vc-editing .hitbox{
      outline: 2px dashed rgba(0,255,255,.85) !important;
      outline-offset: -2px !important;
    }
    body.vc-editing .hitbox.vc-selected{
      outline: 3px solid rgba(255,255,255,.95) !important;
      background: rgba(0,255,255,0.18) !important;
    }

    /* Resize handle (bottom-right only, simplest on iOS) */
    #vcResizeHandle{
      position: fixed;
      width: 22px;
      height: 22px;
      border-radius: 6px;
      z-index: ${EDITOR_Z + 1};
      background: rgba(255,255,255,.90);
      border: 2px solid rgba(0,0,0,.65);
      display: none;
      transform: translate(-50%,-50%);
      touch-action: none;
    }

    /* Output modal */
    #vcHitboxEditorModal{
      position: fixed;
      inset: 0;
      z-index: ${EDITOR_Z + 2};
      background: rgba(0,0,0,.68);
      display: none;
      align-items: center;
      justify-content: center;
      padding: 18px;
    }
    #vcHitboxEditorModal .card{
      width: min(720px, 100%);
      background: rgba(0,0,0,.85);
      border: 1px solid rgba(255,255,255,.18);
      border-radius: 14px;
      padding: 12px;
      backdrop-filter: blur(8px);
    }
    #vcHitboxEditorModal .title{
      display:flex;
      justify-content:space-between;
      align-items:center;
      gap:10px;
      margin-bottom: 8px;
      font-weight: 700;
    }
    #vcHitboxEditorModal textarea{
      width: 100%;
      height: 260px;
      resize: vertical;
      border-radius: 10px;
      border: 1px solid rgba(255,255,255,.18);
      background: rgba(255,255,255,.06);
      color: rgba(255,255,255,.95);
      padding: 10px;
      font: 12px/1.35 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono","Courier New", monospace;
    }
    #vcHitboxEditorModal .actions{
      display:flex;
      justify-content:flex-end;
      gap:10px;
      margin-top: 10px;
    }
    #vcHitboxEditorModal .actions button{
      font: inherit;
      color: rgba(255,255,255,.95);
      background: rgba(255,255,255,.10);
      border: 1px solid rgba(255,255,255,.20);
      border-radius: 10px;
      padding: 8px 10px;
    }
  `;
  document.head.appendChild(st);
}

function buildUI() {
  ensureStyleOnce();

  // Panel
  let panel = qs("#vcHitboxEditorPanel");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "vcHitboxEditorPanel";
    panel.innerHTML = `
      <div class="row">
        <div class="pill" id="vcSelectedLabel">Selected: none</div>
        <button id="vcToggleEdit" type="button">Edit: OFF</button>
      </div>

      <div class="row">
        <button id="vcCopyCss" type="button">Copy CSS</button>
        <button id="vcClearSel" type="button">Clear</button>
      </div>

      <div class="hint">
        Debug ON → panel shows. Turn Edit ON → tap a hitbox to select → drag to move.
        Use the white square to resize.
      </div>
    `;
    document.body.appendChild(panel);
  }

  // Resize handle
  let handle = qs("#vcResizeHandle");
  if (!handle) {
    handle = document.createElement("div");
    handle.id = "vcResizeHandle";
    document.body.appendChild(handle);
  }

  // Modal
  let modal = qs("#vcHitboxEditorModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "vcHitboxEditorModal";
    modal.innerHTML = `
      <div class="card">
        <div class="title">
          <div>Hitbox CSS Output (changed only)</div>
          <button id="vcCloseModal" type="button">Close</button>
        </div>
        <textarea id="vcCssOut" spellcheck="false"></textarea>
        <div class="actions">
          <button id="vcCopyToClipboard" type="button">Copy to Clipboard</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  return { panel, handle, modal };
}

function getAllHitboxes() {
  return qsa(".hitbox").filter(el => el.id && el.id.startsWith("hb"));
}

function readBoxPct(el) {
  // Prefer inline style, else computed
  const { w, h } = getViewport();
  const cs = getComputedStyle(el);

  // computed left/top/width/height in px
  const leftPx = parseFloat(cs.left) || 0;
  const topPx = parseFloat(cs.top) || 0;
  const widthPx = parseFloat(cs.width) || el.getBoundingClientRect().width || 0;
  const heightPx = parseFloat(cs.height) || el.getBoundingClientRect().height || 0;

  return {
    left: round2(pxToPct(leftPx, w)),
    top: round2(pxToPct(topPx, h)),
    width: round2(pxToPct(widthPx, w)),
    height: round2(pxToPct(heightPx, h)),
  };
}

function applyBoxPct(el, box) {
  el.style.left = `${box.left}%`;
  el.style.top = `${box.top}%`;
  el.style.width = `${box.width}%`;
  el.style.height = `${box.height}%`;
  // Ensure absolute stays absolute
  el.style.position = "absolute";
}

function placeResizeHandle(handle, el) {
  const r = el.getBoundingClientRect();
  // Bottom-right corner
  handle.style.left = `${r.right}px`;
  handle.style.top = `${r.bottom}px`;
}

function makeCssOutput(changedMap) {
  const ids = Array.from(changedMap.keys()).sort();
  const lines = [];
  lines.push("/* VerseCraft Hitbox Editor Output");
  lines.push("   Paste into styles/ui/hitboxes.css (replace matching blocks)");
  lines.push("*/");
  for (const id of ids) {
    const b = changedMap.get(id);
    lines.push("");
    lines.push(`#${id}{`);
    lines.push(`  left: ${b.left}%;`);
    lines.push(`  top: ${b.top}%;`);
    lines.push(`  width: ${b.width}%;`);
    lines.push(`  height: ${b.height}%;`);
    lines.push("}");
  }
  return lines.join("\n");
}

function showModal(modal, text) {
  const ta = qs("#vcCssOut");
  ta.value = text;
  modal.style.display = "flex";
  ta.focus();
  ta.select();
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback handled by selecting textarea in modal
    return false;
  }
}

function installEditor() {
  const { panel, handle, modal } = buildUI();

  const btnToggle = qs("#vcToggleEdit");
  const btnCopy = qs("#vcCopyCss");
  const btnClear = qs("#vcClearSel");
  const lblSel = qs("#vcSelectedLabel");
  const btnCloseModal = qs("#vcCloseModal");
  const btnCopyClip = qs("#vcCopyToClipboard");

  let editing = false;
  let selected = null;

  // Track only changed hitboxes
  const changed = new Map(); // id -> box%

  // Drag state
  let dragging = false;
  let resizing = false;
  let start = null;

  function setPanelVisible(v) {
    panel.style.display = v ? "block" : "none";
    if (!v) {
      // If debug turns off, also stop editing
      setEditing(false);
    }
  }

  function setEditing(v) {
    editing = v;
    document.body.classList.toggle("vc-editing", editing);
    btnToggle.textContent = editing ? "Edit: ON" : "Edit: OFF";
    if (!editing) {
      clearSelection();
    }
  }

  function setSelected(el) {
    if (selected) selected.classList.remove("vc-selected");
    selected = el;
    if (selected) {
      selected.classList.add("vc-selected");
      lblSel.textContent = `Selected: ${selected.id}`;
      handle.style.display = "block";
      placeResizeHandle(handle, selected);
    } else {
      lblSel.textContent = "Selected: none";
      handle.style.display = "none";
    }
  }

  function clearSelection() {
    setSelected(null);
  }

  function markChanged(el) {
    if (!el || !el.id) return;
    const b = readBoxPct(el);
    changed.set(el.id, b);
  }

  // Panel actions
  btnToggle.addEventListener("click", () => setEditing(!editing));
  btnClear.addEventListener("click", () => clearSelection());

  btnCopy.addEventListener("click", async () => {
    const text = makeCssOutput(changed);
    showModal(modal, text);
    // Try clipboard; if it fails, textarea is already selected for manual copy
    await copyToClipboard(text);
  });

  btnCloseModal.addEventListener("click", () => { modal.style.display = "none"; });
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.style.display = "none";
  });

  btnCopyClip.addEventListener("click", async () => {
    const ta = qs("#vcCssOut");
    const ok = await copyToClipboard(ta.value);
    if (!ok) {
      ta.focus();
      ta.select();
    }
  });

  // Hitbox selection (tap)
  document.addEventListener("pointerdown", (e) => {
    if (!editing) return;
    // Ignore panel & modal clicks
    if (panel.contains(e.target) || modal.contains(e.target) || e.target === handle) return;

    const t = e.target;
    if (t && t.classList && t.classList.contains("hitbox")) {
      e.preventDefault();
      setSelected(t);
      placeResizeHandle(handle, t);
    }
  }, { passive: false });

  // Drag move selected hitbox
  document.addEventListener("pointerdown", (e) => {
    if (!editing || !selected) return;
    if (panel.contains(e.target) || modal.contains(e.target)) return;

    // If resize handle, start resize instead
    if (e.target === handle) {
      resizing = true;
      dragging = false;
      const r = selected.getBoundingClientRect();
      start = {
        pointerId: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        leftPx: r.left,
        topPx: r.top,
        wPx: r.width,
        hPx: r.height
      };
      handle.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }

    // Otherwise drag if pointer is on the selected hitbox
    if (e.target === selected) {
      dragging = true;
      resizing = false;
      const r = selected.getBoundingClientRect();
      start = {
        pointerId: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        leftPx: r.left,
        topPx: r.top,
        wPx: r.width,
        hPx: r.height
      };
      selected.setPointerCapture(e.pointerId);
      e.preventDefault();
    }
  }, { passive: false });

  document.addEventListener("pointermove", (e) => {
    if (!editing || !selected || !start) return;
    if (e.pointerId !== start.pointerId) return;

    const { w, h } = getViewport();
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;

    if (dragging) {
      let newLeftPx = start.leftPx + dx;
      let newTopPx = start.topPx + dy;

      // Clamp within viewport
      newLeftPx = clamp(newLeftPx, 0, w - start.wPx);
      newTopPx = clamp(newTopPx, 0, h - start.hPx);

      const box = {
        left: round2(pxToPct(newLeftPx, w)),
        top: round2(pxToPct(newTopPx, h)),
        width: round2(pxToPct(start.wPx, w)),
        height: round2(pxToPct(start.hPx, h)),
      };

      applyBoxPct(selected, box);
      placeResizeHandle(handle, selected);
      markChanged(selected);
      e.preventDefault();
    }

    if (resizing) {
      let newWPx = clamp(start.wPx + dx, 10, w - start.leftPx);
      let newHPx = clamp(start.hPx + dy, 10, h - start.topPx);

      const box = {
        left: round2(pxToPct(start.leftPx, w)),
        top: round2(pxToPct(start.topPx, h)),
        width: round2(pxToPct(newWPx, w)),
        height: round2(pxToPct(newHPx, h)),
      };

      applyBoxPct(selected, box);
      placeResizeHandle(handle, selected);
      markChanged(selected);
      e.preventDefault();
    }
  }, { passive: false });

  document.addEventListener("pointerup", (e) => {
    if (!start) return;
    if (e.pointerId !== start.pointerId) return;

    dragging = false;
    resizing = false;
    start = null;

    // Re-place handle (in case viewport changed)
    if (editing && selected) placeResizeHandle(handle, selected);
  });

  // Keep handle aligned on viewport changes
  window.addEventListener("resize", () => {
    if (editing && selected) placeResizeHandle(handle, selected);
  });

  // Show/hide panel based on body.debug
  const obs = new MutationObserver(() => setPanelVisible(isDebugOn()));
  obs.observe(document.body, { attributes: true, attributeFilter: ["class"] });
  setPanelVisible(isDebugOn());
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", installEditor);
} else {
  installEditor();
}