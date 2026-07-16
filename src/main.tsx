import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./styles/app-refonte.css";
import "./i18n";
import { initErrorTracking } from "./lib/logger";
import { reloadWithCacheBust } from "./lib/reload";

initErrorTracking();

const RELOAD_FLAG = "__chunk_reloaded_at";
const RELOAD_COOLDOWN_MS = 3_000; // 3s instead of 10s to catch rapid errors
const MAX_RELOAD_ATTEMPTS = 3; // Track attempts to prevent infinite loops

// Auto-recover from stale lazy chunks after a deploy.
// Vite emits `vite:preloadError` when a dynamic import fails to fetch.
// Guard prevents an infinite reload loop if the failure is real.
const handleChunkError = (source: string) => {
  const last = Number(sessionStorage.getItem(RELOAD_FLAG) || 0);
  const now = Date.now();
  
  // Cooldown check
  if (now - last < RELOAD_COOLDOWN_MS) {
    console.warn(`[ChunkError] Cooldown active, skipping reload from ${source}`);
    return;
  }
  
  // Attempt counter (reset after 60s of no errors)
  const ATTEMPTS_KEY = "__chunk_reload_attempts";
  const ATTEMPTS_RESET_MS = 60_000;
  const attemptsData = sessionStorage.getItem(ATTEMPTS_KEY);
  let attempts = 0;
  let lastAttemptTime = 0;
  
  if (attemptsData) {
    try {
      const parsed = JSON.parse(attemptsData);
      attempts = parsed.attempts || 0;
      lastAttemptTime = parsed.lastTime || 0;
      
      // Reset if last attempt was > 60s ago
      if (now - lastAttemptTime > ATTEMPTS_RESET_MS) {
        attempts = 0;
      }
    } catch {
      attempts = 0;
    }
  }
  
  if (attempts >= MAX_RELOAD_ATTEMPTS) {
    console.warn(`[ChunkError] Max reload attempts (${MAX_RELOAD_ATTEMPTS}) reached, letting ErrorBoundary handle it`);
    return; // Let ErrorBoundary handle it and show manual reload UI
  }
  
  console.info(`[ChunkError] Chunk load error detected from ${source} (attempt ${attempts + 1}/${MAX_RELOAD_ATTEMPTS}). Auto-reloading...`);
  
  // Update flags
  sessionStorage.setItem(RELOAD_FLAG, String(now));
  sessionStorage.setItem(ATTEMPTS_KEY, JSON.stringify({
    attempts: attempts + 1,
    lastTime: now
  }));
  
  // Safari iOS can reuse stale module responses on a plain reload.
  reloadWithCacheBust();
};

// Listen for Vite preload errors
window.addEventListener("vite:preloadError", () => {
  handleChunkError("vite:preloadError");
});

// Listen for dynamic import errors
window.addEventListener("error", (e) => {
  const msg = e?.message?.toLowerCase() ?? "";
  if (
    msg.includes("dynamically imported module") || 
    msg.includes("importing a module script failed") ||
    msg.includes("failed to fetch") && msg.includes("chunk")
  ) {
    handleChunkError("window.error");
  }
});

// Listen for unhandled promise rejections (catch async import failures)
window.addEventListener("unhandledrejection", (e) => {
  const reason = String(e.reason?.message || e.reason || "").toLowerCase();
  if (
    reason.includes("dynamically imported module") || 
    reason.includes("importing a module script failed") ||
    reason.includes("failed to fetch") && reason.includes("chunk")
  ) {
    e.preventDefault(); // Prevent default logging
    handleChunkError("unhandledrejection");
  }
});

// OneSignal handles its own service worker registration
createRoot(document.getElementById("root")!).render(<App />);
