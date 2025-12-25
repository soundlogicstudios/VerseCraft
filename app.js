/* VerseCraft Demo App
   - Story loader: stories.json + *.story.json
   - Items: story-scoped items[] catalog, inventory, equip, use, consume
   - HP clamp: 0..MAX_HP
   - Save/Load: single slot
*/

(function () {
  const e = React.createElement;

  const STORAGE_KEY = "versecraft_save_v1";
  const STORIES_MANIFEST = "stories.json";

  // ---------- Helpers ----------
  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function safeObj(v) {
    return v && typeof v === "object" ? v : {};
  }

  function normalizeTextLine(line) {
    if (typeof line === "string") return { kind: "plain", text: line };
    if (line && typeof line === "object" && line.__sys) {
      return { kind: "sys", tier: line.tier || "neutral", text: line.text || "" };
    }
    // fallback
    return { kind: "plain", text: String(line) };
  }

  function buildItemIndex(story) {
    const idx = {};
    const arr = Array.isArray(story.items) ? story.items : [];
    for (const it of arr) {
      if (!it || !it.id) continue;
      idx[it.id] = it;
    }
    return idx;
  }

  function getSectionById(story, id) {
    const sections = Array.isArray(story.sections) ? story.sections : [];
    return sections.find((s) => s.id === id) || null;
  }

  function applyResourcesDelta(state, delta) {
    const d = safeObj(delta);
    const res = safeObj(state.resources);
    const maxHp = Number(res.MAX_HP ?? 10);

    if (d.HP !== undefined) {
      const next = clamp(Number(res.HP ?? 0) + Number(d.HP), 0, maxHp);
      res.HP = next;
    }
    if (d.MAX_HP !== undefined) {
      res.MAX_HP = Math.max(1, Number(res.MAX_HP ?? 10) + Number(d.MAX_HP));
      // re-clamp HP
      res.HP = clamp(Number(res.HP ?? 0), 0, Number(res.MAX_HP));
    }
    if (d.REPUTATION !== undefined) {
      res.REPUTATION = Number(res.REPUTATION ?? 0) + Number(d.REPUTATION);
    }
    if (d.TIMING !== undefined) {
      res.TIMING = Number(res.TIMING ?? 0) + Number(d.TIMING);
    }

    return { ...state, resources: res };
  }

  function applySectionEffects(state, section) {
    if (!section || !section.effects) return state;
    const eff = section.effects;

    if (eff.resourcesDelta) {
      return applyResourcesDelta(state, eff.resourcesDelta);
    }
    return state;
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
    return {
      weapon: x.weapon ?? null,
      armor: x.armor ?? null,
      special: x.special ?? null
    };
  }

  function removeOneFromArray(arr, value) {
    const idx = arr.indexOf(value);
    if (idx >= 0) {
      const copy = arr.slice();
      copy.splice(idx, 1);
      return copy;
    }
    return arr.slice();
  }

  function itemSlotOf(itemDef) {
    const slot = (itemDef?.slot || "").toLowerCase();
    if (slot === "consumable") return "consumables";
    if (slot === "weapon") return "weapons";
    if (slot === "armor") return "armors";
    if (slot === "special") return "specialItems";
    return null;
  }

  // Apply item use:
  // - values: HP, Reputation, Timing
  // - flagsSet / flagsClear
  // - consumeOnUse => remove from inventory if in consumables or if explicitly consumable
  function useItem(state, story, itemId) {
    const itemIndex = buildItemIndex(story);
    const item = itemIndex[itemId];
    if (!item) return state;

    // Values
    const values = safeObj(item.values);
    const delta = {};
    if (values.HP) delta.HP = Number(values.HP);
    if (values.Reputation) delta.REPUTATION = Number(values.Reputation);
    if (values.Timing) delta.TIMING = Number(values.Timing);

    let next = applyResourcesDelta(state, delta);

    // Flags
    const flags = safeObj(next.flags);
    const setList = Array.isArray(item.flagsSet) ? item.flagsSet : [];
    const clrList = Array.isArray(item.flagsClear) ? item.flagsClear : [];

    for (const f of setList) if (f) flags[f] = true;
    for (const f of clrList) if (f) delete flags[f];

    next = { ...next, flags };

    // Consume
    if (item.consumeOnUse) {
      const inv = ensureInventoryShape(next.inventory);
      // remove from any category it exists in
      inv.consumables = removeOneFromArray(inv.consumables, itemId);
      inv.weapons = removeOneFromArray(inv.weapons, itemId);
      inv.armors = removeOneFromArray(inv.armors, itemId);
      inv.specialItems = removeOneFromArray(inv.specialItems, itemId);

      // also unequip if it was equipped
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

  // ---------- UI Components ----------
  function Pill({ children, className }) {
    return e("span", { className: "pill " + (className || "") }, children);
  }

  function Button({ onClick, children, disabled, className }) {
    return e(
      "button",
      { className: "btn " + (className || ""), onClick, disabled: !!disabled },
      children
    );
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

  function HUD({ story, state, onOpenCharacter, onOpenInventory, onSave, onLoad }) {
    const title = story?.title || "VerseCraft";
    const res = safeObj(state.resources);
    const hp = Number(res.HP ?? 0);
    const maxHp = Number(res.MAX_HP ?? 10);
    const rep = Number(res.REPUTATION ?? 0);
    const timing = Number(res.TIMING ?? 0);
    const lvl = Number(state.progress?.level ?? 1);
    const xp = Number(state.progress?.xp ?? 0);

    return e("div", { className: "hud" }, [
      e("div", { className: "hudLeft", key: "l" }, [
        e("div", { className: "hudTitle", key: "t" }, title),
        e("div", { className: "hudMeta", key: "m" }, [
          Pill({ className: "pillHp" }, `HP ${hp}/${maxHp}`),
          Pill({}, `Lv ${lvl}`),
          Pill({}, `XP ${xp}`),
          Pill({}, `Rep ${rep}`),
          Pill({}, `Timing ${timing}`)
        ])
      ]),
      e("div", { className: "hudRight", key: "r" }, [
        Button({ onClick: onOpenCharacter, className: "btnSmall" }, "Character"),
        Button({ onClick: onOpenInventory, className: "btnSmall" }, "Inventory"),
        Button({ onClick: onSave, className: "btnSmall" }, "Save"),
        Button({ onClick: onLoad, className: "btnSmall" }, "Load")
      ])
    ]);
  }

  function CharacterSheet({ story, state, itemIndex, onClose }) {
    const s = safeObj(state.stats);
    const eq = ensureEquippedShape(state.equipped);

    function labelOf(id) {
      const it = itemIndex[id];
      return it?.title || id || "None";
    }

    return Modal(
      {
        title: "Character Sheet",
        onClose
      },
      e("div", { className: "charSheet" }, [
        e("div", { className: "charRow", key: "row1" }, [
          e("div", { className: "charCard avatarCard", key: "av" }, [
            e("div", { className: "avatarSilhouette" }, "Avatar"),
            e("div", { className: "avatarHint" }, "Future: animated / skinned")
          ]),
          e("div", { className: "charCard loadoutCard", key: "ld" }, [
            e("div", { className: "cardTitle" }, "Loadout"),
            e("div", { className: "loadoutLine" }, `Weapon: ${labelOf(eq.weapon)}`),
            e("div", { className: "loadoutLine" }, `Armor: ${labelOf(eq.armor)}`),
            e("div", { className: "loadoutLine" }, `Special: ${labelOf(eq.special)}`)
          ])
        ]),
        e("div", { className: "charCard statsCard", key: "stats" }, [
          e("div", { className: "cardTitle" }, "Wealth Stats"),
          e("div", { className: "statsRow" }, [
            Pill({}, `W ${Number(s.W ?? 0)}`),
            Pill({}, `E ${Number(s.E ?? 0)}`),
            Pill({}, `A ${Number(s.A ?? 0)}`),
            Pill({}, `L ${Number(s.L ?? 0)}`),
            Pill({}, `T ${Number(s.T ?? 0)}`),
            Pill({}, `H ${Number(s.H ?? 0)}`)
          ]),
          e(
            "div",
            { className: "statsNote" },
            "Stats do not increase during tutorials. Leveling will handle that later."
          )
        ])
      ])
    );
  }

  function InventoryModal({ story, state, itemIndex, onUse, onEquip, onClose }) {
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
      // allow use if consumable or consumeOnUse, otherwise disallow by default (story can still narratively gate usage)
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
      const desc = it.description || "";
      const rarity = it.rarity || "";
      return e("div", { className: "invRow", key: itemId }, [
        e("div", { className: "invInfo", key: "info" }, [
          e("div", { className: "invName", key: "n" }, it.title || itemId),
          rarity ? e("div", { className: "invRarity", key: "r" }, rarity) : null,
          desc ? e("div", { className: "invDesc", key: "d" }, desc) : null
        ]),
        e("div", { className: "invActions", key: "act" }, [
          canUse(itemId) ? Button({ onClick: () => onUse(itemId), className: "btnSmall" }, "Use") : null,
          canEquip(itemId) ? Button({ onClick: () => onEquip(itemId), className: "btnSmall" }, "Equip") : null
        ])
      ]);
    }

    const items = listForTab();

    return Modal(
      { title: "Inventory", onClose },
      e("div", { className: "invWrap" }, [
        e("div", { className: "invTabs", key: "tabs" }, tabs.map((t) =>
          e(
            "button",
            {
              key: t,
              className: "tabBtn " + (tab === t ? "active" : ""),
              onClick: () => setTab(t)
            },
            t
          )
        )),
        e("div", { className: "invList", key: "list" }, items.length
          ? items.map(renderItemRow)
          : e("div", { className: "invEmpty" }, "Nothing here yet."))
      ])
    );
  }

  function MainMenu({ manifest, onStartStory, onLoadSave, hasSave }) {
    const stories = Array.isArray(manifest?.stories) ? manifest.stories : [];
    const defaultId = manifest?.defaultStoryId;

    return e("div", { className: "menu" }, [
      e("div", { className: "menuCard", key: "card" }, [
        e("div", { className: "menuTitle", key: "t" }, "VerseCraft"),
        e("div", { className: "menuSubtitle", key: "s" }, "Choose Your Paths. Live Your Story."),
        Button(
          { onClick: () => onStartStory(defaultId), className: "btnPrimary", disabled: !defaultId },
          "Tap To Start"
        ),
        e("div", { className: "menuDivider" }, ""),
        e("div", { className: "menuSectionTitle" }, "Load Story"),
        e("div", { className: "storyList" }, stories.map((st) =>
          e("button",
            {
              key: st.id,
              className: "storyBtn",
              onClick: () => onStartStory(st.id)
            },
            `${st.title}${st.subtitle ? " — " + st.subtitle : ""}`
          )
        )),
        e("div", { className: "menuDivider" }, ""),
        Button({ onClick: onLoadSave, disabled: !hasSave, className: "btnSmall" }, "Load Saved Game")
      ])
    ]);
  }

  function StoryView({ story, state, section, onChoose }) {
    const lines = Array.isArray(section?.text) ? section.text : [];
    const choices = Array.isArray(section?.choices) ? section.choices : [];

    return e("div", { className: "story" }, [
      e("div", { className: "imagePlaceholder", key: "img" }, "Scene Image Placeholder"),
      e("div", { className: "storyTextBox", key: "txt" },
        lines.map((ln, i) => {
          const n = normalizeTextLine(ln);
          if (n.kind === "sys") {
            const cls =
              n.tier === "whisper" ? "sys whisper"
              : n.tier === "hint" ? "sys hint"
              : "sys neutral";
            return e("div", { key: "sys-" + i, className: cls }, n.text);
          }
          return e("div", { key: "p-" + i, className: "p" }, n.text);
        })
      ),
      e("div", { className: "choices", key: "c" },
        choices.map((ch) =>
          e("button",
            { key: ch.id || ch.text, className: "choiceBtn", onClick: () => onChoose(ch) },
            ch.text
          )
        )
      )
    ]);
  }

  // ---------- App ----------
  function App() {
    const [manifest, setManifest] = React.useState(null);
    const [mode, setMode] = React.useState("menu"); // menu | story
    const [story, setStory] = React.useState(null);
    const [state, setState] = React.useState(null);
    const [section, setSection] = React.useState(null);

    const [showChar, setShowChar] = React.useState(false);
    const [showInv, setShowInv] = React.useState(false);

    const hasSave = (() => {
      try {
        return !!localStorage.getItem(STORAGE_KEY);
      } catch {
        return false;
      }
    })();

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
      if (!meta || !meta.file) return;

      fetch(meta.file, { cache: "no-store" })
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status} for ${meta.file}`);
          return r.json();
        })
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

    function onStartStory(storyId) {
      loadStoryById(storyId);
    }

    function onChoose(choice) {
      if (!choice) return;
      if (choice.to === "MENU") {
        gotoMenu();
        return;
      }
      if (!story || !state) return;

      const nextSection = getSectionById(story, choice.to);
      if (!nextSection) {
        alert(`Missing section: ${choice.to}`);
        return;
      }

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
      } catch (e) {
        alert("Save failed (storage may be blocked).");
      }
    }

    function onLoad() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return alert("No save found.");
        const payload = JSON.parse(raw);

        // Reload story file by storyId from manifest
        const list = Array.isArray(manifest?.stories) ? manifest.stories : [];
        const meta = list.find((s) => s.id === payload.storyId || s.id === payload.state?.storyId);
        if (!meta || !meta.file) return alert("Saved story not found in stories.json");

        fetch(meta.file, { cache: "no-store" })
          .then((r) => r.json())
          .then((st) => {
            setStory(st);
            setState(payload.state);

            const sec = getSectionById(st, payload.state.sectionId) || getSectionById(st, st.startSectionId);
            setSection(sec);
            setMode("story");
          });
      } catch (e) {
        alert("Load failed.");
      }
    }

    function onUseItem(itemId) {
      if (!story || !state) return;
      const next = useItem(state, story, itemId);
      setState(next);
    }

    function onEquipItem(itemId) {
      if (!story || !state) return;
      const next = equipItem(state, story, itemId);
      setState(next);
    }

    const itemIndex = story ? buildItemIndex(story) : {};

    if (mode === "menu") {
      return e(MainMenu, {
        manifest,
        onStartStory,
        onLoadSave: onLoad,
        hasSave
      });
    }

    // story mode
    const res = safeObj(state?.resources);
    const hp = Number(res.HP ?? 0);
    if (hp <= 0) {
      return e("div", { className: "deathScreen" }, [
        e("div", { className: "deathCard", key: "d" }, [
          e("div", { className: "deathTitle" }, "You Collapse"),
          e("div", { className: "deathText" }, "HP reached zero. The story ends here… for now."),
          e("div", { className: "deathActions" }, [
            Button({ onClick: () => loadStoryById((manifest?.defaultStoryId) || "lorecraft_tutorial"), className: "btnPrimary" }, "Restart Tutorial"),
            Button({ onClick: () => loadStoryById((manifest?.stories || [])[0]?.id || "lorecraft_tutorial"), className: "btnSmall" }, "Restart Current Story"),
            Button({ onClick: gotoMenu, className: "btnSmall" }, "Return To Menu")
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
        onLoad
      }),
      e(StoryView, {
        key: "sv",
        story,
        state,
        section,
        onChoose
      }),
      showChar
        ? e(CharacterSheet, {
            key: "cs",
            story,
            state,
            itemIndex,
            onClose: () => setShowChar(false)
          })
        : null,
      showInv
        ? e(InventoryModal, {
            key: "im",
            story,
            state,
            itemIndex,
            onUse: onUseItem,
            onEquip: onEquipItem,
            onClose: () => setShowInv(false)
          })
        : null
    ]);
  }

  // ---------- Mount ----------
  function mount() {
    const root = document.getElementById("root") || document.getElementById("app");
    if (!root) {
      console.error("Missing #root or #app element in index.html");
      return;
    }
    ReactDOM.render(e(App), root);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();