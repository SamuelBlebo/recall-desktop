import { createRoot } from "react-dom/client";
import App from "./App";
import { init } from "./lib/store";
import "./styles.css";

// Block the browser's right-click menu & reload shortcuts so it feels like a desktop app.
if ("__TAURI_INTERNALS__" in window) {
  window.addEventListener("contextmenu", (e) => {
    const t = e.target as HTMLElement;
    if (!(t.tagName === "INPUT" || t.tagName === "TEXTAREA")) e.preventDefault();
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "F5" || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "r")) e.preventDefault();
  });
}

createRoot(document.getElementById("root")!).render(<App />);
void init();
