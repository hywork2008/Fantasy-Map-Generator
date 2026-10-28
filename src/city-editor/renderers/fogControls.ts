import { editorText } from "../../i18n/editorMessages";

const STORAGE_KEY = "fmg-city-editor:distance-fog";
const DEFAULT_STRENGTH = 80;

export function readFogSettings(): { strength: number } {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    const strength = value?.strength;
    return {
      strength:
        typeof strength === "number" && Number.isFinite(strength)
          ? Math.max(0, Math.min(100, strength))
          : DEFAULT_STRENGTH
    };
  } catch {
    return { strength: DEFAULT_STRENGTH };
  }
}

export function createFogControls(
  settings: { strength: number },
  listen: (target: EventTarget, type: string, handler: () => void) => void,
  onChange: () => void
): HTMLFieldSetElement {
  const controls = document.createElement("fieldset");
  controls.className = "ce-fog-settings";
  const legend = document.createElement("legend");
  legend.textContent = editorText("cityEditor.messages.distanceFog");
  const label = document.createElement("label");
  const title = document.createElement("span");
  title.textContent = editorText("cityEditor.messages.fogStrength");
  const input = document.createElement("input");
  input.type = "range";
  input.name = "fogStrength";
  input.min = "0";
  input.max = "100";
  input.step = "1";
  const output = document.createElement("output");
  const refresh = () => {
    input.value = String(settings.strength);
    output.value = `${settings.strength}%`;
    input.setAttribute("aria-valuetext", output.value);
  };
  refresh();
  listen(input, "input", () => {
    settings.strength = Number(input.value);
    refresh();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Storage blocked: settings last for this view only.
    }
    onChange();
  });
  const hint = document.createElement("p");
  hint.textContent = editorText("cityEditor.messages.fogHint");
  label.append(title, input, output);
  controls.append(legend, label, hint);
  return controls;
}
