import { bootStoryPlayer } from "./player.js";

const STORY_JSON = "src/content/stories/backrooms/story.json";

// Background audio config
const BGM_VOLUME = 0.35; // 0.0 - 1.0 (tune this)
const bgm = document.getElementById("bgm");

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
 * Start background music.
 * IMPORTANT: must be called directly inside a user gesture (tap) on iOS.
 */
async function startBgmFromTap() {
  if (!bgm) return;

  // Set volume every time in case iOS resets it
  bgm.volume = BGM_VOLUME;

  // Already playing?
  if (!bgm.paused) return;

  try {
    await bgm.play();
    console.log("BGM playing.");
  } catch (e) {
    console.warn("BGM blocked:", e?.message || e);
    // We don't fatal — video is more important. User can tap again if needed.
  }
}

// Keep audio alive if iOS pauses it when tab changes
document.addEventListener("visibilitychange", () => {
  if (!bgm) return;
  if (!document.hidden) {
    // attempt resume (may require gesture on iOS, harmless otherwise)
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

  // 🔥 Start audio FIRST (no awaits before this for iOS gesture reliability)
  await startBgmFromTap();

  // Fade out intro
  introOverlay.classList.add("fade-out");
  setTimeout(() => {
    introOverlay.style.display = "none";
  }, 420);

  try {
    await bootStoryPlayer({
      storyJsonPath: STORY_JSON,
      videoElementId: "video",
      choicesContainerId: "choices",
      dimmerElementId: "dimmer",
      statusElementId: "status",
      onFatal: (msg) => showModal(msg),
    });
  } catch (e) {
    showModal(`BOOT ERROR: ${e?.message || e}`);
  }
});
