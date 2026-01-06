// VerseCraft Router v0.0.02
// Responsible ONLY for switching screens

const SCREENS = ["splash", "tos", "menu", "settings", "library", "story"];

export function initRouter() {
  // Allow direct linking via hash (#splash, #tos, #menu, #library, etc.)
  const hash = (location.hash || "").replace("#", "").trim();
  if (hash && SCREENS.includes(hash)) {
    requestAnimationFrame(() => go(hash));
  }
}

export function go(screenId) {
  if (!SCREENS.includes(screenId)) return;

  document.querySelectorAll(".screen").forEach(screen => {
    screen.classList.remove("active");
  });

  const next = document.querySelector(`[data-screen="${screenId}"]`);
  if (next) {
    next.classList.add("active");
  }

  // Keep URL in sync for debugging / reloads
  history.replaceState(null, "", `#${screenId}`);
}
