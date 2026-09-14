import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { syncIgnoreMouse } from "./rpc";
import "./index.css";

document.documentElement.style.background = "transparent";
document.body.style.background = "transparent";

window.addEventListener(
  "mousemove",
  (event) => {
    syncIgnoreMouse(event.target);
  },
  { passive: true },
);
window.addEventListener("mouseleave", () => {
  window.buddy?.setIgnoreMouse(true);
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
