export async function bootStoryPlayer(cfg) {
  const video = document.getElementById(cfg.videoElementId);
  const tapBtn = document.getElementById(cfg.tapButtonId);
  const choicesEl = document.getElementById(cfg.choicesContainerId);
  const statusEl = document.getElementById(cfg.statusElementId);

  const setStatus = (msg) => {
    statusEl.textContent = msg;
    console.log(msg);
  };

  let story = null;
  let currentNodeId = null;

  // Load story JSON
  setStatus(`Loading story: ${cfg.storyJsonPath}`);
  const res = await fetch(cfg.storyJsonPath, { cache: "no-store" });
  if (!res.ok) {
    setStatus(`STORY LOAD ERROR: HTTP ${res.status} for ${cfg.storyJsonPath}`);
    return;
  }
  story = await res.json();

  // Reset any shown flags
  for (const nodeId of Object.keys(story.nodes || {})) {
    const node = story.nodes[nodeId];
    (node.choices || []).forEach(c => { delete c._shown; });
  }

  // Helpers
  const hideChoices = () => {
    choicesEl.classList.add("hidden");
    choicesEl.innerHTML = "";
  };

  const showChoices = (choices) => {
    // Pause to force decision moment
    video.pause();
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
  };

  const playNode = async (nodeId) => {
    const node = story?.nodes?.[nodeId];
    if (!node) {
      setStatus(`NODE ERROR: Missing node "${nodeId}"`);
      return;
    }

    currentNodeId = nodeId;
    hideChoices();

    // Clear shown flags for this node’s choices each time we enter it
    (node.choices || []).forEach(c => { delete c._shown; });

    // Set source
    video.src = node.video;
    video.playsInline = true;
    video.preload = "metadata";

    setStatus(`Playing node "${nodeId}" -> ${node.video}`);

    // Attempt play (may require tap on iOS)
    try {
      await video.play();
      tapBtn.style.display = "none";
    } catch (e) {
      // iOS gesture requirement: user taps button
      tapBtn.style.display = "";
      setStatus(`Tap required to play (iOS). Ready: ${node.video}`);
    }

    // Time-based choices
    video.ontimeupdate = () => {
      const choices = node.choices || [];
      for (const choice of choices) {
        if (choice._shown) continue;
        if (typeof choice.at === "number" && video.currentTime >= choice.at) {
          choice._shown = true;
          showChoices(choices);
          break;
        }
      }
    };

    // End fallback: if no at-trigger happened, show choices at end
    video.onended = () => {
      const choices = node.choices || [];
      if (choices.length) showChoices(choices);
    };
  };

  // Diagnostics
  video.addEventListener("error", () => {
    const err = video.error;
    const code = err ? err.code : "(no code)";
    setStatus(`VIDEO ERROR (code ${code}) at node "${currentNodeId}". Check encoding or path.`);
  });

  tapBtn.addEventListener("click", async () => {
    try {
      await video.play();
      tapBtn.style.display = "none";
      setStatus(`Playing (after tap) node "${currentNodeId}".`);
    } catch (e) {
      setStatus(`Play blocked: ${e?.message || e}`);
    }
  });

  // Start
  playNode(story.start);
}
