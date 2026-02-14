import { bootStoryPlayer } from "./player.js";

const STORY_JSON = "src/content/stories/backrooms/story.json";

const introOverlay = document.getElementById("introOverlay");
const introStartBtn = document.getElementById("introStartBtn");
const flash = document.getElementById("flash");
const statusEl = document.getElementById("status");

const bg1 = document.querySelector(".bg1");
const bg2 = document.querySelector(".bg2");
const bg3 = document.querySelector(".bg3");
const layers = [bg1, bg2, bg3];

function setStatus(msg){
  statusEl.textContent = msg;
  console.log(msg);
}

function showOnly(i){
  layers.forEach((el, idx) => el.style.opacity = (idx === i ? "1" : "0"));
}

function doFlash(){
  flash.classList.remove("flash-on");
  void flash.offsetWidth;
  flash.classList.add("flash-on");
}

function doGlitch(){
  // quick fluorescent brightness flicker
  const stack = document.querySelector(".intro-bg-stack");
  stack.style.filter = "brightness(1.35) contrast(1.15)";
  setTimeout(() => { stack.style.filter = "brightness(0.90) contrast(1.25)"; }, 40);
  setTimeout(() => { stack.style.filter = ""; }, 90);
}

function flickerIntro(){
  // Ensure something shows instantly
  showOnly(0);

  let step = 0;
  const steps = 14;
  const base = 85;
  const jitter = 65;

  function tick(){
    const idx = Math.floor(Math.random() * layers.length);
    showOnly(idx);

    const r = Math.random();
    if (r < 0.22) doGlitch();
    if (r < 0.14) doFlash();

    step++;
    if (step < steps){
      setTimeout(tick, base + Math.floor(Math.random() * jitter));
    } else {
      // land on one
      const finalIdx = Math.floor(Math.random() * layers.length);
      showOnly(finalIdx);
      if (Math.random() < 0.30) setTimeout(doGlitch, 120);
    }
  }

  setTimeout(tick, 120);
}

window.addEventListener("load", () => {
  setStatus("Intro ready.");
  flickerIntro();
});

introStartBtn.addEventListener("click", async () => {
  setStatus("Starting…");

  // Fade out intro overlay
  introOverlay.classList.add("fade-out");
  setTimeout(() => { introOverlay.style.display = "none"; }, 420);

  // Boot player and start from this user gesture
  await bootStoryPlayer({
    storyJsonPath: STORY_JSON,
    videoElementId: "video",
    choicesContainerId: "choices",
    dimmerElementId: "dimmer",
    statusElementId: "status"
  });
});
