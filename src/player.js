export async function bootStoryPlayer(cfg){
  const video = document.getElementById(cfg.videoElementId);
  const choicesEl = document.getElementById(cfg.choicesContainerId);
  const dimmerEl = document.getElementById(cfg.dimmerElementId);
  const statusEl = document.getElementById(cfg.statusElementId);

  const setStatus = (msg) => { statusEl.textContent = msg; console.log(msg); };

  setStatus(`Loading story: ${cfg.storyJsonPath}`);
  const res = await fetch(cfg.storyJsonPath, { cache:"no-store" });
  if (!res.ok){
    setStatus(`STORY LOAD ERROR: HTTP ${res.status}`);
    return;
  }
  const story = await res.json();

  let currentNodeId = null;

  function hideChoices(){
    if (dimmerEl) dimmerEl.style.opacity = "0";
    choicesEl.classList.add("hidden");
    choicesEl.innerHTML = "";
  }

  function showChoices(choices){
    if (dimmerEl) dimmerEl.style.opacity = "1";
    video.pause();

    choicesEl.innerHTML = "";
    choicesEl.classList.remove("hidden");

    choices.forEach((c) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "choice-btn";
      btn.textContent = c.label || "Choice";
      btn.onclick = () => { hideChoices(); playNode(c.goto); };
      choicesEl.appendChild(btn);
    });
  }

  async function playNode(nodeId){
    const node = story?.nodes?.[nodeId];
    if (!node){
      setStatus(`NODE MISSING: ${nodeId}`);
      return;
    }

    currentNodeId = nodeId;
    hideChoices();

    video.src = node.video;
    video.playsInline = true;
    video.preload = "metadata";

    setStatus(`Playing ${nodeId}`);
    await video.play(); // should succeed because intro tap was the gesture

    video.ontimeupdate = () => {
      const choices = node.choices || [];
      for (const c of choices){
        if (c._shown) continue;
        if (typeof c.at === "number" && video.currentTime >= c.at){
          c._shown = true;
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
    const code = video.error?.code ?? "?";
    setStatus(`VIDEO ERROR code ${code} at node ${currentNodeId}`);
  });

  // clear shown flags
  Object.values(story.nodes || {}).forEach(n => (n.choices || []).forEach(c => delete c._shown));

  await playNode(story.start);
}
