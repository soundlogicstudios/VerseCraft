// Input binding helper
export function bindHitboxes(map){
  Object.entries(map).forEach(([id, fn]) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      fn(e);
    });
    // iOS Safari: also bind pointerup as a safety (some cases click is delayed)
    el.addEventListener("pointerup", (e) => {
      e.preventDefault();
      e.stopPropagation();
    }, { passive: false });
  });
}
