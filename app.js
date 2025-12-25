/* VerseCraft Demo App (Skinned UI + Working Items)
   - stories.json + *.story.json
   - Items: story-scoped catalog, inventory, equip, use/consume
   - HP clamp: 0..MAX_HP
   - Save/Load: single slot
   - Loaded module name: shown in HUD as the current story title (+ subtitle)
*/

(function () {
  const e = React.createElement;

  const STORAGE_KEY = "versecraft_save_v1";
  const STORIES_MANIFEST = "stories.json";
  const LOGO_SRC = "assets/versecraft-logo.png";

  // ---------- Helpers ----------
  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
  function deepClone(obj) { return JSON.parse(JSON.stringify(obj)); }
  function safeObj(v) { return v && typeof v === "object" ? v : {}; }

  function normalizeTextLine(line) {
    if (typeof line === "string") return { kind: "plain", text: line };
    if (line && typeof line === "object" && line.__sys) {
      return { kind: "sys", tier: line.tier || "neutral", text: line.text || "" };
    }
    return { kind: "plain", text: String(line) };
  }

  function buildItemIndex(story) {
    const idx = {};
    const arr = Array.isArray(story?.items) ? story.items : [];
    for (const it of arr) if (it?.id) idx[it.id] = it;
    return idx;
  }

  function getSectionById(story, id) {
    const sections = Array.isArray(story?.sections) ? story.sections : [];
    return sections.find((s) => s.id === id) || null;
  }

  function ensureInventoryShape(inv) {
    const i = safeObj(inv);
    return {
      consumables: Array.isArray(i.consumables) ? i.consumables : [],
      weapons: Array.isArray(i.weapons) ? i.weapons : [],
      armors: Array.isArray(i.armors) ? i.armors : [],
      specialItems: Array.isArray(i.specialItems) ? i.specialItems : []
    };
  }

  function ensureEquippedShape(eq) {
    const x = safeObj(eq);
    return { weapon: x.weapon ?? null, armor: x.armor ?? null, special: x.special ?? null };
  }

  function removeOneFromArray(arr, value) {
    const idx = arr.indexOf(value);
    if (idx < 0) return arr.slice();
    const copy = arr.slice();
    copy.splice(idx, 1);
    return copy;
  }

  function applyResourcesDelta(state, delta) {
    const d = safeObj(delta);
    const res = safeObj(state.resources);

    const maxHp = Number(res.MAX_HP ?? 10);
    if (d.HP !== undefined) res.HP = clamp(Number(res.HP ?? 0) + Number(d.HP), 0, maxHp);

    if (d.MAX_HP !== undefined) {
      res.MAX_HP = Math.max(1, Number(res.MAX_HP ?? 10) + Number(d.MAX_HP));
      res.HP = clamp(Number(res.HP ?? 0), 0, Number(res.MAX_HP));
    }

    if (d.REPUTATION !== undefined) res.REPUTATION = Number(res.REPUTATION ?? 0) + Number(d.REPUTATION);
    if (d.TIMING !== undefined) res.TIMING = Number(res.TIMING ?? 0) + Number(d.TIMING);

    return { ...state, resources: res };
  }

  function applySectionEffects(state, section) {
    if (!section?.effects) return state;
    if (section.effects.resourcesDelta) return applyResourcesDelta(state, section.effects.resourcesDelta);
    return state;
  }

  function useItem(state, story, itemId) {
    const itemIndex = buildItemIndex(story);
    const item = itemIndex[itemId];
    if (!item) return state;

    const values = safeObj(item.values);
    const delta = {};
    if (values.HP) delta.HP = Number(values.HP);
    if (values.Reputation) delta.REPUTATION = Number(values.Reputation);
    if (values.Timing) delta.TIMING = Number(values.Timing);

    let next = applyResourcesDelta(state, delta);

    const flags = safeObj(next.flags);
    const setList = Array.isArray(item.flagsSet) ? item.flagsSet : [];
    const clrList = Array.isArray(item.flagsClear) ? item.flagsClear : [];

    for (const f of setList) if (f) flags[f] = true;
    for (const f of clrList) if (f) delete flags[f];

    next = { ...next, flags };

    if (item.consumeOnUse) {
      const inv = ensureInventoryShape(next.inventory);
      inv.consumables = removeOneFromArray(inv.consumables, itemId);
      inv.weapons = removeOneFromArray(inv.weapons, itemId);
      inv.armors = removeOneFromArray(inv.armors, itemId);
      inv.specialItems = removeOneFromArray(inv.specialItems, itemId);

      const eq = ensureEquippedShape(next.equipped);
      if (eq.weapon === itemId) eq.weapon = null;
      if (eq.armor === itemId) eq.armor = null;
      if (eq.special === itemId) eq.special = null;

      next = { ...next, inventory: inv, equipped: eq };
    }

    return next;
  }

  function equipItem(state, story, itemId) {
    const itemIndex = buildItemIndex(story);
    const item = itemIndex[itemId];
    if (!item) return state;

    const slot = (item.slot || "").toLowerCase();
    const eq = ensureEquippedShape(state.equipped);

    if (slot === "weapon") eq.weapon = itemId;
    else if (slot === "armor") eq.armor = itemId;
    else if (slot === "special") eq.special = itemId;
    else return state;

    return { ...state, equipped: eq };
  }

  // ---------- UI ----------
  function Button({ onClick, children, disabled, className }) {
    return e("button", { className: "btn " + (className || ""), onClick, disabled: !!disabled }, children);
  }

  function Modal({ title, onClose, children }) {
    return e("div", { className: "modalBackdrop" }, [
      e("div", { className: "modalCard", key: "card" }, [
        e("div", { className: "modalHeader", key: "hdr" }, [
          e("div", { className: "modalTitle", key: "t" }, title),
          Button({ onClick: onClose, className: "btnSmall" }, "Close")
        ]),
        e("div", { className: "modalBody", key: "b" }, children)
      ])
    ]);
  }

  // Loaded module name appears here (HUD title/subtitle)
  function HUD({ story, state, onOpenCharacter, onOpenInventory, onSave, onLoad, onMenu }) {
    const title = story?.title || "VerseCraft";
    const subtitle = story?.subtitle || "";

    const res = safeObj(state.resources);
    const hp = Number(res.HP ?? 0);
    const maxHp = Number(res.MAX_HP ?? 10);
    const rep = Number(res.REPUTATION ?? 0);
    const timing = Number(res.TIMING ?? 0);

    const lvl = Number(state.progress?.level ?? 1);
    const xp = Number(state.progress?.xp ?? 0);

    return e("div", { className: "hudShell" }, [
      e("div", { className: "hudFrame" }, [
        e("div", { className: "hudTitleBlock" }, [
          e("div", { className: "hudTitle" }, title),
          subtitle ? e("div", { className: "hudSubtitle" }, subtitle) : null
        ]),

        e("div", { className: "hudBars" }, [
          e("div", { className: "barRow" }, [
            e("div", { className: "barLabel" }, "HP"),
            e("div", { className: "barTrack" }, [
              e("div", {
                className: "barFill hp",
                style: { width: `${maxHp ? Math.round((hp / maxHp) * 100) : 0}%` }
              })
            ]),
            e("div", { className: "barValue" }, `${hp} / ${maxHp}`)
          ]),
          e("div", { className: "barRow" }, [
            e("div", { className: "barLabel" }, "XP"),
            e("div", { className: "barTrack" }, [
              e("div", {
                className: "barFill xp",
                style: { width: `${clamp((xp / 100) * 100, 0, 100)}%` }
              })
            ]),
            e("div", { className: "barValue" }, `${xp} / 100`)
          ])
        ]),

        e("div", { className: "hudRightCaps" }, [
          e("div", { className: "lvlPill" }, `LVL ${lvl}`),
          e("div", { className: "miniPills" }, [
            e("div", { className: "miniPill" }, `Rep ${rep}`),
            e("div", { className: "miniPill" }, `Timing ${timing}`)
          ])
        ]),

        e("div", { className: "hudButtons" }, [
          Button({ onClick: onOpenCharacter, className: "btnHud" }, "Character"),
          Button({ onClick: onOpenInventory, className: "btnHud" }, "Inventory"),
          Button({ onClick: onSave, className: "btnHud" }, "Save"),
          Button({ onClick: onLoad, className: "btnHud" }, "Load"),
          Button({ onClick: onMenu, className: "btnHud" }, "Main Menu")
        ])
      ])
    ]);
  }

  function CharacterSheet({ state, itemIndex, onClose }) {
    const s = safeObj(state.stats);
    const eq = ensureEquippedShape(state.equipped);
    function labelOf(id) { return itemIndex[id]?.title || id || "None"; }

    return Modal(
      { title: "Character Sheet", onClose },
      e("div", { className: "charSheet" }, [
        e("div", { className: "charTop" }, [
          e("div", { className: "avatarCard" }, [
            e("div", { className: "avatarSilhouette" }, "Avatar"),
            e("div", { className: "avatarHint" }, "Future: animated / skinned")
          ]),
          e("div", { className: "loadoutCard" }, [
            e("div", { className: "cardTitle" }, "Loadout"),
            e("div", { className: "loadoutLine" }, `Weapon: ${labelOf(eq.weapon)}`),
            e("div", { className: "loadoutLine" }, `Armor: ${labelOf(eq.armor)}`),
            e("div", { className: "loadoutLine" }, `Special: ${labelOf(eq.special)}`)
          ])
        ]),
        e("div", { className: "statsCard" }, [
          e("div", { className: "cardTitle" }, "Wealth Stats"),
          e("div", { className: "statsRow" }, [
            e("div", { className: "statPill" }, `W ${Number(s.W ?? 0)}`),
            e("div", { className: "statPill" }, `E ${Number(s.E ?? 0)}`),
            e("div", { className: "statPill" }, `A ${Number(s.A ?? 0)}`),
            e("div", { className: "statPill" }, `L ${Number(s.L ?? 0)}`),
            e("div", { className: "statPill" }, `T ${Number(s.T ?? 0)}`),
            e("div", { className: "statPill" }, `H ${Number(s.H ?? 0)}`)
          ]),
          e("div", { className: "statsNote" }, "Stats do not increase during tutorials. Leveling will handle that later.")
        ])
      ])
    );
  }

  function InventoryModal({ state, itemIndex, onUse, onEquip, onClose }) {
    const inv = ensureInventoryShape(state.inventory);
    const [tab, setTab] = React.useState("Consumables");
    const tabs = ["Consumables", "Weapons", "Armor", "Special Items"];

    function listForTab() {
      if (tab === "Consumables") return inv.consumables;
      if (tab === "Weapons") return inv.weapons;
      if (tab === "Armor") return inv.armors;
      if (tab === "Special Items") return inv.specialItems;
      return [];
    }

    function canUse(itemId) {
      const it = itemIndex[itemId];
      if (!it) return false;
      const slot = (it.slot || "").toLowerCase();
      return slot === "consumable" || !!it.consumeOnUse;
    }

    function canEquip(itemId) {
      const it = itemIndex[itemId];
      if (!it) return false;
      const slot = (it.slot || "").toLowerCase();
      return slot === "weapon" || slot === "armor" || slot === "special";
    }

    function renderItemRow(itemId) {
      const it = itemIndex[itemId] || { title: itemId, description: "" };
      return e("div", { className: "invRow", key: itemId }, [
        e("div", { className: "invInfo" }, [
          e("div", { className: "invName" }, it.title || itemId),
          it.rarity ? e("div", { className: "invRarity" }, it.rarity) : null,
          it.description ? e("div", { className: "invDesc" }, it.description) : null
        ]),
        e("div", { className: "invActions" }, [
          canUse(itemId) ? e("button", { className: "miniBtn", onClick: () => onUse(itemId) }, "Use") : null,
          canEquip(itemId) ? e("button", { className: "miniBtn", onClick: () => onEquip(itemId) }, "Equip") : null
        ])
      ]);
    }

    const items = listForTab();

    return Modal(
      { title: "Inventory", onClose },
      e("div", { className: "invWrap" }, [
        e("div", { className: "invTabs" }, tabs.map((t) =>
          e("button", { key: t, className: "tabBtn " + (tab === t ? "active" : ""), onClick: () => setTab(t) }, t)
        )),
        e("div", { className: "invList" }, items.length ? items.map(renderItemRow) : e("div", { className: "invEmpty" }, "Nothing here yet."))
      ])
    );
  }

  function MainMenu({ manifest, onStartStory, onLoadSave, hasSave }) {
    const stories = Array.isArray(manifest?.stories) ? manifest.stories : [];
    const defaultId = manifest?.defaultStoryId;

    return e("div", { className: "menuScene" }, [
      e("div", { className: "menuFrame" }, [
        e("div", { className: "menuLogoWrap" }, [
          e("img", {
            className: "menuLogo",
            src: LOGO_SRC,
            alt: "VerseCraft Logo",
            onError: () => console.warn("Logo missing:", LOGO_SRC)
          })
        ]),
        e("div", { className: "menuSubtitle" }, "Choose Your Paths. Live Your Story."),
        Button({ onClick: () => onStartStory(defaultId), className: "btnPrimaryWide", disabled: !defaultId }, "Tap To Start"),

        e("div", { className: "menuDivider" }),
        e("div", { className: "menuSectionTitle" }, "Load Story"),
        e("div", { className: "storyList" }, stories.map((st) =>
          e("button", { key: st.id, className: "storyBtn", onClick: () => onStartStory(st.id) }, [
            e("div", { className: "storyBtnTitle" }, st.title),
            st.subtitle ? e("div", { className: "storyBtnSub" }, st.subtitle) : null,
            st.estimate ? e("div", { className: "storyBtnMeta" }, st.estimate) : null
          ])
        )),

        e("div", { className: "menuDivider" }),
        Button({ onClick: onLoadSave, disabled: !hasSave, className: "btnGhostWide" }, "Load Saved Game"),
        e("div", { className: "menuFoot" }, "Local saves • Root GitHub Pages • Demo build")
      ])
    ]);
  }

  function StoryView({ section, onChoose }) {
    const lines = Array.isArray(section?.text) ? section.text : [];
    const choices = Array.isArray(section?.choices) ? section.choices : [];

    return e("div", { className: "storyWrap" }, [
      e("div", { className: "scenePanel" }, [
        e("div", { className: "sceneLabel" }, "Image Placeholder"),
        e("div", { className: "sceneHint" }, "Future: scene image or video")
      ]),
      e("div", { className: "storyPanel" },
        lines.map((ln, i) => {
          const n = normalizeTextLine(ln);
          if (n.kind === "sys") {
            const cls = n.tier === "whisper" ? "sys whisper" : n.tier === "hint" ? "sys hint" : "sys neutral";
            return e("div", { key: "sys-" + i, className: cls }, n.text);
          }
          return e("div", { key: "p-" + i, className: "p" }, n.text);
        })
      ),
      e("div", { className: "choices" },
        choices.map((ch) =>
          e("button", { key: ch.id || ch.text, className: "choiceBtn", onClick: () => onChoose(ch) }, ch.text)
        )
      )
    ]);
  }

  // ---------- App ----------
  function App() {
    const [manifest, setManifest] = React.useState(null);
    const [mode, setMode] = React.useState("menu");
    const [story, setStory] = React.useState(null);
    const [state, setState] = React.useState(null);
    const [section, setSection] = React.useState(null);

    const [showChar, setShowChar] = React.useState(false);
    const [showInv, setShowInv] = React.useState(false);

    const hasSave = (() => { try { return !!localStorage.getItem(STORAGE_KEY); } catch { return false; } })();

    React.useEffect(() => {
      fetch(STORIES_MANIFEST, { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => setManifest(j))
        .catch((err) => {
          console.error(err);
          setManifest({ defaultStoryId: null, stories: [] });
        });
    }, []);

    function gotoMenu() {
      setMode("menu");
      setStory(null);
      setState(null);
      setSection(null);
      setShowChar(false);
      setShowInv(false);
    }

    function loadStoryById(storyId) {
      const list = Array.isArray(manifest?.stories) ? manifest.stories : [];
      const meta = list.find((s) => s.id === storyId);
      if (!meta?.file) return;

      fetch(meta.file, { cache: "no-store" })
        .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} for ${meta.file}`); return r.json(); })
        .then((st) => {
          setStory(st);

          const defaults = deepClone(st?.save?.defaults || {});
          const inv = ensureInventoryShape(defaults.inventory);
          const eq = ensureEquippedShape(defaults.equipped);

          const initial = {
            sectionId: defaults.sectionId || st.startSectionId,
            stats: safeObj(defaults.stats),
            resources: safeObj(defaults.resources),
            progress: safeObj(defaults.progress),
            flags: safeObj(defaults.flags),
            inventory: inv,
            equipped: eq
          };

          const start = getSectionById(st, initial.sectionId) || getSectionById(st, st.startSectionId);
          const withEffects = applySectionEffects(initial, start);

          setState(withEffects);
          setSection(start);
          setMode("story");
        })
        .catch((err) => {
          console.error(err);
          alert(`Story load failed: ${err.message}`);
        });
    }

    function onChoose(choice) {
      if (!choice) return;
      if (choice.to === "MENU") { gotoMenu(); return; }
      if (!story || !state) return;

      const nextSection = getSectionById(story, choice.to);
      if (!nextSection) { alert(`Missing section: ${choice.to}`); return; }

      let nextState = { ...state, sectionId: nextSection.id };
      nextState = applySectionEffects(nextState, nextSection);

      setState(nextState);
      setSection(nextSection);
    }

    function onSave() {
      try {
        const payload = { manifestVersion: 1, storyId: story?.storyId, storyTitle: story?.title, state };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        alert("Saved.");
      } catch {
        alert("Save failed (storage may be blocked).");
      }
    }

    function onLoad() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return alert("No save found.");
        const payload = JSON.parse(raw);

        const list = Array.isArray(manifest?.stories) ? manifest.stories : [];
        const meta = list.find((s) => s.id === payload.storyId);
        if (!meta?.file) return alert("Saved story not found in stories.json");

        fetch(meta.file, { cache: "no-store" })
          .then((r) => r.json())
          .then((st) => {
            setStory(st);
            setState(payload.state);
            const sec = getSectionById(st, payload.state.sectionId) || getSectionById(st, st.startSectionId);
            setSection(sec);
            setMode("story");
          });
      } catch {
        alert("Load failed.");
      }
    }

    function onUseItem(itemId) { if (story && state) setState(useItem(state, story, itemId)); }
    function onEquipItem(itemId) { if (story && state) setState(equipItem(state, story, itemId)); }

    const itemIndex = story ? buildItemIndex(story) : {};

    if (mode === "menu") {
      return e(MainMenu, { manifest, onStartStory: loadStoryById, onLoadSave: onLoad, hasSave });
    }

    const res = safeObj(state?.resources);
    const hp = Number(res.HP ?? 0);

    if (hp <= 0) {
      return e("div", { className: "deathScreen" }, [
        e("div", { className: "deathCard" }, [
          e("div", { className: "deathTitle" }, "You Collapse"),
          e("div", { className: "deathText" }, "HP reached zero. The story ends here… for now."),
          e("div", { className: "deathActions" }, [
            Button({ onClick: () => loadStoryById(manifest?.defaultStoryId || "lorecraft_tutorial"), className: "btnPrimaryWide" }, "Restart Tutorial"),
            Button({ onClick: () => gotoMenu(), className: "btnGhostWide" }, "Return To Menu")
          ])
        ])
      ]);
    }

    return e("div", { className: "app" }, [
      e(HUD, {
        key: "hud",
        story,
        state,
        onOpenCharacter: () => setShowChar(true),
        onOpenInventory: () => setShowInv(true),
        onSave,
        onLoad,
        onMenu: gotoMenu
      }),
      e(StoryView, { key: "sv", section, onChoose }),
      showChar ? e(CharacterSheet, { key: "cs", state, itemIndex, onClose: () => setShowChar(false) }) : null,
      showInv ? e(InventoryModal, { key: "im", state, itemIndex, onUse: onUseItem, onEquip: onEquipItem, onClose: () => setShowInv(false) }) : null
    ]);
  }

  function mount() {
    const root = document.getElementById("app") || document.getElementById("root");
    if (!root) { console.error("Missing #app or #root element in index.html"); return; }
    ReactDOM.render(e(App), root);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();