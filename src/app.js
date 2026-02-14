import { bootStoryPlayer } from "./player.js";

const STORY_JSON = "src/content/stories/backrooms/story.json";

// Background audio config
const BGM_VOLUME = 0.35; // 0.0 - 1.0 (tune this)
const bgm = document.getElementById("bgm");

const narration = document.getElementById("narration");

const introOverlay = document.getElementById("introOverlay");
const introStartBtn = document.getElementById("introStartBtn");
const bgLayers = Array.from(document.querySelectorAll(".bg-layer"));
const bgStack = document.querySelector(".intro-bg-stack");
const flash = document.getElementById("flash");

const modalBackdrop = document.getElementById("modalBackdrop");
const modalContent = document.getElementById("modalContent");
const modalClose = document.getElementById("modalClose");
const statusEl = document.getElementById("status");

function setStatus(msg) {
  statusEl.textContent = msg;
  console.log(msg);
}

function showModal(msg) {
  modalContent.textContent = msg;
  modalBackdrop.classList.remove("hidden");
}

modalClose.addEventListener("click", () => modalBackdrop.classList.add("hidden"));

function setActiveLayer(index) {
  bgLayers.forEach((l, i) => (l.style.opacity = i === index ? "1" : "0"));
}

function doFlash() {
  flash.classList.remove("flash-on");
  void flash.offsetWidth;
  flash.classList.add("flash-on");
}

function doGlitch() {
  bgStack.classList.remove("glitch");
  void bgStack.offsetWidth;
  bgStack.classList.add("glitch");
  setTimeout(() => bgStack.classList.remove("glitch"), 140);
}

function flickerIntro() {
  setActiveLayer(Math.floor(Math.random() * bgLayers.length));

  let i = 0;
  const steps = 14;
  const base = 85;
  const jitter = 65;

  function tick() {
    const idx = Math.floor(Math.random() * bgLayers.length);
    setActiveLayer(idx);

    const r = Math.random();
    if (r < 0.25) doGlitch();
    if (r < 0.16) doFlash();

    i++;
    if (i < steps) {
      setTimeout(tick, base + Math.floor(Math.random() * jitter));
    } else {
      setActiveLayer(Math.floor(Math.random() * bgLayers.length));
      setTimeout(() => { if (Math.random() < 0.35) doGlitch(); }, 180);
    }
  }

  setTimeout(tick, 120);
}

/**
 * iOS Safari often blocks separate audio elements unless they are "unlocked"
 * by a play() call made directly inside a user gesture.
 * We do that here using a tiny silent WAV data URI.
 */
function unlockNarrationFromTap() {
  if (!narration) return;

  try {
    narration.pause();
    narration.currentTime = 0;
    narration.muted = true;
    narration.volume = 0;

    narration.src = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";
    narration.load();

    narration.play().then(() => {
      narration.pause();
      narration.currentTime = 0;

      // Clear the unlock src so it doesn't interfere with later real narration.
      narration.removeAttribute("src");
      narration.load();

      narration.muted = false;
      narration.volume = 1;
      console.log("Narration unlocked.");
    }).catch((e) => {
      console.warn("Narration unlock blocked:", e?.message || e);
      // Fail-soft: story can still play, and user can tap again if needed.
    });
  } catch (e) {
    console.warn("Narration unlock error:", e?.message || e);
  }
}

/**
 * Start background music.
 * IMPORTANT: must be called directly inside a user gesture (tap) on iOS.
 */
function startBgmFromTap() {
  if (!bgm) return;

  // Set volume every time in case iOS resets it
  bgm.volume = BGM_VOLUME;

  // Already playing?
  if (!bgm.paused) return;

  bgm.play().then(() => {
    console.log("BGM playing.");
  }).catch((e) => {
    console.warn("BGM blocked:", e?.message || e);
  });
}

// Keep audio alive if iOS pauses it when tab changes
document.addEventListener("visibilitychange", () => {
  if (!bgm) return;
  if (!document.hidden) {
    bgm.volume = BGM_VOLUME;
    bgm.play().catch(() => {});
  }
});

window.addEventListener("load", () => {
  setStatus("Intro loaded. Flicker starting.");
  flickerIntro();
});

// Start story + audio on intro tap
introStartBtn.addEventListener("click", async () => {
  setStatus("Starting…");

  // 🔥 IMPORTANT ORDER (iOS gesture reliability)
  // 1) Unlock narration audio element
  unlockNarrationFromTap();

  // 2) Start BGM (do NOT await)
  startBgmFromTap();

  // Fade out intro (visual)
  introOverlay.classList.add("fade-out");
  setTimeout(() => {
    introOverlay.style.display = "none";
  }, 420);

  try {
    await bootStoryPlayer({
      storyJsonPath: STORY_JSON,
      videoElementId: "video",
      narrationElementId: "narration",
      choicesContainerId: "choices",
      dimmerElementId: "dimmer",
      statusElementId: "status",
      onFatal: (msg) => showModal(msg),
    });
  } catch (e) {
    showModal(`BOOT ERROR: ${e?.message || e}`);
  }
});
