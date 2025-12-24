/* VerseCraft MVP Renderer (Lorecraft Tutorial)
 * - Loads lorecraft_tutorial.story.json
 * - Renders sections + choices
 * - Applies ops: SET_FLAG, ADD_RESOURCE, APPEND_TEXT, ADD_ITEM, REMOVE_ITEM
 * - Runs checks: stat/resource DC with onPass/onFail
 * - Handles simple Timing: EXPIRE + SOFT (choiceCount based)
 * - Save/Load: 3 localStorage slots
 *
 * Keep JSON filename EXACT: ./lorecraft_tutorial.story.json
 */

const STORAGE_PREFIX = "versecraft_mvp_slot_";
const SLOTS = [1, 2, 3];

let STORY = null;
let STATE = null;

// ---------- Utilities ----------
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function deepCopy(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function byId(id) {
  return document.getElementById(id);
}

function safeText(s) {
  return String(s ?? "");
}

function nowISO() {
  return new Date().toISOString();
}

// ---------- Save / Load ----------
function saveState(slot) {
  const key = STORAGE_PREFIX + slot;
  const payload = {
    savedAt: nowISO(),
    storyId: STORY.storyId,
    state: STATE
  };
  localStorage.setItem(key, JSON.stringify(payload));
}

function loadState(slot) {
  const key = STORAGE_PREFIX + slot;
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed.storyId !== STORY.storyId) return null;
    return parsed.state;
  } catch {
    return null;
  }
}

function clearSlot(slot) {
  localStorage.removeItem(STORAGE_PREFIX + slot);
}

function hasAnySave() {
  return SLOTS.some((s) => !!localStorage.getItem(STORAGE_PREFIX + s));
}

// ---------- Rules / Ops ----------
function getStat(name) {
  return Number(STATE.stats?.[name] ?? 0);
}

function getResource(name) {
  return Number(STATE.resources?.[name] ?? 0);
}

function setResource(name, value) {
  if (!STATE.resources) STATE.resources = {};
  STATE.resources[name] = value;
}

function addResource(name, amount) {
  const cur = getResource(name);
  let next = cur + Number(amount ?? 0);

  // simple clamps if present in defaults (HP/HEALTH); keep soft for MVP
  if (name === "HP" || name === "HEALTH") {
    const max = Number(STORY.save?.defaults?.resources?.[name] ?? 10);
    next = clamp(next, 0, max);
  }
  setResource(name, next);
}

function setFlag(key, value) {
  if (!STATE.flags) STATE.flags = {};
  STATE.flags[key] = value;
}

function flagTrue(key) {
  return !!STATE.flags?.[key];
}

function appendText(lines) {
  if (!STATE.runtimeText) STATE.runtimeText = [];
  for (const line of lines ?? []) STATE.runtimeText.push(String(line));
}

function inventoryHas(slot, itemId) {
  const arr = STATE.inventory?.[slot] ?? [];
  return arr.includes(itemId);
}

function addItem(slot, itemId) {
  if (!STATE.inventory) STATE.inventory = { consumables: [], weapons: [], armors: [], specialItems: [] };
  if (!STATE.inventory[slot]) STATE.inventory[slot] = [];
  if (!STATE.inventory[slot].includes(itemId)) STATE.inventory[slot].push(itemId);
}

function removeItem(slot, itemId) {
  if (!STATE.inventory?.[slot]) return;
  STATE.inventory[slot] = STATE.inventory[slot].filter((x) => x !== itemId);
}

function applyOp(op) {
  if (!op || !op.op) return;

  switch (op.op) {
    case "ADD_RESOURCE":
      addResource(op.resource, op.amount);
      break;

    case "SET_FLAG":
      setFlag(op.key, op.value);
      break;

    case "APPEND_TEXT":
      appendText(op.lines || []);
      break;

    case "ADD_ITEM":
      addItem(op.slot, op.itemId);
      break;

    case "REMOVE_ITEM":
      removeItem(op.slot, op.itemId);
      break;

    default:
      // ignore unknown ops (future-proof)
      break;
  }
}

// ---------- Checks ----------
function runChecks(section) {
  const checks = section.checks ?? [];
  for (const chk of checks) {
    let pass = false;

    if (chk.stat) {
      pass = getStat(chk.stat) >= Number(chk.dc ?? 0);
    } else if (chk.resource) {
      pass = getResource(chk.resource) >= Number(chk.dc ?? 0);
    } else {
      // no stat/resource => treat as fail-safe pass false
      pass = false;
    }

    const ops = pass ? (chk.onPass ?? []) : (chk.onFail ?? []);
    for (const op of ops) applyOp(op);

    // optional: store result for debugging / future UI
    if (!STATE.checkHistory) STATE.checkHistory = [];
    STATE.checkHistory.push({
      id: chk.id || "check",
      pass,
      at: STATE.sectionId
    });
  }
}

// ---------- Timing ----------
function isChoiceExpired(choice) {
  const t = choice.timing;
  if (!t || t.mode !== "EXPIRE") return false;
  const expiresAfter = Number(t.expiresAfterChoiceCount ?? Infinity);
  return Number(STATE.choiceCount ?? 0) >= expiresAfter;
}

function isChoiceLate(choice) {
  const t = choice.timing;
  if (!t || t.mode !== "SOFT") return false;
  const lateAfter = Number(t.lateAfterChoiceCount ?? Infinity);
  return Number(STATE.choiceCount ?? 0) >= lateAfter;
}

function applyTimingPenalty(choice) {
  const t = choice.timing;
  if (!t || t.mode !== "SOFT") return;
  if (!isChoiceLate(choice)) return;
  const penaltyOps = t.penalty ?? [];
  for (const op of penaltyOps) applyOp(op);
}

// ---------- Requirements ----------
function meetsRequires(req) {
  if (!req) return true;

  // anyOf
  if (Array.isArray(req.anyOf)) {
    return req.anyOf.some((r) => meetsRequires(r));
  }

  // hasItem
  if (req.hasItem) {
    return inventoryHas(req.hasItem.slot, req.hasItem.itemId);
  }

  // optionalItem (used only for showing the choice; we allow it regardless)
  if (req.optionalItem) {
    // Always show; engine will apply onChoose if present and item exists could be checked in JSON later.
    return true;
  }

  // minResource
  if (req.minResource) {
    return getResource(req.minResource.resource) >= Number(req.minResource.amount ?? 0);
  }

  // flagTrue
  if (req.flagTrue) {
    return flagTrue(req.flagTrue);
  }

  return true;
}

// ---------- Section Flow ----------
function getSection(sectionId) {
  return STORY.sections.find((s) => s.id === sectionId) || null;
}

function enterSection(sectionId) {
  const section = getSection(sectionId);
  if (!section) {
    renderError(`Section not found: ${sectionId}`);
    return;
  }

  STATE.sectionId = sectionId;

  // reset runtime text each entry (so APPEND_TEXT is per section)
  STATE.runtimeText = [];

  // record visited
  if (!STATE.visited) STATE.visited = [];
  if (!STATE.visited.includes(sectionId)) STATE.visited.push(sectionId);

  // apply onEnter ops
  for (const op of (section.onEnter ?? [])) applyOp(op);

  // run checks (which may append text, set flags, etc.)
  runChecks(section);

  renderSection(section);
}

function choose(choiceId) {
  const section = getSection(STATE.sectionId);
  const choice = (section.choices ?? []).find((c) => c.id === choiceId);
  if (!choice) return;

  // increment choiceCount first so Timing checks can use it either way
  STATE.choiceCount = Number(STATE.choiceCount ?? 0) + 1;

  // timing: if expired, do nothing (shouldn't happen if UI filtered)
  if (isChoiceExpired(choice)) {
    // subtle: nudge player
    STATE.runtimeText = [];
    appendText(["The moment is gone. You can feel it in the stone."]);
    renderSection(section);
    return;
  }

  // timing: if late, apply penalty ops
  applyTimingPenalty(choice);

  // onChoose ops
  for (const op of (choice.onChoose ?? [])) applyOp(op);

  // go next
  enterSection(choice.to);
}

// ---------- UI ----------
function renderError(message) {
  const app = byId("app");
  app.innerHTML = `
    <h2 style="color:#ff7777;">Error</h2>
    <pre style="white-space:pre-wrap;">${safeText(message)}</pre>
  `;
}

function renderTopBar() {
  const hp = getResource("HP");
  const health = getResource("HEALTH");
  const rep = getResource("REPUTATION");

  return `
    <div class="topbar">
      <div class="hud">
        <span><strong>HP</strong>: ${hp}</span>
        <span><strong>Health</strong>: ${health}</span>
        <span><strong>Rep</strong>: ${rep}</span>
      </div>
      <div class="hud-actions">
        ${SLOTS.map((s) => `<button data-save="${s}">Save ${s}</button>`).join("")}
        ${SLOTS.map((s) => `<button data-load="${s}">Load ${s}</button>`).join("")}
        ${SLOTS.map((s) => `<button data-clear="${s}">Clear ${s}</button>`).join("")}
        <button data-home="1">Main Menu</button>
      </div>
    </div>
  `;
}

function renderMainMenu() {
  const app = byId("app");
  const canContinue = hasAnySave();

  app.innerHTML = `
    ${renderTopBar()}
    <h2>VerseCraft MVP</h2>
    <p style="opacity:.85">Free tutorial world: <strong>LORECRAFT</strong></p>

    <div class="menu">
      <button id="newGameBtn">New Story</button>
      <button id="continueBtn" ${canContinue ? "" : "disabled"}>Continue (Load Slot 1)</button>
      <button id="settingsBtn">Settings</button>
    </div>

    <div id="settingsPanel" style="display:none; margin-top: 1rem;">
      <h3>Settings</h3>
      <p style="opacity:.8">Timing is always active and subtle. Choices may change or disappear without warning.</p>
      <p style="opacity:.8">No account. Saves are stored locally in your browser.</p>
    </div>
  `;

  // wire menu buttons
  byId("newGameBtn").onclick = () => {
    STATE = deepCopy(STORY.save.defaults);
    STATE.sectionId = STORY.startSectionId;
    STATE.runtimeText = [];
    enterSection(STORY.startSectionId);
  };

  byId("continueBtn").onclick = () => {
    const loaded = loadState(1);
    if (loaded) {
      STATE = loaded;
      enterSection(STATE.sectionId || STORY.startSectionId);
    }
  };

  byId("settingsBtn").onclick = () => {
    const p = byId("settingsPanel");
    p.style.display = (p.style.display === "none") ? "block" : "none";
  };

  wireTopBarButtons();
}

function renderSection(section) {
  const app = byId("app");

  const baseText = section.text ?? [];
  const extraText = STATE.runtimeText ?? [];
  const allText = [...baseText, ...extraText];

  // filter choices by requirements + timing expiry
  const choices = (section.choices ?? [])
    .filter((c) => meetsRequires(c.requires))
    .filter((c) => !isChoiceExpired(c));

  app.innerHTML = `
    ${renderTopBar()}
    <h2>${safeText(section.title)}</h2>

    <div class="story">
      ${allText.map((p) => `<p>${safeText(p)}</p>`).join("")}
    </div>

    <div class="choices">
      ${choices.map((c) => `
        <button class="choiceBtn" data-choice="${safeText(c.id)}">
          ${safeText(c.text)}
        </button>
      `).join("")}
    </div>

    <div class="meta">
      <p style="opacity:.6; font-size:.85rem;">
        Section: ${safeText(section.id)} · Choices made: ${Number(STATE.choiceCount ?? 0)}
      </p>
    </div>
  `;

  // wire choice buttons
  document.querySelectorAll("[data-choice]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const cid = btn.getAttribute("data-choice");
      choose(cid);
    });
  });

  wireTopBarButtons();
}

function wireTopBarButtons() {
  document.querySelectorAll("[data-save]").forEach((btn) => {
    btn.onclick = () => {
      const slot = Number(btn.getAttribute("data-save"));
      saveState(slot);
      alert(`Saved to slot ${slot}`);
    };
  });

  document.querySelectorAll("[data-load]").forEach((btn) => {
    btn.onclick = () => {
      const slot = Number(btn.getAttribute("data-load"));
      const loaded = loadState(slot);
      if (!loaded) return alert(`No save found in slot ${slot}`);
      STATE = loaded;
      enterSection(STATE.sectionId || STORY.startSectionId);
    };
  });

  document.querySelectorAll("[data-clear]").forEach((btn) => {
    btn.onclick = () => {
      const slot = Number(btn.getAttribute("data-clear"));
      clearSlot(slot);
      alert(`Cleared slot ${slot}`);
    };
  });

  document.querySelectorAll("[data-home]").forEach((btn) => {
    btn.onclick = () => renderMainMenu();
  });
}

// ---------- Boot ----------
async function boot() {
  const app = byId("app");
  app.innerHTML = `<p>Loading world…</p>`;

  try {
    const res = await fetch("./lorecraft_tutorial.story.json");
    if (!res.ok) throw new Error("Failed to load story JSON: " + res.status);
    STORY = await res.json();

    // basic validation
    if (!STORY.sections || !Array.isArray(STORY.sections)) {
      throw new Error("Invalid story format: missing sections[]");
    }
    if (!STORY.save?.defaults) {
      throw new Error("Invalid story format: missing save.defaults");
    }

    // start at main menu
    renderMainMenu();
  } catch (e) {
    renderError(e.toString());
  }
}

boot();
