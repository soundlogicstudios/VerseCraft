// VerseCraft MVP - Self-Debugging Boot + Minimal Engine (Lorecraft Tutorial)
// Paste this entire file into app.js (replaces everything).
// If anything fails, it prints the error ON THE PAGE (so you don't need dev tools).

(function () {
  const app = document.getElementById("app");

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    }[c]));
  }

  function show(title, body, ok = false) {
    app.innerHTML = `
      <div style="border:1px solid ${ok ? "#2b5" : "#a33"}; padding:12px; border-radius:12px; background:#0f0f0f;">
        <h2 style="margin:0 0 8px 0; color:${ok ? "#7f7" : "#ff7777"};">${esc(title)}</h2>
        <pre style="margin:0; white-space:pre-wrap;">${esc(body)}</pre>
      </div>
    `;
  }

  // Catch ANY JS errors and display them.
  window.addEventListener("error", (e) => {
    show("JavaScript error", `${e.message}\n${e.filename}:${e.lineno}:${e.colno}`);
  });

  window.addEventListener("unhandledrejection", (e) => {
    show("Unhandled promise rejection", String(e.reason ?? e));
  });

  async function boot() {
    // 1) Prove app.js is running
    app.innerHTML = `<p>Booting engine…</p>`;

    const jsonPath = "./lorecraft_tutorial.story.json";

    // 2) Fetch JSON with no cache (helps GitHub Pages refreshes)
    const res = await fetch(jsonPath, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(
        `Could not fetch JSON.\n` +
        `Path: ${jsonPath}\n` +
        `HTTP: ${res.status} ${res.statusText}\n\n` +
        `Fix:\n` +
        `- Confirm the file is named EXACTLY: lorecraft_tutorial.story.json\n` +
        `- Confirm it is in the repo ROOT (same folder as index.html)\n` +
        `- Confirm you committed the file`
      );
    }

    // 3) Parse JSON with a helpful snippet if parse fails
    const raw = await res.text();
    let story;
    try {
      story = JSON.parse(raw);
    } catch (e) {
      throw new Error(
        `JSON parse failed: ${e.message}\n\n` +
        `Fix:\n` +
        `- JSON cannot contain comments like // or /* */\n` +
        `- JSON cannot have trailing commas\n` +
        `- Ensure all quotes are plain double-quotes\n\n` +
        `First 500 characters:\n` + raw.slice(0, 500)
      );
    }

    // 4) Minimal validation
    if (!story || !Array.isArray(story.sections) || !story.startSectionId) {
      throw new Error(
        `Story JSON shape looks wrong.\n\n` +
        `Expected keys: sections[] and startSectionId.\n` +
        `Got: ${Object.keys(story || {}).join(", ")}`
      );
    }

    // 5) Initialize state (normalized so resources/stats/etc cannot be null)
    const defaults = story.save?.defaults;
    if (!defaults) throw new Error("Missing story.save.defaults in JSON.");

    // --- tiny engine helpers ---
    function normalizeState(s, storyObj) {
      if (!s || typeof s !== "object") s = {};

      const d = storyObj?.save?.defaults || {};

      s.stats = (s.stats && typeof s.stats === "object")
        ? s.stats
        : (d.stats || { WISDOM: 1, ENDURANCE: 1, AGILITY: 1, LUCK: 1, TIMING: 1 });

      s.resources = (s.resources && typeof s.resources === "object")
        ? s.resources
        : (d.resources || { HP: 10, HEALTH: 10, REPUTATION: 0 });

      s.inventory = (s.inventory && typeof s.inventory === "object")
        ? s.inventory
        : (d.inventory || { consumables: [], weapons: [], armors: [], specialItems: [] });

      s.flags = (s.flags && typeof s.flags === "object")
        ? s.flags
        : (d.flags || {});

      if (!Array.isArray(s.visited)) s.visited = [];
      if (typeof s.choiceCount !== "number") s.choiceCount = 0;

      return s;
    }

    let STATE = normalizeState(JSON.parse(JSON.stringify(defaults)), story);
    let STORY = story;

    function getSection(id) {
      return STORY.sections.find((s) => s.id === id);
    }

    function addResource(name, amount) {
      if (!STATE.resources || typeof STATE.resources !== "object") STATE.resources = {};
      const cur = Number(STATE.resources[name] ?? 0);
      const max = Number(STORY.save?.defaults?.resources?.[name] ?? 9999);
      let next = cur + Number(amount ?? 0);
      if (name === "HP" || name === "HEALTH") {
        next = Math.max(0, Math.min(max, next));
      }
      STATE.resources[name] = next;
    }

    function setFlag(k, v) {
      if (!STATE.flags || typeof STATE.flags !== "object") STATE.flags = {};
      STATE.flags[k] = v;
    }

    function appendText(lines) {
      STATE._runtimeText = STATE._runtimeText || [];
      for (const line of (lines || [])) STATE._runtimeText.push(String(line));
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
          STATE.inventory = STATE.inventory || { consumables: [], weapons: [], armors: [], specialItems: [] };
          STATE.inventory[op.slot] = STATE.inventory[op.slot] || [];
          if (!STATE.inventory[op.slot].includes(op.itemId)) STATE.inventory[op.slot].push(op.itemId);
          break;
        case "REMOVE_ITEM":
          if (STATE.inventory?.[op.slot]) {
            STATE.inventory[op.slot] = STATE.inventory[op.slot].filter((x) => x !== op.itemId);
          }
          break;
        default:
          // ignore unknown ops
          break;
      }
    }

    function runChecks(section) {
      for (const chk of (section.checks || [])) {
        let pass = false;
        if (chk.stat) pass = Number(STATE.stats?.[chk.stat] ?? 0) >= Number(chk.dc ?? 0);
        if (chk.resource) pass = Number(STATE.resources?.[chk.resource] ?? 0) >= Number(chk.dc ?? 0);
        for (const op of (pass ? chk.onPass : chk.onFail) || []) applyOp(op);
      }
    }

    // Timing: EXPIRE hides choices after choiceCount threshold; SOFT applies penalty if late.
    function isExpired(choice) {
      const t = choice.timing;
      if (!t || t.mode !== "EXPIRE") return false;
      return Number(STATE.choiceCount ?? 0) >= Number(t.expiresAfterChoiceCount ?? Infinity);
    }

    function applySoftPenalty(choice) {
      const t = choice.timing;
      if (!t || t.mode !== "SOFT") return;
      if (Number(STATE.choiceCount ?? 0) < Number(t.lateAfterChoiceCount ?? Infinity)) return;
      for (const op of (t.penalty || [])) applyOp(op);
    }

    function meetsRequires(req) {
      if (!req) return true;
      if (Array.isArray(req.anyOf)) return req.anyOf.some(meetsRequires);
      if (req.hasItem) return (STATE.inventory?.[req.hasItem.slot] || []).includes(req.hasItem.itemId);
      if (req.minResource) return Number(STATE.resources?.[req.minResource.resource] ?? 0) >= Number(req.minResource.amount ?? 0);
      if (req.flagTrue) return !!STATE.flags?.[req.flagTrue];
      // optionalItem: always show in MVP
      return true;
    }

    function renderHUD() {
      const r = (STATE && STATE.resources && typeof STATE.resources === "object") ? STATE.resources : {};
      const hp = Number(r.HP ?? 0);
      const health = Number(r.HEALTH ?? 0);
      const rep = Number(r.REPUTATION ?? 0);

      return `<p style="opacity:.85;margin:0 0 10px 0;">
        <strong>HP</strong>: ${hp} ·
        <strong>Health</strong>: ${health} ·
        <strong>Rep</strong>: ${rep}
      </p>`;
    }

    function renderSection(id) {
      const section = getSection(id);
      if (!section) throw new Error("Missing section: " + id);

      STATE.sectionId = id;
      STATE._runtimeText = [];
      STATE.visited = STATE.visited || [];
      if (!STATE.visited.includes(id)) STATE.visited.push(id);

      for (const op of (section.onEnter || [])) applyOp(op);
      runChecks(section);

      const text = [...(section.text || []), ...(STATE._runtimeText || [])];
      const choices = (section.choices || [])
        .filter((c) => meetsRequires(c.requires))
        .filter((c) => !isExpired(c));

      app.innerHTML = `
        ${renderHUD()}
        <h2 style="margin:0 0 10px 0;">${esc(section.title)}</h2>
        ${text.map((p) => `<p style="line-height:1.55;">${esc(p)}</p>`).join("")}
        <div style="display:flex;flex-direction:column;gap:10px;margin-top:16px;">
          ${choices.map((c) => `<button data-choice="${esc(c.id)}" style="text-align:left;">${esc(c.text)}</button>`).join("")}
        </div>
        <p style="opacity:.55;margin-top:14px;font-size:.85rem;">Section ${esc(section.id)} · Choices made: ${Number(STATE.choiceCount || 0)}</p>
      `;

      document.querySelectorAll("[data-choice]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const cid = btn.getAttribute("data-choice");
          const choice = (section.choices || []).find((c) => c.id === cid);
          if (!choice) return;

          STATE.choiceCount = Number(STATE.choiceCount || 0) + 1;

          if (isExpired(choice)) {
            appendText(["The moment is gone. You can feel it in the stone."]);
            renderSection(id);
            return;
          }

          applySoftPenalty(choice);
          for (const op of (choice.onChoose || [])) applyOp(op);

          renderSection(choice.to);
        });
      });
    }

    // 6) Start game immediately at S01 (so you can test the flow)
    show("✅ Boot success", `Loaded: ${STORY.title}\nStarting section: ${STORY.startSectionId}`, true);
    setTimeout(() => renderSection(STORY.startSectionId), 250);
  }

  boot().catch((e) => show("Boot failed", String(e)));
})();
