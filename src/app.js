import { bootStoryPlayer } from "./player.js";

// Load your backrooms story JSON
bootStoryPlayer({
  storyJsonPath: "src/content/stories/backrooms/story.json",
  videoElementId: "video",
  tapButtonId: "tapToPlay",
  choicesContainerId: "choices",
  statusElementId: "status"
});
