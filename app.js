// app.js — VerseCraft / Lorecraft demo (v1.2+)
// Full-file replace: Tap-to-Start + VerseCraft skin + HUD 2.0
// Character Sheet v2: WEALTH row, silhouette avatar, always-visible loadout
// Inventory v2: interactive item cards (Use / Equip / Unequip)
// Special item Use ALWAYS defers to StoryLogic (section.itemUse[itemId])

const VC_SLOTS = [1, 2, 3];
const VC_STORAGE_PREFIX = "versecraft_slot_";

// Hardlocks (inventory caps exist but are NOT shown on HUD)
const MAX_CONSUMABLES = 9;
const MAX_WEAPONS = 9;
const MAX_ARMORS = 9;
const MAX_SPECIALS = 9;

// Logo path (preferred)
const LOGO_SRC = "./assets/versecraft-logo.png"; // if logo in root, use "./versecraft-logo.png"

let STORY = null;
let STATE = null;

(function () {
  const app = document.getElementById("app");

  // ---------- Item Catalog (UI + defaults) ----------
  // Keep names plain; flavor comes from story.
  const ITEM_DB = {
    rusty_dagger: {
      id: "rusty_dagger",
      name: "Rusty Dagger",
      type: "weapon",
      desc: "A basic blade. Reliable enough.",
    },
    leather_jerkin: {
      id: "leather_jerkin",
      name: "Leather Jerkin",
      type: "armor",
      desc: "Light protection. Better than nothing.",
    },
    candle: {
      id: "candle",
      name: "Candle",
      type: "special",
      desc: "Light in darkness. Sometimes more than that.",
    },
  };

  const EQUIP_SLOTS = ["weapon", "armor", "special"];

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

    // Back-compat mapping
    if (s.stats && typeof s.stats === "object") {
      if (s.stats.W == null && s.stats.WISDOM != null) s.stats.W = s.stats.WISDOM;
      if (s.stats.E == null && s.stats.ENDURANCE != null) s.stats.E = s.stats.ENDURANCE;
      if (s.stats.A == null && s.stats.AGILITY != null) s.stats.A = s.stats.AGILITY;
      if (s.stats.L == null && s.stats.LUCK != null) s.stats.L = s.stats.LUCK;
      if (s.stats.T == null && s.stats.TIMING != null) s.stats.T = s.stats.TIMING;
      if (s.stats.H == null) s.stats.H = 1;
    }

    // Resources: HP + Reputation. NO Health resource.
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

    // Equipped loadout
    s.equipped =
      (s.equipped && typeof s.equipped === "object")
        ? s.equipped
        : (d.equipped || { weapon: null, armor: null, special: null });

    for (const slot of EQUIP_SLOTS) {
      if (!(slot in s.equipped)) s.equipped[slot] = null;
    }

    // Flags + misc
    s.flags = (s.flags && typeof s.flags === "object") ? s.flags : (d.flags || {});
    if (!Array.isArray(s.visited)) s.visited = [];
    if (typeof s.choiceCount !== "number") s.choiceCount = 0;
    if (typeof s.lastSlot !== "number") s.lastSlot = 1;
    if (typeof s.isDead !== "boolean") s.isDead = false;

    // Ensure starting loadout exists (only if empty)
    ensureDefaultLoadout(s);

    return s;
  }

  function ensureDefaultLoadout(s) {
    // Ensure the standard tutorial loadout exists + is equipped.
    // Weapon: Rusty Dagger (weapons[])
    // Armor: Leather Jerkin (armors[])
    // Special: Candle (specialItems[])
    ensureInInventory("weapons", "rusty_dagger");
    ensureInInventory("armors", "leather_jerkin");
    ensureInInventory("specialItems", "candle");

    if (!s.equipped.weapon) s.equipped.weapon = "rusty_dagger";
    if (!s.equipped.armor) s.equipped.armor = "leather_jerkin";
    if (!s.equipped.special) s.equipped.special = "candle";
  }

  function ensureInInventory(invSlot, itemId) {
    const arr = STATE?.inventory?.[invSlot];
    if (!Array.isArray(arr)) return;
    if (!arr.includes(itemId)) arr.push(itemId);
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
      return { savedAt: parsed.savedAt, sectionId: parsed.state?.sectionId ?? "(unknown)" };
    } catch {
      return null;
    }
  }

  function hasAnySave() {
    return VC_SLOTS.some((s) => !!slotMeta(s));
  }

  // ---------- Save / Load pickers ----------
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
      <div class="picker">${items}</div>
      <div class="hr"></div>
      <div class="small">Saves are stored locally on this device/browser.</div>
    `);

    document.querySelectorAll("[data-pick-save]").forEach((b) => {
      b.onclick = () => {
        const slot = Number(b.getAttribute("data-pick-save"));
        saveToSlot(slot);
        closeModal();
        addSystemLine(`Saved to slot ${slot}.`, "neutral");
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

  function openLoadPicker(titleText = "Load") {
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
        <h3>${esc(titleText)}</h3>
        <button class="icon-btn" data-close="1" aria-label="Close">✕</button>
      </div>
      <div class="picker">${items}</div>
      <div class="hr"></div>
      <div class="small">Loading replaces your current run state.</div>
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

  function getMaxHP() {
    return Number(STORY.save?.defaults?.resources?.HP ?? 10);
  }

  function setHP(v) {
    const maxHP = getMaxHP();
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
    addSystemLine(`Item gained: ${displayItemName(itemId)}`, "whisper");
    return true;
  }

  function removeItem(slot, itemId) {
    if (!Array.isArray(STATE.inventory[slot])) return false;
    const before = STATE.inventory[slot].length;
    STATE.inventory[slot] = STATE.inventory[slot].filter((x) => x !== itemId);
    if (STATE.inventory[slot].length !== before) {
      addSystemLine(`Item used: ${displayItemName(itemId)}`, "whisper");
      return true;
    }
    return false;
  }

  function hasItem(slot, itemId) {
    return (STATE.inventory?.[slot] || []).includes(itemId);
  }

  function displayItemName(itemId) {
    return ITEM_DB[itemId]?.name || itemId;
  }

  function itemType(itemId) {
    return ITEM_DB[itemId]?.type || "unknown";
  }

  function invSlotForItemType(type) {
    if (type === "consumable") return "consumables";
    if (type === "weapon") return "weapons";
    if (type === "armor") return "armors";
    if (type === "special") return "specialItems";
    return null;
  }

  // ---------- equipping ----------
  function equipItem(itemId) {
    const type = itemType(itemId);
    if (!["weapon", "armor", "special"].includes(type)) {
      addSystemLine(`${displayItemName(itemId)} cannot be equipped.`, "whisper");
      return false;
    }

    const invSlot = invSlotForItemType(type);
    if (invSlot && !hasItem(invSlot, itemId)) {
      addSystemLine(`You don't have ${displayItemName(itemId)}.`, "whisper");
      return false;
    }

    STATE.equipped[type] = itemId;
    addSystemLine(`Equipped: ${displayItemName(itemId)}.`, "neutral");
    return true;
  }

  function unequip(slot) {
    if (!EQUIP_SLOTS.includes(slot)) return false;
    if (!STATE.equipped[slot]) return false;
    const removed = STATE.equipped[slot];
    STATE.equipped[slot] = null;
    addSystemLine(`Unequipped: ${displayItemName(removed)}.`, "neutral");
    return true;
  }

  // ---------- item use (DEFER TO STORYLOGIC) ----------
  // Story defines per-section item use:
  // section.itemUse = {
  //   "candle": { ops:[...], consume:false, unequip:false, to:"SECTION_5" }
  // }
  function useItem(itemId) {
    const cur = getSection(STATE.sectionId);
    if (!cur) return;

    const handler = cur.itemUse?.[itemId] || null;

    if (!handler) {
      addSystemLine(`${displayItemName(itemId)}: nothing happens.`, "whisper");
      closeModal();
      renderSection(cur);
      return;
    }

    // Apply ops
    applyOpsWithHPLog(handler.ops || [], `Item: ${displayItemName(itemId)}`);

    if (STATE.isDead) return;

    // Consume? (hybrid model)
    if (handler.consume) {
      const type = itemType(itemId);
      const invSlot = invSlotForItemType(type);
      if (invSlot) removeItem(invSlot, itemId);
      // If it was equipped, optionally unequip
      if (STATE.equipped[type] === itemId) STATE.equipped[type] = null;
    }

    // Unequip without consuming (rare, but supported)
    if (handler.unequip) {
      const type = itemType(itemId);
      if (STATE.equipped[type] === itemId) STATE.equipped[type] = null;
    }

    closeModal();

    // Optional section jump
    if (handler.to) {
      enterSection(handler.to);
      return;
    }

    // Otherwise re-render current section to reflect flags/changes
    renderSection(cur);
  }

  // ---------- ops & logging ----------
  function addXP(amount) {
    const a = Number(amount ?? 0);
    STATE.progress.xp = Math.max(0, getXP() + a);
    while (getXP() >= xpToNextLevel(getLevel())) {
      STATE.progress.xp -= xpToNextLevel(getLevel());
      STATE.progress.level += 1;
    }
  }

  function applyOp(op) {
    if (!op || !op.op) return;

    switch (op.op) {
      case "ADD_RESOURCE": {
        const res = op.resource;
        const amt = Number(op.amount ?? 0);

        if (res === "HP") setHP(getHP() + amt);
        else if (res === "REPUTATION") STATE.resources.REPUTATION = getRep() + amt;
        break;
      }

      case "SET_RESOURCE": {
        const res = op.resource;
        const val = Number(op.value ?? 0);
        if (res === "HP") setHP(val);
        else if (res === "REPUTATION") STATE.resources.REPUTATION = val;
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

      case "EQUIP_ITEM":
        equipItem(op.itemId);
        break;

      case "UNEQUIP":
        unequip(op.slot);
        break;

      case "ADD_XP":
        addXP(Number(op.amount ?? 0));
        break;

      case "GOTO_SECTION":
        // handled by caller (we keep it simple)
        STATE._pendingGoto = op.to;
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

    STATE._pendingGoto = null;

    for (const op of (ops || [])) applyOp(op);

    if (checkDeathAndMaybeRender()) return;

    // Handle op-driven goto if present
    if (STATE._pendingGoto) {
      const to = STATE._pendingGoto;
      STATE._pendingGoto = null;
      addSystemLine(`${contextLabel ? contextLabel + ": " : ""}The world shifts…`, "neutral");
      enterSection(to);
      return;
    }

    const hpAfter = getHP();
    const repAfter = getRep();
    const xpAfter = getXP();
    const lvlAfter = getLevel();

    const hpDelta = hpAfter - hpBefore;
    if (hpDelta !== 0) {
      const sign = hpDelta > 0 ? "+" : "";
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

    if (lvlAfter !== lvlBefore) addSystemLine(`Level up! You are now Level ${lvlAfter}.`, "explicit");

    if (timingHintTier) addSystemLine("You hesitated. (Timing penalty)", timingHintTier);
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

      // Optional equipped requirement
      if (chk.equipped) {
        const slot = chk.equipped.slot; // weapon/armor/special
        const itemId = chk.equipped.itemId;
        pass = pass && (STATE.equipped?.[slot] === itemId);
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

    applyOpsWithHPLog(t.penalty || [], "Timing", "whisper");
  }

  function meetsRequires(req) {
    if (!req) return true;
    if (Array.isArray(req.anyOf)) return req.anyOf.some(meetsRequires);

    if (req.hasItem) return hasItem(req.hasItem.slot, req.hasItem.itemId);

    if (req.equipped) {
      const slot = req.equipped.slot;
      const itemId = req.equipped.itemId;
      return STATE.equipped?.[slot] === itemId;
    }

    if (req.flagTrue) return !!STATE.flags?.[req.flagTrue];

    if (req.minResource) {
      const r = req.minResource.resource;
      const amt = Number(req.minResource.amount ?? 0);
      if (r === "HP") return getHP() >= amt;
      if (r === "REPUTATION") return getRep() >= amt;
      return true;
    }

    return true;
  }

  // ---------- Character Sheet (v2) ----------
  function openCharacterSheet() {
    const s = STATE.stats || {};
    const eq = STATE.equipped || {};
    const weaponName = eq.weapon ? displayItemName(eq.weapon) : "None";
    const armorName = eq.armor ? displayItemName(eq.armor) : "None";
    const specialName = eq.special ? displayItemName(eq.special) : "None";

    openModal(`
      <div class="modal-header">
        <h3>Character</h3>
        <button class="icon-btn" data-close="1" aria-label="Close">✕</button>
      </div>

      <div class="hr"></div>

      <div class="cs-wealth">
        <div class="cs-wealth-label">WEALTH</div>
        <div class="cs-wealth-row">
          ${["W","E","A","L","T","H"].map((k) => `
            <div class="cs-stat">
              <div class="cs-k">${k}</div>
              <div class="cs-v">${esc(s[k])}</div>
            </div>
          `).join("")}
        </div>
      </div>

      <div class="hr"></div>

      <div class="cs-main">
        <div class="cs-left">
          <div class="cs-avatar">
            <div class="cs-silhouette" aria-label="Avatar silhouette"></div>
            <div class="cs-avatar-caption small">Avatar (future: animated)</div>
          </div>

          <div class="cs-loadout">
            <div class="cs-section-title">Loadout</div>

            <div class="loadout-row">
              <div class="loadout-slot">Weapon</div>
              <div class="loadout-item">${esc(weaponName)}</div>
            </div>

            <div class="loadout-row">
              <div class="loadout-slot">Armor</div>
              <div class="loadout-item">${esc(armorName)}</div>
            </div>

            <div class="loadout-row">
              <div class="loadout-slot">Special</div>
              <div class="loadout-item">${esc(specialName)}</div>
            </div>
          </div>
        </div>

        <div class="cs-right">
          <div class="cs-section-title">Status</div>
          <div class="cs-status-grid">
            <div class="cs-cell">
              <div class="cs-cell-k">HP</div>
              <div class="cs-cell-v">${esc(getHP())} / ${esc(getMaxHP())}</div>
            </div>
            <div class="cs-cell">
              <div class="cs-cell-k">Level</div>
              <div class="cs-cell-v">${esc(getLevel())}</div>
            </div>
            <div class="cs-cell">
              <div class="cs-cell-k">XP</div>
              <div class="cs-cell-v">${esc(getXP())} / ${esc(xpToNextLevel(getLevel()))}</div>
            </div>
            <div class="cs-cell">
              <div class="cs-cell-k">Reputation</div>
              <div class="cs-cell-v">${esc(getRep())}</div>
            </div>
          </div>

          <div class="hr"></div>
          <button data-open-inv="1">Open Inventory</button>
        </div>
      </div>
    `);

    const invBtn = $("[data-open-inv]");
    if (invBtn) invBtn.onclick = () => openInventory();
  }

  // ---------- Inventory (v2 interactive) ----------
  function openInventory() {
    const inv = STATE.inventory || {};
    const eq = STATE.equipped || {};

    const sections = [
      { title: "Consumables", slot: "consumables" },
      { title: "Weapons", slot: "weapons" },
      { title: "Armors", slot: "armors" },
      { title: "Special Items", slot: "specialItems" },
    ];

    function renderItemCard(itemId, invSlot) {
      const def = ITEM_DB[itemId] || { id: itemId, name: itemId, type: "unknown", desc: "" };
      const type = def.type;
      const equipped = (type === "weapon" && eq.weapon === itemId)
        || (type === "armor" && eq.armor === itemId)
        || (type === "special" && eq.special === itemId);

      const canEquip = ["weapon","armor","special"].includes(type);
      const canUse = (type === "consumable") || (type === "special"); // Still defers to StoryLogic
      const equipLabel = equipped ? "Equipped" : "Equip";
      const showUnequip = equipped;

      return `
        <div class="item-card">
          <div class="item-head">
            <div class="item-name">${esc(def.name)}</div>
            <div class="item-type">${esc(typeLabel(type))}${equipped ? ` <span class="item-tag">Equipped</span>` : ""}</div>
          </div>
          ${def.desc ? `<div class="item-desc">${esc(def.desc)}</div>` : ""}
          <div class="item-actions">
            ${canUse ? `<button class="item-btn" data-use="${esc(itemId)}">Use</button>` : ""}
            ${canEquip ? (showUnequip
                ? `<button class="item-btn" data-unequip="${esc(type)}">Unequip</button>`
                : `<button class="item-btn" data-equip="${esc(itemId)}">${esc(equipLabel)}</button>`
              ) : ""}
          </div>
        </div>
      `;
    }

    function renderSection(title, slot) {
      const arr = Array.isArray(inv[slot]) ? inv[slot] : [];
      return `
        <div class="inv-block">
          <div class="inv-title">${esc(title)}</div>
          ${arr.length
            ? `<div class="item-grid">${arr.map((id) => renderItemCard(id, slot)).join("")}</div>`
            : `<div class="small">Empty</div>`
          }
        </div>
      `;
    }

    openModal(`
      <div class="modal-header">
        <h3>Inventory</h3>
        <button class="icon-btn" data-close="1" aria-label="Close">✕</button>
      </div>

      <div class="hr"></div>

      <div class="inv-wrap">
        ${sections.map((s) => renderSection(s.title, s.slot)).join("")}
      </div>

      <div class="hr"></div>
      <div class="small">Using items depends on the current story scene.</div>
    `);

    document.querySelectorAll("[data-equip]").forEach((b) => {
      b.onclick = () => {
        const itemId = b.getAttribute("data-equip");
        equipItem(itemId);
        // re-open inventory for updated visuals
        openInventory();
      };
    });

    document.querySelectorAll("[data-unequip]").forEach((b) => {
      b.onclick = () => {
        const slot = b.getAttribute("data-unequip");
        unequip(slot);
        openInventory();
      };
    });

    document.querySelectorAll("[data-use]").forEach((b) => {
      b.onclick = () => {
        const itemId = b.getAttribute("data-use");
        useItem(itemId);
      };
    });
  }

  function typeLabel(type) {
    if (type === "consumable") return "Consumable";
    if (type === "weapon") return "Weapon";
    if (type === "armor") return "Armor";
    if (type === "special") return "Special";
    return "Item";
  }

  // ---------- HUD 2.0 ----------
  function pct(n, d) {
    const num = Number(n ?? 0);
    const den = Math.max(1, Number(d ?? 1));
    return clamp((num / den) * 100, 0, 100);
  }

  function renderTopBar() {
    const hp = getHP();
    const maxHP = getMaxHP();
    const lvl = getLevel();
    const xp = getXP();
    const xpNeed = xpToNextLevel(lvl);

    const hpPct = pct(hp, maxHP);
    const xpPct = pct(xp, xpNeed);

    return `
      <div class="panel topbar">
        <div class="hudbar">
          <div class="hud-stats">
            <div class="hud-chip">
              <span class="label">HP</span>
              <div class="bar" aria-label="HP bar">
                <div class="bar-fill hp" style="width:${hpPct}%;"></div>
              </div>
              <span class="value">${hp} / ${maxHP}</span>
            </div>

            <div class="lvl-badge">LVL ${lvl}</div>

            <div class="hud-chip">
              <span class="label">XP</span>
              <div class="bar" aria-label="XP bar">
                <div class="bar-fill xp" style="width:${xpPct}%;"></div>
              </div>
              <span class="value">${xp} / ${xpNeed}</span>
            </div>
          </div>

          <div class="actions">
            <button data-char="1">Character</button>
            <button data-inv="1">Inventory</button>
            <button data-saveone="1">Save</button>
            <button data-loadone="1">Load</button>
            <button data-menu="1">Main Menu</button>
          </div>
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
    if (loadBtn) loadBtn.onclick = () => openLoadPicker("Load");
  }

  // ---------- Tap to Start Splash ----------
  function renderSplash() {
    app.innerHTML = `
      <div class="panel menu-hero menu-center splash" id="tapStart">
        <div class="menu-brand">
          <img class="menu-logo" src="${esc(LOGO_SRC)}" alt="VerseCraft" />
          <h2 class="menu-title">LORECRAFT</h2>
          <div class="menu-subtitle">Tutorial · The World That Notices</div>
        </div>

        <div class="tap-hint">
          <span class="tap-pill">Tap to Start</span>
        </div>

        <div class="menu-footnote small">
          VerseCraft demo build · local saves · 5–10 minute playthrough
        </div>
      </div>
    `;

    const tap = document.getElementById("tapStart");
    if (tap) tap.onclick = () => renderMainMenu();
  }

  // ---------- Main Menu ----------
  function renderMainMenu() {
    try {
      const hasSaves = hasAnySave();

      app.innerHTML = `
        <div class="panel menu-hero menu-center">
          <div class="menu-brand">
            <img class="menu-logo" src="${esc(LOGO_SRC)}" alt="VerseCraft" />
            <h2 class="menu-title">LORECRAFT</h2>
            <div class="menu-subtitle">Tutorial · The World That Notices</div>
          </div>

          <div class="menu-grid">
            <button id="btnNew" class="menu-primary">New Story</button>
            <button id="btnContinue" class="menu-secondary" ${hasSaves ? "" : "disabled"}>Continue</button>
          </div>

          <div class="menu-footnote">
            Tip: Continue lets you pick a save slot.
          </div>
        </div>
      `;

      const btnNew = document.getElementById("btnNew");
      const btnContinue = document.getElementById("btnContinue");

      if (btnNew) {
        btnNew.onclick = () => {
          STATE = normalizeState(deepCopy(STORY.save?.defaults || {}), STORY);
          STATE.isDead = false;

          // Ensure loadout exists on new run
          ensureDefaultLoadout(STATE);

          enterSection(STORY.startSectionId);
        };
      }

      if (btnContinue) {
        btnContinue.onclick = () => openLoadPicker("Continue: Choose a Save");
      }
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
        <div class="menu-grid menu-grid-3">
          <button id="btnDeathMenu" class="menu-secondary">Return to Main Menu</button>
          <button id="btnDeathRestart" class="menu-primary">Restart Story</button>
          <button id="btnDeathLoad" class="menu-secondary">Load Save</button>
        </div>
        <p class="small" style="margin-top:12px;">
          Timing penalties are fair — when you’re late, the system will whisper it.
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
        ensureDefaultLoadout(STATE);
        enterSection(STORY.startSectionId);
      };
    }
    if (btnLoad) btnLoad.onclick = () => openLoadPicker("Continue: Choose a Save");
  }

  // ---------- Scene placeholder ----------
  function renderScenePlaceholder(section) {
    const art = section?.art || null;
    const alt = art?.alt || "Scene art";
    const src = art?.src || "";

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
    if (p && typeof p === "object" && p.__sys) {
      const tier = p.tier || "neutral";
      return `<p class="sys sys-${esc(tier)}">— ${esc(p.text)}</p>`;
    }
    return `<p>${esc(String(p ?? ""))}</p>`;
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
    if (getHP() <= 0) setHP(1);

    // We need STATE available before ensureDefaultLoadout uses STATE.inventory
    // normalizeState calls ensureDefaultLoadout, which relies on STATE. So set STATE then re-ensure:
    ensureDefaultLoadout(STATE);

    renderSplash();
  }

  boot();
})();