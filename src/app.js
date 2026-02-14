// IMPORTANT: This path MUST match your real file EXACTLY (including case).
// Put your video here:
//   src/content/video/backrooms/backrooms_n02_intro.mp4
const VIDEO_SRC = "src/content/video/backrooms/backrooms_n02_intro.mp4";

const video = document.getElementById("video");
const tapBtn = document.getElementById("tapToPlay");
const status = document.getElementById("status");

function setStatus(msg) {
  status.textContent = msg;
  console.log(msg);
}

// Basic wiring
video.src = VIDEO_SRC;
video.playsInline = true; // iOS hint
video.preload = "metadata";

// Helpful events
video.addEventListener("loadedmetadata", () => {
  setStatus(`Loaded metadata. Duration: ${isFinite(video.duration) ? video.duration.toFixed(2) + "s" : "?"}`);
});

video.addEventListener("canplay", () => {
  setStatus("Video can play. Tap to start if it doesn't auto-play.");
});

video.addEventListener("error", () => {
  const err = video.error;
  // MediaError codes: 1 aborted, 2 network, 3 decode, 4 src not supported
  const code = err ? err.code : "(no code)";
  setStatus(`VIDEO ERROR (code ${code}). Most common causes: 404 path/case mismatch, codec not H.264/AAC, or bad file.`);
});

video.addEventListener("playing", () => {
  tapBtn.style.display = "none";
  setStatus("Playing.");
});

video.addEventListener("pause", () => {
  // If it pauses immediately on iOS without playing, user gesture likely needed
  // Keep the tap button visible.
});

tapBtn.addEventListener("click", async () => {
  try {
    // If you want true autoplay later, you'd set video.muted = true.
    // For now we keep audio on, so user gesture is required and this solves it.
    await video.play();
  } catch (e) {
    setStatus(`Play blocked: ${e?.message || e}. If you see a slashed play icon, check path + codec.`);
  }
});

// Immediate check
setStatus(`Trying to load: ${VIDEO_SRC}`);
