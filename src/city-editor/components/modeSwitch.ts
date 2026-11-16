import { editorText } from "../../i18n/editorMessages";
import type { EditorLifetime } from "../services/editorLifetime";

export type EditorMode = "mesh" | "meshless";

/** The editor a fresh open of the City Editor page shows. Change it here only. */
export const DEFAULT_EDITOR_MODE: EditorMode = "mesh";

/** Top-of-canvas switch between the mesh editor and the meshless (vector) editor. */
export function createModeSwitch(
  scope: EditorLifetime,
  active: EditorMode,
  onSelect: (mode: EditorMode) => void
): HTMLElement {
  const box = document.createElement("div");
  box.className = "ce-mode-switch";
  box.setAttribute("role", "group");
  box.setAttribute("aria-label", editorText("cityEditor.vector.modeSwitch"));
  for (const mode of ["mesh", "meshless"] as const) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.mode = mode;
    button.textContent = editorText(mode === "mesh" ? "cityEditor.vector.modeMesh" : "cityEditor.vector.modeMeshless");
    button.setAttribute("aria-pressed", String(mode === active));
    if (mode === active) button.classList.add("ce-mode-switch--active");
    scope.listen(button, "click", () => {
      if (mode !== active) onSelect(mode);
    });
    box.append(button);
  }
  return box;
}
