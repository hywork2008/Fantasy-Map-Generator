import { editorText } from "../../i18n/editorMessages";
import { DEFAULT_SUN, type SunSettings } from "./sunLighting";

export function createSunControls(
  settings: SunSettings,
  listen: (target: EventTarget, type: string, handler: () => void) => void,
  onChange: () => void
): HTMLDetailsElement {
  const panel = document.createElement("details");
  panel.className = "ce-sun-controls";
  panel.hidden = true;
  const summary = document.createElement("summary");
  summary.textContent = editorText("cityEditor.messages.lightingAtmosphere");
  panel.append(summary);
  const hint = document.createElement("p");
  hint.textContent = editorText("cityEditor.messages.sunBearingHint");
  panel.append(hint);
  const refresh: Array<() => void> = [];
  const enabledLabel = document.createElement("label");
  const enabled = document.createElement("input");
  enabled.type = "checkbox";
  enabled.name = "enabled";
  enabledLabel.append(enabled, document.createTextNode(editorText("cityEditor.messages.sunEnabled")));
  panel.append(enabledLabel);
  const controls = document.createElement("fieldset");
  controls.className = "ce-sun-settings";
  panel.append(controls);
  const updateEnabled = () => {
    enabled.checked = settings.enabled;
    controls.disabled = !settings.enabled;
  };
  refresh.push(updateEnabled);
  updateEnabled();
  listen(enabled, "change", () => {
    settings.enabled = enabled.checked;
    updateEnabled();
    onChange();
  });
  for (const key of ["azimuth", "elevation", "intensity"] as const) {
    const label = document.createElement("label");
    const title = document.createElement("span");
    title.textContent = editorText(
      key === "azimuth"
        ? "cityEditor.messages.sunAzimuth"
        : key === "elevation"
          ? "cityEditor.messages.sunElevation"
          : "cityEditor.messages.sunIntensity"
    );
    const input = document.createElement("input");
    input.type = "range";
    input.name = key;
    input.min = key === "elevation" ? "1" : "0";
    input.max = key === "azimuth" ? "360" : key === "elevation" ? "90" : "300";
    input.step = "1";
    const output = document.createElement("output");
    const update = () => {
      input.value = String(settings[key]);
      output.value = `${settings[key]}${key === "intensity" ? "%" : "°"}`;
      input.setAttribute("aria-valuetext", output.value);
    };
    refresh.push(update);
    update();
    listen(input, "input", () => {
      settings[key] = Number(input.value);
      update();
      onChange();
    });
    label.append(title, input, output);
    controls.append(label);
  }
  const presetLabel = document.createElement("label");
  const presetTitle = document.createElement("span");
  presetTitle.textContent = editorText("cityEditor.messages.sunColorPreset");
  const preset = document.createElement("select");
  preset.name = "colorPreset";
  for (const [value, key] of [
    ["#ffffff", "cityEditor.messages.sunColorDaylight"],
    ["#ff8a80", "cityEditor.messages.sunColorSunrise"],
    ["#ff6040", "cityEditor.messages.sunColorSunset"],
    ["custom", "cityEditor.messages.sunColorCustom"]
  ] as const) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = editorText(key);
    preset.append(option);
  }
  presetLabel.append(presetTitle, preset);
  const colorLabel = document.createElement("label");
  const colorTitle = document.createElement("span");
  colorTitle.textContent = editorText("cityEditor.messages.sunColor");
  const color = document.createElement("input");
  color.type = "color";
  color.name = "color";
  const colorValue = document.createElement("output");
  colorValue.className = "ce-sun-color-value";
  const updateColor = () => {
    color.value = settings.color;
    colorValue.value = settings.color;
    preset.value = [...preset.options].some(option => option.value === settings.color) ? settings.color : "custom";
  };
  refresh.push(updateColor);
  updateColor();
  listen(color, "input", () => {
    settings.color = color.value;
    updateColor();
    onChange();
  });
  listen(preset, "change", () => {
    if (preset.value === "custom") {
      color.click();
      return;
    }
    settings.color = preset.value;
    updateColor();
    onChange();
  });
  colorLabel.append(colorTitle, color, colorValue);
  controls.append(presetLabel, colorLabel);
  const label = document.createElement("label");
  const shadows = document.createElement("input");
  shadows.type = "checkbox";
  shadows.name = "shadows";
  refresh.push(() => {
    shadows.checked = settings.shadows;
  });
  shadows.checked = settings.shadows;
  listen(shadows, "change", () => {
    settings.shadows = shadows.checked;
    onChange();
  });
  label.append(shadows, document.createTextNode(editorText("cityEditor.messages.sunShadows")));
  controls.append(label);
  const reset = document.createElement("button");
  reset.type = "button";
  reset.textContent = editorText("cityEditor.messages.sunReset");
  listen(reset, "click", () => {
    Object.assign(settings, DEFAULT_SUN);
    for (const update of refresh) update();
    onChange();
  });
  panel.append(reset);
  return panel;
}
