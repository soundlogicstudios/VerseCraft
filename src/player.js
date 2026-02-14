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

  // Clear any previous shown flags
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
  }

  async function playNode(nodeId) {
    const node = story?.nodes?.[nodeId];
    if (!node) {
      fatal(`NODE ERROR: Missing node "${nodeId}"`);
      return;
    }

    currentNodeId = nodeId;
    hideChoices();

    // Reset shown flags for this node each entry
    (node.choices || []).forEach(c => { delete c._shown; });

    video.src = node.video;
    video.playsInline = true;
    video.preload = "metadata";

    setStatus(`Playing node "${nodeId}" -> ${node.video}`);

    // Because we started from a user tap, this should succeed on iOS with audio.
    try {
      await video.play();
    } catch (e) {
      fatal(`PLAY BLOCKED: ${e?.message || e}`);
      return;
    }

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

    video.onended = () => {
      const choices = node.choices || [];
      if (choices.length) showChoices(choices);
    };
  }

  video.addEventListener("error", () => {
    const err = video.error;
    const code = err ? err.code : "(no code)";
    fatal(`VIDEO ERROR (code ${code}) at node "${currentNodeId}". Check path/case/encoding.`);
  });

  await playNode(story.start);
}
