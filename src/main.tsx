import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./i18n";
import { initSentry } from "./lib/sentry";
import { initErrorTracking } from "./lib/logger";

// Sentry first — its global error handlers must be installed before anything
// else can throw.
initSentry();
initErrorTracking();

const RELOAD_FLAG = "__chunk_reloaded_at";

// Auto-recover from stale lazy chunks after a deploy.
// Vite emits `vite:preloadError` when a dynamic import fails to fetch.
// One-shot guard prevents an infinite reload loop if the failure is real.
const handleChunkError = () => {
  const last = Number(sessionStorage.getItem(RELOAD_FLAG) || 0);
  if (Date.now() - last < 10_000) return;
  sessionStorage.setItem(RELOAD_FLAG, String(Date.now()));
  window.location.reload();
};

window.addEventListener("vite:preloadError", handleChunkError);
window.addEventListener("error", (e) => {
  const msg = e?.message?.toLowerCase() ?? "";
  if (msg.includes("dynamically imported module") || msg.includes("importing a module script failed")) {
    handleChunkError();
  }
});

// OneSignal handles its own service worker registration
createRoot(document.getElementById("root")!).render(<App />);
