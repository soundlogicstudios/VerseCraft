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
  // (Even if your MP4 is silent, setting muted prevents audio-session weirdness.)
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

  function playNarrationForNode(node) {
    if (!narration) return;

    // Support a few key names so you can evolve JSON without breaking:
    // preferred: node.narration
    // alternates: node.narrative, node.audio, node.narrationAudio
    const src =
      node?.narration ||
      node?.narrative ||
      node?.audio ||
      node?.narrationAudio ||
      "";

    if (!src) {
      stopNarration();
      return;
    }

    // Set/refresh src
    if (narration.src !== new URL(src, window.location.href).href) {
      narration.src = src;
      narration.load();
    }

    narration.currentTime = 0;

    // Try to play; if iOS blocks (rare after initial gesture), we fail soft.
    narration.play().catch(() => {
      console.warn("Narration autoplay blocked (iOS). User gesture may be required.");
    });
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

  function attachSync(videoEl, audioEl) {
    if (!videoEl || !audioEl) return;

    // Remove previous handlers so they don't stack
    videoEl.ontimeupdate = null;
    videoEl.onended = null;
    videoEl.onpause = null;

    // Keep narration aligned (light-touch correction)
    videoEl.ontimeupdate = () => {
      if (audioEl.paused) return;
      const drift = Math.abs(videoEl.currentTime - audioEl.currentTime);
      if (drift > 0.25) {
        audioEl.currentTime = videoEl.currentTime;
      }
    };

    videoEl.onpause = () => {
      audioEl.pause();
    };

    videoEl.onended = () => {
      audioEl.pause();
      audioEl.currentTime = 0;
    };
  }

  async function playNode(nodeId) {
    const node = story?.nodes?.[nodeId];
    if (!node) {
      fatal(`NODE ERROR: Missing node "${nodeId}"`);
      return;
    }

    currentNodeId = nodeId;
    hideChoices();

    // Reset shown flags for this node each entry (kept for compatibility)
    (node.choices || []).forEach(c => { delete c._shown; });

    // IMPORTANT: Clear prior handlers so they don't stack
    video.ontimeupdate = null;
    video.onended = null;
    video.onpause = null;

    forceVideoSilent();

    video.src = node.video;
    video.playsInline = true;
    video.preload = "metadata";

    setStatus(`Playing node "${nodeId}" -> ${node.video}`);

    // Prepare narration BEFORE starting playback so it's ready.
    if (narration) {
      playNarrationForNode(node);
      attachSync(video, narration);
    }

    try {
      await video.play();
    } catch (e) {
      fatal(`PLAY BLOCKED: ${e?.message || e}`);
      return;
    }

    // If narration exists but didn't start, try once more now that video is playing.
    if (narration && narration.src) {
      narration.play().catch(() => {});
    }

    // ✅ Choices ONLY at the end (no timers)
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
