export async function bootStoryPlayer(cfg) {
  const video = document.getElementById(cfg.videoElementId);
  const narration = cfg.narrationElementId ? document.getElementById(cfg.narrationElementId) : null;
  const choicesEl = document.getElementById(cfg.choicesContainerId);
  const dimmerEl = document.getElementById(cfg.dimmerElementId);
  const statusEl = document.getElementById(cfg.statusElementId);

  const setStatus = (msg) => {
    statusEl.textContent = msg;
    console.log(msg);
  };

  const fatal = (msg) => {
    console.error(msg);
    if (cfg.onFatal) cfg.onFatal(msg);
    else setStatus(msg);
  };

  // Always keep the video silent so it never interrupts BGM on iOS.
  function forceVideoSilent() {
    if (!video) return;
    video.muted = true;
    video.defaultMuted = true;
    video.volume = 0;
    video.setAttribute("muted", "");
  }

  function stopNarration() {
    if (!narration) return;
    narration.pause();
    narration.currentTime = 0;
    narration.removeAttribute("src");
    narration.load();
  }

  function getNarrationSrc(node) {
    return (
      node?.narration ||
      node?.narrative ||
      node?.audio ||
      node?.narrationAudio ||
      ""
    );
  }

  // Wait until the audio has buffered enough to play smoothly.
  // On iOS Safari, starting too early can cause audible stutter.
  function waitForAudioReady(audioEl, timeoutMs = 3500) {
    return new Promise((resolve) => {
      if (!audioEl) return resolve(false);

      const done = (ok) => {
        cleanup();
        resolve(ok);
      };

      const cleanup = () => {
        audioEl.removeEventListener("canplay", onCanPlay);
        audioEl.removeEventListener("canplaythrough", onCanPlayThrough);
        audioEl.removeEventListener("loadeddata", onLoadedData);
        audioEl.removeEventListener("error", onErr);
        clearTimeout(t);
      };

      const onCanPlay = () => done(true);
      const onCanPlayThrough = () => done(true);
      const onLoadedData = () => done(true);
      const onErr = () => done(false);

      // If already buffered, go immediately.
      if (audioEl.readyState >= 2) return done(true);

      audioEl.addEventListener("canplay", onCanPlay, { once: true });
      audioEl.addEventListener("canplaythrough", onCanPlayThrough, { once: true });
      audioEl.addEventListener("loadeddata", onLoadedData, { once: true });
      audioEl.addEventListener("error", onErr, { once: true });

      const t = setTimeout(() => done(audioEl.readyState >= 2), timeoutMs);
    });
  }

  async function startNarrationForNode(node) {
    if (!narration) return;

    const src = getNarrationSrc(node);

    if (!src) {
      stopNarration();
      return;
    }

    narration.muted = false;
    narration.volume = 1;

    // Refresh src if changed
    const abs = new URL(src, window.location.href).href;
    if (narration.src !== abs) {
      narration.src = src;
      narration.preload = "auto";
      narration.load();
    }

    narration.currentTime = 0;

    // Give the audio a moment to buffer before playing (reduces stutter)
    await waitForAudioReady(narration);

    narration.play().catch(() => {
      console.warn("Narration play blocked (iOS). Try tapping once.");
    });
  }

  // IMPORTANT:
  // We intentionally do NOT hard-resync on every timeupdate.
  // That kind of correction causes audible stutter on iOS.
  function alignOnce(videoEl, audioEl) {
    if (!videoEl || !audioEl) return;
    try {
      audioEl.currentTime = videoEl.currentTime || 0;
    } catch {}
  }

  setStatus(`Loading story: ${cfg.storyJsonPath}`);
  const res = await fetch(cfg.storyJsonPath, { cache: "no-store" });
  if (!res.ok) {
    fatal(`STORY LOAD ERROR: HTTP ${res.status} for ${cfg.storyJsonPath}`);
    return;
  }

  const story = await res.json();

  // Clear any previous shown flags (kept for compatibility with older JSONs)
  for (const nodeId of Object.keys(story.nodes || {})) {
    const node = story.nodes[nodeId];
    (node.choices || []).forEach(c => { delete c._shown; });
  }

  let currentNodeId = null;

  function hideChoices() {
    if (dimmerEl) dimmerEl.style.opacity = "0";
    choicesEl.classList.add("hidden");
    choicesEl.innerHTML = "";
  }

  function showChoices(choices) {
    if (dimmerEl) dimmerEl.style.opacity = "1";

    choicesEl.innerHTML = "";
    choicesEl.classList.remove("hidden");

    choices.forEach((choice) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "choice-btn";
      btn.textContent = choice.label || "Choice";
      btn.addEventListener("click", () => {
        hideChoices();
        playNode(choice.goto);
      });
      choicesEl.appendChild(btn);
    });
  }

  async function playNode(nodeId) {
    const node = story?.nodes?.[nodeId];
    if (!node) {
      fatal(`NODE ERROR: Missing node "${nodeId}"`);
      return;
    }

    currentNodeId = nodeId;
    hideChoices();

    (node.choices || []).forEach(c => { delete c._shown; });

    video.onended = null;
    video.onpause = null;

    forceVideoSilent();

    video.src = node.video;
    video.playsInline = true;
    video.preload = "metadata";

    setStatus(`Playing node "${nodeId}" -> ${node.video}`);

    // Start narration first (buffer), then start video. This reduces iOS stutter.
    if (narration) {
      await startNarrationForNode(node);
    }

    try {
      await video.play();
    } catch (e) {
      fatal(`PLAY BLOCKED: ${e?.message || e}`);
      return;
    }

    // Align once after video begins (if narration exists and is playing)
    if (narration && narration.src) {
      alignOnce(video, narration);
      if (narration.paused) narration.play().catch(() => {});
    }

    video.onpause = () => {
      if (narration) narration.pause();
    };

    video.onended = () => {
      if (narration) {
        narration.pause();
        narration.currentTime = 0;
      }
      const choices = node.choices || [];
      if (choices.length) {
        showChoices(choices);
      } else {
        setStatus(`Ended "${nodeId}". No choices.`);
      }
    };
  }

  video.addEventListener("error", () => {
    const err = video.error;
    const code = err ? err.code : "(no code)";
    fatal(`VIDEO ERROR (code ${code}) at node "${currentNodeId}". Check path/case/encoding.`);
  });

  await playNode(story.start);
}
