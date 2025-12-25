// app.js — VerseCraft demo
// Full-file replace. Root GitHub Pages. Logo stored in /assets.
// Changes in this iteration:
// - Remove duplicated "VERSECRAFT" text titles (logo is the brand)
// - In-game header shows ONLY the current story title
// - Story Library wired to stories.json
// - Inventory uses category tabs
// - iOS-friendly modal scrolling

const VC_SLOTS = [1, 2, 3];
const VC_STORAGE_PREFIX = "versecraft_slot_";
const VC_SELECTED_STORY_KEY = "versecraft_selected_story_id";

// Inventory caps (NOT shown on HUD)
const MAX_CONSUMABLES = 9;
const MAX_WEAPONS = 9;
const MAX_ARMORS = 9;
const MAX_SPECIALS = 9;

// Logo in assets folder (you can rename the filename here if needed)
const LOGO_SRC = "./assets/versecraft-logo.png";

let STORY_INDEX = null; // stories.json
let STORY_META = null;  // selected story meta entry
let STORY = null;       // loaded story json
let STATE = null;

(function () {
  const app = document.getElementById("app");

  // ---------------- Item Catalog (UI defaults) ----------------
  const ITEM_DB = {
    rusty_dagger: { id: "rusty_dagger", name: "Rusty Dagger", type: "weapon", desc: "A basic blade. Reliable enough." },
    leather_jerkin: { id: "leather_jerkin", name: "Leather Jerkin", type: "armor", desc: "Light protection. Better than nothing." },
    candle: { id: "candle", name: "Candle", type: "special", desc: "Light in darkness. Sometimes more than that." },
    healing_salve: { id: "healing_salve", name: "Healing Salve", type: "consumable", desc: "Restores HP when the story allows it." }
  };
  const EQUIP_SLOTS = ["weapon", "armor", "special"];

  // ---------------- helpers ----------------
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    }[c]));

  const $ = (sel) => document.querySelector(sel);
  const deepCopy = (obj) => JSON.parse(JSON.stringify(obj));
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

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

  // ---------------- modal ----------------
  function ensureModal() {
    let bd = document.getElementById("modalBackdrop");
    if (bd) return bd;

    bd = document.createElement("div");
    bd.id = "modalBackdrop";
    bd.className = "modal-backdrop";
    bd.style.display = "none";
    bd.innerHTML = `<div class="modal" id="modalCard"></div>`;
    document.body.appendChild(bd);

    bd.addEventListener("click", (e) => { if (e.target === bd) closeModal(); });
    return bd;
  }

  function openModal(html) {
    const bd = ensureModal();
    const card = document.getElementById("modalCard");
    card.innerHTML = html;
    bd.style.display = "block";
    document.body.classList.add("modal-open");

    const closeBtn = card.querySelector("[data-close]");
    if (closeBtn) closeBtn.onclick = closeModal;
  }

  function closeModal() {
    const bd = document.getElementById("modalBackdrop");
    if (bd) bd.style.display = "none";
    document.body.classList.remove("modal-open");
  }

  // ---------------- story index / selection ----------------
  function getSelectedStoryId() {
    return localStorage.getItem(VC_SELECTED_STORY_KEY) || STORY_INDEX?.defaultStoryId || "lorecraft_tutorial";
  }

  function setSelectedStoryId(id) {
    localStorage.setItem(VC_SELECTED_STORY_KEY, id);
  }

  function findStoryMeta(id) {
    return (STORY_INDEX?.stories || []).find((s) => s.id === id) || null;
  }

  async function loadStoryById(storyId) {
    const meta = findStoryMeta(storyId);
    if (!meta) throw new Error(`Story not found in stories.json: ${storyId}`);

    const res = await fetch(`./${meta.file}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`Could not fetch ${meta.file} (HTTP ${res.status})`);

    const raw = await res.text();
    let storyObj;
    try { storyObj = JSON.parse(raw); }
    catch (e) { throw new Error(`JSON parse failed for ${meta.file}: ${e.message}`); }

    if (!storyObj?.sections || !Array.isArray(storyObj.sections) || !storyObj.startSectionId) {
      throw new Error(`${meta.file} missing sections[] or startSectionId`);
    }

    STORY_META = meta;
    STORY = storyObj;
    return STORY;
  }

  // ---------------- state normalization ----------------
  function normalizeState(s, storyObj) {
    if (!s || typeof s !== "object") s = {};
    const d = storyObj?.save?.defaults || {};

    s.stats = (s.stats && typeof s.stats === "object") ? s.stats : (d.stats || { W: 1, E: 1, A: 1, L: 1, T: 1, H: 1 });

    s.resources = (s.resources && typeof s.resources === "object") ? s.resources : (d.resources || { HP: 10, REPUTATION: 0 });
    if ("HEALTH" in s.resources) delete s.resources.HEALTH;
    if (s.resources.HP == null) s.resources.HP = 10;
    if (s.resources.REPUTATION == null) s.resources.REPUTATION = 0;

    s.progress = (s.progress && typeof s.progress === "object") ? s.progress : (d.progress || { level: 1, xp: 0 });
    if (typeof s.progress.level !== "number") s.progress.level = 1;
    if (typeof s.progress.xp !== "number") s.progress.xp = 0;

    s.inventory = (s.inventory && typeof s.inventory === "object")
      ? s.inventory
      : (d.inventory || { consumables: [], weapons: [], armors: [], specialItems: [] });

    for (const k of ["consumables", "weapons", "armors", "specialItems"]) {
      if (!Array.isArray(s.inventory[k])) s.inventory[k] = [];
    }

    s.equipped = (s.equipped && typeof s.equipped === "object") ? s.equipped : (d.equipped || { weapon: null, armor: null, special: null });
    for (const slot of EQUIP_SLOTS) if (!(slot in s.equipped)) s.equipped[slot] = null;

    s.flags = (s.flags && typeof s.flags === "object") ? s.flags : (d.flags || {});
    if (!Array.isArray(s.visited)) s.visited = [];
    if (typeof s.choiceCount !== "number") s.choiceCount = 0;
    if (typeof s.isDead !== "boolean") s.isDead = false;

    ensureDefaultLoadout(s);
    return s;
  }

  function ensureInInventory(s, invSlot, itemId) {
    const arr = s?.inventory?.[invSlot];
    if (!Array.isArray(arr)) return;
    if (!arr.includes(itemId)) arr.push(itemId);
  }

  function ensureDefaultLoadout(s) {
    ensureInInventory(s, "weapons", "rusty_dagger");
    ensureInInventory(s, "armors", "leather_jerkin");
    ensureInInventory(s, "specialItems", "candle");
    if (!s.inventory.consumables.includes("healing_salve")) s.inventory.consumables.push("healing_salve");

    if (!s.equipped.weapon) s.equipped.weapon = "rusty_dagger";
    if (!s.equipped.armor) s.equipped.armor = "leather_jerkin";
    if (!s.equipped.special) s.equipped.special = "candle";
  }

  // ---------------- save/load (story-specific) ----------------
  function slotKey(slot) { return VC_STORAGE_PREFIX + slot; }

  function saveToSlot(slot) {
    const payload = { storyId: STORY.storyId, savedAt: new Date().toISOString(), state: STATE };
    localStorage.setItem(slotKey(slot), JSON.stringify(payload));
  }

  function loadFromSlot(slot) {
    const raw = localStorage.getItem(slotKey(slot));
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (parsed.storyId !== STORY.storyId) return null;
      return parsed.state;
    } catch { return null; }
  }

  function clearSlot(slot) { localStorage.removeItem(slotKey(slot)); }

  function slotMeta(slot) {
    const raw = localStorage.getItem(slotKey(slot));
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (parsed.storyId !== STORY.storyId) return null;
      return { savedAt: parsed.savedAt, sectionId: parsed.state?.sectionId ?? "(unknown)" };
    } catch { return null; }
  }

  function hasAnySaveForCurrentStory() {
    return VC_SLOTS.some((s) => !!slotMeta(s));
  }

  function openSavePicker() {
    const items = VC_SLOTS.map((n) => {
      const meta = slotMeta(n);
      return `
        <div class="picker-row">
          <div class="picker-info">
            <div class="picker-title">Slot ${n}</div>
            <div class="picker-sub">${meta ? `Saved · ${esc(meta.savedAt)} · ${esc(meta.sectionId)}` : "Empty"}</div>
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
        renderSection(getSection(STATE.sectionId));
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
            <div class="picker-sub">${meta ? `Saved · ${esc(meta.savedAt)} · ${esc(meta.sectionId)}` : "Empty"}</div>
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
        enterSection(STATE.sectionId || STORY.startSectionId);
      };
    });
  }

  // ---------------- engine basics ----------------
  function getSection(id) {
    return STORY.sections.find((s) => s.id === id) || null;
  }

  function getHP() { return Number(STATE.resources?.HP ?? 0); }
  function getMaxHP() { return Number(STORY.save?.defaults?.resources?.HP ?? 10); }
  function setHP(v) { STATE.resources.HP = clamp(Number(v ?? 0), 0, getMaxHP()); }

  function getRep() { return Number(STATE.resources?.REPUTATION ?? 0); }
  function getLevel() { return Number(STATE.progress?.level ?? 1); }
  function getXP() { return Number(STATE.progress?.xp ?? 0); }
  function xpToNextLevel(level) { return 100 * level; }

  // ---------------- system lines ----------------
  function addSystemLine(msg, tier = "neutral") {
    STATE._runtimeText = STATE._runtimeText || [];
    const t = (tier === "whisper" || tier === "explicit" || tier === "neutral") ? tier : "neutral";
    STATE._runtimeText.push({ __sys: true, tier: t, text: String(msg) });
  }

  function renderDeathScreen() {
    app.innerHTML = `
      <div class="panel">
        <h2 class="notice-bad" style="margin:0;">YOU DIED</h2>
        <p class="small" style="margin-top:8px;">Your HP reached zero. The story stops here.</p>
        <div class="hr"></div>
        <div class="menu-grid menu-grid-3">
          <button id="btnDeathMenu" class="menu-secondary">Return to Main Menu</button>
          <button id="btnDeathRestart" class="menu-primary">Restart Story</button>
          <button id="btnDeathLoad" class="menu-secondary">Load Save</button>
        </div>
      </div>
    `;

    $("#btnDeathMenu").onclick = () => renderMainMenu();
    $("#btnDeathRestart").onclick = () => startNewRun();
    $("#btnDeathLoad").onclick = () => openLoadPicker("Continue: Choose a Save");
  }

  function checkDeathAndMaybeRender() {
    if (STATE.isDead) return true;
    if (getHP() > 0) return false;
    STATE.isDead = true;
    renderDeathScreen();
    return true;
  }

  // ---------------- inventory caps ----------------
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

  function displayItemName(itemId) { return ITEM_DB[itemId]?.name || itemId; }
  function itemType(itemId) { return ITEM_DB[itemId]?.type || "unknown"; }

  function invSlotForItemType(type) {
    if (type === "consumable") return "consumables";
    if (type === "weapon") return "weapons";
    if (type === "armor") return "armors";
    if (type === "special") return "specialItems";
    return null;
  }

  function hasItem(slot, itemId) { return (STATE.inventory?.[slot] || []).includes(itemId); }

  function addItem(slot, itemId) {
    if (!Array.isArray(STATE.inventory[slot])) STATE.inventory[slot] = [];
    if (STATE.inventory[slot].includes(itemId)) return true;

    const cap = invCapFor(slot);
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
    return STATE.inventory[slot].length !== before;
  }

  // ---------------- equip ----------------
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

  // ---------------- ops & StoryLogic item use ----------------
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
        for (const line of (op.lines || [])) STATE._runtimeText.push(line);
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
        STATE._pendingGoto = op.to;
        break;
      default:
        break;
    }
  }

  function applyOpsWithHPLog(ops, contextLabel) {
    const hpBefore = getHP();
    const repBefore = getRep();
    const xpBefore = getXP();
    const lvlBefore = getLevel();

    STATE._pendingGoto = null;
    for (const op of (ops || [])) applyOp(op);

    if (checkDeathAndMaybeRender()) return;

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
  }

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

    applyOpsWithHPLog(handler.ops || [], `Item: ${displayItemName(itemId)}`);
    if (STATE.isDead) return;

    if (handler.consume) {
      const type = itemType(itemId);
      const invSlot = invSlotForItemType(type);
      if (invSlot) removeItem(invSlot, itemId);
      if (STATE.equipped[type] === itemId) STATE.equipped[type] = null;
    }

    closeModal();

    if (handler.to) return enterSection(handler.to);
    renderSection(cur);
  }

  // ---------------- requirements ----------------
  function meetsRequires(req) {
    if (!req) return true;
    if (Array.isArray(req.anyOf)) return req.anyOf.some(meetsRequires);
    if (req.hasItem) return hasItem(req.hasItem.slot, req.hasItem.itemId);
    if (req.equipped) return STATE.equipped?.[req.equipped.slot] === req.equipped.itemId;
    if (req.flagTrue) return !!STATE.flags?.[req.flagTrue];
    if (req.minResource) {
      const r = req.minResource.resource;
      const amt = Number(req.minResource.amount ?? 0);
      if (r === "HP") return getHP() >= amt;
      if (r === "REPUTATION") return getRep() >= amt;
    }
    return true;
  }

  // ---------------- UI: Character ----------------
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
            <div class="cs-cell"><div class="cs-cell-k">HP</div><div class="cs-cell-v">${esc(getHP())} / ${esc(getMaxHP())}</div></div>
            <div class="cs-cell"><div class="cs-cell-k">Level</div><div class="cs-cell-v">${esc(getLevel())}</div></div>
            <div class="cs-cell"><div class="cs-cell-k">XP</div><div class="cs-cell-v">${esc(getXP())} / ${esc(xpToNextLevel(getLevel()))}</div></div>
            <div class="cs-cell"><div class="cs-cell-k">Reputation</div><div class="cs-cell-v">${esc(getRep())}</div></div>
          </div>

          <div class="hr"></div>
          <button data-open-inv="1">Open Inventory</button>
        </div>
      </div>
    `);

    const invBtn = $("[data-open-inv]");
    if (invBtn) invBtn.onclick = () => openInventory("consumables");
  }

  // ---------------- UI: Inventory (TABs) ----------------
  function openInventory(activeTab = "consumables") {
    const inv = STATE.inventory || {};
    const eq = STATE.equipped || {};

    const tabs = [
      { id: "consumables", label: "Consumables" },
      { id: "weapons", label: "Weapons" },
      { id: "armors", label: "Armors" },
      { id: "specialItems", label: "Special" }
    ];

    function typeLabel(type) {
      if (type === "consumable") return "Consumable";
      if (type === "weapon") return "Weapon";
      if (type === "armor") return "Armor";
      if (type === "special") return "Special";
      return "Item";
    }

    function renderItemCard(itemId) {
      const def = ITEM_DB[itemId] || { id: itemId, name: itemId, type: "unknown", desc: "" };
      const type = def.type;

      const equipped = (type === "weapon" && eq.weapon === itemId)
        || (type === "armor" && eq.armor === itemId)
        || (type === "special" && eq.special === itemId);

      const canEquip = ["weapon","armor","special"].includes(type);
      const canUse = (type === "consumable") || (type === "special");

      return `
        <div class="item-card">
          <div class="item-head">
            <div class="item-name">${esc(def.name)}</div>
            <div class="item-type">${esc(typeLabel(type))}${equipped ? ` <span class="item-tag">Equipped</span>` : ""}</div>
          </div>
          ${def.desc ? `<div class="item-desc">${esc(def.desc)}</div>` : ""}
          <div class="item-actions">
            ${canUse ? `<button class="item-btn" data-use="${esc(itemId)}">Use</button>` : ""}
            ${canEquip
              ? (equipped
                  ? `<button class="item-btn" data-unequip="${esc(type)}">Unequip</button>`
                  : `<button class="item-btn" data-equip="${esc(itemId)}">Equip</button>`
                )
              : ""
            }
          </div>
        </div>
      `;
    }

    function renderTabContent(slotId) {
      const arr = Array.isArray(inv[slotId]) ? inv[slotId] : [];
      if (!arr.length) return `<div class="small">Empty</div>`;
      return `<div class="item-grid">${arr.map(renderItemCard).join("")}</div>`;
    }

    openModal(`
      <div class="modal-header">
        <h3>Inventory</h3>
        <button class="icon-btn" data-close="1" aria-label="Close">✕</button>
      </div>

      <div class="hr"></div>

      <div class="tabbar" role="tablist" aria-label="Inventory categories">
        ${tabs.map(t => `
          <button class="tab ${t.id === activeTab ? "tab-active" : ""}" data-tab="${esc(t.id)}" role="tab">
            ${esc(t.label)}
          </button>
        `).join("")}
      </div>

      <div class="tabpanel" role="tabpanel">
        ${renderTabContent(activeTab)}
      </div>

      <div class="hr"></div>
      <div class="small">Using items depends on the current story scene.</div>
    `);

    document.querySelectorAll("[data-tab]").forEach((b) => {
      b.onclick = () => openInventory(b.getAttribute("data-tab"));
    });

    document.querySelectorAll("[data-equip]").forEach((b) => {
      b.onclick = () => { equipItem(b.getAttribute("data-equip")); openInventory(activeTab); };
    });

    document.querySelectorAll("[data-unequip]").forEach((b) => {
      b.onclick = () => { unequip(b.getAttribute("data-unequip")); openInventory(activeTab); };
    });

    document.querySelectorAll("[data-use]").forEach((b) => {
      b.onclick = () => useItem(b.getAttribute("data-use"));
    });
  }

  // ---------------- HUD ----------------
  function pct(n, d) {
    const num = Number(n ?? 0);
    const den = Math.max(1, Number(d ?? 1));
    return clamp((num / den) * 100, 0, 100);
  }

  // In-game header requirement:
  // - Show ONLY the current story title (Option A)
  function renderTopBar() {
    const hp = getHP();
    const maxHP = getMaxHP();
    const lvl = getLevel();
    const xp = getXP();
    const xpNeed = xpToNextLevel(lvl);

    const hpPct = pct(hp, maxHP);
    const xpPct = pct(xp, xpNeed);

    const storyTitle = (STORY_META?.title || STORY?.title || "Story");

    return `
      <div class="panel topbar">
        <div class="hud-storytitle">${esc(storyTitle)}</div>

        <div class="hudbar">
          <div class="hud-stats">
            <div class="hud-chip">
              <span class="label">HP</span>
              <div class="bar" aria-label="HP bar"><div class="bar-fill hp" style="width:${hpPct}%;"></div></div>
              <span class="value">${hp} / ${maxHP}</span>
            </div>

            <div class="lvl-badge">LVL ${lvl}</div>

            <div class="hud-chip">
              <span class="label">XP</span>
              <div class="bar" aria-label="XP bar"><div class="bar-fill xp" style="width:${xpPct}%;"></div></div>
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
    if (invBtn) invBtn.onclick = () => openInventory("consumables");
    if (menuBtn) menuBtn.onclick = renderMainMenu;
    if (saveBtn) saveBtn.onclick = openSavePicker;
    if (loadBtn) loadBtn.onclick = () => openLoadPicker("Load");
  }

  // ---------------- Scene placeholder ----------------
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

  // ---------------- rendering ----------------
  function renderParagraph(p) {
    if (p && typeof p === "object" && p.__sys) {
      const tier = p.tier || "neutral";
      return `<p class="sys sys-${esc(tier)}">— ${esc(p.text)}</p>`;
    }
    return `<p>${esc(String(p ?? ""))}</p>`;
  }

  function renderSection(section) {
    const baseText = section?.text || [];
    const extraText = STATE._runtimeText || [];
    const allText = [...baseText, ...extraText];

    const choices = (section?.choices || []).filter((c) => meetsRequires(c.requires));

    app.innerHTML = `
      ${renderTopBar()}
      <div class="panel story-shell">
        ${renderScenePlaceholder(section)}
        <div class="story-box">
          <div class="story">${allText.map(renderParagraph).join("")}</div>
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

    renderSection(section);
  }

  function choose(choiceId) {
    if (STATE.isDead) return renderDeathScreen();
    const current = getSection(STATE.sectionId);
    if (!current) return showError("Engine error", "Current section missing.");

    const choice = (current.choices || []).find((c) => c.id === choiceId);
    if (!choice) return;

    STATE.choiceCount = Number(STATE.choiceCount || 0) + 1;

    if (Array.isArray(choice.onChoose) && choice.onChoose.length) {
      applyOpsWithHPLog(choice.onChoose, "Choice");
      if (STATE.isDead) return;
    }

    if (choice.to === "MENU") return renderMainMenu();
    if (choice.to === "CHARACTER") return openCharacterSheet();
    if (choice.to === "INVENTORY") return openInventory("consumables");

    return enterSection(choice.to);
  }

  // ---------------- Menus ----------------
  function renderSplash() {
    // No duplicated "VERSECRAFT" text title. Logo is the brand.
    // Show story line once.
    const storyLine = (STORY_META?.title || "Story");
    app.innerHTML = `
      <div class="panel menu-hero menu-center splash" id="tapStart">
        <div class="menu-brand">
          <img class="menu-logo" src="${esc(LOGO_SRC)}" alt="VerseCraft" />
          <div class="menu-storyline">${esc(storyLine)}</div>
        </div>
        <div class="tap-hint"><span class="tap-pill">Tap to Start</span></div>
        <div class="menu-footnote small">Local saves · Demo build</div>
      </div>
    `;
    const tap = document.getElementById("tapStart");
    if (tap) tap.onclick = () => renderMainMenu();
  }

  function renderMainMenu() {
    const hasSaves = hasAnySaveForCurrentStory();
    const storyLine = (STORY_META?.title || "Story");

    app.innerHTML = `
      <div class="panel menu-hero menu-center">
        <div class="menu-brand">
          <img class="menu-logo" src="${esc(LOGO_SRC)}" alt="VerseCraft" />
          <div class="menu-storyline">Current Story: <b>${esc(storyLine)}</b></div>
        </div>

        <div class="menu-grid menu-grid-3">
          <button id="btnNew" class="menu-primary">New Story</button>
          <button id="btnContinue" class="menu-secondary" ${hasSaves ? "" : "disabled"}>Continue</button>
          <button id="btnLibrary" class="menu-secondary">Load New Story</button>
        </div>

        <div class="menu-footnote">
          Continue shows saves for the currently selected story.
        </div>
      </div>
    `;

    $("#btnNew").onclick = () => startNewRun();
    $("#btnContinue").onclick = () => openLoadPicker("Continue: Choose a Save");
    $("#btnLibrary").onclick = () => openStoryLibrary();
  }

  function startNewRun() {
    STATE = normalizeState(deepCopy(STORY.save?.defaults || {}), STORY);
    STATE.isDead = false;
    ensureDefaultLoadout(STATE);
    enterSection(STORY.startSectionId);
  }

  // ---------------- Story Library UI ----------------
  function openStoryLibrary() {
    const list = (STORY_INDEX?.stories || []).map((s) => {
      const tags = (s.tags || []).map((t) => `<span class="pill">${esc(t)}</span>`).join("");
      const active = (s.id === STORY_META?.id);

      return `
        <div class="story-card ${active ? "story-card-active" : ""}" data-story="${esc(s.id)}">
          <div class="story-thumb">
            ${s.thumb ? `<img class="story-thumb-img" src="${esc(s.thumb)}" alt="${esc(s.title)}" />`
                      : `<div class="story-thumb-ph">ART</div>`}
          </div>
          <div class="story-body">
            <div class="story-title">${esc(s.title)}</div>
            <div class="story-sub">${esc(s.subtitle || "")}</div>
            <div class="story-meta">
              ${tags}
              ${s.estimate ? `<span class="pill pill-muted">${esc(s.estimate)}</span>` : ""}
              ${active ? `<span class="pill pill-active">Current</span>` : ""}
            </div>
          </div>
        </div>
      `;
    }).join("");

    openModal(`
      <div class="modal-header">
        <div>
          <h3 style="margin:0;">Story Library</h3>
          <div class="small">Choose what to play. New Story resets progress for that story.</div>
        </div>
        <button class="icon-btn" data-close="1" aria-label="Close">✕</button>
      </div>

      <div class="hr"></div>

      <div class="story-list">
        ${list}
      </div>

      <div class="hr"></div>

      <div class="small">
        Selecting a story changes what <b>New Story</b> and <b>Continue</b> will load.
      </div>
    `);

    document.querySelectorAll("[data-story]").forEach((card) => {
      card.onclick = async () => {
        const id = card.getAttribute("data-story");
        if (!id || id === STORY_META?.id) return;

        openModal(`
          <div class="modal-header">
            <h3>Set Current Story?</h3>
            <button class="icon-btn" data-close="1" aria-label="Close">✕</button>
          </div>
          <div class="hr"></div>
          <p>Switch to <b>${esc(findStoryMeta(id)?.title || id)}</b>?</p>
          <div class="menu-grid menu-grid-2">
            <button id="btnSetStory" class="menu-primary">Set as Current Story</button>
            <button id="btnCancelStory" class="menu-secondary">Cancel</button>
          </div>
        `);

        $("#btnCancelStory").onclick = () => openStoryLibrary();
        $("#btnSetStory").onclick = async () => {
          try {
            setSelectedStoryId(id);
            await loadStoryById(id);
            STATE = normalizeState(deepCopy(STORY.save?.defaults || {}), STORY);
            closeModal();
            renderMainMenu();
          } catch (e) {
            showError("Story switch failed", String(e));
          }
        };
      };
    });
  }

  // ---------------- boot ----------------
  async function boot() {
    if (!app) return;
    app.innerHTML = `<div class="panel"><p>Loading…</p></div>`;

    const idxRes = await fetch("./stories.json", { cache: "no-store" });
    if (!idxRes.ok) return showError("Boot failed", `Could not fetch stories.json\nHTTP: ${idxRes.status} ${idxRes.statusText}`);

    let idx;
    try { idx = await idxRes.json(); }
    catch (e) { return showError("Boot failed", `stories.json parse failed: ${e.message}`); }

    STORY_INDEX = idx;

    const selected = getSelectedStoryId();
    try {
      await loadStoryById(selected);
    } catch {
      try {
        await loadStoryById(STORY_INDEX.defaultStoryId);
      } catch (e2) {
        return showError("Boot failed", String(e2));
      }
    }

    STATE = normalizeState(deepCopy(STORY.save?.defaults || {}), STORY);
    if (getHP() <= 0) setHP(1);

    renderSplash();
  }

  boot();
})();