(async function () {
  const app = document.getElementById("app");

  try {
    const response = await fetch("./lorecraft_tutorial.story.json");
    if (!response.ok) {
      throw new Error("Failed to load story JSON: " + response.status);
    }

    const story = await response.json();

    app.innerHTML = `
      <h2>${story.title}</h2>
      <p><strong>Story ID:</strong> ${story.storyId}</p>
      <p><strong>Start Section:</strong> ${story.startSectionId}</p>
      <p style="opacity:0.8;margin-top:1rem;">
        ✅ Lorecraft loaded successfully.<br/>
        The world is ready to notice you.
      </p>
    `;

  } catch (err) {
    app.innerHTML = `
      <pre style="white-space:pre-wrap;color:#ff7777;">
${err.toString()}
      </pre>
    `;
  }
})();
