import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { App } from "./App";

export function initReactUI() {
  const container = document.getElementById("react-ui-root");
  if (!container) {
    console.error("React UI Root container (#react-ui-root) not found in DOM");
    return;
  }
  const root = createRoot(container);
  flushSync(() => {
    root.render(<App />);
  });
}
