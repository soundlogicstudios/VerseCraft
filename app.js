// app.js — VerseCraft / Lorecraft demo (v1.2 UI iteration)
// This iteration implements:
// 1) HUD: remove inventory cap counters
// 2) HUD: only ONE Save + ONE Load button (slot-picker modal)
// 3) Scene window becomes an IMAGE PLACEHOLDER only (no story text inside)
// 4) Push all narrative text into the story text box
//
// Expected in repo root: index.html, styles.css, app.js, lorecraft_tutorial.story.json

const VC_SLOTS = [1, 2, 3];
const VC_STORAGE_PREFIX = "versecraft_slot_";

// Inventory caps still enforced (not shown in HUD)
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
        <pre class="prewrap">${esc(body)}</pre>
        <div class="hr"></div>
        <button id="btnBackToMenu">Back to Menu</button>
      </div>
    `;
    const btn = document.getElementById("btnBackToMenu");
    if (btn) btn.onclick = () => renderMainMenu();
  }

  window.addEventListener("error", (e) => {
    showError("JavaScript error", `${e.message}\n${e.filename}:${e.lineno}:${e.colno}`);
  });
  window.addEventListener("unhandledrejection", (e) => {
    showError("Unhandled promise rejection", String(e.reason ?? e));
  });

  // ---------- modal ----------
  function ensureModal() {
    let bd = document.getElementById("modalBackdrop");
    if (bd) return bd;

    bd = document.createElement("div");
    bd.id = "modalBackdrop";
    bd.className = "modal-backdrop";
    bd.style.display = "none";
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

  // ---------- state normalization ----------
  function normalizeState(s, storyObj) {
    if (!s || typeof s !== "object") s = {};
    const d = storyObj?.save?.defaults || {};

    // WEALTH stats: W E A L T H
    s.stats =
      (s.stats && typeof s.stats === "object")
        ? s.stats
        : (d.stats || { W: 1, E: 1, A: 1, L: 1, T: 1, H: 1 });

    // Back-compat mapping from older keys
    if (s.stats && typeof s.stats === "object") {
      if (s.stats.W == null && s.stats.WISDOM != null) s.stats.W = s.stats.WISDOM;
      if (s.stats.E == null && s.stats.ENDURANCE != null) s.stats.E = s.stats.ENDURANCE;
      if (s.stats.A == null && s.stats.AGILITY != null) s.stats.A = s.stats.AGILITY;
      if (s.stats.L == null && s.stats.LUCK != null) s.stats.L = s.stats.LUCK;
      if (s.stats.T == null && s.stats.TIMING != null) s.stats.T = s.stats.TIMING;
      if (s.stats.H == null) s.stats.H = 1;
    }

    // Resources: HP + optional Reputation. NO Health resource.
    s.resources =
      (s.resources && typeof s.resources === "object")
        ? s.resources
        : (d.resources || { HP: 10, REPUTATION: 0 });

    if (s.resources && "HEALTH" in s.resources) delete s.resources.HEALTH;
    if (s.resources.HP == null) s.resources.HP = 10;
    if (s.resources.REPUTATION == null) s.resources.REPUTATION = 0;

    // Progress
    s.progress =
      (s.progress && typeof s.progress === "object")
        ? s.progress
        : (d.progress || { level: 1, xp: 0 });

    if (typeof s.progress.level !== "number") s.progress.level = 1;
    if (typeof s.progress.xp !== "number") s.progress.xp = 0;

    // Inventory
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
    const payload = { storyId: STORY.storyId, savedAt: new Date().toISOString(), state: STATE };
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
      return {
        savedAt: parsed.savedAt,
        sectionId: parsed.state?.sectionId ?? "(unknown)",
        hp: parsed.state?.resources?.HP ?? null,
      };
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

  function openSavePicker() {
    const items = VC_SLOTS.map((n) => {
      const meta = slotMeta(n);
      return `
        <div class="picker-row">
          <div class="picker-info">
            <div class="picker-title">Slot ${n}</div>
            <div class="picker-sub">
              ${meta ? `Saved · ${esc(meta.savedAt)} · ${esc(meta.sectionId)}` : "Empty"}
            </div>
          </div>
          <div class="picker-actions">
            <button data-pick-save="${n}">Save</button>
            <button data-pick-clear="${n}" ${meta ? "" : "disabled"}>Clear</button>
          </div>
        </div>
      `;
    }).join("");

    openModal(`
      <div class="modal-header">
        <h3>Save</h3>
        <button class="icon-btn" data-close="1" aria-label="Close">✕</button>
      </div>
      <div class="picker">
        ${items}
      </div>
      <div class="hr"></div>
      <div class="small">Saves are stored locally on this device/browser.</div>
    `);

    document.querySelectorAll("[data-pick-save]").forEach((b) => {
      b.onclick = () => {
        const slot = Number(b.getAttribute("data-pick-save"));
        saveToSlot(slot);
        closeModal();
        addSystemLine(`Saved to slot ${slot}.`, "neutral");
        // re-render current section to show system line immediately
        const cur = getSection(STATE.sectionId);
        if (cur) renderSection(cur);
      };
    });

    document.querySelectorAll("[data-pick-clear]").forEach((b) => {
      b.onclick = () => {
        const slot = Number(b.getAttribute("data-pick-clear"));
        clearSlot(slot);
        closeModal();
      };
    });
  }

  function openLoadPicker() {
    const items = VC_SLOTS.map((n) => {
      const meta = slotMeta(n);
      return `
        <div class="picker-row">
          <div class="picker-info">
            <div class="picker-title">Slot ${n}</div>
            <div class="picker-sub">
              ${meta ? `Saved · ${esc(meta.savedAt)} · ${esc(meta.sectionId)}` : "Empty"}
            </div>
          </div>
          <div class="picker-actions">
            <button data-pick-load="${n}" ${meta ? "" : "disabled"}>Load</button>
          </div>
        </div>
      `;
    }).join("");

    openModal(`
      <div class="modal-header">
        <h3>Load</h3>
        <button class="icon-btn" data-close="1" aria-label="Close">✕</button>
      </div>
      <div class="picker">
        ${items}
      </div>
      <div class="hr"></div>
      <div class="small">Loading will replace your current run state.</div>
    `);

    document.querySelectorAll("[data-pick-load]").forEach((b) => {
      b.onclick = () => {
        const slot = Number(b.getAttribute("data-pick-load"));
        const loaded = loadFromSlot(slot);
        if (!loaded) return alert(`No save found in slot ${slot}`);
        closeModal();
        STATE = normalizeState(loaded, STORY);
        if (STATE.isDead && getHP() > 0) STATE.isDead = false;
        STATE.lastSlot = slot;
        enterSection(STATE.sectionId || STORY.startSectionId);
      };
    });
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
    return 100 * level;
  }

  // ---------- system lines (tiered) ----------
  // tier: whisper | neutral | explicit
  function addSystemLine(msg, tier = "neutral") {
    STATE._runtimeText = STATE._runtimeText || [];
    const t = (tier === "whisper" || tier === "explicit" || tier === "neutral") ? tier : "neutral";
    STATE._runtimeText.push({ __sys: true, tier: t, text: String(msg) });
  }

  function checkDeathAndMaybeRender() {
    if (STATE.isDead) return true;
    if (getHP() > 0) return false;
    STATE.isDead = true;
    renderDeathScreen();
    return true;
  }

  // ---------- inventory caps (enforced) ----------
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

  function addItem(slot, itemId) {
    if (!Array.isArray(STATE.inventory[slot])) STATE.inventory[slot] = [];
    const cap = invCapFor(slot);
    if (STATE.inventory[slot].includes(itemId)) return true;

    if (STATE.inventory[slot].length >= cap) {
      addSystemLine(`${invLabel(slot)} full (${STATE.inventory[slot].length}/${cap}). Item not added.`, "neutral");
      return false;
    }

    STATE.inventory[slot].push(itemId);
    addSystemLine(`Item gained: ${itemId}`, "whisper");
    return true;
  }

  function removeItem(slot, itemId) {
    if (!Array.isArray(STATE.inventory[slot])) return false;
    const before = STATE.inventory[slot].length;
    STATE.inventory[slot] = STATE.inventory[slot].filter((x) => x !== itemId);
    if (STATE.inventory[slot].length !== before) {
      addSystemLine(`Item used: ${itemId}`, "whisper");
      return true;
    }
    return false;
  }

  function hasItem(slot, itemId) {
    return (STATE.inventory?.[slot] || []).includes(itemId);
  }

  // ---------- ops & logging ----------
  function applyOp(op) {
    if (!op || !op.op) return;

    switch (op.op) {
      case "ADD_RESOURCE": {
        const res = op.resource;
        const amt = Number(op.amount ?? 0);

        if (res === "HP") {
          setHP(getHP() + amt);
        } else if (res === "REPUTATION") {
          STATE.resources.REPUTATION = getRep() + amt;
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

      case "ADD_XP":
        // Safe: if JSON starts using it later
        addXP(Number(op.amount ?? 0));
        break;

      default:
        break;
    }
  }

  function applyOpsWithHPLog(ops, contextLabel, timingHintTier = null) {
    const hpBefore = getHP();
    const repBefore = getRep();
    const xpBefore = getXP();
    const lvlBefore = getLevel();

    for (const op of (ops || [])) applyOp(op);

    if (checkDeathAndMaybeRender()) return;

    const hpAfter = getHP();
    const repAfter = getRep();
    const xpAfter = getXP();
    const lvlAfter = getLevel();

    const hpDelta = hpAfter - hpBefore;
    if (hpDelta !== 0) {
      const sign = hpDelta > 0 ? "+" : "";
      // Damage/heal should be at least neutral so it's visible
      addSystemLine(`${contextLabel ? contextLabel + ": " : ""}HP ${sign}${hpDelta} (now ${hpAfter}).`, "neutral");
    }

    const repDelta = repAfter - repBefore;
    if (repDelta !== 0) {
      const sign = repDelta > 0 ? "+" : "";
      addSystemLine(`${contextLabel ? contextLabel + ": " : ""}Rep ${sign}${repDelta} (now ${repAfter}).`, "whisper");
    }

    const xpDelta = xpAfter - xpBefore;
    if (xpDelta !== 0) {
      const sign = xpDelta > 0 ? "+" : "";
      addSystemLine(`${contextLabel ? contextLabel + ": " : ""}XP ${sign}${xpDelta}.`, "whisper");
    }

    if (lvlAfter !== lvlBefore) {
      addSystemLine(`Level up! You are now Level ${lvlAfter}.`, "explicit");
    }

    // Optional additional hint (used for Timing)
    if (timingHintTier) {
      addSystemLine("You hesitated. (Timing penalty)", timingHintTier);
    }
  }

  // XP leveling (kept simple)
  function addXP(amount) {
    const a = Number(amount ?? 0);
    STATE.progress.xp = Math.max(0, getXP() + a);
    while (getXP() >= xpToNextLevel(getLevel())) {
      STATE.progress.xp -= xpToNextLevel(getLevel());
      STATE.progress.level += 1;
    }
  }

  // ---------- checks & timing ----------
  function runChecks(section) {
    for (const chk of (section.checks || [])) {
      let pass = false;

      if (chk.stat) {
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

    // Hint timing penalties (whisper tier)
    applyOpsWithHPLog(t.penalty || [], "Timing", "whisper");
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

    return true;
  }

  // ---------- Character + Inventory modals ----------
  function openCharacterSheet() {
    const s = STATE.stats || {};
    openModal(`
      <div class="modal-header">
        <h3>Character Sheet</h3>
        <button class="icon-btn" data-close="1" aria-label="Close">✕</button>
      </div>

      <div class="hr"></div>
      <div class="label-block">WEALTH</div>
      <div class="wealth-grid">
        <div class="wealth-cell"><div class="wealth-k">W</div><div class="wealth-v">${esc(s.W)}</div></div>
        <div class="wealth-cell"><div class="wealth-k">E</div><div class="wealth-v">${esc(s.E)}</div></div>
        <div class="wealth-cell"><div class="wealth-k">A</div><div class="wealth-v">${esc(s.A)}</div></div>
        <div class="wealth-cell"><div class="wealth-k">L</div><div class="wealth-v">${esc(s.L)}</div></div>
        <div class="wealth-cell"><div class="wealth-k">T</div><div class="wealth-v">${esc(s.T)}</div></div>
        <div class="wealth-cell"><div class="wealth-k">H</div><div class="wealth-v">${esc(s.H)}</div></div>
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
        <div class="panel panel-soft">
          <div class="panel-title">${esc(label)} <span class="small">(${a.length}/${cap})</span></div>
          ${a.length ? a.map((x) => `<span class="pill">${esc(x)}</span>`).join("") : `<div class="small">Empty</div>`}
        </div>
      `;
    };

    openModal(`
      <div class="modal-header">
        <h3>Inventory</h3>
        <button class="icon-btn" data-close="1" aria-label="Close">✕</button>
      </div>

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
    // HUD simplified: HP, LVL, XP only + actions (single Save/Load)
    return `
      <div class="panel topbar">
        <div class="hud">
          <span><strong>HP</strong>: ${getHP()}</span>
          <span><strong>LVL</strong>: ${getLevel()}</span>
          <span><strong>XP</strong>: ${getXP()} / ${xpToNextLevel(getLevel())}</span>
        </div>
        <div class="actions">
          <button data-char="1">Character</button>
          <button data-inv="1">Inventory</button>
          <button data-saveone="1">Save</button>
          <button data-loadone="1">Load</button>
          <button data-menu="1">Main Menu</button>
        </div>
      </div>
    `;
  }

  function wireTopBar() {
    const charBtn = $("[data-char]");
    const invBtn = $("[data-inv]");
    const menuBtn = $("[data-menu]");
    const saveBtn = $("[data-saveone]");
    const loadBtn = $("[data-loadone]");

    if (charBtn) charBtn.onclick = openCharacterSheet;
    if (invBtn) invBtn.onclick = openInventory;
    if (menuBtn) menuBtn.onclick = renderMainMenu;
    if (saveBtn) saveBtn.onclick = openSavePicker;
    if (loadBtn) loadBtn.onclick = openLoadPicker;
  }

  function renderMainMenu() {
    try {
      const meta = VC_SLOTS.map((n) => ({ slot: n, meta: slotMeta(n) }));
      const hasAny = meta.some((x) => !!x.meta);

      app.innerHTML = `
        <div class="panel">
          <h2 class="title">LORECRAFT</h2>
          <p class="subtitle">The World That Notices</p>

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
              Timing is active and fair: when it hurts, you’ll see it.<br/>
              Saves are stored locally (no account).
            </div>
          </div>

          <div id="aboutPanel" style="display:none; margin-top: 14px;">
            <div class="hr"></div>
            <h3 style="margin:0 0 6px 0;">About</h3>
            <div class="small">
              Demo systems: WEALTH (W·E·A·L·T·H), Timing pressure, Inventory caps, and Reputation reactions.
            </div>
          </div>

          <div class="hr"></div>
          <h3 style="margin:0 0 8px 0;">Save Slots</h3>

          ${meta
            .map(
              ({ slot, meta }) => `
            <div class="panel panel-soft slot-row">
              <div class="slot-left">
                <strong>Slot ${slot}</strong><br/>
                <span class="small">
                  ${meta ? `Saved: ${esc(meta.savedAt)} · At: ${esc(meta.sectionId)}` : "Empty"}
                </span>
              </div>
              <div class="slot-right actions">
                <button data-loadslot="${slot}" ${meta ? "" : "disabled"}>Load</button>
                <button data-clearslot="${slot}" ${meta ? "" : "disabled"}>Clear</button>
              </div>
            </div>
          `
            )
            .join("")}
        </div>
      `;

      const btnNew = document.getElementById("btnNew");
      const btnContinue = document.getElementById("btnContinue");
      const btnSettings = document.getElementById("btnSettings");
      const btnAbout = document.getElementById("btnAbout");
      const settingsPanel = document.getElementById("settingsPanel");
      const aboutPanel = document.getElementById("aboutPanel");

      if (btnNew) {
        btnNew.onclick = () => {
          STATE = normalizeState(deepCopy(STORY.save?.defaults || {}), STORY);
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
          <button id="btnDeathLoad">Load Save</button>
        </div>
        <p class="small" style="margin-top:12px;">
          Tip: Timing penalties are fair — when you’re late, the system will whisper it.
        </p>
      </div>
    `;

    const btnMenu = document.getElementById("btnDeathMenu");
    const btnRestart = document.getElementById("btnDeathRestart");
    const btnLoad = document.getElementById("btnDeathLoad");

    if (btnMenu) btnMenu.onclick = () => renderMainMenu();
    if (btnRestart) {
      btnRestart.onclick = () => {
        STATE = normalizeState(deepCopy(STORY.save?.defaults || {}), STORY);
        STATE.isDead = false;
        enterSection(STORY.startSectionId);
      };
    }
    if (btnLoad) btnLoad.onclick = () => openLoadPicker();
  }

  // ---------- Scene placeholder (image only) ----------
  function renderScenePlaceholder(section) {
    // No story text here. Only a placeholder for image/video in future.
    // You can later swap the <img> src with story-driven art.
    const art = section?.art || null;
    const alt = art?.alt || "Scene art";
    const src = art?.src || ""; // optional future field; for now, blank

    return `
      <div class="scene-placeholder" aria-label="Scene image placeholder">
        ${src
          ? `<img class="scene-img" src="${esc(src)}" alt="${esc(alt)}" />`
          : `<div class="scene-fallback">
               <div class="scene-badge">IMAGE PLACEHOLDER</div>
               <div class="scene-hint">Future: scene image or video</div>
             </div>`
        }
      </div>
    `;
  }

  // ---------- rendering ----------
  function renderParagraph(p) {
    // System line objects
    if (p && typeof p === "object" && p.__sys) {
      const tier = p.tier || "neutral";
      return `<p class="sys sys-${esc(tier)}">— ${esc(p.text)}</p>`;
    }

    // Regular text
    const s = String(p ?? "");
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
      <div class="panel story-shell">
        ${renderScenePlaceholder(section)}
        <div class="story-box">
          <div class="story">
            ${allText.map(renderParagraph).join("")}
          </div>
        </div>
        <div class="choices">
          ${choices.map((c) => `<button class="choiceBtn" data-choice="${esc(c.id)}">${esc(c.text)}</button>`).join("")}
        </div>
        <div class="small footerline">Section ${esc(section.id)} · Choices made: ${Number(STATE.choiceCount || 0)}</div>
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

    if (STATE.isDead) return renderDeathScreen();

    STATE.sectionId = sectionId;
    STATE._runtimeText = [];
    if (!STATE.visited.includes(sectionId)) STATE.visited.push(sectionId);

    // onEnter ops with logging
    applyOpsWithHPLog(section.onEnter || [], "On enter");
    if (STATE.isDead) return;

    runChecks(section);
    if (STATE.isDead) return;

    renderSection(section);
  }

  function choose(choiceId) {
    if (STATE.isDead) return renderDeathScreen();

    const current = getSection(STATE.sectionId);
    if (!current) return showError("Engine error", "Current section missing.");

    const choice = (current.choices || []).find((c) => c.id === choiceId);
    if (!choice) return;

    STATE.choiceCount = Number(STATE.choiceCount || 0) + 1;

    if (isExpired(choice)) {
      STATE._runtimeText = [];
      addSystemLine("Too late. The option is gone.", "whisper");
      renderSection(current);
      return;
    }

    applySoftPenalty(choice);
    if (STATE.isDead) return;

    applyOpsWithHPLog(choice.onChoose || [], "Choice");
    if (STATE.isDead) return;

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

    STORY = story;
    STATE = normalizeState(deepCopy(STORY.save?.defaults || {}), STORY);

    // If HP starts <= 0 (bad save), recover to 1
    if (getHP() <= 0) setHP(1);

    renderMainMenu();
  }

  boot();
})();