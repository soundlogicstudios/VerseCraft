export async function bootStoryPlayer(cfg) {
  const video = document.getElementById(cfg.videoElementId);
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

    // Reset shown flags for this node each entry (kept for compatibility)
    (node.choices || []).forEach(c => { delete c._shown; });

    // IMPORTANT: Clear prior handlers so they don't stack
    video.ontimeupdate = null;
    video.onended = null;

    video.src = node.video;
    video.playsInline = true;
    video.preload = "metadata";

    setStatus(`Playing node "${nodeId}" -> ${node.video}`);

    try {
      await video.play();
    } catch (e) {
      fatal(`PLAY BLOCKED: ${e?.message || e}`);
      return;
    }

    // ✅ Choices ONLY at the end (no timers)
    video.onended = () => {
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
