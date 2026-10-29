import { editorText } from "../../i18n/editorMessages";

const STORAGE_KEY = "fmg-city-editor:distance-fog";
const DEFAULT_STRENGTH = 80;
const DEFAULT_START_PERCENT = 105;

export interface FogSettings {
  strength: number;
  /** Start depth as a percentage of the camera-to-focus distance. */
  startPercent: number;
}

export function readFogSettings(): FogSettings {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    const strength = value?.strength;
    const startPercent = value?.startPercent;
    return {
      strength:
        typeof strength === "number" && Number.isFinite(strength)
          ? Math.max(0, Math.min(100, strength))
          : DEFAULT_STRENGTH,
      startPercent:
        typeof startPercent === "number" && Number.isFinite(startPercent)
          ? Math.max(0, Math.min(200, startPercent))
          : DEFAULT_START_PERCENT
    };
  } catch {
    return { strength: DEFAULT_STRENGTH, startPercent: DEFAULT_START_PERCENT };
  }
}

export function createFogControls(
  settings: FogSettings,
  listen: (target: EventTarget, type: string, handler: () => void) => void,
  onChange: () => void
): HTMLFieldSetElement {
  const controls = document.createElement("fieldset");
  controls.className = "ce-fog-settings";
  const legend = document.createElement("legend");
  legend.textContent = editorText("cityEditor.messages.distanceFog");
  const slider = (key: keyof FogSettings, name: string, text: string, max: number) => {
    const label = document.createElement("label");
    const title = document.createElement("span");
    title.textContent = editorText(text);
    const input = document.createElement("input");
    input.type = "range";
    input.name = name;
    input.min = "0";
    input.max = String(max);
    input.step = "1";
    const output = document.createElement("output");
    const refresh = () => {
      input.value = String(settings[key]);
      output.value = `${settings[key]}%`;
      input.setAttribute("aria-valuetext", output.value);
    };
    refresh();
    listen(input, "input", () => {
      settings[key] = Number(input.value);
      refresh();
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      } catch {
        // Storage blocked: settings last for this view only.
      }
      onChange();
    });
    label.append(title, input, output);
    return label;
  };
  const hint = document.createElement("p");
  hint.textContent = editorText("cityEditor.messages.fogHint");
  controls.append(
    legend,
    slider("startPercent", "fogStart", "cityEditor.messages.fogStart", 200),
    slider("strength", "fogStrength", "cityEditor.messages.fogStrength", 100),
    hint
  );
  return controls;
}
