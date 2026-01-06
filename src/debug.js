// Debug: outlines hitboxes when enabled
function parseDebug(){
  const qs = new URLSearchParams(location.search);
  return qs.get("debug") === "1";
}

export function initDebug(){
  const btn = document.getElementById("btnDebug");
  const body = document.body;

  // initial
  if (parseDebug()) body.classList.add("debug");

  if (btn){
    btn.addEventListener("click", () => {
      body.classList.toggle("debug");
    });
  }
}
