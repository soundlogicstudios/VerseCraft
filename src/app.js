const story = {
  start: "n01",
  nodes: {
    n01: {
      video: "src/content/video/backrooms/backrooms_n02_intro.mp4",
      choices: []
    }
  }
};

const video = document.getElementById("video");
video.src = story.nodes[story.start].video;
