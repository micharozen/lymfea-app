import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./i18n";

// OneSignal handles its own service worker registration
createRoot(document.getElementById("root")!).render(<App />);
