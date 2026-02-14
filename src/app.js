import { bootStoryPlayer } from "./player.js";

const STORY_JSON = "src/content/stories/backrooms/story.json";

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
  // force reflow so animation retriggers
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
  // Start on a random layer so there's no dead black frame
  setActiveLayer(Math.floor(Math.random() * bgLayers.length));

  let i = 0;
  const steps = 14; // flicker count
  const base = 85;  // ms
  const jitter = 65; // ms

  function tick() {
    const idx = Math.floor(Math.random() * bgLayers.length);
    setActiveLayer(idx);

    // random glitch + flash moments
    const r = Math.random();
    if (r < 0.25) doGlitch();
    if (r < 0.16) doFlash(); // brief white flash

    i++;
    if (i < steps) {
      const nextDelay = base + Math.floor(Math.random() * jitter);
      setTimeout(tick, nextDelay);
    } else {
      // Land on a final layer and hold it
      const finalIdx = Math.floor(Math.random() * bgLayers.length);
      setActiveLayer(finalIdx);

      // One last subtle glitch settle (optional)
      setTimeout(() => {
        if (Math.random() < 0.35) doGlitch();
      }, 180);
    }
  }

  // tiny delay so images paint first
  setTimeout(tick, 120);
}

window.addEventListener("load", () => {
  setStatus("Intro loaded. Flicker starting.");
  flickerIntro();
});

// Start the player only after the intro tap.
// That tap is the user gesture iOS needs to allow playback with audio.
introStartBtn.addEventListener("click", async () => {
  setStatus("Starting story…");

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
