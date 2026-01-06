// VerseCraft Starter v0.0.02
// Panel-by-panel navigation baseline (no modals)

import { initRouter, go } from "./router.js";
import { bindHitboxes } from "./input.js";
import { initDebug } from "./debug.js";

const VERSION = "0.0.02";

function setFooter() {
  const el = document.getElementById("footer");
  if (!el) return;

  // Replace just the text portion at the start of the footer, keep the Debug button
  // Footer structure in index.html: "VerseCraft v0.0.01 • [Debug]"
  const btn = document.getElementById("btnDebug");
  el.textContent = `VerseCraft v${VERSION} • `;
  if (btn) el.appendChild(btn);
}

function boot() {
  setFooter();
  initRouter();

  bindHitboxes({
    // Splash
    hbSplashTap: () => {
  const tosText = document.getElementById("tosText");
  if (tosText && tosText.innerHTML.trim() === "") {
    tosText.innerHTML = TERMS_OF_SERVICE_TEXT;
  }
  go("tos");
},

    // Terms of Service
    hbTosAccept: () => go("menu"),

    // Menu
    hbMenuLoad: () => go("library"),
    hbMenuSettings: () => go("settings"),

    // Settings
    hbSettingsBack: () => go("menu"),
    hbSettingsClear: () => alert("Clear Save (placeholder)"),
    hbSettingsTheme: () => alert("Theme (placeholder)"),

    // Library
    hbLibraryMenu: () => go("menu"),
    hbLibraryStore: () => alert("Store: Coming Soon"),
    hbRow0: () => go("story"),
    hbRow1: () => go("story"),
    hbRow2: () => go("story"),

    // Story
    hbStoryBack: () => go("library"),
  });

  initDebug();

  // Default start
  go("splash");}

window.addEventListener("DOMContentLoaded", boot, { once: true });
