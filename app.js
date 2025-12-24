// VerseCraft MVP v1.2+ (Full Replacement)
// - WEALTH stats: W E A L T H (H is a STAT; "Health resource" removed)
// - Survivability: HP only. HP <= 0 => Death Screen.
// - HUD: HP, LVL, XP + Inventory caps (C/W/A/S each max 9)
// - System lines: narrate HP deltas + hint timing penalties
// - Full Menu + Save/Load + Character Sheet + Inventory + Glyph Scene Panel
//
// Expected files in repo root:
// index.html, styles.css, app.js, lorecraft_tutorial.story.json

const VC_SLOTS = [1, 2, 3];
const VC_STORAGE_PREFIX = "versecraft_slot_";

// Hardlock caps (per your spec)
const MAX_CONSUMABLES = 9;
const MAX_WEAPONS = 9;
const MAX_ARMORS = 9;
const MAX_SPECIALS = 9;

let STORY = null;
let STATE = null;

(function () {
  const app = document.getElementById("app");

  // ---------- helpers ----------
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    }[c]));

  const $ = (sel) => document.querySelector(sel);

  function deepCopy(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function slotKey(slot) {
    return VC_STORAGE_PREFIX + slot;
  }

  function showError(title, body) {
    app.innerHTML = `
      <div class="panel">
        <h2 class="notice-bad">${esc(title)}</h2>
        <pre style="white-space:pre-wrap;">${esc(body)}</pre>
        <div class="hr"></div>
        <button id="btnBackToMenu">Back to Menu</button>
      </div>
    `;
    const btn = document.getElementById("btnBackToMenu");
    if (btn) btn.onclick = () => renderMainMenu();
  }

  // Surface errors on-page (mobile friendly)
  window.addEventListener("error", (e) => {
    showError("JavaScript error", `${e.message}\n${e.filename}:${e.lineno}:${e.colno}`);
  });
  window.addEventListener("unhandledrejection", (e) => {
    showError("Unhandled promise rejection", String(e.reason ?? e));
  });

  // ---------- state normalization ----------
  function normalizeState(s, storyObj) {
    if (!s || typeof s !== "object") s = {};
    const d = storyObj?.save?.defaults || {};

    // WEALTH stats in canonical order: W E A L T H
    // W=Wisdom, E=Endurance, A=Agility, L=Luck, T=Timing, H=Health(stat / STR-mapped)
    s.stats =
      (s.stats && typeof s.stats === "object")
        ? s.stats
        : (d.stats || { W: 1, E: 1, A: 1, L: 1, T: 1, H: 1 });

    // Back-compat: if older keys exist, map them
    // (We won't crash if JSON still uses WISDOM etc; we display W/E/A/L/T/H only)
    if (s.stats && typeof s.stats === "object") {
      if (s.stats.W == null && s.stats.WISDOM != null) s.stats.W = s.stats.WISDOM;
      if (s.stats.E == null && s.stats.ENDURANCE != null) s.stats.E = s.stats.ENDURANCE;
      if (s.stats.A == null && s.stats.AGILITY != null) s.stats.A = s.stats.AGILITY;
      if (s.stats.L == null && s.stats.LUCK != null) s.stats.L = s.stats.LUCK;
      if (s.stats.T == null && s.stats.TIMING != null) s.stats.T = s.stats.TIMING;
      // H might not exist in older saves; default it
      if (s.stats.H == null) s.stats.H = 1;
    }

    // Resources: HP + (optional) Reputation
    // IMPORTANT: No HEALTH resource exists.
    s.resources =
      (s.resources && typeof s.resources === "object")
        ? s.resources
        : (d.resources || { HP: 10, REPUTATION: 0 });

    if (s.resources.HP == null) s.resources.HP = 10;
    if (s.resources.REPUTATION == null) s.resources.REPUTATION = 0;

    // Progress: level + xp
    s.progress =
      (s.progress && typeof s.progress === "object")
        ? s.progress
        : (d.progress || { level: 1, xp: 0 });

    if (typeof s.progress.level !== "number") s.progress.level = 1;
    if (typeof s.progress.xp !== "number") s.progress.xp = 0;

    // Inventory (hardlocked caps)
    s.inventory =
      (s.inventory && typeof s.inventory === "object")
        ? s.inventory
        : (d.inventory || { consumables: [], weapons: [], armors: [], specialItems: [] });

    for (const k of ["consumables", "weapons", "armors", "specialItems"]) {
      if (!Array.isArray(s.inventory[k])) s.inventory[k] = [];
    }

    // Flags + misc
    s.flags = (s.flags && typeof s.flags === "object") ? s.flags : (d.flags || {});
    if (!Array.isArray(s.visited)) s.visited = [];
    if (typeof s.choiceCount !== "number") s.choiceCount = 0;
    if (typeof s.lastSlot !== "number") s.lastSlot = 1;
    if (typeof s.isDead !== "boolean") s.isDead = false;

    return s;
  }

  // ---------- save/load ----------
  function saveToSlot(slot) {
    const payload = {
      storyId: STORY.storyId,
      savedAt: new Date().toISOString(),
      state: STATE,
    };
    localStorage.setItem(slotKey(slot), JSON.stringify(payload));
    STATE.lastSlot = slot;
  }

  function loadFromSlot(slot) {
    const raw = localStorage.getItem(slotKey(slot));
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
    localStorage.removeItem(slotKey(slot));
  }

  function slotMeta(slot) {
    const raw = localStorage.getItem(slotKey(slot));
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (parsed.storyId !== STORY.storyId) return null;
      return { savedAt: parsed.savedAt, sectionId: parsed.state?.sectionId ?? "(unknown)" };
    } catch {
      return null;
    }
  }

  function mostRecentSlot() {
    const metas = VC_SLOTS
      .map((s) => ({ slot: s, meta: slotMeta(s) }))
      .filter((x) => x.meta && x.meta.savedAt);

    if (!metas.length) return null;
    metas.sort((a, b) => String(b.meta.savedAt).localeCompare(String(a.meta.savedAt)));
    return metas[0].slot;
  }

  // ---------- engine basics ----------
  function getSection(id) {
    return STORY.sections.find((s) => s.id === id) || null;
  }

  function getHP() {
    return Number(STATE.resources?.HP ?? 0);
  }

  function setHP(v) {
    const maxHP = Number(STORY.save?.defaults?.resources?.HP ?? 10);
    STATE.resources.HP = clamp(Number(v ?? 0), 0, maxHP);
  }

  function getRep() {
    return Number(STATE.resources?.REPUTATION ?? 0);
  }

  function getLevel() {
    return Number(STATE.progress?.level ?? 1);
  }

  function getXP() {
    return Number(STATE.progress?.xp ?? 0);
  }

  function xpToNextLevel(level) {
    // Simple curve for MVP; you can replace later
    return 100 * level;
  }

  function addXP(amount) {
    const a = Number(amount ?? 0);
    STATE.progress.xp = Math.max(0, getXP() + a);

    // Auto level-up if thresholds crossed
    while (getXP() >= xpToNextLevel(getLevel())) {
      STATE.progress.xp -= xpToNextLevel(getLevel());
      STATE.progress.level += 1;
      addSystemLine(`LVL UP! You are now Level ${getLevel()}.`);
    }
  }

  function addSystemLine(msg) {
    STATE._runtimeText = STATE._runtimeText || [];
    // Prefix with an em dash so renderer can style it as system text
    STATE._runtimeText.push(`— ${String(msg)}`);
  }

  function checkDeathAndMaybeRender() {
    if (STATE.isDead) return true;
    if (getHP() > 0) return false;
    STATE.isDead = true;
    renderDeathScreen();
    return true;
  }

  // ---------- inventory caps ----------
  function invCapFor(slot) {
    if (slot === "consumables") return MAX_CONSUMABLES;
    if (slot === "weapons") return MAX_WEAPONS;
    if (slot === "armors") return MAX_ARMORS;
    if (slot === "specialItems") return MAX_SPECIALS;
    return 999;
  }

  function invLabel(slot) {
    if (slot === "consumables") return "Consumables";
    if (slot === "weapons") return "Weapons";
    if (slot === "armors") return "Armors";
    if (slot === "specialItems") return "Special Items";
    return slot;
  }

  function invCount(slot) {
    return Array.isArray(STATE.inventory?.[slot]) ? STATE.inventory[slot].length : 0;
  }

  function addItem(slot, itemId) {
    if (!Array.isArray(STATE.inventory[slot])) STATE.inventory[slot] = [];
    const cap = invCapFor(slot);
    if (STATE.inventory[slot].includes(itemId)) return true;

    if (STATE.inventory[slot].length >= cap) {
      addSystemLine(`${invLabel(slot)} full (${STATE.inventory[slot].length}/${cap}). Item not added.`);
      return false;
    }

    STATE.inventory[slot].push(itemId);
    return true;
  }

  function removeItem(slot, itemId) {
    if (!Array.isArray(STATE.inventory[slot])) return false;
    const before = STATE.inventory[slot].length;
    STATE.inventory[slot] = STATE.inventory[slot].filter((x) => x !== itemId);
    return STATE.inventory[slot].length !== before;
  }

  function hasItem(slot, itemId) {
    return (STATE.inventory?.[slot] || []).includes(itemId);
  }

  // ---------- ops & logging ----------
  function applyOp(op) {
    if (!op || !op.op) return;

    switch (op.op) {
      case "ADD_RESOURCE": {
        // We primarily care about HP narration. Rep can change too.
        const res = op.resource;
        const amt = Number(op.amount ?? 0);

        if (res === "HP") {
          setHP(getHP() + amt);
        } else if (res === "REPUTATION") {
          STATE.resources.REPUTATION = getRep() + amt;
        } else {
          // Ignore unknown resource keys
        }
        break;
      }

      case "SET_FLAG":
        STATE.flags[op.key] = op.value;
        break;

      case "APPEND_TEXT":
        STATE._runtimeText = STATE._runtimeText || [];
        for (const line of (op.lines || [])) STATE._runtimeText.push(String(line));
        break;

      case "ADD_ITEM":
        addItem(op.slot, op.itemId);
        break;

      case "REMOVE_ITEM":
        removeItem(op.slot, op.itemId);
        break;

      // Optional future-proofing (won't break if JSON starts using them)
      case "ADD_XP":
        addXP(op.amount);
        break;

      case "SET_LEVEL":
        STATE.progress.level = Math.max(1, Number(op.level ?? 1));
        break;

      default:
        // ignore unknown ops
        break;
    }
  }

  function applyOpsWithHPLog(ops, contextLabel) {
    const hpBefore = getHP();
    const repBefore = getRep();
    const xpBefore = getXP();
    const lvlBefore = getLevel();

    for (const op of (ops || [])) applyOp(op);

    // Death check immediately if HP dropped to 0 or less
    if (checkDeathAndMaybeRender()) return;

    const hpAfter = getHP();
    const repAfter = getRep();
    const xpAfter = getXP();
    const lvlAfter = getLevel();

    // System narration for HP changes (always)
    const hpDelta = hpAfter - hpBefore;
    if (hpDelta !== 0) {
      const sign = hpDelta > 0 ? "+" : "";
      addSystemLine(`${contextLabel ? contextLabel + ": " : ""}HP ${sign}${hpDelta} (now ${hpAfter}).`);
    }

    // Optional: mild feedback for Rep changes
    const repDelta = repAfter - repBefore;
    if (repDelta !== 0) {
      const sign = repDelta > 0 ? "+" : "";
      addSystemLine(`${contextLabel ? contextLabel + ": " : ""}Rep ${sign}${repDelta} (now ${repAfter}).`);
    }

    // Optional: mild feedback for XP/Level changes
    if (lvlAfter !== lvlBefore) {
      // Level-up already prints a system line in addXP; keep this minimal
    }
    const xpDelta = xpAfter - xpBefore;
    if (xpDelta !== 0) {
      const sign = xpDelta > 0 ? "+" : "";
      addSystemLine(`${contextLabel ? contextLabel + ": " : ""}XP ${sign}${xpDelta} (now ${xpAfter}).`);
    }
  }

  // ---------- checks & timing ----------
  function runChecks(section) {
    for (const chk of (section.checks || [])) {
      let pass = false;

      if (chk.stat) {
        // Support both old names and new letters (W/E/A/L/T/H)
        const key = String(chk.stat);
        const val =
          (STATE.stats?.[key] != null) ? Number(STATE.stats[key])
          : (STATE.stats?.[key[0]] != null ? Number(STATE.stats[key[0]]) : 0);
        pass = val >= Number(chk.dc ?? 0);
      }

      if (chk.resource) {
        const key = String(chk.resource);
        if (key === "HP") pass = getHP() >= Number(chk.dc ?? 0);
        else if (key === "REPUTATION") pass = getRep() >= Number(chk.dc ?? 0);
      }

      const ops = pass ? (chk.onPass || []) : (chk.onFail || []);
      applyOpsWithHPLog(ops, pass ? "Check pass" : "Check fail");
      if (STATE.isDead) return;
    }
  }

  function isExpired(choice) {
    const t = choice.timing;
    if (!t || t.mode !== "EXPIRE") return false;
    return Number(STATE.choiceCount ?? 0) >= Number(t.expiresAfterChoiceCount ?? Infinity);
  }

  function applySoftPenalty(choice) {
    const t = choice.timing;
    if (!t || t.mode !== "SOFT") return;

    const lateAfter = Number(t.lateAfterChoiceCount ?? Infinity);
    if (Number(STATE.choiceCount ?? 0) < lateAfter) return;

    // Hint timing penalty (your requirement)
    addSystemLine("You hesitated. (Timing penalty)");
    applyOpsWithHPLog(t.penalty || [], "Timing");
  }

  function meetsRequires(req) {
    if (!req) return true;

    if (Array.isArray(req.anyOf)) return req.anyOf.some(meetsRequires);

    if (req.hasItem) return hasItem(req.hasItem.slot, req.hasItem.itemId);

    if (req.minResource) {
      const r = req.minResource.resource;
      const amt = Number(req.minResource.amount ?? 0);
      if (r === "HP") return getHP() >= amt;
      if (r === "REPUTATION") return getRep() >= amt;
      return true;
    }

    if (req.flagTrue) return !!STATE.flags?.[req.flagTrue];

    // optionalItem: always show for MVP (matches earlier behavior)
    return true;
  }

  // ---------- modals ----------
  function ensureModal() {
    let bd = document.getElementById("modalBackdrop");
    if (bd) return bd;

    bd = document.createElement("div");
    bd.id = "modalBackdrop";
    bd.className = "modal-backdrop";
    bd.innerHTML = `<div class="modal" id="modalCard"></div>`;
    document.body.appendChild(bd);

    bd.addEventListener("click", (e) => {
      if (e.target === bd) closeModal();
    });

    return bd;
  }

  function openModal(html) {
    const bd = ensureModal();
    const card = document.getElementById("modalCard");
    card.innerHTML = html;
    bd.style.display = "block";
    const closeBtn = card.querySelector("[data-close]");
    if (closeBtn) closeBtn.onclick = closeModal;
  }

  function closeModal() {
    const bd = document.getElementById("modalBackdrop");
    if (bd) bd.style.display = "none";
  }

  function openCharacterSheet() {
    const s = STATE.stats || {};
    openModal(`
      <h3>Character Sheet</h3>

      <div class="hr"></div>
      <div style="font-weight:700; margin-bottom:8px;">WEALTH</div>
      <div class="kv">
        <div class="cell"><div class="label">W</div><div class="value">${esc(s.W)}</div></div>
        <div class="cell"><div class="label">E</div><div class="value">${esc(s.E)}</div></div>
        <div class="cell"><div class="label">A</div><div class="value">${esc(s.A)}</div></div>
        <div class="cell"><div class="label">L</div><div class="value">${esc(s.L)}</div></div>
        <div class="cell"><div class="label">T</div><div class="value">${esc(s.T)}</div></div>
        <div class="cell"><div class="label">H</div><div class="value">${esc(s.H)}</div></div>
      </div>

      <div class="hr"></div>
      <div class="kv">
        <div class="cell"><div class="label">HP</div><div class="value">${esc(getHP())}</div></div>
        <div class="cell"><div class="label">Reputation</div><div class="value">${esc(getRep())}</div></div>
        <div class="cell"><div class="label">Level</div><div class="value">${esc(getLevel())}</div></div>
        <div class="cell"><div class="label">XP</div><div class="value">${esc(getXP())} / ${esc(xpToNextLevel(getLevel()))}</div></div>
      </div>

      <div class="hr"></div>
      <button data-close="1">Close</button>
    `);
  }

  function openInventory() {
    const inv = STATE.inventory || {};
    const renderList = (label, arr, cap) => {
      const a = Array.isArray(arr) ? arr : [];
      return `
        <div class="panel" style="padding:12px;">
          <div style="font-weight:700;margin-bottom:6px;">${esc(label)} <span class="small">(${a.length}/${cap})</span></div>
          ${a.length ? a.map((x) => `<span class="pill">${esc(x)}</span>`).join("") : `<div class="small">Empty</div>`}
        </div>
      `;
    };

    openModal(`
      <h3>Inventory</h3>
      <div class="list">
        ${renderList("Consumables", inv.consumables, MAX_CONSUMABLES)}
        ${renderList("Weapons", inv.weapons, MAX_WEAPONS)}
        ${renderList("Armors", inv.armors, MAX_ARMORS)}
        ${renderList("Special Items", inv.specialItems, MAX_SPECIALS)}
      </div>
      <div class="hr"></div>
      <button data-close="1">Close</button>
    `);
  }

  // ---------- UI rendering ----------
  function renderTopBar() {
    // Inventory counters (hardlocked caps)
    const c = invCount("consumables");
    const w = invCount("weapons");
    const a = invCount("armors");
    const s = invCount("specialItems");

    return `
      <div class="panel topbar">
        <div class="hud">
          <span><strong>HP</strong>: ${getHP()}</span>
          <span><strong>LVL</strong>: ${getLevel()}</span>
          <span><strong>XP</strong>: ${getXP()} / ${xpToNextLevel(getLevel())}</span>
        </div>
        <div class="hud">
          <span><strong>C</strong>: ${c}/${MAX_CONSUMABLES}</span>
          <span><strong>W</strong>: ${w}/${MAX_WEAPONS}</span>
          <span><strong>A</strong>: ${a}/${MAX_ARMORS}</span>
          <span><strong>S</strong>: ${s}/${MAX_SPECIALS}</span>
        </div>
        <div class="actions">
          <button data-char="1">Character</button>
          <button data-inv="1">Inventory</button>
          ${VC_SLOTS.map((n) => `<button data-save="${n}">Save ${n}</button>`).join("")}
          ${VC_SLOTS.map((n) => `<button data-load="${n}">Load ${n}</button>`).join("")}
          <button data-menu="1">Main Menu</button>
        </div>
      </div>
    `;
  }

  function wireTopBar() {
    const charBtn = $("[data-char]");
    const invBtn = $("[data-inv]");
    const menuBtn = $("[data-menu]");

    if (charBtn) charBtn.onclick = openCharacterSheet;
    if (invBtn) invBtn.onclick = openInventory;
    if (menuBtn) menuBtn.onclick = renderMainMenu;

    document.querySelectorAll("[data-save]").forEach((b) => {
      b.onclick = () => {
        const slot = Number(b.getAttribute("data-save"));
        saveToSlot(slot);
        alert(`Saved to slot ${slot}`);
      };
    });

    document.querySelectorAll("[data-load]").forEach((b) => {
      b.onclick = () => {
        const slot = Number(b.getAttribute("data-load"));
        const loaded = loadFromSlot(slot);
        if (!loaded) return alert(`No save found in slot ${slot}`);
        STATE = normalizeState(loaded, STORY);
        if (STATE.isDead && getHP() > 0) STATE.isDead = false;
        STATE.lastSlot = slot;
        enterSection(STATE.sectionId || STORY.startSectionId);
      };
    });
  }

  function renderMainMenu() {
    try {
      const meta = VC_SLOTS.map((n) => ({ slot: n, meta: slotMeta(n) }));
      const hasAny = meta.some((x) => !!x.meta);

      app.innerHTML = `
        <div class="panel">
          <h2 style="margin:0;">LORECRAFT</h2>
          <p style="margin:6px 0 0 0; color: var(--muted2);">The World That Notices</p>

          <div class="menu-grid">
            <button id="btnNew">New Story</button>
            <button id="btnContinue" ${hasAny ? "" : "disabled"}>Continue</button>
            <button id="btnSettings">Settings</button>
            <button id="btnAbout">About</button>
          </div>

          <div id="settingsPanel" style="display:none; margin-top: 14px;">
            <div class="hr"></div>
            <h3 style="margin:0 0 6px 0;">Settings</h3>
            <div class="small">
              Timing is always active and subtle. Choices may change or disappear without warning.<br/>
              Saves are stored locally in your browser (no account).
            </div>
          </div>

          <div id="aboutPanel" style="display:none; margin-top: 14px;">
            <div class="hr"></div>
            <h3 style="margin:0 0 6px 0;">About</h3>
            <div class="small">
              Demo systems: WEALTH (W·E·A·L·T·H), Timing pressure, Inventory caps (9 each), and Reputation reactions.
            </div>
          </div>

          <div class="hr"></div>
          <h3 style="margin:0 0 8px 0;">Save Slots</h3>

          ${meta
            .map(
              ({ slot, meta }) => `
            <div class="panel" style="padding:12px; margin-bottom:10px; background: var(--panel2);">
              <div style="display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap; align-items:center;">
                <div>
                  <strong>Slot ${slot}</strong><br/>
                  <span class="small">
                    ${meta ? `Saved: ${esc(meta.savedAt)} · At: ${esc(meta.sectionId)}` : "Empty"}
                  </span>
                </div>
                <div class="actions">
                  <button data-loadslot="${slot}" ${meta ? "" : "disabled"}>Load</button>
                  <button data-clearslot="${slot}" ${meta ? "" : "disabled"}>Clear</button>
                </div>
              </div>
            </div>
          `
            )
            .join("")}
        </div>
      `;

      // Wire menu
      const btnNew = document.getElementById("btnNew");
      const btnContinue = document.getElementById("btnContinue");
      const btnSettings = document.getElementById("btnSettings");
      const btnAbout = document.getElementById("btnAbout");
      const settingsPanel = document.getElementById("settingsPanel");
      const aboutPanel = document.getElementById("aboutPanel");

      if (btnNew) {
        btnNew.onclick = () => {
          STATE = normalizeState(deepCopy(STORY.save.defaults || {}), STORY);
          STATE.isDead = false;
          enterSection(STORY.startSectionId);
        };
      }

      if (btnContinue) {
        btnContinue.onclick = () => {
          const best = mostRecentSlot();
          if (!best) return;
          const loaded = loadFromSlot(best);
          if (!loaded) return alert("Could not load the most recent save.");
          STATE = normalizeState(loaded, STORY);
          if (STATE.isDead && getHP() > 0) STATE.isDead = false;
          STATE.lastSlot = best;
          enterSection(STATE.sectionId || STORY.startSectionId);
        };
      }

      if (btnSettings && settingsPanel) {
        btnSettings.onclick = () => {
          settingsPanel.style.display = settingsPanel.style.display === "none" ? "block" : "none";
        };
      }

      if (btnAbout && aboutPanel) {
        btnAbout.onclick = () => {
          aboutPanel.style.display = aboutPanel.style.display === "none" ? "block" : "none";
        };
      }

      document.querySelectorAll("[data-loadslot]").forEach((b) => {
        b.onclick = () => {
          const slot = Number(b.getAttribute("data-loadslot"));
          const loaded = loadFromSlot(slot);
          if (!loaded) return;
          STATE = normalizeState(loaded, STORY);
          if (STATE.isDead && getHP() > 0) STATE.isDead = false;
          STATE.lastSlot = slot;
          enterSection(STATE.sectionId || STORY.startSectionId);
        };
      });

      document.querySelectorAll("[data-clearslot]").forEach((b) => {
        b.onclick = () => {
          const slot = Number(b.getAttribute("data-clearslot"));
          clearSlot(slot);
          renderMainMenu();
        };
      });
    } catch (e) {
      showError("Menu render failed", String(e));
    }
  }

  function renderDeathScreen() {
    // Keep it unmistakable and actionable
    app.innerHTML = `
      <div class="panel">
        <h2 class="notice-bad" style="margin:0;">YOU DIED</h2>
        <p class="small" style="margin-top:8px;">
          Your hit points reached zero. The story stops here.
        </p>
        <div class="hr"></div>
        <div class="menu-grid">
          <button id="btnDeathMenu">Return to Main Menu</button>
          <button id="btnDeathRestart">Restart Story</button>
        </div>
        <div class="hr"></div>
        <h3 style="margin:0 0 8px 0;">Load a Save</h3>
        <div class="actions">
          ${VC_SLOTS.map((n) => `<button data-deathload="${n}">Load ${n}</button>`).join("")}
        </div>
        <p class="small" style="margin-top:12px;">
          Tip: Use saves before risky choices. Timing penalties can hurt.
        </p>
      </div>
    `;

    const btnMenu = document.getElementById("btnDeathMenu");
    const btnRestart = document.getElementById("btnDeathRestart");
    if (btnMenu) btnMenu.onclick = () => renderMainMenu();
    if (btnRestart) {
      btnRestart.onclick = () => {
        STATE = normalizeState(deepCopy(STORY.save.defaults || {}), STORY);
        STATE.isDead = false;
        enterSection(STORY.startSectionId);
      };
    }

    document.querySelectorAll("[data-deathload]").forEach((b) => {
      b.onclick = () => {
        const slot = Number(b.getAttribute("data-deathload"));
        const loaded = loadFromSlot(slot);
        if (!loaded) return alert(`No save found in slot ${slot}`);
        STATE = normalizeState(loaded, STORY);
        STATE.isDead = false;
        enterSection(STATE.sectionId || STORY.startSectionId);
      };
    });
  }

  function renderScene(section) {
    const art = section.art || { mode: "glyph", glyph: "✦", mood: "…" };
    const glyph = art.glyph || "✦";
    const mood = art.mood || "…";
    return `
      <div class="scene">
        <div class="glyph">${esc(glyph)}</div>
        <div class="meta">
          <div style="font-weight:700;">${esc(section.title)}</div>
          <div class="mood">${esc(mood)}</div>
        </div>
      </div>
    `;
  }

  function renderParagraph(p) {
    const s = String(p ?? "");
    // System lines start with em dash
    if (s.startsWith("—")) {
      return `<p class="small" style="font-style:italic; opacity:.9;">${esc(s)}</p>`;
    }
    return `<p>${esc(s)}</p>`;
  }

  function renderSection(section) {
    const baseText = section.text || [];
    const extraText = STATE._runtimeText || [];
    const allText = [...baseText, ...extraText];

    const choices = (section.choices || [])
      .filter((c) => meetsRequires(c.requires))
      .filter((c) => !isExpired(c));

    app.innerHTML = `
      ${renderTopBar()}
      <div class="panel">
        ${renderScene(section)}
        <div class="story">
          ${allText.map(renderParagraph).join("")}
        </div>
        <div class="choices">
          ${choices.map((c) => `<button class="choiceBtn" data-choice="${esc(c.id)}">${esc(c.text)}</button>`).join("")}
        </div>
        <div class="small">Section ${esc(section.id)} · Choices made: ${Number(STATE.choiceCount || 0)}</div>
      </div>
    `;

    wireTopBar();

    document.querySelectorAll("[data-choice]").forEach((btn) => {
      btn.onclick = () => choose(btn.getAttribute("data-choice"));
    });
  }

  function enterSection(sectionId) {
    const section = getSection(sectionId);
    if (!section) return showError("Engine error", `Section not found: ${sectionId}`);

    // If dead, do not proceed
    if (STATE.isDead) return renderDeathScreen();

    STATE.sectionId = sectionId;
    STATE._runtimeText = [];
    if (!STATE.visited.includes(sectionId)) STATE.visited.push(sectionId);

    // Apply onEnter ops with logging
    applyOpsWithHPLog(section.onEnter || [], "On enter");
    if (STATE.isDead) return;

    // Run checks with logging
    runChecks(section);
    if (STATE.isDead) return;

    // Render
    renderSection(section);
  }

  function choose(choiceId) {
    if (STATE.isDead) return renderDeathScreen();

    const current = getSection(STATE.sectionId);
    if (!current) return showError("Engine error", "Current section missing.");

    const choice = (current.choices || []).find((c) => c.id === choiceId);
    if (!choice) return;

    // Count choice
    STATE.choiceCount = Number(STATE.choiceCount || 0) + 1;

    // Expired choices
    if (isExpired(choice)) {
      STATE._runtimeText = [];
      addSystemLine("Too late. The option is gone.");
      renderSection(current);
      return;
    }

    // Apply timing penalty (hinted)
    applySoftPenalty(choice);
    if (STATE.isDead) return;

    // Apply onChoose ops with logging
    applyOpsWithHPLog(choice.onChoose || [], "Choice");
    if (STATE.isDead) return;

    // Special destinations (supported, even if not used yet)
    if (choice.to === "MENU") return renderMainMenu();
    if (choice.to === "CHARACTER") return openCharacterSheet();
    if (choice.to === "INVENTORY") return openInventory();

    return enterSection(choice.to);
  }

  // ---------- boot ----------
  async function boot() {
    if (!app) return;

    app.innerHTML = `<div class="panel"><p>Loading world…</p></div>`;

    const jsonPath = "./lorecraft_tutorial.story.json";
    const res = await fetch(jsonPath, { cache: "no-store" });
    if (!res.ok) return showError("Boot failed", `Could not fetch ${jsonPath}\nHTTP: ${res.status} ${res.statusText}`);

    const raw = await res.text();
    let story;
    try {
      story = JSON.parse(raw);
    } catch (e) {
      return showError("Boot failed", `JSON parse failed: ${e.message}\n\nFirst 400 chars:\n${raw.slice(0, 400)}`);
    }

    if (!story?.sections || !Array.isArray(story.sections) || !story.startSectionId) {
      return showError("Boot failed", "Story JSON missing sections[] or startSectionId.");
    }
    if (!story.save?.defaults) {
      // Still load, but warn
      story.save = story.save || {};
      story.save.defaults = story.save.defaults || {};
    }

    STORY = story;
    STATE = normalizeState(deepCopy(STORY.save.defaults || {}), STORY);

    // If an old save had HEALTH resource, ignore it safely
    if (STATE.resources && "HEALTH" in STATE.resources) delete STATE.resources.HEALTH;

    // If HP starts <= 0 (bad save), recover to 1
    if (getHP() <= 0) setHP(1);

    renderMainMenu();
  }

  boot();
})();