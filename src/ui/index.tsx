import { createRoot } from "react-dom/client";
import { App } from "./App";

export function initReactUI() {
  const container = document.getElementById("react-ui-root");
  if (!container) {
    console.error("React UI Root container (#react-ui-root) not found in DOM");
    return;
  }
  const root = createRoot(container);
  root.render(<App />);
}
