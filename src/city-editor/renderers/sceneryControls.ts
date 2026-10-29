import { editorText } from "../../i18n/editorMessages";
import type { SceneryStyle } from "./sceneryTexture";

export interface ScenerySettings {
  style: SceneryStyle;
  height: number;
}
const STORAGE_KEY = "fmg-city-editor:scenery";

export function readScenerySettings(): ScenerySettings {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    return {
      style: ["none", "countryside", "mountains", "world-tree"].includes(value?.style) ? value.style : "mountains",
      height:
        typeof value?.height === "number" && Number.isFinite(value.height)
          ? Math.max(5, Math.min(40, value.height))
          : 20
    };
  } catch {
    return { style: "mountains", height: 20 };
  }
}

export function createSceneryControls(
  settings: ScenerySettings,
  listen: (target: EventTarget, type: string, handler: () => void) => void,
  onChange: () => void
): HTMLFieldSetElement {
  const panel = document.createElement("fieldset");
  panel.className = "ce-fog-settings";
  const legend = document.createElement("legend");
  legend.textContent = editorText("cityEditor.messages.scenery");
  const label = document.createElement("label");
  const title = document.createElement("span");
  title.textContent = editorText("cityEditor.messages.sceneryStyle");
  const select = document.createElement("select");
  select.name = "sceneryStyle";
  for (const [value, key] of [
    ["none", "sceneryNone"],
    ["countryside", "sceneryCountryside"],
    ["mountains", "sceneryMountains"],
    ["world-tree", "sceneryWorldTree"]
  ] as const) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = editorText(`cityEditor.messages.${key}`);
    select.append(option);
  }
  select.value = settings.style;
  label.append(title, select);
  const heightLabel = document.createElement("label");
  const heightTitle = document.createElement("span");
  heightTitle.textContent = editorText("cityEditor.messages.sceneryHeight");
  const height = document.createElement("input");
  height.type = "range";
  height.name = "sceneryHeight";
  height.min = "5";
  height.max = "40";
  height.step = "1";
  height.value = String(settings.height);
  const output = document.createElement("output");
  const refresh = () => {
    height.disabled = settings.style === "none";
    output.value = `${settings.height}%`;
    height.setAttribute("aria-valuetext", output.value);
  };
  const change = () => {
    settings.style = select.value as SceneryStyle;
    settings.height = Number(height.value);
    refresh();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      /* Storage may be blocked. */
    }
    onChange();
  };
  refresh();
  listen(select, "change", change);
  listen(height, "input", change);
  heightLabel.append(heightTitle, height, output);
  panel.append(legend, label, heightLabel);
  return panel;
}
