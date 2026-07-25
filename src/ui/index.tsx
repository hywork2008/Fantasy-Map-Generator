import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { registerOverviewDialogRefreshers } from "./dialogs/overviewDialogRefresh";

export function initReactUI(container?: HTMLElement) {
  registerOverviewDialogRefreshers();

  const rootElement = container
    ? container.querySelector("#react-ui-root") || container.ownerDocument.getElementById("react-ui-root")
    : document.getElementById("react-ui-root");

  if (!rootElement) {
    console.error("React UI Root container (#react-ui-root) not found in DOM");
    return;
  }
  const root = createRoot(rootElement);
  flushSync(() => {
    root.render(<App />);
  });
}
