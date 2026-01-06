// ==============================
// VerseCraft Debug v2
// ==============================

function parseDebug(){
  const qs = new URLSearchParams(location.search);
  return qs.get("debug") === "1";
}

export function initDebug(){
  const btn = document.getElementById("btnDebug");
  const body = document.body;

  if (parseDebug()) body.classList.add("debug");

  if (btn){
    btn.addEventListener("click", () => {
      body.classList.toggle("debug");
    });
  }

  if (!body.classList.contains("debug")) return;

  enableTapTracer();
  enableScrollDiagnostics();
  dumpScreenState();
}

// ------------------------------
// Tap / Pointer Tracer
// ------------------------------
function enableTapTracer(){
  document.addEventListener("pointerdown", (e) => {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    console.group("🟦 Tap Trace");
    console.log("coords:", e.clientX, e.clientY);
    console.log("top element:", el);
    console.log("path:", e.composedPath().map(n => n.id || n.className || n.tagName));
    console.groupEnd();
  });
}

// ------------------------------
// Scroll Diagnostics (ToS)
// ------------------------------
function enableScrollDiagnostics(){
  const tos = document.getElementById("tosScroll");
  if (!tos) return;

  setInterval(() => {
    console.group("📜 ToS Scroll Diagnostics");
    console.log("scrollHeight:", tos.scrollHeight);
    console.log("clientHeight:", tos.clientHeight);
    console.log("scrollTop:", tos.scrollTop);
    console.log("overflow-y:", getComputedStyle(tos).overflowY);
    console.log("parent overflow:",
      tos.parentElement
        ? getComputedStyle(tos.parentElement).overflow
        : "none"
    );
    console.groupEnd();
  }, 2000);
}

// ------------------------------
// Screen & Z-Index Dump
// ------------------------------
function dumpScreenState(){
  console.group("🧱 Screen State");
  document.querySelectorAll(".screen").forEach(s => {
    const cs = getComputedStyle(s);
    console.log(s.id, {
      display: cs.display,
      zIndex: cs.zIndex,
      pointerEvents: cs.pointerEvents
    });
  });
  console.groupEnd();
}
    });
  }
}
